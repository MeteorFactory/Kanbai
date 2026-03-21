import { IpcMain, BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import path from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import { IS_WIN } from '../../shared/platform'
import { StorageService } from '../services/storage'
import { cleanupTerminals } from './terminal'
import { cleanupClaudeSessions } from './claude'
import { setAppUpdateInstalling } from '../services/appUpdateState'

const storage = new StorageService()

function getUpdaterCacheDir(): string {
  const appName = app.getName()
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Caches', `${appName}-updater`)
  }
  if (process.platform === 'win32') {
    return path.join(app.getPath('home'), 'AppData', 'Local', `${appName}-updater`)
  }
  return path.join(app.getPath('home'), '.cache', `${appName}-updater`)
}

function cleanUpdaterCache(): void {
  const cacheDir = getUpdaterCacheDir()
  try {
    if (!fs.existsSync(cacheDir)) return
    const entries = fs.readdirSync(cacheDir)
    for (const entry of entries) {
      const entryPath = path.join(cacheDir, entry)
      try {
        const stat = fs.statSync(entryPath)
        if (stat.isDirectory()) {
          fs.rmSync(entryPath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(entryPath)
        }
      } catch {
        // Ignore individual file deletion errors
      }
    }
    console.log('[appUpdate] Cleaned updater cache:', cacheDir)
  } catch {
    // Cache dir may not exist or be inaccessible — not critical
  }
}

type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'downloaded'
let updatePhase: UpdatePhase = 'idle'

function sendStatusToRenderer(
  status: string,
  data?: Record<string, unknown>,
): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(IPC_CHANNELS.APP_UPDATE_STATUS, { status, ...data })
  }
}

export function registerAppUpdateHandlers(ipcMain: IpcMain): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Clean leftover update cache from previous versions on startup
  cleanUpdaterCache()

  // Forward autoUpdater events to renderer
  autoUpdater.on('checking-for-update', () => {
    updatePhase = 'checking'
    sendStatusToRenderer('checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendStatusToRenderer('available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? '',
    })
  })

  autoUpdater.on('update-not-available', () => {
    updatePhase = 'idle'
    sendStatusToRenderer('not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    updatePhase = 'downloading'
    sendStatusToRenderer('downloading', {
      percent: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', () => {
    updatePhase = 'downloaded'
    sendStatusToRenderer('downloaded')
  })

  autoUpdater.on('error', (err) => {
    if (updatePhase === 'downloaded') {
      console.warn('[appUpdate] Ignoring late error after download completed:', err.message)
      return
    }
    updatePhase = 'idle'
    sendStatusToRenderer('error', { message: String(err.message ?? err) })
  })

  // IPC handlers
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_CHECK, async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, version: result?.updateInfo.version ?? null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_DOWNLOAD, async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_INSTALL, () => {
    // Use setTimeout instead of setImmediate so the IPC response is fully
    // transmitted to the renderer before the quit sequence starts.
    // setImmediate was unreliable in Electron's hybrid event loop on macOS.
    setTimeout(() => {
      // Kill all PTY processes and Claude sessions BEFORE the quit sequence.
      // node-pty uses a native ThreadSafeFunction (TSFN) on a background read
      // thread. If the app quits while a TSFN callback is still pending, the
      // callback fires during FreeEnvironment → uv_run and tries to throw a JS
      // exception into a dying V8 isolate → SIGABRT (T-39 crash).
      // By cleaning up here (not just in before-quit), we give the native
      // threads time to notice their fds are closed before the quit sequence.
      cleanupTerminals()
      cleanupClaudeSessions()

      // On Windows, signal the before-quit handler to let the quit proceed
      // normally so the NSIS installer can replace the app executable.
      // Without this, app.exit(0) short-circuits the installer → requires
      // manual reinstall (F-125).
      if (IS_WIN) {
        setAppUpdateInstalling()
      }

      // Allow native PTY read threads to detect closed fds and stop before
      // the quit sequence triggers FreeEnvironment.
      // On Windows ConPTY needs more time to tear down than Unix PTY (conpty.cc
      // runs ClosePseudoConsole in a background thread). Use 1000ms on Windows.
      const teardownDelay = IS_WIN ? 1000 : 300
      setTimeout(() => {
        try {
          autoUpdater.quitAndInstall(false, true)
        } catch (err) {
          console.error('[appUpdate] quitAndInstall failed:', err)
        }

        // Safety net: if quitAndInstall did not terminate the process
        // (e.g. install() returned false), force a relaunch + quit so
        // autoInstallOnAppQuit can apply the update on exit.
        setTimeout(() => {
          console.warn('[appUpdate] quitAndInstall did not exit — forcing relaunch')
          app.relaunch()
          app.quit()
        }, 3000)
      }, teardownDelay)
    }, 500)
  })

  // Auto-check on startup (5s delay)
  const settings = storage.getSettings()
  if (settings.checkUpdatesOnLaunch) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // Silently fail — expected in dev mode or without network
      })
    }, 5000)
  }
}
