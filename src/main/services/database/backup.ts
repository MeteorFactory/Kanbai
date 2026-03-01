import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'
import {
  DbConnectionConfig,
  DbBackupResult,
  DbBackupEntry,
  DbBackupManifest,
  DbRestoreResult,
  DbEngine,
  DbEnvironmentTag,
  DbBackupLogEntry,
  IPC_CHANNELS,
} from '../../../shared/types'
import { IS_WIN, getDbToolPaths, PATH_SEP, shellEscape as platformShellEscape } from '../../../shared/platform'

const execAsync = promisify(exec)

const BACKUPS_DIR = path.join(os.homedir(), '.mirehub', 'databases', 'backups')

/**
 * Extended PATH that includes common CLI tool locations on macOS.
 * Electron apps don't inherit the user's shell PATH, so tools like
 * pg_dump, mysqldump, mongodump, sqlite3 may not be found.
 */
function getExtendedPath(): string {
  const extraPaths = getDbToolPaths()
  const currentPath = process.env.PATH || ''
  return [...extraPaths, currentPath].join(PATH_SEP)
}

/**
 * Execute a shell command with extended PATH so CLI tools are found.
 */
function execWithPath(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, {
    maxBuffer: 1024 * 1024 * 100,
    encoding: 'utf-8',
    env: { ...process.env, PATH: getExtendedPath() },
    ...(IS_WIN ? { shell: 'cmd.exe' } : {}),
  })
}

function getConnectionBackupDir(connectionId: string): string {
  const dir = path.join(BACKUPS_DIR, connectionId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getManifestPath(connectionId: string): string {
  return path.join(getConnectionBackupDir(connectionId), 'manifest.json')
}

function readManifest(connectionId: string): DbBackupManifest {
  const manifestPath = getManifestPath(connectionId)
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, entries: [] }
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    return JSON.parse(raw) as DbBackupManifest
  } catch {
    return { version: 1, entries: [] }
  }
}

function writeManifest(connectionId: string, manifest: DbBackupManifest): void {
  const manifestPath = getManifestPath(connectionId)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
}

/**
 * Shell-escape a string value for use in shell commands.
 */
function shellEscape(val: string): string {
  return platformShellEscape(val)
}

/**
 * Emit a backup log entry to all renderer windows.
 */
function emitLog(entry: DbBackupLogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.DB_BACKUP_LOG, entry)
      }
    } catch { /* render frame disposed — ignore */ }
  }
}

/**
 * Sanitize a command string by hiding PGPASSWORD values.
 */
function sanitizeCommand(cmd: string): string {
  return cmd.replace(/PGPASSWORD='[^']*'/g, "PGPASSWORD=***")
    .replace(/PGPASSWORD=[^\s]*/g, 'PGPASSWORD=***')
    .replace(/-p'[^']*'/g, "-p***")
    .replace(/-p[^\s]+/g, '-p***')
}

/**
 * Build the CLI command for backing up a database.
 */
function buildBackupCommand(
  config: DbConnectionConfig,
  options: { dataOnly?: boolean; schemaOnly?: boolean; tables?: string[] },
): { cmd: string; ext: string } | { error: string } {
  const dbName = config.database || 'backup'

  switch (config.engine) {
    case 'postgresql': {
      const hostFlag = config.host ? `-h ${shellEscape(config.host)}` : ''
      const portFlag = config.port ? `-p ${config.port}` : ''
      const userFlag = config.username ? `-U ${shellEscape(config.username)}` : ''
      const dataFlag = options.dataOnly
        ? '--data-only'
        : options.schemaOnly
          ? '--schema-only'
          : ''
      const tableFlags = options.tables?.map((t) => `-t ${shellEscape(t)}`).join(' ') || ''
      const pgPass = config.password ? `PGPASSWORD=${shellEscape(config.password)}` : ''
      const sslEnv = config.ssl ? 'PGSSLMODE=require' : ''
      // --clean --if-exists: generate DROP IF EXISTS before CREATE so restores are idempotent
      const cleanFlags = options.dataOnly ? '' : '--clean --if-exists'
      return {
        cmd: `${sslEnv} ${pgPass} pg_dump ${hostFlag} ${portFlag} ${userFlag} ${dataFlag} ${cleanFlags} ${tableFlags} --no-owner --no-acl ${shellEscape(dbName)}`,
        ext: '.sql',
      }
    }
    case 'mysql': {
      const hostFlag = config.host ? `-h ${shellEscape(config.host)}` : ''
      const portFlag = config.port ? `-P ${config.port}` : ''
      const userFlag = config.username ? `-u ${shellEscape(config.username)}` : ''
      const passFlag = config.password ? `-p${shellEscape(config.password)}` : ''
      const dataFlag = options.dataOnly
        ? '--no-create-info'
        : options.schemaOnly
          ? '--no-data'
          : ''
      const tableFlags = options.tables?.map((t) => shellEscape(t)).join(' ') || ''
      return {
        cmd: `mysqldump ${hostFlag} ${portFlag} ${userFlag} ${passFlag} ${dataFlag} ${shellEscape(dbName)} ${tableFlags}`,
        ext: '.sql',
      }
    }
    case 'mongodb': {
      const uri =
        config.connectionString ||
        `mongodb://${config.host || 'localhost'}:${config.port || 27017}`
      return {
        cmd: `mongodump --uri=${shellEscape(uri)} --db=${shellEscape(dbName)} --archive`,
        ext: '.archive',
      }
    }
    case 'sqlite': {
      const filePath = config.filePath || config.database || ''
      return {
        cmd: `sqlite3 ${shellEscape(filePath)} .dump`,
        ext: '.sql',
      }
    }
    case 'mssql':
      return { error: 'MSSQL backup requires SQL Server tools. Use the query editor with BACKUP DATABASE command.' }
  }
}

/**
 * Backup a database using the appropriate CLI tool for each engine.
 * Writes the dump to ~/.mirehub/databases/backups/{connectionId}/ and updates the manifest.
 */
export async function backupDatabase(
  connectionId: string,
  connectionName: string,
  config: DbConnectionConfig,
  options: { dataOnly?: boolean; schemaOnly?: boolean; tables?: string[] } = {},
  environmentTag?: DbEnvironmentTag,
): Promise<DbBackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dbName = config.database || 'backup'
  const backupDir = getConnectionBackupDir(connectionId)

  try {
    const built = buildBackupCommand(config, options)
    if ('error' in built) {
      emitLog({ timestamp: Date.now(), type: 'error', message: built.error, connectionName, operation: 'backup' })
      return { success: false, error: built.error }
    }

    emitLog({ timestamp: Date.now(), type: 'command', message: sanitizeCommand(built.cmd), connectionName, operation: 'backup' })

    const outputFile = path.join(backupDir, `${dbName}_${timestamp}${built.ext}`)
    const { stdout, stderr } = await execWithPath(built.cmd)
    if (stderr) {
      emitLog({ timestamp: Date.now(), type: 'stderr', message: stderr, connectionName, operation: 'backup' })
    }
    fs.writeFileSync(outputFile, stdout, 'utf-8')
    const stats = fs.statSync(outputFile)

    // Update manifest
    const entry: DbBackupEntry = {
      id: uuidv4(),
      connectionId,
      connectionName,
      engine: config.engine,
      database: dbName,
      timestamp: Date.now(),
      filePath: outputFile,
      size: stats.size,
      dataOnly: options.dataOnly,
      schemaOnly: options.schemaOnly,
      tables: options.tables,
      environmentTag,
    }

    const manifest = readManifest(connectionId)
    manifest.entries.push(entry)
    writeManifest(connectionId, manifest)

    emitLog({ timestamp: Date.now(), type: 'success', message: `Backup saved: ${outputFile} (${stats.size} bytes)`, connectionName, operation: 'backup' })

    return {
      success: true,
      filePath: outputFile,
      size: stats.size,
    }
  } catch (err) {
    const errMsg = String(err)
    emitLog({ timestamp: Date.now(), type: 'error', message: errMsg, connectionName, operation: 'backup' })
    return {
      success: false,
      error: errMsg,
    }
  }
}

/**
 * List all backups for a connection, filtering out entries whose files no longer exist.
 */
export function listBackups(connectionId: string): DbBackupEntry[] {
  const manifest = readManifest(connectionId)
  return manifest.entries
    .filter((e) => fs.existsSync(e.filePath))
    .sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Delete a specific backup entry and its file.
 */
export function deleteBackup(connectionId: string, backupId: string): { success: boolean; error?: string } {
  try {
    const manifest = readManifest(connectionId)
    const entry = manifest.entries.find((e) => e.id === backupId)
    if (!entry) {
      return { success: false, error: 'Backup not found' }
    }

    // Delete the file
    if (fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath)
    }

    // Remove from manifest
    manifest.entries = manifest.entries.filter((e) => e.id !== backupId)
    writeManifest(connectionId, manifest)

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Build the CLI command for restoring a backup.
 */
function buildRestoreCommand(
  entry: DbBackupEntry,
  targetConfig: DbConnectionConfig,
): { cmd: string } | { error: string } {
  const engine: DbEngine = entry.engine

  switch (engine) {
    case 'postgresql': {
      const hostFlag = targetConfig.host ? `-h ${shellEscape(targetConfig.host)}` : ''
      const portFlag = targetConfig.port ? `-p ${targetConfig.port}` : ''
      const userFlag = targetConfig.username ? `-U ${shellEscape(targetConfig.username)}` : ''
      const dbName = targetConfig.database || entry.database
      const pgPass = targetConfig.password ? `PGPASSWORD=${shellEscape(targetConfig.password)}` : ''
      const sslEnv = targetConfig.ssl ? 'PGSSLMODE=require' : ''
      const envPrefix = [sslEnv, pgPass].filter(Boolean).join(' ')
      const psqlBase = `${envPrefix} psql ${hostFlag} ${portFlag} ${userFlag} ${shellEscape(dbName)}`
      // Drop & recreate public schema first (CASCADE) to avoid FK conflicts,
      // then pipe the dump file for a clean restore.
      return {
        cmd: `${psqlBase} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && ${psqlBase} < ${shellEscape(entry.filePath)}`,
      }
    }
    case 'mysql': {
      const hostFlag = targetConfig.host ? `-h ${shellEscape(targetConfig.host)}` : ''
      const portFlag = targetConfig.port ? `-P ${targetConfig.port}` : ''
      const userFlag = targetConfig.username ? `-u ${shellEscape(targetConfig.username)}` : ''
      const passFlag = targetConfig.password ? `-p${shellEscape(targetConfig.password)}` : ''
      const dbName = targetConfig.database || entry.database
      return {
        cmd: `mysql ${hostFlag} ${portFlag} ${userFlag} ${passFlag} ${shellEscape(dbName)} < ${shellEscape(entry.filePath)}`,
      }
    }
    case 'mongodb': {
      const uri =
        targetConfig.connectionString ||
        `mongodb://${targetConfig.host || 'localhost'}:${targetConfig.port || 27017}`
      const dbName = targetConfig.database || entry.database
      return {
        cmd: `mongorestore --uri=${shellEscape(uri)} --db=${shellEscape(dbName)} --drop --archive=${shellEscape(entry.filePath)}`,
      }
    }
    case 'sqlite': {
      const filePath = targetConfig.filePath || targetConfig.database || ''
      return {
        cmd: `sqlite3 ${shellEscape(filePath)} < ${shellEscape(entry.filePath)}`,
      }
    }
    case 'mssql':
      return { error: 'MSSQL restore requires SQL Server tools.' }
  }
}

/**
 * Restore a backup to a target database.
 */
export async function restoreBackup(
  entry: DbBackupEntry,
  targetConfig: DbConnectionConfig,
): Promise<DbRestoreResult> {
  const connectionName = entry.connectionName

  if (!fs.existsSync(entry.filePath)) {
    emitLog({ timestamp: Date.now(), type: 'error', message: 'Backup file not found', connectionName, operation: 'restore' })
    return { success: false, error: 'Backup file not found' }
  }

  try {
    const built = buildRestoreCommand(entry, targetConfig)
    if ('error' in built) {
      emitLog({ timestamp: Date.now(), type: 'error', message: built.error, connectionName, operation: 'restore' })
      return { success: false, error: built.error }
    }

    emitLog({ timestamp: Date.now(), type: 'command', message: sanitizeCommand(built.cmd), connectionName, operation: 'restore' })

    const { stderr } = await execWithPath(built.cmd)

    if (stderr) {
      emitLog({ timestamp: Date.now(), type: 'stderr', message: stderr, connectionName, operation: 'restore' })
    }

    // Count ERROR lines in stderr (warnings about "already exists" etc.)
    const errorLines = (stderr || '')
      .split('\n')
      .filter((line) => line.startsWith('ERROR:'))
    if (errorLines.length > 0) {
      emitLog({ timestamp: Date.now(), type: 'success', message: `Restore completed with ${errorLines.length} warning(s)`, connectionName, operation: 'restore' })
      return { success: true, warnings: errorLines.length }
    }

    emitLog({ timestamp: Date.now(), type: 'success', message: 'Restore completed successfully', connectionName, operation: 'restore' })
    return { success: true }
  } catch (err) {
    const errStr = String(err)
    // Extract just the meaningful part from exec errors
    const stderrMatch = errStr.match(/stderr:\s*"(.+?)"/s)
    const errMsg = stderrMatch?.[1] ?? errStr
    emitLog({ timestamp: Date.now(), type: 'error', message: errMsg, connectionName, operation: 'restore' })
    return { success: false, error: errMsg }
  }
}
