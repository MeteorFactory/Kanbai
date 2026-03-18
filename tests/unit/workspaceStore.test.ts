import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Workspace, Project } from '../../src/shared/types'

// Mock terminalTabStore (used by setActiveWorkspace)
vi.mock('../../src/renderer/lib/stores/terminalTabStore', () => ({
  useTerminalTabStore: {
    getState: () => ({
      tabs: [],
      createSplitTab: vi.fn(),
      activateFirstInWorkspace: vi.fn(),
    }),
  },
}))

// Mock window.kanbai API
const mockWorkspaceApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

const mockProjectApi = {
  list: vi.fn().mockResolvedValue([]),
  selectDir: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  scanClaude: vi.fn(),
}

const mockNamespaceApi = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  ensureDefault: vi.fn().mockResolvedValue(undefined),
}

// Set up global window mock before importing the store
const mockKanbai = {
  workspace: mockWorkspaceApi,
  project: mockProjectApi,
  namespace: mockNamespaceApi,
  workspaceEnv: { setup: vi.fn(), getPath: vi.fn(), delete: vi.fn() },
}

vi.stubGlobal('window', { kanbai: mockKanbai })

const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')

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

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    name: 'Test Project',
    path: '/tmp/test',
    hasClaude: false,
    workspaceId: 'ws-1',
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    // Reset store state
    useWorkspaceStore.setState({
      workspaces: [],
      projects: [],
      namespaces: [],
      activeNamespaceId: null,
      activeWorkspaceId: null,
      activeProjectId: null,
      initialized: false,
    })
    vi.clearAllMocks()
    // Restore default mock return values cleared by clearAllMocks
    mockNamespaceApi.list.mockResolvedValue([])
    mockNamespaceApi.ensureDefault.mockResolvedValue(undefined)
    mockProjectApi.list.mockResolvedValue([])
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useWorkspaceStore.getState()
      expect(state.workspaces).toEqual([])
      expect(state.projects).toEqual([])
      expect(state.activeWorkspaceId).toBeNull()
      expect(state.activeProjectId).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('init', () => {
    it('charge les workspaces et marque initialized', async () => {
      const ws = makeWorkspace()
      mockWorkspaceApi.list.mockResolvedValue([ws])
      mockProjectApi.list.mockResolvedValue([])

      await useWorkspaceStore.getState().init()

      const state = useWorkspaceStore.getState()
      expect(state.initialized).toBe(true)
      expect(state.workspaces).toHaveLength(1)
      expect(mockWorkspaceApi.list).toHaveBeenCalledOnce()
    })

    it('ne recharge pas si deja initialise', async () => {
      mockWorkspaceApi.list.mockResolvedValue([])

      await useWorkspaceStore.getState().init()
      await useWorkspaceStore.getState().init()

      expect(mockWorkspaceApi.list).toHaveBeenCalledOnce()
    })
  })

  describe('createWorkspace', () => {
    it('cree un workspace et l ajoute au store', async () => {
      const ws = makeWorkspace()
      mockWorkspaceApi.create.mockResolvedValue(ws)

      const result = await useWorkspaceStore.getState().createWorkspace('Test Workspace', '#3b82f6')

      expect(result).toEqual(ws)
      expect(useWorkspaceStore.getState().workspaces).toHaveLength(1)
      expect(mockWorkspaceApi.create).toHaveBeenCalledWith({
        name: 'Test Workspace',
        color: '#3b82f6',
      })
    })

    it('utilise une couleur par defaut si non specifiee', async () => {
      const ws = makeWorkspace()
      mockWorkspaceApi.create.mockResolvedValue(ws)

      await useWorkspaceStore.getState().createWorkspace('Test')

      expect(mockWorkspaceApi.create).toHaveBeenCalledWith({
        name: 'Test',
        color: '#9747FF',
      })
    })
  })

  describe('deleteWorkspace', () => {
    it('supprime le workspace et ses projets du store', async () => {
      const ws = makeWorkspace()
      const project = makeProject({ workspaceId: 'ws-1' })
      useWorkspaceStore.setState({ workspaces: [ws], projects: [project] })
      mockWorkspaceApi.delete.mockResolvedValue(undefined)

      await useWorkspaceStore.getState().deleteWorkspace('ws-1')

      expect(useWorkspaceStore.getState().workspaces).toHaveLength(0)
      expect(useWorkspaceStore.getState().projects).toHaveLength(0)
    })

    it('reset activeWorkspaceId si c etait le workspace actif', async () => {
      const ws = makeWorkspace()
      useWorkspaceStore.setState({ workspaces: [ws], activeWorkspaceId: 'ws-1' })
      mockWorkspaceApi.delete.mockResolvedValue(undefined)

      await useWorkspaceStore.getState().deleteWorkspace('ws-1')

      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull()
    })
  })

  describe('updateWorkspace', () => {
    it('met a jour le workspace dans le store', async () => {
      const ws = makeWorkspace()
      useWorkspaceStore.setState({ workspaces: [ws] })
      mockWorkspaceApi.update.mockResolvedValue(undefined)

      await useWorkspaceStore.getState().updateWorkspace('ws-1', { name: 'Updated' })

      expect(useWorkspaceStore.getState().workspaces[0]!.name).toBe('Updated')
    })
  })

  describe('addProject', () => {
    it('ajoute un projet apres selection du dossier', async () => {
      const ws = makeWorkspace()
      const project = makeProject()
      useWorkspaceStore.setState({ workspaces: [ws] })
      mockProjectApi.selectDir.mockResolvedValue('/tmp/test')
      mockProjectApi.add.mockResolvedValue(project)
      mockKanbai.workspaceEnv.setup.mockResolvedValue({ success: true, envPath: '/tmp/env' })

      const result = await useWorkspaceStore.getState().addProject('ws-1')

      expect(result).toEqual(project)
      expect(useWorkspaceStore.getState().projects).toHaveLength(1)
      expect(useWorkspaceStore.getState().workspaces[0]!.projectIds).toContain('p-1')
    })

    it('setup workspace env apres ajout de projet', async () => {
      const ws = makeWorkspace()
      const project = makeProject()
      useWorkspaceStore.setState({ workspaces: [ws] })
      mockProjectApi.selectDir.mockResolvedValue('/tmp/test')
      mockProjectApi.add.mockResolvedValue(project)
      mockKanbai.workspaceEnv.setup.mockResolvedValue({ success: true, envPath: '/tmp/env' })

      await useWorkspaceStore.getState().addProject('ws-1')

      // Env should be set up with workspace name, not ID (+ workspaceId for MCP registration)
      expect(mockKanbai.workspaceEnv.setup).toHaveBeenCalledWith('Test Workspace', ['/tmp/test'], 'ws-1')
    })

    it('retourne null si l utilisateur annule la selection', async () => {
      mockProjectApi.selectDir.mockResolvedValue(null)

      const result = await useWorkspaceStore.getState().addProject('ws-1')

      expect(result).toBeNull()
      expect(mockProjectApi.add).not.toHaveBeenCalled()
    })
  })

  describe('removeProject', () => {
    it('supprime le projet du store et du workspace', async () => {
      const ws = makeWorkspace({ projectIds: ['p-1'] })
      const project = makeProject()
      useWorkspaceStore.setState({ workspaces: [ws], projects: [project] })
      mockProjectApi.remove.mockResolvedValue(undefined)
      mockKanbai.workspaceEnv.setup.mockResolvedValue({ success: true, envPath: '/tmp/env' })

      await useWorkspaceStore.getState().removeProject('p-1')

      expect(useWorkspaceStore.getState().projects).toHaveLength(0)
      expect(useWorkspaceStore.getState().workspaces[0]!.projectIds).not.toContain('p-1')
    })

    it('reset activeProjectId si c etait le projet actif', async () => {
      const project = makeProject()
      useWorkspaceStore.setState({ projects: [project], activeProjectId: 'p-1', workspaces: [makeWorkspace({ projectIds: ['p-1'] })] })
      mockProjectApi.remove.mockResolvedValue(undefined)
      mockKanbai.workspaceEnv.setup.mockResolvedValue({ success: true, envPath: '/tmp/env' })

      await useWorkspaceStore.getState().removeProject('p-1')

      expect(useWorkspaceStore.getState().activeProjectId).toBeNull()
    })
  })

  describe('setupWorkspaceEnv', () => {
    it('setup env avec le nom du workspace (pas l id)', async () => {
      const ws = makeWorkspace({ id: 'ws-1', name: 'Mon Workspace' })
      const project = makeProject({ workspaceId: 'ws-1' })
      useWorkspaceStore.setState({ workspaces: [ws], projects: [project] })
      mockKanbai.workspaceEnv.setup.mockResolvedValue({ success: true, envPath: '/home/user/.workspaces/Mon Workspace' })

      const result = await useWorkspaceStore.getState().setupWorkspaceEnv('ws-1')

      expect(mockKanbai.workspaceEnv.setup).toHaveBeenCalledWith('Mon Workspace', ['/tmp/test'], 'ws-1')
      expect(result).toBe('/home/user/.workspaces/Mon Workspace')
    })

    it('retourne null si le workspace n existe pas', async () => {
      const result = await useWorkspaceStore.getState().setupWorkspaceEnv('ws-inexistant')
      expect(result).toBeNull()
    })

    it('retourne null si le workspace n a pas de projets', async () => {
      const ws = makeWorkspace()
      useWorkspaceStore.setState({ workspaces: [ws], projects: [] })

      const result = await useWorkspaceStore.getState().setupWorkspaceEnv('ws-1')
      expect(result).toBeNull()
    })

    it('setup env meme avec un seul projet', async () => {
      const ws = makeWorkspace()
      const project = makeProject()
      useWorkspaceStore.setState({ workspaces: [ws], projects: [project] })
      mockKanbai.workspaceEnv.setup.mockResolvedValue({ success: true, envPath: '/tmp/env' })

      const result = await useWorkspaceStore.getState().setupWorkspaceEnv('ws-1')

      expect(result).toBe('/tmp/env')
      expect(mockKanbai.workspaceEnv.setup).toHaveBeenCalledOnce()
    })
  })

  describe('setActiveWorkspace / setActiveProject', () => {
    it('met a jour activeWorkspaceId', () => {
      useWorkspaceStore.getState().setActiveWorkspace('ws-1')
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1')
    })

    it('met a jour activeProjectId', () => {
      useWorkspaceStore.getState().setActiveProject('p-1')
      expect(useWorkspaceStore.getState().activeProjectId).toBe('p-1')
    })

    it('accepte null pour desactiver', () => {
      useWorkspaceStore.getState().setActiveWorkspace('ws-1')
      useWorkspaceStore.getState().setActiveWorkspace(null)
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull()
    })
  })
})
