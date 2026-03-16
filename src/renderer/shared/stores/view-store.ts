import { create } from 'zustand'

export type ViewMode = 'terminal' | 'git' | 'kanban' | 'file' | 'npm' | 'packages' | 'diff' | 'claude' | 'ai' | 'settings' | 'todos' | 'shortcuts' | 'stats' | 'search' | 'prompts' | 'api' | 'database' | 'analysis' | 'healthcheck' | 'devops' | 'notes'

interface ViewState {
  viewMode: ViewMode
  selectedFilePath: string | null
  highlightedFilePath: string | null
  pendingLineNumber: number | null
  isEditorDirty: boolean
  availableMagicTabs: string[]
  // Multi-select for diff
  selectedFiles: string[]
  diffFiles: [string, string] | null
  // Clipboard for file operations
  clipboardPath: string | null
  clipboardOperation: 'copy' | null
  // Database explorer
  pendingDbProjectPath: string | null
  // Kanban task selection from terminal notch
  pendingKanbanTaskId: string | null
  // Recent files and bookmarks
  recentFiles: string[]
  bookmarks: string[]
  setPendingDbProjectPath: (path: string | null) => void
  setViewMode: (mode: ViewMode) => void
  navigateToKanbanTask: (taskId: string) => void
  openFile: (filePath: string, lineNumber?: number) => void
  setHighlightedFilePath: (path: string | null) => void
  setEditorDirty: (dirty: boolean) => void
  setAvailableMagicTabs: (tabs: string[]) => void
  toggleFileSelection: (filePath: string) => void
  openDiff: () => void
  clearSelection: () => void
  setClipboard: (path: string, operation: 'copy') => void
  clearClipboard: () => void
  toggleBookmark: (filePath: string) => void
}

// Load persisted data from localStorage
function loadPersistedList(key: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function persistList(key: string, list: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(list))
    }
  } catch { /* ignore in non-browser environments */ }
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewMode: 'kanban',
  selectedFilePath: null,
  highlightedFilePath: null,
  pendingLineNumber: null,
  isEditorDirty: false,
  availableMagicTabs: [],
  selectedFiles: [],
  diffFiles: null,
  clipboardPath: null,
  clipboardOperation: null,
  pendingDbProjectPath: null,
  pendingKanbanTaskId: null,
  recentFiles: loadPersistedList('kanbai:recentFiles'),
  bookmarks: loadPersistedList('kanbai:bookmarks'),
  setPendingDbProjectPath: (path) => set({ pendingDbProjectPath: path }),
  setViewMode: (mode) => set({ viewMode: mode }),
  navigateToKanbanTask: (taskId) => set({ viewMode: 'kanban', pendingKanbanTaskId: taskId }),
  openFile: (filePath, lineNumber?) => {
    const { recentFiles } = get()
    const updated = [filePath, ...recentFiles.filter((f) => f !== filePath)].slice(0, 20)
    persistList('kanbai:recentFiles', updated)
    set({
      viewMode: 'file',
      selectedFilePath: filePath,
      highlightedFilePath: filePath,
      isEditorDirty: false,
      pendingLineNumber: lineNumber ?? null,
      recentFiles: updated,
    })
  },
  setHighlightedFilePath: (path) => set({ highlightedFilePath: path }),
  setEditorDirty: (dirty) => set({ isEditorDirty: dirty }),
  setAvailableMagicTabs: (tabs) => set({ availableMagicTabs: tabs }),
  toggleFileSelection: (filePath) => {
    const { selectedFiles } = get()
    if (selectedFiles.includes(filePath)) {
      set({ selectedFiles: selectedFiles.filter((f) => f !== filePath) })
    } else if (selectedFiles.length < 2) {
      const newSelection = [...selectedFiles, filePath]
      set({ selectedFiles: newSelection })
      // Auto-open diff when 2 files selected
      if (newSelection.length === 2) {
        set({ diffFiles: [newSelection[0]!, newSelection[1]!], viewMode: 'diff' })
      }
    } else {
      // Replace oldest selection
      set({ selectedFiles: [selectedFiles[1]!, filePath] })
    }
  },
  openDiff: () => {
    const { selectedFiles } = get()
    if (selectedFiles.length === 2) {
      set({ diffFiles: [selectedFiles[0]!, selectedFiles[1]!], viewMode: 'diff' })
    }
  },
  clearSelection: () => set({ selectedFiles: [], diffFiles: null }),
  setClipboard: (path, operation) => set({ clipboardPath: path, clipboardOperation: operation }),
  clearClipboard: () => set({ clipboardPath: null, clipboardOperation: null }),
  toggleBookmark: (filePath) => {
    const { bookmarks } = get()
    const updated = bookmarks.includes(filePath)
      ? bookmarks.filter((f) => f !== filePath)
      : [...bookmarks, filePath]
    persistList('kanbai:bookmarks', updated)
    set({ bookmarks: updated })
  },
}))
