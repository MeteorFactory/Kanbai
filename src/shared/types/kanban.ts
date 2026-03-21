// Kanban types

export interface KanbanAttachment {
  id: string
  filename: string
  storedPath: string
  mimeType: string
  size: number
  addedAt: number
}

export type KanbanCommentType = 'user' | 'resolution-done' | 'resolution-failed'

export interface KanbanComment {
  id: string
  text: string
  type?: KanbanCommentType
  createdAt: number
}

export type KanbanTaskType = 'bug' | 'feature' | 'test' | 'doc' | 'ia' | 'refactor'

export interface KanbanSplitSuggestion {
  title: string
  description: string
  type: KanbanTaskType
  priority: 'low' | 'medium' | 'high'
}

export interface PrequalifyError {
  error: true
  code: 'PREQUALIFY_ERROR' | 'PREQUALIFY_PARSE_ERROR'
  message: string
  rawOutput?: string
  stack?: string
  timestamp: number
  context: { title: string; description: string }
}

export interface KanbanTask {
  id: string
  workspaceId: string
  targetProjectId?: string
  ticketNumber?: number
  title: string
  description: string
  status: KanbanStatus
  priority: 'low' | 'medium' | 'high'
  type?: KanbanTaskType
  agentId?: string
  question?: string
  result?: string
  error?: string
  attachments?: KanbanAttachment[]
  comments?: KanbanComment[]
  dueDate?: number
  archived?: boolean
  disabled?: boolean
  isCtoTicket?: boolean
  parentTicketId?: string
  childTicketIds?: string[]
  conversationHistoryPath?: string
  aiProvider?: import('./ai-provider').AiProviderId
  aiModel?: string
  isPrequalifying?: boolean
  splitSuggestions?: KanbanSplitSuggestion[]
  originalDescription?: string
  aiClarification?: string
  prequalifyError?: PrequalifyError
  worktreePath?: string
  worktreeBranch?: string
  worktreeBaseBranch?: string
  worktreeEnvPath?: string
  splitFromId?: string
  createdAt: number
  updatedAt: number
}

export type KanbanStatus = 'TODO' | 'WORKING' | 'PENDING' | 'DONE' | 'FAILED'

export interface KanbanConfig {
  autoCloseCompletedTerminals: boolean
  autoCloseCtoTerminals: boolean
  autoCreateAiMemoryRefactorTickets: boolean
  aiMemoryRefactorInterval: number
  autoPrequalifyTickets: boolean
  autoPrioritizeBugs: boolean
  useWorktrees: boolean
  autoMergeWorktrees: boolean
  maxConcurrentWorktrees: number
  paused: boolean
}
