import { getTerminalSessionsInfo, getTerminalOutput, writeTerminalInput } from '../../ipc/terminal'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

function formatElapsed(createdAt: number): string {
  const seconds = Math.floor((Date.now() - createdAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ''}`
}

export const terminalFeature: CompanionFeature = {
  id: 'terminal-sessions',
  name: 'Terminal Sessions',
  workspaceScoped: true,
  projectScoped: false,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    const sessions = getTerminalSessionsInfo()

    // Filter by workspace if provided
    const filtered = ctx.workspaceId
      ? sessions.filter((s) => s.workspaceId === ctx.workspaceId || !s.workspaceId)
      : sessions

    return {
      success: true,
      data: filtered.map((s) => ({
        id: s.id,
        tabId: s.tabId,
        taskId: s.taskId,
        ticketNumber: s.ticketNumber,
        title: s.title,
        status: s.status,
        elapsed: formatElapsed(s.createdAt),
      })),
    }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'getOutput',
        description: 'Get recent terminal output for a session',
        params: {
          sessionId: { type: 'string', required: true, description: 'Terminal session ID' },
        },
      },
      {
        name: 'sendInput',
        description: 'Send input to a terminal session',
        params: {
          sessionId: { type: 'string', required: true, description: 'Terminal session ID' },
          data: { type: 'string', required: true, description: 'Input data to send' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    if (command === 'getOutput') {
      const sessionId = params.sessionId as string
      if (!sessionId) return { success: false, error: 'Missing sessionId' }
      const output = getTerminalOutput(sessionId)
      return { success: true, data: { output } }
    }

    if (command === 'sendInput') {
      const sessionId = params.sessionId as string
      const data = params.data as string
      if (!sessionId) return { success: false, error: 'Missing sessionId' }
      if (!data && data !== '') return { success: false, error: 'Missing data' }
      const ok = writeTerminalInput(sessionId, data)
      if (!ok) return { success: false, error: `Terminal session not found: ${sessionId}` }
      return { success: true }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
