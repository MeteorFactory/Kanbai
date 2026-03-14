import type { IpcMain, BrowserWindow } from 'electron'
import crypto from 'crypto'
import http from 'http'
import type { KanbanTask } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'
import { startCompanionServer, stopCompanionServer, getCompanionServerInfo } from '../services/companion-server'
import { readKanbanTasks, updateKanbanTask } from '../../mcp-server/lib/kanban-store'

const API_HOST = process.env['KANBAI_API_HOST'] ?? 'localhost'
const API_PORT = parseInt(process.env['KANBAI_API_PORT'] ?? '3847', 10)

let currentToken: string | null = null
let currentWorkspaceId: string | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let changePollTimer: ReturnType<typeof setInterval> | null = null

/** Modifiable fields from the companion app */
const ALLOWED_UPDATE_FIELDS = new Set([
  'status',
  'title',
  'description',
  'priority',
  'type',
  'dueDate',
  'archived',
  'disabled',
  'comments',
])

interface CompanionTicketChange {
  id: string
  changeId: string
  taskId: string
  updates: Partial<KanbanTask>
}

function apiRequest<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const req = http.request({ hostname: API_HOST, port: API_PORT, path, method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`))
          return
        }
        if (!raw || res.statusCode === 204) {
          resolve(null as T)
          return
        }
        try {
          resolve(JSON.parse(raw) as T)
        } catch {
          reject(new Error(`Invalid JSON: ${raw}`))
        }
      })
    })
    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function stopChangePoll(): void {
  if (changePollTimer) {
    clearInterval(changePollTimer)
    changePollTimer = null
  }
}

/** Filter update payload to only allowed fields */
function sanitizeUpdates(updates: Record<string, unknown>): Partial<KanbanTask> {
  const sanitized: Record<string, unknown> = {}
  for (const key of Object.keys(updates)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      sanitized[key] = updates[key]
    }
  }
  return sanitized as Partial<KanbanTask>
}

/** Push current tickets to the companion API so the companion app can display them */
async function syncTicketsToCompanion(workspaceId: string): Promise<void> {
  if (!currentToken) throw new Error('Companion not connected')

  const tasks = readKanbanTasks(workspaceId)

  // Send a lightweight version of tickets (exclude large fields like conversationHistoryPath)
  const lightTasks = tasks.map((t) => ({
    id: t.id,
    workspaceId: t.workspaceId,
    ticketNumber: t.ticketNumber,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    type: t.type,
    agentId: t.agentId,
    question: t.question,
    result: t.result,
    error: t.error,
    comments: t.comments,
    dueDate: t.dueDate,
    archived: t.archived,
    disabled: t.disabled,
    isCtoTicket: t.isCtoTicket,
    parentTicketId: t.parentTicketId,
    childTicketIds: t.childTicketIds,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }))

  await apiRequest<unknown>(
    'PUT',
    '/api/v1/kanban/sync',
    { workspaceId, tickets: lightTasks },
    currentToken,
  )
}

/** Poll the companion API for pending ticket modifications */
function startChangePoll(getWindow: () => BrowserWindow | null): void {
  stopChangePoll()
  changePollTimer = setInterval(async () => {
    if (!currentToken || !currentWorkspaceId) return

    try {
      const result = await apiRequest<{ changes: CompanionTicketChange[] }>(
        'GET',
        `/api/v1/kanban/changes?workspaceId=${encodeURIComponent(currentWorkspaceId)}`,
        undefined,
        currentToken,
      )

      if (!result.changes || result.changes.length === 0) return

      for (const change of result.changes) {
        try {
          const sanitized = sanitizeUpdates(change.updates as Record<string, unknown>)
          if (Object.keys(sanitized).length === 0) continue

          const updated = updateKanbanTask(currentWorkspaceId, change.taskId, sanitized)

          // Notify the renderer of the update
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.COMPANION_TICKET_UPDATED, updated)
          }

          // Acknowledge the change was processed
          await apiRequest<unknown>(
            'POST',
            `/api/v1/kanban/changes/${change.changeId}/ack`,
            undefined,
            currentToken,
          ).catch(() => {
            // Best effort acknowledgement
          })
        } catch (err) {
          console.error(`[Companion] Failed to apply ticket change ${change.changeId}:`, (err as Error).message)
        }
      }
    } catch {
      // Silently skip — companion API may be temporarily unreachable
    }
  }, 3000)
}

function startPolling(code: string, getWindow: () => BrowserWindow | null): void {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const status = await apiRequest<{ status: string; companionId?: string; companionName?: string }>(
        'GET',
        `/api/v1/pair/status/${code}`,
      )
      const win = getWindow()
      if (!win || win.isDestroyed()) return

      if (status.status === 'connected') {
        stopPolling()
        // Start data server for companion data retrieval
        if (currentToken) {
          startCompanionServer(currentToken)
            .then((info) => {
              win.webContents.send(IPC_CHANNELS.COMPANION_DATA_INFO, info)
            })
            .catch((err) => {
              console.error('[Companion] Failed to start data server:', err)
            })
        }
        win.webContents.send(IPC_CHANNELS.COMPANION_STATUS_CHANGED, 'connected', status.companionName ?? null)

        // Start polling for ticket changes once connected
        startChangePoll(getWindow)

        // Auto-sync tickets on connection
        if (currentWorkspaceId) {
          syncTicketsToCompanion(currentWorkspaceId).catch((err) => {
            console.error('[Companion] Initial ticket sync failed:', (err as Error).message)
          })
        }
      } else if (status.status === 'expired') {
        stopPolling()
        stopCompanionServer()
        stopChangePoll()
        currentToken = null
        win.webContents.send(IPC_CHANNELS.COMPANION_STATUS_CHANGED, 'disconnected')
      }
    } catch {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.COMPANION_STATUS_CHANGED, 'lost')
      }
    }
  }, 2000)
}

export function registerCompanionHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.COMPANION_REGISTER, async (_event, workspaceId: string) => {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase()

    const result = await apiRequest<{ sessionId: string; token: string }>(
      'POST',
      '/api/v1/pair/register',
      { code, appId: 'kanbai-desktop', workspaceId },
    )

    currentToken = result.token
    currentWorkspaceId = workspaceId

    startPolling(code, getWindow)

    return { code }
  })

  ipcMain.handle(IPC_CHANNELS.COMPANION_CANCEL, async () => {
    stopPolling()
    stopCompanionServer()
    stopChangePoll()
    if (currentToken) {
      try {
        await apiRequest<unknown>('DELETE', '/api/v1/pair/unregister', undefined, currentToken)
      } catch {
        // Best effort — session may already be expired
      }
    }
    currentToken = null
    currentWorkspaceId = null
  })

  ipcMain.handle(IPC_CHANNELS.COMPANION_SYNC_TICKETS, async (_event, workspaceId: string) => {
    await syncTicketsToCompanion(workspaceId)
  })

  ipcMain.handle(IPC_CHANNELS.COMPANION_DATA_INFO, () => {
    return getCompanionServerInfo()
  })

  ipcMain.handle(IPC_CHANNELS.COMPANION_DISCONNECT, async () => {
    stopPolling()
    stopCompanionServer()
    stopChangePoll()
    if (currentToken) {
      try {
        await apiRequest<unknown>('DELETE', '/api/v1/pair/unregister', undefined, currentToken)
      } catch {
        // Best effort — session may already be expired
      }
    }
    currentToken = null
    currentWorkspaceId = null
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COMPANION_STATUS_CHANGED, 'disconnected')
    }
  })
}

export async function initDevCompanion(getWindow: () => BrowserWindow | null): Promise<void> {
  const devCode = process.env['KANBAI_DEV_CODE']
  if (!devCode) return

  const devWorkspace = process.env['KANBAI_DEV_WORKSPACE'] ?? 'default'

  try {
    const result = await apiRequest<{ sessionId: string; token: string }>(
      'POST',
      '/api/v1/pair/register',
      { code: devCode, appId: 'kanbai-desktop', workspaceId: devWorkspace },
    )
    currentToken = result.token
    currentWorkspaceId = devWorkspace
    startPolling(devCode, getWindow)
    // Notify renderer of waiting state after a short delay (window may not be ready yet)
    setTimeout(() => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.COMPANION_STATUS_CHANGED, 'waiting')
      }
    }, 2000)
    console.log(`[DEV] Registered pairing code: ${devCode} — waiting for companion`)
  } catch (err) {
    console.log(`[DEV] Companion registration failed (API not running?): ${(err as Error).message}`)
    setTimeout(() => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.COMPANION_STATUS_CHANGED, 'maintenance')
      }
    }, 2000)
  }
}

export function cleanupCompanion(): void {
  stopPolling()
  stopCompanionServer()
  stopChangePoll()
  if (currentToken) {
    // Best-effort cleanup on quit — fire and forget
    try {
      apiRequest<unknown>('DELETE', '/api/v1/pair/unregister', undefined, currentToken).catch(() => {})
    } catch {
      // Ignore
    }
  }
  currentToken = null
  currentWorkspaceId = null
}
