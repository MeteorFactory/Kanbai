import { useEffect, useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useKanbanStore } from '../../lib/stores/kanbanStore'
import type { TodoEntry } from '../../../shared/types'

type TodoType = 'TODO' | 'FIXME' | 'HACK' | 'NOTE' | 'XXX'
type FilterType = TodoType | 'ALL'

export const TYPE_COLORS: Record<TodoType, string> = {
  TODO: 'var(--accent)',
  FIXME: 'var(--danger)',
  HACK: 'var(--warning)',
  NOTE: 'var(--success)',
  XXX: '#a78bfa',
}

export function todoKey(entry: TodoEntry): string {
  return `${entry.file}:${entry.line}:${entry.type}`
}

export function useTodoScanner() {
  const { activeProjectId, activeWorkspaceId, projects } = useWorkspaceStore()
  const { createTask } = useKanbanStore()
  const [entries, setEntries] = useState<TodoEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterType>('ALL')
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Load ignored TODOs
  useEffect(() => {
    if (!activeProject) return
    window.kanbai.project.loadIgnoredTodos(activeProject.path).then((keys) => {
      setIgnoredKeys(new Set(keys))
    }).catch(() => {})
  }, [activeProject])

  const scan = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const results = await window.kanbai.project.scanTodos(activeProject.path)
      setEntries(results)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [activeProject])

  useEffect(() => {
    scan()
  }, [scan])

  const filtered = useMemo(() => {
    let result = entries
    if (!showIgnored) {
      result = result.filter((e) => !ignoredKeys.has(todoKey(e)))
    }
    if (filter !== 'ALL') {
      result = result.filter((e) => e.type === filter)
    }
    return result
  }, [entries, filter, ignoredKeys, showIgnored])

  const grouped = useMemo(() => {
    const groups: Record<string, TodoEntry[]> = {}
    for (const entry of filtered) {
      if (!groups[entry.file]) groups[entry.file] = []
      groups[entry.file]!.push(entry)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const visible = showIgnored ? entries : entries.filter((e) => !ignoredKeys.has(todoKey(e)))
    for (const entry of visible) {
      counts[entry.type] = (counts[entry.type] || 0) + 1
    }
    return counts
  }, [entries, ignoredKeys, showIgnored])

  const totalVisible = useMemo(() => {
    const visible = showIgnored ? entries : entries.filter((e) => !ignoredKeys.has(todoKey(e)))
    return visible.length
  }, [entries, ignoredKeys, showIgnored])

  const toggleFile = useCallback((file: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }
      return next
    })
  }, [])

  const handleClickEntry = useCallback(
    (entry: TodoEntry) => {
      if (!activeProject) return
      return activeProject.path + '/' + entry.file
    },
    [activeProject],
  )

  const toggleSelect = useCallback((entry: TodoEntry) => {
    const key = todoKey(entry)
    setSelectedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleIgnoreSelected = useCallback(async () => {
    if (!activeProject || selectedEntries.size === 0) return
    const newIgnored = new Set(ignoredKeys)
    for (const key of selectedEntries) {
      newIgnored.add(key)
    }
    setIgnoredKeys(newIgnored)
    setSelectedEntries(new Set())
    await window.kanbai.project.saveIgnoredTodos(activeProject.path, [...newIgnored])
  }, [activeProject, selectedEntries, ignoredKeys])

  const handleUnignore = useCallback(async (entry: TodoEntry) => {
    if (!activeProject) return
    const key = todoKey(entry)
    const newIgnored = new Set(ignoredKeys)
    newIgnored.delete(key)
    setIgnoredKeys(newIgnored)
    await window.kanbai.project.saveIgnoredTodos(activeProject.path, [...newIgnored])
  }, [activeProject, ignoredKeys])

  const handleCreateTickets = useCallback(async () => {
    if (!activeWorkspaceId || selectedEntries.size === 0) return
    const selected = filtered.filter((e) => selectedEntries.has(todoKey(e)))
    if (selected.length === 0) return

    const byFile: Record<string, TodoEntry[]> = {}
    for (const entry of selected) {
      if (!byFile[entry.file]) byFile[entry.file] = []
      byFile[entry.file]!.push(entry)
    }

    for (const [file, items] of Object.entries(byFile)) {
      const title = items.length === 1
        ? `[${items[0]!.type}] ${items[0]!.text.slice(0, 80) || file}`
        : `${items.length} TODOs in ${file}`
      const description = items.map((e) =>
        `### ${e.file}:${e.line}\n- **Type**: ${e.type}\n- **Message**: ${e.text}\n\`\`\`\n${e.codeLine}\n\`\`\``
      ).join('\n\n')

      await createTask(activeWorkspaceId, title, description, 'medium', 'refactor' as const, activeProjectId || undefined)
    }

    setSelectedEntries(new Set())
  }, [activeWorkspaceId, activeProjectId, selectedEntries, filtered, createTask])

  const selectAll = useCallback(() => {
    const allKeys = new Set(filtered.map(todoKey))
    setSelectedEntries(allKeys)
  }, [filtered])

  const deselectAll = useCallback(() => {
    setSelectedEntries(new Set())
  }, [])

  return {
    activeProject,
    entries,
    loading,
    filter,
    setFilter,
    filtered,
    grouped,
    typeCounts,
    totalVisible,
    collapsedFiles,
    selectedEntries,
    ignoredKeys,
    showIgnored,
    setShowIgnored,
    scan,
    toggleFile,
    handleClickEntry,
    toggleSelect,
    handleIgnoreSelected,
    handleUnignore,
    handleCreateTickets,
    selectAll,
    deselectAll,
  }
}

export type { TodoType, FilterType }
