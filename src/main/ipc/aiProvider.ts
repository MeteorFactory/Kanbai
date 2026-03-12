import { IpcMain } from 'electron'
import { IPC_CHANNELS, type AiDefaults } from '../../shared/types'
import type { AiProviderId } from '../../shared/types/ai-provider'
import { AI_PROVIDER_IDS, AI_PROVIDERS } from '../../shared/types/ai-provider'
import { crossExecFile, getExtendedToolPaths, PATH_SEP } from '../../shared/platform'
import { StorageService } from '../services/storage'

const storage = new StorageService()

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

      const projects = storage.getProjects()
      const project = projects.find((p) => p.id === projectId)
      return project?.aiDefaults ?? {}
    },
  )
}
