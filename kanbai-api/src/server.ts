import http from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { handleRegister, handleConnect, handleUnregister, handleStatus } from './routes/pairing.js'
import {
  handleListTickets,
  handleGetTicket,
  handleCreateTicket,
  handleUpdateTicket,
  handleDeleteTicket,
} from './routes/kanban.js'
import { authenticate } from './middleware/auth.js'
import { getSessionByToken } from './services/session-store.js'
import type { WsMessage } from './types.js'

const API_PREFIX = '/api/v1'

export function readBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve(raw ? JSON.parse(raw) as T : {} as T)
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  if (data === null && status === 204) {
    res.end()
  } else {
    res.end(JSON.stringify(data))
  }
}

export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message })
}

function parsePath(url: string): { path: string; params: Record<string, string> } {
  const u = new URL(url, 'http://localhost')
  return { path: u.pathname, params: Object.fromEntries(u.searchParams) }
}

export function broadcastToSession(sessionId: string, message: WsMessage, excludeWs?: WebSocket): void {
  const session = getSessionByToken(sessionId)
  if (!session) return
  const data = JSON.stringify(message)
  if (session.desktopWs && session.desktopWs !== excludeWs && session.desktopWs.readyState === WebSocket.OPEN) {
    session.desktopWs.send(data)
  }
  if (session.companionWs && session.companionWs !== excludeWs && session.companionWs.readyState === WebSocket.OPEN) {
    session.companionWs.send(data)
  }
}

export function createServer(port: number, host: string): http.Server {
  const server = http.createServer(async (req, res) => {
    const method = req.method ?? 'GET'
    const { path: urlPath } = parsePath(req.url ?? '/')

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      // Pairing routes (unauthenticated)
      if (urlPath === `${API_PREFIX}/pair/register` && method === 'POST') {
        await handleRegister(req, res)
        return
      }
      if (urlPath === `${API_PREFIX}/pair/connect` && method === 'POST') {
        await handleConnect(req, res)
        return
      }
      if (urlPath === `${API_PREFIX}/pair/unregister` && method === 'DELETE') {
        await handleUnregister(req, res)
        return
      }
      if (urlPath.startsWith(`${API_PREFIX}/pair/status/`) && method === 'GET') {
        const code = urlPath.slice(`${API_PREFIX}/pair/status/`.length)
        handleStatus(req, res, code)
        return
      }

      // Kanban routes (authenticated)
      const session = authenticate(req)
      if (!session) {
        if (urlPath.startsWith(`${API_PREFIX}/kanban/`)) {
          sendError(res, 401, 'Authentication required')
          return
        }
        sendError(res, 404, 'Not found')
        return
      }

      if (urlPath === `${API_PREFIX}/kanban/tickets` && method === 'GET') {
        handleListTickets(req, res, session)
        return
      }
      if (urlPath === `${API_PREFIX}/kanban/tickets` && method === 'POST') {
        await handleCreateTicket(req, res, session)
        return
      }
      if (urlPath.startsWith(`${API_PREFIX}/kanban/tickets/`)) {
        const ticketId = urlPath.slice(`${API_PREFIX}/kanban/tickets/`.length)
        if (method === 'GET') {
          handleGetTicket(req, res, session, ticketId)
          return
        }
        if (method === 'PATCH') {
          await handleUpdateTicket(req, res, session, ticketId)
          return
        }
        if (method === 'DELETE') {
          handleDeleteTicket(req, res, session, ticketId)
          return
        }
      }

      sendError(res, 404, 'Not found')
    } catch (err) {
      console.error('Request error:', err)
      sendError(res, 500, 'Internal server error')
    }
  })

  // WebSocket
  const wss = new WebSocketServer({ server })
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const token = url.searchParams.get('token')
    if (!token) {
      ws.close(4001, 'Missing token')
      return
    }

    const session = getSessionByToken(token)
    if (!session) {
      ws.close(4001, 'Invalid token')
      return
    }

    if (token === session.desktopToken) {
      session.desktopWs = ws
    } else if (token === session.companionToken) {
      session.companionWs = ws
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage
        // Relay to the other party
        if (token === session.desktopToken && session.companionWs?.readyState === WebSocket.OPEN) {
          session.companionWs.send(JSON.stringify(msg))
        } else if (token === session.companionToken && session.desktopWs?.readyState === WebSocket.OPEN) {
          session.desktopWs.send(JSON.stringify(msg))
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      if (token === session.desktopToken) {
        session.desktopWs = null
        if (session.companionWs?.readyState === WebSocket.OPEN) {
          session.companionWs.send(JSON.stringify({ type: 'peer:disconnected', payload: { role: 'desktop' } }))
        }
      } else if (token === session.companionToken) {
        session.companionWs = null
        if (session.desktopWs?.readyState === WebSocket.OPEN) {
          session.desktopWs.send(JSON.stringify({ type: 'peer:disconnected', payload: { role: 'companion' } }))
        }
      }
    })
  })

  server.listen(port, host, () => {
    console.log(`Kanbai API listening on http://${host}:${port}`)
  })

  return server
}
