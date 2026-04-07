import type { KanbanTask, KanbanTaskType, KanbanStatus } from '../../../shared/types/index'
import type { AiProviderId } from '../../../shared/types/ai-provider'

export interface KanbanState {
  tasks: KanbanTask[]
  isLoading: boolean
  draggedTaskId: string | null
  currentWorkspaceId: string | null
  startupDoneCleanupPerformed: boolean
  kanbanTabIds: Record<string, string>
  kanbanPromptCwds: Record<string, string>
  backgroundTasks: Record<string, KanbanTask[]>
  agentProgress: Record<string, {
    progress?: string
    message?: string
    phase?: string
    items?: Array<{ label: string; status: 'pending' | 'in_progress' | 'completed' }>
    activity?: { type: string; label: string; detail?: string }
    subagents?: Array<{ name: string; status: string }>
  }>
}

export interface KanbanActions {
  loadTasks: (workspaceId: string) => Promise<void>
  syncTasksFromFile: () => Promise<void>
  createTask: (
    workspaceId: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high',
    type?: KanbanTaskType,
    targetProjectId?: string,
    isCtoTicket?: boolean,
    aiProvider?: AiProviderId,
  ) => Promise<void>
  updateTaskStatus: (taskId: string, status: KanbanStatus) => Promise<void>
  updateTask: (taskId: string, data: Partial<KanbanTask>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  duplicateTask: (task: KanbanTask) => Promise<void>
  setDragged: (taskId: string | null) => void
  getTasksByStatus: (status: KanbanStatus) => KanbanTask[]
  sendToAi: (task: KanbanTask, explicitWorkspaceId?: string, options?: { activate?: boolean }) => Promise<void>
  syncBackgroundWorkspace: (workspaceId: string) => Promise<void>
  attachFiles: (taskId: string) => Promise<void>
  attachFromClipboard: (taskId: string, dataBase64: string, filename: string, mimeType: string) => Promise<void>
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>
  handleTabClosed: (tabId: string) => void
  reactivateIfDone: (tabId: string, message?: string, options?: { skipGracePeriod?: boolean; alreadySent?: boolean }) => void
  acceptSplit: (taskId: string) => Promise<void>
  dismissSplit: (taskId: string) => void
  applyCompanionUpdate: (task: KanbanTask) => void
}

export type KanbanStore = KanbanState & KanbanActions

export type Get = () => KanbanStore
export type Set = {
  (partial: Partial<KanbanState> | ((state: KanbanStore) => Partial<KanbanState>)): void
  (state: Partial<KanbanState>): void
}
