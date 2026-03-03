import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'
import type { Namespace } from '../../src/shared/types'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-ns-test-${process.pid}-${Date.now()}`)
const dataDir = path.join(TEST_DIR, '.kanbai')

// Mock os.homedir to use temp directory
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

// Mock uuid to return predictable IDs
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `ns-uuid-${++uuidCounter}`,
}))

describe('Namespace IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    uuidCounter = 0
    vi.resetModules()

    // Ensure clean data directory
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    // Re-import after module reset to get fresh StorageService instance
    const { registerNamespaceHandlers } = await import('../../src/main/ipc/namespace')

    mockIpcMain = createMockIpcMain()
    registerNamespaceHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 5 handlers namespace', () => {
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(5)
    expect(mockIpcMain._handlers.has('namespace:list')).toBe(true)
    expect(mockIpcMain._handlers.has('namespace:create')).toBe(true)
    expect(mockIpcMain._handlers.has('namespace:update')).toBe(true)
    expect(mockIpcMain._handlers.has('namespace:delete')).toBe(true)
    expect(mockIpcMain._handlers.has('namespace:ensureDefault')).toBe(true)
  })

  it('liste les namespaces et retourne au moins le default', async () => {
    const result = await mockIpcMain._invoke<Namespace[]>('namespace:list')

    expect(result.length).toBeGreaterThanOrEqual(1)
    const defaultNs = result.find((ns) => ns.isDefault)
    expect(defaultNs).toBeDefined()
    expect(defaultNs!.name).toBe('Default')
    expect(defaultNs!.isDefault).toBe(true)
  })

  it('cree un namespace avec nom et couleur', async () => {
    const result = await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Work',
      color: '#ff5733',
    })

    expect(result).toMatchObject({
      name: 'Work',
      color: '#ff5733',
      isDefault: false,
    })
    expect(result.id).toBeDefined()
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
  })

  it('cree un namespace sans couleur', async () => {
    const result = await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Personal',
    })

    expect(result).toMatchObject({
      name: 'Personal',
      isDefault: false,
    })
    expect(result.color).toBeUndefined()
  })

  it('met a jour le nom d un namespace', async () => {
    const created = await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Original',
      color: '#aabbcc',
    })

    const updated = await mockIpcMain._invoke<Namespace>('namespace:update', {
      id: created.id,
      name: 'Renamed',
    })

    expect(updated.name).toBe('Renamed')
    expect(updated.color).toBe('#aabbcc')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
  })

  it('echoue si on met a jour un namespace inexistant', async () => {
    await expect(
      mockIpcMain._invoke('namespace:update', { id: 'inexistant', name: 'Ghost' }),
    ).rejects.toThrow('Namespace inexistant not found')
  })

  it('supprime un namespace non-default', async () => {
    const created = await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Temporary',
    })

    await mockIpcMain._invoke('namespace:delete', { id: created.id })

    const list = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    const found = list.find((ns) => ns.id === created.id)
    expect(found).toBeUndefined()
  })

  it('ne supprime pas le namespace default', async () => {
    const listBefore = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    const defaultNs = listBefore.find((ns) => ns.isDefault)!

    await mockIpcMain._invoke('namespace:delete', { id: defaultNs.id })

    const listAfter = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    const stillExists = listAfter.find((ns) => ns.id === defaultNs.id)
    expect(stillExists).toBeDefined()
    expect(stillExists!.isDefault).toBe(true)
  })

  it('assure l existence du namespace default', async () => {
    const result = await mockIpcMain._invoke<Namespace>('namespace:ensureDefault')

    expect(result).toBeDefined()
    expect(result.name).toBe('Default')
    expect(result.isDefault).toBe(true)
  })

  it('workflow CRUD complet', async () => {
    // 1. List: should have only the default namespace
    const initial = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    expect(initial).toHaveLength(1)
    expect(initial[0].isDefault).toBe(true)
    const defaultId = initial[0].id

    // 2. Create two namespaces
    const work = await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Work',
      color: '#3b82f6',
    })
    const personal = await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Personal',
      color: '#10b981',
    })

    // 3. Verify list contains 3 namespaces
    const afterCreate = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    expect(afterCreate).toHaveLength(3)

    // 4. Update one namespace
    const updatedWork = await mockIpcMain._invoke<Namespace>('namespace:update', {
      id: work.id,
      name: 'Professional',
      color: '#6366f1',
    })
    expect(updatedWork.name).toBe('Professional')
    expect(updatedWork.color).toBe('#6366f1')

    // 5. Delete the other non-default namespace
    await mockIpcMain._invoke('namespace:delete', { id: personal.id })
    const afterDelete = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    expect(afterDelete).toHaveLength(2)
    expect(afterDelete.find((ns) => ns.id === personal.id)).toBeUndefined()

    // 6. Default namespace survives attempted deletion
    await mockIpcMain._invoke('namespace:delete', { id: defaultId })
    const afterDefaultDelete = await mockIpcMain._invoke<Namespace[]>('namespace:list')
    expect(afterDefaultDelete.find((ns) => ns.id === defaultId)).toBeDefined()

    // 7. Ensure default still returns the original default
    const ensured = await mockIpcMain._invoke<Namespace>('namespace:ensureDefault')
    expect(ensured.id).toBe(defaultId)
  })

  it('persiste les donnees sur disque', async () => {
    await mockIpcMain._invoke<Namespace>('namespace:create', {
      name: 'Persistent',
      color: '#ff0000',
    })

    const dataPath = path.join(dataDir, 'data.json')
    expect(fs.existsSync(dataPath)).toBe(true)

    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    const persistedNs = raw.namespaces.find(
      (ns: Namespace) => ns.name === 'Persistent',
    )
    expect(persistedNs).toBeDefined()
    expect(persistedNs.color).toBe('#ff0000')
    expect(persistedNs.isDefault).toBe(false)
  })
})
