import { StorageService } from '../../services/storage'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const projectFeature: CompanionFeature = {
  id: 'project',
  name: 'Projects',
  workspaceScoped: true,
  projectScoped: false,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    const storage = new StorageService()
    const projects = storage.getProjects(ctx.workspaceId)
    return {
      success: true,
      data: projects.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        workspaceId: p.workspaceId,
      })),
    }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'get',
        description: 'Get a project by ID',
        params: {
          id: { type: 'string', required: true, description: 'Project ID' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, ctx: CompanionContext): Promise<CompanionResult> {
    const storage = new StorageService()

    if (command === 'get') {
      const id = params.id as string
      if (!id) return { success: false, error: 'Missing project id' }
      const project = storage.getProjects(ctx.workspaceId).find((p) => p.id === id)
      if (!project) return { success: false, error: `Project not found: ${id}` }
      return { success: true, data: project }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
