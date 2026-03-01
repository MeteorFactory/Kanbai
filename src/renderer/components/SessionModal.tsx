import type { SessionData } from '../../shared/types'
import { useI18n } from '../lib/i18n'

interface SessionModalProps {
  session: SessionData
  onResume: () => void
  onClear: () => void
  onDismiss: () => void
}

export function SessionModal({ session, onResume, onClear, onDismiss }: SessionModalProps) {
  const { t } = useI18n()
  const savedDate = new Date(session.savedAt)
  const timeAgo = formatTimeAgo(savedDate, t)
  const tabCount = session.tabs.length

  return (
    <div className="session-modal-overlay" onClick={onDismiss}>
      <div className="session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="session-modal-header">
          <h3>{t('session.previousSession')}</h3>
          <button className="session-modal-close" onClick={onDismiss}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="session-modal-body">
          <p className="session-modal-info">
            {t('session.savedAgo', { timeAgo })}
          </p>
          <div className="session-modal-details">
            <div className="session-modal-detail">
              <span className="session-modal-detail-label">{t('session.tabs')}</span>
              <span className="session-modal-detail-value">{tabCount}</span>
            </div>
            {session.tabs.map((tab, i) => (
              <div key={i} className="session-modal-tab-info">
                <span className="session-modal-tab-icon">
                  {tab.isSplit ? '\u25A3' : '\u25A1'}
                </span>
                <span className="session-modal-tab-label">{tab.label}</span>
                <span className="session-modal-tab-path">
                  {tab.cwd.split(/[\\/]/).pop()}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="session-modal-actions">
          <button className="session-modal-btn session-modal-btn--resume" onClick={onResume}>
            {t('session.resume')}
          </button>
          <button className="session-modal-btn session-modal-btn--clear" onClick={onClear}>
            {t('session.clear')}
          </button>
          <button className="session-modal-btn session-modal-btn--dismiss" onClick={onDismiss}>
            {t('session.later')}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(date: Date, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { minutes })
  if (hours < 24) return t('time.hoursAgo', { hours })
  if (days === 1) return t('time.yesterday')
  return t('time.daysAgo', { days })
}
