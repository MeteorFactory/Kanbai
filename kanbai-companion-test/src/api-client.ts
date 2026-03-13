import http from 'http'
import { WebSocket } from 'ws'
import type { PairConnectResponse, PairStatusResponse, KanbanTicket, WsMessage } from './types.js'

export class ApiClient {
  private baseUrl: string
  private token: string | null = null
  private ws: WebSocket | null = null
  sessionId: string | null = null
  workspaceId: string | null = null

  constructor(host: string = 'localhost', port: number = 3847) {
    this.baseUrl = `http://${host}:${port}`
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl)
      const postData = body ? JSON.stringify(body) : undefined
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`

      const req = http.request(
        { hostname: url.hostname, port: url.port, path: url.pathname, method, headers },
        (res) => {
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
        },
      )
      req.on('error', reject)
      if (postData) req.write(postData)
      req.end()
    })
  }

  async connect(code: string, appId: string = 'companion-test'): Promise<PairConnectResponse> {
    const result = await this.request<PairConnectResponse>('POST', '/api/v1/pair/connect', { code, appId })
    this.token = result.token
    this.sessionId = result.sessionId
    this.workspaceId = result.workspaceId
    return result
  }

  async getStatus(code: string): Promise<PairStatusResponse> {
    return this.request<PairStatusResponse>('GET', `/api/v1/pair/status/${code}`)
  }

  connectWebSocket(onMessage?: (msg: WsMessage) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.token) {
        reject(new Error('Not authenticated'))
        return
      }
      const wsUrl = this.baseUrl.replace('http://', 'ws://') + `/ws?token=${this.token}`
      this.ws = new WebSocket(wsUrl)
      this.ws.on('open', () => resolve())
      this.ws.on('error', reject)
      this.ws.on('message', (raw) => {
        if (onMessage) {
          try {
            const msg = JSON.parse(raw.toString()) as WsMessage
            onMessage(msg)
          } catch {
            // Ignore malformed messages
          }
        }
      })
    })
  }

  sendWsMessage(msg: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  async listTickets(): Promise<{ tickets: KanbanTicket[] }> {
    return this.request<{ tickets: KanbanTicket[] }>('GET', '/api/v1/kanban/tickets')
  }

  async getTicket(id: string): Promise<KanbanTicket> {
    return this.request<KanbanTicket>('GET', `/api/v1/kanban/tickets/${id}`)
  }

  async createTicket(data: { title: string; description?: string; status?: string; priority?: string }): Promise<KanbanTicket> {
    return this.request<KanbanTicket>('POST', '/api/v1/kanban/tickets', data)
  }

  async updateTicket(id: string, data: Record<string, unknown>): Promise<KanbanTicket> {
    return this.request<KanbanTicket>('PATCH', `/api/v1/kanban/tickets/${id}`, data)
  }

  async deleteTicket(id: string): Promise<void> {
    await this.request<null>('DELETE', `/api/v1/kanban/tickets/${id}`)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.token = null
    this.sessionId = null
    this.workspaceId = null
  }
}
