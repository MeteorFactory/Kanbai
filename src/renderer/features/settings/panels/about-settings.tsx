import { useState, useRef } from 'react'
import { useI18n } from '../../../lib/i18n'
import { useAppUpdateStore } from '../../updates/app-update-store'

interface AboutSettingsProps {
  appVersion: { version: string; name: string; isElevated?: boolean } | null
}

export function AboutSettings({ appVersion }: AboutSettingsProps) {
  const { t } = useI18n()
  const {
    status: appUpdateStatus,
    version: appUpdateVersion,
    downloadPercent,
    errorMessage: appUpdateError,
    checkForUpdate,
    downloadUpdate,
    installUpdate: installAppUpdate,
  } = useAppUpdateStore()

  const [toolErrorCopied, setToolErrorCopied] = useState(false)
  const toolErrorCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div className="settings-section">
      <div className="settings-card settings-card--about">
        <div className="settings-about-header">
          <span className="settings-about-icon">M</span>
          <div>
            <div className="settings-about-name">{appVersion?.name ?? 'Kanbai'}</div>
            <div className="settings-about-version">v{appVersion?.version ?? '\u2014'}</div>
          </div>
        </div>
        {appVersion?.isElevated && (
          <div className="settings-elevated-badge">
            <span className="settings-elevated-icon">{'\u26A0'}</span>
            <span>{t('settings.elevatedMode')}</span>
          </div>
        )}
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.developer')}</label>
          </div>
          <span className="settings-value">Antony KERVAZO CANUT</span>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('appUpdate.checkNow')}</label>
            <span className="settings-hint">
              {appUpdateStatus === 'available' && appUpdateVersion
                ? t('appUpdate.newVersion', { version: appUpdateVersion })
                : appUpdateStatus === 'downloading'
                  ? t('appUpdate.downloading')
                  : appUpdateStatus === 'downloaded'
                    ? t('appUpdate.ready')
                    : appUpdateStatus === 'error'
                      ? t('appUpdate.error')
                      : t('appUpdate.checkHint')}
            </span>
          </div>
          {appUpdateStatus === 'available' && (
            <button className="settings-btn" onClick={downloadUpdate}>
              {t('appUpdate.download')}
            </button>
          )}
          {appUpdateStatus === 'downloading' && (
            <button className="settings-btn" disabled>
              {downloadPercent}%
            </button>
          )}
          {appUpdateStatus === 'downloaded' && (
            <button className="settings-btn" onClick={installAppUpdate}>
              {t('appUpdate.installAndRestart')}
            </button>
          )}
          {(appUpdateStatus === 'idle' || appUpdateStatus === 'not-available' || appUpdateStatus === 'checking') && (
            <button
              className="settings-btn"
              onClick={checkForUpdate}
              disabled={appUpdateStatus === 'checking'}
            >
              {appUpdateStatus === 'checking' ? t('common.loading') : t('appUpdate.checkNow')}
            </button>
          )}
          {appUpdateStatus === 'error' && (
            <button className="settings-btn" onClick={checkForUpdate}>
              {t('appUpdate.retry')}
            </button>
          )}
        </div>
        {appUpdateStatus === 'error' && appUpdateError && (
          <div className="notification-status notification-status--error" style={{ marginTop: 8 }}>
            <div className="notification-status-error">
              <span className="notification-status-text">
                {t('appUpdate.errorDetail', { message: appUpdateError })}
              </span>
              <button
                className="notification-status-copy"
                title={t('updates.copyError')}
                onClick={() => {
                  navigator.clipboard.writeText(appUpdateError)
                  setToolErrorCopied(true)
                  if (toolErrorCopiedTimerRef.current) clearTimeout(toolErrorCopiedTimerRef.current)
                  toolErrorCopiedTimerRef.current = setTimeout(() => setToolErrorCopied(false), 2000)
                }}
              >
                {toolErrorCopied ? '\u2713' : '\u2398'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
