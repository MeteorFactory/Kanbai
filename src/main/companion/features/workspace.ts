import { StorageService } from '../../services/storage'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const workspaceFeature: CompanionFeature = {
  id: 'workspace',
  name: 'Workspaces',
  workspaceScoped: false,
  projectScoped: false,

  async getState(_ctx: CompanionContext): Promise<CompanionResult> {
    const storage = new StorageService()
    const workspaces = storage.getWorkspaces()
    const namespaces = storage.getNamespaces()

    const result = workspaces.map((w) => {
      const ns = namespaces.find((n) => n.id === w.namespaceId)
      return {
        id: w.id,
        name: w.name,
        namespace: ns?.name ?? null,
        namespaceId: w.namespaceId ?? null,
      }
    })
    return { success: true, data: result }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'get',
        description: 'Get a workspace by ID',
        params: {
          id: { type: 'string', required: true, description: 'Workspace ID' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    const storage = new StorageService()

    if (command === 'get') {
      const id = params.id as string
      if (!id) return { success: false, error: 'Missing workspace id' }
      const ws = storage.getWorkspaces().find((w) => w.id === id)
      if (!ws) return { success: false, error: `Workspace not found: ${id}` }
      return { success: true, data: ws }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
