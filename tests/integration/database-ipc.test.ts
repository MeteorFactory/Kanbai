import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

// Hoist TEST_DIR so it is available in vi.mock factory for 'os'
const TEST_DIR = vi.hoisted(() => {
  const osMod = require('os')
  const pathMod = require('path')
  return pathMod.join(osMod.tmpdir(), `.kanbai-db-ipc-test-${process.pid}-${Date.now()}`)
})
const dataDir = path.join(TEST_DIR, '.kanbai', 'databases')

// Mock os.homedir to use temp directory
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => TEST_DIR,
    },
    homedir: () => TEST_DIR,
  }
})

// Hoist mock objects so they are available inside vi.mock factories
const { mockDialog, mockDriver, mockDbService, mockBackupDatabase, mockListBackups, mockDeleteBackup, mockRestoreBackup } = vi.hoisted(() => {
  const mockDriver = {
    engine: 'postgresql',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    listDatabases: vi.fn().mockResolvedValue(['db1', 'db2']),
    listSchemas: vi.fn().mockResolvedValue(['public', 'app']),
    listTables: vi.fn().mockResolvedValue([
      { name: 'users', schema: 'public', type: 'table', rowCount: 100 },
      { name: 'orders', schema: 'public', type: 'table', rowCount: 50 },
    ]),
    getTableInfo: vi.fn().mockResolvedValue({
      columns: [{ name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isForeignKey: false }],
      indexes: [],
      rowCount: 100,
    }),
    executeQuery: vi.fn().mockResolvedValue({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'test' }],
      rowCount: 1,
      executionTime: 10,
    }),
    cancelQuery: vi.fn(),
    getDefaultPort: vi.fn().mockReturnValue(5432),
    parseConnectionString: vi.fn().mockReturnValue({}),
  }

  return {
    mockDialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
      showMessageBox: vi.fn(),
    },
    mockDriver,
    mockDbService: {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getDriver: vi.fn(),
      createDriver: vi.fn().mockResolvedValue(mockDriver),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
    },
    mockBackupDatabase: vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/backup.sql', size: 1024 }),
    mockListBackups: vi.fn().mockReturnValue([]),
    mockDeleteBackup: vi.fn().mockReturnValue({ success: true }),
    mockRestoreBackup: vi.fn().mockResolvedValue({ success: true }),
  }
})

// Mock electron (dialog + safeStorage)
vi.mock('electron', () => ({
  dialog: mockDialog,
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  IpcMain: vi.fn(),
}))

// Mock the databaseService singleton
vi.mock('../../src/main/services/database', () => ({
  databaseService: mockDbService,
}))

// Mock backup module
vi.mock('../../src/main/services/database/backup', () => ({
  backupDatabase: mockBackupDatabase,
  listBackups: mockListBackups,
  deleteBackup: mockDeleteBackup,
  restoreBackup: mockRestoreBackup,
}))

// Mock NL query module
vi.mock('../../src/main/services/database/nlQuery', () => ({
  executeNlQuery: vi.fn().mockResolvedValue({ success: true, sql: 'SELECT 1', result: { columns: [], rows: [], rowCount: 0, executionTime: 0 } }),
  getSchemaContext: vi.fn().mockResolvedValue('Table: users\n  - id: integer [PK]'),
}))

import { registerDatabaseHandlers } from '../../src/main/ipc/database'
import type { DbFile, DbConnectionConfig } from '../../src/shared/types'

describe('Database IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(() => {
    // Reset mock call history but keep implementations
    mockDbService.getDriver.mockClear().mockReturnValue(undefined)
    mockDbService.createDriver.mockClear().mockResolvedValue(mockDriver)
    mockDbService.connect.mockClear().mockResolvedValue(undefined)
    mockDbService.disconnect.mockClear().mockResolvedValue(undefined)
    mockDriver.connect.mockClear().mockResolvedValue(undefined)
    mockDriver.disconnect.mockClear().mockResolvedValue(undefined)
    mockDriver.listDatabases.mockClear().mockResolvedValue(['db1', 'db2'])
    mockDriver.listSchemas.mockClear().mockResolvedValue(['public', 'app'])
    mockDriver.listTables.mockClear().mockResolvedValue([
      { name: 'users', schema: 'public', type: 'table', rowCount: 100 },
      { name: 'orders', schema: 'public', type: 'table', rowCount: 50 },
    ])
    mockDriver.getTableInfo.mockClear().mockResolvedValue({
      columns: [{ name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isForeignKey: false }],
      indexes: [],
      rowCount: 100,
    })
    mockDriver.executeQuery.mockClear().mockResolvedValue({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'test' }],
      rowCount: 1,
      executionTime: 10,
    })
    mockDriver.cancelQuery.mockClear()
    mockDialog.showOpenDialog.mockClear()
    mockDialog.showSaveDialog.mockClear()
    mockBackupDatabase.mockClear().mockResolvedValue({ success: true, filePath: '/tmp/backup.sql', size: 1024 })
    mockListBackups.mockClear().mockReturnValue([])
    mockDeleteBackup.mockClear().mockReturnValue({ success: true })
    mockRestoreBackup.mockClear().mockResolvedValue({ success: true })

    // Ensure clean data directory
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    mockIpcMain = createMockIpcMain()
    registerDatabaseHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // --- Handler Registration ---

  it('enregistre les 23 handlers database', () => {
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(23)
    expect(mockIpcMain._handlers.has('db:connect')).toBe(true)
    expect(mockIpcMain._handlers.has('db:disconnect')).toBe(true)
    expect(mockIpcMain._handlers.has('db:testConnection')).toBe(true)
    expect(mockIpcMain._handlers.has('db:listDatabases')).toBe(true)
    expect(mockIpcMain._handlers.has('db:listSchemas')).toBe(true)
    expect(mockIpcMain._handlers.has('db:listTables')).toBe(true)
    expect(mockIpcMain._handlers.has('db:tableInfo')).toBe(true)
    expect(mockIpcMain._handlers.has('db:executeQuery')).toBe(true)
    expect(mockIpcMain._handlers.has('db:cancelQuery')).toBe(true)
    expect(mockIpcMain._handlers.has('db:load')).toBe(true)
    expect(mockIpcMain._handlers.has('db:save')).toBe(true)
    expect(mockIpcMain._handlers.has('db:export')).toBe(true)
    expect(mockIpcMain._handlers.has('db:import')).toBe(true)
    expect(mockIpcMain._handlers.has('db:backup')).toBe(true)
    expect(mockIpcMain._handlers.has('db:backupList')).toBe(true)
    expect(mockIpcMain._handlers.has('db:backupDelete')).toBe(true)
    expect(mockIpcMain._handlers.has('db:restore')).toBe(true)
    expect(mockIpcMain._handlers.has('db:transfer')).toBe(true)
    expect(mockIpcMain._handlers.has('db:nlQuery')).toBe(true)
    expect(mockIpcMain._handlers.has('db:nlGenerateSql')).toBe(true)
    expect(mockIpcMain._handlers.has('db:nlInterpret')).toBe(true)
    expect(mockIpcMain._handlers.has('db:nlCancel')).toBe(true)
    expect(mockIpcMain._handlers.has('db:getSchemaContext')).toBe(true)
  })

  // --- DB_LOAD ---

  it('db:load retourne le fichier par defaut quand aucun fichier n existe', async () => {
    const result = await mockIpcMain._invoke('db:load', { workspaceId: 'ws-1' })

    expect(result).toEqual({
      version: 1,
      connections: [],
    })
  })

  it('db:load lit les donnees sauvegardees depuis le disque', async () => {
    const testData: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-1',
          name: 'Test DB',
          engine: 'postgresql',
          environmentTag: 'local',
          config: {
            engine: 'postgresql',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
          },
          workspaceId: 'ws-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    const filePath = path.join(dataDir, 'ws-1.json')
    fs.writeFileSync(filePath, JSON.stringify(testData, null, 2), 'utf-8')

    const result = await mockIpcMain._invoke('db:load', { workspaceId: 'ws-1' })

    expect(result.version).toBe(1)
    expect(result.connections).toHaveLength(1)
    expect(result.connections[0].name).toBe('Test DB')
  })

  it('db:load retourne le fichier par defaut si le fichier JSON est invalide', async () => {
    const filePath = path.join(dataDir, 'ws-corrupt.json')
    fs.writeFileSync(filePath, '{invalid json!!!', 'utf-8')

    const result = await mockIpcMain._invoke('db:load', { workspaceId: 'ws-corrupt' })

    expect(result).toEqual({
      version: 1,
      connections: [],
    })
  })

  // --- DB_SAVE ---

  it('db:save persiste les donnees sur le disque', async () => {
    const data: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-1',
          name: 'Saved DB',
          engine: 'postgresql',
          environmentTag: 'dev',
          config: {
            engine: 'postgresql',
            host: 'db.example.com',
            port: 5432,
            database: 'appdb',
          },
          workspaceId: 'ws-save',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    const result = await mockIpcMain._invoke('db:save', {
      workspaceId: 'ws-save',
      data,
    })

    expect(result.success).toBe(true)

    // Verify file was written
    const filePath = path.join(dataDir, 'ws-save.json')
    expect(fs.existsSync(filePath)).toBe(true)

    const savedData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(savedData.version).toBe(1)
    expect(savedData.connections).toHaveLength(1)
    expect(savedData.connections[0].name).toBe('Saved DB')
  })

  it('db:save chiffre les mots de passe avant la sauvegarde', async () => {
    const data: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-enc',
          name: 'Encrypted DB',
          engine: 'mysql',
          environmentTag: 'local',
          config: {
            engine: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'root',
            password: 'secret-password',
            database: 'mydb',
          },
          workspaceId: 'ws-enc',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    await mockIpcMain._invoke('db:save', { workspaceId: 'ws-enc', data })

    const filePath = path.join(dataDir, 'ws-enc.json')
    const savedData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    // Since safeStorage.isEncryptionAvailable returns false in our mock,
    // the password should be base64-encoded with B64: prefix
    const savedPassword = savedData.connections[0].config.password
    expect(savedPassword).toMatch(/^B64:/)
    expect(savedPassword).not.toBe('secret-password')

    // Verify we can decode the B64 password back
    const decoded = Buffer.from(savedPassword.slice(4), 'base64').toString('utf-8')
    expect(decoded).toBe('secret-password')
  })

  it('db:save gere les connexions sans mot de passe', async () => {
    const data: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-nopass',
          name: 'No Password DB',
          engine: 'sqlite',
          environmentTag: 'local',
          config: {
            engine: 'sqlite',
            filePath: '/tmp/test.db',
          },
          workspaceId: 'ws-nopass',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    const result = await mockIpcMain._invoke('db:save', {
      workspaceId: 'ws-nopass',
      data,
    })

    expect(result.success).toBe(true)

    const filePath = path.join(dataDir, 'ws-nopass.json')
    const savedData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(savedData.connections[0].config.password).toBeUndefined()
  })

  it('db:load lit les donnees precedemment sauvegardees par db:save', async () => {
    const data: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-roundtrip',
          name: 'Round Trip DB',
          engine: 'postgresql',
          environmentTag: 'local',
          config: {
            engine: 'postgresql',
            host: 'localhost',
            database: 'roundtrip',
          },
          workspaceId: 'ws-rt',
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
    }

    await mockIpcMain._invoke('db:save', { workspaceId: 'ws-rt', data })
    const loaded = await mockIpcMain._invoke('db:load', { workspaceId: 'ws-rt' })

    expect(loaded.version).toBe(1)
    expect(loaded.connections).toHaveLength(1)
    expect(loaded.connections[0].id).toBe('conn-roundtrip')
    expect(loaded.connections[0].name).toBe('Round Trip DB')
  })

  // --- DB_CONNECT ---

  it('db:connect appelle le service de connexion avec la config dechiffree', async () => {
    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      port: 5432,
      password: 'plain-password',
      database: 'testdb',
    }

    const result = await mockIpcMain._invoke('db:connect', {
      connectionId: 'conn-1',
      config,
    })

    expect(result.success).toBe(true)
    expect(mockDbService.connect).toHaveBeenCalledWith('conn-1', expect.objectContaining({
      engine: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
    }))
  })

  it('db:connect retourne une erreur si la connexion echoue', async () => {
    mockDbService.connect.mockRejectedValueOnce(new Error('Connection refused'))

    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'unreachable',
      database: 'testdb',
    }

    const result = await mockIpcMain._invoke('db:connect', {
      connectionId: 'conn-fail',
      config,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })

  // --- DB_DISCONNECT ---

  it('db:disconnect appelle le service de deconnexion', async () => {
    const result = await mockIpcMain._invoke('db:disconnect', {
      connectionId: 'conn-1',
    })

    expect(result.success).toBe(true)
    expect(mockDbService.disconnect).toHaveBeenCalledWith('conn-1')
  })

  it('db:disconnect retourne une erreur si la deconnexion echoue', async () => {
    mockDbService.disconnect.mockRejectedValueOnce(new Error('Already disconnected'))

    const result = await mockIpcMain._invoke('db:disconnect', {
      connectionId: 'conn-err',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Already disconnected')
  })

  // --- DB_TEST_CONNECTION ---

  it('db:testConnection teste et deconnecte sans persister', async () => {
    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      database: 'testdb',
    }

    const result = await mockIpcMain._invoke('db:testConnection', { config })

    expect(result.success).toBe(true)
    expect(mockDbService.createDriver).toHaveBeenCalledWith('postgresql')
    expect(mockDriver.connect).toHaveBeenCalled()
    expect(mockDriver.disconnect).toHaveBeenCalled()
  })

  it('db:testConnection retourne une erreur si le test echoue', async () => {
    mockDriver.connect.mockRejectedValueOnce(new Error('Auth failed'))

    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      password: 'wrong',
      database: 'testdb',
    }

    const result = await mockIpcMain._invoke('db:testConnection', { config })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Auth failed')
  })

  // --- DB_LIST_DATABASES ---

  it('db:listDatabases retourne la liste des bases quand connecte', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)

    const result = await mockIpcMain._invoke('db:listDatabases', {
      connectionId: 'conn-1',
    })

    expect(result.success).toBe(true)
    expect(result.databases).toEqual(['db1', 'db2'])
  })

  it('db:listDatabases retourne une erreur quand non connecte', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:listDatabases', {
      connectionId: 'conn-phantom',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not connected')
    expect(result.databases).toEqual([])
  })

  // --- DB_LIST_SCHEMAS ---

  it('db:listSchemas retourne la liste des schemas quand connecte', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)

    const result = await mockIpcMain._invoke('db:listSchemas', {
      connectionId: 'conn-1',
    })

    expect(result.success).toBe(true)
    expect(result.schemas).toEqual(['public', 'app'])
  })

  it('db:listSchemas retourne une erreur quand non connecte', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:listSchemas', {
      connectionId: 'conn-phantom',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not connected')
    expect(result.schemas).toEqual([])
  })

  // --- DB_LIST_TABLES ---

  it('db:listTables retourne la liste des tables quand connecte', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)

    const result = await mockIpcMain._invoke('db:listTables', {
      connectionId: 'conn-1',
      schema: 'public',
    })

    expect(result.success).toBe(true)
    expect(result.tables).toHaveLength(2)
    expect(result.tables[0].name).toBe('users')
  })

  it('db:listTables retourne une erreur quand non connecte', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:listTables', {
      connectionId: 'conn-phantom',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not connected')
    expect(result.tables).toEqual([])
  })

  // --- DB_TABLE_INFO ---

  it('db:tableInfo retourne les informations de la table', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)

    const result = await mockIpcMain._invoke('db:tableInfo', {
      connectionId: 'conn-1',
      table: 'users',
      schema: 'public',
    })

    expect(result.success).toBe(true)
    expect(result.info.columns).toHaveLength(1)
    expect(result.info.columns[0].name).toBe('id')
    expect(result.info.rowCount).toBe(100)
  })

  it('db:tableInfo retourne une erreur quand non connecte', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:tableInfo', {
      connectionId: 'conn-phantom',
      table: 'users',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not connected')
  })

  // --- DB_EXECUTE_QUERY ---

  it('db:executeQuery execute une requete SQL', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)

    const result = await mockIpcMain._invoke('db:executeQuery', {
      connectionId: 'conn-1',
      sql: 'SELECT * FROM users',
      limit: 100,
      offset: 0,
    })

    expect(result.success).toBe(true)
    expect(result.result.columns).toEqual(['id', 'name'])
    expect(result.result.rows).toHaveLength(1)
  })

  it('db:executeQuery retourne une erreur quand non connecte', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:executeQuery', {
      connectionId: 'conn-phantom',
      sql: 'SELECT 1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not connected')
    expect(result.result).toEqual({
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: 0,
    })
  })

  it('db:executeQuery retourne success false si le resultat contient une erreur', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)
    mockDriver.executeQuery.mockResolvedValueOnce({
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: 5,
      error: 'Syntax error in SQL',
    })

    const result = await mockIpcMain._invoke('db:executeQuery', {
      connectionId: 'conn-1',
      sql: 'INVALID SQL',
    })

    expect(result.success).toBe(false)
    expect(result.result.error).toBe('Syntax error in SQL')
  })

  // --- DB_CANCEL_QUERY ---

  it('db:cancelQuery annule la requete en cours', async () => {
    mockDbService.getDriver.mockReturnValue(mockDriver)

    const result = await mockIpcMain._invoke('db:cancelQuery', {
      connectionId: 'conn-1',
    })

    expect(result.success).toBe(true)
    expect(mockDriver.cancelQuery).toHaveBeenCalled()
  })

  it('db:cancelQuery retourne une erreur quand non connecte', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:cancelQuery', {
      connectionId: 'conn-phantom',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not connected')
  })

  // --- DB_EXPORT ---

  it('db:export sauvegarde les connexions sans mots de passe', async () => {
    const exportPath = path.join(TEST_DIR, 'export.json')
    mockDialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: exportPath,
    })

    const data: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-exp',
          name: 'Export DB',
          engine: 'postgresql',
          environmentTag: 'local',
          config: {
            engine: 'postgresql',
            host: 'localhost',
            password: 'should-be-stripped',
            database: 'exportdb',
          },
          workspaceId: 'ws-exp',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    const result = await mockIpcMain._invoke('db:export', { data })

    expect(result.success).toBe(true)

    const exportedData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
    expect(exportedData.connections[0].config.password).toBeUndefined()
    expect(exportedData.connections[0].name).toBe('Export DB')
  })

  it('db:export retourne success false si l utilisateur annule', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    })

    const result = await mockIpcMain._invoke('db:export', {
      data: { version: 1, connections: [] },
    })

    expect(result.success).toBe(false)
  })

  // --- DB_IMPORT ---

  it('db:import charge les connexions depuis un fichier', async () => {
    const importPath = path.join(TEST_DIR, 'import.json')
    const importData: DbFile = {
      version: 1,
      connections: [
        {
          id: 'conn-imp',
          name: 'Imported DB',
          engine: 'mysql',
          environmentTag: 'dev',
          config: {
            engine: 'mysql',
            host: 'remote.host.com',
            database: 'imported',
          },
          workspaceId: 'ws-imp',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    fs.writeFileSync(importPath, JSON.stringify(importData, null, 2), 'utf-8')

    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [importPath],
    })

    const result = await mockIpcMain._invoke('db:import')

    expect(result.success).toBe(true)
    expect(result.data.connections).toHaveLength(1)
    expect(result.data.connections[0].name).toBe('Imported DB')
  })

  it('db:import retourne success false si l utilisateur annule', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    })

    const result = await mockIpcMain._invoke('db:import')

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
  })

  // --- DB_TRANSFER ---

  it('db:transfer retourne une erreur si la source n est pas connectee', async () => {
    mockDbService.getDriver.mockReturnValue(undefined)

    const result = await mockIpcMain._invoke('db:transfer', {
      sourceConnectionId: 'src',
      targetConnectionId: 'tgt',
      tables: ['users'],
    })

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Source connection not found')
  })

  it('db:transfer retourne une erreur si la cible n est pas connectee', async () => {
    mockDbService.getDriver
      .mockReturnValueOnce(mockDriver) // source found
      .mockReturnValueOnce(undefined) // target not found

    const result = await mockIpcMain._invoke('db:transfer', {
      sourceConnectionId: 'src',
      targetConnectionId: 'tgt',
      tables: ['users'],
    })

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Target connection not found')
  })

  // --- DB_BACKUP ---

  it('db:backup appelle backupDatabase avec la config dechiffree', async () => {
    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'backupdb',
      password: 'plain-pass',
    }

    const result = await mockIpcMain._invoke('db:backup', {
      connectionId: 'conn-bk',
      connectionName: 'My PG DB',
      config,
    })

    expect(result.success).toBe(true)
    expect(result.filePath).toBe('/tmp/backup.sql')
    expect(result.size).toBe(1024)
    expect(mockBackupDatabase).toHaveBeenCalledWith(
      'conn-bk',
      'My PG DB',
      expect.objectContaining({ engine: 'postgresql', host: 'localhost', database: 'backupdb' }),
      undefined,
      undefined,
    )
  })

  it('db:backup retourne une erreur si backupDatabase echoue', async () => {
    mockBackupDatabase.mockResolvedValueOnce({ success: false, error: 'pg_dump not found' })

    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      database: 'backupdb',
    }

    const result = await mockIpcMain._invoke('db:backup', {
      connectionId: 'conn-bk-fail',
      connectionName: 'Fail DB',
      config,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('pg_dump not found')
  })

  it('db:backup transmet les options dataOnly/schemaOnly/tables', async () => {
    const config: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      database: 'backupdb',
    }
    const options = { dataOnly: true, tables: ['users', 'orders'] }

    await mockIpcMain._invoke('db:backup', {
      connectionId: 'conn-bk-opts',
      connectionName: 'Options DB',
      config,
      options,
    })

    expect(mockBackupDatabase).toHaveBeenCalledWith(
      'conn-bk-opts',
      'Options DB',
      expect.objectContaining({ engine: 'postgresql' }),
      options,
      undefined,
    )
  })

  // --- DB_BACKUP_LIST ---

  it('db:backupList retourne la liste des backups', async () => {
    const mockEntries = [
      {
        id: 'bk-1',
        connectionId: 'conn-1',
        connectionName: 'Test DB',
        engine: 'postgresql' as const,
        database: 'testdb',
        timestamp: Date.now(),
        filePath: '/tmp/testdb_backup.sql',
        size: 2048,
      },
    ]
    mockListBackups.mockReturnValueOnce(mockEntries)

    const result = await mockIpcMain._invoke('db:backupList', {
      connectionId: 'conn-1',
    })

    expect(result.success).toBe(true)
    expect(result.entries).toEqual(mockEntries)
    expect(mockListBackups).toHaveBeenCalledWith('conn-1')
  })

  it('db:backupList retourne une liste vide quand pas de backups', async () => {
    const result = await mockIpcMain._invoke('db:backupList', {
      connectionId: 'conn-empty',
    })

    expect(result.success).toBe(true)
    expect(result.entries).toEqual([])
  })

  // --- DB_BACKUP_DELETE ---

  it('db:backupDelete supprime un backup existant', async () => {
    const result = await mockIpcMain._invoke('db:backupDelete', {
      connectionId: 'conn-1',
      backupId: 'bk-1',
    })

    expect(result.success).toBe(true)
    expect(mockDeleteBackup).toHaveBeenCalledWith('conn-1', 'bk-1')
  })

  it('db:backupDelete retourne une erreur si le backup n existe pas', async () => {
    mockDeleteBackup.mockReturnValueOnce({ success: false, error: 'Backup not found' })

    const result = await mockIpcMain._invoke('db:backupDelete', {
      connectionId: 'conn-1',
      backupId: 'bk-ghost',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Backup not found')
  })

  // --- DB_RESTORE ---

  it('db:restore restaure un backup avec la config dechiffree', async () => {
    const entry = {
      id: 'bk-1',
      connectionId: 'conn-1',
      connectionName: 'Source DB',
      engine: 'postgresql' as const,
      database: 'testdb',
      timestamp: Date.now(),
      filePath: '/tmp/testdb_backup.sql',
      size: 2048,
    }
    const targetConfig: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'target_db',
      password: 'target-pass',
    }

    const result = await mockIpcMain._invoke('db:restore', {
      entry,
      targetConfig,
    })

    expect(result.success).toBe(true)
    expect(mockRestoreBackup).toHaveBeenCalledWith(
      entry,
      expect.objectContaining({ engine: 'postgresql', database: 'target_db' }),
    )
  })

  it('db:restore retourne une erreur si la restauration echoue', async () => {
    mockRestoreBackup.mockResolvedValueOnce({ success: false, error: 'psql not found' })

    const entry = {
      id: 'bk-2',
      connectionId: 'conn-1',
      connectionName: 'Source DB',
      engine: 'postgresql' as const,
      database: 'testdb',
      timestamp: Date.now(),
      filePath: '/tmp/testdb_backup.sql',
      size: 2048,
    }
    const targetConfig: DbConnectionConfig = {
      engine: 'postgresql',
      host: 'localhost',
      database: 'target_db',
    }

    const result = await mockIpcMain._invoke('db:restore', {
      entry,
      targetConfig,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('psql not found')
  })

  // --- Persistance croisee (load apres save) ---

  it('db:save puis db:load retourne les memes donnees (sauf mots de passe chiffres)', async () => {
    const original: DbFile = {
      version: 1,
      connections: [
        {
          id: 'cross-1',
          name: 'Cross Test',
          engine: 'postgresql',
          environmentTag: 'local',
          config: {
            engine: 'postgresql',
            host: 'localhost',
            port: 5432,
            database: 'crossdb',
          },
          workspaceId: 'ws-cross',
          createdAt: 1000,
          updatedAt: 2000,
        },
        {
          id: 'cross-2',
          name: 'Cross Test 2',
          engine: 'mysql',
          environmentTag: 'dev',
          config: {
            engine: 'mysql',
            host: 'mysql.local',
            port: 3306,
            database: 'crossdb2',
          },
          workspaceId: 'ws-cross',
          createdAt: 3000,
          updatedAt: 4000,
        },
      ],
    }

    await mockIpcMain._invoke('db:save', { workspaceId: 'ws-cross', data: original })
    const loaded = await mockIpcMain._invoke('db:load', { workspaceId: 'ws-cross' })

    expect(loaded.version).toBe(1)
    expect(loaded.connections).toHaveLength(2)
    expect(loaded.connections[0].id).toBe('cross-1')
    expect(loaded.connections[1].id).toBe('cross-2')
  })

  it('db:save cree le repertoire databases s il n existe pas', async () => {
    // Remove the data directory
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }

    const data: DbFile = {
      version: 1,
      connections: [],
    }

    const result = await mockIpcMain._invoke('db:save', {
      workspaceId: 'ws-newdir',
      data,
    })

    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(dataDir, 'ws-newdir.json'))).toBe(true)
  })
})
