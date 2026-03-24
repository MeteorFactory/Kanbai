import type { KanbanTask } from '../../../shared/types/index'
import type { Get, Set } from './kanban-store-types'
import { useTerminalTabStore } from '../terminal'
import { useWorkspaceStore } from '../workspace/workspace-store'
import { useI18n } from '../../lib/i18n'
import { pushNotification } from '../../shared/stores/notification-store'
import {
  formatTicketLabel, pickNextTask, availableSlots,
  isChildOfCto, autoMergeWorktree, relaunchedTaskIds,
} from './kanban-store-utils'

export function createSyncBackgroundWorkspace(get: Get, set: Set) {
  return async (wsId: string) => {
    try {
      const newTasks: KanbanTask[] = await window.kanbai.kanban.list(wsId)
      const oldTasks = get().backgroundTasks[wsId] ?? []
      // Clear stale isPrequalifying from file (transient flag, in-memory only)
      for (const t of newTasks) {
        delete t.isPrequalifying
      }
      const { kanbanTabIds, kanbanPromptCwds } = get()

      let taskFinished = false
      const tabsToAutoClose: Array<{ tabId: string; isCto: boolean }> = []
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (!oldTask) continue
        if (oldTask.status === newTask.status) continue

        const tabId = kanbanTabIds[newTask.id]

        // Determine if this task operates in CTO mode (direct ticket or child of CTO)
        const isCtoMode = newTask.isCtoTicket || isChildOfCto(newTask, newTasks)

        // CTO auto-approve: PENDING → TODO
        if (newTask.status === 'PENDING' && isCtoMode) {
          window.kanbai.kanban.update({
            id: newTask.id,
            status: 'TODO',
            workspaceId: wsId,
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
          if ((newTask.status === 'DONE' || newTask.status === 'FAILED') && newTask.worktreePath) {
            taskFinished = true
            relaunchedTaskIds.delete(newTask.id)
            const ticketLabel = formatTicketLabel(newTask)
            if (newTask.status === 'DONE') {
              autoMergeWorktree(newTask, wsId).catch(() => { /* best-effort */ })
            }
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
            const t = useI18n.getState().t
            const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ?? ''
            const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
            if (newTask.status === 'DONE') {
              const body = todoCount > 0
                ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
                : t('notifications.noMoreTickets', { ticket: ticketLabel })
              pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: wsId })
            } else {
              pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
                { workspaceId: wsId })
            }
          }
          continue
        }

        const termStore = useTerminalTabStore.getState()
        if (newTask.status === 'DONE') {
          termStore.setTabColor(tabId, '#20D4A0')
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id)
          tabsToAutoClose.push({ tabId, isCto: isCtoMode })

          // Auto-commit any uncommitted worktree changes (safety net — covered by merge handler too)
          if (newTask.worktreePath) {
            const ticketLabel = formatTicketLabel(newTask)
            window.kanbai.git.worktreeFinalize(newTask.worktreePath, ticketLabel).catch(() => { /* best-effort */ })
          }

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          // Auto-merge is deferred to handleTabClosed to avoid deleting the
          // worktree while Claude's process is still running in it.

          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          const body = todoCount > 0
            ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
            : t('notifications.noMoreTickets', { ticket: ticketLabel })
          pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: wsId, tabId })
        }
        if (newTask.status === 'FAILED') {
          termStore.setTabColor(tabId, '#F4585B')
          termStore.killTabProcesses(tabId)
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id)

          // Auto-commit any uncommitted worktree changes (safety net)
          if (newTask.worktreePath) {
            const ticketLabel = formatTicketLabel(newTask)
            window.kanbai.git.worktreeFinalize(newTask.worktreePath, ticketLabel).catch(() => { /* best-effort */ })
          }

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
            { workspaceId: wsId, tabId })
        }
        if (newTask.status === 'PENDING') {
          termStore.setTabColor(tabId, '#fbbf24')
          termStore.setTabActivity(tabId, true)
          termStore.killTabProcesses(tabId)
          termStore.clearTabSessions(tabId)
        }
      }

      // Update background cache
      set((state) => ({
        backgroundTasks: { ...state.backgroundTasks, [wsId]: newTasks },
      }))

      // Pick next TODO after a task finishes (skip if workspace is paused or at concurrency limit)
      if (taskFinished) {
        const capturedTabsToClose = [...tabsToAutoClose]
        setTimeout(async () => {
          // Auto-close terminals for completed tickets based on config.
          // Merge worktrees BEFORE closing tabs so the merge hook completes
          // while the terminal process is still alive.
          if (capturedTabsToClose.length > 0) {
            try {
              const kanbanConfig = await window.kanbai.kanban.getConfig(wsId)
              const termStore = useTerminalTabStore.getState()
              const { kanbanTabIds: bgTabIds, tasks: bgTasksForClose, backgroundTasks: bgTasksMap } = get()
              const allBgTasks = bgTasksMap[wsId] ?? []
              for (const { tabId, isCto } of capturedTabsToClose) {
                const shouldClose = isCto
                  ? kanbanConfig?.autoCloseCtoTerminals
                  : kanbanConfig?.autoCloseCompletedTerminals
                if (shouldClose) {
                  // Find the task linked to this tab and merge its worktree first
                  const taskId = Object.keys(bgTabIds).find((id) => bgTabIds[id] === tabId)
                  const task = taskId
                    ? (bgTasksForClose.find((t) => t.id === taskId) ?? allBgTasks.find((t) => t.id === taskId))
                    : undefined
                  if (task?.worktreePath && task.worktreeBranch && task.status === 'DONE') {
                    try {
                      await window.kanbai.git.worktreeUnlock(task.worktreePath).catch(() => { /* best-effort */ })
                      await autoMergeWorktree(task, wsId)
                    } catch { /* best-effort — closeTab will still run */ }
                  }
                  termStore.closeTab(tabId)
                }
              }
            } catch { /* best-effort */ }
          }

          const bgTasks = get().backgroundTasks[wsId] ?? []
          const slots = await availableSlots(bgTasks, wsId)
          const remaining = bgTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < slots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, wsId, { activate: false })
          }
        }, 1000)
      }
    } catch { /* ignore sync errors */ }
  }
}
