import { useState, useCallback, useRef, useEffect } from 'react'
import { useNotificationStore, type AppNotification } from '../lib/stores/notificationStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useTerminalTabStore } from '../features/terminal'
import { useI18n } from '../lib/i18n'

function formatRelativeTime(ts: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return t('time.yesterday')
  return t('time.daysAgo', { days })
}

const typeIcons: Record<string, string> = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
}

const typeColors: Record<string, string> = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
}

export function NotificationCenter() {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const notifications = useNotificationStore((s) => s.notifications)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearAll = useNotificationStore((s) => s.clearAll)

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) markAllRead()
      return !prev
    })
  }, [markAllRead])

  const handleClearAll = useCallback(() => {
    clearAll()
    setIsOpen(false)
  }, [clearAll])

  // Close panel on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const handleNotificationClick = useCallback((notif: AppNotification) => {
    if (!notif.workspaceId) return

    const wsStore = useWorkspaceStore.getState()

    // Switch namespace if the target workspace belongs to a different one
    const targetWorkspace = wsStore.workspaces.find((w) => w.id === notif.workspaceId)
    if (
      targetWorkspace?.namespaceId &&
      wsStore.activeNamespaceId !== targetWorkspace.namespaceId
    ) {
      wsStore.setActiveNamespace(targetWorkspace.namespaceId)
    }

    if (wsStore.activeWorkspaceId !== notif.workspaceId) {
      wsStore.setActiveWorkspace(notif.workspaceId)
    }

    if (notif.tabId) {
      const termStore = useTerminalTabStore.getState()
      const tab = termStore.tabs.find((t) => t.id === notif.tabId)
      if (tab) {
        termStore.setActiveTab(notif.tabId)
      }
    }

    setIsOpen(false)
  }, [])

  return (
    <div className="notification-center" ref={containerRef}>
      <button
        className="notification-bell"
        onClick={handleToggle}
        title={t('notifications.tooltip')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1C8 1 4 1 4 5V8L2 10V11H14V10L12 8V5C12 1 8 1 8 1Z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <path d="M6 11V12C6 13.1 6.9 14 8 14C9.1 14 10 13.1 10 12V11" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-panel" style={{ width: 340 }}>
          <div className="notification-panel-header">
            <h3>{t('notifications.title')}</h3>
            {notifications.length > 0 && (
              <button className="notif-clear-btn" onClick={handleClearAll}>
                {t('notifications.clearAll')}
              </button>
            )}
          </div>
          <div className="notification-panel-content">
            {notifications.length === 0 ? (
              <p className="notification-empty">{t('notifications.empty')}</p>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item${notif.workspaceId ? ' notif-item-clickable' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <span className="notif-item-icon" style={{ color: typeColors[notif.type] }}>
                    {typeIcons[notif.type]}
                  </span>
                  <div className="notif-item-content">
                    <span className="notif-item-title">{notif.title}</span>
                    <span className="notif-item-body">{notif.body}</span>
                  </div>
                  <span className="notif-item-time">
                    {formatRelativeTime(notif.createdAt, t)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
