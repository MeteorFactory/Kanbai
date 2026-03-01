import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockIpcMain } from '../mocks/electron'
import { EventEmitter } from 'events'

// Mock child process
function createMockChildProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    pid: number
    kill: ReturnType<typeof vi.fn>
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.pid = 99999
  proc.kill = vi.fn((signal?: string) => {
    proc.emit('exit', signal === 'SIGTERM' ? 1 : 0)
  })
  return proc
}

let lastChildProcess: ReturnType<typeof createMockChildProcess>

// Mock crossSpawn and killChildProcess from platform (instead of child_process directly)
vi.mock('../../src/shared/platform', async () => {
  const actual = await vi.importActual<typeof import('../../src/shared/platform')>('../../src/shared/platform')
  return {
    ...actual,
    crossSpawn: vi.fn(() => {
      lastChildProcess = createMockChildProcess()
      return lastChildProcess
    }),
    killChildProcess: vi.fn((child: { kill: (signal?: string) => boolean }, signal?: string) => {
      child.kill(signal)
    }),
  }
})

// Mock uuid
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `claude-uuid-${++uuidCounter}`,
}))

// Mock BrowserWindow and Notification
const mockWebContentsSend = vi.fn()
vi.mock('electron', () => {
  class MockNotification {
    show() {}
  }
  return {
    BrowserWindow: {
      getAllWindows: () => [
        {
          isDestroyed: () => false,
          webContents: {
            send: mockWebContentsSend,
            isDestroyed: () => false,
          },
        },
      ],
    },
    Notification: MockNotification,
  }
})

describe('Claude IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    uuidCounter = 0
    mockWebContentsSend.mockClear()
    vi.resetModules()

    const { registerClaudeHandlers } = await import('../../src/main/ipc/claude')

    mockIpcMain = createMockIpcMain()
    registerClaudeHandlers(mockIpcMain as never)
  })

  afterEach(async () => {
    vi.resetModules()
  })

  it('enregistre les 3 handlers claude', () => {
    expect(mockIpcMain._handlers.has('claude:start')).toBe(true)
    expect(mockIpcMain._handlers.has('claude:stop')).toBe(true)
    expect(mockIpcMain._handlers.has('claude:status')).toBe(true)
  })

  it('demarre une session claude', async () => {
    const session = await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
      prompt: 'Fix the bug',
    })

    expect(session).toMatchObject({
      id: 'claude-uuid-1',
      projectId: 'p-1',
      terminalId: 't-1',
      status: 'running',
      prompt: 'Fix the bug',
      loopMode: false,
      loopCount: 0,
    })
    expect(session.startedAt).toBeDefined()
  })

  it('demarre une session en mode loop', async () => {
    const session = await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
      loopMode: true,
      loopDelay: 3000,
    })

    expect(session.loopMode).toBe(true)
    expect(session.loopDelay).toBe(3000)
  })

  it('liste les sessions actives', async () => {
    await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    const sessions = await mockIpcMain._invoke('claude:status')

    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('claude-uuid-1')
    expect(sessions[0].status).toBe('running')
  })

  it('arrete une session claude', async () => {
    const session = await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    await mockIpcMain._invoke('claude:stop', { id: session.id })

    expect(lastChildProcess.kill).toHaveBeenCalledWith('SIGTERM')

    const sessions = await mockIpcMain._invoke('claude:status')
    expect(sessions).toHaveLength(0)
  })

  it('ne fait rien si on arrete une session inexistante', async () => {
    // Should not throw
    await mockIpcMain._invoke('claude:stop', { id: 'inexistant' })
  })

  it('forward stdout vers le renderer', async () => {
    await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    // Simulate stdout output
    lastChildProcess.stdout.emit('data', Buffer.from('Claude output'))

    expect(mockWebContentsSend).toHaveBeenCalledWith('terminal:data', {
      id: 't-1',
      data: 'Claude output',
    })
  })

  it('forward stderr vers le renderer', async () => {
    await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    lastChildProcess.stderr.emit('data', Buffer.from('Error output'))

    expect(mockWebContentsSend).toHaveBeenCalledWith('terminal:data', {
      id: 't-1',
      data: 'Error output',
    })
  })

  it('notifie la fin de session quand le processus se termine', async () => {
    await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    // Simulate process exit with success
    lastChildProcess.emit('exit', 0)

    expect(mockWebContentsSend).toHaveBeenCalledWith('claude:sessionEnd', {
      id: 'claude-uuid-1',
      status: 'completed',
    })
  })

  it('notifie echec quand le processus echoue', async () => {
    await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    // Simulate process exit with error
    lastChildProcess.emit('exit', 1)

    expect(mockWebContentsSend).toHaveBeenCalledWith('claude:sessionEnd', {
      id: 'claude-uuid-1',
      status: 'failed',
    })
  })

  it('desactive le loopMode apres stop', async () => {
    const session = await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
      loopMode: true,
    })

    await mockIpcMain._invoke('claude:stop', { id: session.id })

    // Session should be removed from active sessions
    const sessions = await mockIpcMain._invoke('claude:status')
    expect(sessions).toHaveLength(0)
  })
})

describe('cleanupClaudeSessions', () => {
  it('nettoie toutes les sessions', async () => {
    vi.resetModules()
    const { registerClaudeHandlers, cleanupClaudeSessions } = await import('../../src/main/ipc/claude')

    const mockIpcMain = createMockIpcMain()
    registerClaudeHandlers(mockIpcMain as never)

    await mockIpcMain._invoke('claude:start', {
      projectId: 'p-1',
      projectPath: '/tmp/projet',
      terminalId: 't-1',
    })

    cleanupClaudeSessions()

    expect(lastChildProcess.kill).toHaveBeenCalledWith('SIGTERM')

    const sessions = await mockIpcMain._invoke('claude:status')
    expect(sessions).toHaveLength(0)
  })
})
