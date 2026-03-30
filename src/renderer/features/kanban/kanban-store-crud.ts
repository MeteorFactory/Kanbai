import type { KanbanTask, KanbanTaskType, KanbanStatus, PrequalifyError } from '../../../shared/types/index'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import type { Get, Set } from './kanban-store-types'
import { useTerminalTabStore } from '../terminal'
import { useI18n } from '../../lib/i18n'
import { pushNotification } from '../../shared/stores/notification-store'
import { formatTicketLabel, pickNextTask, availableSlots } from './kanban-store-utils'

export function createCreateTask(get: Get, set: Set) {
  return async (
    workspaceId: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high',
    type?: KanbanTaskType,
    targetProjectId?: string,
    isCtoTicket?: boolean,
    aiProvider?: AiProviderId,
  ) => {
    // Check per-workspace config (prequalification + pause state)
    let prequalifyEnabled = false
    let workspacePaused = false
    try {
      const kanbanConfig = await window.kanbai.kanban.getConfig(workspaceId)
      prequalifyEnabled = kanbanConfig?.autoPrequalifyTickets === true
      workspacePaused = kanbanConfig?.paused === true
    } catch { /* default to false */ }

    const createResult = await window.kanbai.kanban.create({
      workspaceId,
      targetProjectId,
      title,
      description,
      status: 'TODO',
      priority,
      type: type ?? 'feature',
      isCtoTicket,
      aiProvider,
    })
    const task = createResult.task
    const memoryRefactorTask = createResult.memoryRefactorTask

    // Mark as prequalifying if enabled (in-memory flag, not persisted)
    if (prequalifyEnabled) {
      task.isPrequalifying = true
    }
    const newTasks = [task]
    if (memoryRefactorTask) {
      newTasks.push(memoryRefactorTask)
    }
    set((state) => ({ tasks: [...state.tasks, ...newTasks] }))

    // Notify user about auto-created memory refactor ticket
    if (memoryRefactorTask) {
      const t = useI18n.getState().t
      const ticketLabel = formatTicketLabel(memoryRefactorTask)
      pushNotification('info', ticketLabel, t('kanban.memoryRefactorCreated'))
    }

    if (prequalifyEnabled) {
    // Run prequalification in the background
    ;(async () => {
      try {
        const result = await window.kanbai.kanban.prequalify({
          title,
          description,
          priority,
          type: type ?? 'feature',
          targetProjectId,
          isCtoTicket,
          hasAttachments: false,
          hasComments: false,
        })
        if (result && 'error' in result && result.error === true) {
          const errResult = result as PrequalifyError
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(task)
          const errorDetail = errResult.code === 'PREQUALIFY_PARSE_ERROR'
            ? `${errResult.message}\n${errResult.rawOutput ? `Sortie IA: ${errResult.rawOutput.slice(0, 100)}...` : ''}`
            : errResult.message
          pushNotification('error', ticketLabel, `${t('kanban.prequalifyFailed')}: ${errorDetail}`)
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, isPrequalifying: false, prequalifyError: errResult } : t)),
          }))
          await window.kanbai.kanban.update({ id: task.id, workspaceId, prequalifyError: errResult })
          if (!workspacePaused) {
            const currentTasks = get().tasks
            const slots = await availableSlots(currentTasks, workspaceId)
            const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
            for (let i = 0; i < slots; i++) {
              const next = pickNextTask(remaining)
              if (!next) break
              remaining.splice(remaining.indexOf(next), 1)
              get().sendToAi(next, workspaceId, { activate: false })
            }
          }
          return
        }
        if (!result) {
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(task)
          pushNotification('error', ticketLabel, t('kanban.prequalifyFailed'))
        }
        const updates: Partial<KanbanTask> = {}
        const successResult = result as { suggestedType: string; suggestedPriority: string; clarifiedDescription: string; isVague: boolean; splitSuggestions?: Array<{ title: string; description: string; type: string; priority: string }> } | null
        if (successResult) {
          if (successResult.suggestedType && successResult.suggestedType !== (type ?? 'feature')) {
            updates.type = successResult.suggestedType as KanbanTaskType
          }
          if (successResult.suggestedPriority && successResult.suggestedPriority !== priority) {
            updates.priority = successResult.suggestedPriority as KanbanTask['priority']
          }
          if (successResult.clarifiedDescription && successResult.clarifiedDescription !== description) {
            updates.aiClarification = successResult.clarifiedDescription
          }
          if (successResult.splitSuggestions && Array.isArray(successResult.splitSuggestions) && successResult.splitSuggestions.length > 0) {
            // Auto-split: create child tickets inheriting metadata from the original
            const childIds: string[] = []
            for (const suggestion of successResult.splitSuggestions) {
              const childResult = await window.kanbai.kanban.create({
                workspaceId,
                targetProjectId: task.targetProjectId,
                title: suggestion.title,
                description: suggestion.description,
                status: 'TODO',
                priority: suggestion.priority as KanbanTask['priority'],
                type: suggestion.type as KanbanTaskType,
                isCtoTicket: task.isCtoTicket,
                aiProvider: task.aiProvider,
                splitFromId: task.id,
              })
              childIds.push(childResult.task.id)
            }
            // Archive the original ticket instead of deleting — preserves audit trail
            await window.kanbai.kanban.update({
              id: task.id,
              workspaceId,
              status: 'DONE' as KanbanStatus,
              archived: true,
              childTicketIds: childIds,
              result: `Ticket auto-split en ${childIds.length} sous-tickets lors de la pre-qualification`,
            })

            const newTasks: KanbanTask[] = await window.kanbai.kanban.list(workspaceId)
            for (const t of newTasks) {
              delete t.isPrequalifying
            }
            set({ tasks: newTasks })

            if (!workspacePaused) {
              const slots = await availableSlots(newTasks, workspaceId)
              const remaining = newTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
              for (let i = 0; i < slots; i++) {
                const next = pickNextTask(remaining)
                if (!next) break
                remaining.splice(remaining.indexOf(next), 1)
                get().sendToAi(next, workspaceId, { activate: false })
              }
            }
            return
          }
        }
        // Only persist non-transient fields to file
        if (Object.keys(updates).length > 0) {
          await window.kanbai.kanban.update({ id: task.id, ...updates, workspaceId })
        }
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...updates, isPrequalifying: false } : t)),
        }))

        // After prequalification finishes, try to auto-send if under concurrency limit
        if (!workspacePaused) {
          const currentTasks = get().tasks
          const slots = await availableSlots(currentTasks, workspaceId)
          const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < slots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, workspaceId, { activate: false })
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const prequalifyError: PrequalifyError = {
          error: true,
          code: 'PREQUALIFY_ERROR',
          message: errorMessage,
          timestamp: Date.now(),
          context: { title, description },
        }
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, isPrequalifying: false, prequalifyError } : t)),
        }))
        try {
          await window.kanbai.kanban.update({ id: task.id, workspaceId, prequalifyError })
        } catch { /* ignore persistence error */ }
        const t = useI18n.getState().t
        const ticketLabel = formatTicketLabel(task)
        pushNotification('error', ticketLabel, `${t('kanban.prequalifyFailed')}: ${errorMessage}`)
        console.error('[kanban-prequalify] Error:', errorMessage)
        // Still try to auto-send on failure
        if (!workspacePaused) {
          const currentTasks = get().tasks
          const slots = await availableSlots(currentTasks, workspaceId)
          const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < slots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, workspaceId, { activate: false })
          }
        }
      }
    })()
    } else {
      // No prequalification — auto-send immediately
      if (!workspacePaused) {
        const currentTasks = get().tasks
        const slots = await availableSlots(currentTasks, workspaceId)
        const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
        for (let i = 0; i < slots; i++) {
          const next = pickNextTask(remaining)
          if (!next) break
          remaining.splice(remaining.indexOf(next), 1)
          get().sendToAi(next, workspaceId, { activate: false })
        }
      }
    }
  }
}

export function createUpdateTaskStatus(get: Get, set: Set) {
  return async (taskId: string, status: KanbanStatus) => {
    const { currentWorkspaceId, kanbanTabIds, tasks, backgroundTasks } = get()
    // Resolve the task's actual workspace — prefer the task's own workspaceId over the current view
    const task = tasks.find((t) => t.id === taskId)
    let taskWorkspaceId = task?.workspaceId
    if (!taskWorkspaceId) {
      for (const [wsId, wsTasks] of Object.entries(backgroundTasks)) {
        if (wsTasks.find((t) => t.id === taskId)) { taskWorkspaceId = wsId; break }
      }
    }
    const workspaceId = taskWorkspaceId ?? currentWorkspaceId
    if (!workspaceId) return
    // Kill terminal process when ticket moves to FAILED (not DONE — hooks handle that)
    // PENDING means the AI is asking a question — keep the terminal alive so the user can respond
    if (status === 'FAILED') {
      const tabId = kanbanTabIds[taskId]
      if (tabId) {
        useTerminalTabStore.getState().killTabProcesses(tabId)
      }
    }
    await window.kanbai.kanban.update({ id: taskId, status, workspaceId })
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t)),
    }))
  }
}

export function createUpdateTask(get: Get, set: Set) {
  return async (taskId: string, data: Partial<KanbanTask>) => {
    const { currentWorkspaceId, tasks, backgroundTasks } = get()
    // Resolve the task's actual workspace — prefer the task's own workspaceId over the current view
    const task = tasks.find((t) => t.id === taskId)
    let taskWorkspaceId = task?.workspaceId
    if (!taskWorkspaceId) {
      for (const [wsId, wsTasks] of Object.entries(backgroundTasks)) {
        if (wsTasks.find((t) => t.id === taskId)) { taskWorkspaceId = wsId; break }
      }
    }
    const workspaceId = taskWorkspaceId ?? currentWorkspaceId
    if (!workspaceId) return
    await window.kanbai.kanban.update({ id: taskId, ...data, workspaceId })
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...data, updatedAt: Date.now() } : t)),
    }))
  }
}

export function createDeleteTask(get: Get, set: Set) {
  return async (taskId: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    await window.kanbai.kanban.delete(taskId, currentWorkspaceId)
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }))
  }
}

export function createDuplicateTask(get: Get, set: Set) {
  return async (task: KanbanTask) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    const createResult = await window.kanbai.kanban.create({
      workspaceId: currentWorkspaceId,
      targetProjectId: task.targetProjectId,
      title: `Copy of ${task.title}`,
      description: task.description,
      status: 'TODO',
      priority: task.priority,
      type: task.type,
      dueDate: task.dueDate,
      error: task.error,
      result: task.result,
      question: task.question,
      comments: task.comments,
    })
    const newTasks = [createResult.task]
    if (createResult.memoryRefactorTask) {
      newTasks.push(createResult.memoryRefactorTask)
    }
    set((state) => ({ tasks: [...state.tasks, ...newTasks] }))
    if (createResult.memoryRefactorTask) {
      const t = useI18n.getState().t
      const ticketLabel = formatTicketLabel(createResult.memoryRefactorTask)
      pushNotification('info', ticketLabel, t('kanban.memoryRefactorCreated'))
    }
  }
}
