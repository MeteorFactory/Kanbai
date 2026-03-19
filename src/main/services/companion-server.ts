import http from 'http'
import crypto from 'crypto'
import { StorageService } from './storage'
import { readKanbanTasks } from '../../mcp-server/lib/kanban-store'
import { companionRegistry } from '../companion/registry'
import type { KanbanTask } from '../../shared/types'
import type { CompanionContext } from '../../shared/types/companion'

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

/** Global change version — incremented when any feature state changes */
let changeVersion = 0

export function bumpCompanionChangeVersion(): void {
  changeVersion++
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

function decrypt(payload: { iv: string; encrypted: string; tag: string }, key: Buffer): string {
  const iv = Buffer.from(payload.iv, 'base64')
  const encrypted = Buffer.from(payload.encrypted, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf-8')
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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function parseBodyJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // If the body is encrypted (has iv/encrypted/tag), decrypt it
    if (parsed.iv && parsed.encrypted && parsed.tag) {
      const decrypted = decrypt(
        parsed as { iv: string; encrypted: string; tag: string },
        state.encryptionKey,
      )
      return JSON.parse(decrypted) as Record<string, unknown>
    }
    return parsed
  } catch {
    return null
  }
}

/** Build a CompanionContext from query params or body fields */
function buildContext(
  workspaceParam: string | null,
  projectParam: string | null,
  body?: Record<string, unknown>,
): CompanionContext | null {
  const wsQuery = workspaceParam ?? (body?.workspace as string | undefined) ?? (body?.workspaceId as string | undefined) ?? null
  if (!wsQuery) return null

  const workspaceId = resolveWorkspaceId(wsQuery)
  if (!workspaceId) return null

  const projectId = projectParam ?? (body?.project as string | undefined) ?? (body?.projectId as string | undefined) ?? undefined
  let projectPath: string | undefined
  if (projectId) {
    const storage = new StorageService()
    const project = storage.getProjects(workspaceId).find((p) => p.id === projectId || p.name === projectId)
    if (project) {
      projectPath = project.path
    }
  }

  return { workspaceId, projectId: projectId ?? undefined, projectPath }
}

// ---------------------------------------------------------------------------
// V2 route handlers
// ---------------------------------------------------------------------------

async function handleV2Features(res: http.ServerResponse): Promise<void> {
  const features = companionRegistry.listFeatures()
  sendEncryptedJson(res, features)
}

async function handleV2FeatureState(
  featureId: string,
  url: URL,
  res: http.ServerResponse,
): Promise<void> {
  const feature = companionRegistry.get(featureId)
  if (!feature) {
    sendError(res, 404, `Feature not found: ${featureId}`)
    return
  }

  const ctx = buildContext(
    url.searchParams.get('workspace') ?? url.searchParams.get('workspaceId'),
    url.searchParams.get('project') ?? url.searchParams.get('projectId'),
  )

  if ((feature.workspaceScoped || feature.projectScoped) && !ctx) {
    sendError(res, 400, 'Missing workspace query parameter')
    return
  }

  if (feature.projectScoped && ctx && !ctx.projectPath) {
    sendError(res, 400, 'Missing project query parameter or project not found')
    return
  }

  const result = await feature.getState(ctx ?? { workspaceId: '' })
  sendEncryptedJson(res, result)
}

async function handleV2FeatureCommand(
  featureId: string,
  commandName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const feature = companionRegistry.get(featureId)
  if (!feature) {
    sendError(res, 404, `Feature not found: ${featureId}`)
    return
  }

  const rawBody = await readBody(req)
  const body = parseBodyJson(rawBody)
  if (!body) {
    sendError(res, 400, 'Invalid JSON body')
    return
  }

  const ctx = buildContext(null, null, body)
  if ((feature.workspaceScoped || feature.projectScoped) && !ctx) {
    sendError(res, 400, 'Missing workspace in request body')
    return
  }

  if (feature.projectScoped && ctx && !ctx.projectPath) {
    sendError(res, 400, 'Missing project in request body or project not found')
    return
  }

  const params = (body.params as Record<string, unknown>) ?? {}
  const result = await feature.execute(commandName, params, ctx ?? { workspaceId: '' })
  sendEncryptedJson(res, result)
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

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

  // GET /api/v2/companion/changes — lightweight change counter (no encryption for speed)
  if (req.method === 'GET' && pathname === '/api/v2/companion/changes') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ version: changeVersion }))
    return
  }

  // -----------------------------------------------------------------------
  // V2 API — Feature Registry
  // -----------------------------------------------------------------------

  // GET /api/v2/companion/features
  if (req.method === 'GET' && pathname === '/api/v2/companion/features') {
    handleV2Features(res).catch((err) => sendError(res, 500, String(err)))
    return
  }

  // GET /api/v2/companion/features/:id/state
  const stateMatch = pathname.match(/^\/api\/v2\/companion\/features\/([^/]+)\/state$/)
  if (req.method === 'GET' && stateMatch) {
    handleV2FeatureState(stateMatch[1]!, url, res).catch((err) => sendError(res, 500, String(err)))
    return
  }

  // POST /api/v2/companion/features/:id/commands/:cmd
  const cmdMatch = pathname.match(/^\/api\/v2\/companion\/features\/([^/]+)\/commands\/([^/]+)$/)
  if (req.method === 'POST' && cmdMatch) {
    handleV2FeatureCommand(cmdMatch[1]!, cmdMatch[2]!, req, res).catch((err) =>
      sendError(res, 500, String(err)),
    )
    return
  }

  // -----------------------------------------------------------------------
  // V1 Feature aliases — maps v1 paths to v2 handlers for mobile compat
  // -----------------------------------------------------------------------

  // GET /api/v1/features
  if (req.method === 'GET' && pathname === '/api/v1/features') {
    handleV2Features(res).catch((err) => sendError(res, 500, String(err)))
    return
  }

  // GET /api/v1/features/:id/state
  const v1StateMatch = pathname.match(/^\/api\/v1\/features\/([^/]+)\/state$/)
  if (req.method === 'GET' && v1StateMatch) {
    handleV2FeatureState(v1StateMatch[1]!, url, res).catch((err) => sendError(res, 500, String(err)))
    return
  }

  // POST /api/v1/features/:id/commands/:cmd
  const v1CmdMatch = pathname.match(/^\/api\/v1\/features\/([^/]+)\/commands\/([^/]+)$/)
  if (req.method === 'POST' && v1CmdMatch) {
    handleV2FeatureCommand(v1CmdMatch[1]!, v1CmdMatch[2]!, req, res).catch((err) =>
      sendError(res, 500, String(err)),
    )
    return
  }

  // -----------------------------------------------------------------------
  // V1 API — Backward compatibility
  // -----------------------------------------------------------------------

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
