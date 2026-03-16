import { useKanbanStore } from './kanban-store'

/**
 * Convenience hook for kanban feature.
 * Returns commonly used kanban state and actions.
 */
export function useKanban() {
  const {
    tasks,
    isLoading,
    draggedTaskId,
    currentWorkspaceId,
    backgroundTasks,
    loadTasks,
    syncTasksFromFile,
    createTask,
    updateTaskStatus,
    updateTask,
    deleteTask,
    duplicateTask,
    setDragged,
    getTasksByStatus,
    sendToAi,
    syncBackgroundWorkspace,
    attachFiles,
    attachFromClipboard,
    removeAttachment,
    handleTabClosed,
    reactivateIfDone,
    acceptSplit,
    dismissSplit,
    applyCompanionUpdate,
  } = useKanbanStore()

  return {
    // State
    tasks,
    isLoading,
    draggedTaskId,
    currentWorkspaceId,
    backgroundTasks,

    // Actions
    loadTasks,
    syncTasksFromFile,
    createTask,
    updateTaskStatus,
    updateTask,
    deleteTask,
    duplicateTask,
    setDragged,
    getTasksByStatus,
    sendToAi,
    syncBackgroundWorkspace,
    attachFiles,
    attachFromClipboard,
    removeAttachment,
    handleTabClosed,
    reactivateIfDone,
    acceptSplit,
    dismissSplit,
    applyCompanionUpdate,
  }
}
