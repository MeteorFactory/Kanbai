import { IpcMain, BrowserWindow, Notification } from 'electron'
import { ChildProcess } from 'child_process'
import { v4 as uuid } from 'uuid'
import { IPC_CHANNELS, ClaudeSession } from '../../shared/types'
import { MAX_LOOP_ERRORS_BEFORE_STOP, DEFAULT_LOOP_DELAY_MS } from '../../shared/constants/defaults'
import { killChildProcess, crossSpawn } from '../../shared/platform'

interface ManagedClaudeSession {
  session: ClaudeSession
  process: ChildProcess | null
  errorCount: number
}

const sessions = new Map<string, ManagedClaudeSession>()

function notifySessionEnd(session: ClaudeSession, status: 'completed' | 'failed'): void {
  const notification = new Notification({
    title: `Claude Session ${status === 'completed' ? 'terminée' : 'échouée'}`,
    body: `Session sur ${session.projectId} - ${status}`,
    silent: false,
  })
  notification.show()

  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.CLAUDE_SESSION_END, {
          id: session.id,
          status,
        })
      }
    } catch { /* render frame disposed */ }
  }
}

function startClaudeProcess(managed: ManagedClaudeSession, projectPath: string): void {
  const args = ['--dangerously-skip-permissions']
  if (managed.session.prompt) {
    args.push('-p', managed.session.prompt)
  }

  const proc = crossSpawn('claude', args, {
    cwd: projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  managed.process = proc
  managed.session.status = 'running'

  // Forward stdout to renderer via terminal
  proc.stdout?.on('data', (data: Buffer) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.TERMINAL_DATA, {
            id: managed.session.terminalId,
            data: data.toString(),
          })
        }
      } catch { /* render frame disposed */ }
    }
  })

  proc.stderr?.on('data', (data: Buffer) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.TERMINAL_DATA, {
            id: managed.session.terminalId,
            data: data.toString(),
          })
        }
      } catch { /* render frame disposed */ }
    }
  })

  proc.on('exit', (code) => {
    const status = code === 0 ? 'completed' : 'failed'
    managed.session.status = status
    managed.session.endedAt = Date.now()
    managed.process = null

    notifySessionEnd(managed.session, status)

    if (status === 'failed') {
      managed.errorCount++
    }

    // Handle loop mode
    if (managed.session.loopMode) {
      if (managed.errorCount >= MAX_LOOP_ERRORS_BEFORE_STOP) {
        managed.session.loopMode = false
        managed.session.status = 'failed'
        return
      }

      managed.session.loopCount++
      const delay = managed.session.loopDelay || DEFAULT_LOOP_DELAY_MS

      setTimeout(() => {
        if (managed.session.loopMode && managed.session.status !== 'paused') {
          startClaudeProcess(managed, projectPath)
        }
      }, delay)
    }
  })
}

export function registerClaudeHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_START,
    async (
      _event,
      data: {
        projectId: string
        projectPath: string
        terminalId: string
        prompt?: string
        loopMode?: boolean
        loopDelay?: number
      },
    ) => {
      const session: ClaudeSession = {
        id: uuid(),
        projectId: data.projectId,
        terminalId: data.terminalId,
        status: 'running',
        startedAt: Date.now(),
        prompt: data.prompt,
        loopMode: data.loopMode || false,
        loopCount: 0,
        loopDelay: data.loopDelay || DEFAULT_LOOP_DELAY_MS,
      }

      const managed: ManagedClaudeSession = {
        session,
        process: null,
        errorCount: 0,
      }

      sessions.set(session.id, managed)
      startClaudeProcess(managed, data.projectPath)

      return session
    },
  )

  ipcMain.handle(IPC_CHANNELS.CLAUDE_STOP, async (_event, { id }: { id: string }) => {
    const managed = sessions.get(id)
    if (managed) {
      managed.session.loopMode = false
      if (managed.process) {
        killChildProcess(managed.process, 'SIGTERM')
      }
      managed.session.status = 'completed'
      managed.session.endedAt = Date.now()
      sessions.delete(id)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLAUDE_STATUS, async () => {
    const result: ClaudeSession[] = []
    for (const [, managed] of sessions) {
      result.push({ ...managed.session })
    }
    return result
  })
}

export function cleanupClaudeSessions(): void {
  for (const [, managed] of sessions) {
    managed.session.loopMode = false
    if (managed.process) {
      killChildProcess(managed.process, 'SIGTERM')
    }
  }
  sessions.clear()
}
