import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IS_WIN, IS_MAC } from '../helpers/platform'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-hooks-test-${process.pid}-${Date.now()}`)

// Mock os.homedir to isolate all filesystem operations to a temp directory
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: { ...actual, homedir: () => TEST_DIR },
    homedir: () => TEST_DIR,
  }
})

// Mock electron (BrowserWindow used in startActivityWatcher)
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

// Mock StorageService singleton
const mockGetSettings = vi.fn(() => ({ autoApprove: false }))
vi.mock('../../src/main/services/storage', () => ({
  StorageService: vi.fn(() => ({
    getSettings: mockGetSettings,
  })),
}))

// Mock notification service (imported by activityHooks for broadcastActivityFromFile)
vi.mock('../../src/main/services/notificationService', () => ({
  sendNotification: vi.fn(),
  sendSilentNotification: vi.fn(),
  playBellRepeat: vi.fn(),
}))

// Import after all mocks are set up
const {
  ensureActivityHookScript,
  ensureAutoApproveScript,
  ensureKanbanDoneScript,
  installActivityHooks,
  syncAllWorkspaceEnvHooks,
} = await import('../../src/main/services/activityHooks')

const SCRIPT_EXT = IS_WIN ? '.ps1' : '.sh'

describe('activityHooks', () => {
  const hooksDir = path.join(TEST_DIR, '.mirehub', 'hooks')
  const activityDir = path.join(TEST_DIR, '.mirehub', 'activity')
  const envsDir = path.join(TEST_DIR, '.mirehub', 'envs')

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSettings.mockReturnValue({ autoApprove: false })

    // Clean up mirehub directory between tests
    const mirehubDir = path.join(TEST_DIR, '.mirehub')
    if (fs.existsSync(mirehubDir)) {
      fs.rmSync(mirehubDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('ensureActivityHookScript', () => {
    it('cree le script dans ~/.mirehub/hooks/', () => {
      ensureActivityHookScript()

      const scriptPath = path.join(hooksDir, `mirehub-activity${SCRIPT_EXT}`)
      expect(fs.existsSync(scriptPath)).toBe(true)
    })

    it('cree aussi le repertoire activity', () => {
      ensureActivityHookScript()

      expect(fs.existsSync(activityDir)).toBe(true)
    })

    it.skipIf(IS_WIN)('le script est executable (mode 0o755)', () => {
      ensureActivityHookScript()

      const scriptPath = path.join(hooksDir, `mirehub-activity${SCRIPT_EXT}`)
      const stat = fs.statSync(scriptPath)
      // Check owner executable bit (0o100) is set
      const mode = stat.mode & 0o777
      expect(mode & 0o111).toBeGreaterThan(0)
    })

    it('le script contient les bonnes variables et la logique de hash', () => {
      ensureActivityHookScript()

      const scriptPath = path.join(hooksDir, `mirehub-activity${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).toContain('MIREHUB_NL_QUERY')
      if (IS_MAC) {
        expect(content).toContain('#!/bin/bash')
        expect(content).toContain('STATUS_DIR="$HOME/.mirehub/activity"')
        expect(content).toContain('md5')
        expect(content).toContain('STATUS="${1:-working}"')
      }
      if (IS_WIN) {
        expect(content).toContain('$args[0]')
        expect(content).toContain('MD5')
      }
    })

    it('le script contient la logique de throttle pour le status working', () => {
      ensureActivityHookScript()

      const scriptPath = path.join(hooksDir, `mirehub-activity${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content.toLowerCase()).toContain('working')
      expect(content).toContain('30')
    })

    it('est idempotent (peut etre appele plusieurs fois)', () => {
      ensureActivityHookScript()
      const scriptPath = path.join(hooksDir, `mirehub-activity${SCRIPT_EXT}`)
      const firstContent = fs.readFileSync(scriptPath, 'utf-8')

      ensureActivityHookScript()
      const secondContent = fs.readFileSync(scriptPath, 'utf-8')

      expect(firstContent).toBe(secondContent)
    })
  })

  describe('ensureAutoApproveScript', () => {
    it('en mode kanban seulement, contient le check MIREHUB_KANBAN_TASK_ID', () => {
      ensureAutoApproveScript(false)

      const scriptPath = path.join(hooksDir, `mirehub-autoapprove${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).toContain('MIREHUB_KANBAN_TASK_ID')
      expect(content).toContain('exit 0')
      expect(content).toContain('permissionDecision')
      expect(content).toContain('"allow"')
    })

    it('en mode global, ne contient pas le check kanban', () => {
      ensureAutoApproveScript(true)

      const scriptPath = path.join(hooksDir, `mirehub-autoapprove${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).not.toContain('[ -z "$MIREHUB_KANBAN_TASK_ID" ] && exit 0')
      expect(content).toContain('Global auto-approve enabled')
      expect(content).toContain('permissionDecision')
    })

    it.skipIf(IS_WIN)('le script est executable', () => {
      ensureAutoApproveScript()

      const scriptPath = path.join(hooksDir, `mirehub-autoapprove${SCRIPT_EXT}`)
      const stat = fs.statSync(scriptPath)
      const mode = stat.mode & 0o777
      expect(mode & 0o111).toBeGreaterThan(0)
    })

    it('cree le repertoire hooks si inexistant', () => {
      expect(fs.existsSync(hooksDir)).toBe(false)

      ensureAutoApproveScript()

      expect(fs.existsSync(hooksDir)).toBe(true)
    })
  })

  describe('ensureKanbanDoneScript', () => {
    it('cree le script de completion kanban', () => {
      ensureKanbanDoneScript()

      const scriptPath = path.join(hooksDir, `kanban-done${SCRIPT_EXT}`)
      expect(fs.existsSync(scriptPath)).toBe(true)
    })

    it.skipIf(IS_WIN)('le script est executable', () => {
      ensureKanbanDoneScript()

      const scriptPath = path.join(hooksDir, `kanban-done${SCRIPT_EXT}`)
      const stat = fs.statSync(scriptPath)
      const mode = stat.mode & 0o777
      expect(mode & 0o111).toBeGreaterThan(0)
    })

    it('contient la logique de blocage pour le status WORKING', () => {
      ensureKanbanDoneScript()

      const scriptPath = path.join(hooksDir, `kanban-done${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).toContain('WORKING')
      // Bash uses node JSON.stringify({ decision: 'block', ... })
      // PowerShell uses inline JSON string '{"decision":"block",...}'
      if (IS_WIN) {
        expect(content).toContain('"decision":"block"')
      } else {
        expect(content).toContain("decision: 'block'")
      }
      expect(content).toContain('MIREHUB_KANBAN_TASK_ID')
      expect(content).toContain('MIREHUB_KANBAN_FILE')
    })

    it('contient la logique PENDING pour CTO et non-CTO', () => {
      ensureKanbanDoneScript()

      const scriptPath = path.join(hooksDir, `kanban-done${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).toContain('PENDING')
      // Bash uses IS_CTO variable, PowerShell uses $isCto
      if (IS_WIN) {
        expect(content).toContain('$isCto')
      } else {
        expect(content).toContain('IS_CTO')
      }
      expect(content).toContain('TODO')
    })

    it('contient la gestion du status FAILED', () => {
      ensureKanbanDoneScript()

      const scriptPath = path.join(hooksDir, `kanban-done${SCRIPT_EXT}`)
      const content = fs.readFileSync(scriptPath, 'utf-8')

      expect(content).toContain('FAILED')
      expect(content).toContain(`mirehub-activity${SCRIPT_EXT}`)
    })
  })

  describe('installActivityHooks', () => {
    it('cree .claude/settings.local.json dans le projet', () => {
      const projectPath = path.join(TEST_DIR, 'test-project')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      expect(fs.existsSync(settingsPath)).toBe(true)
    })

    it('ajoute les hooks PreToolUse, PermissionRequest, PostToolUse et Stop', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-hooks')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

      expect(settings.hooks).toBeDefined()
      expect(settings.hooks.PreToolUse).toBeDefined()
      expect(settings.hooks.PermissionRequest).toBeDefined()
      expect(settings.hooks.PostToolUse).toBeDefined()
      expect(settings.hooks.Stop).toBeDefined()
    })

    it('PreToolUse contient activity working et autoapprove', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-pre')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      const preToolHooks = settings.hooks.PreToolUse as Array<{ hooks: Array<{ command: string }> }>

      const commands = preToolHooks.flatMap((h) => h.hooks.map((hk) => hk.command))
      expect(commands.some((cmd: string) => cmd.includes(`mirehub-activity${SCRIPT_EXT}`) && cmd.includes('working'))).toBe(true)
      expect(commands.some((cmd: string) => cmd.includes(`mirehub-autoapprove${SCRIPT_EXT}`))).toBe(true)
    })

    it('PermissionRequest contient le hook activity "ask"', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-perm')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      const permHooks = settings.hooks.PermissionRequest as Array<{ hooks: Array<{ command: string }> }>

      const commands = permHooks.flatMap((h) => h.hooks.map((hk) => hk.command))
      expect(commands.some((cmd: string) => cmd.includes(`mirehub-activity${SCRIPT_EXT}`) && cmd.includes('ask'))).toBe(true)
    })

    it('Stop contient kanban-done et activity done', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-stop')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      const stopHooks = settings.hooks.Stop as Array<{ hooks: Array<{ command: string }> }>

      const commands = stopHooks.flatMap((h) => h.hooks.map((hk) => hk.command))
      expect(commands.some((cmd: string) => cmd.includes(`kanban-done${SCRIPT_EXT}`))).toBe(true)
      expect(commands.some((cmd: string) => cmd.includes(`mirehub-activity${SCRIPT_EXT}`) && cmd.includes('done'))).toBe(true)
    })

    it('kanban-done est en premier dans Stop (avant activity done)', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-order')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      const stopHooks = settings.hooks.Stop as Array<{ hooks: Array<{ command: string }> }>

      // kanban-done should be at index 0 (unshift)
      const firstCommand = stopHooks[0]!.hooks[0]!.command
      expect(firstCommand).toContain(`kanban-done${SCRIPT_EXT}`)
    })

    it('merge avec des hooks existants sans les ecraser', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-merge')
      const claudeDir = path.join(projectPath, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })

      // Pre-existing settings with a custom hook
      const existingSettings = {
        hooks: {
          PreToolUse: [
            {
              matcher: 'custom',
              hooks: [{ type: 'command', command: 'echo "custom hook"' }],
            },
          ],
        },
        otherSetting: 'preserved',
      }
      fs.writeFileSync(
        path.join(claudeDir, 'settings.local.json'),
        JSON.stringify(existingSettings, null, 2),
        'utf-8',
      )

      installActivityHooks(projectPath)

      const settingsPath = path.join(claudeDir, 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

      // Custom hook is still there
      const preToolHooks = settings.hooks.PreToolUse as Array<{ matcher: string; hooks: Array<{ command: string }> }>
      expect(preToolHooks.some((h) => h.matcher === 'custom')).toBe(true)

      // Mirehub hooks were added
      const commands = preToolHooks.flatMap((h) => h.hooks.map((hk) => hk.command))
      expect(commands.some((cmd: string) => cmd.includes(`mirehub-activity${SCRIPT_EXT}`))).toBe(true)

      // Other settings are preserved
      expect(settings.otherSetting).toBe('preserved')
    })

    it('est idempotent (pas de doublons a appel multiple)', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-idempotent')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)
      installActivityHooks(projectPath)
      installActivityHooks(projectPath)

      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

      // Each hook type should have the exact number of entries, not duplicates
      const preToolHooks = settings.hooks.PreToolUse as Array<{ hooks: Array<{ command: string }> }>
      const activityWorkingCount = preToolHooks.filter((h) =>
        h.hooks.some((hk) => hk.command.includes(`mirehub-activity${SCRIPT_EXT}`)),
      ).length
      expect(activityWorkingCount).toBe(1)

      const autoApproveCount = preToolHooks.filter((h) =>
        h.hooks.some((hk) => hk.command.includes(`mirehub-autoapprove${SCRIPT_EXT}`)),
      ).length
      expect(autoApproveCount).toBe(1)

      const stopHooks = settings.hooks.Stop as Array<{ hooks: Array<{ command: string }> }>
      const kanbanDoneCount = stopHooks.filter((h) =>
        h.hooks.some((hk) => hk.command.includes(`kanban-done${SCRIPT_EXT}`)),
      ).length
      expect(kanbanDoneCount).toBe(1)
    })

    it('cree le repertoire .claude si inexistant', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-nodir')
      fs.mkdirSync(projectPath, { recursive: true })

      const claudeDir = path.join(projectPath, '.claude')
      expect(fs.existsSync(claudeDir)).toBe(false)

      installActivityHooks(projectPath)

      expect(fs.existsSync(claudeDir)).toBe(true)
    })

    it('genere les trois scripts de hooks', () => {
      const projectPath = path.join(TEST_DIR, 'test-project-scripts')
      fs.mkdirSync(projectPath, { recursive: true })

      installActivityHooks(projectPath)

      expect(fs.existsSync(path.join(hooksDir, `mirehub-activity${SCRIPT_EXT}`))).toBe(true)
      expect(fs.existsSync(path.join(hooksDir, `mirehub-autoapprove${SCRIPT_EXT}`))).toBe(true)
      expect(fs.existsSync(path.join(hooksDir, `kanban-done${SCRIPT_EXT}`))).toBe(true)
    })
  })

  describe('syncAllWorkspaceEnvHooks', () => {
    it('ne plante pas si le repertoire envs n existe pas', () => {
      expect(fs.existsSync(envsDir)).toBe(false)

      expect(() => syncAllWorkspaceEnvHooks()).not.toThrow()
    })

    it('itere les repertoires ~/.mirehub/envs/ et installe les hooks', () => {
      // Create fake env directories
      const env1 = path.join(envsDir, 'project-alpha')
      const env2 = path.join(envsDir, 'project-beta')
      fs.mkdirSync(env1, { recursive: true })
      fs.mkdirSync(env2, { recursive: true })

      syncAllWorkspaceEnvHooks()

      // Both envs should have hooks installed
      expect(fs.existsSync(path.join(env1, '.claude', 'settings.local.json'))).toBe(true)
      expect(fs.existsSync(path.join(env2, '.claude', 'settings.local.json'))).toBe(true)
    })

    it('ignore les entrees non-repertoire', () => {
      fs.mkdirSync(envsDir, { recursive: true })

      // Create a file (not a directory) in envs/
      fs.writeFileSync(path.join(envsDir, 'not-a-directory.txt'), 'some content')

      // Create a real directory
      const envDir = path.join(envsDir, 'real-project')
      fs.mkdirSync(envDir, { recursive: true })

      expect(() => syncAllWorkspaceEnvHooks()).not.toThrow()

      // Only the directory got hooks
      expect(fs.existsSync(path.join(envDir, '.claude', 'settings.local.json'))).toBe(true)
      // The file is unchanged
      expect(fs.readFileSync(path.join(envsDir, 'not-a-directory.txt'), 'utf-8')).toBe('some content')
    })

    it('fonctionne avec un repertoire envs vide', () => {
      fs.mkdirSync(envsDir, { recursive: true })

      expect(() => syncAllWorkspaceEnvHooks()).not.toThrow()
    })
  })
})
