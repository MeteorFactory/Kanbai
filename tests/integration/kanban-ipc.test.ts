import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-kanban-ipc-test-${process.pid}-${Date.now()}`)
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

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `kanban-uuid-${++uuidCounter}`,
}))

describe('Kanban IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    uuidCounter = 0
    vi.resetModules()

    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    const { registerKanbanHandlers } = await import('../../src/main/ipc/kanban')

    mockIpcMain = createMockIpcMain()
    registerKanbanHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 4 handlers kanban', () => {
    expect(mockIpcMain._handlers.has('kanban:list')).toBe(true)
    expect(mockIpcMain._handlers.has('kanban:create')).toBe(true)
    expect(mockIpcMain._handlers.has('kanban:update')).toBe(true)
    expect(mockIpcMain._handlers.has('kanban:delete')).toBe(true)
  })

  it('liste les taches (vide au depart)', async () => {
    const result = await mockIpcMain._invoke('kanban:list', { workspaceId: 'ws-1' })
    expect(result).toEqual([])
  })

  it('cree une tache avec statut par defaut TODO', async () => {
    const task = await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-1',
      title: 'Ma tache',
      description: 'Description de la tache',
      priority: 'medium',
    })

    expect(task).toMatchObject({
      id: 'kanban-uuid-1',
      workspaceId: 'ws-1',
      title: 'Ma tache',
      description: 'Description de la tache',
      status: 'TODO',
      priority: 'medium',
    })
    expect(task.createdAt).toBeDefined()
    expect(task.updatedAt).toBeDefined()
  })

  it('cree une tache avec un statut specifique', async () => {
    const task = await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-1',
      title: 'En cours',
      description: 'Deja commencee',
      priority: 'high',
      status: 'WORKING',
    })

    expect(task.status).toBe('WORKING')
  })

  it('filtre les taches par workspaceId', async () => {
    await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-1',
      title: 'Tache 1',
      description: '',
      priority: 'low',
    })
    await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-2',
      title: 'Tache 2',
      description: '',
      priority: 'low',
    })

    const ws1Tasks = await mockIpcMain._invoke('kanban:list', { workspaceId: 'ws-1' })
    const ws2Tasks = await mockIpcMain._invoke('kanban:list', { workspaceId: 'ws-2' })

    expect(ws1Tasks).toHaveLength(1)
    expect(ws2Tasks).toHaveLength(1)
  })

  it('met a jour une tache existante', async () => {
    const task = await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-1',
      title: 'Original',
      description: 'Desc',
      priority: 'medium',
    })

    const updated = await mockIpcMain._invoke('kanban:update', {
      workspaceId: 'ws-1',
      id: task.id,
      status: 'DONE',
      title: 'Terminee',
    })

    expect(updated.status).toBe('DONE')
    expect(updated.title).toBe('Terminee')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(task.updatedAt)
  })

  it('echoue si on met a jour une tache inexistante', async () => {
    await expect(
      mockIpcMain._invoke('kanban:update', { workspaceId: 'ws-1', id: 'inexistant', status: 'DONE' }),
    ).rejects.toThrow('Kanban task inexistant not found')
  })

  it('supprime une tache', async () => {
    const task = await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-1',
      title: 'A supprimer',
      description: '',
      priority: 'low',
    })

    await mockIpcMain._invoke('kanban:delete', { id: task.id, workspaceId: 'ws-1' })

    const list = await mockIpcMain._invoke('kanban:list', { workspaceId: 'ws-1' })
    expect(list).toHaveLength(0)
  })

  it('persiste les taches sur disque', async () => {
    await mockIpcMain._invoke('kanban:create', {
      workspaceId: 'ws-1',
      title: 'Persistante',
      description: '',
      priority: 'critical',
    })

    const kanbanPath = path.join(TEST_DIR, '.kanbai', 'kanban', 'ws-1.json')
    const raw = JSON.parse(fs.readFileSync(kanbanPath, 'utf-8'))
    expect(raw).toHaveLength(1)
    expect(raw[0].title).toBe('Persistante')
    expect(raw[0].priority).toBe('critical')
  })
})
