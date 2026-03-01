import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'
import { DEFAULT_SETTINGS } from '../../src/shared/constants/defaults'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-app-ipc-test-${process.pid}-${Date.now()}`)
const dataDir = path.join(TEST_DIR, '.mirehub')

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

// Mock Electron's Notification and BrowserWindow (used by notificationService)
vi.mock('electron', () => {
  class MockNotification {
    show() {}
  }
  return {
    Notification: MockNotification,
    BrowserWindow: {
      getFocusedWindow: () => null,
      getAllWindows: () => [],
    },
    app: { dock: { setBadge: vi.fn() } },
    IpcMain: vi.fn(),
  }
})

describe('App IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    const { registerAppHandlers } = await import('../../src/main/ipc/app')

    mockIpcMain = createMockIpcMain()
    registerAppHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les handlers settings et notification', () => {
    expect(mockIpcMain._handlers.has('app:settingsGet')).toBe(true)
    expect(mockIpcMain._handlers.has('app:settingsSet')).toBe(true)
    expect(mockIpcMain._listeners.has('app:notification')).toBe(true)
  })

  it('retourne les parametres par defaut', async () => {
    const settings = await mockIpcMain._invoke('app:settingsGet')
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('met a jour les parametres partiellement', async () => {
    const updated = await mockIpcMain._invoke('app:settingsSet', { theme: 'light', fontSize: 18 })

    expect(updated.theme).toBe('light')
    expect(updated.fontSize).toBe(18)
    // Other settings should remain default
    expect(updated.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily)
    expect(updated.scrollbackLines).toBe(DEFAULT_SETTINGS.scrollbackLines)
  })

  it('persiste les parametres entre les appels', async () => {
    await mockIpcMain._invoke('app:settingsSet', { theme: 'light' })
    const settings = await mockIpcMain._invoke('app:settingsGet')

    expect(settings.theme).toBe('light')
  })

  it('gere les notifications via listener (non handler)', () => {
    // Notification uses ipcMain.on, not .handle
    expect(mockIpcMain._listeners.has('app:notification')).toBe(true)
    // Calling it should not throw
    expect(() => {
      mockIpcMain._emit('app:notification', { title: 'Test', body: 'Hello' })
    }).not.toThrow()
  })
})
