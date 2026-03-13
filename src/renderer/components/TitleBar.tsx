import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { NotificationCenter } from './NotificationCenter'
import { UpdateCenter } from './UpdateCenter'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useViewStore, type ViewMode } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import { ALL_TAB_IDS } from '../../shared/constants/tabs'

interface TitleBarProps {
  availableMagicTabs: string[]
}

interface DropdownConfig {
  label: string
  items: Array<{ mode: ViewMode; labelKey: string }>
}

const SERVICES_DROPDOWN: DropdownConfig = {
  label: 'Services',
  items: [
    { mode: 'database', labelKey: 'view.database' },
    { mode: 'api', labelKey: 'view.api' },
    { mode: 'healthcheck', labelKey: 'view.healthcheck' },
  ],
}

const DEVOPS_DROPDOWN: DropdownConfig = {
  label: 'DevOps',
  items: [
    { mode: 'devops', labelKey: 'devops.pipelines' },
  ],
}

const PROJECTS_DROPDOWN: DropdownConfig = {
  label: 'Projets',
  items: [
    { mode: 'packages', labelKey: 'view.packages' },
    { mode: 'analysis', labelKey: 'view.analysis' },
    { mode: 'stats', labelKey: 'view.stats' },
    { mode: 'git', labelKey: 'view.git' },
    { mode: 'notes', labelKey: 'view.notes' },
  ],
}

function TabDropdown({
  config,
  viewMode,
  setViewMode,
  t,
}: {
  config: DropdownConfig
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  t: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isActive = config.items.some((item) => item.mode === viewMode)

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 300)
  }, [cancelClose])

  useEffect(() => () => cancelClose(), [cancelClose])

  const handleBtnEnter = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])

  const handleBtnLeave = useCallback(() => {
    scheduleClose()
  }, [scheduleClose])

  const handleMenuEnter = useCallback(() => {
    cancelClose()
  }, [cancelClose])

  const handleMenuLeave = useCallback(() => {
    scheduleClose()
  }, [scheduleClose])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleItemClick = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode)
      setOpen(false)
    },
    [setViewMode],
  )

  return (
    <div className="titlebar-dropdown" ref={ref}>
      <button
        className={`view-btn view-btn--dropdown${isActive ? ' view-btn--active' : ''}`}
        onClick={() => { cancelClose(); setOpen((v) => !v) }}
        onMouseEnter={handleBtnEnter}
        onMouseLeave={handleBtnLeave}
      >
        {config.label}
        <svg className="dropdown-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="titlebar-dropdown-menu"
          onMouseEnter={handleMenuEnter}
          onMouseLeave={handleMenuLeave}
        >
          {config.items.map((item) => (
            <button
              key={item.mode}
              className={`titlebar-dropdown-item${viewMode === item.mode ? ' titlebar-dropdown-item--active' : ''}`}
              onClick={() => handleItemClick(item.mode)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TitleBar(_props: TitleBarProps) {
  const { t } = useI18n()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const { viewMode, setViewMode } = useViewStore()
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const visibleTabs = useMemo(() => {
    return new Set(activeWorkspace?.visibleTabs ?? ALL_TAB_IDS)
  }, [activeWorkspace?.visibleTabs])

  const isTabVisible = useCallback((tabId: string) => visibleTabs.has(tabId), [visibleTabs])

  const filterDropdown = useCallback((config: DropdownConfig): DropdownConfig | null => {
    const filteredItems = config.items.filter((item) => isTabVisible(item.mode))
    return filteredItems.length > 0 ? { ...config, items: filteredItems } : null
  }, [isTabVisible])

  // Search input state
  const [searchFocused, setSearchFocused] = useState(false)

  const handleSearchFocus = useCallback(() => {
    setSearchFocused(true)
    setViewMode('search')
  }, [setViewMode])

  const handleSearchBlur = useCallback(() => {
    setSearchFocused(false)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />

      {activeWorkspace && (
        <>
          <div className="titlebar-workspace">
            <span
              className="titlebar-workspace-icon"
              style={{ backgroundColor: activeWorkspace.color || 'var(--accent)' }}
            >
              {activeWorkspace.icon || activeWorkspace.name.charAt(0).toUpperCase()}
            </span>
            <span className="titlebar-workspace-name">{activeWorkspace.name}</span>
          </div>
          <div className="titlebar-separator" />
        </>
      )}

      <div className="titlebar-tabs">
        {isTabVisible('kanban') && (
          <button
            className={`view-btn${viewMode === 'kanban' ? ' view-btn--active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            {t('view.kanban')}
          </button>
        )}
        {isTabVisible('terminal') && (
          <button
            className={`view-btn${viewMode === 'terminal' ? ' view-btn--active' : ''}`}
            onClick={() => setViewMode('terminal')}
          >
            {t('view.terminal')}
          </button>
        )}

        {(() => { const sd = filterDropdown(SERVICES_DROPDOWN); return sd ? <TabDropdown config={sd} viewMode={viewMode} setViewMode={setViewMode} t={t} /> : null })()}
        {(() => { const dd = filterDropdown(DEVOPS_DROPDOWN); return dd ? <TabDropdown config={dd} viewMode={viewMode} setViewMode={setViewMode} t={t} /> : null })()}
        {(() => { const pd = filterDropdown(PROJECTS_DROPDOWN); return pd ? <TabDropdown config={pd} viewMode={viewMode} setViewMode={setViewMode} t={t} /> : null })()}

        {isTabVisible('notes') && (
          <button
            className={`view-btn${viewMode === 'notes' ? ' view-btn--active' : ''}`}
            onClick={() => setViewMode('notes')}
          >
            {t('view.notes')}
          </button>
        )}

        {isTabVisible('ai') && (
          <button
            className={`view-btn${viewMode === 'claude' || viewMode === 'ai' ? ' view-btn--active' : ''}`}
            onClick={() => setViewMode('ai')}
          >
            {t('view.ai')}
          </button>
        )}

        {viewMode === 'file' && (
          <button className="view-btn view-btn--active">
            {t('view.file')}
          </button>
        )}
        {viewMode === 'diff' && (
          <button className="view-btn view-btn--active">
            {t('view.diff')}
          </button>
        )}
        {viewMode === 'prompts' && (
          <button className="view-btn view-btn--active">
            {t('view.prompts')}
          </button>
        )}
      </div>

      <div className="titlebar-actions">
        <UpdateCenter />
        <NotificationCenter />

        <div className={`titlebar-search${searchFocused ? ' titlebar-search--focused' : ''}`}>
          <svg className="titlebar-search-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            className="titlebar-search-input"
            type="text"
            placeholder={t('view.searchTooltip')}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            readOnly
          />
        </div>

        <button
          className={`view-btn view-btn--icon${viewMode === 'settings' ? ' view-btn--active' : ''}`}
          onClick={() => setViewMode('settings')}
          title={t('view.settingsTooltip')}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M13.5 8c0-.3-.2-.6-.4-.8l1-1.7-.9-.9-1.7 1c-.2-.2-.5-.4-.8-.4l-.5-1.8h-1.4l-.5 1.8c-.3 0-.6.2-.8.4l-1.7-1-.9.9 1 1.7c-.2.2-.4.5-.4.8l-1.8.5v1.4l1.8.5c0 .3.2.6.4.8l-1 1.7.9.9 1.7-1c.2.2.5.4.8.4l.5 1.8h1.4l.5-1.8c.3 0 .6-.2.8-.4l1.7 1 .9-.9-1-1.7c.2-.2.4-.5.4-.8l1.8-.5v-1.4l-1.8-.5z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
