import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IS_WIN } from '../helpers/platform'

// Hoist TEST_DIR for os mock
const TEST_DIR = vi.hoisted(() => {
  const osMod = require('os')
  const pathMod = require('path')
  return pathMod.join(osMod.tmpdir(), `.mirehub-backup-test-${process.pid}-${Date.now()}`)
})

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

// Mock child_process.exec to avoid running real CLI tools
const mockExecAsync = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ stdout: '-- SQL dump content\nCREATE TABLE users;', stderr: '' }),
)

vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util')
  return {
    ...actual,
    default: {
      ...actual,
      promisify: () => mockExecAsync,
    },
    promisify: () => mockExecAsync,
  }
})

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}))

// Mock electron BrowserWindow for log emitter
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

import { backupDatabase, listBackups, deleteBackup, restoreBackup } from '../../src/main/services/database/backup'
import type { DbConnectionConfig, DbBackupEntry } from '../../src/shared/types'

const backupsDir = path.join(TEST_DIR, '.mirehub', 'databases', 'backups')

describe('Database Backup Service', () => {
  beforeEach(() => {
    mockExecAsync.mockClear().mockResolvedValue({
      stdout: '-- SQL dump content\nCREATE TABLE users;',
      stderr: '',
    })

    // Clean backup dir
    if (fs.existsSync(backupsDir)) {
      fs.rmSync(backupsDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // --- backupDatabase ---

  describe('backupDatabase', () => {
    it('cree un backup PostgreSQL et met a jour le manifest', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'secret',
        database: 'mydb',
      }

      const result = await backupDatabase('conn-1', 'My PG', config)

      expect(result.success).toBe(true)
      expect(result.filePath).toBeDefined()
      expect(result.filePath).toContain('mydb_')
      expect(result.filePath).toMatch(/\.sql$/)
      expect(result.size).toBeGreaterThan(0)

      // Verify exec was called with pg_dump
      expect(mockExecAsync).toHaveBeenCalledTimes(1)
      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('pg_dump')
      expect(callArgs[0]).toContain('-h')
      expect(callArgs[0]).toContain('-p 5432')
      expect(callArgs[0]).toContain('-U')
      expect(callArgs[0]).toContain('PGPASSWORD=')

      // Verify manifest was created
      const manifestPath = path.join(backupsDir, 'conn-1', 'manifest.json')
      expect(fs.existsSync(manifestPath)).toBe(true)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.version).toBe(1)
      expect(manifest.entries).toHaveLength(1)
      expect(manifest.entries[0].id).toBe('test-uuid-1234')
      expect(manifest.entries[0].connectionName).toBe('My PG')
      expect(manifest.entries[0].engine).toBe('postgresql')
      expect(manifest.entries[0].database).toBe('mydb')
    })

    it('cree un backup MySQL avec les bonnes options', async () => {
      const config: DbConnectionConfig = {
        engine: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'rootpass',
        database: 'appdb',
      }

      const result = await backupDatabase('conn-mysql', 'MySQL DB', config)

      expect(result.success).toBe(true)
      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('mysqldump')
      expect(callArgs[0]).toContain('-h')
      expect(callArgs[0]).toContain('-P 3306')
      expect(callArgs[0]).toContain('-u')
    })

    it('cree un backup MongoDB avec URI', async () => {
      const config: DbConnectionConfig = {
        engine: 'mongodb',
        connectionString: 'mongodb://localhost:27017',
        database: 'mongodb_test',
      }

      mockExecAsync.mockResolvedValueOnce({ stdout: 'binary archive data', stderr: '' })

      const result = await backupDatabase('conn-mongo', 'Mongo DB', config)

      expect(result.success).toBe(true)
      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('mongodump')
      expect(callArgs[0]).toContain('--uri=')
      expect(callArgs[0]).toContain('--archive')
    })

    it('cree un backup SQLite avec le chemin du fichier', async () => {
      const config: DbConnectionConfig = {
        engine: 'sqlite',
        filePath: '/tmp/test.db',
      }

      const result = await backupDatabase('conn-sqlite', 'SQLite DB', config)

      expect(result.success).toBe(true)
      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('sqlite3')
      expect(callArgs[0]).toContain('/tmp/test.db')
      expect(callArgs[0]).toContain('.dump')
    })

    it('retourne une erreur pour MSSQL', async () => {
      const config: DbConnectionConfig = {
        engine: 'mssql',
        host: 'localhost',
        database: 'mssqldb',
      }

      const result = await backupDatabase('conn-mssql', 'MSSQL DB', config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('MSSQL')
      expect(mockExecAsync).not.toHaveBeenCalled()
    })

    it('retourne une erreur si la commande echoue', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('pg_dump: command not found'))

      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'faildb',
      }

      const result = await backupDatabase('conn-fail', 'Fail DB', config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('pg_dump: command not found')
    })

    it('transmet les options dataOnly au backup', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-opts', 'Opts DB', config, { dataOnly: true })

      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('--data-only')
    })

    it('transmet les options schemaOnly au backup', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-opts', 'Opts DB', config, { schemaOnly: true })

      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('--schema-only')
    })

    it('transmet les tables specifiques au backup', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-opts', 'Opts DB', config, { tables: ['users', 'orders'] })

      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('-t')
      expect(callArgs[0]).toContain('users')
      expect(callArgs[0]).toContain('orders')
    })

    it('utilise le PATH etendu pour trouver les CLI tools', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-path', 'Path DB', config)

      // Verify exec was called with extended PATH in env
      const callOpts = mockExecAsync.mock.calls[0]![1]
      if (IS_WIN) {
        expect(callOpts.env.PATH).toContain('PostgreSQL')
        expect(callOpts.env.PATH).toContain('chocolatey')
      } else {
        expect(callOpts.env.PATH).toContain('/opt/homebrew/bin')
        expect(callOpts.env.PATH).toContain('/opt/homebrew/opt/postgresql@16/bin')
        expect(callOpts.env.PATH).toContain('/usr/local/bin')
      }
    })
  })

  // --- listBackups ---

  describe('listBackups', () => {
    it('retourne une liste vide quand pas de manifest', () => {
      const entries = listBackups('conn-empty')
      expect(entries).toEqual([])
    })

    it('retourne les backups tries par date decroissante', async () => {
      // Create two backups
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      // First backup
      await backupDatabase('conn-list', 'List DB', config)

      // Reset uuid mock to get different ID
      const uuid = await import('uuid')
      vi.spyOn(uuid, 'v4').mockReturnValue('test-uuid-5678')

      // Second backup
      await backupDatabase('conn-list', 'List DB', config)

      const entries = listBackups('conn-list')
      expect(entries.length).toBeGreaterThanOrEqual(2)
      // Should be sorted newest first
      expect(entries[0]!.timestamp).toBeGreaterThanOrEqual(entries[1]!.timestamp)
    })

    it('filtre les entries dont le fichier n existe plus', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-filter', 'Filter DB', config)

      // List should have 1 entry
      let entries = listBackups('conn-filter')
      expect(entries).toHaveLength(1)

      // Delete the actual file
      fs.unlinkSync(entries[0]!.filePath)

      // Now listing should return empty (file doesn't exist)
      entries = listBackups('conn-filter')
      expect(entries).toHaveLength(0)
    })
  })

  // --- deleteBackup ---

  describe('deleteBackup', () => {
    it('supprime un backup et met a jour le manifest', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-del', 'Del DB', config)

      const entries = listBackups('conn-del')
      expect(entries).toHaveLength(1)

      const result = deleteBackup('conn-del', entries[0]!.id)
      expect(result.success).toBe(true)

      // File should be deleted
      expect(fs.existsSync(entries[0]!.filePath)).toBe(false)

      // Manifest should be empty
      const remainingEntries = listBackups('conn-del')
      expect(remainingEntries).toHaveLength(0)
    })

    it('retourne une erreur si le backup n existe pas', () => {
      const result = deleteBackup('conn-ghost', 'non-existent-id')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Backup not found')
    })
  })

  // --- restoreBackup ---

  describe('restoreBackup', () => {
    it('restaure un backup PostgreSQL avec psql', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-restore', 'Restore DB', config)
      const entries = listBackups('conn-restore')
      expect(entries).toHaveLength(1)

      mockExecAsync.mockClear()

      const targetConfig: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'secret',
        database: 'target_db',
      }

      const result = await restoreBackup(entries[0]!, targetConfig)
      expect(result.success).toBe(true)

      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('psql')
      expect(callArgs[0]).toContain('-h')
      expect(callArgs[0]).toContain('-p 5432')
      expect(callArgs[0]).toContain('target_db')
    })

    it('restaure un backup MySQL avec mysql', async () => {
      const config: DbConnectionConfig = {
        engine: 'mysql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-restore-mysql', 'Restore MySQL', config)
      const entries = listBackups('conn-restore-mysql')
      mockExecAsync.mockClear()

      const targetConfig: DbConnectionConfig = {
        engine: 'mysql',
        host: 'localhost',
        database: 'target_mysql',
      }

      const result = await restoreBackup(entries[0]!, targetConfig)
      expect(result.success).toBe(true)

      const callArgs = mockExecAsync.mock.calls[0]!
      expect(callArgs[0]).toContain('mysql')
      expect(callArgs[0]).toContain('target_mysql')
    })

    it('retourne une erreur si le fichier backup n existe pas', async () => {
      const entry: DbBackupEntry = {
        id: 'bk-ghost',
        connectionId: 'conn-1',
        connectionName: 'Ghost',
        engine: 'postgresql',
        database: 'ghostdb',
        timestamp: Date.now(),
        filePath: '/tmp/non-existent-backup.sql',
        size: 0,
      }

      const targetConfig: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'target_db',
      }

      const result = await restoreBackup(entry, targetConfig)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Backup file not found')
    })

    it('retourne une erreur pour MSSQL', async () => {
      // Create a temp file to simulate existing backup
      const tmpFile = path.join(os.tmpdir(), 'mssql-test-backup.bak')
      fs.writeFileSync(tmpFile, 'fake backup data')

      const entry: DbBackupEntry = {
        id: 'bk-mssql',
        connectionId: 'conn-mssql',
        connectionName: 'MSSQL',
        engine: 'mssql',
        database: 'mssqldb',
        timestamp: Date.now(),
        filePath: tmpFile,
        size: 100,
      }

      const targetConfig: DbConnectionConfig = {
        engine: 'mssql',
        host: 'localhost',
        database: 'target_mssql',
      }

      const result = await restoreBackup(entry, targetConfig)
      expect(result.success).toBe(false)
      expect(result.error).toContain('MSSQL')

      // Cleanup
      fs.unlinkSync(tmpFile)
    })

    it('retourne une erreur si la commande de restauration echoue', async () => {
      const config: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      }

      await backupDatabase('conn-restore-fail', 'Fail Restore', config)
      const entries = listBackups('conn-restore-fail')
      mockExecAsync.mockClear()
      mockExecAsync.mockRejectedValueOnce(new Error('psql: FATAL: password authentication failed'))

      const targetConfig: DbConnectionConfig = {
        engine: 'postgresql',
        host: 'localhost',
        database: 'target_db',
      }

      const result = await restoreBackup(entries[0]!, targetConfig)
      expect(result.success).toBe(false)
      expect(result.error).toContain('password authentication failed')
    })
  })
})
