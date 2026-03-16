import { useCallback } from 'react'
import { useNotificationStore, type AppNotification } from './notification-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useTerminalTabStore } from '../../lib/stores/terminalTabStore'

const typeColors: Record<string, string> = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
}

export function ToastContainer() {
  const toasts = useNotificationStore((s) => s.toasts)
  const dismissToast = useNotificationStore((s) => s.dismissToast)

  const handleToastClick = useCallback((toast: AppNotification) => {
    if (toast.workspaceId) {
      const wsStore = useWorkspaceStore.getState()

      const targetWorkspace = wsStore.workspaces.find((w) => w.id === toast.workspaceId)
      if (
        targetWorkspace?.namespaceId &&
        wsStore.activeNamespaceId !== targetWorkspace.namespaceId
      ) {
        wsStore.setActiveNamespace(targetWorkspace.namespaceId)
      }

      if (wsStore.activeWorkspaceId !== toast.workspaceId) {
        wsStore.setActiveWorkspace(toast.workspaceId)
      }

      if (toast.tabId) {
        const termStore = useTerminalTabStore.getState()
        const tab = termStore.tabs.find((t) => t.id === toast.tabId)
        if (tab) {
          termStore.setActiveTab(toast.tabId)
        }
      }
    }

    dismissToast(toast.id)
  }, [dismissToast])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast${toast.workspaceId ? ' toast-clickable' : ''}`}
          style={{ borderLeftColor: typeColors[toast.type] || 'var(--accent)' }}
          onClick={() => handleToastClick(toast)}
        >
          <div className="toast-content">
            <span className="toast-title">{toast.title}</span>
            <span className="toast-body">{toast.body}</span>
          </div>
          <button className="toast-close" onClick={(e) => { e.stopPropagation(); dismissToast(toast.id) }}>
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
