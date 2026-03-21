import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { IPC_CHANNELS } from '../../shared/types/index'
import { installActivityHooks } from '../services/activityHooks'

/**
 * Fix a single settings file: ensures permissions is a valid object,
 * migrates top-level allow/deny into permissions, removes corrupt fields.
 */
export function fixSettingsFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(content)

    // Fix permissions: must be an object with allow/deny arrays.
    // If permissions was a string (e.g. "bypassPermissions" from old format),
    // preserve it as _kanbaiMode before resetting.
    if (typeof parsed.permissions === 'string') {
      if (!parsed._kanbaiMode) {
        parsed._kanbaiMode = parsed.permissions
      }
      parsed.permissions = {}
    } else if (typeof parsed.permissions !== 'object' || parsed.permissions === null) {
      parsed.permissions = {}
    }

    // Migrate top-level allow/deny into permissions (old Kanbai format)
    if (Array.isArray(parsed.allow)) {
      parsed.permissions.allow = [
        ...new Set([...(parsed.permissions.allow ?? []), ...parsed.allow]),
      ]
      delete parsed.allow
    }
    if (Array.isArray(parsed.deny)) {
      parsed.permissions.deny = [
        ...new Set([...(parsed.permissions.deny ?? []), ...parsed.deny]),
      ]
      delete parsed.deny
    }

    // Also handle top-level allow/deny that are non-array (e.g. string)
    if ('allow' in parsed && !Array.isArray(parsed.allow)) {
      delete parsed.allow
    }
    if ('deny' in parsed && !Array.isArray(parsed.deny)) {
      delete parsed.deny
    }

    // Ensure allow/deny are arrays of strings
    if (parsed.permissions.allow && !Array.isArray(parsed.permissions.allow)) {
      parsed.permissions.allow = []
    }
    if (parsed.permissions.deny && !Array.isArray(parsed.permissions.deny)) {
      parsed.permissions.deny = []
    }

    // Filter out non-string entries from allow/deny arrays
    if (Array.isArray(parsed.permissions.allow)) {
      parsed.permissions.allow = parsed.permissions.allow.filter(
        (v: unknown) => typeof v === 'string',
      )
    }
    if (Array.isArray(parsed.permissions.deny)) {
      parsed.permissions.deny = parsed.permissions.deny.filter(
        (v: unknown) => typeof v === 'string',
      )
    }

    // Set default allow list if empty (only for settings.json, not settings.local.json)
    if (filePath.endsWith('settings.json') && !filePath.endsWith('settings.local.json')) {
      if (!parsed.permissions.allow || parsed.permissions.allow.length === 0) {
        parsed.permissions.allow = [
          'Bash(npm run *)',
          'Bash(npx *)',
          'Bash(make *)',
          'Bash(git *)',
        ]
      }
    }

    // Fix hooks: must be an object
    if ('hooks' in parsed && typeof parsed.hooks !== 'object') {
      delete parsed.hooks
    }

    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
  } catch {
    // JSON is totally broken — write fresh default
    // For settings.local.json, write empty object; for settings.json, write defaults
    if (filePath.endsWith('settings.local.json')) {
      fs.writeFileSync(filePath, '{}', 'utf-8')
    } else {
      const defaultSettings = {
        permissions: {
          allow: [
            'Bash(npm run *)',
            'Bash(npx *)',
            'Bash(make *)',
            'Bash(git *)',
          ],
        },
      }
      fs.writeFileSync(filePath, JSON.stringify(defaultSettings, null, 2), 'utf-8')
    }
  }
}

/**
 * Collect all paths where .claude/settings.json may live for a given project:
 * 1. The project path itself
 * 2. The workspace env directory (if workspaceName is provided)
 */
export function getAllSettingsPaths(projectPath: string, workspaceName?: string): string[] {
  const paths = [projectPath]

  if (workspaceName) {
    // Direct lookup using workspace name → env dir
    const sanitized = workspaceName.replace(/[/\\:*?"<>|]/g, '_')
    const envDir = path.join(os.homedir(), '.kanbai', 'envs', sanitized)
    if (fs.existsSync(envDir) && envDir !== projectPath) {
      paths.push(envDir)
    }
  }

  return paths
}

export function registerClaudeConfigHandlers(ipcMain: IpcMain): void {
  // Check if a project already has a .claude folder
  ipcMain.handle(IPC_CHANNELS.PROJECT_CHECK_CLAUDE, async (_event, { path: projectPath }: { path: string }) => {
    const claudeDir = path.join(projectPath, '.claude')
    return fs.existsSync(claudeDir)
  })

  // Write Claude settings.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_CLAUDE_SETTINGS,
    async (_event, { projectPath, settings }: { projectPath: string; settings: Record<string, unknown> }) => {
      const claudeDir = path.join(projectPath, '.claude')
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true })
      }
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Write CLAUDE.md
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_CLAUDE_MD,
    async (_event, { projectPath, content }: { projectPath: string; content: string }) => {
      fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), content, 'utf-8')
      return { success: true }
    },
  )

  // Read .claude/settings.local.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_READ_CLAUDE_LOCAL_SETTINGS,
    async (_event, { projectPath }: { projectPath: string }) => {
      const localSettingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      if (fs.existsSync(localSettingsPath)) {
        try {
          return JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
        } catch { return null }
      }
      return null
    },
  )

  // Write .claude/settings.local.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_CLAUDE_LOCAL_SETTINGS,
    async (_event, { projectPath, settings }: { projectPath: string; settings: Record<string, unknown> }) => {
      const claudeDir = path.join(projectPath, '.claude')
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true })
      }
      fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Read ~/.claude/settings.json (user-level, read-only)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_READ_USER_CLAUDE_SETTINGS,
    async () => {
      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
      if (fs.existsSync(userSettingsPath)) {
        try {
          return JSON.parse(fs.readFileSync(userSettingsPath, 'utf-8'))
        } catch { return null }
      }
      return null
    },
  )

  // Write user Claude settings (~/.claude/settings.json)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_USER_CLAUDE_SETTINGS,
    async (_event, settings: Record<string, unknown>) => {
      try {
        const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
        const dir = path.dirname(userSettingsPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(userSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },
  )

  // Read managed settings (/Library/Application Support/ClaudeCode/managed-settings.json)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_READ_MANAGED_SETTINGS,
    async () => {
      try {
        const managedPath = '/Library/Application Support/ClaudeCode/managed-settings.json'
        const content = fs.readFileSync(managedPath, 'utf-8')
        return JSON.parse(content) as Record<string, unknown>
      } catch {
        return null
      }
    },
  )

  // Deploy a fresh .claude config tailored to the target project
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DEPLOY_CLAUDE,
    async (_event, { targetPath, force }: { targetPath: string; force: boolean }) => {
      const targetClaudeDir = path.join(targetPath, '.claude')
      const targetCLAUDEMD = path.join(targetPath, 'CLAUDE.md')

      // If target already has .claude, backup or bail
      if (fs.existsSync(targetClaudeDir)) {
        if (!force) {
          return { success: false, error: 'exists', hasExisting: true }
        }
        const backupDir = path.join(targetPath, '.claude-backup')
        if (fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true })
        }
        fs.renameSync(targetClaudeDir, backupDir)
        if (fs.existsSync(targetCLAUDEMD)) {
          fs.renameSync(targetCLAUDEMD, path.join(targetPath, 'CLAUDE-backup.md'))
        }
      }

      // Create fresh .claude directory
      fs.mkdirSync(targetClaudeDir, { recursive: true })

      // Default project settings (permissive for development)
      const defaultSettings = {
        permissions: {
          allow: [
            'Bash(npm run *)',
            'Bash(npx *)',
            'Bash(make *)',
            'Bash(git *)',
          ],
        },
      }
      fs.writeFileSync(
        path.join(targetClaudeDir, 'settings.json'),
        JSON.stringify(defaultSettings, null, 2),
        'utf-8',
      )

      // Import user's global commands/skills into the project if they exist
      const globalCommandsDir = path.join(os.homedir(), '.claude', 'commands')
      const projectCommandsDir = path.join(targetClaudeDir, 'commands')
      if (fs.existsSync(globalCommandsDir)) {
        fs.cpSync(globalCommandsDir, projectCommandsDir, { recursive: true })
      }

      // Write a prompt file that Claude will use to generate the CLAUDE.md
      const projectName = path.basename(targetPath)
      const initPrompt = [
        `Analyse ce projet "${projectName}" et genere un fichier CLAUDE.md a la racine.`,
        ``,
        `Le CLAUDE.md doit contenir :`,
        `1. **Nom et description** du projet (deduit du code, package.json, README, etc.)`,
        `2. **Stack technique** (langages, frameworks, outils de build)`,
        `3. **Structure du projet** (dossiers principaux et leur role)`,
        `4. **Commandes utiles** (build, test, lint, dev, etc.)`,
        `5. **Conventions de code** (si detectables : style, naming, patterns)`,
        `6. **Instructions specifiques** pour un agent IA travaillant sur ce projet`,
        ``,
        `Sois concis et pragmatique. Le CLAUDE.md est lu par Claude Code a chaque session.`,
        `Ne mets que des informations utiles pour un developpeur/agent IA.`,
        `Ecris le fichier directement avec le Write tool.`,
      ].join('\n')

      const promptPath = path.join(targetClaudeDir, '.init-prompt.md')
      fs.writeFileSync(promptPath, initPrompt, 'utf-8')

      // Install activity hooks for Claude status detection
      installActivityHooks(targetPath)

      return { success: true, initPromptPath: promptPath }
    },
  )

  // Validate Claude settings structure
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_VALIDATE_SETTINGS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      const errors: string[] = []

      for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
        const settingsPath = path.join(basePath, '.claude', 'settings.json')
        const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
        const prefix = basePath === projectPath ? '' : `[env] `

        const filesToCheck: [string, string][] = [
          [`${prefix}settings.json`, settingsPath],
          [`${prefix}settings.local.json`, localSettingsPath],
        ]
        for (const [label, filePath] of filesToCheck) {
          if (!fs.existsSync(filePath)) continue
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const parsed = JSON.parse(content)

            if ('permissions' in parsed && (typeof parsed.permissions !== 'object' || parsed.permissions === null)) {
              errors.push(`${label}: permissions must be an object, got ${typeof parsed.permissions}`)
            }
            if ('allow' in parsed && Array.isArray(parsed.allow)) {
              errors.push(`${label}: allow should be inside permissions object`)
            }
            if ('deny' in parsed && Array.isArray(parsed.deny)) {
              errors.push(`${label}: deny should be inside permissions object`)
            }
            if ('hooks' in parsed && typeof parsed.hooks !== 'object') {
              errors.push(`${label}: hooks must be an object`)
            }
          } catch (err) {
            errors.push(`${label}: invalid JSON — ${String(err)}`)
          }
        }
      }

      return { valid: errors.length === 0, errors }
    },
  )

  // Fix Claude settings structure
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_FIX_SETTINGS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const claudeDir = path.join(basePath, '.claude')
          const settingsPath = path.join(claudeDir, 'settings.json')
          const localSettingsPath = path.join(claudeDir, 'settings.local.json')

          // Fix both settings files (same structural fixes for each)
          fixSettingsFile(settingsPath)
          fixSettingsFile(localSettingsPath)

          // Re-install activity hooks
          installActivityHooks(basePath)
        }

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )
}
