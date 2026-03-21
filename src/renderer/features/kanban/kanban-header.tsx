import { useI18n } from '../../lib/i18n'
import type { KanbanTask, KanbanConfig } from '../../../shared/types/index'
import { COLUMNS, TASK_TYPES } from './kanban-constants'

export function KanbanHeader({
  filteredTasks,
  filterPriority,
  setFilterPriority,
  filterType,
  setFilterType,
  filterScope,
  setFilterScope,
  searchQuery,
  setSearchQuery,
  hasActiveFilters,
  showCreateForm,
  setShowCreateForm,
  kanbanConfig,
  showSettings,
  setShowSettings,
  onUpdateConfig,
  workspaceProjects,
}: {
  filteredTasks: KanbanTask[]
  filterPriority: string
  setFilterPriority: (v: string) => void
  filterType: string
  setFilterType: (v: string) => void
  filterScope: string
  setFilterScope: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  hasActiveFilters: boolean
  showCreateForm: boolean
  setShowCreateForm: (v: boolean) => void
  kanbanConfig: KanbanConfig | null
  showSettings: boolean
  setShowSettings: (v: boolean) => void
  onUpdateConfig: (key: keyof KanbanConfig, value: boolean | number) => void
  workspaceProjects: Array<{ id: string; name: string }>
}) {
  const { t } = useI18n()

  return (
    <div className="kanban-header">
      <div className="kanban-header-left">
        <h2>{t('kanban.title')}</h2>
        <div className="kanban-task-count-wrapper">
          <span className="kanban-task-count">{filteredTasks.length} {t('kanban.tasksLabel')}</span>
          <div className="kanban-task-count-tooltip">
            {COLUMNS.map((col) => {
              const count = filteredTasks.filter((tk) => tk.status === col.status).length
              return (
                <div key={col.status} className="kanban-task-count-row">
                  <span className="kanban-task-count-dot" style={{ background: col.color }} />
                  <span className="kanban-task-count-label">{t(col.labelKey)}</span>
                  <span className="kanban-task-count-value">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="kanban-header-filters">
        <select className="kanban-filter-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="all">{t('kanban.allPriorities')}</option>
          <option value="low">{t('kanban.low')}</option>
          <option value="medium">{t('kanban.medium')}</option>
          <option value="high">{t('kanban.high')}</option>
        </select>
        <select className="kanban-filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">{t('kanban.allTypes')}</option>
          {TASK_TYPES.map((tp) => (<option key={tp} value={tp}>{t(`kanban.type.${tp}`)}</option>))}
        </select>
        <select className="kanban-filter-select" value={filterScope} onChange={(e) => setFilterScope(e.target.value)}>
          <option value="all">{t('kanban.allScopes')}</option>
          <option value="workspace">{t('kanban.workspaceOnly')}</option>
          {workspaceProjects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
        {hasActiveFilters && (
          <button className="kanban-filter-clear" onClick={() => { setFilterPriority('all'); setFilterType('all'); setFilterScope('all'); setSearchQuery('') }}>
            {t('kanban.clearFilters')}
          </button>
        )}
      </div>
      <div className="kanban-header-actions">
        <input className="kanban-search-input" type="text" placeholder={t('common.search')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <button className="kanban-add-btn" onClick={() => setShowCreateForm(!showCreateForm)}>+ {t('kanban.newTask')}</button>
        <button
          className={`kanban-pause-btn${kanbanConfig?.paused ? ' kanban-pause-btn--active' : ''}`}
          onClick={() => onUpdateConfig('paused', !kanbanConfig?.paused)}
          title={kanbanConfig?.paused ? t('kanban.resume') : t('kanban.pause')}
        >
          {kanbanConfig?.paused ? '\u25B6' : '\u23F8'}
        </button>
        <button
          className={`kanban-settings-btn${showSettings ? ' kanban-settings-btn--active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title={t('kanban.settings')}
        >
          {'\u2699'}
        </button>
      </div>
    </div>
  )
}
