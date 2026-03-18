import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, type AiDefaults } from '../../shared/types'
import type { AiProviderId } from '../../shared/types/ai-provider'
import { AI_PROVIDER_IDS, AI_PROVIDERS } from '../../shared/types/ai-provider'
import { crossExecFile, getExtendedToolPaths, PATH_SEP } from '../../shared/platform'
import { StorageService } from '../services/storage'

const storage = new StorageService()

const DEFAULT_AI_DEFAULTS: AiDefaults = {
  kanban: 'claude',
  packages: 'claude',
  packagesModel: '',
  database: 'claude',
  databaseModel: '',
}

function getGlobalAiDefaultsPath(): string {
  return path.join(os.homedir(), '.kanbai', 'ai-defaults.json')
}

function readGlobalAiDefaults(): AiDefaults {
  const configPath = getGlobalAiDefaultsPath()
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      return { ...DEFAULT_AI_DEFAULTS, ...JSON.parse(raw) }
    }
  } catch { /* fallback to defaults */ }
  return { ...DEFAULT_AI_DEFAULTS }
}

function writeGlobalAiDefaults(config: AiDefaults): void {
  const configPath = getGlobalAiDefaultsPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

async function checkProviderInstalled(providerId: AiProviderId): Promise<boolean> {
  const config = AI_PROVIDERS[providerId]
  const env = {
    ...process.env,
    PATH: `${process.env.PATH || ''}${PATH_SEP}${getExtendedToolPaths().join(PATH_SEP)}`,
  }
  try {
    await crossExecFile(config.cliCommand, ['--version'], { timeout: 5000, env })
    return true
  } catch {
    return false
  }
}

export function registerAiProviderHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_SET,
    async (_event, { projectId, provider }: { projectId: string; provider: AiProviderId }) => {
      if (typeof projectId !== 'string') throw new Error('Invalid project ID')
      if (typeof provider !== 'string') throw new Error('Invalid provider')

      const projects = storage.getProjects()
      const project = projects.find((p) => p.id === projectId)
      if (!project) {
        return { success: false, error: 'Project not found' }
      }

      project.aiProvider = provider
      // Keep hasClaude in sync for backward compatibility
      project.hasClaude = provider === 'claude'
      storage.updateProject(project)
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DEFAULTS_SET,
    async (_event, { projectId, defaults }: { projectId: string; defaults: AiDefaults }) => {
      if (typeof projectId !== 'string') throw new Error('Invalid project ID')

      const projects = storage.getProjects()
      const project = projects.find((p) => p.id === projectId)
      if (!project) {
        return { success: false, error: 'Project not found' }
      }

      project.aiDefaults = defaults
      storage.updateProject(project)
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_CHECK_INSTALLED,
    async () => {
      const checks = AI_PROVIDER_IDS.map(async (id) => ({
        id,
        installed: await checkProviderInstalled(id),
      }))
      const results = await Promise.all(checks)
      const status: Record<string, boolean> = {}
      for (const r of results) {
        status[r.id] = r.installed
      }
      return status
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DEFAULTS_GET,
    async (_event, { projectId }: { projectId: string }) => {
      if (typeof projectId !== 'string') throw new Error('Invalid project ID')

      const globalDefaults = readGlobalAiDefaults()
      const projects = storage.getProjects()
      const project = projects.find((p) => p.id === projectId)

      // Get workspace-level defaults if project belongs to a workspace
      const workspaceDefaults: Partial<AiDefaults> = {}
      if (project?.workspaceId) {
        const workspace = storage.getWorkspace(project.workspaceId)
        if (workspace?.aiDefaults) {
          Object.assign(workspaceDefaults, workspace.aiDefaults)
        }
      }

      const projectDefaults = project?.aiDefaults ?? {}

      // Merge: global → workspace → project (project wins)
      return { ...globalDefaults, ...workspaceDefaults, ...projectDefaults }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DEFAULTS_GET_GLOBAL,
    async () => {
      return readGlobalAiDefaults()
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DEFAULTS_SET_GLOBAL,
    async (_event, { defaults }: { defaults: Partial<AiDefaults> }) => {
      const current = readGlobalAiDefaults()
      const updated = { ...current, ...defaults }
      writeGlobalAiDefaults(updated)
      return updated
    },
  )

  // Set AI provider at workspace level
  ipcMain.handle(
    IPC_CHANNELS.AI_WORKSPACE_PROVIDER_SET,
    async (_event, { workspaceId, provider }: { workspaceId: string; provider: AiProviderId | null }) => {
      if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')

      const workspace = storage.getWorkspace(workspaceId)
      if (!workspace) {
        return { success: false, error: 'Workspace not found' }
      }

      workspace.aiProvider = provider
      workspace.updatedAt = Date.now()
      storage.updateWorkspace(workspace)

      // Auto-propagate to projects that don't have their own provider
      const projects = storage.getProjects(workspaceId)
      let updatedCount = 0
      if (provider) {
        for (const project of projects) {
          if (!project.aiProvider) {
            project.aiProvider = provider
            project.hasClaude = provider === 'claude'
            storage.updateProject(project)
            updatedCount++
          }
        }
      }

      return { success: true, updatedCount }
    },
  )

  // Get workspace AI defaults (merged with global)
  ipcMain.handle(
    IPC_CHANNELS.AI_DEFAULTS_GET_WORKSPACE,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')

      const globalDefaults = readGlobalAiDefaults()
      const workspace = storage.getWorkspace(workspaceId)
      const workspaceDefaults = workspace?.aiDefaults ?? {}

      return { ...globalDefaults, ...workspaceDefaults }
    },
  )

  // Also register under the HEAD channel name for backward compatibility
  ipcMain.handle(
    IPC_CHANNELS.AI_WORKSPACE_DEFAULTS_GET,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')

      const workspace = storage.getWorkspace(workspaceId)
      if (!workspace) {
        return {}
      }

      const globalDefaults = readGlobalAiDefaults()
      const workspaceDefaults = workspace.aiDefaults ?? {}
      return { ...globalDefaults, ...workspaceDefaults }
    },
  )

  // Set AI defaults at workspace level and propagate to projects
  ipcMain.handle(
    IPC_CHANNELS.AI_DEFAULTS_SET_WORKSPACE,
    async (_event, { workspaceId, defaults }: { workspaceId: string; defaults: AiDefaults }) => {
      if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')

      const workspace = storage.getWorkspace(workspaceId)
      if (!workspace) {
        return { success: false, error: 'Workspace not found' }
      }

      // Save workspace-level defaults
      workspace.aiDefaults = defaults
      workspace.updatedAt = Date.now()
      storage.updateWorkspace(workspace)

      // Propagate to all projects in the workspace (fill-in-gaps, not overwrite)
      const projects = storage.getProjects(workspaceId)
      let updatedCount = 0
      for (const project of projects) {
        const merged = { ...defaults, ...(project.aiDefaults ?? {}) }
        const hasChanges = JSON.stringify(merged) !== JSON.stringify(project.aiDefaults ?? {})
        if (hasChanges) {
          project.aiDefaults = merged
          storage.updateProject(project)
          updatedCount++
        }
      }

      return { success: true, updatedCount, propagatedCount: projects.length }
    },
  )

  // Also register under the HEAD channel name for backward compatibility
  ipcMain.handle(
    IPC_CHANNELS.AI_WORKSPACE_DEFAULTS_SET,
    async (_event, { workspaceId, defaults }: { workspaceId: string; defaults: AiDefaults }) => {
      if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')

      const workspace = storage.getWorkspace(workspaceId)
      if (!workspace) {
        return { success: false, error: 'Workspace not found' }
      }

      workspace.aiDefaults = defaults
      workspace.updatedAt = Date.now()
      storage.updateWorkspace(workspace)

      const projects = storage.getProjects(workspaceId)
      let updatedCount = 0
      for (const project of projects) {
        const merged = { ...defaults, ...(project.aiDefaults ?? {}) }
        const hasChanges = JSON.stringify(merged) !== JSON.stringify(project.aiDefaults ?? {})
        if (hasChanges) {
          project.aiDefaults = merged
          storage.updateProject(project)
          updatedCount++
        }
      }

      return { success: true, updatedCount }
    },
  )

  // Propagate workspace AI profile to all its projects
  ipcMain.handle(
    IPC_CHANNELS.AI_WORKSPACE_PROPAGATE,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')

      const workspace = storage.getWorkspace(workspaceId)
      if (!workspace) {
        return { success: false, error: 'Workspace not found' }
      }

      const projects = storage.getProjects(workspaceId)
      let updatedCount = 0

      for (const project of projects) {
        let changed = false

        // Propagate aiProvider if workspace has one and project doesn't
        if (workspace.aiProvider && !project.aiProvider) {
          project.aiProvider = workspace.aiProvider
          project.hasClaude = workspace.aiProvider === 'claude'
          changed = true
        }

        // Propagate aiDefaults: workspace defaults fill in missing project defaults
        if (workspace.aiDefaults) {
          const merged = { ...workspace.aiDefaults, ...(project.aiDefaults ?? {}) }
          const hasChanges = JSON.stringify(merged) !== JSON.stringify(project.aiDefaults ?? {})
          if (hasChanges) {
            project.aiDefaults = merged
            changed = true
          }
        }

        if (changed) {
          storage.updateProject(project)
          updatedCount++
        }
      }

      return { success: true, updatedCount }
    },
  )

  // Check if multi-agent is enabled for a given provider and project path
  ipcMain.handle(
    IPC_CHANNELS.AI_CHECK_MULTI_AGENT,
    async (_event, { provider, projectPath }: { provider: AiProviderId; projectPath: string }) => {
      if (typeof provider !== 'string' || typeof projectPath !== 'string') {
        return { enabled: false }
      }

      try {
        if (provider === 'claude') {
          // Check Claude: env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS in settings
          // Priority: project local settings > user global settings
          const localSettingsPath = path.join(projectPath, '.claude', 'settings.local.json')
          const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')

          for (const settingsPath of [localSettingsPath, userSettingsPath]) {
            try {
              if (fs.existsSync(settingsPath)) {
                const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
                const envVars = raw?.env as Record<string, string> | undefined
                if (envVars?.['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1') {
                  return { enabled: true }
                }
              }
            } catch { /* continue to next file */ }
          }
          return { enabled: false }
        }

        if (provider === 'codex') {
          // Check Codex: multi_agent in [features] section of .codex/config.toml
          const configPath = path.join(projectPath, '.codex', 'config.toml')
          try {
            if (fs.existsSync(configPath)) {
              const content = fs.readFileSync(configPath, 'utf-8')
              // Simple TOML check: look for multi_agent = true in [features] section
              const featuresMatch = content.match(/\[features\]([\s\S]*?)(?:\[|$)/)
              if (featuresMatch?.[1]) {
                const featuresSection = featuresMatch[1]
                if (/multi_agent\s*=\s*true/.test(featuresSection)) {
                  return { enabled: true }
                }
              }
            }
          } catch { /* fallback */ }
          return { enabled: false }
        }

        if (provider === 'gemini') {
          // Check Gemini: experimental.enableAgents in .gemini/settings.json
          const configPath = path.join(projectPath, '.gemini', 'settings.json')
          try {
            if (fs.existsSync(configPath)) {
              const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
              if (raw?.experimental?.enableAgents === true) {
                return { enabled: true }
              }
            }
          } catch { /* fallback */ }
          return { enabled: false }
        }

        // Copilot: no multi-agent support currently
        return { enabled: false }
      } catch {
        return { enabled: false }
      }
    },
  )
}
