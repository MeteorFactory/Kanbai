import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useKanbanStore, pickNextTask } from '../lib/stores/kanbanStore'
import type { KanbanTask } from '../../shared/types/index'

/**
 * Global hook that monitors kanban files for all workspaces.
 * - Sets up file watchers + polling for non-active workspaces with active tasks
 * - Every 60s, checks ALL boards (active + background) for idle boards with
 *   pending TODO tasks and auto-launches the next one
 */
export function useBackgroundKanbanSync(): void {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const watchedRef = useRef<Set<string>>(new Set())
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const syncBackgroundWorkspace = useKanbanStore.getState().syncBackgroundWorkspace

    // Determine which workspaces need background monitoring
    async function refreshWatchList(): Promise<void> {
      // Seed backgroundTasks for all non-active workspaces by loading their kanban files.
      // This ensures workspaces that were never visited during this session are still monitored.
      const { workspaces } = useWorkspaceStore.getState()
      for (const ws of workspaces) {
        if (ws.id === activeWorkspaceId) continue
        if (ws.deletedAt) continue
        try {
          const tasks: KanbanTask[] = await window.kanbai.kanban.list(ws.id)
          useKanbanStore.setState((state) => ({
            backgroundTasks: { ...state.backgroundTasks, [ws.id]: tasks },
          }))
        } catch { /* best-effort */ }
      }

      const { backgroundTasks } = useKanbanStore.getState()
      const needed = new Set<string>()

      for (const [wsId, tasks] of Object.entries(backgroundTasks)) {
        if (wsId === activeWorkspaceId) continue
        const hasActive = tasks.some((t) => t.status === 'WORKING' || t.status === 'TODO')
        if (hasActive) needed.add(wsId)
      }

      // Add watchers for newly needed workspaces
      for (const wsId of needed) {
        if (!watchedRef.current.has(wsId)) {
          watchedRef.current.add(wsId)
          window.kanbai.kanban.watchAdd(wsId).catch(() => { /* best-effort */ })
          // Polling fallback every 30s
          const timer = setInterval(() => {
            syncBackgroundWorkspace(wsId)
          }, 30000)
          pollTimersRef.current.set(wsId, timer)
        }
      }

      // Remove watchers for workspaces no longer needed
      for (const wsId of watchedRef.current) {
        if (!needed.has(wsId) || wsId === activeWorkspaceId) {
          watchedRef.current.delete(wsId)
          window.kanbai.kanban.watchRemove(wsId).catch(() => { /* best-effort */ })
          const timer = pollTimersRef.current.get(wsId)
          if (timer) {
            clearInterval(timer)
            pollTimersRef.current.delete(wsId)
          }
        }
      }

      // --- Auto-resume: check ALL boards for idle boards with pending tasks ---
      const store = useKanbanStore.getState()

      // Check background workspaces
      for (const [wsId, tasks] of Object.entries(store.backgroundTasks)) {
        if (wsId === activeWorkspaceId) continue
        const hasWorking = tasks.some((t) => t.status === 'WORKING')
        if (!hasWorking) {
          const next = pickNextTask(tasks)
          if (next) store.sendToAi(next, wsId)
        }
      }

      // Check active workspace — sync from file first to catch missed events
      if (activeWorkspaceId) {
        await useKanbanStore.getState().syncTasksFromFile()
        const freshStore = useKanbanStore.getState()
        const { tasks: activeTasks, kanbanTabIds: activeTabIds } = freshStore
        if (activeTasks.length > 0) {
          // Only launch next TODO if no task is WORKING or PENDING (in-progress states)
          const hasInProgress = activeTasks.some(
            (t) => t.status === 'WORKING' || t.status === 'PENDING',
          )
          if (!hasInProgress) {
            const next = pickNextTask(activeTasks)
            if (next) freshStore.sendToAi(next)
          }
        }
      }
    }

    // Listen for file change events from non-active workspaces
    const unsubscribe = window.kanbai.kanban.onFileChanged(({ workspaceId }) => {
      if (workspaceId !== activeWorkspaceId && watchedRef.current.has(workspaceId)) {
        syncBackgroundWorkspace(workspaceId)
      }
    })

    // Initial refresh + periodic refresh every 60s
    refreshWatchList()
    refreshTimerRef.current = setInterval(refreshWatchList, 60000)

    // Capture ref values for cleanup (refs may change before cleanup runs)
    const watchedSet = watchedRef.current
    const pollTimers = pollTimersRef.current

    return () => {
      unsubscribe()
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
      // Clean up all watchers and poll timers
      for (const wsId of watchedSet) {
        window.kanbai.kanban.watchRemove(wsId).catch(() => { /* best-effort */ })
      }
      watchedSet.clear()
      for (const timer of pollTimers.values()) {
        clearInterval(timer)
      }
      pollTimers.clear()
    }
  }, [activeWorkspaceId])
}
