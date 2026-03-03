import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-session-ipc-test-${process.pid}-${Date.now()}`)
const dataDir = path.join(TEST_DIR, '.kanbai')

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

describe('Session IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    const { registerSessionHandlers } = await import('../../src/main/ipc/session')

    mockIpcMain = createMockIpcMain()
    registerSessionHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 3 handlers session', () => {
    expect(mockIpcMain._handlers.has('session:save')).toBe(true)
    expect(mockIpcMain._handlers.has('session:load')).toBe(true)
    expect(mockIpcMain._handlers.has('session:clear')).toBe(true)
  })

  it('sauvegarde et charge une session', async () => {
    const session = {
      activeWorkspaceId: 'ws-1',
      activeProjectId: 'p-1',
      tabs: [
        {
          workspaceId: 'ws-1',
          cwd: '/tmp/test',
          label: 'Terminal 1',
          isSplit: false,
          leftCommand: null,
          rightCommand: null,
        },
      ],
      savedAt: Date.now(),
    }

    await mockIpcMain._invoke('session:save', session)
    const loaded = await mockIpcMain._invoke('session:load')

    expect(loaded).toBeDefined()
    expect(loaded.activeWorkspaceId).toBe('ws-1')
    expect(loaded.tabs).toHaveLength(1)
  })

  it('retourne null si aucune session sauvegardee', async () => {
    const loaded = await mockIpcMain._invoke('session:load')
    expect(loaded).toBeNull()
  })

  it('efface la session', async () => {
    const session = {
      activeWorkspaceId: 'ws-1',
      activeProjectId: null,
      tabs: [],
      savedAt: Date.now(),
    }

    await mockIpcMain._invoke('session:save', session)
    await mockIpcMain._invoke('session:clear')

    const loaded = await mockIpcMain._invoke('session:load')
    expect(loaded).toBeNull()
  })
})
