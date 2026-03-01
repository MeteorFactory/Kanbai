import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IS_WIN } from '../helpers/platform'

// Mock all Electron dependencies before importing the main module

const mockShow = vi.fn()
const mockLoadURL = vi.fn()
const mockLoadFile = vi.fn()
const mockOn = vi.fn()
const mockOnce = vi.fn()
const mockToggleDevTools = vi.fn()
const mockSend = vi.fn()

const mockBrowserWindowInstance = {
  show: mockShow,
  loadURL: mockLoadURL,
  loadFile: mockLoadFile,
  on: mockOn,
  once: mockOnce,
  webContents: {
    send: mockSend,
    toggleDevTools: mockToggleDevTools,
  },
}

const mockBrowserWindowConstructor = vi.fn(() => mockBrowserWindowInstance)
Object.defineProperty(mockBrowserWindowConstructor, 'getAllWindows', {
  value: vi.fn(() => []),
})

const mockAppWhenReady = vi.fn(() => Promise.resolve())
const mockAppOn = vi.fn()
const mockAppName = { value: '' }

const mockRegister = vi.fn()
const mockSetApplicationMenu = vi.fn()
const mockBuildFromTemplate = vi.fn(() => ({}))
const mockShellOpenExternal = vi.fn()

vi.mock('electron', () => ({
  app: {
    whenReady: () => mockAppWhenReady(),
    on: (...args: unknown[]) => mockAppOn(...args),
    get name() {
      return mockAppName.value
    },
    set name(v: string) {
      mockAppName.value = v
    },
  },
  BrowserWindow: mockBrowserWindowConstructor,
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  globalShortcut: {
    register: (...args: unknown[]) => mockRegister(...args),
  },
  Menu: {
    buildFromTemplate: (...args: unknown[]) => mockBuildFromTemplate(...args),
    setApplicationMenu: (...args: unknown[]) => mockSetApplicationMenu(...args),
  },
  shell: {
    openExternal: (...args: unknown[]) => mockShellOpenExternal(...args),
  },
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(() => process.platform === 'win32'
    ? 'C:\\Windows\\system32;C:\\Program Files\\nodejs'
    : '/usr/bin:/usr/local/bin:/opt/homebrew/bin'),
}))

// Mock all IPC registration functions to avoid side effects
vi.mock('../../src/main/ipc/terminal', () => ({
  registerTerminalHandlers: vi.fn(),
  cleanupTerminals: vi.fn(),
}))
vi.mock('../../src/main/ipc/workspace', () => ({
  registerWorkspaceHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/project', () => ({
  registerProjectHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/app', () => ({
  registerAppHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/claude', () => ({
  registerClaudeHandlers: vi.fn(),
  cleanupClaudeSessions: vi.fn(),
}))
vi.mock('../../src/main/ipc/kanban', () => ({
  registerKanbanHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/updates', () => ({
  registerUpdateHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/filesystem', () => ({
  registerFilesystemHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/git', () => ({
  registerGitHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/session', () => ({
  registerSessionHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/workspaceEnv', () => ({
  registerWorkspaceEnvHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/claudeDefaults', () => ({
  registerClaudeDefaultsHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/api', () => ({
  registerApiHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/database', () => ({
  registerDatabaseHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/appUpdate', () => ({
  registerAppUpdateHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/mcp', () => ({
  registerMcpHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/ssh', () => ({
  registerSshHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/analysis', () => ({
  registerAnalysisHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/packages', () => ({
  registerPackagesHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/namespace', () => ({
  registerNamespaceHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/gitConfig', () => ({
  registerGitConfigHandlers: vi.fn(),
}))
vi.mock('../../src/main/ipc/claudeMemory', () => ({
  registerClaudeMemoryHandlers: vi.fn(),
}))
vi.mock('../../src/main/services/activityHooks', () => ({
  ensureActivityHookScript: vi.fn(),
  ensureAutoApproveScript: vi.fn(),
  ensureKanbanDoneScript: vi.fn(),
  syncAllWorkspaceEnvHooks: vi.fn(),
  startActivityWatcher: vi.fn(),
}))
vi.mock('../../src/main/services/notificationService', () => ({
  clearDockBadge: vi.fn(),
}))
vi.mock('../../src/main/services/database', () => ({
  databaseService: { disconnectAll: vi.fn() },
}))
vi.mock('../../src/main/services/storage', () => {
  class MockStorageService {
    getSettings() {
      return { locale: 'fr' }
    }
    ensureDefaultNamespace() {}
  }
  return {
    StorageService: MockStorageService,
    _resetForTesting: vi.fn(),
  }
})

describe('Electron Lifecycle (pre-upgrade baseline)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockBrowserWindowConstructor.mockClear()
    mockOn.mockClear()
    mockOnce.mockClear()
    mockAppOn.mockClear()
    mockAppWhenReady.mockClear().mockReturnValue(Promise.resolve())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('BrowserWindow creation options', () => {
    it('cree une fenetre avec contextIsolation: true', async () => {
      await import('../../src/main/index')
      // Wait for whenReady().then() to execute
      await new Promise((r) => setTimeout(r, 0))

      expect(mockBrowserWindowConstructor).toHaveBeenCalled()
      const options = mockBrowserWindowConstructor.mock.calls[0][0]
      expect(options.webPreferences.contextIsolation).toBe(true)
    })

    it('cree une fenetre avec nodeIntegration: false', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const options = mockBrowserWindowConstructor.mock.calls[0][0]
      expect(options.webPreferences.nodeIntegration).toBe(false)
    })

    it('cree une fenetre avec webSecurity: true', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const options = mockBrowserWindowConstructor.mock.calls[0][0]
      expect(options.webPreferences.webSecurity).toBe(true)
    })

    it('cree une fenetre avec show: false (avoid flash)', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const options = mockBrowserWindowConstructor.mock.calls[0][0]
      expect(options.show).toBe(false)
    })

    it('ecoute ready-to-show avant d afficher la fenetre', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      expect(mockOnce).toHaveBeenCalledWith('ready-to-show', expect.any(Function))
    })
  })

  describe('BrowserWindow platform-specific options', () => {
    if (IS_WIN) {
      it('ne contient pas vibrancy sur Windows', async () => {
        await import('../../src/main/index')
        await new Promise((r) => setTimeout(r, 0))

        const options = mockBrowserWindowConstructor.mock.calls[0][0]
        expect(options.vibrancy).toBeUndefined()
      })

      it('ne contient pas trafficLightPosition sur Windows', async () => {
        await import('../../src/main/index')
        await new Promise((r) => setTimeout(r, 0))

        const options = mockBrowserWindowConstructor.mock.calls[0][0]
        expect(options.trafficLightPosition).toBeUndefined()
      })

      it('utilise titleBarStyle default sur Windows', async () => {
        await import('../../src/main/index')
        await new Promise((r) => setTimeout(r, 0))

        const options = mockBrowserWindowConstructor.mock.calls[0][0]
        expect(options.titleBarStyle).toBe('default')
      })
    }
  })

  describe('App lifecycle handlers', () => {
    it('enregistre le handler window-all-closed', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const calls = mockAppOn.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('window-all-closed')
    })

    it('enregistre le handler activate', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      // activate is registered inside whenReady().then()
      const calls = mockAppOn.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('activate')
    })

    it('enregistre le handler before-quit', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const calls = mockAppOn.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('before-quit')
    })

    it('enregistre le handler web-contents-created pour bloquer les nouvelles fenetres', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const calls = mockAppOn.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('web-contents-created')
    })
  })
})
