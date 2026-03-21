import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture CSP callback registered via session.defaultSession.webRequest.onHeadersReceived
let capturedCspCallback: ((
  details: { responseHeaders?: Record<string, string[]> },
  callback: (result: { responseHeaders?: Record<string, string[]> }) => void,
) => void) | null = null

// Capture will-navigate handler registered on webContents
let capturedWillNavigate: ((event: { preventDefault: () => void }, url: string) => void) | null = null

const mockShow = vi.fn()
const mockLoadURL = vi.fn()
const mockLoadFile = vi.fn()
const mockOn = vi.fn()
const mockOnce = vi.fn()
const mockSend = vi.fn()
const mockToggleDevTools = vi.fn()
const mockWebContentsOn = vi.fn((event: string, handler: unknown) => {
  if (event === 'will-navigate') {
    capturedWillNavigate = handler as typeof capturedWillNavigate
  }
})

const mockBrowserWindowInstance = {
  show: mockShow,
  loadURL: mockLoadURL,
  loadFile: mockLoadFile,
  on: mockOn,
  once: mockOnce,
  webContents: {
    send: mockSend,
    toggleDevTools: mockToggleDevTools,
    on: mockWebContentsOn,
    setWindowOpenHandler: vi.fn(),
  },
}

const mockBrowserWindowConstructor = vi.fn(function () { return mockBrowserWindowInstance })
Object.defineProperty(mockBrowserWindowConstructor, 'getAllWindows', {
  value: vi.fn(() => []),
})

const mockAppWhenReady = vi.fn(() => Promise.resolve())
const mockAppOn = vi.fn()
const mockAppName = { value: '' }

const mockOnHeadersReceived = vi.fn((cb: typeof capturedCspCallback) => {
  capturedCspCallback = cb
})

vi.mock('electron', () => ({
  app: {
    whenReady: () => mockAppWhenReady(),
    on: (...args: unknown[]) => mockAppOn(...args),
    get name() { return mockAppName.value },
    set name(v: string) { mockAppName.value = v },
  },
  BrowserWindow: mockBrowserWindowConstructor,
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  globalShortcut: { register: vi.fn() },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: (...args: unknown[]) => mockOnHeadersReceived(args[0] as typeof capturedCspCallback),
      },
    },
  },
  shell: { openExternal: vi.fn() },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  },
  net: {
    fetch: vi.fn(() => Promise.resolve(new Response())),
  },
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '/usr/bin:/usr/local/bin'),
}))

// Mock all IPC handlers
vi.mock('../../src/main/ipc/terminal', () => ({ registerTerminalHandlers: vi.fn(), cleanupTerminals: vi.fn() }))
vi.mock('../../src/main/ipc/workspace', () => ({ registerWorkspaceHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/project', () => ({ registerProjectHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/app', () => ({ registerAppHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/claude', () => ({ registerClaudeHandlers: vi.fn(), cleanupClaudeSessions: vi.fn() }))
vi.mock('../../src/main/ipc/kanban', () => ({ registerKanbanHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/updates', () => ({ registerUpdateHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/filesystem', () => ({ registerFilesystemHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/git', () => ({ registerGitHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/session', () => ({ registerSessionHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/workspaceEnv', () => ({ registerWorkspaceEnvHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/claudeDefaults', () => ({ registerClaudeDefaultsHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/api', () => ({ registerApiHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/database', () => ({ registerDatabaseHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/appUpdate', () => ({ registerAppUpdateHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/mcp', () => ({ registerMcpHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/ssh', () => ({ registerSshHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/analysis', () => ({ registerAnalysisHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/packages', () => ({ registerPackagesHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/namespace', () => ({ registerNamespaceHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/gitConfig', () => ({ registerGitConfigHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/claudeMemory', () => ({ registerClaudeMemoryHandlers: vi.fn() }))
vi.mock('../../src/main/ipc/healthcheck', () => ({ registerHealthCheckHandlers: vi.fn() }))
vi.mock('../../src/main/services/activityHooks', () => ({
  ensureActivityHookScript: vi.fn(),
  ensureAutoApproveScript: vi.fn(),
  ensureKanbanDoneScript: vi.fn(),
  syncAllWorkspaceEnvHooks: vi.fn(),
  startActivityWatcher: vi.fn(),
}))
vi.mock('../../src/main/services/notificationService', () => ({ clearDockBadge: vi.fn() }))
vi.mock('../../src/main/services/database', () => ({ databaseService: { disconnectAll: vi.fn() } }))
vi.mock('../../src/main/services/storage', () => {
  class MockStorageService {
    getSettings() { return { locale: 'fr' } }
    ensureDefaultNamespace() {}
  }
  return { StorageService: MockStorageService, _resetForTesting: vi.fn() }
})

describe('Security — CSP and Sandbox', () => {
  beforeEach(() => {
    vi.resetModules()
    capturedCspCallback = null
    capturedWillNavigate = null
    mockBrowserWindowConstructor.mockClear()
    mockOnHeadersReceived.mockClear()
    mockWebContentsOn.mockClear()
    mockOn.mockClear()
    mockOnce.mockClear()
    mockAppOn.mockClear()
    mockAppWhenReady.mockClear().mockReturnValue(Promise.resolve())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('BrowserWindow sandbox', () => {
    it('should enable sandbox: true in webPreferences', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const options = mockBrowserWindowConstructor.mock.calls[0][0]
      expect(options.webPreferences.sandbox).toBe(true)
    })
  })

  describe('Content Security Policy', () => {
    it('should register CSP via session.defaultSession.webRequest.onHeadersReceived', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      expect(mockOnHeadersReceived).toHaveBeenCalledOnce()
      expect(capturedCspCallback).toBeTypeOf('function')
    })

    it('should inject Content-Security-Policy header into responses', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      expect(capturedCspCallback).not.toBeNull()

      let result: { responseHeaders?: Record<string, string[]> } | undefined
      capturedCspCallback!(
        { responseHeaders: { 'X-Existing': ['value'] } },
        (r) => { result = r },
      )

      expect(result).toBeDefined()
      expect(result!.responseHeaders!['Content-Security-Policy']).toBeDefined()
      expect(result!.responseHeaders!['Content-Security-Policy']![0]).toContain("default-src 'self'")
      expect(result!.responseHeaders!['Content-Security-Policy']![0]).toContain("script-src 'self'")
      // Existing headers should be preserved
      expect(result!.responseHeaders!['X-Existing']).toEqual(['value'])
    })

    it('should not allow unsafe-eval in CSP', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      let result: { responseHeaders?: Record<string, string[]> } | undefined
      capturedCspCallback!(
        { responseHeaders: {} },
        (r) => { result = r },
      )

      const csp = result!.responseHeaders!['Content-Security-Policy']![0]
      expect(csp).not.toContain('unsafe-eval')
    })

    it('should include style-src with unsafe-inline for component styling', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      let result: { responseHeaders?: Record<string, string[]> } | undefined
      capturedCspCallback!(
        { responseHeaders: {} },
        (r) => { result = r },
      )

      const csp = result!.responseHeaders!['Content-Security-Policy']![0]
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    })

    it('should include img-src with data: for inline images', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      let result: { responseHeaders?: Record<string, string[]> } | undefined
      capturedCspCallback!(
        { responseHeaders: {} },
        (r) => { result = r },
      )

      const csp = result!.responseHeaders!['Content-Security-Policy']![0]
      expect(csp).toContain('img-src')
      expect(csp).toContain('data:')
    })
  })

  describe('Navigation restrictions', () => {
    it('should register will-navigate handler on webContents', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      expect(mockWebContentsOn).toHaveBeenCalledWith('will-navigate', expect.any(Function))
      expect(capturedWillNavigate).toBeTypeOf('function')
    })

    it('should block navigation to external URLs', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const preventDefault = vi.fn()
      capturedWillNavigate!({ preventDefault }, 'https://evil.com/phishing')
      expect(preventDefault).toHaveBeenCalled()
    })

    it('should allow navigation to file:// in production mode', async () => {
      await import('../../src/main/index')
      await new Promise((r) => setTimeout(r, 0))

      const preventDefault = vi.fn()
      capturedWillNavigate!({ preventDefault }, 'file:///app/renderer/index.html')
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })
})
