import { IpcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

import { IPC_CHANNELS } from '../../shared/types/index'
import { installActivityHooks } from '../services/activityHooks'
import { getAllSettingsPaths } from './claude-config-handler'

export function registerClaudeHooksHandlers(ipcMain: IpcMain): void {
  // --- Claude Activity Hooks ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_INSTALL_HOOKS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        // Install hooks in the project and its workspace env
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          installActivityHooks(basePath)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Claude Hooks Check ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_CHECK_HOOKS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
          if (!fs.existsSync(localSettingsPath)) return { installed: false }

          try {
            const content = fs.readFileSync(localSettingsPath, 'utf-8')
            const parsed = JSON.parse(content)
            const hooks = parsed.hooks as Record<string, unknown[]> | undefined
            if (!hooks) return { installed: false }

            const hookIdentifier = 'kanbai-activity.sh'
            const preToolHooks = hooks.PreToolUse as Array<{ hooks?: Array<{ command?: string }> }> | undefined
            const stopHooks = hooks.Stop as Array<{ hooks?: Array<{ command?: string }> }> | undefined

            const hasPreTool = preToolHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes(hookIdentifier)),
            ) ?? false
            const hasStop = stopHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes(hookIdentifier)),
            ) ?? false

            if (!hasPreTool || !hasStop) return { installed: false }
          } catch {
            return { installed: false }
          }
        }
        return { installed: true }
      } catch {
        return { installed: false }
      }
    },
  )

  // --- Claude Remove Hooks ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_REMOVE_HOOKS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        const hookIdentifiers = ['kanbai-activity.sh', 'kanbai-autoapprove.sh', 'kanban-done.sh']
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
          if (!fs.existsSync(localSettingsPath)) continue
          try {
            const content = fs.readFileSync(localSettingsPath, 'utf-8')
            const parsed = JSON.parse(content)
            const hooks = parsed.hooks as Record<string, unknown[]> | undefined
            if (!hooks) continue
            for (const eventKey of Object.keys(hooks)) {
              const entries = hooks[eventKey] as Array<{ hooks?: Array<{ command?: string }> }>
              hooks[eventKey] = entries.filter((entry) =>
                !entry.hooks?.some((hk) => hookIdentifiers.some((id) => hk.command?.includes(id)))
              )
              if ((hooks[eventKey] as unknown[]).length === 0) delete hooks[eventKey]
            }
            if (Object.keys(hooks).length === 0) delete parsed.hooks
            fs.writeFileSync(localSettingsPath, JSON.stringify(parsed, null, 2), 'utf-8')
          } catch { /* skip corrupt */ }
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Claude Check Hooks Status (installed + upToDate) ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_CHECK_HOOKS_STATUS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        let installed = false
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
          if (!fs.existsSync(localSettingsPath)) continue
          try {
            const content = fs.readFileSync(localSettingsPath, 'utf-8')
            const parsed = JSON.parse(content)
            const hooks = parsed.hooks as Record<string, unknown[]> | undefined
            if (!hooks) continue
            const preToolHooks = hooks.PreToolUse as Array<{ hooks?: Array<{ command?: string }> }> | undefined
            const stopHooks = hooks.Stop as Array<{ hooks?: Array<{ command?: string }> }> | undefined
            const hasPreTool = preToolHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes('kanbai-activity.sh'))
            ) ?? false
            const hasStop = stopHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes('kanbai-activity.sh'))
            ) ?? false
            if (hasPreTool && hasStop) installed = true
          } catch { /* ignore */ }
        }

        // Check upToDate: compare installed script content vs expected
        let upToDate = true
        if (installed) {
          const hooksDir = path.join(os.homedir(), '.kanbai', 'hooks')
          const scriptPath = path.join(hooksDir, 'kanbai-activity.sh')
          if (!fs.existsSync(scriptPath)) {
            upToDate = false
          }
        }

        return { installed, upToDate }
      } catch {
        return { installed: false, upToDate: false }
      }
    },
  )

  // --- Claude Export / Import Config ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_EXPORT_CONFIG,
    async (_event, { projectPath }: { projectPath: string }) => {
      const claudeDir = path.join(projectPath, '.claude')
      if (!fs.existsSync(claudeDir)) return { success: false, error: 'No .claude directory found' }
      const result = await dialog.showSaveDialog({
        defaultPath: `claude-config-${Date.now()}.tar.gz`,
        filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }
      try {
        execFileSync('tar', ['czf', result.filePath, '-C', projectPath, '.claude'], { timeout: 30000 })
        return { success: true, filePath: result.filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_IMPORT_CONFIG,
    async (_event, { projectPath }: { projectPath: string }) => {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }],
        properties: ['openFile'],
      })
      const selectedFile = result.filePaths[0]
      if (result.canceled || !selectedFile) return { success: false, error: 'Cancelled' }
      try {
        const claudeDir = path.join(projectPath, '.claude')
        if (fs.existsSync(claudeDir)) {
          const backupName = `.claude-backup-${Date.now()}`
          fs.renameSync(claudeDir, path.join(projectPath, backupName))
        }
        execFileSync('tar', ['xzf', selectedFile, '-C', projectPath], { timeout: 30000 })
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )
}
