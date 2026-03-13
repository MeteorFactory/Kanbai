import type { WebSocket } from 'ws'

// Pairing
export interface PairRegisterRequest {
  code: string
  appId: string
  workspaceId: string
}

export interface PairRegisterResponse {
  sessionId: string
  token: string
}

export interface PairConnectRequest {
  code: string
  appId: string
}

export interface PairConnectResponse {
  sessionId: string
  token: string
  workspaceId: string
}

export interface PairStatusResponse {
  status: 'waiting' | 'connected' | 'expired'
  companionId?: string
}

// Session
export interface Session {
  id: string
  code: string
  desktopToken: string
  companionToken: string | null
  desktopAppId: string
  companionAppId: string | null
  workspaceId: string
  createdAt: number
  expiresAt: number
  desktopWs: WebSocket | null
  companionWs: WebSocket | null
}

// Kanban
export interface KanbanTaskApi {
  id: string
  title: string
  description: string
  status: 'TODO' | 'WORKING' | 'PENDING' | 'DONE' | 'FAILED'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  tags?: string[]
  assignee?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateTicketRequest {
  title: string
  description?: string
  status?: KanbanTaskApi['status']
  priority?: KanbanTaskApi['priority']
  tags?: string[]
  assignee?: string
}

export interface UpdateTicketRequest {
  title?: string
  description?: string
  status?: KanbanTaskApi['status']
  priority?: KanbanTaskApi['priority']
  tags?: string[]
  assignee?: string
}

// WebSocket
export interface WsMessage {
  type: string
  payload?: unknown
}

// HTTP
export interface RouteContext {
  params: Record<string, string>
  token?: string
  session?: Session
}
