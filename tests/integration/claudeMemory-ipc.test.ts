import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'
import { IS_WIN } from '../helpers/platform'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-claudememory-ipc-test-${process.pid}-${Date.now()}`)
const projectDir = path.join(TEST_DIR, 'test-project')

// Mock os.homedir to isolate tests from real home directory
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: { ...actual, homedir: () => TEST_DIR },
    homedir: () => TEST_DIR,
  }
})

// Mock electron modules
const mockDialog = { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }
const mockShell = { openExternal: vi.fn() }
const mockApp = { isPackaged: false }
vi.mock('electron', () => ({
  dialog: mockDialog,
  shell: mockShell,
  app: mockApp,
}))

// Mock child_process for ai-rules sync handlers
const mockExecFile = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

describe('Claude Memory IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(projectDir, { recursive: true })

    mockDialog.showSaveDialog.mockReset()
    mockDialog.showOpenDialog.mockReset()
    mockShell.openExternal.mockReset()
    mockExecFile.mockReset()

    const { registerClaudeMemoryHandlers } = await import('../../src/main/ipc/claudeMemory')

    mockIpcMain = createMockIpcMain()
    registerClaudeMemoryHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // ---------------------------------------------------------------------------
  // Enregistrement des handlers
  // ---------------------------------------------------------------------------

  it('enregistre tous les handlers Claude Memory (20+)', () => {
    const expectedChannels = [
      'claude:memoryReadAuto',
      'claude:memoryToggleAuto',
      'claude:memoryListRules',
      'claude:memoryReadRule',
      'claude:memoryWriteRule',
      'claude:memoryDeleteRule',
      'claude:memoryReadFile',
      'claude:memoryWriteFile',
      'claude:memoryReadManaged',
      'claude:memoryInit',
      'claude:memoryExportRules',
      'claude:memoryImportRules',
      'claude:memoryListSharedRules',
      'claude:memoryWriteSharedRule',
      'claude:memoryDeleteSharedRule',
      'claude:memoryLinkSharedRule',
      'claude:memoryUnlinkSharedRule',
      'claude:memoryInitDefaultRules',
      'claude:memoryMoveRule',
      'claude:memoryCreateRuleDir',
      'claude:memoryRenameRuleDir',
      'claude:memoryDeleteRuleDir',
      'claude:memoryListTemplates',
      'claude:memoryReadTemplate',
      'claude:memoryImportTemplates',
      'claude:memorySyncAiRules',
      'claude:memoryCheckAiRules',
      'shell:openExternal',
    ]

    for (const channel of expectedChannels) {
      expect(mockIpcMain._handlers.has(channel), `handler manquant: ${channel}`).toBe(true)
    }

    expect(mockIpcMain._handlers.size).toBeGreaterThanOrEqual(expectedChannels.length)
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_READ_AUTO
  // ---------------------------------------------------------------------------

  describe('claude:memoryReadAuto', () => {
    it('retourne vide si le repertoire memoire est inexistant', async () => {
      const result = await mockIpcMain._invoke('claude:memoryReadAuto', {
        projectPath: '/nonexistent/project',
      })

      expect(result.content).toBe('')
      expect(result.topicFiles).toEqual([])
    })

    it('lit MEMORY.md et liste les fichiers topic', async () => {
      // sanitizeProjectPath: /Users/akc/Projects/test -> Users-akc-Projects-test
      const sanitized = 'Users-akc-Projects-test'
      const memoryDir = path.join(TEST_DIR, '.claude', 'projects', sanitized, 'memory')
      fs.mkdirSync(memoryDir, { recursive: true })
      fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), '# Auto Memory\nSome notes', 'utf-8')
      fs.writeFileSync(path.join(memoryDir, 'architecture.md'), '# Architecture notes', 'utf-8')
      fs.writeFileSync(path.join(memoryDir, 'bugs.md'), '# Known bugs', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadAuto', {
        projectPath: '/Users/akc/Projects/test',
      })

      expect(result.content).toBe('# Auto Memory\nSome notes')
      expect(result.topicFiles).toHaveLength(2)
      expect(result.topicFiles.map((f: { name: string }) => f.name).sort()).toEqual([
        'architecture.md',
        'bugs.md',
      ])
    })

    it('ignore les fichiers non-md dans le repertoire memoire', async () => {
      const sanitized = 'test-project'
      const memoryDir = path.join(TEST_DIR, '.claude', 'projects', sanitized, 'memory')
      fs.mkdirSync(memoryDir, { recursive: true })
      fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), '# Memory', 'utf-8')
      fs.writeFileSync(path.join(memoryDir, 'notes.md'), '# Notes', 'utf-8')
      fs.writeFileSync(path.join(memoryDir, 'data.json'), '{}', 'utf-8')
      fs.writeFileSync(path.join(memoryDir, 'image.png'), 'binary', 'utf-8')
      fs.writeFileSync(path.join(memoryDir, '.hidden'), 'hidden', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadAuto', {
        projectPath: '/test-project',
      })

      expect(result.content).toBe('# Memory')
      expect(result.topicFiles).toHaveLength(1)
      expect(result.topicFiles[0].name).toBe('notes.md')
    })

    it('retourne contenu vide si MEMORY.md absent mais topic files presents', async () => {
      const sanitized = 'my-project'
      const memoryDir = path.join(TEST_DIR, '.claude', 'projects', sanitized, 'memory')
      fs.mkdirSync(memoryDir, { recursive: true })
      fs.writeFileSync(path.join(memoryDir, 'topic.md'), '# Topic', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadAuto', {
        projectPath: '/my-project',
      })

      expect(result.content).toBe('')
      expect(result.topicFiles).toHaveLength(1)
    })
  })

  // ---------------------------------------------------------------------------
  // sanitizeProjectPath (teste indirectement via READ_AUTO)
  // ---------------------------------------------------------------------------

  describe('sanitizeProjectPath (via claude:memoryReadAuto)', () => {
    it('transforme /Users/akc/Projects/test en Users-akc-Projects-test', async () => {
      const sanitized = 'Users-akc-Projects-test'
      const memoryDir = path.join(TEST_DIR, '.claude', 'projects', sanitized, 'memory')
      fs.mkdirSync(memoryDir, { recursive: true })
      fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), 'sanitized path test', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadAuto', {
        projectPath: '/Users/akc/Projects/test',
      })

      expect(result.content).toBe('sanitized path test')
    })

    it('supprime le tiret initial apres remplacement des slashes', async () => {
      // /a/b -> -a-b -> a-b (leading dash removed)
      const sanitized = 'a-b'
      const memoryDir = path.join(TEST_DIR, '.claude', 'projects', sanitized, 'memory')
      fs.mkdirSync(memoryDir, { recursive: true })
      fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), 'leading dash test', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadAuto', {
        projectPath: '/a/b',
      })

      expect(result.content).toBe('leading dash test')
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_TOGGLE_AUTO
  // ---------------------------------------------------------------------------

  describe('claude:memoryToggleAuto', () => {
    it('active la memoire auto dans settings.json', async () => {
      const result = await mockIpcMain._invoke('claude:memoryToggleAuto', {
        projectPath: projectDir,
        enabled: true,
      })

      expect(result).toEqual({ success: true })

      const settingsPath = path.join(projectDir, '.claude', 'settings.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      expect(settings.autoMemoryEnabled).toBe(true)
    })

    it('desactive la memoire auto dans settings.json', async () => {
      // Pre-create with enabled=true
      const settingsDir = path.join(projectDir, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(
        path.join(settingsDir, 'settings.json'),
        JSON.stringify({ autoMemoryEnabled: true }),
        'utf-8',
      )

      const result = await mockIpcMain._invoke('claude:memoryToggleAuto', {
        projectPath: projectDir,
        enabled: false,
      })

      expect(result).toEqual({ success: true })
      const settings = JSON.parse(
        fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'),
      )
      expect(settings.autoMemoryEnabled).toBe(false)
    })

    it('cree le repertoire .claude si inexistant', async () => {
      const claudeDir = path.join(projectDir, '.claude')
      expect(fs.existsSync(claudeDir)).toBe(false)

      await mockIpcMain._invoke('claude:memoryToggleAuto', {
        projectPath: projectDir,
        enabled: true,
      })

      expect(fs.existsSync(claudeDir)).toBe(true)
      expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true)
    })

    it('preserve les settings existants lors du toggle', async () => {
      const settingsDir = path.join(projectDir, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(
        path.join(settingsDir, 'settings.json'),
        JSON.stringify({ theme: 'dark', fontSize: 14 }, null, 2),
        'utf-8',
      )

      await mockIpcMain._invoke('claude:memoryToggleAuto', {
        projectPath: projectDir,
        enabled: true,
      })

      const settings = JSON.parse(
        fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'),
      )
      expect(settings.theme).toBe('dark')
      expect(settings.fontSize).toBe(14)
      expect(settings.autoMemoryEnabled).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_LIST_RULES
  // ---------------------------------------------------------------------------

  describe('claude:memoryListRules', () => {
    it('retourne vide si pas de repertoire rules', async () => {
      const result = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })

      expect(result).toEqual({ rules: [], directories: [] })
    })

    it('liste les regles recursivement', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(path.join(rulesDir, 'conventions'), { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'preferences.md'), '# Preferences\n', 'utf-8')
      fs.writeFileSync(
        path.join(rulesDir, 'conventions', 'core.md'),
        '# Core Conventions\n',
        'utf-8',
      )

      const result = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })

      expect(result.rules).toHaveLength(2)
      const relativePaths = result.rules.map((r: { relativePath: string }) => r.relativePath).sort()
      expect(relativePaths).toEqual(['conventions/core.md', 'preferences.md'])
      expect(result.directories).toContain('conventions')
    })

    it('parse le frontmatter YAML (paths, author, authorUrl)', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      const ruleContent = `---
paths:
  - "**/*.ts"
  - "**/*.tsx"
author: "SpaceMalamute"
authorUrl: "https://github.com/SpaceMalamute"
---

# TypeScript Rules

Use strict mode everywhere.
`
      fs.writeFileSync(path.join(rulesDir, 'typescript.md'), ruleContent, 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })

      expect(result.rules).toHaveLength(1)
      const rule = result.rules[0]
      expect(rule.paths).toEqual(['"**/*.ts"', '"**/*.tsx"'])
      expect(rule.author).toBe('SpaceMalamute')
      expect(rule.authorUrl).toBe('https://github.com/SpaceMalamute')
      expect(rule.content).toContain('# TypeScript Rules')
    })

    it('parse le frontmatter avec coAuthors', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      const ruleContent = `---
paths:
  - "**/*.py"
author: "MainAuthor"
coAuthors:
  - "CoAuthor1"
  - "CoAuthor2"
---

# Python Rules
`
      fs.writeFileSync(path.join(rulesDir, 'python.md'), ruleContent, 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })

      const rule = result.rules[0]
      expect(rule.author).toBe('MainAuthor')
      expect(rule.coAuthors).toEqual(['"CoAuthor1"', '"CoAuthor2"'])
    })

    it('retourne paths vide si pas de frontmatter', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'simple.md'), '# Simple Rule\nNo frontmatter.', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })

      expect(result.rules[0].paths).toEqual([])
      expect(result.rules[0].author).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_READ_RULE / WRITE_RULE / DELETE_RULE
  // ---------------------------------------------------------------------------

  describe('claude:memoryReadRule', () => {
    it('lit une regle existante', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'test.md'), '# Test Rule Content', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'test.md',
      })

      expect(result).toBe('# Test Rule Content')
    })

    it('retourne null pour une regle inexistante', async () => {
      const result = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'nonexistent.md',
      })

      expect(result).toBeNull()
    })

    it('lit une regle dans un sous-repertoire (chemin relatif)', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules', 'lang')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'go.md'), '# Go Rules', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'lang/go.md',
      })

      expect(result).toBe('# Go Rules')
    })
  })

  describe('claude:memoryWriteRule', () => {
    it('ecrit une regle avec creation de repertoires intermediaires', async () => {
      const result = await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'conventions/deep/nested/rule.md',
        content: '# Deep Nested Rule',
      })

      expect(result).toEqual({ success: true })

      const filePath = path.join(projectDir, '.claude', 'rules', 'conventions', 'deep', 'nested', 'rule.md')
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Deep Nested Rule')
    })

    it('ecrase le contenu d une regle existante', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'existing.md'), 'old content', 'utf-8')

      await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'existing.md',
        content: 'new content',
      })

      expect(fs.readFileSync(path.join(rulesDir, 'existing.md'), 'utf-8')).toBe('new content')
    })
  })

  describe('claude:memoryDeleteRule', () => {
    it('supprime une regle et nettoie les repertoires parents vides', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      const deepDir = path.join(rulesDir, 'a', 'b')
      fs.mkdirSync(deepDir, { recursive: true })
      fs.writeFileSync(path.join(deepDir, 'rule.md'), '# Rule', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryDeleteRule', {
        projectPath: projectDir,
        filename: 'a/b/rule.md',
      })

      expect(result).toEqual({ success: true })
      // The file is deleted
      expect(fs.existsSync(path.join(deepDir, 'rule.md'))).toBe(false)
      // Empty parents a/b and a should be cleaned up
      expect(fs.existsSync(path.join(rulesDir, 'a', 'b'))).toBe(false)
      expect(fs.existsSync(path.join(rulesDir, 'a'))).toBe(false)
      // The rules dir itself should remain
      expect(fs.existsSync(rulesDir)).toBe(true)
    })

    it('ne nettoie pas les parents qui contiennent d autres fichiers', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      const subDir = path.join(rulesDir, 'group')
      fs.mkdirSync(subDir, { recursive: true })
      fs.writeFileSync(path.join(subDir, 'keep.md'), '# Keep', 'utf-8')
      fs.writeFileSync(path.join(subDir, 'delete.md'), '# Delete', 'utf-8')

      await mockIpcMain._invoke('claude:memoryDeleteRule', {
        projectPath: projectDir,
        filename: 'group/delete.md',
      })

      // Parent still has keep.md so should not be deleted
      expect(fs.existsSync(subDir)).toBe(true)
      expect(fs.existsSync(path.join(subDir, 'keep.md'))).toBe(true)
    })

    it('retourne success meme si la regle n existe pas', async () => {
      const result = await mockIpcMain._invoke('claude:memoryDeleteRule', {
        projectPath: projectDir,
        filename: 'nonexistent.md',
      })

      expect(result).toEqual({ success: true })
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_READ_FILE / WRITE_FILE
  // ---------------------------------------------------------------------------

  describe('claude:memoryReadFile', () => {
    it('lit un fichier avec expansion du tilde', async () => {
      const filePath = path.join(TEST_DIR, '.claude', 'CLAUDE.md')
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, '# Global Claude Config', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadFile', {
        filePath: '~/.claude/CLAUDE.md',
      })

      expect(result).toBe('# Global Claude Config')
    })

    it('retourne null pour un fichier inexistant', async () => {
      const result = await mockIpcMain._invoke('claude:memoryReadFile', {
        filePath: '~/nonexistent/file.md',
      })

      expect(result).toBeNull()
    })

    it('lit un fichier avec chemin absolu sans tilde', async () => {
      const filePath = path.join(projectDir, 'CLAUDE.md')
      fs.writeFileSync(filePath, '# Project CLAUDE.md', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadFile', {
        filePath,
      })

      expect(result).toBe('# Project CLAUDE.md')
    })
  })

  describe('claude:memoryWriteFile', () => {
    it('ecrit un fichier avec creation de repertoires et expansion du tilde', async () => {
      const result = await mockIpcMain._invoke('claude:memoryWriteFile', {
        filePath: '~/.claude/CLAUDE.md',
        content: '# Written via tilde',
      })

      expect(result).toEqual({ success: true })

      const resolved = path.join(TEST_DIR, '.claude', 'CLAUDE.md')
      expect(fs.readFileSync(resolved, 'utf-8')).toBe('# Written via tilde')
    })

    it('cree les repertoires parents si necessaire', async () => {
      const deepPath = path.join(projectDir, 'deep', 'nested', 'dir', 'file.md')

      await mockIpcMain._invoke('claude:memoryWriteFile', {
        filePath: deepPath,
        content: '# Deep file',
      })

      expect(fs.existsSync(deepPath)).toBe(true)
      expect(fs.readFileSync(deepPath, 'utf-8')).toBe('# Deep file')
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_READ_MANAGED
  // ---------------------------------------------------------------------------

  describe('claude:memoryReadManaged', () => {
    it('lit le CLAUDE.md manage depuis Library/Application Support', async () => {
      const managedPath = path.join(TEST_DIR, 'Library', 'Application Support', 'ClaudeCode', 'CLAUDE.md')
      fs.mkdirSync(path.dirname(managedPath), { recursive: true })
      fs.writeFileSync(managedPath, '# Managed Claude Config', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryReadManaged')

      expect(result).toBe('# Managed Claude Config')
    })

    it('retourne null si le fichier manage n existe pas', async () => {
      const result = await mockIpcMain._invoke('claude:memoryReadManaged')

      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_INIT
  // ---------------------------------------------------------------------------

  describe('claude:memoryInit', () => {
    it('cree CLAUDE.md avec un template', async () => {
      const result = await mockIpcMain._invoke('claude:memoryInit', {
        projectPath: projectDir,
      })

      expect(result).toEqual({ success: true })

      const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')
      expect(claudeMd).toContain('# Project Instructions')
      expect(claudeMd).toContain('## Overview')
      expect(claudeMd).toContain('## Code Conventions')
      expect(claudeMd).toContain('## Important Files')
    })

    it('refuse de creer si CLAUDE.md existe deja', async () => {
      fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Existing', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryInit', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('already exists')
      // Content must not have changed
      expect(fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')).toBe('# Existing')
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_INIT_DEFAULT_RULES
  // ---------------------------------------------------------------------------

  describe('claude:memoryInitDefaultRules', () => {
    it('cree les regles par defaut (preferences.md et workflows.md)', async () => {
      const result = await mockIpcMain._invoke('claude:memoryInitDefaultRules', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(true)
      expect(result.created).toContain('preferences.md')
      expect(result.created).toContain('workflows.md')

      const rulesDir = path.join(projectDir, '.claude', 'rules')
      expect(fs.existsSync(path.join(rulesDir, 'preferences.md'))).toBe(true)
      expect(fs.existsSync(path.join(rulesDir, 'workflows.md'))).toBe(true)

      const prefContent = fs.readFileSync(path.join(rulesDir, 'preferences.md'), 'utf-8')
      expect(prefContent).toContain('# Preferences')
    })

    it('refuse de creer si des regles existent deja', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'existing.md'), '# Existing Rule', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryInitDefaultRules', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(false)
      expect(result.created).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_EXPORT_RULES
  // ---------------------------------------------------------------------------

  describe('claude:memoryExportRules', () => {
    it('exporte les regles en JSON via dialog', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'rule-a.md'), '# Rule A', 'utf-8')
      fs.writeFileSync(path.join(rulesDir, 'rule-b.md'), '# Rule B', 'utf-8')

      const exportPath = path.join(TEST_DIR, 'exported-rules.json')
      mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: exportPath })

      const result = await mockIpcMain._invoke('claude:memoryExportRules', {
        projectPath: projectDir,
      })

      expect(result).toEqual({ success: true })
      expect(mockDialog.showSaveDialog).toHaveBeenCalled()

      const exported = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
      expect(exported).toHaveLength(2)
      expect(exported.map((r: { filename: string }) => r.filename).sort()).toEqual([
        'rule-a.md',
        'rule-b.md',
      ])
    })

    it('retourne erreur si pas de repertoire rules', async () => {
      const result = await mockIpcMain._invoke('claude:memoryExportRules', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('No rules directory')
    })

    it('retourne erreur si aucune regle a exporter', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      // Empty rules dir (no .md files)

      const result = await mockIpcMain._invoke('claude:memoryExportRules', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('No rules to export')
    })

    it('retourne success false si dialog est annule', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'rule.md'), '# Rule', 'utf-8')

      mockDialog.showSaveDialog.mockResolvedValue({ canceled: true })

      const result = await mockIpcMain._invoke('claude:memoryExportRules', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_IMPORT_RULES
  // ---------------------------------------------------------------------------

  describe('claude:memoryImportRules', () => {
    it('importe des regles depuis un fichier JSON', async () => {
      const importFile = path.join(TEST_DIR, 'import.json')
      const rulesData = [
        { filename: 'imported-a.md', content: '# Imported A' },
        { filename: 'imported-b.md', content: '# Imported B' },
      ]
      fs.writeFileSync(importFile, JSON.stringify(rulesData), 'utf-8')

      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [importFile],
      })

      const result = await mockIpcMain._invoke('claude:memoryImportRules', {
        projectPath: projectDir,
      })

      expect(result).toEqual({ success: true })

      const rulesDir = path.join(projectDir, '.claude', 'rules')
      expect(fs.readFileSync(path.join(rulesDir, 'imported-a.md'), 'utf-8')).toBe('# Imported A')
      expect(fs.readFileSync(path.join(rulesDir, 'imported-b.md'), 'utf-8')).toBe('# Imported B')
    })

    it('importe un fichier Markdown directement', async () => {
      const mdFile = path.join(TEST_DIR, 'standalone-rule.md')
      fs.writeFileSync(mdFile, '# Standalone Rule', 'utf-8')

      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mdFile],
      })

      const result = await mockIpcMain._invoke('claude:memoryImportRules', {
        projectPath: projectDir,
      })

      expect(result).toEqual({ success: true })

      const rulesDir = path.join(projectDir, '.claude', 'rules')
      expect(fs.readFileSync(path.join(rulesDir, 'standalone-rule.md'), 'utf-8')).toBe(
        '# Standalone Rule',
      )
    })

    it('retourne success false si dialog est annule', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      const result = await mockIpcMain._invoke('claude:memoryImportRules', {
        projectPath: projectDir,
      })

      expect(result.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // CLAUDE_MEMORY_MOVE_RULE
  // ---------------------------------------------------------------------------

  describe('claude:memoryMoveRule', () => {
    it('deplace une regle vers un nouveau chemin', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'old-name.md'), '# Moving Rule', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryMoveRule', {
        projectPath: projectDir,
        oldPath: 'old-name.md',
        newPath: 'subdir/new-name.md',
      })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(path.join(rulesDir, 'old-name.md'))).toBe(false)
      expect(fs.readFileSync(path.join(rulesDir, 'subdir', 'new-name.md'), 'utf-8')).toBe(
        '# Moving Rule',
      )
    })

    it('echoue si la source est inexistante', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      const result = await mockIpcMain._invoke('claude:memoryMoveRule', {
        projectPath: projectDir,
        oldPath: 'nonexistent.md',
        newPath: 'dest.md',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Source not found')
    })

    it('detecte le path traversal sur le chemin source', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      await expect(
        mockIpcMain._invoke('claude:memoryMoveRule', {
          projectPath: projectDir,
          oldPath: '../../etc/passwd',
          newPath: 'stolen.md',
        }),
      ).rejects.toThrow('Path traversal detected')
    })

    it('detecte le path traversal sur le chemin destination', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'rule.md'), '# Rule', 'utf-8')

      await expect(
        mockIpcMain._invoke('claude:memoryMoveRule', {
          projectPath: projectDir,
          oldPath: 'rule.md',
          newPath: '../../../etc/evil.md',
        }),
      ).rejects.toThrow('Path traversal detected')
    })

    it('nettoie les repertoires parents vides apres deplacement', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      const deepDir = path.join(rulesDir, 'category', 'sub')
      fs.mkdirSync(deepDir, { recursive: true })
      fs.writeFileSync(path.join(deepDir, 'rule.md'), '# Rule', 'utf-8')

      await mockIpcMain._invoke('claude:memoryMoveRule', {
        projectPath: projectDir,
        oldPath: 'category/sub/rule.md',
        newPath: 'rule.md',
      })

      // Empty parents should be cleaned
      expect(fs.existsSync(path.join(rulesDir, 'category', 'sub'))).toBe(false)
      expect(fs.existsSync(path.join(rulesDir, 'category'))).toBe(false)
      expect(fs.existsSync(path.join(rulesDir, 'rule.md'))).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Directory operations (CREATE / RENAME / DELETE_RULE_DIR)
  // ---------------------------------------------------------------------------

  describe('claude:memoryCreateRuleDir', () => {
    it('cree un repertoire dans rules', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      const result = await mockIpcMain._invoke('claude:memoryCreateRuleDir', {
        projectPath: projectDir,
        dirPath: 'conventions/typescript',
      })

      expect(result).toEqual({ success: true })
      expect(
        fs.existsSync(path.join(rulesDir, 'conventions', 'typescript')),
      ).toBe(true)
    })

    it('detecte le path traversal', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      await expect(
        mockIpcMain._invoke('claude:memoryCreateRuleDir', {
          projectPath: projectDir,
          dirPath: '../../escape',
        }),
      ).rejects.toThrow('Path traversal detected')
    })
  })

  describe('claude:memoryRenameRuleDir', () => {
    it('renomme un repertoire', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(path.join(rulesDir, 'old-name'), { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'old-name', 'rule.md'), '# Rule', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryRenameRuleDir', {
        projectPath: projectDir,
        oldPath: 'old-name',
        newPath: 'new-name',
      })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(path.join(rulesDir, 'old-name'))).toBe(false)
      expect(fs.existsSync(path.join(rulesDir, 'new-name'))).toBe(true)
      expect(fs.readFileSync(path.join(rulesDir, 'new-name', 'rule.md'), 'utf-8')).toBe('# Rule')
    })

    it('echoue si le repertoire source n existe pas', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      const result = await mockIpcMain._invoke('claude:memoryRenameRuleDir', {
        projectPath: projectDir,
        oldPath: 'nonexistent',
        newPath: 'new-name',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Directory not found')
    })
  })

  describe('claude:memoryDeleteRuleDir', () => {
    it('supprime un repertoire recursivement', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      const targetDir = path.join(rulesDir, 'to-delete')
      fs.mkdirSync(path.join(targetDir, 'sub'), { recursive: true })
      fs.writeFileSync(path.join(targetDir, 'a.md'), '# A', 'utf-8')
      fs.writeFileSync(path.join(targetDir, 'sub', 'b.md'), '# B', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryDeleteRuleDir', {
        projectPath: projectDir,
        dirPath: 'to-delete',
      })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(targetDir)).toBe(false)
    })

    it('retourne success meme si le repertoire n existe pas', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      const result = await mockIpcMain._invoke('claude:memoryDeleteRuleDir', {
        projectPath: projectDir,
        dirPath: 'nonexistent',
      })

      expect(result).toEqual({ success: true })
    })

    it('detecte le path traversal', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      await expect(
        mockIpcMain._invoke('claude:memoryDeleteRuleDir', {
          projectPath: projectDir,
          dirPath: '../../..',
        }),
      ).rejects.toThrow('Path traversal detected')
    })
  })

  // ---------------------------------------------------------------------------
  // Shared rules (LIST / WRITE / DELETE / LINK / UNLINK)
  // ---------------------------------------------------------------------------

  describe('claude:memoryListSharedRules', () => {
    it('retourne un tableau vide si le repertoire shared-rules n existe pas', async () => {
      const result = await mockIpcMain._invoke('claude:memoryListSharedRules')
      expect(result).toEqual([])
    })

    it('liste les regles partagees', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      fs.writeFileSync(path.join(sharedDir, 'shared-a.md'), '# Shared A', 'utf-8')
      fs.writeFileSync(path.join(sharedDir, 'shared-b.md'), '# Shared B', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryListSharedRules')

      expect(result).toHaveLength(2)
      expect(result.map((r: { filename: string }) => r.filename).sort()).toEqual([
        'shared-a.md',
        'shared-b.md',
      ])
      expect(result[0].content).toBeDefined()
      expect(result[0].fullPath).toBeDefined()
    })

    it('ignore les fichiers non-md', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      fs.writeFileSync(path.join(sharedDir, 'rule.md'), '# Rule', 'utf-8')
      fs.writeFileSync(path.join(sharedDir, 'data.json'), '{}', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryListSharedRules')

      expect(result).toHaveLength(1)
      expect(result[0].filename).toBe('rule.md')
    })
  })

  describe('claude:memoryWriteSharedRule', () => {
    it('ecrit une regle partagee', async () => {
      const result = await mockIpcMain._invoke('claude:memoryWriteSharedRule', {
        filename: 'my-shared.md',
        content: '# My Shared Rule',
      })

      expect(result).toEqual({ success: true })

      const sharedPath = path.join(TEST_DIR, '.mirehub', 'shared-rules', 'my-shared.md')
      expect(fs.readFileSync(sharedPath, 'utf-8')).toBe('# My Shared Rule')
    })

    it('cree le repertoire shared-rules si inexistant', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      expect(fs.existsSync(sharedDir)).toBe(false)

      await mockIpcMain._invoke('claude:memoryWriteSharedRule', {
        filename: 'first.md',
        content: '# First',
      })

      expect(fs.existsSync(sharedDir)).toBe(true)
    })
  })

  describe('claude:memoryDeleteSharedRule', () => {
    it('supprime une regle partagee', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      const filePath = path.join(sharedDir, 'to-delete.md')
      fs.writeFileSync(filePath, '# To Delete', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryDeleteSharedRule', {
        filename: 'to-delete.md',
      })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(filePath)).toBe(false)
    })

    it('retourne success meme si la regle n existe pas', async () => {
      const result = await mockIpcMain._invoke('claude:memoryDeleteSharedRule', {
        filename: 'nonexistent.md',
      })

      expect(result).toEqual({ success: true })
    })
  })

  // ---------------------------------------------------------------------------
  // LINK / UNLINK shared rules
  // ---------------------------------------------------------------------------

  describe('claude:memoryLinkSharedRule', () => {
    it.skipIf(IS_WIN)('cree un symlink vers une regle partagee', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      fs.writeFileSync(path.join(sharedDir, 'shared.md'), '# Shared Content', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryLinkSharedRule', {
        projectPath: projectDir,
        filename: 'shared.md',
      })

      expect(result).toEqual({ success: true })

      const linkPath = path.join(projectDir, '.claude', 'rules', 'shared.md')
      expect(fs.existsSync(linkPath)).toBe(true)
      const stat = fs.lstatSync(linkPath)
      expect(stat.isSymbolicLink()).toBe(true)

      const content = fs.readFileSync(linkPath, 'utf-8')
      expect(content).toBe('# Shared Content')
    })

    it('refuse si la regle partagee n existe pas', async () => {
      const result = await mockIpcMain._invoke('claude:memoryLinkSharedRule', {
        projectPath: projectDir,
        filename: 'nonexistent.md',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Shared rule not found')
    })

    it('refuse si une regle locale du meme nom existe (non-symlink)', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      fs.writeFileSync(path.join(sharedDir, 'conflict.md'), '# Shared', 'utf-8')

      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'conflict.md'), '# Local Rule', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryLinkSharedRule', {
        projectPath: projectDir,
        filename: 'conflict.md',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Local rule with same name exists')
      // Local file must not be overwritten
      expect(fs.readFileSync(path.join(rulesDir, 'conflict.md'), 'utf-8')).toBe('# Local Rule')
    })

    it.skipIf(IS_WIN)('remplace un symlink existant du meme nom', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      fs.writeFileSync(path.join(sharedDir, 'update.md'), '# Updated Shared', 'utf-8')

      // Create a valid old target so fs.existsSync on the symlink returns true
      const oldTarget = path.join(TEST_DIR, 'old-target.md')
      fs.writeFileSync(oldTarget, '# Old Target', 'utf-8')

      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      // Create an existing symlink pointing to the old target
      fs.symlinkSync(oldTarget, path.join(rulesDir, 'update.md'))

      const result = await mockIpcMain._invoke('claude:memoryLinkSharedRule', {
        projectPath: projectDir,
        filename: 'update.md',
      })

      expect(result).toEqual({ success: true })
      const target = fs.readlinkSync(path.join(rulesDir, 'update.md'))
      expect(target).toBe(path.join(sharedDir, 'update.md'))
    })
  })

  describe('claude:memoryUnlinkSharedRule', () => {
    it.skipIf(IS_WIN)('supprime un symlink', async () => {
      const sharedDir = path.join(TEST_DIR, '.mirehub', 'shared-rules')
      fs.mkdirSync(sharedDir, { recursive: true })
      fs.writeFileSync(path.join(sharedDir, 'linked.md'), '# Linked', 'utf-8')

      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.symlinkSync(path.join(sharedDir, 'linked.md'), path.join(rulesDir, 'linked.md'))

      const result = await mockIpcMain._invoke('claude:memoryUnlinkSharedRule', {
        projectPath: projectDir,
        filename: 'linked.md',
      })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(path.join(rulesDir, 'linked.md'))).toBe(false)
      // Shared source must still exist
      expect(fs.existsSync(path.join(sharedDir, 'linked.md'))).toBe(true)
    })

    it('refuse de supprimer un fichier qui n est pas un symlink', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'regular.md'), '# Regular', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryUnlinkSharedRule', {
        projectPath: projectDir,
        filename: 'regular.md',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Not a symlink')
      // File must still exist
      expect(fs.existsSync(path.join(rulesDir, 'regular.md'))).toBe(true)
    })

    it('retourne success si le fichier n existe pas', async () => {
      const result = await mockIpcMain._invoke('claude:memoryUnlinkSharedRule', {
        projectPath: projectDir,
        filename: 'nonexistent.md',
      })

      expect(result).toEqual({ success: true })
    })
  })

  // ---------------------------------------------------------------------------
  // SHELL_OPEN_EXTERNAL
  // ---------------------------------------------------------------------------

  describe('shell:openExternal', () => {
    it('ouvre une URL HTTPS', async () => {
      mockShell.openExternal.mockResolvedValue(undefined)

      const result = await mockIpcMain._invoke('shell:openExternal', {
        url: 'https://github.com/SpaceMalamute',
      })

      expect(result).toEqual({ success: true })
      expect(mockShell.openExternal).toHaveBeenCalledWith('https://github.com/SpaceMalamute')
    })

    it('refuse les URLs HTTP (non-HTTPS)', async () => {
      const result = await mockIpcMain._invoke('shell:openExternal', {
        url: 'http://example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Only HTTPS URLs allowed')
      expect(mockShell.openExternal).not.toHaveBeenCalled()
    })

    it('refuse les URLs avec protocole file://', async () => {
      const result = await mockIpcMain._invoke('shell:openExternal', {
        url: 'file:///etc/passwd',
      })

      expect(result.success).toBe(false)
      expect(mockShell.openExternal).not.toHaveBeenCalled()
    })

    it('refuse les URLs avec protocole javascript:', async () => {
      const result = await mockIpcMain._invoke('shell:openExternal', {
        url: 'javascript:alert(1)',
      })

      expect(result.success).toBe(false)
      expect(mockShell.openExternal).not.toHaveBeenCalled()
    })

    it('refuse les chaines vides', async () => {
      const result = await mockIpcMain._invoke('shell:openExternal', {
        url: '',
      })

      expect(result.success).toBe(false)
      expect(mockShell.openExternal).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Workflow complet (integration end-to-end)
  // ---------------------------------------------------------------------------

  describe('workflow complet: init + write + list + export + delete', () => {
    it('execute un cycle complet de gestion de regles', async () => {
      // Step 1: Initialiser CLAUDE.md
      const initResult = await mockIpcMain._invoke('claude:memoryInit', {
        projectPath: projectDir,
      })
      expect(initResult.success).toBe(true)

      // Step 2: Initialiser les regles par defaut
      const defaultsResult = await mockIpcMain._invoke('claude:memoryInitDefaultRules', {
        projectPath: projectDir,
      })
      expect(defaultsResult.success).toBe(true)
      expect(defaultsResult.created).toHaveLength(2)

      // Step 3: Ajouter des regles personnalisees
      await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'conventions/typescript.md',
        content: `---
paths:
  - "**/*.ts"
author: "TestAuthor"
---

# TypeScript Conventions
Use strict mode.`,
      })

      await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'conventions/testing.md',
        content: '# Testing Rules\nUse Vitest.',
      })

      // Step 4: Lister les regles
      const listResult = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })
      expect(listResult.rules.length).toBeGreaterThanOrEqual(4) // 2 default + 2 custom
      expect(listResult.directories).toContain('conventions')

      // Step 5: Lire une regle specifique
      const ruleContent = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'conventions/typescript.md',
      })
      expect(ruleContent).toContain('# TypeScript Conventions')

      // Step 6: Exporter les regles
      const exportPath = path.join(TEST_DIR, 'workflow-export.json')
      mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: exportPath })

      const exportResult = await mockIpcMain._invoke('claude:memoryExportRules', {
        projectPath: projectDir,
      })
      expect(exportResult.success).toBe(true)

      const exported = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
      expect(exported.length).toBeGreaterThanOrEqual(4)

      // Step 7: Deplacer une regle
      await mockIpcMain._invoke('claude:memoryMoveRule', {
        projectPath: projectDir,
        oldPath: 'conventions/testing.md',
        newPath: 'quality/testing.md',
      })

      const movedRule = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'quality/testing.md',
      })
      expect(movedRule).toContain('# Testing Rules')

      // Step 8: Supprimer une regle
      await mockIpcMain._invoke('claude:memoryDeleteRule', {
        projectPath: projectDir,
        filename: 'quality/testing.md',
      })
      const deletedRule = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'quality/testing.md',
      })
      expect(deletedRule).toBeNull()

      // Step 9: Verifier que le repertoire quality a ete nettoye
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      expect(fs.existsSync(path.join(rulesDir, 'quality'))).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Workflow regles partagees
  // ---------------------------------------------------------------------------

  describe('workflow complet: regles partagees + linking', () => {
    it.skipIf(IS_WIN)('cree, lie, et delie une regle partagee', async () => {
      // Step 1: Creer une regle partagee
      await mockIpcMain._invoke('claude:memoryWriteSharedRule', {
        filename: 'shared-conventions.md',
        content: '# Shared Conventions\nApplied across all projects.',
      })

      // Step 2: Lister les regles partagees
      const sharedList = await mockIpcMain._invoke('claude:memoryListSharedRules')
      expect(sharedList).toHaveLength(1)
      expect(sharedList[0].filename).toBe('shared-conventions.md')

      // Step 3: Lier la regle au projet
      const linkResult = await mockIpcMain._invoke('claude:memoryLinkSharedRule', {
        projectPath: projectDir,
        filename: 'shared-conventions.md',
      })
      expect(linkResult.success).toBe(true)

      // Step 4: Verifier que la regle apparait dans les regles du projet (en tant que symlink)
      const projectRules = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })
      const linkedRule = projectRules.rules.find(
        (r: { filename: string }) => r.filename === 'shared-conventions.md',
      )
      expect(linkedRule).toBeDefined()
      expect(linkedRule.isSymlink).toBe(true)
      expect(linkedRule.content).toContain('# Shared Conventions')

      // Step 5: Delier la regle
      const unlinkResult = await mockIpcMain._invoke('claude:memoryUnlinkSharedRule', {
        projectPath: projectDir,
        filename: 'shared-conventions.md',
      })
      expect(unlinkResult.success).toBe(true)

      // Step 6: La regle n apparait plus dans le projet
      const updatedRules = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })
      const removed = updatedRules.rules.find(
        (r: { filename: string }) => r.filename === 'shared-conventions.md',
      )
      expect(removed).toBeUndefined()

      // Step 7: La regle partagee existe toujours
      const finalShared = await mockIpcMain._invoke('claude:memoryListSharedRules')
      expect(finalShared).toHaveLength(1)

      // Step 8: Supprimer la regle partagee
      await mockIpcMain._invoke('claude:memoryDeleteSharedRule', {
        filename: 'shared-conventions.md',
      })
      const emptyShared = await mockIpcMain._invoke('claude:memoryListSharedRules')
      expect(emptyShared).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // Directory operations workflow
  // ---------------------------------------------------------------------------

  describe('workflow: operations sur repertoires', () => {
    it('cree, renomme, et supprime un repertoire de regles', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      // Create
      await mockIpcMain._invoke('claude:memoryCreateRuleDir', {
        projectPath: projectDir,
        dirPath: 'my-category',
      })
      expect(fs.existsSync(path.join(rulesDir, 'my-category'))).toBe(true)

      // Add a rule inside
      await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'my-category/rule.md',
        content: '# Rule in Category',
      })

      // Rename
      await mockIpcMain._invoke('claude:memoryRenameRuleDir', {
        projectPath: projectDir,
        oldPath: 'my-category',
        newPath: 'renamed-category',
      })
      expect(fs.existsSync(path.join(rulesDir, 'my-category'))).toBe(false)
      expect(fs.existsSync(path.join(rulesDir, 'renamed-category'))).toBe(true)
      expect(
        fs.readFileSync(path.join(rulesDir, 'renamed-category', 'rule.md'), 'utf-8'),
      ).toBe('# Rule in Category')

      // Delete
      await mockIpcMain._invoke('claude:memoryDeleteRuleDir', {
        projectPath: projectDir,
        dirPath: 'renamed-category',
      })
      expect(fs.existsSync(path.join(rulesDir, 'renamed-category'))).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases supplementaires
  // ---------------------------------------------------------------------------

  describe('cas limites', () => {
    it('gere un settings.json corrompu (JSON invalide)', async () => {
      const settingsDir = path.join(projectDir, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.json'), '{invalid json!!!', 'utf-8')

      const result = await mockIpcMain._invoke('claude:memoryToggleAuto', {
        projectPath: projectDir,
        enabled: true,
      })

      expect(result).toEqual({ success: true })
      // Should have overwritten with valid JSON
      const settings = JSON.parse(
        fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'),
      )
      expect(settings.autoMemoryEnabled).toBe(true)
    })

    it('ecrit et lit une regle avec contenu vide', async () => {
      await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'empty.md',
        content: '',
      })

      const content = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'empty.md',
      })

      expect(content).toBe('')
    })

    it('ecrit et lit une regle avec caracteres unicode', async () => {
      const unicodeContent = '# Regles\n\nCaracteres speciaux: e a u n 日本語'
      await mockIpcMain._invoke('claude:memoryWriteRule', {
        projectPath: projectDir,
        filename: 'unicode.md',
        content: unicodeContent,
      })

      const content = await mockIpcMain._invoke('claude:memoryReadRule', {
        projectPath: projectDir,
        filename: 'unicode.md',
      })

      expect(content).toBe(unicodeContent)
    })

    it.skipIf(IS_WIN)('listMdFilesRecursive detecte correctement les symlinks vers des .md', async () => {
      const rulesDir = path.join(projectDir, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      // Create a target file outside rules dir
      const targetFile = path.join(TEST_DIR, 'external-rule.md')
      fs.writeFileSync(targetFile, '# External Rule', 'utf-8')

      // Create symlink in rules dir
      fs.symlinkSync(targetFile, path.join(rulesDir, 'linked-rule.md'))

      const result = await mockIpcMain._invoke('claude:memoryListRules', {
        projectPath: projectDir,
      })

      expect(result.rules).toHaveLength(1)
      expect(result.rules[0].isSymlink).toBe(true)
      expect(result.rules[0].symlinkTarget).toBe(targetFile)
      expect(result.rules[0].content).toBe('# External Rule')
    })
  })
})
