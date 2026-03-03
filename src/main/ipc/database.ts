import { IpcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, DbConnectionConfig, DbConnection, DbFile, DbBackupEntry, DbEnvironmentTag, DbNlPermissions, DbNlHistoryEntry, DbNlInterpretRequest } from '../../shared/types'
import type { AiProviderId } from '../../shared/types/ai-provider'
import { databaseService } from '../services/database'
import { encryptPassword, decryptPassword } from '../services/database/crypto'
import { backupDatabase, listBackups, deleteBackup, restoreBackup } from '../services/database/backup'
import { executeNlQuery, generateNlSql, interpretNlResults, cancelNlQuery, getSchemaContext } from '../services/database/nlQuery'

const DB_DIR = path.join(os.homedir(), '.kanbai', 'databases')

/**
 * Get the path to the database connections file for a workspace.
 */
function getDbConnectionsPath(workspaceId: string): string {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }
  return path.join(DB_DIR, `${workspaceId}.json`)
}

/**
 * Get the default empty database file structure.
 */
function defaultDbFile(): DbFile {
  return {
    version: 1,
    connections: [],
  }
}

/**
 * Decrypt passwords in a connection config before connecting.
 */
function decryptConfig(config: DbConnectionConfig): DbConnectionConfig {
  return {
    ...config,
    password: config.password ? decryptPassword(config.password) : undefined,
  }
}

/**
 * Encrypt passwords in connections before saving to disk.
 */
function encryptConnections(connections: DbConnection[]): DbConnection[] {
  return connections.map((conn) => ({
    ...conn,
    config: {
      ...conn.config,
      password: conn.config.password ? encryptPassword(conn.config.password) : undefined,
    },
  }))
}

export function registerDatabaseHandlers(ipcMain: IpcMain): void {
  // Connect to a database
  ipcMain.handle(
    IPC_CHANNELS.DB_CONNECT,
    async (
      _event,
      { connectionId, config }: { connectionId: string; config: DbConnectionConfig },
    ) => {
      try {
        const decrypted = decryptConfig(config)
        await databaseService.connect(connectionId, decrypted)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Disconnect from a database
  ipcMain.handle(
    IPC_CHANNELS.DB_DISCONNECT,
    async (_event, { connectionId }: { connectionId: string }) => {
      try {
        await databaseService.disconnect(connectionId)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Test a database connection without persisting it
  ipcMain.handle(
    IPC_CHANNELS.DB_TEST_CONNECTION,
    async (_event, { config }: { config: DbConnectionConfig }) => {
      let driver = null
      try {
        driver = await databaseService.createDriver(config.engine)
        const decrypted = decryptConfig(config)
        await driver.connect(decrypted)
        await driver.disconnect()
        return { success: true }
      } catch (err) {
        if (driver) {
          try {
            await driver.disconnect()
          } catch {
            // Ignore cleanup errors
          }
        }
        return { success: false, error: String(err) }
      }
    },
  )

  // List databases on the connected server
  ipcMain.handle(
    IPC_CHANNELS.DB_LIST_DATABASES,
    async (_event, { connectionId }: { connectionId: string }) => {
      try {
        const driver = databaseService.getDriver(connectionId)
        if (!driver) {
          return { success: false, error: 'Not connected', databases: [] }
        }
        const databases = await driver.listDatabases()
        return { success: true, databases }
      } catch (err) {
        return { success: false, error: String(err), databases: [] }
      }
    },
  )

  // List schemas
  ipcMain.handle(
    IPC_CHANNELS.DB_LIST_SCHEMAS,
    async (_event, { connectionId }: { connectionId: string }) => {
      try {
        const driver = databaseService.getDriver(connectionId)
        if (!driver) {
          return { success: false, error: 'Not connected', schemas: [] }
        }
        const schemas = await driver.listSchemas()
        return { success: true, schemas }
      } catch (err) {
        return { success: false, error: String(err), schemas: [] }
      }
    },
  )

  // List tables in a schema
  ipcMain.handle(
    IPC_CHANNELS.DB_LIST_TABLES,
    async (_event, { connectionId, schema }: { connectionId: string; schema?: string }) => {
      try {
        const driver = databaseService.getDriver(connectionId)
        if (!driver) {
          return { success: false, error: 'Not connected', tables: [] }
        }
        const tables = await driver.listTables(schema)
        return { success: true, tables }
      } catch (err) {
        return { success: false, error: String(err), tables: [] }
      }
    },
  )

  // Get table info (columns, indexes, row count)
  ipcMain.handle(
    IPC_CHANNELS.DB_TABLE_INFO,
    async (
      _event,
      { connectionId, table, schema }: { connectionId: string; table: string; schema?: string },
    ) => {
      try {
        const driver = databaseService.getDriver(connectionId)
        if (!driver) {
          return { success: false, error: 'Not connected' }
        }
        const info = await driver.getTableInfo(table, schema)
        return { success: true, info }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Execute a SQL query
  ipcMain.handle(
    IPC_CHANNELS.DB_EXECUTE_QUERY,
    async (
      _event,
      {
        connectionId,
        sql,
        limit,
        offset,
      }: { connectionId: string; sql: string; limit?: number; offset?: number },
    ) => {
      try {
        const driver = databaseService.getDriver(connectionId)
        if (!driver) {
          return {
            success: false,
            error: 'Not connected',
            result: { columns: [], rows: [], rowCount: 0, executionTime: 0 },
          }
        }
        const result = await driver.executeQuery(sql, limit, offset)
        return { success: !result.error, result }
      } catch (err) {
        return {
          success: false,
          error: String(err),
          result: { columns: [], rows: [], rowCount: 0, executionTime: 0 },
        }
      }
    },
  )

  // Cancel a running query
  ipcMain.handle(
    IPC_CHANNELS.DB_CANCEL_QUERY,
    async (_event, { connectionId }: { connectionId: string }) => {
      try {
        const driver = databaseService.getDriver(connectionId)
        if (!driver) {
          return { success: false, error: 'Not connected' }
        }
        driver.cancelQuery()
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Load database connections for a workspace
  ipcMain.handle(
    IPC_CHANNELS.DB_LOAD,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      const filePath = getDbConnectionsPath(workspaceId)
      if (!fs.existsSync(filePath)) {
        return defaultDbFile()
      }
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw) as DbFile
      } catch {
        return defaultDbFile()
      }
    },
  )

  // Save database connections for a workspace (encrypts passwords)
  ipcMain.handle(
    IPC_CHANNELS.DB_SAVE,
    async (_event, { workspaceId, data }: { workspaceId: string; data: DbFile }) => {
      try {
        // Encrypt passwords before saving
        const securedData: DbFile = {
          ...data,
          connections: encryptConnections(data.connections),
        }

        const filePath = getDbConnectionsPath(workspaceId)
        fs.writeFileSync(filePath, JSON.stringify(securedData, null, 2), 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Export database connections via save dialog
  ipcMain.handle(
    IPC_CHANNELS.DB_EXPORT,
    async (_event, { data }: { data: DbFile }) => {
      try {
        const result = await dialog.showSaveDialog({
          title: 'Export Database Connections',
          defaultPath: 'db-connections.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (result.canceled || !result.filePath) {
          return { success: false }
        }

        // Strip encrypted passwords from export for security
        const exportData: DbFile = {
          ...data,
          connections: data.connections.map((conn) => ({
            ...conn,
            config: {
              ...conn.config,
              password: undefined,
            },
          })),
        }

        fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Import database connections via open dialog
  ipcMain.handle(IPC_CHANNELS.DB_IMPORT, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Import Database Connections',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, data: null }
      }
      const raw = fs.readFileSync(result.filePaths[0]!, 'utf-8')
      const data = JSON.parse(raw) as DbFile
      return { success: true, data }
    } catch (err) {
      return { success: false, data: null, error: String(err) }
    }
  })

  // Backup a database
  ipcMain.handle(
    IPC_CHANNELS.DB_BACKUP,
    async (
      _event,
      {
        connectionId,
        connectionName,
        config,
        options,
        environmentTag,
      }: {
        connectionId: string
        connectionName: string
        config: DbConnectionConfig
        options?: { dataOnly?: boolean; schemaOnly?: boolean; tables?: string[] }
        environmentTag?: DbEnvironmentTag
      },
    ) => {
      try {
        const decrypted = decryptConfig(config)
        const result = await backupDatabase(connectionId, connectionName, decrypted, options, environmentTag)
        return result
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // List backups for a connection
  ipcMain.handle(
    IPC_CHANNELS.DB_BACKUP_LIST,
    async (_event, { connectionId }: { connectionId: string }) => {
      try {
        const entries = listBackups(connectionId)
        return { success: true, entries }
      } catch (err) {
        return { success: true, entries: [], error: String(err) }
      }
    },
  )

  // Delete a backup
  ipcMain.handle(
    IPC_CHANNELS.DB_BACKUP_DELETE,
    async (
      _event,
      { connectionId, backupId }: { connectionId: string; backupId: string },
    ) => {
      return deleteBackup(connectionId, backupId)
    },
  )

  // Restore a backup
  ipcMain.handle(
    IPC_CHANNELS.DB_RESTORE,
    async (
      _event,
      {
        entry,
        targetConfig,
      }: {
        entry: DbBackupEntry
        targetConfig: DbConnectionConfig
      },
    ) => {
      try {
        const decrypted = decryptConfig(targetConfig)
        return await restoreBackup(entry, decrypted)
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Natural Language Query - translate NL to SQL via AI and execute
  ipcMain.handle(
    IPC_CHANNELS.DB_NL_QUERY,
    async (
      _event,
      {
        connectionId,
        prompt,
        permissions,
        provider,
      }: {
        connectionId: string
        prompt: string
        permissions: DbNlPermissions
        provider?: string
      },
    ) => {
      try {
        return await executeNlQuery(connectionId, prompt, permissions, (provider || 'claude') as AiProviderId)
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Generate SQL from natural language (without executing)
  ipcMain.handle(
    IPC_CHANNELS.DB_NL_GENERATE_SQL,
    async (
      _event,
      {
        connectionId,
        prompt,
        permissions,
        history,
        provider,
      }: {
        connectionId: string
        prompt: string
        permissions: DbNlPermissions
        history?: DbNlHistoryEntry[]
        provider?: string
      },
    ) => {
      try {
        return await generateNlSql(connectionId, prompt, permissions, history, (provider || 'claude') as AiProviderId)
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Interpret query results via AI (human answer or refinement)
  ipcMain.handle(
    IPC_CHANNELS.DB_NL_INTERPRET,
    async (_event, req: DbNlInterpretRequest & { provider?: string }) => {
      try {
        return await interpretNlResults(
          req.connectionId,
          req.question,
          req.sql,
          req.columns,
          req.rows,
          req.rowCount,
          req.history,
          (req.provider || 'claude') as AiProviderId,
        )
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Cancel an active NL query
  ipcMain.handle(
    IPC_CHANNELS.DB_NL_CANCEL,
    async (_event, { connectionId }: { connectionId: string }) => {
      const cancelled = cancelNlQuery(connectionId)
      return { success: cancelled }
    },
  )

  // Get schema context for a connection (used for NL query)
  ipcMain.handle(
    IPC_CHANNELS.DB_GET_SCHEMA_CONTEXT,
    async (_event, { connectionId }: { connectionId: string }) => {
      try {
        const schema = await getSchemaContext(connectionId)
        return { success: true, schema }
      } catch (err) {
        return { success: false, error: String(err), schema: '' }
      }
    },
  )

  // Transfer data between databases (simplified: dump source -> restore target)
  ipcMain.handle(
    IPC_CHANNELS.DB_TRANSFER,
    async (
      _event,
      {
        sourceConnectionId,
        targetConnectionId,
        tables,
      }: {
        sourceConnectionId: string
        targetConnectionId: string
        tables: string[]
      },
    ) => {
      try {
        const sourceDriver = databaseService.getDriver(sourceConnectionId)
        const targetDriver = databaseService.getDriver(targetConnectionId)

        if (!sourceDriver) {
          return {
            success: false,
            tablesTransferred: 0,
            rowsTransferred: 0,
            errors: ['Source connection not found'],
          }
        }
        if (!targetDriver) {
          return {
            success: false,
            tablesTransferred: 0,
            rowsTransferred: 0,
            errors: ['Target connection not found'],
          }
        }

        let tablesTransferred = 0
        let rowsTransferred = 0
        const errors: string[] = []

        for (const table of tables) {
          try {
            // Read all rows from source
            const sourceResult = await sourceDriver.executeQuery(
              `SELECT * FROM "${table}"`,
              undefined,
              undefined,
            )

            if (sourceResult.error) {
              errors.push(`Error reading ${table}: ${sourceResult.error}`)
              continue
            }

            if (sourceResult.rows.length === 0) {
              tablesTransferred++
              continue
            }

            // Insert rows into target one by one
            for (const row of sourceResult.rows) {
              const columns = Object.keys(row)
              const values = columns.map((col) => {
                const val = row[col]
                if (val === null || val === undefined) return 'NULL'
                if (typeof val === 'number') return String(val)
                if (typeof val === 'boolean') return val ? '1' : '0'
                return `'${String(val).replace(/'/g, "''")}'`
              })

              const insertSql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')})`
              const insertResult = await targetDriver.executeQuery(insertSql)
              if (insertResult.error) {
                errors.push(`Error inserting into ${table}: ${insertResult.error}`)
              } else {
                rowsTransferred++
              }
            }

            tablesTransferred++
          } catch (err) {
            errors.push(`Error transferring ${table}: ${String(err)}`)
          }
        }

        return {
          success: errors.length === 0,
          tablesTransferred,
          rowsTransferred,
          errors,
        }
      } catch (err) {
        return {
          success: false,
          tablesTransferred: 0,
          rowsTransferred: 0,
          errors: [String(err)],
        }
      }
    },
  )
}
