<<<<<<<< HEAD:src/renderer/shared/ui/todo-scanner.tsx
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
========
import { useViewStore } from '../../lib/stores/viewStore'
import { useI18n } from '../../lib/i18n'
import { useTodoScanner, todoKey, TYPE_COLORS } from './use-todo-scanner'
import type { TodoType } from './use-todo-scanner'
>>>>>>>> kanban/r-66:src/renderer/features/search/todo-scanner.tsx

export function TodoScanner() {
  const { t } = useI18n()
  const { openFile } = useViewStore()
  const {
    activeProject,
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
  } = useTodoScanner()

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
        {loading && filtered.length === 0 && (
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
                        onClick={() => {
                          const fullPath = handleClickEntry(entry)
                          if (fullPath) openFile(fullPath, entry.line)
                        }}
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
