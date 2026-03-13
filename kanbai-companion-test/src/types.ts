export interface PairConnectResponse {
  sessionId: string
  token: string
  workspaceId: string
}

export interface PairStatusResponse {
  status: 'waiting' | 'connected' | 'expired'
  companionId?: string
}

export interface KanbanTicket {
  id: string
  title: string
  description: string
  status: string
  priority?: string
  tags?: string[]
  assignee?: string
  createdAt?: string
  updatedAt?: string
}

export interface WsMessage {
  type: string
  payload?: unknown
}
