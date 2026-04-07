import { useEffect, useState } from 'react'
import './external-window.css'
import { useWorkspaceStore } from '../workspace'
import { KanbanBoard, useKanbanStore, useBackgroundKanbanSync } from '../kanban'
import { TerminalArea } from '../terminal'
import { useI18n } from '../../lib/i18n'
import { ErrorBoundary, ToastContainer } from '../../shared/ui'
import type { AppSettings } from '../../../shared/types'

export function ExternalWindowApp() {
  const params = new URLSearchParams(window.location.search)
  const workspaceId = params.get('workspaceId')
  const [ready, setReady] = useState(false)
  const [activeView, setActiveView] = useState<'kanban' | 'terminal'>('kanban')
  const { setLocale } = useI18n()

  useBackgroundKanbanSync()

  // Initialize stores with the target workspace
  useEffect(() => {
    if (!workspaceId) return

    const init = async () => {
      // Load locale
      const settings: AppSettings = await window.kanbai.settings.get()
      if (settings.locale) {
        setLocale(settings.locale)
      }

      // Apply theme
      const theme = settings?.theme || 'dark'
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', theme)
      }

      // Init workspace store and set the target workspace as active
      const wsStore = useWorkspaceStore.getState()
      await wsStore.init()
      wsStore.setActiveWorkspace(workspaceId)

      // Load kanban tasks for this workspace
      const kanbanStore = useKanbanStore.getState()
      await kanbanStore.loadTasks(workspaceId)

      setReady(true)
    }

    init()
  }, [workspaceId, setLocale])

  if (!workspaceId) {
    return <div style={{ padding: 20, color: 'var(--text-primary)' }}>Missing workspaceId parameter</div>
  }

  if (!ready) {
    return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>
  }

  return (
    <ErrorBoundary>
      <div className="external-window-root">
        <div className="external-window-tabs">
          <button
            className={`external-window-tab${activeView === 'kanban' ? ' external-window-tab--active' : ''}`}
            onClick={() => setActiveView('kanban')}
          >
            Kanban
          </button>
          <button
            className={`external-window-tab${activeView === 'terminal' ? ' external-window-tab--active' : ''}`}
            onClick={() => setActiveView('terminal')}
          >
            Terminal
          </button>
        </div>
        <div className="external-window-content">
          <div style={{ display: activeView === 'kanban' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <KanbanBoard />
          </div>
          <div style={{ display: activeView === 'terminal' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <TerminalArea />
          </div>
        </div>
      </div>
      <ToastContainer />
    </ErrorBoundary>
  )
}
