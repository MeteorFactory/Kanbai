import { useViewStore } from '../../lib/stores/viewStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

/**
 * Convenience hook for file explorer feature.
 * Returns commonly used file-related state and actions.
 */
export function useFiles() {
  const { activeProjectId, projects } = useWorkspaceStore()
  const {
    selectedFilePath,
    selectedFiles,
    highlightedFilePath,
    bookmarks,
    clipboardPath,
    isEditorDirty,
    setViewMode,
    openFile,
    toggleFileSelection,
    clearSelection,
    toggleBookmark,
    setClipboard,
    clearClipboard,
    setEditorDirty,
  } = useViewStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)

  return {
    // State
    activeProject,
    selectedFilePath,
    selectedFiles,
    highlightedFilePath,
    bookmarks,
    clipboardPath,
    isEditorDirty,

    // Actions
    setViewMode,
    openFile,
    toggleFileSelection,
    clearSelection,
    toggleBookmark,
    setClipboard,
    clearClipboard,
    setEditorDirty,
  }
}
