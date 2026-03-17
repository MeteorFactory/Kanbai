import { healthCheckScheduler } from '../../services/healthCheckScheduler'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const healthcheckFeature: CompanionFeature = {
  id: 'healthcheck',
  name: 'Health Checks',
  workspaceScoped: false,
  projectScoped: true,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    if (!ctx.projectPath) return { success: false, error: 'Project path required' }
    const statuses = healthCheckScheduler.getStatuses(ctx.projectPath)
    return { success: true, data: statuses }
  },

  getCommands(): CompanionCommandDef[] {
    return []
  },

  async execute(command: string, _params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    return { success: false, error: `Unknown command: ${command}` }
  },
}
