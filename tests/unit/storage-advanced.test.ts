import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Workspace, Namespace, GitProfile, SessionData } from '../../src/shared/types'
import { DEFAULT_SETTINGS } from '../../src/shared/constants/defaults'

// ---------------------------------------------------------------------------
// Mock: redirect homedir to a temp directory
// ---------------------------------------------------------------------------
const TEST_DIR = path.join(os.tmpdir(), `.kanbai-storage-adv-test-${process.pid}-${Date.now()}`)

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

// ---------------------------------------------------------------------------
// Mock: deterministic UUIDs
// ---------------------------------------------------------------------------
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
const { StorageService, _resetForTesting } = await import('../../src/main/services/storage')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const dataDir = path.join(TEST_DIR, '.kanbai')
const dataPath = path.join(dataDir, 'data.json')
const sessionPath = path.join(dataDir, 'session.json')

function freshService(): InstanceType<typeof StorageService> {
  _resetForTesting()
  uuidCounter = 0
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
  return new StorageService()
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: 'Test Workspace',
    color: '#3b82f6',
    projectIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
afterAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StorageService (advanced)', () => {
  let service: InstanceType<typeof StorageService>

  beforeEach(() => {
    service = freshService()
  })

  // =========================================================================
  // Namespaces
  // =========================================================================
  describe('namespaces', () => {
    it('cree un namespace par defaut a l initialisation', () => {
      const namespaces = service.getNamespaces()

      expect(namespaces).toHaveLength(1)
      expect(namespaces[0]!.name).toBe('Default')
      expect(namespaces[0]!.isDefault).toBe(true)
    })

    it('ensureDefaultNamespace retourne le namespace existant', () => {
      const existing = service.getDefaultNamespace()
      const ensured = service.ensureDefaultNamespace()

      expect(ensured.id).toBe(existing.id)
      expect(ensured.isDefault).toBe(true)
      // Should not create a duplicate
      expect(service.getNamespaces()).toHaveLength(1)
    })

    it('ajoute un namespace et le persiste', () => {
      const ns: Namespace = {
        id: 'ns-custom',
        name: 'Work',
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.addNamespace(ns)

      expect(service.getNamespaces()).toHaveLength(2)
      expect(service.getNamespace('ns-custom')?.name).toBe('Work')

      // Verify persistence on disk
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      expect(raw.namespaces).toHaveLength(2)
      expect(raw.namespaces[1].id).toBe('ns-custom')
    })

    it('met a jour un namespace existant', () => {
      const ns: Namespace = {
        id: 'ns-2',
        name: 'Personal',
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.addNamespace(ns)

      const updated: Namespace = { ...ns, name: 'Personal Projects', updatedAt: Date.now() + 1000 }
      service.updateNamespace(updated)

      expect(service.getNamespace('ns-2')?.name).toBe('Personal Projects')
    })

    it('ne fait rien si on met a jour un namespace inexistant', () => {
      const ghost: Namespace = {
        id: 'ns-ghost',
        name: 'Ghost',
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.updateNamespace(ghost)

      // Only the default namespace should exist
      expect(service.getNamespaces()).toHaveLength(1)
      expect(service.getNamespace('ns-ghost')).toBeUndefined()
    })

    it('supprime un namespace', () => {
      const ns: Namespace = {
        id: 'ns-delete-me',
        name: 'Deletable',
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.addNamespace(ns)

      // Also add a git profile associated with this namespace
      const profile: GitProfile = {
        id: 'gp-1',
        namespaceId: 'ns-delete-me',
        userName: 'test',
        userEmail: 'test@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.setGitProfile(profile)

      expect(service.getNamespaces()).toHaveLength(2)
      expect(service.getGitProfile('ns-delete-me')).toBeDefined()

      service.deleteNamespace('ns-delete-me')

      expect(service.getNamespaces()).toHaveLength(1)
      expect(service.getNamespace('ns-delete-me')).toBeUndefined()
      // Associated git profile should also be removed
      expect(service.getGitProfile('ns-delete-me')).toBeUndefined()
    })

    it('ne supprime pas le namespace par defaut', () => {
      const defaultNs = service.getDefaultNamespace()

      service.deleteNamespace(defaultNs.id)

      // Default namespace should still exist
      expect(service.getNamespaces()).toHaveLength(1)
      expect(service.getDefaultNamespace().id).toBe(defaultNs.id)
    })
  })

  // =========================================================================
  // Git Profiles
  // =========================================================================
  describe('git profiles', () => {
    it('retourne undefined pour un namespace sans profil', () => {
      expect(service.getGitProfile('ns-nonexistent')).toBeUndefined()
    })

    it('ajoute un profil git et le persiste', () => {
      const profile: GitProfile = {
        id: 'gp-1',
        namespaceId: 'ns-1',
        userName: 'Alice',
        userEmail: 'alice@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      service.setGitProfile(profile)

      const stored = service.getGitProfile('ns-1')
      expect(stored).toBeDefined()
      expect(stored?.userName).toBe('Alice')
      expect(stored?.userEmail).toBe('alice@example.com')

      // Verify persistence
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      expect(raw.gitProfiles).toHaveLength(1)
      expect(raw.gitProfiles[0].userName).toBe('Alice')
    })

    it('met a jour un profil existant', () => {
      const profile: GitProfile = {
        id: 'gp-1',
        namespaceId: 'ns-1',
        userName: 'Alice',
        userEmail: 'alice@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.setGitProfile(profile)

      const updated: GitProfile = {
        ...profile,
        userName: 'Alice Updated',
        userEmail: 'alice.new@example.com',
        updatedAt: Date.now() + 1000,
      }
      service.setGitProfile(updated)

      const stored = service.getGitProfile('ns-1')
      expect(stored?.userName).toBe('Alice Updated')
      expect(stored?.userEmail).toBe('alice.new@example.com')

      // Should still be exactly one profile
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      expect(raw.gitProfiles).toHaveLength(1)
    })

    it('supprime un profil git', () => {
      const profile: GitProfile = {
        id: 'gp-1',
        namespaceId: 'ns-1',
        userName: 'Alice',
        userEmail: 'alice@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.setGitProfile(profile)
      expect(service.getGitProfile('ns-1')).toBeDefined()

      service.deleteGitProfile('ns-1')

      expect(service.getGitProfile('ns-1')).toBeUndefined()

      // Verify persistence
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      expect(raw.gitProfiles).toHaveLength(0)
    })
  })

  // =========================================================================
  // Soft delete / restore
  // =========================================================================
  describe('soft delete / restore', () => {
    it('softDeleteWorkspace met deletedAt sans supprimer', () => {
      const ws = makeWorkspace({ id: 'ws-soft' })
      service.addWorkspace(ws)

      service.softDeleteWorkspace('ws-soft')

      // getWorkspaces excludes soft-deleted
      expect(service.getWorkspaces()).toHaveLength(0)
      // But getWorkspace still finds it (no filter)
      const found = service.getWorkspace('ws-soft')
      expect(found).toBeDefined()
      expect(found?.deletedAt).toBeDefined()
      expect(typeof found?.deletedAt).toBe('number')
    })

    it('restoreWorkspace retire deletedAt', () => {
      const ws = makeWorkspace({ id: 'ws-restore' })
      service.addWorkspace(ws)
      service.softDeleteWorkspace('ws-restore')

      // Verify it is soft-deleted
      expect(service.getWorkspaces()).toHaveLength(0)

      const restored = service.restoreWorkspace('ws-restore')

      expect(restored).toBeDefined()
      expect(restored?.deletedAt).toBeUndefined()
      expect(service.getWorkspaces()).toHaveLength(1)
      expect(service.getWorkspaces()[0]!.id).toBe('ws-restore')
    })

    it('restoreWorkspace retourne undefined si workspace inexistant', () => {
      const result = service.restoreWorkspace('ws-nonexistent')
      expect(result).toBeUndefined()
    })

    it('permanentDeleteWorkspace supprime definitivement', () => {
      const ws = makeWorkspace({ id: 'ws-perm' })
      service.addWorkspace(ws)

      // Also add a project in this workspace
      service.addProject({
        id: 'p-1',
        name: 'Project',
        path: '/tmp/project',
        hasClaude: false,
        workspaceId: 'ws-perm',
        createdAt: Date.now(),
      })

      service.permanentDeleteWorkspace('ws-perm')

      expect(service.getWorkspace('ws-perm')).toBeUndefined()
      expect(service.getWorkspaces()).toHaveLength(0)
      // Associated projects should also be removed
      expect(service.getProjects('ws-perm')).toHaveLength(0)
    })

    it('getDeletedWorkspaceByName trouve un workspace supprime par nom', () => {
      const ws = makeWorkspace({ id: 'ws-find-deleted', name: 'MyDeleted' })
      service.addWorkspace(ws)
      service.softDeleteWorkspace('ws-find-deleted')

      const found = service.getDeletedWorkspaceByName('mydeleted')

      expect(found).toBeDefined()
      expect(found?.id).toBe('ws-find-deleted')
      expect(found?.deletedAt).toBeDefined()
    })

    it('getDeletedWorkspaceByName est insensible a la casse', () => {
      const ws = makeWorkspace({ id: 'ws-case', name: 'CamelCase' })
      service.addWorkspace(ws)
      service.softDeleteWorkspace('ws-case')

      expect(service.getDeletedWorkspaceByName('CAMELCASE')).toBeDefined()
      expect(service.getDeletedWorkspaceByName('camelcase')).toBeDefined()
      expect(service.getDeletedWorkspaceByName('CamelCase')).toBeDefined()
    })

    it('getWorkspaces exclut les workspaces soft-deleted', () => {
      service.addWorkspace(makeWorkspace({ id: 'ws-active', name: 'Active' }))
      service.addWorkspace(makeWorkspace({ id: 'ws-deleted', name: 'Deleted' }))
      service.softDeleteWorkspace('ws-deleted')

      const active = service.getWorkspaces()

      expect(active).toHaveLength(1)
      expect(active[0]!.id).toBe('ws-active')
    })

    it('getProjects exclut les projets de workspaces soft-deleted', () => {
      service.addWorkspace(makeWorkspace({ id: 'ws-alive', name: 'Alive' }))
      service.addWorkspace(makeWorkspace({ id: 'ws-gone', name: 'Gone' }))

      service.addProject({
        id: 'p-alive',
        name: 'Alive Project',
        path: '/tmp/a',
        hasClaude: false,
        workspaceId: 'ws-alive',
        createdAt: Date.now(),
      })
      service.addProject({
        id: 'p-gone',
        name: 'Gone Project',
        path: '/tmp/b',
        hasClaude: false,
        workspaceId: 'ws-gone',
        createdAt: Date.now(),
      })

      service.softDeleteWorkspace('ws-gone')

      // Without filter, getProjects excludes projects from soft-deleted workspaces
      const projects = service.getProjects()
      expect(projects).toHaveLength(1)
      expect(projects[0]!.id).toBe('p-alive')

      // With explicit workspaceId filter, projects from soft-deleted workspaces still show
      const goneProjects = service.getProjects('ws-gone')
      expect(goneProjects).toHaveLength(1)
    })
  })

  // =========================================================================
  // Session
  // =========================================================================
  describe('session', () => {
    it('retourne null si pas de session', () => {
      expect(service.getSession()).toBeNull()
    })

    it('sauvegarde et charge une session', () => {
      const session: SessionData = {
        activeWorkspaceId: 'ws-1',
        activeProjectId: 'p-1',
        activeNamespaceId: 'ns-1',
        tabs: [
          {
            workspaceId: 'ws-1',
            cwd: '/tmp',
            label: 'Terminal 1',
            isSplit: false,
            leftCommand: null,
            rightCommand: null,
          },
        ],
        savedAt: Date.now(),
      }

      service.saveSession(session)

      const loaded = service.getSession()
      expect(loaded).not.toBeNull()
      expect(loaded?.activeWorkspaceId).toBe('ws-1')
      expect(loaded?.activeProjectId).toBe('p-1')
      expect(loaded?.activeNamespaceId).toBe('ns-1')
      expect(loaded?.tabs).toHaveLength(1)
      expect(loaded?.tabs[0]!.label).toBe('Terminal 1')

      // Verify file exists on disk
      expect(fs.existsSync(sessionPath)).toBe(true)
    })

    it('clearSession supprime la session', () => {
      const session: SessionData = {
        activeWorkspaceId: 'ws-1',
        activeProjectId: null,
        activeNamespaceId: null,
        tabs: [],
        savedAt: Date.now(),
      }
      service.saveSession(session)
      expect(service.getSession()).not.toBeNull()

      service.clearSession()

      expect(service.getSession()).toBeNull()
      expect(fs.existsSync(sessionPath)).toBe(false)
    })

    it('clearSession ne plante pas si pas de session', () => {
      // Should not throw even if no session file exists
      expect(() => service.clearSession()).not.toThrow()
    })

    it('retourne null si le fichier session est corrompu', () => {
      fs.writeFileSync(sessionPath, 'not json{{{', 'utf-8')

      const session = service.getSession()
      expect(session).toBeNull()
    })
  })

  // =========================================================================
  // Data migrations (existing data without new fields)
  // =========================================================================
  describe('data migrations', () => {
    it('ajoute gitProfiles si absent dans les donnees existantes', () => {
      const legacyData = {
        workspaces: [makeWorkspace({ id: 'ws-legacy' })],
        projects: [],
        namespaces: [{ id: 'ns-1', name: 'Default', isDefault: true, createdAt: 1, updatedAt: 1 }],
        settings: { ...DEFAULT_SETTINGS },
        kanbanTasks: [],
        autoClauderTemplates: [],
        // No gitProfiles field at all
      }
      fs.writeFileSync(dataPath, JSON.stringify(legacyData), 'utf-8')

      _resetForTesting()
      uuidCounter = 0
      const migrated = new StorageService()

      // gitProfiles should be initialized as empty array
      expect(migrated.getGitProfile('ns-1')).toBeUndefined()
      // The service should work without crashing
      const profile: GitProfile = {
        id: 'gp-1',
        namespaceId: 'ns-1',
        userName: 'Test',
        userEmail: 'test@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      migrated.setGitProfile(profile)
      expect(migrated.getGitProfile('ns-1')?.userName).toBe('Test')
    })

    it('cree un namespace par defaut si absent dans les donnees existantes', () => {
      const legacyData = {
        workspaces: [makeWorkspace({ id: 'ws-orphan' })],
        projects: [],
        // No namespaces field
        settings: { ...DEFAULT_SETTINGS },
        kanbanTasks: [],
        autoClauderTemplates: [],
      }
      fs.writeFileSync(dataPath, JSON.stringify(legacyData), 'utf-8')

      _resetForTesting()
      uuidCounter = 0
      const migrated = new StorageService()

      const namespaces = migrated.getNamespaces()
      expect(namespaces).toHaveLength(1)
      expect(namespaces[0]!.name).toBe('Default')
      expect(namespaces[0]!.isDefault).toBe(true)

      // Orphaned workspace should be assigned to the new default namespace
      const ws = migrated.getWorkspace('ws-orphan')
      expect(ws?.namespaceId).toBe(namespaces[0]!.id)
    })

    it('assigne les workspaces sans namespaceId au namespace par defaut', () => {
      const legacyData = {
        workspaces: [
          makeWorkspace({ id: 'ws-1' }),
          makeWorkspace({ id: 'ws-2', namespaceId: 'ns-existing' }),
        ],
        projects: [],
        // Empty namespaces array triggers migration
        namespaces: [],
        settings: { ...DEFAULT_SETTINGS },
        kanbanTasks: [],
        autoClauderTemplates: [],
      }
      fs.writeFileSync(dataPath, JSON.stringify(legacyData), 'utf-8')

      _resetForTesting()
      uuidCounter = 0
      const migrated = new StorageService()

      const defaultNs = migrated.getDefaultNamespace()
      const ws1 = migrated.getWorkspace('ws-1')
      const ws2 = migrated.getWorkspace('ws-2')

      // ws-1 had no namespaceId, should be assigned to default
      expect(ws1?.namespaceId).toBe(defaultNs.id)
      // ws-2 already had a namespaceId, should keep it
      expect(ws2?.namespaceId).toBe('ns-existing')
    })
  })

  // =========================================================================
  // ensureDefaultNamespace edge case
  // =========================================================================
  describe('ensureDefaultNamespace edge cases', () => {
    it('cree un namespace par defaut si aucun n existe avec isDefault=true', () => {
      // Manually set up data with namespaces but none is default
      const nonDefaultNs: Namespace = {
        id: 'ns-non-default',
        name: 'Custom',
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      // Write data where the only namespace is not default
      const manualData = {
        workspaces: [makeWorkspace({ id: 'ws-orphan-2' })],
        projects: [],
        namespaces: [nonDefaultNs],
        gitProfiles: [],
        settings: { ...DEFAULT_SETTINGS },
        kanbanTasks: [],
        autoClauderTemplates: [],
      }
      fs.writeFileSync(dataPath, JSON.stringify(manualData), 'utf-8')

      _resetForTesting()
      uuidCounter = 0
      const svc = new StorageService()

      // The load() method does not create a default namespace if at least one namespace exists
      // but ensureDefaultNamespace should create one if no isDefault=true exists
      const ensured = svc.ensureDefaultNamespace()

      expect(ensured.isDefault).toBe(true)
      expect(ensured.name).toBe('Default')
      // Total should now be 2: the original non-default + the new default
      expect(svc.getNamespaces()).toHaveLength(2)
    })
  })
})
