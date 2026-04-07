import { create } from 'zustand'
import type { KanbanStore } from './kanban-store-types'
import { createLoadTasks, createSyncTasksFromFile } from './kanban-store-sync'
import { createSyncBackgroundWorkspace } from './kanban-store-bg-sync'
import { createCreateTask, createUpdateTaskStatus, createUpdateTask, createDeleteTask, createDuplicateTask } from './kanban-store-crud'
import { createSendToAi } from './kanban-store-ai'
import { createHandleTabClosed, createReactivateIfDone } from './kanban-store-terminal'
import {
  createAttachFiles, createAttachFromClipboard, createRemoveAttachment,
  createAcceptSplit, createDismissSplit, createApplyCompanionUpdate,
} from './kanban-store-attachments'

export { pickNextTask } from './kanban-store-utils'

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  tasks: [],
  isLoading: false,
  draggedTaskId: null,
  currentWorkspaceId: null,
  startupDoneCleanupPerformed: false,
  kanbanTabIds: {},
  kanbanPromptCwds: {},
  backgroundTasks: {},
  agentProgress: {},

  loadTasks: createLoadTasks(get, set),
  syncTasksFromFile: createSyncTasksFromFile(get, set),
  createTask: createCreateTask(get, set),
  updateTaskStatus: createUpdateTaskStatus(get, set),
  updateTask: createUpdateTask(get, set),
  deleteTask: createDeleteTask(get, set),
  duplicateTask: createDuplicateTask(get, set),
  setDragged: (taskId) => set({ draggedTaskId: taskId }),
  getTasksByStatus: (status) => get().tasks.filter((t) => t.status === status),
  sendToAi: createSendToAi(get, set),
  syncBackgroundWorkspace: createSyncBackgroundWorkspace(get, set),
  attachFiles: createAttachFiles(get, set),
  attachFromClipboard: createAttachFromClipboard(get, set),
  removeAttachment: createRemoveAttachment(get, set),
  handleTabClosed: createHandleTabClosed(get, set),
  reactivateIfDone: createReactivateIfDone(get, set),
  acceptSplit: createAcceptSplit(get, set),
  dismissSplit: createDismissSplit(get, set),
  applyCompanionUpdate: createApplyCompanionUpdate(get, set),
}))
