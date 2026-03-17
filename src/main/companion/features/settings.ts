import { StorageService } from '../../services/storage'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const settingsFeature: CompanionFeature = {
  id: 'settings',
  name: 'Settings',
  workspaceScoped: false,
  projectScoped: false,

  async getState(_ctx: CompanionContext): Promise<CompanionResult> {
    const storage = new StorageService()
    const settings = storage.getSettings()
    return { success: true, data: settings }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'update',
        description: 'Update settings (partial)',
        params: {
          settings: { type: 'object', required: true, description: 'Partial settings object to merge' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    if (command === 'update') {
      const updates = params.settings as Record<string, unknown>
      if (!updates || typeof updates !== 'object') return { success: false, error: 'Missing settings object' }

      const storage = new StorageService()
      const current = storage.getSettings()
      const merged = { ...current, ...updates }
      storage.updateSettings(merged)
      return { success: true, data: merged }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
