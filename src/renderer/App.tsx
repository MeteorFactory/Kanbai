import { useState, useEffect, useCallback, useRef } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/Sidebar'
import { TerminalArea } from './components/TerminalArea'
import { TitleBar } from './components/TitleBar'
import { KanbanBoard } from './features/kanban'
import { GitPanel } from './components/GitPanel'
import { FileViewer } from './components/FileViewer'
import { NpmPanel } from './components/NpmPanel'
import { PackagesPanel } from './components/PackagesPanel'
import { FileDiffViewer } from './components/FileDiffViewer'
import { ClaudeSettingsPanel } from './components/claude-settings'
import { SettingsPanel } from './components/SettingsPanel'
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
import { DevOpsPanel } from './components/DevOpsPanel'
import { NotesPanel } from './components/NotesPanel'
import { TutorialModal } from './components/TutorialModal'
import { ToastContainer } from './components/ToastContainer'
import { useWorkspaceStore } from './lib/stores/workspaceStore'
import { useTerminalTabStore } from './lib/stores/terminalTabStore'
import { useViewStore } from './lib/stores/viewStore'
import { useAppUpdateStore } from './lib/stores/appUpdateStore'
import { useClaudeStore } from './lib/stores/claudeStore'
import { useKanbanStore } from './features/kanban'
import { useI18n } from './lib/i18n'
import { useBackgroundKanbanSync } from './features/kanban'
import { AI_PROVIDERS, type AiProviderId } from '../shared/types/ai-provider'
import type { AppSettings, SessionData, SessionTab } from '../shared/types'

const TUTORIAL_VIEWS = new Set([
  'kanban', 'terminal', 'git', 'database', 'packages',
  'analysis', 'todos', 'stats', 'prompts', 'api', 'healthcheck',
  'settings', 'search', 'shortcuts', 'claude', 'ai', 'devops', 'notes',
])

export function App() {
  const { viewMode, setViewMode, availableMagicTabs, setAvailableMagicTabs } = useViewStore()
  const { activeProjectId, projects } = useWorkspaceStore()
  const { setLocale } = useI18n()
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

  // On startup: clear any saved session and create a default "AI + Terminal" tab
  useEffect(() => {
    window.kanbai.session.clear()

    const { activeWorkspaceId, workspaces, projects } = useWorkspaceStore.getState()
    if (!activeWorkspaceId) return

    const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!workspace) return

    window.kanbai.settings.get().then(async (s: AppSettings) => {
      const providerId = (s.defaultAiProvider || 'claude') as AiProviderId
      const provider = AI_PROVIDERS[providerId]
      const label = `${provider.displayName} + Terminal`

      const envPath = await window.kanbai.workspaceEnv.getPath(workspace.name)
      const cwd = envPath || projects.find((p) => p.workspaceId === activeWorkspaceId)?.path || ''
      if (!cwd) return

      const termStore = useTerminalTabStore.getState()
      termStore.createSplitTab(activeWorkspaceId, cwd, label, provider.cliCommand, null)
    })
  }, [])

  // Load tutorial state, saved locale, and show welcome on first launch
  useEffect(() => {
    window.kanbai.settings.get().then((s: AppSettings) => {
      if (s.locale) {
        setLocale(s.locale)
      }
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

      // Skip pixel-agents tabs — they cannot be properly restored (componentType is lost)
      const isPixelAgentsPane = (node: { type: string; componentType?: string; children?: unknown[] }): boolean => {
        if (node.type === 'leaf') return node.componentType === 'pixel-agents'
        if (node.type === 'split' && Array.isArray(node.children)) {
          return node.children.some((c) => isPixelAgentsPane(c as typeof node))
        }
        return false
      }

      // Skip tabs linked to closed tickets (DONE) — no need to restore them
      const { kanbanTabIds, tasks: kanbanTasks } = useKanbanStore.getState()
      const closedTicketTabIds = new Set<string>()
      for (const [taskId, tabId] of Object.entries(kanbanTabIds)) {
        const task = kanbanTasks.find((t) => t.id === taskId)
        if (task && task.status === 'DONE') {
          closedTicketTabIds.add(tabId)
        }
      }

      const sessionTabs: SessionTab[] = tabs.filter((tab) => !isPixelAgentsPane(tab.paneTree) && !closedTicketTabIds.has(tab.id)).map((tab) => ({
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

  // Open settings (optionally on a specific section) from global UI events.
  useEffect(() => {
    const openSettings = (event: Event) => {
      const custom = event as CustomEvent<{ section?: string }>
      if (custom.detail?.section) {
        window.sessionStorage.setItem('kanbai:settingsSection', custom.detail.section)
      }
      setViewMode('settings')
    }
    window.addEventListener('kanbai:open-settings-section', openSettings as EventListener)
    return () => window.removeEventListener('kanbai:open-settings-section', openSettings as EventListener)
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
      <div className="sidebar-wrapper" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>
      </div>
      <div
        className={`sidebar-resize-handle${isResizing ? ' sidebar-resize-handle--active' : ''}`}
        onMouseDown={handleResizeStart}
      />
      <div className="app-right">
        <TitleBar availableMagicTabs={availableMagicTabs} />
        <div className="main-content">
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
            {viewMode === 'devops' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <DevOpsPanel />
              </div>
            )}
            {viewMode === 'notes' && (
              <div className="view-panel" style={{ display: 'flex' }}>
                <NotesPanel />
              </div>
            )}
          </div>
        </div>
      </div>
      <CommandPalette
        open={commandPaletteOpen || quickSwitchOpen}
        onClose={() => { setCommandPaletteOpen(false); setQuickSwitchOpen(false) }}
      />
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
