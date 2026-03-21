import type { KanbanTask, KanbanComment } from '../../../shared/types/index'
import type { Get, Set } from './kanban-store-types'
import { useTerminalTabStore } from '../terminal'
import { useWorkspaceStore } from '../workspace/workspace-store'
import { useI18n } from '../../lib/i18n'
import { pushNotification } from '../../shared/stores/notification-store'
import {
  formatTicketLabel, pickNextTask,
  isChildOfCto, autoMergeWorktree, relaunchedTaskIds,
} from './kanban-store-utils'

export function createLoadTasks(get: Get, set: Set) {
  return async (workspaceId: string) => {
    // Save current tasks to backgroundTasks before switching
    const { currentWorkspaceId: oldWsId, tasks: oldTasks } = get()
    if (oldWsId && oldWsId !== workspaceId && oldTasks.length > 0) {
      set((state) => ({
        backgroundTasks: { ...state.backgroundTasks, [oldWsId]: oldTasks },
      }))
    }

    // Load from backgroundTasks cache if available
    const cached = get().backgroundTasks[workspaceId]
    set({ isLoading: true, currentWorkspaceId: workspaceId, ...(cached ? { tasks: cached } : {}) })
    try {
      const tasks: KanbanTask[] = await window.kanbai.kanban.list(workspaceId)
      // isPrequalifying is transient (in-memory only) — clear any stale flags from file
      for (const t of tasks) {
        delete t.isPrequalifying
      }
      set({ tasks })

      // Startup-only cleanup: close stale terminals linked to DONE tickets (respects config).
      if (!get().startupDoneCleanupPerformed) {
        set({ startupDoneCleanupPerformed: true })
        const { kanbanTabIds: staleTabIds } = get()
        const closedTabIds: string[] = []
        window.kanbai.kanban.getConfig?.(workspaceId)?.then((kanbanConfig) => {
          for (const [taskId, tabId] of Object.entries(staleTabIds)) {
            const task = tasks.find((t) => t.id === taskId)
            if (!task) continue
            if (task.status === 'DONE') {
              const isCto = task.isCtoTicket || isChildOfCto(task, tasks)
              const shouldClose = isCto
                ? kanbanConfig?.autoCloseCtoTerminals
                : kanbanConfig?.autoCloseCompletedTerminals
              if (shouldClose) {
                closedTabIds.push(tabId)
              }
            }
            // CTO tickets reset to TODO — close stale terminals from previous sessions
            if (task.status === 'TODO' && (task.isCtoTicket || isChildOfCto(task, tasks))) {
              if (kanbanConfig?.autoCloseCtoTerminals) {
                closedTabIds.push(tabId)
              }
            }
          }
          if (closedTabIds.length > 0) {
            const termStore = useTerminalTabStore.getState()
            for (const tabId of closedTabIds) {
              termStore.closeTab(tabId)
            }
          }
        }).catch(() => { /* best-effort */ })
      }

      // Scheduling: resume WORKING without terminal, or pick next TODO (respecting concurrency limit)
      const capturedWorkspaceId = workspaceId
      setTimeout(async () => {
        // Guard against stale callbacks after workspace switch
        if (get().currentWorkspaceId !== capturedWorkspaceId) return

        const { kanbanTabIds } = get()

        // Determine max concurrent tasks (>1 only when worktrees enabled) and pause state
        let maxConcurrent = 1
        let isPaused = false
        try {
          const kanbanConfig = await window.kanbai.kanban.getConfig(capturedWorkspaceId)
          if (kanbanConfig?.paused) isPaused = true
          if (kanbanConfig?.useWorktrees && kanbanConfig.maxConcurrentWorktrees > 1) {
            maxConcurrent = kanbanConfig.maxConcurrentWorktrees
          }
        } catch { /* default to 1 */ }

        if (isPaused) return

        // 1. Resume WORKING tasks that lost their terminal
        const workingWithoutTerminal = tasks.filter(
          (t) => t.status === 'WORKING' && !kanbanTabIds[t.id],
        )
        for (const task of workingWithoutTerminal) {
          const workingCount = tasks.filter((t) => t.status === 'WORKING' && (kanbanTabIds[t.id] || t.id === task.id)).length
          if (workingCount <= maxConcurrent) {
            get().sendToAi(task, capturedWorkspaceId, { activate: false })
          }
        }
        if (workingWithoutTerminal.length > 0) return

        // 2. Fill available slots with next TODOs
        const workingCount = tasks.filter((t) => t.status === 'WORKING').length
        const freeSlots = maxConcurrent - workingCount
        if (freeSlots > 0) {
          const remaining = tasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < freeSlots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, capturedWorkspaceId, { activate: false })
          }
        }
      }, 500)
    } finally {
      set({ isLoading: false })
    }
  }
}

export function createSyncTasksFromFile(get: Get, set: Set) {
  return async () => {
    const { currentWorkspaceId, tasks: oldTasks, kanbanTabIds, kanbanPromptCwds } = get()
    if (!currentWorkspaceId) return
    try {
      const newTasks: KanbanTask[] = await window.kanbai.kanban.list(currentWorkspaceId)
      // Preserve in-memory transient flags (not persisted to file)
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (oldTask?.isPrequalifying) {
          newTask.isPrequalifying = true
        } else {
          delete newTask.isPrequalifying
        }
        if (oldTask?.splitSuggestions?.length) {
          newTask.splitSuggestions = oldTask.splitSuggestions
        } else {
          delete newTask.splitSuggestions
        }
      }

      // Archive previous resolutions as styled comments when a reopened ticket gets re-resolved
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (!oldTask) continue

        const resultChanged = oldTask.result && newTask.result && oldTask.result !== newTask.result
        const errorChanged = oldTask.error && newTask.error && oldTask.error !== newTask.error

        if (resultChanged || errorChanged) {
          const archiveComments: KanbanComment[] = [...(newTask.comments ?? [])]

          if (resultChanged) {
            archiveComments.push({
              id: crypto.randomUUID(),
              text: oldTask.result!,
              type: 'resolution-done',
              createdAt: oldTask.updatedAt,
            })
          }
          if (errorChanged) {
            archiveComments.push({
              id: crypto.randomUUID(),
              text: oldTask.error!,
              type: 'resolution-failed',
              createdAt: oldTask.updatedAt,
            })
          }

          newTask.comments = archiveComments
          window.kanbai.kanban.update({
            id: newTask.id,
            comments: archiveComments,
            workspaceId: currentWorkspaceId!,
          }).catch(() => { /* best-effort */ })
        }
      }

      let taskFinished = false

      // Detect status transitions for all tasks
      const tasksToLaunch: KanbanTask[] = []
      const tabsToAutoClose: Array<{ tabId: string; isCto: boolean }> = []
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (!oldTask) continue
        if (oldTask.status === newTask.status) continue

        const tabId = kanbanTabIds[newTask.id]

        // Detect manual transition to WORKING without an existing terminal
        if (newTask.status === 'WORKING' && !tabId) {
          tasksToLaunch.push(newTask)
          continue
        }

        // Determine if this task operates in CTO mode (direct ticket or child of CTO)
        const isCtoMode = newTask.isCtoTicket || isChildOfCto(newTask, newTasks)

        // CTO auto-approve: when a CTO-mode ticket transitions to PENDING, auto-set to TODO
        if (newTask.status === 'PENDING' && isCtoMode) {
          // Auto-approve by setting to TODO — unblocks the CTO cycle
          window.kanbai.kanban.update({
            id: newTask.id,
            status: 'TODO',
            workspaceId: currentWorkspaceId!,
          }).catch(() => { /* best-effort */ })
          newTask.status = 'TODO'
          taskFinished = true
          // Close the terminal to free the slot for the next CTO iteration
          if (tabId) {
            tabsToAutoClose.push({ tabId, isCto: true })
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
          }
          continue
        }

        // CTO cycle reset: when a CTO-mode ticket transitions from WORKING to TODO,
        // close the terminal to free the slot for the next iteration.
        if (newTask.status === 'TODO' && oldTask.status === 'WORKING' && isCtoMode) {
          taskFinished = true
          if (tabId) {
            tabsToAutoClose.push({ tabId, isCto: true })
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
          }
          continue
        }

        // Handle DONE/FAILED when tab is already closed (race: tab closed before sync detected status)
        if (!tabId) {
          if ((newTask.status === 'DONE' || newTask.status === 'FAILED') && newTask.worktreePath && currentWorkspaceId) {
            taskFinished = true
            relaunchedTaskIds.delete(newTask.id)
            const ticketLabel = formatTicketLabel(newTask)
            // Finalize + merge directly since no tab is left to defer to
            if (newTask.status === 'DONE') {
              autoMergeWorktree(newTask, currentWorkspaceId).catch(() => { /* best-effort */ })
            }
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
            const t = useI18n.getState().t
            const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
            const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
            if (newTask.status === 'DONE') {
              const body = todoCount > 0
                ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
                : t('notifications.noMoreTickets', { ticket: ticketLabel })
              pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: currentWorkspaceId })
            } else {
              pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
                { workspaceId: currentWorkspaceId })
            }
          }
          continue
        }

        const termStore = useTerminalTabStore.getState()
        if (newTask.status === 'DONE') {
          termStore.setTabColor(tabId, '#20D4A0')
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id) // allow future re-launch
          tabsToAutoClose.push({ tabId, isCto: isCtoMode })

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          // Auto-merge is deferred to handleTabClosed to avoid deleting the
          // worktree while Claude's process is still running in it.

          // Push notification
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          const body = todoCount > 0
            ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
            : t('notifications.noMoreTickets', { ticket: ticketLabel })
          pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: currentWorkspaceId!, tabId })
        }
        if (newTask.status === 'FAILED') {
          termStore.setTabColor(tabId, '#F4585B')
          termStore.killTabProcesses(tabId)
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id) // allow future re-launch

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          // Push notification
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
            { workspaceId: currentWorkspaceId!, tabId })
        }
        if (newTask.status === 'PENDING') {
          termStore.setTabColor(tabId, '#fbbf24')
          termStore.setTabActivity(tabId, true)
          termStore.killTabProcesses(tabId)
        }
      }

      set({ tasks: newTasks })

      // Launch Claude terminals for tasks manually moved to WORKING
      for (const task of tasksToLaunch) {
        get().sendToAi(task, task.workspaceId)
      }

      // After a task finishes (DONE/FAILED), pick the next one if under concurrency limit
      if (taskFinished) {
        const wsId = currentWorkspaceId
        const capturedTabsToClose = [...tabsToAutoClose]
        setTimeout(async () => {
          let maxConcurrent = 1
          if (wsId) {
            try {
              const kanbanConfig = await window.kanbai.kanban.getConfig(wsId)
              if (kanbanConfig?.paused) return
              if (kanbanConfig?.useWorktrees && kanbanConfig.maxConcurrentWorktrees > 1) {
                maxConcurrent = kanbanConfig.maxConcurrentWorktrees
              }

              // Auto-close terminals for completed tickets based on config.
              // Merge worktrees BEFORE closing tabs so the merge hook completes
              // while the terminal process is still alive.
              const termStore = useTerminalTabStore.getState()
              const { kanbanTabIds: currentTabIds, tasks: currentTasksForClose } = get()
              for (const { tabId, isCto } of capturedTabsToClose) {
                const shouldClose = isCto
                  ? kanbanConfig?.autoCloseCtoTerminals
                  : kanbanConfig?.autoCloseCompletedTerminals
                if (shouldClose) {
                  // Find the task linked to this tab and merge its worktree first
                  const taskId = Object.keys(currentTabIds).find((id) => currentTabIds[id] === tabId)
                  const task = taskId ? currentTasksForClose.find((t) => t.id === taskId) : undefined
                  if (task?.worktreePath && task.worktreeBranch && task.status === 'DONE' && wsId) {
                    try {
                      await window.kanbai.git.worktreeUnlock(task.worktreePath).catch(() => { /* best-effort */ })
                      await autoMergeWorktree(task, wsId)
                    } catch { /* best-effort — closeTab will still run */ }
                  }
                  termStore.closeTab(tabId)
                }
              }
            } catch { /* default to 1 */ }
          }
          const currentTasks = get().tasks
          const workingCount = currentTasks.filter((t) => t.status === 'WORKING').length
          const freeSlots = maxConcurrent - workingCount
          if (freeSlots > 0) {
            const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
            for (let i = 0; i < freeSlots; i++) {
              const next = pickNextTask(remaining)
              if (!next) break
              remaining.splice(remaining.indexOf(next), 1)
              get().sendToAi(next, wsId ?? undefined, { activate: false })
            }
          }
        }, 1000)
      }
    } catch { /* ignore sync errors */ }
  }
}

