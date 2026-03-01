import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { app, BrowserWindow, Notification } from 'electron'
import { StorageService } from './storage'
import { IS_WIN, getPlaySoundCommand } from '../../shared/platform'

const ASSETS_DIR = path.join(os.homedir(), '.mirehub', 'assets')
const BELL_WAV_PATH = path.join(ASSETS_DIR, 'bell.wav')

const storage = new StorageService()
let bellSoundReady = false

/**
 * Generates a bicycle bell WAV file programmatically.
 * Sine 880Hz + harmonics 2217Hz/3520Hz with exponential decay.
 */
function ensureBellSound(): void {
  if (bellSoundReady && fs.existsSync(BELL_WAV_PATH)) return

  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true })
  }

  const sampleRate = 44100
  const duration = 0.6 // seconds
  const numSamples = Math.floor(sampleRate * duration)
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = numSamples * blockAlign

  // WAV header (44 bytes)
  const buffer = Buffer.alloc(44 + dataSize)
  let offset = 0

  // RIFF header
  buffer.write('RIFF', offset); offset += 4
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4
  buffer.write('WAVE', offset); offset += 4

  // fmt chunk
  buffer.write('fmt ', offset); offset += 4
  buffer.writeUInt32LE(16, offset); offset += 4 // chunk size
  buffer.writeUInt16LE(1, offset); offset += 2  // PCM
  buffer.writeUInt16LE(numChannels, offset); offset += 2
  buffer.writeUInt32LE(sampleRate, offset); offset += 4
  buffer.writeUInt32LE(byteRate, offset); offset += 4
  buffer.writeUInt16LE(blockAlign, offset); offset += 2
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2

  // data chunk
  buffer.write('data', offset); offset += 4
  buffer.writeUInt32LE(dataSize, offset); offset += 4

  // Generate bicycle bell sound: fundamental + harmonics with decay
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const decay = Math.exp(-t * 8)

    // Fundamental 880Hz + harmonics for metallic bell character
    const sample =
      0.5 * Math.sin(2 * Math.PI * 880 * t) +
      0.3 * Math.sin(2 * Math.PI * 2217 * t) +
      0.2 * Math.sin(2 * Math.PI * 3520 * t)

    const value = Math.max(-1, Math.min(1, sample * decay * 0.8))
    buffer.writeInt16LE(Math.floor(value * 32767), offset)
    offset += 2
  }

  fs.writeFileSync(BELL_WAV_PATH, buffer)
  bellSoundReady = true
}

/**
 * Plays the bell sound via afplay (non-blocking). Respects notificationSound setting.
 */
function playBellSound(): void {
  const settings = storage.getSettings()
  if (!settings.notificationSound) return

  ensureBellSound()
  exec(getPlaySoundCommand(BELL_WAV_PATH), () => { /* fire and forget */ })
}

/**
 * Plays the bell sound multiple times with a delay between each.
 * Used for waiting (2x) and failed (4x) notifications.
 */
export function playBellRepeat(count: number, delayMs = 300): void {
  const settings = storage.getSettings()
  if (!settings.notificationSound) return

  ensureBellSound()
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      exec(getPlaySoundCommand(BELL_WAV_PATH), () => { /* fire and forget */ })
    }, i * delayMs)
  }
}

/**
 * Sets "!" badge on dock icon if the window is not focused.
 * Respects notificationBadge setting.
 */
export function setDockBadge(): void {
  const settings = storage.getSettings()
  if (!settings.notificationBadge) return

  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (!focusedWindow) {
    app.dock?.setBadge('!')
    if (IS_WIN) {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) win.flashFrame(true)
      }
    }
  }
}

/**
 * Clears the dock badge.
 */
export function clearDockBadge(): void {
  app.dock?.setBadge('')
  if (IS_WIN) {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) win.flashFrame(false)
    }
  }
}

/**
 * Sends a silent native notification + sets dock badge (no sound).
 */
export function sendSilentNotification(title: string, body: string): void {
  const notification = new Notification({
    title,
    body,
    silent: true,
  })
  notification.show()
  setDockBadge()
}

/**
 * Unified notification entry point.
 * Sends a silent native notification + plays bell sound + sets dock badge.
 */
export function sendNotification(title: string, body: string): void {
  sendSilentNotification(title, body)
  playBellSound()
}
