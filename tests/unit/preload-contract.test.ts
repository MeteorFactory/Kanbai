import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Electron modules before import
const mockInvoke = vi.fn()
const mockSend = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()
const mockExposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (...args: unknown[]) => mockExposeInMainWorld(...args),
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    send: (...args: unknown[]) => mockSend(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
    setMaxListeners: vi.fn(),
  },
}))

describe('Preload Contract (pre-upgrade baseline)', () => {
  let exposedApi: Record<string, unknown>

  beforeEach(async () => {
    vi.resetModules()
    mockExposeInMainWorld.mockClear()
    mockInvoke.mockClear()
    mockSend.mockClear()
    mockOn.mockClear()
    mockRemoveListener.mockClear()

    await import('../../src/preload/index')

    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(mockExposeInMainWorld).toHaveBeenCalledWith('kanbai', expect.any(Object))
    exposedApi = mockExposeInMainWorld.mock.calls[0][1] as Record<string, unknown>
  })

  it('expose l API sous le nom "kanbai"', () => {
    expect(mockExposeInMainWorld.mock.calls[0][0]).toBe('kanbai')
  })

  describe('Top-level API namespaces', () => {
    const expectedNamespaces = [
      'terminal',
      'workspace',
      'namespace',
      'project',
      'fs',
      'git',
      'claude',
      'claudeMemory',
      'kanban',
      'workspaceDir',
      'workspaceEnv',
      'updates',
      'gitConfig',
      'shell',
      'settings',
      'session',
      'prompts',
      'claudeAgents',
      'claudeSkills',
      'mcp',
      'claudeDefaults',
      'api',
      'database',
      'app',
      'appUpdate',
      'ssh',
      'analysis',
      'packages',
    ]

    it.each(expectedNamespaces)('expose le namespace "%s"', (ns) => {
      expect(exposedApi).toHaveProperty(ns)
      expect(typeof exposedApi[ns]).toBe('object')
    })
  })

  describe('Terminal namespace methods', () => {
    it('expose create, write, resize, close, onData, onClose', () => {
      const terminal = exposedApi.terminal as Record<string, unknown>
      expect(typeof terminal.create).toBe('function')
      expect(typeof terminal.write).toBe('function')
      expect(typeof terminal.resize).toBe('function')
      expect(typeof terminal.close).toBe('function')
      expect(typeof terminal.onData).toBe('function')
      expect(typeof terminal.onClose).toBe('function')
    })
  })

  describe('Workspace namespace methods', () => {
    it('expose list, create, update, delete, restore, export, import', () => {
      const workspace = exposedApi.workspace as Record<string, unknown>
      expect(typeof workspace.list).toBe('function')
      expect(typeof workspace.create).toBe('function')
      expect(typeof workspace.update).toBe('function')
      expect(typeof workspace.delete).toBe('function')
      expect(typeof workspace.restore).toBe('function')
      expect(typeof workspace.export).toBe('function')
      expect(typeof workspace.import).toBe('function')
    })
  })

  describe('Git namespace methods', () => {
    it('expose les operations de base (status, log, commit, push, pull)', () => {
      const git = exposedApi.git as Record<string, unknown>
      expect(typeof git.status).toBe('function')
      expect(typeof git.log).toBe('function')
      expect(typeof git.commit).toBe('function')
      expect(typeof git.push).toBe('function')
      expect(typeof git.pull).toBe('function')
    })

    it('expose les operations de branches', () => {
      const git = exposedApi.git as Record<string, unknown>
      expect(typeof git.branches).toBe('function')
      expect(typeof git.checkout).toBe('function')
      expect(typeof git.createBranch).toBe('function')
      expect(typeof git.deleteBranch).toBe('function')
      expect(typeof git.merge).toBe('function')
    })
  })

  describe('Session namespace methods', () => {
    it('expose save, load, clear', () => {
      const session = exposedApi.session as Record<string, unknown>
      expect(typeof session.save).toBe('function')
      expect(typeof session.load).toBe('function')
      expect(typeof session.clear).toBe('function')
    })
  })

  describe('IPC invoke wrapping', () => {
    it('les methodes invoke appellent ipcRenderer.invoke avec le bon channel', () => {
      const workspace = exposedApi.workspace as Record<string, (...args: unknown[]) => unknown>
      workspace.list()
      expect(mockInvoke).toHaveBeenCalledWith('workspace:list')
    })

    it('les methodes send appellent ipcRenderer.send avec le bon channel', () => {
      const terminal = exposedApi.terminal as Record<string, (...args: unknown[]) => unknown>
      terminal.write('id-1', 'ls\n')
      expect(mockSend).toHaveBeenCalledWith('terminal:input', { id: 'id-1', data: 'ls\n' })
    })
  })

  describe('Event listener cleanup', () => {
    it('onData retourne une fonction de cleanup', () => {
      const terminal = exposedApi.terminal as Record<string, (...args: unknown[]) => unknown>
      const cleanup = terminal.onData(() => {})
      expect(typeof cleanup).toBe('function')
    })

    it('le cleanup appelle removeListener', () => {
      const terminal = exposedApi.terminal as Record<string, (...args: unknown[]) => unknown>
      const cleanup = terminal.onData(() => {}) as () => void
      cleanup()
      expect(mockRemoveListener).toHaveBeenCalledWith('terminal:data', expect.any(Function))
    })
  })

  describe('Standalone methods', () => {
    it('expose notify comme fonction directe', () => {
      expect(typeof exposedApi.notify).toBe('function')
    })

    it('expose onMenuAction comme fonction directe', () => {
      expect(typeof exposedApi.onMenuAction).toBe('function')
    })
  })
})
