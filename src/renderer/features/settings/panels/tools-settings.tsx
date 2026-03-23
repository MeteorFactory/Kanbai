import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppSettings, ClaudePlugin } from '../../../../shared/types'
import { useI18n } from '../../../lib/i18n'
import { useAppUpdateStore } from '../../updates/app-update-store'
import { useUpdateStore } from '../../updates/update-store'

interface ToolsSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  appVersion: { version: string; name: string; isElevated?: boolean } | null
}

export function ToolsSettings({ settings, updateSetting, appVersion }: ToolsSettingsProps) {
  const { t, localeCode } = useI18n()
  const {
    status: appUpdateStatus,
    version: appUpdateVersion,
    downloadPercent,
    checkForUpdate,
    downloadUpdate,
    installUpdate: installAppUpdate,
  } = useAppUpdateStore()
  const {
    updates: toolUpdates,
    isChecking: toolsChecking,
    lastChecked: toolsLastChecked,
    installingTool,
    installStatus,
    checkUpdates: checkToolUpdates,
    installUpdate: installToolUpdate,
    uninstallUpdate: uninstallToolUpdate,
    clearInstallStatus: clearToolInstallStatus,
  } = useUpdateStore()

  const [toolErrorCopied, setToolErrorCopied] = useState(false)
  const toolErrorCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Claude Plugins state
  const [plugins, setPlugins] = useState<ClaudePlugin[]>([])
  const [pluginsLoading, setPluginsLoading] = useState(false)
  const [pluginsExpanded, setPluginsExpanded] = useState(false)
  const [pluginAction, setPluginAction] = useState<string | null>(null)
  const [pluginStatus, setPluginStatus] = useState<{ plugin: string; success: boolean; error?: string } | null>(null)

  const isClaudeInstalled = toolUpdates.some((u) => u.tool === 'claude' && u.installed)

  const loadPlugins = useCallback(async () => {
    setPluginsLoading(true)
    try {
      const result = await window.kanbai.claudePlugins.list()
      setPlugins(result)
    } catch {
      setPlugins([])
    } finally {
      setPluginsLoading(false)
    }
  }, [])

  const [pluginsInitLoaded, setPluginsInitLoaded] = useState(false)
  useEffect(() => {
    if (!pluginsExpanded || pluginsInitLoaded) return
    setPluginsInitLoaded(true)
    loadPlugins()
  }, [pluginsExpanded, pluginsInitLoaded, loadPlugins])

  useEffect(() => {
    if (!pluginStatus?.success) return
    const timer = setTimeout(() => setPluginStatus(null), 5000)
    return () => clearTimeout(timer)
  }, [pluginStatus])

  const handlePluginInstall = async (pluginName: string) => {
    setPluginAction(pluginName)
    setPluginStatus(null)
    try {
      const result = await window.kanbai.claudePlugins.install(pluginName)
      if (result.success) {
        setPluginStatus({ plugin: pluginName, success: true })
        await loadPlugins()
      } else {
        setPluginStatus({ plugin: pluginName, success: false, error: result.error })
      }
    } catch (err: unknown) {
      setPluginStatus({ plugin: pluginName, success: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setPluginAction(null)
    }
  }

  const handlePluginUninstall = async (pluginName: string) => {
    setPluginAction(pluginName)
    setPluginStatus(null)
    try {
      const result = await window.kanbai.claudePlugins.uninstall(pluginName)
      if (result.success) {
        setPluginStatus({ plugin: pluginName, success: true })
        await loadPlugins()
      } else {
        setPluginStatus({ plugin: pluginName, success: false, error: result.error })
      }
    } catch (err: unknown) {
      setPluginStatus({ plugin: pluginName, success: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setPluginAction(null)
    }
  }

  useEffect(() => {
    if (toolUpdates.length > 0) return
    checkToolUpdates()
  }, [toolUpdates.length, checkToolUpdates])

  useEffect(() => {
    if (!installStatus?.success) return
    const timer = setTimeout(() => clearToolInstallStatus(), 5000)
    return () => clearTimeout(timer)
  }, [installStatus, clearToolInstallStatus])

  const handleToolInstall = (tool: string, scope: 'global' | 'project' | 'unit'): void => {
    installToolUpdate(tool, scope)
  }

  const handleToolUninstall = (tool: string): void => {
    uninstallToolUpdate(tool)
  }

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.toolsAutoCheck')}</label>
            <span className="settings-hint">{t('settings.toolsAutoCheckHint')}</span>
          </div>
          <button
            className={`settings-toggle${settings.toolAutoCheckEnabled ? ' settings-toggle--active' : ''}`}
            onClick={() => updateSetting('toolAutoCheckEnabled', !settings.toolAutoCheckEnabled)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('updates.lastCheck', { time: toolsLastChecked ? new Date(toolsLastChecked).toLocaleTimeString(localeCode, { hour: '2-digit', minute: '2-digit' }) : t('time.never') })}</label>
            <span className="settings-hint">{t('settings.toolsManageHint')}</span>
          </div>
          <button
            className="settings-btn"
            onClick={checkToolUpdates}
            disabled={toolsChecking}
          >
            {toolsChecking ? t('common.loading') : t('updates.checkTooltip')}
          </button>
        </div>
      </div>

      {installStatus && (
        <div
          className={`notification-status ${installStatus.success ? 'notification-status--success' : 'notification-status--error'}`}
        >
          {installStatus.success ? (
            <span onClick={clearToolInstallStatus} className="notification-status-text">
              {'\u2713'} {t('updates.updated', { tool: installStatus.tool })}
            </span>
          ) : (
            <div className="notification-status-error">
              <span className="notification-status-text" onClick={clearToolInstallStatus}>
                {'\u2717'} {t('updates.failedUpdate', { tool: installStatus.tool, error: installStatus.error || '' })}
              </span>
              <button
                className="notification-status-copy"
                title={t('updates.copyError')}
                onClick={() => {
                  navigator.clipboard.writeText(installStatus.error || '')
                  setToolErrorCopied(true)
                  if (toolErrorCopiedTimerRef.current) clearTimeout(toolErrorCopiedTimerRef.current)
                  toolErrorCopiedTimerRef.current = setTimeout(() => setToolErrorCopied(false), 2000)
                }}
              >
                {toolErrorCopied ? '\u2713' : '\u2398'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Kanbai app entry */}
      <div className="settings-card">
        <div
          className={`notification-item${appUpdateStatus === 'available' ? ' notification-item--update' : ''}`}
        >
          <div className="notification-item-info">
            <span className="notification-item-name">Kanbai</span>
            <span className="notification-item-version">
              {appVersion?.version ?? '\u2014'}
              {appUpdateStatus === 'available' && appUpdateVersion && (
                <> {' \u2192 '} <span className="notification-item-latest">{appUpdateVersion}</span> </>
              )}
            </span>
            <span className="notification-item-scope">{t('appUpdate.appScope')}</span>
          </div>
          <div className="notification-item-actions">
            {appUpdateStatus === 'available' && (
              <button className="notification-item-btn" onClick={downloadUpdate}>
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
            {(appUpdateStatus === 'idle' || appUpdateStatus === 'not-available' || appUpdateStatus === 'checking') && (
              <button
                className="notification-item-btn"
                onClick={checkForUpdate}
                disabled={appUpdateStatus === 'checking'}
              >
                {appUpdateStatus === 'checking' ? t('appUpdate.checking') : t('appUpdate.checkNow')}
              </button>
            )}
            {appUpdateStatus === 'error' && (
              <button className="notification-item-btn" onClick={checkForUpdate}>
                {t('appUpdate.retry')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="settings-card">
        {toolUpdates.length === 0 && !toolsChecking ? (
          <p className="notification-empty">{t('updates.noInfo')}</p>
        ) : (
          <div className="notification-panel-content">
            {[...toolUpdates]
              .sort((a, b) => Number(b.updateAvailable) - Number(a.updateAvailable) || Number(a.installed) - Number(b.installed) || a.tool.localeCompare(b.tool))
              .map((update) => (
                <div
                  key={`${update.tool}-${update.scope}`}
                  className={`notification-item${update.updateAvailable ? ' notification-item--update' : ''}${!update.installed ? ' notification-item--missing' : ''}`}
                >
                  <div className="notification-item-info">
                    <span className="notification-item-name">{update.tool}</span>
                    {update.installed ? (
                      <span className="notification-item-version">
                        {update.currentVersion}
                        {update.updateAvailable && (
                          <> {' \u2192 '} <span className="notification-item-latest">{update.latestVersion.split('+')[0]}</span> </>
                        )}
                      </span>
                    ) : (
                      <span className="notification-item-version notification-item-version--missing">
                        {t('updates.notInstalled')}
                      </span>
                    )}
                    <span className="notification-item-scope">{update.scope}</span>
                  </div>
                  <div className="notification-item-actions">
                    {update.installed && update.updateAvailable && (
                      <button
                        className="notification-item-btn"
                        onClick={() => handleToolInstall(update.tool, update.scope)}
                        disabled={installingTool === update.tool}
                      >
                        {installingTool === update.tool ? (
                          <span className="notification-spinner">{'\u21BB'}</span>
                        ) : t('updates.update')}
                      </button>
                    )}
                    {!update.installed && update.canInstall && (
                      <button
                        className="notification-item-btn notification-item-btn--install"
                        onClick={() => handleToolInstall(update.tool, update.scope)}
                        disabled={installingTool === update.tool}
                      >
                        {installingTool === update.tool ? (
                          <span className="notification-spinner">{'\u21BB'}</span>
                        ) : t('updates.install')}
                      </button>
                    )}
                    {update.installed && update.canUninstall && (
                      <button
                        className="notification-item-btn notification-item-btn--uninstall"
                        onClick={() => handleToolUninstall(update.tool)}
                        disabled={installingTool === update.tool}
                      >
                        {installingTool === update.tool ? (
                          <span className="notification-spinner">{'\u21BB'}</span>
                        ) : t('updates.uninstall')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Claude Plugins sub-section */}
      <div className="settings-card">
        <div
          className="settings-row settings-row--clickable"
          onClick={() => setPluginsExpanded(!pluginsExpanded)}
        >
          <div className="settings-row-info">
            <label className="settings-label">{t('plugins.title')}</label>
            <span className="settings-hint">{t('plugins.description')}</span>
          </div>
          <span className={`settings-chevron${pluginsExpanded ? ' settings-chevron--open' : ''}`}>
            {'\u25B6'}
          </span>
        </div>

        {pluginsExpanded && (
          <div className="plugins-section">
            {!isClaudeInstalled && toolUpdates.length > 0 ? (
              <p className="notification-empty">{t('plugins.claudeRequired')}</p>
            ) : (
              <>
                <div className="plugins-section-header">
                  <button
                    className="settings-btn"
                    onClick={loadPlugins}
                    disabled={pluginsLoading}
                  >
                    {pluginsLoading ? t('plugins.loading') : t('plugins.refresh')}
                  </button>
                </div>

                {pluginStatus && (
                  <div
                    className={`notification-status ${pluginStatus.success ? 'notification-status--success' : 'notification-status--error'}`}
                  >
                    <span className="notification-status-text" onClick={() => setPluginStatus(null)}>
                      {pluginStatus.success
                        ? `\u2713 ${t('plugins.installSuccess', { plugin: pluginStatus.plugin })}`
                        : `\u2717 ${t('plugins.installError', { plugin: pluginStatus.plugin, error: pluginStatus.error || '' })}`
                      }
                    </span>
                  </div>
                )}

                {plugins.length === 0 && !pluginsLoading ? (
                  <p className="notification-empty">{t('plugins.empty')}</p>
                ) : (
                  <div className="notification-panel-content">
                    {plugins.map((plugin) => (
                      <div
                        key={`${plugin.name}-${plugin.marketplace}`}
                        className={`notification-item${plugin.installed ? '' : ' notification-item--missing'}`}
                      >
                        <div className="notification-item-info">
                          <span className="notification-item-name">{plugin.name}</span>
                          {plugin.installed ? (
                            <span className="notification-item-version">
                              {plugin.version ?? t('plugins.installed')}
                            </span>
                          ) : (
                            <span className="notification-item-version notification-item-version--missing">
                              {t('plugins.notInstalled')}
                            </span>
                          )}
                          <span className="notification-item-scope">
                            {plugin.type === 'official' ? t('plugins.official') : t('plugins.external')}
                          </span>
                        </div>
                        <div className="notification-item-actions">
                          {plugin.installed ? (
                            <button
                              className="notification-item-btn notification-item-btn--uninstall"
                              onClick={() => handlePluginUninstall(plugin.name)}
                              disabled={pluginAction === plugin.name}
                            >
                              {pluginAction === plugin.name ? (
                                <span className="notification-spinner">{'\u21BB'}</span>
                              ) : t('plugins.uninstall')}
                            </button>
                          ) : (
                            <button
                              className="notification-item-btn notification-item-btn--install"
                              onClick={() => handlePluginInstall(plugin.name)}
                              disabled={pluginAction === plugin.name}
                            >
                              {pluginAction === plugin.name ? (
                                <span className="notification-spinner">{'\u21BB'}</span>
                              ) : t('plugins.install')}
                            </button>
                          )}
                        </div>
                        {plugin.description && (
                          <div className="notification-item-description">
                            {plugin.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
