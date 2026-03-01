import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockIpcMain } from '../mocks/electron'
import { EventEmitter } from 'events'
import { IS_WIN } from '../helpers/platform'

// Create a mock PTY process
function createMockPty() {
  const emitter = new EventEmitter()
  return {
    pid: 12345,
    cols: 80,
    rows: 24,
    process: '/bin/zsh',
    handleFlowControl: false,
    onData: (cb: (data: string) => void) => {
      emitter.on('data', cb)
      return { dispose: () => emitter.removeListener('data', cb) }
    },
    onExit: (cb: (e: { exitCode: number; signal: number }) => void) => {
      emitter.on('exit', cb)
      return { dispose: () => emitter.removeListener('exit', cb) }
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => {
      emitter.emit('exit', { exitCode: 0, signal: 0 })
    }),
    // Test helpers
    _emitter: emitter,
    _emitData: (data: string) => emitter.emit('data', data),
    _emitExit: (exitCode: number, signal: number) => emitter.emit('exit', { exitCode, signal }),
  }
}

let mockPtyInstance: ReturnType<typeof createMockPty>

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    mockPtyInstance = createMockPty()
    return mockPtyInstance
  }),
}))

// Mock uuid
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `term-uuid-${++uuidCounter}`,
}))

// Mock BrowserWindow.getAllWindows
const mockWebContentsSend = vi.fn()
vi.mock('electron', () => ({
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
}))

describe('Terminal IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    uuidCounter = 0
    mockWebContentsSend.mockClear()
    vi.resetModules()

    const { registerTerminalHandlers } = await import('../../src/main/ipc/terminal')

    mockIpcMain = createMockIpcMain()
    registerTerminalHandlers(mockIpcMain as never)
  })

  afterEach(async () => {
    // Clean up terminals
    vi.resetModules()
  })

  it('enregistre les handlers terminal', () => {
    expect(mockIpcMain._handlers.has('terminal:create')).toBe(true)
    expect(mockIpcMain._handlers.has('terminal:close')).toBe(true)
    expect(mockIpcMain._listeners.has('terminal:input')).toBe(true)
    expect(mockIpcMain._listeners.has('terminal:resize')).toBe(true)
  })

  it('cree un terminal et retourne id + pid', async () => {
    const result = await mockIpcMain._invoke('terminal:create', { cwd: '/tmp' })

    expect(result).toEqual({
      id: 'term-uuid-1',
      pid: 12345,
    })
  })

  it('ecrit des donnees dans le terminal', async () => {
    const { id } = await mockIpcMain._invoke('terminal:create', {})

    mockIpcMain._emit('terminal:input', { id, data: 'ls -la\r' })

    expect(mockPtyInstance.write).toHaveBeenCalledWith('ls -la\r')
  })

  it('redimensionne le terminal', async () => {
    const { id } = await mockIpcMain._invoke('terminal:create', {})

    mockIpcMain._emit('terminal:resize', { id, cols: 120, rows: 40 })

    expect(mockPtyInstance.resize).toHaveBeenCalledWith(120, 40)
  })

  it('ne fait rien si on ecrit dans un terminal inexistant', async () => {
    await mockIpcMain._invoke('terminal:create', {})

    // Should not throw
    mockIpcMain._emit('terminal:input', { id: 'inexistant', data: 'test' })

    expect(mockPtyInstance.write).not.toHaveBeenCalled()
  })

  it('ne fait rien si on redimensionne un terminal inexistant', async () => {
    await mockIpcMain._invoke('terminal:create', {})

    // Should not throw
    mockIpcMain._emit('terminal:resize', { id: 'inexistant', cols: 100, rows: 30 })

    expect(mockPtyInstance.resize).not.toHaveBeenCalled()
  })

  it('ferme un terminal', async () => {
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { id } = await mockIpcMain._invoke('terminal:create', {})

    await mockIpcMain._invoke('terminal:close', { id })

    if (IS_WIN) {
      expect(processKillSpy).toHaveBeenCalledWith(mockPtyInstance.pid)
    } else {
      expect(processKillSpy).toHaveBeenCalledWith(mockPtyInstance.pid, 'SIGKILL')
    }
  })

  it('ne fait rien si on ferme un terminal inexistant', async () => {
    // Should not throw
    await mockIpcMain._invoke('terminal:close', { id: 'inexistant' })
  })

  it('forward les donnees PTY vers le renderer via BrowserWindow', async () => {
    await mockIpcMain._invoke('terminal:create', {})

    // Simulate PTY outputting data
    mockPtyInstance._emitData('hello world')

    expect(mockWebContentsSend).toHaveBeenCalledWith('terminal:data', {
      id: 'term-uuid-1',
      data: 'hello world',
    })
  })

  it('notifie quand le processus PTY se termine', async () => {
    await mockIpcMain._invoke('terminal:create', {})

    // Simulate PTY exit
    mockPtyInstance._emitExit(0, 0)

    expect(mockWebContentsSend).toHaveBeenCalledWith('terminal:close', {
      id: 'term-uuid-1',
      exitCode: 0,
      signal: 0,
    })
  })
})

describe('cleanupTerminals', () => {
  it('tue et supprime tous les terminaux actifs', async () => {
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    vi.resetModules()
    const { registerTerminalHandlers, cleanupTerminals } = await import('../../src/main/ipc/terminal')

    const mockIpc = createMockIpcMain()
    registerTerminalHandlers(mockIpc as never)

    // Create two terminals
    await mockIpc._invoke('terminal:create', {})
    await mockIpc._invoke('terminal:create', {})

    cleanupTerminals()

    expect(processKillSpy).toHaveBeenCalledTimes(2)
    if (IS_WIN) {
      expect(processKillSpy).toHaveBeenCalledWith(12345)
    } else {
      expect(processKillSpy).toHaveBeenCalledWith(12345, 'SIGKILL')
    }
  })
})
