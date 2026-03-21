import { app, BrowserWindow, ipcMain, globalShortcut, protocol, net, session } from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { resolveLoginShellPath } from './services/shell-path'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerWorkspaceHandlers } from './ipc/workspace'
import { registerProjectHandlers } from './ipc/project'
import { registerAppHandlers } from './ipc/app'
import { registerClaudeHandlers, cleanupClaudeSessions } from './ipc/claude'
import { registerKanbanHandlers } from './ipc/kanban'
import { registerUpdateHandlers } from './ipc/updates'
import { registerFilesystemHandlers } from './ipc/filesystem'
import { registerGitHandlers } from './ipc/git'
import { registerSessionHandlers } from './ipc/session'
import { registerWorkspaceEnvHandlers } from './ipc/workspaceEnv'
import { registerClaudeDefaultsHandlers } from './ipc/claudeDefaults'
import { registerApiHandlers } from './ipc/api'
import { registerDatabaseHandlers } from './ipc/database'
import { registerAppUpdateHandlers } from './ipc/appUpdate'
import { registerMcpHandlers } from './ipc/mcp'
import { registerSshHandlers } from './ipc/ssh'
import { registerAnalysisHandlers } from './ipc/analysis'
import { registerPackagesHandlers } from './ipc/packages'
import { registerNamespaceHandlers } from './ipc/namespace'
import { registerGitConfigHandlers } from './ipc/gitConfig'
import { registerClaudeMemoryHandlers } from './ipc/claudeMemory'
import { registerHealthCheckHandlers } from './ipc/healthcheck'
import { registerCodexConfigHandlers } from './ipc/codexConfig'
import { registerCopilotConfigHandlers } from './ipc/copilotConfig'
import { registerCompanionHandlers, initDevCompanion, tryReconnectCompanion, cleanupCompanion } from './ipc/companion'
import { registerGeminiConfigHandlers } from './ipc/geminiConfig'
import { registerAiProviderHandlers } from './ipc/aiProvider'
import { registerPixelAgentsHandlers, shutdownPixelAgentsService } from './ipc/pixel-agents'
import { registerDevOpsHandlers } from './ipc/devops'
import { registerNotesHandlers } from './ipc/notes'
import { initCompanionFeatures } from './companion'
import { registerSkillsStoreHandlers, prefetchSkillsStore } from './ipc/skillsStore'
import { cleanupTerminals } from './ipc/terminal'
import { ensureActivityHookScript, ensureAutoApproveScript, ensureKanbanDoneScript, ensurePixelAgentsHookScript, syncAllWorkspaceEnvHooks, startActivityWatcher } from './services/activityHooks'
import { clearDockBadge } from './services/notificationService'
import { healthCheckScheduler } from './services/healthCheckScheduler'
import { databaseService } from './services/database'
import { StorageService } from './services/storage'
import { buildApplicationMenu, initMenu } from './menu'
import { readKanbanTasks, maybeCreateMemoryRefactorTicket } from '../mcp-server/lib/kanban-store'
import { IS_MAC, IS_WIN, getExtendedToolPaths } from '../shared/platform'
import { isAppUpdateInstalling } from './services/appUpdateState'

// Fix PATH for packaged app — Electron bundles inherit a minimal PATH which
// prevents finding user-installed tools (node, npm, claude, brew, cargo, etc.).
if (process.platform === 'darwin') {
  // macOS: resolve the real PATH by asking the user's login shell.
  try {
    const shellPath = resolveLoginShellPath(process.env.SHELL)
    if (shellPath) {
      process.env.PATH = shellPath
    }
  } catch {
    // Fallback: extend with common macOS binary locations
    const extra = getExtendedToolPaths()
    process.env.PATH = `${extra.join(':')}:${process.env.PATH ?? ''}`
  }
} else if (process.platform === 'win32') {
  // Windows: prepend common tool locations so packaged builds can find them
  const extra = getExtendedToolPaths()
  process.env.PATH = `${extra.join(';')};${process.env.PATH ?? ''}`
}

// Set the app name for macOS menu bar (overrides default "Electron" in dev mode)
app.name = 'Kanbai'

// Register the pixel-agents custom scheme before app is ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'pixel-agents',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}])

// vite-plugin-electron sets VITE_DEV_SERVER_URL in dev mode
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    ...(IS_MAC
      ? {
          trafficLightPosition: { x: 15, y: 15 },
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    backgroundColor: IS_WIN ? '#1e1e1e' : '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // DevTools on Cmd+Alt+I only, not auto-open (avoids console spam)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('focus', () => {
    clearDockBadge()
  })

  win.on('closed', () => {
    mainWindow = null
  })

  // Security: block navigation away from the app origin
  const allowedOrigin = VITE_DEV_SERVER_URL
    ? new URL(VITE_DEV_SERVER_URL).origin
    : 'file://'
  win.webContents.on('will-navigate', (event, url) => {
    const targetOrigin = url.startsWith('file://') ? 'file://' : new URL(url).origin
    if (targetOrigin !== allowedOrigin) {
      event.preventDefault()
    }
  })

  return win
}

app.whenReady().then(() => {
  // Content Security Policy — strict by default, relaxed for Vite dev server
  const cspDirectives = VITE_DEV_SERVER_URL
    ? "default-src 'self' pixel-agents:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws:"
    : "default-src 'self' pixel-agents:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives],
      },
    })
  })

  // Register pixel-agents protocol handler
  protocol.handle('pixel-agents', (request) => {
    const url = new URL(request.url)
    const relativePath = url.pathname === '/' ? '/index.html' : url.pathname
    let basePath: string
    if (VITE_DEV_SERVER_URL) {
      basePath = path.join(__dirname, '../../vendor/pixel-agents/dist/webview')
    } else {
      // Prefer userData (runtime installs), fall back to bundled resources
      const userDataDist = path.join(app.getPath('userData'), 'pixel-agents')
      basePath = fs.existsSync(path.join(userDataDist, 'index.html'))
        ? userDataDist
        : path.join(process.resourcesPath, 'pixel-agents')
    }
    return net.fetch(pathToFileURL(path.join(basePath, relativePath)).toString())
  })

  mainWindow = createMainWindow()

  // Build application menu (cross-platform)
  initMenu(() => mainWindow)
  buildApplicationMenu()

  // Register IPC handlers
  registerTerminalHandlers(ipcMain)
  registerWorkspaceHandlers(ipcMain)
  registerProjectHandlers(ipcMain)
  registerAppHandlers(ipcMain)
  registerClaudeHandlers(ipcMain)
  registerKanbanHandlers(ipcMain)
  registerUpdateHandlers(ipcMain)
  registerFilesystemHandlers(ipcMain)
  registerGitHandlers(ipcMain)
  registerSessionHandlers(ipcMain)
  registerWorkspaceEnvHandlers(ipcMain)
  registerClaudeDefaultsHandlers(ipcMain)
  registerApiHandlers(ipcMain)
  registerDatabaseHandlers(ipcMain)
  registerAppUpdateHandlers(ipcMain)
  registerMcpHandlers(ipcMain)
  registerSshHandlers(ipcMain)
  registerNamespaceHandlers(ipcMain)
  registerGitConfigHandlers(ipcMain)
  registerAnalysisHandlers(ipcMain, () => mainWindow)
  registerPackagesHandlers(ipcMain)
  registerClaudeMemoryHandlers(ipcMain)
  registerHealthCheckHandlers(ipcMain)
  registerCodexConfigHandlers(ipcMain)
  registerCopilotConfigHandlers(ipcMain)
  registerGeminiConfigHandlers(ipcMain)
  registerSkillsStoreHandlers(ipcMain)
  prefetchSkillsStore()
  registerAiProviderHandlers(ipcMain)
  registerPixelAgentsHandlers(ipcMain, () => mainWindow)
  registerDevOpsHandlers(ipcMain)
  registerNotesHandlers(ipcMain)
  registerCompanionHandlers(ipcMain, () => mainWindow)
  initCompanionFeatures()
  tryReconnectCompanion(() => mainWindow)
  initDevCompanion(() => mainWindow)

  // Ensure a Default namespace exists (first launch or migration)
  new StorageService().ensureDefaultNamespace()

  // Ensure all hook scripts exist and sync hooks across all workspace envs
  ensureActivityHookScript()
  ensureAutoApproveScript()
  ensureKanbanDoneScript()
  ensurePixelAgentsHookScript()
  syncAllWorkspaceEnvHooks()
  startActivityWatcher()

  // Check if any workspace needs an AI memory refactor ticket (first run or milestone)
  try {
    const storage = new StorageService()
    for (const ws of storage.getWorkspaces()) {
      const tasks = readKanbanTasks(ws.id)
      if (tasks.length > 0) {
        maybeCreateMemoryRefactorTicket(ws.id, tasks)
      }
    }
  } catch {
    // Non-critical: skip if storage is unavailable (e.g. first launch)
  }

  // Auto-start health check schedulers for all projects with enabled checks
  try {
    const storage = new StorageService()
    const projects = storage.getProjects()
    const projectPaths = projects.map((p) => p.path)
    healthCheckScheduler.autoStartAll(projectPaths)
  } catch {
    // Non-critical: health checks will still work when manually started
  }

  // DevTools shortcut: Cmd+Alt+I
  globalShortcut.register('CommandOrControl+Alt+I', () => {
    mainWindow?.webContents.toggleDevTools()
  })

  app.on('activate', () => {
    clearDockBadge()
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Intercept the quit sequence to prevent the pty.node TSFN crash (T-39).
// node-pty's native read thread can queue a ThreadSafeFunction callback
// that fires during FreeEnvironment → uv_run after V8 starts dying,
// causing SIGABRT. By intercepting quit, doing cleanup, then calling
// app.exit(0) (which uses C exit() and skips FreeEnvironment), we
// bypass the crash entirely.
//
// On Windows during app update install, we must NOT intercept the quit:
// quitAndInstall launches the NSIS installer then quits the app. If we
// call app.exit(0) instead of letting the normal quit proceed, the NSIS
// installer cannot replace the locked executable — requiring a manual
// reinstall. The appUpdate handler already performs PTY cleanup before
// calling quitAndInstall, so the TSFN crash is avoided.
let isExiting = false

app.on('before-quit', (event) => {
  if (isExiting) return

  // During app update install on Windows, let the quit proceed normally
  // so the NSIS installer can replace the app files.
  if (isAppUpdateInstalling() && IS_WIN) {
    cleanupTerminals()
    cleanupClaudeSessions()
    cleanupCompanion()
    databaseService.disconnectAll()
    shutdownPixelAgentsService()
    healthCheckScheduler.stopAll()
    return
  }

  event.preventDefault()
  isExiting = true

  cleanupTerminals()
  cleanupClaudeSessions()
  cleanupCompanion()
  databaseService.disconnectAll()
  shutdownPixelAgentsService()
  healthCheckScheduler.stopAll()

  // Give native PTY read threads time to detect closed fds, then
  // force-exit via app.exit() which skips FreeEnvironment/uv_run.
  setTimeout(() => app.exit(0), 300)
})

// Security: prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })
})
