import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-notif-test-${process.pid}-${Date.now()}`)

// Mock os.homedir to isolate filesystem operations
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: { ...actual, homedir: () => TEST_DIR },
    homedir: () => TEST_DIR,
  }
})

// Mock child_process.exec to capture sound playback calls
const mockExec = vi.fn()
vi.mock('child_process', () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}))

// Mock electron APIs
const mockNotificationInstance = { show: vi.fn(), on: vi.fn() }
const mockWindow = { isDestroyed: () => false, flashFrame: vi.fn() }
const mockBrowserWindow = {
  getFocusedWindow: vi.fn(),
  getAllWindows: vi.fn(() => [mockWindow]),
}
const mockApp = { dock: { setBadge: vi.fn() } }
vi.mock('electron', () => ({
  Notification: vi.fn(() => mockNotificationInstance),
  BrowserWindow: mockBrowserWindow,
  app: mockApp,
}))

// Mock StorageService singleton
const mockGetSettings = vi.fn()
vi.mock('../../src/main/services/storage', () => ({
  StorageService: vi.fn(() => ({
    getSettings: mockGetSettings,
  })),
}))

// Import after all mocks are set up
const {
  playBellRepeat,
  setDockBadge,
  clearDockBadge,
  sendSilentNotification,
  sendNotification,
} = await import('../../src/main/services/notificationService')

const { Notification } = await import('electron')

describe('notificationService', () => {
  const assetsDir = path.join(TEST_DIR, '.mirehub', 'assets')
  const bellWavPath = path.join(assetsDir, 'bell.wav')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
    vi.useFakeTimers()

    // Default settings: both sound and badge enabled
    mockGetSettings.mockReturnValue({
      notificationSound: true,
      notificationBadge: true,
    })

    // Clean up generated WAV between tests
    if (fs.existsSync(assetsDir)) {
      fs.rmSync(assetsDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    vi.useRealTimers()
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('playBellRepeat', () => {
    it('ne joue pas si notificationSound est desactive', () => {
      mockGetSettings.mockReturnValue({
        notificationSound: false,
        notificationBadge: true,
      })

      playBellRepeat(3)

      expect(mockExec).not.toHaveBeenCalled()
    })

    it('genere le fichier WAV si inexistant', () => {
      expect(fs.existsSync(bellWavPath)).toBe(false)

      playBellRepeat(1)

      expect(fs.existsSync(bellWavPath)).toBe(true)
      // Verify it is a valid WAV file (starts with RIFF header)
      const header = fs.readFileSync(bellWavPath).subarray(0, 4).toString('ascii')
      expect(header).toBe('RIFF')
    })

    it('appelle exec N fois via setTimeout pour jouer le son', () => {
      playBellRepeat(3, 200)

      // At t=0, first setTimeout fires
      vi.advanceTimersByTime(0)
      expect(mockExec).toHaveBeenCalledTimes(1)
      expect(mockExec.mock.calls[0]![0]).toContain('bell.wav')

      // At t=200, second setTimeout fires
      vi.advanceTimersByTime(200)
      expect(mockExec).toHaveBeenCalledTimes(2)

      // At t=400, third setTimeout fires
      vi.advanceTimersByTime(200)
      expect(mockExec).toHaveBeenCalledTimes(3)
    })

    it('utilise le delai par defaut de 300ms', () => {
      playBellRepeat(2)

      vi.advanceTimersByTime(0)
      expect(mockExec).toHaveBeenCalledTimes(1)

      // At 299ms, second call should not have fired yet
      vi.advanceTimersByTime(299)
      expect(mockExec).toHaveBeenCalledTimes(1)

      // At 300ms, second call fires
      vi.advanceTimersByTime(1)
      expect(mockExec).toHaveBeenCalledTimes(2)
    })

    it('ne regenere pas le WAV si deja present', () => {
      // First call generates the WAV
      playBellRepeat(1)
      vi.advanceTimersByTime(0)
      const firstStat = fs.statSync(bellWavPath)

      // Second call should reuse the existing file
      playBellRepeat(1)
      vi.advanceTimersByTime(0)
      const secondStat = fs.statSync(bellWavPath)

      expect(firstStat.mtimeMs).toBe(secondStat.mtimeMs)
    })
  })

  describe('setDockBadge', () => {
    it('ne fait rien si notificationBadge est desactive', () => {
      mockGetSettings.mockReturnValue({
        notificationSound: true,
        notificationBadge: false,
      })

      setDockBadge()

      expect(mockApp.dock.setBadge).not.toHaveBeenCalled()
    })

    it('met le badge "!" si pas de fenetre focusee', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue(null)

      setDockBadge()

      expect(mockApp.dock.setBadge).toHaveBeenCalledWith('!')
    })

    it('ne met pas le badge si une fenetre est focusee', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue({ id: 1 })

      setDockBadge()

      expect(mockApp.dock.setBadge).not.toHaveBeenCalled()
    })
  })

  describe('clearDockBadge', () => {
    it('remet le badge a vide', () => {
      clearDockBadge()

      expect(mockApp.dock.setBadge).toHaveBeenCalledWith('')
    })
  })

  describe('sendSilentNotification', () => {
    it('cree une Notification avec silent: true', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue(null)

      sendSilentNotification('Titre Test', 'Corps du message')

      expect(Notification).toHaveBeenCalledWith({
        title: 'Titre Test',
        body: 'Corps du message',
        silent: true,
      })
    })

    it('appelle show() sur la notification', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue(null)

      sendSilentNotification('Titre', 'Corps')

      expect(mockNotificationInstance.show).toHaveBeenCalledOnce()
    })

    it('met le badge dock via setDockBadge', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue(null)

      sendSilentNotification('Titre', 'Corps')

      expect(mockApp.dock.setBadge).toHaveBeenCalledWith('!')
    })

    it('ne met pas le badge si la fenetre est focusee', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue({ id: 1 })

      sendSilentNotification('Titre', 'Corps')

      // Notification is still created and shown
      expect(mockNotificationInstance.show).toHaveBeenCalledOnce()
      // But badge is not set because window is focused
      expect(mockApp.dock.setBadge).not.toHaveBeenCalled()
    })
  })

  describe('sendNotification', () => {
    it('appelle sendSilentNotification (Notification + badge)', () => {
      mockBrowserWindow.getFocusedWindow.mockReturnValue(null)

      sendNotification('Alerte', 'Message important')

      // Notification was created with correct params
      expect(Notification).toHaveBeenCalledWith({
        title: 'Alerte',
        body: 'Message important',
        silent: true,
      })
      expect(mockNotificationInstance.show).toHaveBeenCalledOnce()
      expect(mockApp.dock.setBadge).toHaveBeenCalledWith('!')
    })

    it('joue le son via playBellSound', () => {
      sendNotification('Titre', 'Corps')

      // playBellSound calls exec to play the sound
      expect(mockExec).toHaveBeenCalledTimes(1)
      expect(mockExec.mock.calls[0]![0]).toContain('bell.wav')
    })

    it('ne joue pas le son si notificationSound est desactive', () => {
      mockGetSettings.mockReturnValue({
        notificationSound: false,
        notificationBadge: true,
      })
      mockBrowserWindow.getFocusedWindow.mockReturnValue(null)

      sendNotification('Titre', 'Corps')

      // Notification is still sent
      expect(mockNotificationInstance.show).toHaveBeenCalledOnce()
      // But no sound played
      expect(mockExec).not.toHaveBeenCalled()
    })

    it('genere le WAV avant de jouer le son', () => {
      expect(fs.existsSync(bellWavPath)).toBe(false)

      sendNotification('Titre', 'Corps')

      // WAV was generated as a side effect
      expect(fs.existsSync(bellWavPath)).toBe(true)
    })
  })
})
