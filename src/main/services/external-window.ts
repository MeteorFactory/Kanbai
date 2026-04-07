import { BrowserWindow } from 'electron'
import path from 'path'
import { IS_MAC, IS_WIN } from '../../shared/platform'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

const externalWindows = new Map<string, BrowserWindow>()

export function openExternalWindow(workspaceId: string, workspaceName: string): void {
  const existing = externalWindows.get(workspaceId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: `${workspaceName} — Kanbai`,
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

  const params = `?mode=external&workspaceId=${encodeURIComponent(workspaceId)}`
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(`${VITE_DEV_SERVER_URL}${params}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      search: params.slice(1),
    })
  }

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

  win.on('closed', () => {
    externalWindows.delete(workspaceId)
  })

  externalWindows.set(workspaceId, win)
}

export function closeExternalWindow(workspaceId: string): void {
  const win = externalWindows.get(workspaceId)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  externalWindows.delete(workspaceId)
}

export function isExternalWindowOpen(workspaceId: string): boolean {
  const win = externalWindows.get(workspaceId)
  return !!win && !win.isDestroyed()
}

export function closeAllExternalWindows(): void {
  for (const [id, win] of externalWindows) {
    if (!win.isDestroyed()) {
      win.close()
    }
    externalWindows.delete(id)
  }
}
