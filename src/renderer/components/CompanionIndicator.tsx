import { useState, useCallback, useRef, useEffect } from 'react'
import { useCompanionStore, initCompanionListener, initCompanionTicketListener } from '../lib/stores/companionStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useKanbanStore } from '../features/kanban'
import { useI18n } from '../lib/i18n'

const STATUS_COLORS: Record<string, string> = {
  disconnected: 'var(--text-muted)',
  waiting: 'var(--warning)',
  connected: 'var(--success)',
  lost: 'var(--danger)',
  maintenance: 'var(--warning)',
}

export function CompanionIndicator() {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { status, pairingCode, companionName, register, cancel, disconnect } = useCompanionStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const applyCompanionUpdate = useKanbanStore((s) => s.applyCompanionUpdate)

  useEffect(() => {
    const cleanup = initCompanionListener()
    return cleanup
  }, [])

  // Listen for ticket updates from the companion app
  useEffect(() => {
    const cleanup = initCompanionTicketListener((task) => {
      applyCompanionUpdate(task)
    })
    return cleanup
  }, [applyCompanionUpdate])

  // Close on click outside
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

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleRegister = useCallback(async () => {
    if (!activeWorkspaceId) return
    try {
      await register(activeWorkspaceId)
    } catch (err) {
      console.error('Failed to register companion:', err)
    }
  }, [activeWorkspaceId, register])

  const handleCancel = useCallback(async () => {
    try {
      await cancel()
    } catch (err) {
      console.error('Failed to cancel companion:', err)
    }
  }, [cancel])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect()
    } catch (err) {
      console.error('Failed to disconnect companion:', err)
    }
  }, [disconnect])

  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.disconnected

  return (
    <div className="companion-indicator" ref={containerRef}>
      <button
        className="companion-btn"
        onClick={handleToggle}
        title={t('companion.tooltip')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="4" y="1" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span className="companion-dot" style={{ backgroundColor: dotColor }} />
      </button>

      {isOpen && (
        <div className="companion-panel">
          <div className="companion-panel-header">
            <h3>{t('companion.title')}</h3>
            <span className="companion-status-label">{t(`companion.status.${status}`)}</span>
          </div>
          <div className="companion-panel-content">
            {status === 'disconnected' && (
              <button className="companion-action-btn" onClick={handleRegister} disabled={!activeWorkspaceId}>
                {t('companion.activate')}
              </button>
            )}
            {status === 'waiting' && pairingCode && (
              <>
                <div className="companion-code">
                  <span className="companion-code-label">{t('companion.codeLabel')}</span>
                  <span className="companion-code-value">{pairingCode}</span>
                </div>
                <button className="companion-action-btn companion-action-btn--cancel" onClick={handleCancel}>
                  {t('companion.cancel')}
                </button>
              </>
            )}
            {status === 'connected' && (
              <>
                <p className="companion-info">
                  {companionName
                    ? t('companion.connectedAs', { name: companionName })
                    : t('companion.connectedInfo')}
                </p>
                <button className="companion-action-btn companion-action-btn--cancel" onClick={handleDisconnect}>
                  {t('companion.disconnect')}
                </button>
              </>
            )}
            {status === 'lost' && (
              <>
                <p className="companion-info companion-info--warning">{t('companion.lostInfo')}</p>
                <button className="companion-action-btn" onClick={handleRegister} disabled={!activeWorkspaceId}>
                  {t('companion.reconnect')}
                </button>
              </>
            )}
            {status === 'maintenance' && (
              <>
                <p className="companion-info companion-info--maintenance">{t('companion.maintenanceInfo')}</p>
                <button className="companion-action-btn" onClick={handleRegister} disabled={!activeWorkspaceId}>
                  {t('companion.retry')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
