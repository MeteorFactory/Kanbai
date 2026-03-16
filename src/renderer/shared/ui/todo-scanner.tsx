import { useEffect, useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useKanbanStore } from '../features/kanban'
import { useI18n } from '../lib/i18n'
import type { TodoEntry } from '../../shared/types'

type TodoType = 'TODO' | 'FIXME' | 'HACK' | 'NOTE' | 'XXX'
type FilterType = TodoType | 'ALL'

const TYPE_COLORS: Record<TodoType, string> = {
  TODO: 'var(--accent)',
  FIXME: 'var(--danger)',
  HACK: 'var(--warning)',
  NOTE: 'var(--success)',
  XXX: '#a78bfa',
}

function todoKey(entry: TodoEntry): string {
  return `${entry.file}:${entry.line}:${entry.type}`
}

export function TodoScanner() {
  const { t } = useI18n()
  const { activeProjectId, activeWorkspaceId, projects } = useWorkspaceStore()
  const { openFile } = useViewStore()
  const { createTask, updateTask } = useKanbanStore()
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
    // Filter out ignored unless showing them
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
      const fullPath = activeProject.path + '/' + entry.file
      openFile(fullPath, entry.line)
    },
    [activeProject, openFile],
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

    // Group by file for ticket creation
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
  }, [activeWorkspaceId, activeProjectId, selectedEntries, filtered, createTask, updateTask])

  const selectAll = useCallback(() => {
    const allKeys = new Set(filtered.map(todoKey))
    setSelectedEntries(allKeys)
  }, [filtered])

  const deselectAll = useCallback(() => {
    setSelectedEntries(new Set())
  }, [])

  if (!activeProject) {
    return <div className="todo-scanner-empty">{t('todos.selectProject')}</div>
  }

  return (
    <div className="todo-scanner">
      <div className="todo-scanner-header">
        <h3>{t('todos.title')}</h3>
        <span className="todo-scanner-count">{t('todos.itemCount', { count: String(filtered.length) })}</span>
        {ignoredKeys.size > 0 && (
          <button
            className={`todo-scanner-toggle-ignored${showIgnored ? ' todo-scanner-toggle-ignored--active' : ''}`}
            onClick={() => setShowIgnored(!showIgnored)}
            title={t('todos.toggleIgnored')}
          >
            {t('todos.ignoredCount', { count: String(ignoredKeys.size) })}
          </button>
        )}
        <button
          className="todo-scanner-refresh"
          onClick={scan}
          disabled={loading}
          title={t('common.refresh')}
        >
          {loading ? '...' : '\u21BB'}
        </button>
      </div>

      {/* Action bar when items selected */}
      {selectedEntries.size > 0 && (
        <div className="todo-scanner-actions">
          <span className="todo-scanner-actions-count">
            {t('todos.selectedCount', { count: String(selectedEntries.size) })}
          </span>
          <button className="todo-scanner-action-btn" onClick={handleCreateTickets} title={t('todos.createTickets')}>
            {t('todos.createTickets')}
          </button>
          <button className="todo-scanner-action-btn todo-scanner-action-btn--ignore" onClick={handleIgnoreSelected} title={t('todos.ignoreSelected')}>
            {t('todos.ignoreSelected')}
          </button>
          <button className="todo-scanner-action-btn todo-scanner-action-btn--deselect" onClick={deselectAll}>
            {t('todos.deselectAll')}
          </button>
        </div>
      )}

      <div className="todo-scanner-filters">
        <button
          className={`todo-filter-btn${filter === 'ALL' ? ' todo-filter-btn--active' : ''}`}
          onClick={() => setFilter('ALL')}
        >
          {t('todos.allCount', { count: String(totalVisible) })}
        </button>
        {(['TODO', 'FIXME', 'HACK', 'NOTE', 'XXX'] as TodoType[]).map((type) => (
          <button
            key={type}
            className={`todo-filter-btn${filter === type ? ' todo-filter-btn--active' : ''}`}
            style={{
              borderColor: filter === type ? TYPE_COLORS[type] : undefined,
              color: filter === type ? TYPE_COLORS[type] : undefined,
            }}
            onClick={() => setFilter(type)}
          >
            {t('todos.typeCount', { type, count: String(typeCounts[type] || 0) })}
          </button>
        ))}
        {filtered.length > 0 && selectedEntries.size === 0 && (
          <button className="todo-filter-btn todo-filter-btn--select-all" onClick={selectAll}>
            {t('todos.selectAll')}
          </button>
        )}
      </div>

      <div className="todo-scanner-list">
        {loading && entries.length === 0 && (
          <div className="todo-scanner-loading">{t('todos.scanning')}</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="todo-scanner-no-results">{t('todos.noComments', { type: filter === 'ALL' ? '' : filter })}</div>
        )}
        {grouped.map(([file, items]) => (
          <div key={file} className="todo-scanner-group">
            <button
              className="todo-scanner-file-header"
              onClick={() => toggleFile(file)}
            >
              <span className="todo-scanner-chevron" style={{ transform: collapsedFiles.has(file) ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                {'\u25B6'}
              </span>
              <span className="todo-scanner-file-name">{file}</span>
              <span className="todo-scanner-file-count">{items.length}</span>
            </button>
            {!collapsedFiles.has(file) && (
              <div className="todo-scanner-entries">
                {items.map((entry, idx) => {
                  const key = todoKey(entry)
                  const isSelected = selectedEntries.has(key)
                  const isIgnored = ignoredKeys.has(key)
                  return (
                    <div
                      key={`${entry.file}:${entry.line}:${idx}`}
                      className={`todo-scanner-entry${isSelected ? ' todo-scanner-entry--selected' : ''}${isIgnored ? ' todo-scanner-entry--ignored' : ''}`}
                    >
                      <label
                        className="todo-scanner-checkbox"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(entry)}
                        />
                      </label>
                      <button
                        className="todo-scanner-entry-content"
                        onClick={() => handleClickEntry(entry)}
                      >
                        <div className="todo-scanner-entry-top">
                          <span
                            className="todo-scanner-type-badge"
                            style={{ background: `${TYPE_COLORS[entry.type]}20`, color: TYPE_COLORS[entry.type] }}
                          >
                            {entry.type}
                          </span>
                          <span className="todo-scanner-line">:{entry.line}</span>
                          <span className="todo-scanner-text">{entry.text}</span>
                          {isIgnored && (
                            <button
                              className="todo-scanner-unignore-btn"
                              onClick={(e) => { e.stopPropagation(); handleUnignore(entry) }}
                              title={t('todos.unignore')}
                            >
                              {t('todos.unignore')}
                            </button>
                          )}
                        </div>
                        <div className="todo-scanner-codeline">
                          <code>{entry.codeLine}</code>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
