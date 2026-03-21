import type { KanbanTask, KanbanStatus } from '../../../shared/types/index'
import type { Get, Set } from './kanban-store-types'
import { pickNextTask, availableSlots } from './kanban-store-utils'

export function createAttachFiles(get: Get, set: Set) {
  return async (taskId: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    const filePaths = await window.kanbai.kanban.selectFiles()
    if (!filePaths || filePaths.length === 0) return

    for (const filePath of filePaths) {
      const attachment = await window.kanbai.kanban.attachFile(taskId, currentWorkspaceId, filePath)
      set((state) => ({
        tasks: state.tasks.map((t) => {
          if (t.id !== taskId) return t
          return { ...t, attachments: [...(t.attachments || []), attachment], updatedAt: Date.now() }
        }),
      }))
    }
  }
}

export function createAttachFromClipboard(get: Get, set: Set) {
  return async (taskId: string, dataBase64: string, filename: string, mimeType: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    const attachment = await window.kanbai.kanban.attachFromClipboard(taskId, currentWorkspaceId, dataBase64, filename, mimeType)
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t
        return { ...t, attachments: [...(t.attachments || []), attachment], updatedAt: Date.now() }
      }),
    }))
  }
}

export function createRemoveAttachment(get: Get, set: Set) {
  return async (taskId: string, attachmentId: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    await window.kanbai.kanban.removeAttachment(taskId, currentWorkspaceId, attachmentId)
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t
        return {
          ...t,
          attachments: (t.attachments || []).filter((a) => a.id !== attachmentId),
          updatedAt: Date.now(),
        }
      }),
    }))
  }
}

export function createAcceptSplit(get: Get, set: Set) {
  return async (taskId: string) => {
    const { currentWorkspaceId, tasks } = get()
    if (!currentWorkspaceId) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task?.splitSuggestions?.length) return

    // Create child tickets from split suggestions, inheriting metadata from the original
    const childIds: string[] = []
    for (const suggestion of task.splitSuggestions) {
      const child = await window.kanbai.kanban.create({
        workspaceId: currentWorkspaceId,
        targetProjectId: task.targetProjectId,
        title: suggestion.title,
        description: suggestion.description,
        status: 'TODO',
        priority: suggestion.priority,
        type: suggestion.type,
        isCtoTicket: task.isCtoTicket,
        aiProvider: task.aiProvider,
        splitFromId: task.id,
      })
      childIds.push(child.id)
    }

    // Archive the original ticket instead of deleting — preserves audit trail
    await window.kanbai.kanban.update({
      id: task.id,
      workspaceId: currentWorkspaceId,
      status: 'DONE' as KanbanStatus,
      archived: true,
      childTicketIds: childIds,
      result: `Ticket split en ${childIds.length} sous-tickets (accepte manuellement)`,
    })

    // Reload tasks from file to get the new tickets
    const newTasks: KanbanTask[] = await window.kanbai.kanban.list(currentWorkspaceId)
    for (const t of newTasks) {
      delete t.isPrequalifying
    }
    set({ tasks: newTasks })

    // Auto-send if under concurrency limit (skip if paused)
    const slots = await availableSlots(newTasks, currentWorkspaceId)
    const remaining = newTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
    for (let i = 0; i < slots; i++) {
      const next = pickNextTask(remaining)
      if (!next) break
      remaining.splice(remaining.indexOf(next), 1)
      get().sendToAi(next, currentWorkspaceId, { activate: false })
    }
  }
}

export function createDismissSplit(_get: Get, set: Set) {
  return (taskId: string) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, splitSuggestions: undefined } : t,
      ),
    }))
  }
}

export function createApplyCompanionUpdate(_get: Get, set: Set) {
  return (task: KanbanTask) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
    }))
  }
}
