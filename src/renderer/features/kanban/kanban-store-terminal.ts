import type { KanbanTask, KanbanStatus, KanbanComment } from '../../../shared/types/index'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import type { Get, Set } from './kanban-store-types'
import { useTerminalTabStore } from '../terminal'
import {
  repoPathFromWorktree, autoMergeWorktree,
  reactivatingTaskIds,
} from './kanban-store-utils'

export function createHandleTabClosed(get: Get, set: Set) {
  return (tabId: string) => {
    const { kanbanTabIds, tasks, currentWorkspaceId, backgroundTasks } = get()
    // Find the task linked to this tab
    const taskId = Object.keys(kanbanTabIds).find((id) => kanbanTabIds[id] === tabId)
    if (!taskId) return

    // Remove the tab mapping
    const newTabIds = { ...kanbanTabIds }
    delete newTabIds[taskId]
    set({ kanbanTabIds: newTabIds })

    // Find the task across current and background workspaces
    let task = tasks.find((t) => t.id === taskId)
    let wsId = currentWorkspaceId
    if (!task) {
      for (const [bgWsId, bgTasks] of Object.entries(backgroundTasks)) {
        task = bgTasks.find((t) => t.id === taskId)
        if (task) { wsId = bgWsId; break }
      }
    }

    // Unlock the worktree session lock now that the terminal process has exited
    if (task?.worktreePath) {
      window.kanbai.git.worktreeUnlock(task.worktreePath).catch(() => { /* best-effort */ })
    }

    // Cleanup worktree if its branch has been merged (handles autoMerge disabled or manual merge)
    const cleanupMergedWorktree = (t: KanbanTask) => {
      if (!t.worktreePath || !t.worktreeBranch) return
      const repoPath = repoPathFromWorktree(t.worktreePath)
      const worktreePath = t.worktreePath
      const worktreeBranch = t.worktreeBranch
      window.kanbai.git.branchIsMerged(repoPath, worktreeBranch).then(async (merged) => {
        if (!merged) return
        await window.kanbai.git.worktreeRemove(repoPath, worktreePath, true).catch(() => { /* best-effort */ })
        await window.kanbai.git.deleteBranch(repoPath, worktreeBranch).catch(() => { /* best-effort */ })
      }).catch(() => { /* best-effort */ })
    }

    // If task is already DONE in memory, try auto-merge then cleanup any remaining worktree.
    // This may be a no-op if auto-close already merged the worktree before closing the tab.
    if (task?.worktreePath && task.worktreeBranch && task.status === 'DONE' && wsId) {
      autoMergeWorktree(task, wsId)
        .finally(() => cleanupMergedWorktree(task!))
      return
    }

    // If task was WORKING, check actual file status before setting to PENDING.
    // The agent may have already written DONE to the file — avoid overwriting it.
    if (task && task.status === 'WORKING' && wsId) {
      const capturedTask = task
      const capturedWsId = wsId
      window.kanbai.kanban.list(capturedWsId).then((fileTasks: KanbanTask[]) => {
        const fileTask = fileTasks.find((t) => t.id === taskId)
        if (fileTask && (fileTask.status === 'DONE' || fileTask.status === 'FAILED')) {
          // File says DONE/FAILED — update in-memory and trigger merge
          const currentTasks = get().tasks
          const updatedTasks = currentTasks.map((t) =>
            t.id === taskId ? { ...t, status: fileTask.status as KanbanStatus, result: fileTask.result, error: fileTask.error, updatedAt: Date.now() } : t,
          )
          set({ tasks: updatedTasks })
          if (fileTask.status === 'DONE' && capturedTask.worktreePath && capturedTask.worktreeBranch) {
            autoMergeWorktree({ ...capturedTask, status: 'DONE' }, capturedWsId)
              .finally(() => cleanupMergedWorktree(capturedTask))
          }
        } else {
          // File is not DONE — safe to set to PENDING
          const currentTasks = get().tasks
          const updatedTasks = currentTasks.map((t) =>
            t.id === taskId ? { ...t, status: 'PENDING' as KanbanStatus, updatedAt: Date.now() } : t,
          )
          set({ tasks: updatedTasks })
          window.kanbai.kanban.update({
            id: taskId,
            status: 'PENDING',
            workspaceId: capturedWsId,
          }).catch(() => { /* best-effort */ })
        }
      }).catch(() => {
        // Fallback: set to PENDING if file read fails
        const currentTasks = get().tasks
        const updatedTasks = currentTasks.map((t) =>
          t.id === taskId ? { ...t, status: 'PENDING' as KanbanStatus, updatedAt: Date.now() } : t,
        )
        set({ tasks: updatedTasks })
        if (wsId) {
          window.kanbai.kanban.update({
            id: taskId,
            status: 'PENDING',
            workspaceId: wsId,
          }).catch(() => { /* best-effort */ })
        }
      })
    } else if (task) {
      // Task not WORKING and not DONE — cleanup worktree if branch was already merged
      cleanupMergedWorktree(task)
    }
  }
}

export function createReactivateIfDone(get: Get, set: Set) {
  return (tabId: string, message?: string) => {
    const { kanbanTabIds } = get()
    const taskId = Object.keys(kanbanTabIds).find((id) => kanbanTabIds[id] === tabId)
    if (!taskId || reactivatingTaskIds.has(taskId)) return

    // Find the task across current and background workspaces
    const { tasks, currentWorkspaceId, backgroundTasks } = get()
    let task: KanbanTask | undefined
    let workspaceId: string | null = null

    task = tasks.find((t) => t.id === taskId)
    if (task) {
      workspaceId = currentWorkspaceId
    } else {
      for (const [wsId, wsTasks] of Object.entries(backgroundTasks)) {
        task = wsTasks.find((t) => t.id === taskId)
        if (task) {
          workspaceId = wsId
          break
        }
      }
    }

    if (!task || task.status !== 'DONE' || !workspaceId) return

    // Grace period: don't reactivate a ticket marked DONE less than 30s ago.
    // This prevents accidental reactivation when the user presses Enter
    // right after an AI agent finishes and marks the ticket as DONE.
    const REACTIVATION_GRACE_PERIOD_MS = 30_000
    if (task.updatedAt && Date.now() - task.updatedAt < REACTIVATION_GRACE_PERIOD_MS) return

    const isCurrentWorkspace = workspaceId === currentWorkspaceId

    // Create a comment from the terminal message if provided
    const commentText = message?.trim()
    let updatedComments = task.comments ?? []
    if (commentText) {
      const newComment: KanbanComment = {
        id: crypto.randomUUID(),
        text: commentText,
        createdAt: Date.now(),
      }
      updatedComments = [...updatedComments, newComment]
    }

    reactivatingTaskIds.add(taskId)
    const updateTask = (t: KanbanTask): KanbanTask =>
      t.id === taskId ? { ...t, status: 'WORKING' as KanbanStatus, comments: updatedComments, updatedAt: Date.now() } : t

    if (isCurrentWorkspace) {
      set((state) => ({ tasks: state.tasks.map(updateTask) }))
    } else {
      set((state) => ({
        backgroundTasks: {
          ...state.backgroundTasks,
          [workspaceId!]: (state.backgroundTasks[workspaceId!] ?? []).map(updateTask),
        },
      }))
    }

    // Reset tab color to provider detection color
    const termStore = useTerminalTabStore.getState()
    const providerColor = AI_PROVIDERS[task.aiProvider ?? 'claude']?.detectionColor ?? null
    termStore.setTabColor(tabId, providerColor)

    // Persist to file (include comments if a message was captured)
    window.kanbai.kanban.update({
      id: taskId,
      status: 'WORKING',
      workspaceId,
      ...(commentText ? { comments: updatedComments } : {}),
    }).then(() => {
      reactivatingTaskIds.delete(taskId)
    }).catch(() => {
      reactivatingTaskIds.delete(taskId)
    })
  }
}
