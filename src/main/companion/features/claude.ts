import { getClaudeSessions } from '../../ipc/claude'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const claudeFeature: CompanionFeature = {
  id: 'claude',
  name: 'Claude Sessions',
  workspaceScoped: false,
  projectScoped: false,

  async getState(_ctx: CompanionContext): Promise<CompanionResult> {
    const sessions = getClaudeSessions()
    return {
      success: true,
      data: sessions.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        status: s.status,
        prompt: s.prompt,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        loopMode: s.loopMode,
        loopCount: s.loopCount,
      })),
    }
  },

  getCommands(): CompanionCommandDef[] {
    return []
  },

  async execute(command: string, _params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    return { success: false, error: `Unknown command: ${command}` }
  },
}
