import { getTerminalSessions } from '../../ipc/terminal'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const terminalFeature: CompanionFeature = {
  id: 'terminal',
  name: 'Terminal Sessions',
  workspaceScoped: false,
  projectScoped: false,

  async getState(_ctx: CompanionContext): Promise<CompanionResult> {
    const sessions = getTerminalSessions()
    return {
      success: true,
      data: sessions.map((s) => ({
        id: s.id,
        cwd: s.cwd,
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
