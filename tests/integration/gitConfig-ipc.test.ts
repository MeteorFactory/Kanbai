import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-gitconfig-ipc-test-${process.pid}-${Date.now()}`)
const dataDir = path.join(TEST_DIR, '.kanbai')

// Mock os.homedir to use temp directory (isolates StorageService)
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

// Mock uuid to return predictable IDs
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}))

// Mock child_process to prevent real git config modification
const mockExecFileSync = vi.fn()
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  }
})

describe('GitConfig IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  // Namespace IDs assigned by the predictable uuid mock.
  // uuid counter resets to 0 in beforeEach:
  //   - test-uuid-1 = default namespace (created by StorageService on first load)
  const DEFAULT_NS_ID = 'test-uuid-1'
  // The second namespace created in tests that need one:
  const CUSTOM_NS_ID = 'test-uuid-2'

  beforeEach(async () => {
    uuidCounter = 0
    mockExecFileSync.mockReset()
    vi.resetModules()

    // Ensure clean data directory
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    // Re-import after module reset to get fresh StorageService singleton
    const { _resetForTesting } = await import('../../src/main/services/storage')
    _resetForTesting()

    const { registerGitConfigHandlers } = await import('../../src/main/ipc/gitConfig')

    mockIpcMain = createMockIpcMain()
    registerGitConfigHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // --- Helper: create a non-default namespace directly in storage ---
  async function createCustomNamespace(name = 'Work'): Promise<string> {
    // Import the StorageService after module reset to get the singleton
    const { StorageService } = await import('../../src/main/services/storage')
    const storage = new StorageService()
    const nsId = `custom-ns-${Date.now()}`
    storage.addNamespace({
      id: nsId,
      name,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return nsId
  }

  // ---------------------------------------------------------------
  // 1. Registers all 3 gitConfig handlers
  // ---------------------------------------------------------------
  it('registers all 3 gitConfig handlers', () => {
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(3)
    expect(mockIpcMain._handlers.has('gitConfig:get')).toBe(true)
    expect(mockIpcMain._handlers.has('gitConfig:set')).toBe(true)
    expect(mockIpcMain._handlers.has('gitConfig:delete')).toBe(true)
  })

  // ---------------------------------------------------------------
  // 2. Gets config for default namespace (reads from git global)
  // ---------------------------------------------------------------
  describe('gitConfig:get', () => {
    it('reads from git global config for default namespace', async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[]) => {
          const key = args[2]
          if (key === 'user.name') return '  John Doe  \n'
          if (key === 'user.email') return '  john@example.com  \n'
          return ''
        },
      )

      const result = await mockIpcMain._invoke('gitConfig:get', {
        namespaceId: DEFAULT_NS_ID,
      })

      expect(result).toEqual({
        userName: 'John Doe',
        userEmail: 'john@example.com',
        isCustom: false,
      })

      // Verify execFileSync was called with the right git config commands
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git',
        ['config', '--global', 'user.name'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      )
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git',
        ['config', '--global', 'user.email'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      )
    })

    it('returns empty strings when git config values are not set', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('key not found')
      })

      const result = await mockIpcMain._invoke('gitConfig:get', {
        namespaceId: DEFAULT_NS_ID,
      })

      expect(result).toEqual({
        userName: '',
        userEmail: '',
        isCustom: false,
      })
    })

    // ---------------------------------------------------------------
    // 3. Gets config for non-default namespace with custom profile
    // ---------------------------------------------------------------
    it('returns stored profile for non-default namespace with custom profile', async () => {
      const nsId = await createCustomNamespace()

      // Seed a git profile into storage
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      storage.setGitProfile({
        id: 'profile-1',
        namespaceId: nsId,
        userName: 'Work User',
        userEmail: 'work@company.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const result = await mockIpcMain._invoke('gitConfig:get', {
        namespaceId: nsId,
      })

      expect(result).toEqual({
        userName: 'Work User',
        userEmail: 'work@company.com',
        isCustom: true,
      })

      // Should NOT call execFileSync since there is a stored profile
      expect(mockExecFileSync).not.toHaveBeenCalled()
    })

    // ---------------------------------------------------------------
    // 4. Gets config for non-default namespace without profile (falls back to global)
    // ---------------------------------------------------------------
    it('falls back to global config for non-default namespace without profile', async () => {
      const nsId = await createCustomNamespace()

      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[]) => {
          const key = args[2]
          if (key === 'user.name') return 'Global User\n'
          if (key === 'user.email') return 'global@example.com\n'
          return ''
        },
      )

      const result = await mockIpcMain._invoke('gitConfig:get', {
        namespaceId: nsId,
      })

      expect(result).toEqual({
        userName: 'Global User',
        userEmail: 'global@example.com',
        isCustom: false,
      })

      // Should have called execFileSync to read global config
      expect(mockExecFileSync).toHaveBeenCalled()
    })

    // ---------------------------------------------------------------
    // 8. Throws error when getting config for non-existent namespace
    // ---------------------------------------------------------------
    it('throws error for non-existent namespace', async () => {
      await expect(
        mockIpcMain._invoke('gitConfig:get', { namespaceId: 'non-existent-id' }),
      ).rejects.toThrow('Namespace non-existent-id not found')
    })
  })

  // ---------------------------------------------------------------
  // 5. Sets config for default namespace (calls setGlobalGitConfig)
  // ---------------------------------------------------------------
  describe('gitConfig:set', () => {
    it('writes to git global config for default namespace', async () => {
      mockExecFileSync.mockReturnValue('')

      const result = await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: DEFAULT_NS_ID,
        userName: 'New Name',
        userEmail: 'new@example.com',
      })

      expect(result).toEqual({ success: true, isCustom: false })

      // Verify execFileSync was called to set both user.name and user.email
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git',
        ['config', '--global', 'user.name', 'New Name'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      )
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git',
        ['config', '--global', 'user.email', 'new@example.com'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      )
    })

    // ---------------------------------------------------------------
    // 6. Sets config for non-default namespace (stores profile)
    // ---------------------------------------------------------------
    it('stores profile for non-default namespace', async () => {
      const nsId = await createCustomNamespace()

      const result = await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: nsId,
        userName: 'Work User',
        userEmail: 'work@company.com',
      })

      expect(result).toEqual({ success: true, isCustom: true })

      // Should NOT call execFileSync (not touching global config)
      expect(mockExecFileSync).not.toHaveBeenCalled()

      // Verify profile was persisted in storage
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      const profile = storage.getGitProfile(nsId)
      expect(profile).toBeDefined()
      expect(profile!.userName).toBe('Work User')
      expect(profile!.userEmail).toBe('work@company.com')
      expect(profile!.namespaceId).toBe(nsId)
      expect(profile!.id).toBeDefined()
      expect(profile!.createdAt).toBeDefined()
      expect(profile!.updatedAt).toBeDefined()
    })

    // ---------------------------------------------------------------
    // 7. Updates existing profile for non-default namespace
    // ---------------------------------------------------------------
    it('updates existing profile for non-default namespace', async () => {
      const nsId = await createCustomNamespace()

      // Create initial profile
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      const originalCreatedAt = Date.now() - 10000
      storage.setGitProfile({
        id: 'existing-profile-id',
        namespaceId: nsId,
        userName: 'Old Name',
        userEmail: 'old@example.com',
        createdAt: originalCreatedAt,
        updatedAt: originalCreatedAt,
      })

      // Update via IPC handler
      const result = await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: nsId,
        userName: 'Updated Name',
        userEmail: 'updated@example.com',
      })

      expect(result).toEqual({ success: true, isCustom: true })

      // Verify the profile was updated, not duplicated
      const updatedProfile = storage.getGitProfile(nsId)
      expect(updatedProfile).toBeDefined()
      expect(updatedProfile!.userName).toBe('Updated Name')
      expect(updatedProfile!.userEmail).toBe('updated@example.com')
      // Should preserve the original ID and createdAt
      expect(updatedProfile!.id).toBe('existing-profile-id')
      expect(updatedProfile!.createdAt).toBe(originalCreatedAt)
      // updatedAt should be more recent
      expect(updatedProfile!.updatedAt).toBeGreaterThan(originalCreatedAt)
    })

    // ---------------------------------------------------------------
    // 9. Throws error when setting config for non-existent namespace
    // ---------------------------------------------------------------
    it('throws error for non-existent namespace', async () => {
      await expect(
        mockIpcMain._invoke('gitConfig:set', {
          namespaceId: 'non-existent-id',
          userName: 'Name',
          userEmail: 'email@test.com',
        }),
      ).rejects.toThrow('Namespace non-existent-id not found')
    })
  })

  // ---------------------------------------------------------------
  // 10-12. Delete handler
  // ---------------------------------------------------------------
  describe('gitConfig:delete', () => {
    // ---------------------------------------------------------------
    // 10. Deletes custom profile for non-default namespace
    // ---------------------------------------------------------------
    it('deletes custom profile for non-default namespace', async () => {
      const nsId = await createCustomNamespace()

      // Seed a profile
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      storage.setGitProfile({
        id: 'to-delete',
        namespaceId: nsId,
        userName: 'Temporary',
        userEmail: 'temp@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      // Confirm profile exists before deletion
      expect(storage.getGitProfile(nsId)).toBeDefined()

      const result = await mockIpcMain._invoke('gitConfig:delete', {
        namespaceId: nsId,
      })

      expect(result).toEqual({ success: true })

      // Profile should be gone from storage
      expect(storage.getGitProfile(nsId)).toBeUndefined()
    })

    // ---------------------------------------------------------------
    // 11. Throws error when deleting default namespace's config
    // ---------------------------------------------------------------
    it('throws error when deleting default namespace config', async () => {
      await expect(
        mockIpcMain._invoke('gitConfig:delete', { namespaceId: DEFAULT_NS_ID }),
      ).rejects.toThrow('Cannot delete default namespace git config')
    })

    // ---------------------------------------------------------------
    // 12. Throws error when deleting for non-existent namespace
    // ---------------------------------------------------------------
    it('throws error for non-existent namespace', async () => {
      await expect(
        mockIpcMain._invoke('gitConfig:delete', { namespaceId: 'non-existent-id' }),
      ).rejects.toThrow('Namespace non-existent-id not found')
    })
  })

  // ---------------------------------------------------------------
  // Integration: full lifecycle (set, get, update, get, delete, get)
  // ---------------------------------------------------------------
  describe('full lifecycle', () => {
    it('creates, reads, updates, and deletes a git profile', async () => {
      const nsId = await createCustomNamespace('Lifecycle')

      // Configure mock for global fallback reads
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[]) => {
          const key = args[2]
          if (key === 'user.name') return 'Global Fallback\n'
          if (key === 'user.email') return 'global@fallback.com\n'
          return ''
        },
      )

      // Step 1: Get before any profile exists (should fall back to global)
      const initial = await mockIpcMain._invoke('gitConfig:get', { namespaceId: nsId })
      expect(initial.isCustom).toBe(false)
      expect(initial.userName).toBe('Global Fallback')

      // Step 2: Set a custom profile
      mockExecFileSync.mockClear()
      await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: nsId,
        userName: 'Custom User',
        userEmail: 'custom@work.com',
      })

      // Step 3: Get the custom profile (should NOT call git)
      mockExecFileSync.mockClear()
      const afterSet = await mockIpcMain._invoke('gitConfig:get', { namespaceId: nsId })
      expect(afterSet).toEqual({
        userName: 'Custom User',
        userEmail: 'custom@work.com',
        isCustom: true,
      })
      expect(mockExecFileSync).not.toHaveBeenCalled()

      // Step 4: Update the profile
      await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: nsId,
        userName: 'Updated User',
        userEmail: 'updated@work.com',
      })

      const afterUpdate = await mockIpcMain._invoke('gitConfig:get', { namespaceId: nsId })
      expect(afterUpdate.userName).toBe('Updated User')
      expect(afterUpdate.userEmail).toBe('updated@work.com')
      expect(afterUpdate.isCustom).toBe(true)

      // Step 5: Delete the custom profile
      await mockIpcMain._invoke('gitConfig:delete', { namespaceId: nsId })

      // Step 6: Get should fall back to global again
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[]) => {
          const key = args[2]
          if (key === 'user.name') return 'Global Fallback\n'
          if (key === 'user.email') return 'global@fallback.com\n'
          return ''
        },
      )

      const afterDelete = await mockIpcMain._invoke('gitConfig:get', { namespaceId: nsId })
      expect(afterDelete).toEqual({
        userName: 'Global Fallback',
        userEmail: 'global@fallback.com',
        isCustom: false,
      })
    })
  })

  // ---------------------------------------------------------------
  // Edge case: data persists to disk
  // ---------------------------------------------------------------
  describe('persistence', () => {
    it('persists git profile to disk after set', async () => {
      const nsId = await createCustomNamespace('Persist')

      await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: nsId,
        userName: 'Disk User',
        userEmail: 'disk@example.com',
      })

      const dataPath = path.join(dataDir, 'data.json')
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      const profiles = raw.gitProfiles as Array<{ namespaceId: string; userName: string }>

      expect(profiles.some((p) => p.namespaceId === nsId && p.userName === 'Disk User')).toBe(true)
    })

    it('removes git profile from disk after delete', async () => {
      const nsId = await createCustomNamespace('PersistDelete')

      // Create profile
      await mockIpcMain._invoke('gitConfig:set', {
        namespaceId: nsId,
        userName: 'Temp Disk',
        userEmail: 'temp@disk.com',
      })

      // Delete profile
      await mockIpcMain._invoke('gitConfig:delete', { namespaceId: nsId })

      const dataPath = path.join(dataDir, 'data.json')
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      const profiles = raw.gitProfiles as Array<{ namespaceId: string }>

      expect(profiles.some((p) => p.namespaceId === nsId)).toBe(false)
    })
  })
})
