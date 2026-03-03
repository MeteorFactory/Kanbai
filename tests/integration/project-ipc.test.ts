import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-project-ipc-test-${process.pid}-${Date.now()}`)
const dataDir = path.join(TEST_DIR, '.kanbai')
const projectDir = path.join(TEST_DIR, 'test-project')

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

// Mock Electron dialog
const mockShowOpenDialog = vi.fn()
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
  },
  IpcMain: vi.fn(),
}))

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `test-project-uuid-${++uuidCounter}`,
}))

describe('Project IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    uuidCounter = 0
    mockShowOpenDialog.mockReset()

    vi.resetModules()

    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    // Create a test project directory
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
    fs.mkdirSync(projectDir, { recursive: true })

    const { registerProjectHandlers } = await import('../../src/main/ipc/project')

    mockIpcMain = createMockIpcMain()
    registerProjectHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre tous les handlers project', () => {
    expect(mockIpcMain._handlers.has('project:selectDir')).toBe(true)
    expect(mockIpcMain._handlers.has('project:add')).toBe(true)
    expect(mockIpcMain._handlers.has('project:remove')).toBe(true)
    expect(mockIpcMain._handlers.has('project:scanClaude')).toBe(true)
    expect(mockIpcMain._handlers.has('project:writeClaudeSettings')).toBe(true)
    expect(mockIpcMain._handlers.has('project:writeClaudeMd')).toBe(true)
  })

  describe('selectDir', () => {
    it('retourne le chemin selectionne', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/Users/test/mon-projet'],
      })

      const result = await mockIpcMain._invoke('project:selectDir')
      expect(result).toBe('/Users/test/mon-projet')
    })

    it('retourne null si annule', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      })

      const result = await mockIpcMain._invoke('project:selectDir')
      expect(result).toBeNull()
    })
  })

  describe('add', () => {
    it('ajoute un projet sans .claude', async () => {
      const result = await mockIpcMain._invoke('project:add', {
        workspaceId: 'ws-1',
        path: projectDir,
      })

      expect(result).toMatchObject({
        id: 'test-project-uuid-2',
        name: 'test-project',
        path: projectDir,
        hasClaude: false,
        workspaceId: 'ws-1',
      })
    })

    it('detecte .claude dans le projet', async () => {
      fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true })

      const result = await mockIpcMain._invoke('project:add', {
        workspaceId: 'ws-1',
        path: projectDir,
      })

      expect(result.hasClaude).toBe(true)
    })
  })

  describe('remove', () => {
    it('supprime un projet', async () => {
      await mockIpcMain._invoke('project:add', {
        workspaceId: 'ws-1',
        path: projectDir,
      })

      await mockIpcMain._invoke('project:remove', { id: 'test-project-uuid-2' })
      // No error thrown = success
    })
  })

  describe('writeClaudeSettings', () => {
    it('ecrit settings.json dans .claude du projet', async () => {
      const settings = { permissions: 'bypassPermissions', allow: ['Bash', 'Read'] }

      const result = await mockIpcMain._invoke('project:writeClaudeSettings', {
        projectPath: projectDir,
        settings,
      })

      expect(result).toEqual({ success: true })
      const written = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'settings.json'), 'utf-8'))
      expect(written).toEqual(settings)
    })

    it('cree le dossier .claude s il n existe pas', async () => {
      const claudeDir = path.join(projectDir, '.claude')
      expect(fs.existsSync(claudeDir)).toBe(false)

      await mockIpcMain._invoke('project:writeClaudeSettings', {
        projectPath: projectDir,
        settings: { key: 'value' },
      })

      expect(fs.existsSync(claudeDir)).toBe(true)
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true)
    })

    it('ecrase les settings existants', async () => {
      const claudeDir = path.join(projectDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{"old":"data"}')

      await mockIpcMain._invoke('project:writeClaudeSettings', {
        projectPath: projectDir,
        settings: { new: 'data' },
      })

      const written = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'))
      expect(written).toEqual({ new: 'data' })
    })
  })

  describe('writeClaudeMd', () => {
    it('ecrit CLAUDE.md a la racine du projet', async () => {
      const content = '# Mon Projet\n\nDescription'

      const result = await mockIpcMain._invoke('project:writeClaudeMd', {
        projectPath: projectDir,
        content,
      })

      expect(result).toEqual({ success: true })
      expect(fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')).toBe(content)
    })

    it('ecrase CLAUDE.md existant', async () => {
      fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), 'ancien contenu')

      await mockIpcMain._invoke('project:writeClaudeMd', {
        projectPath: projectDir,
        content: 'nouveau contenu',
      })

      expect(fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')).toBe('nouveau contenu')
    })

    it('gere le contenu vide', async () => {
      await mockIpcMain._invoke('project:writeClaudeMd', {
        projectPath: projectDir,
        content: '',
      })

      expect(fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')).toBe('')
    })

    it('gere le contenu UTF-8 avec caracteres speciaux', async () => {
      const content = '# Projet éàü\n\nDescription avec émojis 🎉 et accents'

      await mockIpcMain._invoke('project:writeClaudeMd', {
        projectPath: projectDir,
        content,
      })

      expect(fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')).toBe(content)
    })
  })

  describe('scanClaude', () => {
    it('retourne hasClaude: false si pas de .claude', async () => {
      const result = await mockIpcMain._invoke('project:scanClaude', { path: projectDir })

      expect(result).toEqual({
        hasClaude: false,
        claudeMd: null,
        settings: null,
        localSettings: null,
        userSettings: null,
      })
    })

    it('detecte et lit CLAUDE.md', async () => {
      fs.mkdirSync(path.join(projectDir, '.claude'))
      fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Mon Projet', 'utf-8')

      const result = await mockIpcMain._invoke('project:scanClaude', { path: projectDir })

      expect(result.hasClaude).toBe(true)
      expect(result.claudeMd).toBe('# Mon Projet')
    })

    it('detecte et lit settings.json', async () => {
      const claudeDir = path.join(projectDir, '.claude')
      fs.mkdirSync(claudeDir)
      const settings = { permissions: { defaultMode: 'acceptEdits' } }
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings), 'utf-8')

      const result = await mockIpcMain._invoke('project:scanClaude', { path: projectDir })

      expect(result.hasClaude).toBe(true)
      expect(result.settings).toEqual(settings)
    })

    it('lit CLAUDE.md et settings.json ensemble', async () => {
      const claudeDir = path.join(projectDir, '.claude')
      fs.mkdirSync(claudeDir)
      fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Test', 'utf-8')
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{"key":"val"}', 'utf-8')

      const result = await mockIpcMain._invoke('project:scanClaude', { path: projectDir })

      expect(result.hasClaude).toBe(true)
      expect(result.claudeMd).toBe('# Test')
      expect(result.settings).toEqual({ key: 'val' })
    })
  })
})
