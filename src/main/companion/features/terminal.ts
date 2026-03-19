import { BrowserWindow } from 'electron'
import { getTerminalSessionsInfo, getTerminalOutputClean, writeTerminalInput, closeTerminalSession } from '../../ipc/terminal'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import { IPC_CHANNELS } from '../../../shared/types'

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

    // Group sessions by tabId so split-pane tabs appear as a single entry.
    // Sessions without a tabId are kept individually.
    const tabMap = new Map<string, typeof filtered>()
    const orphans: typeof filtered = []
    for (const s of filtered) {
      if (s.tabId) {
        const group = tabMap.get(s.tabId)
        if (group) {
          group.push(s)
        } else {
          tabMap.set(s.tabId, [s])
        }
      } else {
        orphans.push(s)
      }
    }

    const tabEntries = Array.from(tabMap.values()).flatMap((group) => {
      // Use the most recently created session as representative — the latest is most likely active
      group.sort((a, b) => b.createdAt - a.createdAt)
      const representative = group[0]
      if (!representative) return []
      // Determine aggregate status for the tab group
      const status = group.some((s) => s.status === 'working')
        ? 'working'
        : group.some((s) => s.status === 'failed')
          ? 'failed'
          : group.every((s) => s.status === 'done')
            ? 'done'
            : group[0]!.status
      // Use the earliest createdAt for elapsed time
      const earliestCreatedAt = Math.min(...group.map((s) => s.createdAt))
      // Collect all session IDs so the mobile app can still interact with individual sessions
      const sessionIds = group.map((s) => s.id)
      return [{
        id: representative.id,
        tabId: representative.tabId,
        taskId: representative.taskId,
        ticketNumber: representative.ticketNumber,
        title: representative.title,
        status,
        elapsed: formatElapsed(earliestCreatedAt),
        sessionIds,
      }]
    })

    const orphanEntries = orphans.map((s) => ({
      id: s.id,
      tabId: s.tabId,
      taskId: s.taskId,
      ticketNumber: s.ticketNumber,
      title: s.title,
      status: s.status,
      elapsed: formatElapsed(s.createdAt),
      sessionIds: [s.id],
    }))

    return {
      success: true,
      data: [...tabEntries, ...orphanEntries],
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
      {
        name: 'createTerminal',
        description: 'Create a new terminal session with an AI provider',
        params: {
          provider: { type: 'string', required: true, description: 'AI provider ID (claude, codex, copilot, gemini)' },
        },
      },
      {
        name: 'closeTerminal',
        description: 'Close/kill a terminal session',
        params: {
          sessionId: { type: 'string', required: true, description: 'Terminal session ID to close' },
        },
      },
      {
        name: 'listProviders',
        description: 'List available AI providers',
        params: {},
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, ctx: CompanionContext): Promise<CompanionResult> {
    if (command === 'getOutput') {
      const sessionId = params.sessionId as string
      if (!sessionId) return { success: false, error: 'Missing sessionId' }
      const output = getTerminalOutputClean(sessionId)
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

    if (command === 'closeTerminal') {
      const sessionId = params.sessionId as string
      if (!sessionId) return { success: false, error: 'Missing sessionId' }
      const removed = closeTerminalSession(sessionId)
      if (!removed) return { success: false, error: `Session not found: ${sessionId}` }
      return { success: true }
    }

    if (command === 'listProviders') {
      const providers = Object.values(AI_PROVIDERS).map((p) => ({
        id: p.id,
        name: p.displayName,
        color: p.detectionColor,
      }))
      return { success: true, data: providers }
    }

    if (command === 'createTerminal') {
      const provider = params.provider as string
      if (!provider) return { success: false, error: 'Missing provider' }
      if (!AI_PROVIDERS[provider as keyof typeof AI_PROVIDERS]) {
        return { success: false, error: `Unknown provider: ${provider}` }
      }
      // Notify the renderer to create a new terminal tab with this provider
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.TERMINAL_COMPANION_CREATE, {
              provider,
              workspaceId: ctx.workspaceId,
            })
          }
        } catch { /* window destroyed */ }
      }
      return { success: true, data: { provider } }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
