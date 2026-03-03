import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-wsenv-ipc-test-${process.pid}-${Date.now()}`)
const projectDir1 = path.join(TEST_DIR, 'projects', 'project-alpha')
const projectDir2 = path.join(TEST_DIR, 'projects', 'project-beta')

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

describe('WorkspaceEnv IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    // Clean up
    if (fs.existsSync(path.join(TEST_DIR, '.kanbai', 'envs'))) {
      fs.rmSync(path.join(TEST_DIR, '.kanbai', 'envs'), { recursive: true, force: true })
    }

    // Recreate clean project directories (remove and remake to clear stale Claude files)
    if (fs.existsSync(projectDir1)) {
      fs.rmSync(projectDir1, { recursive: true, force: true })
    }
    if (fs.existsSync(projectDir2)) {
      fs.rmSync(projectDir2, { recursive: true, force: true })
    }
    fs.mkdirSync(projectDir1, { recursive: true })
    fs.mkdirSync(projectDir2, { recursive: true })

    const { registerWorkspaceEnvHandlers } = await import('../../src/main/ipc/workspaceEnv')

    mockIpcMain = createMockIpcMain()
    registerWorkspaceEnvHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(path.join(TEST_DIR, '.kanbai'))) {
      fs.rmSync(path.join(TEST_DIR, '.kanbai'), { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 3 handlers workspace env', () => {
    expect(mockIpcMain._handlers.has('workspace:envSetup')).toBe(true)
    expect(mockIpcMain._handlers.has('workspace:envPath')).toBe(true)
    expect(mockIpcMain._handlers.has('workspace:envDelete')).toBe(true)
  })

  describe('workspace:envSetup', () => {
    it('cree un env avec des symlinks vers les projets', async () => {
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'Mon Workspace',
        projectPaths: [projectDir1, projectDir2],
      })

      expect(result.success).toBe(true)
      expect(result.envPath).toBeDefined()

      // Verifier que les symlinks existent (filter out .claude created by installActivityHooks)
      const envDir = result.envPath
      const entries = fs.readdirSync(envDir)
      const symlinks = entries.filter((e: string) => fs.lstatSync(path.join(envDir, e)).isSymbolicLink())
      expect(symlinks).toHaveLength(2)
      expect(symlinks).toContain('project-alpha')
      expect(symlinks).toContain('project-beta')

      // Verifier que ce sont des symlinks
      const stat = fs.lstatSync(path.join(envDir, 'project-alpha'))
      expect(stat.isSymbolicLink()).toBe(true)
    })

    it('utilise le nom du workspace pour le dossier', async () => {
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'Mon Projet',
        projectPaths: [projectDir1],
      })

      expect(result.success).toBe(true)
      expect(result.envPath).toContain('Mon Projet')
      expect(result.envPath).toContain(path.join('.kanbai', 'envs'))
    })

    it('sanitize les caracteres speciaux dans le nom', async () => {
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'test/invalid:name*',
        projectPaths: [projectDir1],
      })

      expect(result.success).toBe(true)
      // Les caracteres speciaux doivent etre remplaces par _
      const dirName = path.basename(result.envPath)
      expect(dirName).toBe('test_invalid_name_')
      expect(result.envPath).toContain(path.join('.kanbai', 'envs'))
    })

    it('gere les noms de dossiers dupliques', async () => {
      // Deux projets avec le meme nom de dossier
      const dup1 = path.join(TEST_DIR, 'workspace-a', 'myproject')
      const dup2 = path.join(TEST_DIR, 'workspace-b', 'myproject')
      fs.mkdirSync(dup1, { recursive: true })
      fs.mkdirSync(dup2, { recursive: true })

      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-dup',
        projectPaths: [dup1, dup2],
      })

      expect(result.success).toBe(true)

      const entries = fs.readdirSync(result.envPath)
      const symlinks = entries.filter((e: string) => fs.lstatSync(path.join(result.envPath, e)).isSymbolicLink())
      expect(symlinks).toHaveLength(2)
      // Le deuxieme devrait avoir un suffixe
      expect(symlinks).toContain('myproject')
      expect(symlinks).toContain('myproject-2')
    })

    it('nettoie les symlinks existants avant de recreer', async () => {
      // Premier setup
      await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-clean',
        projectPaths: [projectDir1],
      })

      // Deuxieme setup avec un projet different
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-clean',
        projectPaths: [projectDir2],
      })

      expect(result.success).toBe(true)
      const entries = fs.readdirSync(result.envPath)
      const symlinks = entries.filter((e: string) => fs.lstatSync(path.join(result.envPath, e)).isSymbolicLink())
      expect(symlinks).toHaveLength(1)
      expect(symlinks).toContain('project-beta')
    })

    it('gere un workspace avec un seul projet', async () => {
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-single',
        projectPaths: [projectDir1],
      })

      expect(result.success).toBe(true)
      const entries = fs.readdirSync(result.envPath)
      const symlinks = entries.filter((e: string) => fs.lstatSync(path.join(result.envPath, e)).isSymbolicLink())
      expect(symlinks).toHaveLength(1)
      expect(symlinks).toContain('project-alpha')

      // Verifier que le symlink pointe vers le bon dossier
      const target = fs.readlinkSync(path.join(result.envPath, 'project-alpha'))
      expect(path.resolve(target)).toBe(path.resolve(projectDir1))
    })

    it('gere un workspace avec un projet contenant .claude', async () => {
      // Creer un .claude dans le projet
      const claudeDir = path.join(projectDir1, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir1, 'CLAUDE.md'), '# Project Config')
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{"key":"val"}')

      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-claude',
        projectPaths: [projectDir1],
      })

      expect(result.success).toBe(true)

      // Le symlink doit pointer vers le projet qui contient .claude
      const linkTarget = fs.readlinkSync(path.join(result.envPath, 'project-alpha'))
      expect(path.resolve(linkTarget)).toBe(path.resolve(projectDir1))

      // Via le symlink, on doit pouvoir acceder au .claude
      const claudeMd = fs.readFileSync(path.join(result.envPath, 'project-alpha', 'CLAUDE.md'), 'utf-8')
      expect(claudeMd).toBe('# Project Config')
    })

    it('gere une liste de projets vide', async () => {
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-empty',
        projectPaths: [],
      })

      expect(result.success).toBe(true)
      const entries = fs.readdirSync(result.envPath)
      // installActivityHooks creates .claude/ even with empty projects
      const symlinks = entries.filter((e: string) => fs.lstatSync(path.join(result.envPath, e)).isSymbolicLink())
      expect(symlinks).toHaveLength(0)
    })

    it('copie les regles Claude du premier projet vers la racine env', async () => {
      // Creer des fichiers Claude dans le premier projet
      const claudeDir = path.join(projectDir1, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir1, 'CLAUDE.md'), '# Rules Alpha')
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{"mode":"bypass"}')

      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-claude-rules',
        projectPaths: [projectDir1, projectDir2],
      })

      expect(result.success).toBe(true)

      // Les regles Claude doivent etre copiees a la racine de l'env
      const envClaudeMd = path.join(result.envPath, 'CLAUDE.md')
      const envClaudeSettings = path.join(result.envPath, '.claude', 'settings.json')

      expect(fs.existsSync(envClaudeMd)).toBe(true)
      expect(fs.readFileSync(envClaudeMd, 'utf-8')).toBe('# Rules Alpha')
      expect(fs.existsSync(envClaudeSettings)).toBe(true)
      expect(fs.readFileSync(envClaudeSettings, 'utf-8')).toBe('{"mode":"bypass"}')
    })

    it('utilise le premier projet avec Claude meme si le second en a aussi', async () => {
      // Les deux projets ont des regles Claude
      fs.mkdirSync(path.join(projectDir1, '.claude'), { recursive: true })
      fs.writeFileSync(path.join(projectDir1, 'CLAUDE.md'), '# Alpha Rules')

      fs.mkdirSync(path.join(projectDir2, '.claude'), { recursive: true })
      fs.writeFileSync(path.join(projectDir2, 'CLAUDE.md'), '# Beta Rules')

      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-first-wins',
        projectPaths: [projectDir1, projectDir2],
      })

      expect(result.success).toBe(true)

      // Le premier projet gagne
      const envClaudeMd = fs.readFileSync(path.join(result.envPath, 'CLAUDE.md'), 'utf-8')
      expect(envClaudeMd).toBe('# Alpha Rules')
    })

    it('ne copie pas de regles si aucun projet n en a', async () => {
      const result = await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-no-claude',
        projectPaths: [projectDir1, projectDir2],
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(path.join(result.envPath, 'CLAUDE.md'))).toBe(false)
      // .claude/ exists (created by installActivityHooks) but should NOT contain copied settings.json
      expect(fs.existsSync(path.join(result.envPath, '.claude'))).toBe(true)
      expect(fs.existsSync(path.join(result.envPath, '.claude', 'settings.json'))).toBe(false)
    })

    it('copie uniquement CLAUDE.md si le projet n a pas de dossier .claude', async () => {
      // Seulement CLAUDE.md, pas de dossier .claude
      fs.writeFileSync(path.join(projectDir1, 'CLAUDE.md'), '# Simple Rules')

      const result = await mockIpcMain._invoke<{ success: boolean; envPath: string }>('workspace:envSetup', {
        workspaceName: 'ws-md-only',
        projectPaths: [projectDir1],
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(path.join(result.envPath, 'CLAUDE.md'))).toBe(true)
      expect(fs.readFileSync(path.join(result.envPath, 'CLAUDE.md'), 'utf-8')).toBe('# Simple Rules')
      // .claude/ exists (created by installActivityHooks) but applyCludeRulesToEnv did not copy a .claude dir
      // The .claude dir contains only hook settings, not project-copied settings
      expect(fs.existsSync(path.join(result.envPath, '.claude'))).toBe(true)
      expect(fs.existsSync(path.join(result.envPath, '.claude', 'settings.local.json'))).toBe(true)
    })

    it('remplace les regles Claude lors d un re-setup', async () => {
      // Premier setup avec project-alpha ayant des regles
      fs.writeFileSync(path.join(projectDir1, 'CLAUDE.md'), '# Old Rules')

      await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-re-setup',
        projectPaths: [projectDir1],
      })

      // Modifier les regles du projet
      fs.writeFileSync(path.join(projectDir1, 'CLAUDE.md'), '# New Rules')

      // Deuxieme setup - les regles doivent etre mises a jour
      const result = await mockIpcMain._invoke<{ success: boolean; envPath: string }>('workspace:envSetup', {
        workspaceName: 'ws-re-setup',
        projectPaths: [projectDir1],
      })

      expect(result.success).toBe(true)
      const envClaudeMd = fs.readFileSync(path.join(result.envPath, 'CLAUDE.md'), 'utf-8')
      expect(envClaudeMd).toBe('# New Rules')
    })

    it('prend le second projet si le premier n a pas Claude', async () => {
      // Seulement le second projet a des regles
      fs.mkdirSync(path.join(projectDir2, '.claude'), { recursive: true })
      fs.writeFileSync(path.join(projectDir2, 'CLAUDE.md'), '# Beta Only')

      const result = await mockIpcMain._invoke<{ success: boolean; envPath: string }>('workspace:envSetup', {
        workspaceName: 'ws-second',
        projectPaths: [projectDir1, projectDir2],
      })

      expect(result.success).toBe(true)
      const envClaudeMd = fs.readFileSync(path.join(result.envPath, 'CLAUDE.md'), 'utf-8')
      expect(envClaudeMd).toBe('# Beta Only')
    })
  })

  describe('workspace:envPath', () => {
    it('retourne le chemin de l env existant', async () => {
      await mockIpcMain._invoke('workspace:envSetup', {
        workspaceName: 'ws-path',
        projectPaths: [projectDir1],
      })

      const envPath = await mockIpcMain._invoke('workspace:envPath', {
        workspaceName: 'ws-path',
      })

      expect(envPath).toBeDefined()
      expect(envPath).toContain('ws-path')
    })

    it('retourne null si l env n existe pas', async () => {
      const envPath = await mockIpcMain._invoke('workspace:envPath', {
        workspaceName: 'ws-nonexistent',
      })

      expect(envPath).toBeNull()
    })
  })

  describe('workspace:envDelete', () => {
    it('supprime le dossier env d un workspace', async () => {
      // Setup first
      const setupResult = await mockIpcMain._invoke<{ success: boolean; envPath: string }>('workspace:envSetup', {
        workspaceName: 'ws-to-delete',
        projectPaths: [projectDir1],
      })

      expect(fs.existsSync(setupResult.envPath)).toBe(true)

      // Delete
      const result = await mockIpcMain._invoke<{ success: boolean }>('workspace:envDelete', {
        workspaceName: 'ws-to-delete',
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(setupResult.envPath)).toBe(false)
    })

    it('ne plante pas si le dossier n existe pas', async () => {
      const result = await mockIpcMain._invoke<{ success: boolean }>('workspace:envDelete', {
        workspaceName: 'ws-inexistant',
      })

      expect(result.success).toBe(true)
    })
  })
})
