import { IpcMain, BrowserWindow } from 'electron'
import { spawn, IPty } from 'node-pty'
import { v4 as uuid } from 'uuid'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { IPC_CHANNELS } from '../../shared/types'
import { IS_WIN, getDefaultShell, getDefaultShellArgs, killProcess, isShellValid, normalizeWindowsShell } from '../../shared/platform'

const execFileAsync = promisify(execFile)
import { StorageService } from '../services/storage'
import { getGitProfileEnvForWorkspace } from './git'
import { bumpCompanionChangeVersion } from '../services/companion-server'

interface ManagedTerminal {
  id: string
  pty: IPty
  cwd: string
  workspaceId: string | null
  tabId: string | null
  label: string | null
  taskId: string | null
  ticketNumber: string | null
  createdAt: number
  lastActivity: number
  disposables: Array<{ dispose(): void }>
}

/** Threshold in ms — terminal is considered "working" if it received output within this window */
const ACTIVITY_THRESHOLD_MS = 5000

/** Interval for periodic session file persistence (keeps KanbaiApi data fresh) */
let sessionPersistInterval: ReturnType<typeof setInterval> | null = null
const SESSION_PERSIST_INTERVAL_MS = 3000

/** Exported terminal session info for the companion API */
export interface TerminalSessionInfo {
  id: string
  cwd: string
  workspaceId: string | null
  tabId: string | null
  taskId: string | null
  ticketNumber: string | null
  title: string
  status: 'working' | 'idle' | 'done' | 'failed'
  createdAt: number
}

const terminals = new Map<string, ManagedTerminal>()

/** Finished sessions kept for companion/mobile visibility */
const MAX_FINISHED_SESSIONS = 50
const finishedSessions: TerminalSessionInfo[] = []

/** Output buffers preserved for finished sessions so mobile can still read them */
const finishedOutputBuffers = new Map<string, string>()

/** Pending task info for tabs not yet created (resolves race condition with setTaskInfo arriving before terminal:create) */
const pendingTaskInfo = new Map<string, { taskId: string; ticketNumber: string }>()

function addFinishedSession(info: TerminalSessionInfo): void {
  // Preserve the output buffer before it gets deleted from the live map
  const output = outputBuffers.get(info.id)
  if (output) {
    finishedOutputBuffers.set(info.id, output)
  }

  finishedSessions.push(info)
  if (finishedSessions.length > MAX_FINISHED_SESSIONS) {
    const removed = finishedSessions.splice(0, finishedSessions.length - MAX_FINISHED_SESSIONS)
    // Clean up output buffers for evicted sessions
    for (const s of removed) {
      finishedOutputBuffers.delete(s.id)
    }
  }
}

/**
 * Tab metadata synced from the renderer store.
 * Tabs may outlive their PTY sessions (e.g. process exited but tab stays open).
 * This allows the companion/mobile app to see ALL open tabs, not just live PTY sessions.
 */
interface SyncedTab {
  id: string
  label: string
  workspaceId: string
  hasLiveSession: boolean
}
const syncedTabs = new Map<string, SyncedTab>()

/**
 * Ring buffer per terminal — stores the last OUTPUT_BUFFER_MAX_SIZE bytes of
 * PTY output so the companion app can display recent terminal content.
 */
const OUTPUT_BUFFER_MAX_SIZE = 64 * 1024 // 64 KB per session
const outputBuffers = new Map<string, string>()

/**
 * Pending input commands written by external processes (KanbaiApi relay).
 * The Desktop app polls this file and feeds data to the matching PTY.
 */
const INPUT_QUEUE_PATH = path.join(os.homedir(), '.kanbai', 'terminal-input-queue.json')
const CLOSE_QUEUE_PATH = path.join(os.homedir(), '.kanbai', 'terminal-close-queue.json')
const CREATE_QUEUE_PATH = path.join(os.homedir(), '.kanbai', 'terminal-create-queue.json')
const OUTPUT_DIR = path.join(os.homedir(), '.kanbai', 'terminal-output')

/**
 * Dispose listeners BEFORE killing the pty process.
 * This prevents native callbacks from firing into a dying JS context (SIGABRT).
 *
 * On macOS/Linux we use process.kill(pid, 'SIGKILL') so the child exits
 * immediately — minimising the window where node-pty's native read thread
 * can queue a ThreadSafeFunction callback into a shutting-down V8 isolate.
 *
 * On Windows we must use pty.kill() because ConPTY requires proper handle
 * cleanup via ClosePseudoConsole. Calling process.kill(pid) only terminates
 * the child shell but leaves the ConPTY baton alive — when the native read
 * thread later calls remove_pty_baton() the assertion fails (conpty.cc:106).
 */
function disposeTerminal(terminal: ManagedTerminal): void {
  for (const d of terminal.disposables) {
    d.dispose()
  }
  terminal.disposables.length = 0
  if (IS_WIN) {
    try {
      terminal.pty.kill()
    } catch {
      // PTY already exited
    }
  } else {
    killProcess(terminal.pty.pid, 'SIGKILL')
  }
}

/**
 * Ensure a custom ZDOTDIR with a .zshenv and .zshrc that properly
 * initialise the shell environment. This handles two issues:
 *
 * 1. When launched from Finder, process.env.PATH is minimal
 *    (/usr/bin:/bin:/usr/sbin:/sbin). We source /etc/zprofile and
 *    ~/.zprofile in .zshenv so path_helper and user PATH additions
 *    are available (claude, eza, brew tools, etc.).
 *
 * 2. compinit must be loaded BEFORE the user's .zshrc to prevent
 *    "command not found: compdef" errors.
 */
function ensureZshWrapper(): string {
  const shellDir = path.join(os.homedir(), '.kanbai', 'shell')
  if (!fs.existsSync(shellDir)) {
    fs.mkdirSync(shellDir, { recursive: true })
  }

  // .zshenv runs first (before .zshrc) — set up PATH here
  const zshenvContent = [
    '# Source system and user profile for PATH setup (critical when launched from Finder)',
    '[ -f /etc/zprofile ] && source /etc/zprofile',
    '[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"',
  ].join('\n')

  const zshenvPath = path.join(shellDir, '.zshenv')
  if (!fs.existsSync(zshenvPath) || fs.readFileSync(zshenvPath, 'utf-8') !== zshenvContent) {
    fs.writeFileSync(zshenvPath, zshenvContent, 'utf-8')
  }

  // .zshrc — compinit + user config
  const zshrcContent = [
    'autoload -Uz compinit && compinit -C',
    'ZDOTDIR="$HOME"',
    '[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"',
  ].join('\n')

  const zshrcPath = path.join(shellDir, '.zshrc')
  if (!fs.existsSync(zshrcPath) || fs.readFileSync(zshrcPath, 'utf-8') !== zshrcContent) {
    fs.writeFileSync(zshrcPath, zshrcContent, 'utf-8')
  }

  return shellDir
}

export function getTerminalSessions(): Array<{ id: string; cwd: string }> {
  return Array.from(terminals.values()).map((t) => ({ id: t.id, cwd: t.cwd }))
}

/** Return enriched terminal session info for the companion feature */
export function getTerminalSessionsInfo(): TerminalSessionInfo[] {
  const now = Date.now()

  // Live PTY sessions
  const liveTabIds = new Set<string>()
  const liveEntries = Array.from(terminals.values()).map((t) => {
    if (t.tabId) liveTabIds.add(t.tabId)
    return {
      id: t.id,
      cwd: t.cwd,
      workspaceId: t.workspaceId,
      tabId: t.tabId,
      taskId: t.taskId,
      ticketNumber: t.ticketNumber,
      title: t.label || path.basename(t.cwd) || 'Terminal',
      status: (now - t.lastActivity < ACTIVITY_THRESHOLD_MS ? 'working' : 'idle') as 'working' | 'idle',
      createdAt: t.createdAt,
    }
  })

  // Build a lookup of finished sessions by tabId for orphan tab status resolution
  const finishedByTab = new Map<string, TerminalSessionInfo>()
  for (const fs of finishedSessions) {
    if (fs.tabId) finishedByTab.set(fs.tabId, fs)
  }

  // Tabs without live PTY sessions (process exited but tab still open)
  const orphanTabEntries: TerminalSessionInfo[] = []
  const orphanTabIds = new Set<string>()
  for (const tab of syncedTabs.values()) {
    if (!liveTabIds.has(tab.id)) {
      orphanTabIds.add(tab.id)
      const finished = finishedByTab.get(tab.id)
      orphanTabEntries.push({
        id: finished?.id ?? `tab-placeholder-${tab.id}`,
        cwd: finished?.cwd ?? '',
        workspaceId: tab.workspaceId,
        tabId: tab.id,
        taskId: finished?.taskId ?? null,
        ticketNumber: finished?.ticketNumber ?? null,
        title: tab.label,
        status: finished?.status ?? 'idle',
        createdAt: finished?.createdAt ?? now,
      })
    }
  }

  // Finished sessions without a tab or whose tab is no longer tracked
  const allTabIds = new Set([...liveTabIds, ...orphanTabIds])
  const finishedEntries = finishedSessions.filter((s) => !s.tabId || !allTabIds.has(s.tabId))

  return [...liveEntries, ...orphanTabEntries, ...finishedEntries]
}

/** Persist current terminal sessions to ~/.kanbai/terminal-sessions.json for the companion API */
function persistTerminalSessions(): void {
  const sessions = getTerminalSessionsInfo()
  const filePath = path.join(os.homedir(), '.kanbai', 'terminal-sessions.json')
  try {
    fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8')
  } catch {
    // Best-effort — companion may not be active
  }
}

/** Sync tab metadata from the renderer store */
function syncTabs(tabs: Array<{ id: string; label: string; workspaceId: string }>): void {
  syncedTabs.clear()
  for (const tab of tabs) {
    syncedTabs.set(tab.id, { ...tab, hasLiveSession: false })
  }
  persistTerminalSessions()
}

/** Update the label for a terminal session (called from renderer via IPC) */
export function updateTerminalLabel(sessionId: string, label: string): void {
  const terminal = terminals.get(sessionId)
  if (terminal) {
    terminal.label = label
    persistTerminalSessions()
  }
}

/** Link a terminal session to a kanban task (called from renderer after tab creation) */
export function setTerminalTaskInfo(tabId: string, taskId: string, ticketNumber: string): void {
  for (const terminal of terminals.values()) {
    if (terminal.tabId === tabId) {
      terminal.taskId = taskId
      terminal.ticketNumber = ticketNumber
      persistTerminalSessions()
      bumpCompanionChangeVersion()
      return
    }
  }
  // Terminal not yet created — queue the info so it can be applied when the terminal is spawned
  pendingTaskInfo.set(tabId, { taskId, ticketNumber })
}

/** Return buffered output for a terminal session (checks finished buffers too) */
export function getTerminalOutput(sessionId: string): string {
  return outputBuffers.get(sessionId) ?? finishedOutputBuffers.get(sessionId) ?? ''
}

/**
 * Return an HTML rendering of terminal output with ANSI colors preserved.
 * Also checks finished session buffers so mobile can view output of terminated sessions.
 */
export function getTerminalOutputClean(sessionId: string): string {
  const raw = outputBuffers.get(sessionId) ?? finishedOutputBuffers.get(sessionId) ?? ''
  if (!raw) return ''
  return renderTerminalToHtml(raw)
}

/**
 * Close/kill a terminal session from the companion API.
 * For live PTY sessions: kills the process and cleans up.
 * For finished sessions: removes from the finished list and cleans output buffer.
 * Returns true if the session was found and removed.
 */
export function closeTerminalSession(sessionId: string): boolean {
  // Resolve the tabId from the session so we can close the entire tab group
  let targetTabId: string | null = null
  let found = false

  // Check live sessions first
  const liveSession = terminals.get(sessionId)
  if (liveSession) {
    targetTabId = liveSession.tabId
    found = true
  }

  // Check finished sessions if not found live
  if (!found) {
    const finished = finishedSessions.find((s) => s.id === sessionId)
    if (finished) {
      targetTabId = finished.tabId
      found = true
    }
  }

  if (!found) return false

  // Close ALL live sessions sharing this tabId (or just the single session if no tabId)
  const sessionsToClose = targetTabId
    ? Array.from(terminals.entries()).filter(([, t]) => t.tabId === targetTabId)
    : liveSession ? [[sessionId, liveSession] as const] : []

  for (const [id, terminal] of sessionsToClose) {
    disposeTerminal(terminal as ManagedTerminal)
    terminals.delete(id as string)
    outputBuffers.delete(id as string)
    // Notify renderer for each closed session
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.TERMINAL_CLOSE, { id, exitCode: 0, signal: 0 })
        }
      } catch { /* window destroyed */ }
    }
  }

  // Remove all finished sessions with the same tabId
  if (targetTabId) {
    for (let i = finishedSessions.length - 1; i >= 0; i--) {
      if (finishedSessions[i]!.tabId === targetTabId) {
        finishedOutputBuffers.delete(finishedSessions[i]!.id)
        finishedSessions.splice(i, 1)
      }
    }
  } else {
    // No tabId — remove the specific finished session
    const idx = finishedSessions.findIndex((s) => s.id === sessionId)
    if (idx !== -1) {
      finishedOutputBuffers.delete(sessionId)
      finishedSessions.splice(idx, 1)
    }
  }

  // Also remove the synced tab so it disappears from the renderer
  if (targetTabId) {
    syncedTabs.delete(targetTabId)
  }

  persistTerminalSessions()
  bumpCompanionChangeVersion()
  return true
}

// ANSI 8-color palette (SGR 30-37 foreground)
const ANSI_COLORS: Record<number, string> = {
  30: '#555', 31: '#f55', 32: '#5f5', 33: '#ff5',
  34: '#55f', 35: '#f5f', 36: '#5ff', 37: '#ccc',
  90: '#888', 91: '#f88', 92: '#8f8', 93: '#ff8',
  94: '#88f', 95: '#f8f', 96: '#8ff', 97: '#fff',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface Cell { ch: string; fg: string | null; bold: boolean; dim: boolean }

/**
 * Virtual-terminal renderer with row+column tracking and ANSI color support.
 * Returns HTML with colored <span> elements.
 */
function renderTerminalToHtml(raw: string): string {
  const screen: Cell[][] = [[]]
  let row = 0
  let col = 0
  let curFg: string | null = null
  let curBold = false
  let curDim = false

  function ensureRow(r: number): void {
    while (screen.length <= r) screen.push([])
  }

  function makeCell(ch: string): Cell {
    return { ch, fg: curFg, bold: curBold, dim: curDim }
  }

  function writeChar(ch: string): void {
    ensureRow(row)
    const line = screen[row]!
    while (line.length <= col) line.push({ ch: ' ', fg: null, bold: false, dim: false })
    line[col] = makeCell(ch)
    col++
  }

  function parseSgr(params: string): void {
    const codes = params ? params.split(';').map(Number) : [0]
    let ci = 0
    while (ci < codes.length) {
      const c = codes[ci]!
      if (c === 0) { curFg = null; curBold = false; curDim = false }
      else if (c === 1) { curBold = true }
      else if (c === 2) { curDim = true }
      else if (c === 22) { curBold = false; curDim = false }
      else if (c === 39) { curFg = null }
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) { curFg = ANSI_COLORS[c] ?? null }
      else if (c === 38) {
        // Extended color: 38;5;N (256-color) or 38;2;R;G;B (truecolor)
        const mode = codes[ci + 1]
        if (mode === 5 && ci + 2 < codes.length) {
          const idx = codes[ci + 2]!
          if (idx < 8) curFg = ANSI_COLORS[30 + idx] ?? null
          else if (idx < 16) curFg = ANSI_COLORS[90 + idx - 8] ?? null
          else if (idx < 232) {
            // 216-color cube
            const n = idx - 16
            const r = Math.round((Math.floor(n / 36) % 6) * 51)
            const g = Math.round((Math.floor(n / 6) % 6) * 51)
            const b = Math.round((n % 6) * 51)
            curFg = `rgb(${r},${g},${b})`
          } else {
            // Grayscale ramp
            const v = (idx - 232) * 10 + 8
            curFg = `rgb(${v},${v},${v})`
          }
          ci += 2
        } else if (mode === 2 && ci + 4 < codes.length) {
          curFg = `rgb(${codes[ci + 2]},${codes[ci + 3]},${codes[ci + 4]})`
          ci += 4
        }
      }
      // Skip background (40-47, 48, 100-107) — not rendered on mobile
      ci++
    }
  }

  let i = 0
  while (i < raw.length) {
    const ch = raw[i] ?? ''

    if (ch === '\x1b') {
      const next = raw[i + 1]

      if (next === '[') {
        const match = raw.slice(i).match(/^\x1b\[([?>]?)([0-9;]*)([@A-Za-z])/)
        if (match) {
          i += match[0].length
          const prefix = match[1] ?? ''
          const params = match[2] ?? ''
          const code = match[3] ?? ''

          // SGR (Select Graphic Rendition) — colors and styles
          if (code === 'm' && !prefix) { parseSgr(params); continue }

          // Cursor and erase — same as before
          if (code === 'H' || code === 'f') {
            const parts = params.split(';')
            row = Math.max(0, parseInt(parts[0] || '1', 10) - 1)
            col = Math.max(0, parseInt(parts[1] || '1', 10) - 1)
            ensureRow(row)
          } else if (code === 'A') { row = Math.max(0, row - (parseInt(params || '1', 10))) }
          else if (code === 'B') { row += parseInt(params || '1', 10); ensureRow(row) }
          else if (code === 'C') { col += parseInt(params || '1', 10) }
          else if (code === 'D') { col = Math.max(0, col - (parseInt(params || '1', 10))) }
          else if (code === 'G') { col = Math.max(0, parseInt(params || '1', 10) - 1) }
          else if (code === 'J') {
            const n = parseInt(params || '0', 10)
            if (n === 2 || n === 3) { screen.length = 0; screen.push([]); row = 0; col = 0 }
            else if (n === 0) { ensureRow(row); screen[row]!.length = col; screen.length = row + 1 }
          } else if (code === 'K') {
            const n = parseInt(params || '0', 10)
            ensureRow(row)
            const line = screen[row]!
            if (n === 0) line.length = col
            else if (n === 1) { for (let c = 0; c <= col && c < line.length; c++) line[c] = { ch: ' ', fg: null, bold: false, dim: false } }
            else if (n === 2) { screen[row] = [] }
          }
          continue
        }
      }

      if (next === ']') {
        const oscEnd = raw.indexOf('\x07', i + 2)
        const oscEnd2 = raw.indexOf('\x1b\\', i + 2)
        let end = -1
        if (oscEnd >= 0 && oscEnd2 >= 0) end = Math.min(oscEnd, oscEnd2)
        else if (oscEnd >= 0) end = oscEnd
        else if (oscEnd2 >= 0) end = oscEnd2
        if (end >= 0) { i = end + (raw[end] === '\x07' ? 1 : 2); continue }
      }

      if (next && '()#'.includes(next)) { i += 3; continue }
      i += 2
      continue
    }

    if (ch === '\n') { row++; col = 0; ensureRow(row); i++; continue }
    if (ch === '\r') { col = 0; i++; continue }
    if (ch === '\b') { if (col > 0) col--; i++; continue }
    if (ch === '\t') { const ts = (Math.floor(col / 8) + 1) * 8; while (col < ts) writeChar(' '); i++; continue }
    if (ch.charCodeAt(0) < 32) { i++; continue }

    writeChar(ch)
    i++
  }

  // Render screen buffer to HTML lines
  const htmlLines: string[] = []
  for (const line of screen) {
    // Trim trailing spaces
    let end = line.length
    while (end > 0 && line[end - 1]?.ch === ' ' && !line[end - 1]?.fg && !line[end - 1]?.bold) end--

    let html = ''
    let spanOpen = false
    let prevFg: string | null = null
    let prevBold = false

    for (let c = 0; c < end; c++) {
      const cell = line[c]
      if (!cell) { html += ' '; continue }

      const fg = cell.fg
      const bold = cell.bold || cell.dim

      if (fg !== prevFg || bold !== prevBold) {
        if (spanOpen) html += '</span>'
        spanOpen = false
        if (fg || bold) {
          const styles: string[] = []
          if (fg) styles.push(`color:${fg}`)
          if (cell.bold) styles.push('font-weight:700')
          if (cell.dim) styles.push('opacity:.6')
          html += `<span style="${styles.join(';')}">`
          spanOpen = true
        }
        prevFg = fg
        prevBold = bold
      }

      html += escapeHtml(cell.ch)
    }
    if (spanOpen) html += '</span>'
    htmlLines.push(html)
  }

  // Trim trailing empty lines
  while (htmlLines.length > 0 && htmlLines[htmlLines.length - 1]?.trim() === '') htmlLines.pop()

  // Collapse runs of more than 2 blank lines
  const result: string[] = []
  let blankRun = 0
  for (const line of htmlLines) {
    if (line.trim() === '') { blankRun++; if (blankRun <= 2) result.push('') }
    else { blankRun = 0; result.push(line) }
  }

  return result.join('\n')
}

/** Write input to a terminal session (used by companion feature) */
export function writeTerminalInput(sessionId: string, data: string): boolean {
  const terminal = terminals.get(sessionId)
  if (!terminal) return false
  terminal.pty.write(data)
  return true
}

/** Append PTY output to the ring buffer and persist to disk */
function appendOutputBuffer(sessionId: string, data: string): void {
  let buffer = outputBuffers.get(sessionId) ?? ''
  buffer += data
  if (buffer.length > OUTPUT_BUFFER_MAX_SIZE) {
    buffer = buffer.slice(buffer.length - OUTPUT_BUFFER_MAX_SIZE)
  }
  outputBuffers.set(sessionId, buffer)

  // Persist to file for KanbaiApi access
  try {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    fs.writeFileSync(path.join(OUTPUT_DIR, `${sessionId}.log`), buffer, 'utf-8')
  } catch {
    // Best-effort
  }
}

/** Process pending input commands from the relay queue file */
function processInputQueue(): void {
  try {
    if (!fs.existsSync(INPUT_QUEUE_PATH)) return
    const raw = fs.readFileSync(INPUT_QUEUE_PATH, 'utf-8')
    if (!raw.trim()) return
    const commands = JSON.parse(raw) as Array<{ sessionId: string; data: string }>
    // Clear queue immediately to avoid double-processing
    fs.writeFileSync(INPUT_QUEUE_PATH, '[]', 'utf-8')
    for (const cmd of commands) {
      writeTerminalInput(cmd.sessionId, cmd.data)
    }
  } catch {
    // Malformed or locked — skip this cycle
  }
}

/** Process pending close commands from the relay queue file */
function processCloseQueue(): void {
  try {
    if (!fs.existsSync(CLOSE_QUEUE_PATH)) return
    const raw = fs.readFileSync(CLOSE_QUEUE_PATH, 'utf-8')
    if (!raw.trim()) return
    const sessionIds = JSON.parse(raw) as string[]
    // Clear queue immediately to avoid double-processing
    fs.writeFileSync(CLOSE_QUEUE_PATH, '[]', 'utf-8')
    for (const sessionId of sessionIds) {
      closeTerminalSession(sessionId)
    }
  } catch {
    // Malformed or locked — skip this cycle
  }
}

/** Process pending create commands from the relay queue file (KanbaiApi → Desktop) */
function processCreateQueue(): void {
  try {
    if (!fs.existsSync(CREATE_QUEUE_PATH)) return
    const raw = fs.readFileSync(CREATE_QUEUE_PATH, 'utf-8')
    if (!raw.trim()) return
    const commands = JSON.parse(raw) as Array<{ provider: string; workspaceId: string }>
    // Clear queue immediately to avoid double-processing
    fs.writeFileSync(CREATE_QUEUE_PATH, '[]', 'utf-8')
    for (const cmd of commands) {
      // Send IPC to renderer to create a new terminal tab with this provider
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.TERMINAL_COMPANION_CREATE, {
              provider: cmd.provider,
              workspaceId: cmd.workspaceId,
            })
          }
        } catch { /* window destroyed */ }
      }
    }
  } catch {
    // Malformed or locked — skip this cycle
  }
}

let inputQueueInterval: ReturnType<typeof setInterval> | null = null

/** Start polling for external input, close, and create commands (called once at registration) */
function startInputQueuePolling(): void {
  if (inputQueueInterval) return
  inputQueueInterval = setInterval(() => {
    processInputQueue()
    processCloseQueue()
    processCreateQueue()
  }, 500)
}

/** Start periodic session persistence so KanbaiApi reads fresh status */
function startSessionPersistInterval(): void {
  if (sessionPersistInterval) return
  sessionPersistInterval = setInterval(() => {
    if (terminals.size > 0) persistTerminalSessions()
  }, SESSION_PERSIST_INTERVAL_MS)
}

/** Stop input queue polling (called on cleanup) */
function stopInputQueuePolling(): void {
  if (inputQueueInterval) {
    clearInterval(inputQueueInterval)
    inputQueueInterval = null
  }
  if (sessionPersistInterval) {
    clearInterval(sessionPersistInterval)
    sessionPersistInterval = null
  }
}

export function registerTerminalHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (_event, options: { cwd?: string; shell?: string; workspaceId?: string; tabId?: string; provider?: string; label?: string }) => {
      const id = uuid()
      const rawShell = new StorageService().getSettings().defaultShell
      // Normalize full paths (e.g. C:\WINDOWS\system32\cmd.exe → cmd.exe)
      const savedShell = normalizeWindowsShell(rawShell)
      // Validate saved shell exists — it may be a macOS path (e.g. /bin/zsh)
      // on a Windows machine if data.json was synced across platforms.
      // isShellValid handles Windows bare names (powershell.exe, cmd.exe, pwsh.exe)
      // that fs.existsSync cannot resolve through PATH.
      const shellExists = savedShell && isShellValid(savedShell)
      const shell = options.shell || (shellExists ? savedShell : null) || getDefaultShell()
      const cwd = options.cwd || os.homedir()

      // No -l for zsh (node-pty PTY makes it interactive; login shell causes compdef issues)
      // Keep -l for bash where it's needed for PATH setup
      const isZsh = !IS_WIN && shell.endsWith('/zsh')
      const shellArgs = getDefaultShellArgs(shell)

      // For zsh: use a custom ZDOTDIR that loads compinit before the user's .zshrc
      const shellEnv: Record<string, string> = {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>

      // Remove Claude Code session markers so terminals can launch claude without
      // "nested session" errors (the app may itself be launched from a Claude session)
      delete shellEnv.CLAUDECODE
      delete shellEnv.CLAUDE_CODE_ENTRYPOINT

      // Inject workspace, tab ID, and AI provider for pixel-agents hook tracking
      if (options.workspaceId) shellEnv.KANBAI_WORKSPACE_ID = options.workspaceId
      if (options.tabId) shellEnv.KANBAI_TAB_ID = options.tabId
      if (options.provider) shellEnv.KANBAI_AI_PROVIDER = options.provider

      // Inject namespace git profile so AI tools (Claude Code, Codex, etc.)
      // commit with the correct identity for this workspace's namespace
      if (options.workspaceId) {
        const gitEnv = getGitProfileEnvForWorkspace(options.workspaceId)
        Object.assign(shellEnv, gitEnv)
      }

      if (isZsh) {
        shellEnv.ZDOTDIR = ensureZshWrapper()
      }

      const pty = spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: shellEnv,
      })

      const now = Date.now()
      const managed: ManagedTerminal = {
        id,
        pty,
        cwd,
        workspaceId: options.workspaceId ?? null,
        tabId: options.tabId ?? null,
        label: options.label ?? null,
        taskId: null,
        ticketNumber: null,
        createdAt: now,
        lastActivity: now,
        disposables: [],
      }
      terminals.set(id, managed)

      // Apply any pending task info that arrived before the terminal was created (race condition fix)
      const tabKey = managed.tabId
      if (tabKey) {
        const pending = pendingTaskInfo.get(tabKey)
        if (pending) {
          managed.taskId = pending.taskId
          managed.ticketNumber = pending.ticketNumber
          pendingTaskInfo.delete(tabKey)
        }
      }

      persistTerminalSessions()
      bumpCompanionChangeVersion()

      // Forward output to renderer and capture in ring buffer for companion API
      managed.disposables.push(
        pty.onData((data: string) => {
          // Guard: ignore callbacks for terminals already removed from the map
          if (!terminals.has(id)) return
          managed.lastActivity = Date.now()
          appendOutputBuffer(id, data)
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id, data })
              }
            } catch { /* render frame disposed — ignore */ }
          }
        }),
      )

      managed.disposables.push(
        pty.onExit(({ exitCode, signal }) => {
          const terminal = terminals.get(id)
          if (terminal) {
            addFinishedSession({
              id: terminal.id,
              cwd: terminal.cwd,
              workspaceId: terminal.workspaceId,
              tabId: terminal.tabId,
              taskId: terminal.taskId,
              ticketNumber: terminal.ticketNumber,
              title: terminal.label || path.basename(terminal.cwd) || 'Terminal',
              status: exitCode === 0 ? 'done' : 'failed',
              createdAt: terminal.createdAt,
            })
          }
          terminals.delete(id)
          outputBuffers.delete(id)
          persistTerminalSessions()
          bumpCompanionChangeVersion()
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.TERMINAL_CLOSE, { id, exitCode, signal })
              }
            } catch { /* render frame disposed — ignore */ }
          }
        }),
      )

      return { id, pid: pty.pid }
    },
  )

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_event, { id, data }: { id: string; data: string }) => {
    const terminal = terminals.get(id)
    if (terminal) {
      terminal.pty.write(data)
    }
  })

  ipcMain.on(
    IPC_CHANNELS.TERMINAL_RESIZE,
    (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
      const terminal = terminals.get(id)
      if (terminal) {
        terminal.pty.resize(cols, rows)
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CHECK_BUSY, async (_event, { id }: { id: string }): Promise<boolean> => {
    const terminal = terminals.get(id)
    if (!terminal) return false
    const pid = terminal.pty.pid
    try {
      if (IS_WIN) {
        const { stdout } = await execFileAsync('wmic', ['process', 'where', `ParentProcessId=${pid}`, 'get', 'ProcessId'], { timeout: 3000 })
        // wmic output has header + data lines; more than just header means children exist
        const lines = stdout.trim().split('\n').filter((l: string) => l.trim().length > 0)
        return lines.length > 1
      }
      // macOS / Linux: pgrep returns 0 if child processes found
      await execFileAsync('pgrep', ['-P', String(pid)], { timeout: 3000 })
      return true
    } catch {
      // pgrep exits 1 when no children found, or command failed
      return false
    }
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_UPDATE_LABEL, (_event, { id, label }: { id: string; label: string }) => {
    updateTerminalLabel(id, label)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_SET_TASK_INFO, (_event, { tabId, taskId, ticketNumber }: { tabId: string; taskId: string; ticketNumber: string }) => {
    setTerminalTaskInfo(tabId, taskId, ticketNumber)
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_OUTPUT, async (_event, { id }: { id: string }): Promise<string> => {
    return getTerminalOutput(id)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_SYNC_TABS, (_event, tabs: Array<{ id: string; label: string; workspaceId: string }>) => {
    syncTabs(tabs)
  })

  // Start input queue polling for companion relay and periodic session persistence
  startInputQueuePolling()
  startSessionPersistInterval()

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CLOSE, async (_event, { id }: { id: string }) => {
    const terminal = terminals.get(id)
    if (terminal) {
      addFinishedSession({
        id: terminal.id,
        cwd: terminal.cwd,
        workspaceId: terminal.workspaceId,
        tabId: terminal.tabId,
        taskId: terminal.taskId,
        ticketNumber: terminal.ticketNumber,
        title: terminal.label || path.basename(terminal.cwd) || 'Terminal',
        status: 'done',
        createdAt: terminal.createdAt,
      })
      terminals.delete(id)
      persistTerminalSessions()
      bumpCompanionChangeVersion()
      disposeTerminal(terminal)
      // Notify renderer manually since onExit won't fire after dispose
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.TERMINAL_CLOSE, { id, exitCode: 0, signal: 0 })
          }
        } catch { /* render frame disposed — ignore */ }
      }
    }
  })
}

export function cleanupTerminals(): void {
  stopInputQueuePolling()
  for (const [, terminal] of terminals) {
    disposeTerminal(terminal)
  }
  terminals.clear()
  outputBuffers.clear()
  finishedOutputBuffers.clear()
  finishedSessions.length = 0
  persistTerminalSessions()
}
