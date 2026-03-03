import { useState, useEffect, useCallback, useRef } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/Sidebar'
import { TerminalArea } from './components/TerminalArea'
import { TitleBar } from './components/TitleBar'
import { KanbanBoard } from './components/KanbanBoard'
import { GitPanel } from './components/GitPanel'
import { FileViewer } from './components/FileViewer'
import { NpmPanel } from './components/NpmPanel'
import { PackagesPanel } from './components/PackagesPanel'
import { FileDiffViewer } from './components/FileDiffViewer'
import { ClaudeSettingsPanel } from './components/claude-settings'
import { SettingsPanel } from './components/SettingsPanel'
import { SessionModal } from './components/SessionModal'
import { CommandPalette } from './components/CommandPalette'
import { GlobalSearch } from './components/GlobalSearch'
import { TodoScanner } from './components/TodoScanner'
import { ShortcutsPanel } from './components/ShortcutsPanel'
import { ProjectStats } from './components/ProjectStats'
import { PromptTemplates } from './components/PromptTemplates'
import { ApiTesterPanel } from './components/ApiTesterPanel'
import { HealthCheckPanel } from './components/HealthCheckPanel'
import { DatabaseExplorer } from './components/DatabaseExplorer'
import { CodeAnalysisPanel } from './components/CodeAnalysisPanel'
import { AppUpdateModal } from './components/AppUpdateModal'
import { TutorialModal } from './components/TutorialModal'
import { ToastContainer } from './components/ToastContainer'
import { useWorkspaceStore } from './lib/stores/workspaceStore'
import { useTerminalTabStore } from './lib/stores/terminalTabStore'
import { useViewStore } from './lib/stores/viewStore'
import { useAppUpdateStore } from './lib/stores/appUpdateStore'
import { useClaudeStore } from './lib/stores/claudeStore'
import { useI18n } from './lib/i18n'
import { useBackgroundKanbanSync } from './hooks/useBackgroundKanbanSync'
import type { AppSettings, SessionData, SessionTab } from '../shared/types'

const TUTORIAL_VIEWS = new Set([
  'kanban', 'terminal', 'git', 'database', 'packages',
  'analysis', 'todos', 'stats', 'prompts', 'api', 'healthcheck',
  'settings', 'search', 'shortcuts', 'claude', 'ai',
])

export function App() {
  const { viewMode, setViewMode, availableMagicTabs, setAvailableMagicTabs } = useViewStore()
  const { activeProjectId, projects, activeWorkspaceId, workspaces } = useWorkspaceStore()
  const { t } = useI18n()
  const [pendingSession, setPendingSession] = useState<SessionData | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false)
  const [tutorialSection, setTutorialSection] = useState<string | null>(null)
  const [tutorialCompleted, setTutorialCompleted] = useState(true)
  const [tutorialSeenSections, setTutorialSeenSections] = useState<string[]>([])
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [isResizing, setIsResizing] = useState(false)
  const resizingRef = useRef(false)

  // Detect available magic tabs based on active project
  const activeProject = projects.find((p) => p.id === activeProjectId)
  useEffect(() => {
    if (!activeProject) {
      setAvailableMagicTabs([])
      return
    }
    // Always enable packages tab (multi-technology detection happens inside the panel)
    setAvailableMagicTabs(['packages'])
  }, [activeProject, setAvailableMagicTabs])

  // Check for saved session on startup
  useEffect(() => {
    window.kanbai.session.load().then((session) => {
      if (session && session.tabs.length > 0) {
        setPendingSession(session)
      }
      setSessionChecked(true)
    })
  }, [])

  // Load tutorial state and show welcome on first launch
  useEffect(() => {
    window.kanbai.settings.get().then((s: AppSettings) => {
      const completed = s.tutorialCompleted ?? false
      const seen = s.tutorialSeenSections ?? []
      setTutorialCompleted(completed)
      setTutorialSeenSections(seen)
      if (!completed && seen.length === 0) {
        setTutorialSection('welcome')
      }
    })
  }, [])

  // Show contextual tutorial when viewMode changes
  useEffect(() => {
    if (tutorialCompleted) return
    if (!TUTORIAL_VIEWS.has(viewMode)) return
    if (tutorialSeenSections.includes(viewMode)) return
    if (tutorialSection !== null) return
    setTutorialSection(viewMode)
  }, [viewMode, tutorialCompleted, tutorialSeenSections, tutorialSection])

  // Apply theme on startup and when settings change
  useEffect(() => {
    const applyTheme = (theme: string) => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', theme)
      }
    }

    window.kanbai.settings.get().then((s: AppSettings) => {
      applyTheme(s?.theme || 'dark')
    })

    // Listen for system theme changes when using 'system' mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      window.kanbai.settings.get().then((s: AppSettings) => {
        if (s?.theme === 'system') {
          applyTheme('system')
        }
      })
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [])

  // Save session on before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { activeWorkspaceId, activeProjectId, activeNamespaceId } = useWorkspaceStore.getState()
      const { tabs } = useTerminalTabStore.getState()

      const sessionTabs: SessionTab[] = tabs.map((tab) => ({
        workspaceId: tab.workspaceId,
        cwd: tab.cwd,
        label: tab.label,
        isSplit: tab.paneTree.type === 'split',
        leftCommand: tab.paneTree.type === 'split'
          ? (tab.paneTree.children[0].type === 'leaf' ? tab.paneTree.children[0].initialCommand : null)
          : (tab.paneTree.type === 'leaf' ? tab.paneTree.initialCommand : null),
        rightCommand: tab.paneTree.type === 'split'
          ? (tab.paneTree.children[1].type === 'leaf' ? tab.paneTree.children[1].initialCommand : null)
          : null,
      }))

      if (sessionTabs.length > 0) {
        const session: SessionData = {
          activeWorkspaceId,
          activeProjectId,
          activeNamespaceId,
          tabs: sessionTabs,
          savedAt: Date.now(),
        }
        // Use sendBeacon-style sync save via IPC
        window.kanbai.session.save(session)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Initialize app update listener
  const initUpdateListener = useAppUpdateStore((s) => s.initListener)
  useEffect(() => {
    return initUpdateListener()
  }, [initUpdateListener])

  // Background kanban sync for non-active workspaces
  useBackgroundKanbanSync()

  // Initialize Claude activity listeners (workspace "Working" / "Done" tags)
  const initClaudeListeners = useClaudeStore((s) => s.initListeners)
  useEffect(() => {
    return initClaudeListeners()
  }, [initClaudeListeners])

  // Listen for menu actions from main process
  useEffect(() => {
    const unsubscribe = window.kanbai.onMenuAction((action: string) => {
      if (action.startsWith('view:')) {
        const view = action.replace('view:', '')
        setViewMode(view as typeof viewMode)
      } else if (action === 'commandPalette') {
        setCommandPaletteOpen((v) => !v)
        setQuickSwitchOpen(false)
      } else if (action === 'quickSwitch') {
        setQuickSwitchOpen((v) => !v)
        setCommandPaletteOpen(false)
      } else if (action === 'workspace:new') {
        // Dispatch a custom event for the sidebar to handle
        window.dispatchEvent(new CustomEvent('kanbai:menu-action', { detail: action }))
      } else if (action === 'workspace:newFromFolder') {
        window.dispatchEvent(new CustomEvent('kanbai:menu-action', { detail: action }))
      } else if (action === 'workspace:import') {
        window.dispatchEvent(new CustomEvent('kanbai:menu-action', { detail: action }))
      } else if (action === 'workspace:export') {
        window.dispatchEvent(new CustomEvent('kanbai:menu-action', { detail: action }))
      }
    })
    return unsubscribe
  }, [setViewMode])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K: Command Palette
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((v) => !v)
        setQuickSwitchOpen(false)
      }
      // Cmd+P: Quick Project Switch
      if (e.metaKey && e.key === 'p') {
        e.preventDefault()
        setQuickSwitchOpen((v) => !v)
        setCommandPaletteOpen(false)
      }
      // Cmd+Shift+F: Global Search
      if (e.metaKey && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setViewMode('search')
        setCommandPaletteOpen(false)
        setQuickSwitchOpen(false)
      }
      // Cmd+,: Preferences
      if (e.metaKey && e.key === ',') {
        e.preventDefault()
        setViewMode('settings')
        setCommandPaletteOpen(false)
        setQuickSwitchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setViewMode])

  const handleResume = useCallback(() => {
    if (!pendingSession) return

    const { setActiveWorkspace, setActiveProject } = useWorkspaceStore.getState()
    const termStore = useTerminalTabStore.getState()

    // Restore tabs
    for (const tab of pendingSession.tabs) {
      if (tab.isSplit) {
        termStore.createSplitTab(tab.workspaceId, tab.cwd, tab.label, tab.leftCommand, tab.rightCommand)
      } else {
        termStore.createTab(tab.workspaceId, tab.cwd, tab.label, tab.leftCommand ?? undefined)
      }
    }

    // Restore active workspace/project
    if (pendingSession.activeWorkspaceId) {
      setActiveWorkspace(pendingSession.activeWorkspaceId)
    }
    if (pendingSession.activeProjectId) {
      setActiveProject(pendingSession.activeProjectId)
    }

    window.kanbai.session.clear()
    setPendingSession(null)
  }, [pendingSession])

  const handleClear = useCallback(() => {
    window.kanbai.session.clear()
    setPendingSession(null)
  }, [])

  const handleDismiss = useCallback(() => {
    // Keep session on disk for next time, just close the modal
    setPendingSession(null)
  }, [])

  const handleTutorialDone = useCallback(() => {
    if (tutorialSection === null) return
    const updated = [...tutorialSeenSections, tutorialSection]
    setTutorialSeenSections(updated)
    setTutorialSection(null)
    window.kanbai.settings.set({ tutorialSeenSections: updated })
  }, [tutorialSection, tutorialSeenSections])

  const handleTutorialDismissAll = useCallback(() => {
    setTutorialSection(null)
    setTutorialCompleted(true)
    window.kanbai.settings.set({ tutorialCompleted: true })
  }, [])

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return
      const newWidth = Math.min(500, Math.max(180, startWidth + (moveEvent.clientX - startX)))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      resizingRef.current = false
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [sidebarWidth])

  return (
    <ErrorBoundary>
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <div className="sidebar-wrapper" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <ErrorBoundary>
            <Sidebar />
          </ErrorBoundary>
        </div>
        <div
          className={`sidebar-resize-handle${isResizing ? ' sidebar-resize-handle--active' : ''}`}
          onMouseDown={handleResizeStart}
        />
        <div className="main-content">
          <div className="view-switcher">
            {(() => {
              const ws = workspaces.find((w) => w.id === activeWorkspaceId)
              return ws ? (
                <span
                  className="workspace-badge"
                  style={ws.color ? { borderColor: ws.color, color: ws.color } : undefined}
                >
                  {ws.name}
                </span>
              ) : null
            })()}
            <button
              className={`view-btn${viewMode === 'kanban' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('kanban')}
            >
              {t('view.kanban')}
            </button>
            <button
              className={`view-btn${viewMode === 'terminal' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('terminal')}
            >
              {t('view.terminal')}
            </button>
            <button
              className={`view-btn${viewMode === 'database' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('database')}
            >
              {t('view.database')}
            </button>
            {availableMagicTabs.includes('packages') && (
              <button
                className={`view-btn${viewMode === 'packages' ? ' view-btn--active' : ''}`}
                onClick={() => setViewMode('packages')}
              >
                {t('view.packages')}
              </button>
            )}
            <button
              className={`view-btn${viewMode === 'analysis' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('analysis')}
            >
              {t('view.analysis')}
            </button>
            <button
              className={`view-btn${viewMode === 'todos' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('todos')}
            >
              {t('view.todos')}
            </button>
            <button
              className={`view-btn${viewMode === 'stats' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('stats')}
            >
              {t('view.stats')}
            </button>
            <button
              className={`view-btn${viewMode === 'prompts' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('prompts')}
            >
              {t('view.prompts')}
            </button>
            <button
              className={`view-btn${viewMode === 'claude' || viewMode === 'ai' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('ai')}
            >
              {t('view.ai')}
            </button>
            <button
              className={`view-btn${viewMode === 'api' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('api')}
            >
              {t('view.api')}
            </button>
            <button
              className={`view-btn${viewMode === 'healthcheck' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('healthcheck')}
            >
              {t('view.healthcheck')}
            </button>
            <button
              className={`view-btn${viewMode === 'git' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('git')}
            >
              {t('view.git')}
            </button>
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
            <button
              className={`view-btn${viewMode === 'search' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('search')}
              title={t('view.searchTooltip')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <div style={{ flex: 1 }} />
            <button
              className={`view-btn${viewMode === 'shortcuts' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('shortcuts')}
              title={t('view.shortcutsTooltip')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 7h1M7.5 7h1M11 7h1M5 10h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              className={`view-btn view-btn--settings${viewMode === 'settings' ? ' view-btn--active' : ''}`}
              onClick={() => setViewMode('settings')}
              title={t('view.settingsTooltip')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M13.5 8c0-.3-.2-.6-.4-.8l1-1.7-.9-.9-1.7 1c-.2-.2-.5-.4-.8-.4l-.5-1.8h-1.4l-.5 1.8c-.3 0-.6.2-.8.4l-1.7-1-.9.9 1 1.7c-.2.2-.4.5-.4.8l-1.8.5v1.4l1.8.5c0 .3.2.6.4.8l-1 1.7.9.9 1.7-1c.2.2.5.4.8.4l.5 1.8h1.4l.5-1.8c.3 0 .6-.2.8-.4l1.7 1 .9-.9-1-1.7c.2-.2.4-.5.4-.8l1.8-.5v-1.4l-1.8-.5z" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
          <div className="view-content">
            <div className="view-panel" style={{ display: viewMode === 'terminal' ? 'flex' : 'none' }}>
              <TerminalArea />
            </div>
            <div className="view-panel" style={{ display: viewMode === 'git' ? 'flex' : 'none' }}>
              <GitPanel />
            </div>
            <div className="view-panel" style={{ display: viewMode === 'kanban' ? 'flex' : 'none' }}>
              <KanbanBoard />
            </div>
            {viewMode === 'npm' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <NpmPanel />
              </div>
            )}
            {viewMode === 'packages' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <PackagesPanel />
              </div>
            )}
            {viewMode === 'file' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <FileViewer />
              </div>
            )}
            {viewMode === 'diff' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <FileDiffViewer />
              </div>
            )}
            {(viewMode === 'claude' || viewMode === 'ai') && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <ClaudeSettingsPanel />
              </div>
            )}
            {viewMode === 'settings' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <SettingsPanel />
              </div>
            )}
            {viewMode === 'search' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <GlobalSearch />
              </div>
            )}
            {viewMode === 'todos' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <TodoScanner />
              </div>
            )}
            {viewMode === 'shortcuts' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <ShortcutsPanel />
              </div>
            )}
            {viewMode === 'stats' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <ProjectStats />
              </div>
            )}
            {viewMode === 'prompts' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <PromptTemplates />
              </div>
            )}
            {viewMode === 'api' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <ApiTesterPanel />
              </div>
            )}
            {viewMode === 'healthcheck' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <HealthCheckPanel />
              </div>
            )}
            {viewMode === 'database' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <DatabaseExplorer />
              </div>
            )}
            {viewMode === 'analysis' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <CodeAnalysisPanel />
              </div>
            )}
          </div>
        </div>
      </div>
      {sessionChecked && pendingSession && (
        <SessionModal
          session={pendingSession}
          onResume={handleResume}
          onClear={handleClear}
          onDismiss={handleDismiss}
        />
      )}
      <CommandPalette
        open={commandPaletteOpen || quickSwitchOpen}
        onClose={() => { setCommandPaletteOpen(false); setQuickSwitchOpen(false) }}
      />
      <AppUpdateModal />
      <ToastContainer />
      {tutorialSection !== null && (
        <TutorialModal
          section={tutorialSection}
          onDone={handleTutorialDone}
          onDismissAll={handleTutorialDismissAll}
        />
      )}
    </div>
    </ErrorBoundary>
  )
}
