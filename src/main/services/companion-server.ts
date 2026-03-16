import http from 'http'
import crypto from 'crypto'
import { StorageService } from './storage'
import { readKanbanTasks } from '../../mcp-server/lib/kanban-store'
import type { KanbanTask } from '../../shared/types'

const ENCRYPTION_ALGO = 'aes-256-gcm'
const IV_LENGTH = 12

interface CompanionServerState {
  server: http.Server | null
  port: number
  encryptionKey: Buffer
  token: string
}

const state: CompanionServerState = {
  server: null,
  port: 0,
  encryptionKey: Buffer.alloc(0),
  token: '',
}

function encrypt(data: string, key: Buffer): { iv: string; encrypted: string; tag: string } {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(data, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    encrypted: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  }
}

function sendEncryptedJson(res: http.ServerResponse, data: unknown): void {
  const json = JSON.stringify(data)
  const payload = encrypt(json, state.encryptionKey)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

function validateToken(req: http.IncomingMessage): boolean {
  const auth = req.headers['authorization']
  if (!auth) return false
  const parts = auth.split(' ')
  return parts.length === 2 && parts[0] === 'Bearer' && parts[1] === state.token
}

function resolveWorkspaceId(query: string): string | null {
  const storage = new StorageService()
  const workspaces = storage.getWorkspaces()

  // Try exact ID match first
  const byId = workspaces.find((w) => w.id === query)
  if (byId) return byId.id

  // Try workspace name match (case-insensitive)
  const byName = workspaces.find((w) => w.name.toLowerCase() === query.toLowerCase())
  if (byName) return byName.id

  // Try namespace name → resolve all workspaces in that namespace
  const namespaces = storage.getNamespaces()
  const namespace = namespaces.find((n) => n.name.toLowerCase() === query.toLowerCase())
  if (namespace) {
    const nsWorkspace = workspaces.find((w) => w.namespaceId === namespace.id)
    if (nsWorkspace) return nsWorkspace.id
  }

  return null
}

/** Summarize a task for the list endpoint (omit heavy fields) */
function summarizeTask(task: KanbanTask): Partial<KanbanTask> {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    ticketNumber: task.ticketNumber,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    type: task.type,
    dueDate: task.dueDate,
    archived: task.archived,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (!validateToken(req)) {
    sendError(res, 401, 'Unauthorized')
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${state.port}`)
  const pathname = url.pathname

  // GET /api/v1/companion/workspaces
  if (req.method === 'GET' && pathname === '/api/v1/companion/workspaces') {
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
    sendEncryptedJson(res, result)
    return
  }

  // GET /api/v1/companion/tickets?workspace=<name_or_id>
  if (req.method === 'GET' && pathname === '/api/v1/companion/tickets') {
    const workspaceQuery = url.searchParams.get('workspace')
    if (!workspaceQuery) {
      sendError(res, 400, 'Missing workspace query parameter (name or id)')
      return
    }

    const workspaceId = resolveWorkspaceId(workspaceQuery)
    if (!workspaceId) {
      sendError(res, 404, `Workspace not found: ${workspaceQuery}`)
      return
    }

    const tasks = readKanbanTasks(workspaceId)
    const activeTasks = tasks.filter((t) => !t.archived)
    sendEncryptedJson(res, activeTasks.map(summarizeTask))
    return
  }

  // GET /api/v1/companion/tickets/:id
  const ticketMatch = pathname.match(/^\/api\/v1\/companion\/tickets\/(.+)$/)
  if (req.method === 'GET' && ticketMatch) {
    const ticketId = ticketMatch[1]!
    const workspaceQuery = url.searchParams.get('workspace')

    if (!workspaceQuery) {
      sendError(res, 400, 'Missing workspace query parameter (name or id)')
      return
    }

    const workspaceId = resolveWorkspaceId(workspaceQuery)
    if (!workspaceId) {
      sendError(res, 404, `Workspace not found: ${workspaceQuery}`)
      return
    }

    const tasks = readKanbanTasks(workspaceId)

    // Match by ID or ticket number
    const task = tasks.find(
      (t) => t.id === ticketId || String(t.ticketNumber) === ticketId,
    )

    if (!task) {
      sendError(res, 404, `Ticket not found: ${ticketId}`)
      return
    }

    sendEncryptedJson(res, task)
    return
  }

  sendError(res, 404, 'Not found')
}

export function startCompanionServer(token: string): Promise<{ port: number; encryptionKey: string }> {
  return new Promise((resolve, reject) => {
    if (state.server) {
      stopCompanionServer()
    }

    state.encryptionKey = crypto.randomBytes(32)
    state.token = token

    const server = http.createServer(handleRequest)

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }
      state.server = server
      state.port = address.port
      console.log(`[Companion] Data server started on port ${state.port}`)
      resolve({
        port: state.port,
        encryptionKey: state.encryptionKey.toString('base64'),
      })
    })

    server.on('error', reject)
  })
}

export function stopCompanionServer(): void {
  if (state.server) {
    state.server.close()
    state.server = null
    state.port = 0
    state.token = ''
    state.encryptionKey = Buffer.alloc(0)
    console.log('[Companion] Data server stopped')
  }
}

export function getCompanionServerInfo(): { port: number; encryptionKey: string } | null {
  if (!state.server) return null
  return {
    port: state.port,
    encryptionKey: state.encryptionKey.toString('base64'),
  }
}
