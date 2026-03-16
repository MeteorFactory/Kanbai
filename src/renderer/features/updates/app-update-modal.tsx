import { useCallback, useEffect, useState, useRef } from 'react'
import { useAppUpdateStore } from './app-update-store'
import { useI18n } from '../../lib/i18n'

export function AppUpdateModal() {
  const { status, version, downloadPercent, showModal, errorMessage, dismissModal, downloadUpdate, installUpdate, checkForUpdate } =
    useAppUpdateStore()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissModal()
    },
    [dismissModal],
  )

  useEffect(() => {
    if (showModal) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showModal, handleKeyDown])

  if (!showModal) return null

  return (
    <div className="app-update-modal-backdrop" onClick={dismissModal}>
      <div className="app-update-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('appUpdate.title')}</h3>

        {status === 'available' && (
          <>
            <p className="app-update-modal-version">
              {t('appUpdate.newVersion', { version: version ?? '' })}
            </p>
            <div className="app-update-modal-actions">
              <button className="app-update-btn app-update-btn--secondary" onClick={dismissModal}>
                {t('appUpdate.later')}
              </button>
              <button className="app-update-btn app-update-btn--primary" onClick={downloadUpdate}>
                {t('appUpdate.download')}
              </button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <>
            <p className="app-update-modal-version">{t('appUpdate.downloading')}</p>
            <div className="app-update-progress-bar">
              <div
                className="app-update-progress-fill"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
            <span className="app-update-modal-percent">{downloadPercent}%</span>
          </>
        )}

        {status === 'downloaded' && (
          <>
            <p className="app-update-modal-version">{t('appUpdate.ready')}</p>
            <div className="app-update-modal-actions">
              <button className="app-update-btn app-update-btn--secondary" onClick={dismissModal}>
                {t('appUpdate.later')}
              </button>
              <button className="app-update-btn app-update-btn--primary" onClick={installUpdate}>
                {t('appUpdate.installAndRestart')}
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="app-update-modal-version">{t('appUpdate.error')}</p>
            {errorMessage && (
              <div className="app-update-modal-error-detail">
                <span>{t('appUpdate.errorDetail', { message: errorMessage })}</span>
                <button
                  className="notification-status-copy"
                  title={t('updates.copyError')}
                  onClick={() => {
                    navigator.clipboard.writeText(errorMessage)
                    setCopied(true)
                    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
                    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? '\u2713' : '\u2398'}
                </button>
              </div>
            )}
            <div className="app-update-modal-actions">
              <button className="app-update-btn app-update-btn--secondary" onClick={dismissModal}>
                {t('common.close')}
              </button>
              <button className="app-update-btn app-update-btn--primary" onClick={checkForUpdate}>
                {t('appUpdate.retry')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
