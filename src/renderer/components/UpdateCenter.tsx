import { useState, useEffect, useCallback, useRef } from 'react'
import { useUpdateStore } from '../lib/stores/updateStore'
import { useAppUpdateStore } from '../lib/stores/appUpdateStore'
import { useI18n } from '../lib/i18n'

export function UpdateCenter() {
  const { t, locale } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const {
    status: appUpdateStatus,
    version: appUpdateVersion,
    downloadPercent,
    checkForUpdate,
    downloadUpdate,
    installUpdate: installAppUpdate,
  } = useAppUpdateStore()
  const {
    updates,
    isChecking,
    lastChecked,
    installingTool,
    installStatus,
    checkUpdates,
    installUpdate,
    clearInstallStatus,
  } = useUpdateStore()

  const isAppUpdateVisible = ['available', 'downloading', 'downloaded'].includes(appUpdateStatus)
  const isAnyChecking = isChecking || appUpdateStatus === 'checking'
  const availableUpdates = updates.filter((u) => u.installed && u.updateAvailable)
  const missingTools = updates.filter((u) => !u.installed && u.canInstall)
  const badgeCount = availableUpdates.length + missingTools.length + (isAppUpdateVisible ? 1 : 0)

  useEffect(() => {
    void checkUpdates()
    void checkForUpdate()
    void window.kanbai.app.version().then((v) => setAppVersion(v.version)).catch(() => {
      // Silently ignore app version/read errors.
    })

    const interval = setInterval(() => {
      void window.kanbai.settings.get().then((settings) => {
        if (settings.toolAutoCheckEnabled !== false) {
          return Promise.all([checkUpdates(), checkForUpdate()])
        }
      }).catch(() => {
        // Silently ignore settings/read errors.
      })
    }, 3600000)

    return () => clearInterval(interval)
  }, [checkUpdates, checkForUpdate])

  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen])

  // Auto-dismiss install status after 5 seconds (success only — errors stay)
  useEffect(() => {
    if (!installStatus) return
    if (installStatus.success) {
      const timer = setTimeout(() => clearInstallStatus(), 5000)
      return () => clearTimeout(timer)
    }
    return
  }, [installStatus, clearInstallStatus])

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleInstall = useCallback(
    (tool: string, scope: 'global' | 'project' | 'unit') => {
      installUpdate(tool, scope)
    },
    [installUpdate],
  )

  const handleInstallAll = useCallback(() => {
    const run = async () => {
      for (const update of availableUpdates) {
        await installUpdate(update.tool, update.scope, update.projectId)
      }
    }
    void run()
  }, [availableUpdates, installUpdate])

  const handleCheckAll = useCallback(() => {
    void checkUpdates()
    void checkForUpdate()
  }, [checkUpdates, checkForUpdate])

  const openToolsSettings = useCallback(() => {
    window.sessionStorage.setItem('kanbai:settingsSection', 'tools')
    window.dispatchEvent(new CustomEvent('kanbai:open-settings-section', { detail: { section: 'tools' } }))
    setIsOpen(false)
  }, [])

  const formatTime = (ts: number | null) => {
    if (!ts) return t('time.never')
    const date = new Date(ts)
    return date.toLocaleTimeString(locale === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="notification-center" ref={containerRef}>
      <button
        className={`update-trigger${badgeCount > 0 ? ' update-trigger--has-updates' : ''}`}
        onClick={handleToggle}
        title={t('updates.updateCenterTooltip')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 5.5L8 3L13 5.5V10.5L8 13L3 10.5V5.5Z" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M3 5.5L8 8L13 5.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 8V13" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        {badgeCount > 0 && <span className="update-trigger-count">{badgeCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>{t('updates.title')}</h3>
            <div className="notification-panel-actions">
              <button
                className="notification-refresh"
                onClick={handleCheckAll}
                disabled={isAnyChecking}
                title={t('updates.checkTooltip')}
              >
                {isAnyChecking ? (
                  <span className="notification-spinner">{'\u21BB'}</span>
                ) : '\u21BB'}
              </button>
              {availableUpdates.length > 1 && (
                <button className="notification-update-all" onClick={handleInstallAll}>
                  {t('updates.updateAll')}
                </button>
              )}
            </div>
          </div>

          {installStatus && (
            <div
              className={`notification-status ${installStatus.success ? 'notification-status--success' : 'notification-status--error'}`}
            >
              {installStatus.success ? (
                <span onClick={clearInstallStatus} className="notification-status-text">
                  {'\u2713'} {t('updates.updated', { tool: installStatus.tool })}
                </span>
              ) : (
                <div className="notification-status-error">
                  <span className="notification-status-text notification-status-text--selectable">
                    {'\u2717'} {t('updates.failedUpdate', { tool: installStatus.tool, error: installStatus.error || '' })}
                  </span>
                  <div className="notification-status-error-actions">
                    <button
                      className="notification-status-copy"
                      title={t('updates.copyError')}
                      onClick={() => {
                        void navigator.clipboard.writeText(installStatus.error || '').then(() => {
                          setCopied(true)
                          if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
                          copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
                        })
                      }}
                    >
                      {copied ? '\u2713' : '\u2398'}
                    </button>
                    <button
                      className="notification-status-dismiss"
                      title={t('updates.dismiss')}
                      onClick={clearInstallStatus}
                    >
                      {'\u2715'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="notification-panel-content">
            {isAnyChecking && (
              <div className="notification-checking">{t('updates.checkingNow')}</div>
            )}
            {availableUpdates.length === 0 && missingTools.length === 0 && !isAppUpdateVisible && !isAnyChecking ? (
              <div className="notification-empty">
                <p>{t('updates.allUpToDate')}</p>
                <button className="notification-item-btn notification-item-btn--install" onClick={openToolsSettings}>
                  {t('updates.openToolsSettings')}
                </button>
              </div>
            ) : (
              <>
                {isAppUpdateVisible && (
                  <div className="notification-item notification-item--update">
                    <div className="notification-item-info">
                      <span className="notification-item-name">Kanbai</span>
                      <span className="notification-item-version">
                        {appVersion || '?'}
                        <> {' \u2192 '} <span className="notification-item-latest">{appUpdateVersion || '?'}</span> </>
                      </span>
                      <span className="notification-item-scope">{t('appUpdate.appScope')}</span>
                    </div>
                    <div className="notification-item-actions">
                      {appUpdateStatus === 'available' && (
                        <button className="notification-item-btn" onClick={() => void downloadUpdate()}>
                          {t('appUpdate.download')}
                        </button>
                      )}
                      {appUpdateStatus === 'downloading' && (
                        <button className="notification-item-btn" disabled>
                          {downloadPercent}%
                        </button>
                      )}
                      {appUpdateStatus === 'downloaded' && (
                        <button className="notification-item-btn" onClick={installAppUpdate}>
                          {t('appUpdate.installAndRestart')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {missingTools.length > 0 && (
                  <div className="notification-section-label">{t('updates.missingToolsLabel')}</div>
                )}
                {missingTools.map((tool) => (
                  <div
                    key={`${tool.tool}-${tool.scope}`}
                    className="notification-item notification-item--missing"
                  >
                    <div className="notification-item-info">
                      <span className="notification-item-name">{tool.tool}</span>
                      <span className="notification-item-version notification-item-version--missing">
                        {t('updates.notInstalled')}
                      </span>
                    </div>
                    <div className="notification-item-actions">
                      <button
                        className="notification-item-btn notification-item-btn--install"
                        onClick={() => handleInstall(tool.tool, tool.scope)}
                        disabled={installingTool === tool.tool}
                      >
                        {installingTool === tool.tool ? (
                          <span className="notification-spinner">{'\u21BB'}</span>
                        ) : t('updates.install')}
                      </button>
                    </div>
                  </div>
                ))}
                {availableUpdates.length > 0 && (
                  <div className="notification-section-label">{t('updates.availableUpdatesLabel')}</div>
                )}
                {availableUpdates.map((update) => (
                  <div
                    key={`${update.tool}-${update.scope}`}
                    className="notification-item notification-item--update"
                  >
                    <div className="notification-item-info">
                      <span className="notification-item-name">{update.tool}</span>
                      <span className="notification-item-version">
                        {update.currentVersion}
                        <> {' \u2192 '} <span className="notification-item-latest">{update.latestVersion.split('+')[0]}</span> </>
                      </span>
                      <span className="notification-item-scope">{update.scope}</span>
                    </div>
                    <div className="notification-item-actions">
                      <button className="notification-item-btn" onClick={() => handleInstall(update.tool, update.scope)} disabled={installingTool === update.tool}>
                        {installingTool === update.tool ? (
                          <span className="notification-spinner">{'\u21BB'}</span>
                        ) : t('updates.update')}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="notification-panel-footer">
            <span className="notification-last-check">
              {t('updates.lastCheck', { time: formatTime(lastChecked) })}
            </span>
            {badgeCount > 0 && (
              <button className="notification-footer-settings" onClick={openToolsSettings}>
                {t('updates.openToolsSettings')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
