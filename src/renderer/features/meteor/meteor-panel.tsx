import { useState, useEffect, useRef, useCallback } from 'react'
import type { ClaudePlugin, InstalledPackage } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'
import { useAppUpdateStore } from '../updates/app-update-store'
import { useUpdateStore } from '../updates/update-store'
import { useTerminalTabStore } from '../terminal/terminal-store'
import { useWorkspaceStore } from '../workspace/workspace-store'
import { useViewStore } from '../../shared/stores/view-store'

const BREW_FORMULA_URL = 'https://formulae.brew.sh/formula/'
const NPM_PKG_URL = 'https://www.npmjs.com/package/'

/** Set of recommended tool names — used to exclude from "Installed" column */
const RECOMMENDED_NAMES = new Set([
  'brew', 'node', 'npm', 'pnpm', 'yarn', 'claude', 'codex', 'copilot',
  'git', 'go', 'python', 'cargo', 'rtk', 'pip', 'make', 'pixel-agents',
  // Also match brew formula names
  'claude-code', 'rustup', 'python3',
])

export function MeteorPanel() {
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
    installedPackages,
    isLoadingInstalled,
    checkUpdates: checkToolUpdates,
    installUpdate: installToolUpdate,
    uninstallUpdate: uninstallToolUpdate,
    loadInstalledPackages,
    clearInstallStatus: clearToolInstallStatus,
  } = useUpdateStore()

  const [toolErrorCopied, setToolErrorCopied] = useState(false)
  const toolErrorCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [updatingAll, setUpdatingAll] = useState(false)

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
    if (installedPackages.length > 0) return
    loadInstalledPackages()
  }, [installedPackages.length, loadInstalledPackages])

  useEffect(() => {
    if (!installStatus?.success) return
    const timer = setTimeout(() => clearToolInstallStatus(), 5000)
    return () => clearTimeout(timer)
  }, [installStatus, clearToolInstallStatus])

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const createTab = useTerminalTabStore((s) => s.createTab)
  const setViewMode = useViewStore((s) => s.setViewMode)

  const getToolDir = (binaryPath: string): string => {
    const lastSlash = binaryPath.lastIndexOf('/')
    if (lastSlash === -1) {
      const lastBackslash = binaryPath.lastIndexOf('\\')
      return lastBackslash > 0 ? binaryPath.substring(0, lastBackslash) : binaryPath
    }
    return binaryPath.substring(0, lastSlash)
  }

  const handleOpenTerminal = (binaryPath: string, toolName: string): void => {
    if (!activeWorkspaceId || !binaryPath) return
    const dir = getToolDir(binaryPath)
    createTab(activeWorkspaceId, dir, toolName)
    setViewMode('terminal')
  }

  const handleOpenFolder = (binaryPath: string): void => {
    if (!binaryPath) return
    const dir = getToolDir(binaryPath)
    window.kanbai.shell.openPath(dir)
  }

  const handleUpdateInTerminal = async (tool: string, scope: 'global' | 'project' | 'unit'): Promise<void> => {
    if (!activeWorkspaceId) return
    const resolved = await window.kanbai.updates.resolveCommand(tool)
    if (resolved?.command) {
      const tabLabel = `${t('meteor.updatePrefix')}: ${tool}`
      createTab(activeWorkspaceId, '~', tabLabel, resolved.command)
      setViewMode('terminal')
    } else {
      // Fallback to IPC-based update for complex tools (pixel-agents, brew install)
      installToolUpdate(tool, scope)
    }
  }

  const handleToolUninstall = (tool: string): void => {
    uninstallToolUpdate(tool)
  }

  const updatableTools = toolUpdates.filter((u) => u.installed && u.updateAvailable)

  const handleRefreshAll = () => {
    checkToolUpdates()
    loadInstalledPackages()
  }

  const handleUpdatePackage = async (pkg: InstalledPackage): Promise<void> => {
    if (!activeWorkspaceId) return
    const command = pkg.source === 'brew'
      ? `brew upgrade ${pkg.name}`
      : `npm install -g ${pkg.name}@latest`
    createTab(activeWorkspaceId, '~', `${t('meteor.updatePrefix')}: ${pkg.name}`, command)
    setViewMode('terminal')
  }

  const handleUninstallPackage = (pkg: InstalledPackage): void => {
    if (!activeWorkspaceId) return
    const command = pkg.source === 'brew'
      ? `brew uninstall ${pkg.name}`
      : `npm uninstall -g ${pkg.name}`
    createTab(activeWorkspaceId, '~', `Uninstall: ${pkg.name}`, command)
    setViewMode('terminal')
  }

  const handleUpdateAll = async (): Promise<void> => {
    if (!activeWorkspaceId || updatableTools.length === 0) return
    setUpdatingAll(true)
    for (const update of updatableTools) {
      const resolved = await window.kanbai.updates.resolveCommand(update.tool)
      if (resolved?.command) {
        const tabLabel = `${t('meteor.updatePrefix')}: ${update.tool}`
        createTab(activeWorkspaceId, '~', tabLabel, resolved.command, false)
      } else {
        await installToolUpdate(update.tool, update.scope)
      }
    }
    setUpdatingAll(false)
    setViewMode('terminal')
  }

  const [appVersion, setAppVersion] = useState<{ version: string; name: string } | null>(null)
  useEffect(() => {
    window.kanbai.app.version().then(setAppVersion).catch(() => {})
  }, [])

  return (
    <div className="settings-section meteor-panel">
      <div className="meteor-header">
        <h2 className="meteor-title">{t('meteor.title')}</h2>
        <div className="meteor-header-actions">
          <button
            className="settings-btn"
            onClick={handleRefreshAll}
            disabled={toolsChecking || isLoadingInstalled}
          >
            {toolsChecking || isLoadingInstalled ? t('common.loading') : t('updates.checkTooltip')}
          </button>
          {updatableTools.length > 0 && (
            <button
              className="settings-btn meteor-btn-update-all"
              onClick={handleUpdateAll}
              disabled={updatingAll || Boolean(installingTool)}
            >
              {updatingAll ? t('common.loading') : t('updates.updateAll')} ({updatableTools.length})
            </button>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('updates.lastCheck', { time: toolsLastChecked ? new Date(toolsLastChecked).toLocaleTimeString(localeCode, { hour: '2-digit', minute: '2-digit' }) : t('time.never') })}</label>
          </div>
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

      {/* Two-column layout: Recommended tools + Installed packages */}
      <div className="meteor-columns">
        {/* Left column — Recommended tools */}
        <div className="meteor-column">
          <div className="meteor-column-header">
            <span className="meteor-column-title">{t('meteor.recommended')}</span>
            <span className="meteor-column-count">{toolUpdates.length}</span>
          </div>
          <div className="settings-card">
            {toolUpdates.length === 0 && !toolsChecking ? (
              <p className="notification-empty">{t('updates.noInfo')}</p>
            ) : (
              <div className="notification-panel-content">
                {[...toolUpdates]
                  .sort((a, b) => Number(b.updateAvailable) - Number(a.updateAvailable) || Number(b.installed) - Number(a.installed) || a.tool.localeCompare(b.tool))
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
                        {update.packageManager && update.installed && (
                          <span className={`notification-item-badge notification-item-badge--${update.packageManager}`} title={update.binaryPath || ''}>{update.packageManager}</span>
                        )}
                      </div>
                      <div className="notification-item-actions">
                        {update.installed && update.binaryPath && (
                          <>
                            <button
                              className="notification-item-btn notification-item-btn--subtle"
                              onClick={() => handleOpenTerminal(update.binaryPath!, update.tool)}
                              title={t('updates.openTerminalHere')}
                            >
                              {'>_'}
                            </button>
                            <button
                              className="notification-item-btn notification-item-btn--subtle"
                              onClick={() => handleOpenFolder(update.binaryPath!)}
                              title={t('updates.openFolderHere')}
                            >
                              {'\uD83D\uDCC2'}
                            </button>
                          </>
                        )}
                        {update.installed && update.updateAvailable && (
                          <button
                            className="notification-item-btn"
                            onClick={() => handleUpdateInTerminal(update.tool, update.scope)}
                            disabled={installingTool === update.tool || updatingAll}
                          >
                            {installingTool === update.tool ? (
                              <span className="notification-spinner">{'\u21BB'}</span>
                            ) : t('updates.update')}
                          </button>
                        )}
                        {!update.installed && update.canInstall && (
                          <button
                            className="notification-item-btn notification-item-btn--install"
                            onClick={() => handleUpdateInTerminal(update.tool, update.scope)}
                            disabled={installingTool === update.tool || updatingAll}
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
        </div>

        {/* Right column — All installed packages */}
        <div className="meteor-column">
          <div className="meteor-column-header">
            <span className="meteor-column-title">{t('meteor.installed')}</span>
            <span className="meteor-column-count">{installedPackages.filter((p) => !RECOMMENDED_NAMES.has(p.name)).length}</span>
            {installedPackages.filter((p) => !RECOMMENDED_NAMES.has(p.name) && p.updateAvailable).length > 0 && (
              <span className="meteor-column-count meteor-column-count--update">
                {installedPackages.filter((p) => !RECOMMENDED_NAMES.has(p.name) && p.updateAvailable).length} {t('updates.updatesAvailable')}
              </span>
            )}
          </div>

          {isLoadingInstalled && installedPackages.length === 0 && (
            <div className="settings-card">
              <p className="notification-empty">{t('common.loading')}</p>
            </div>
          )}

          {!isLoadingInstalled && installedPackages.filter((p) => !RECOMMENDED_NAMES.has(p.name)).length === 0 && (
            <div className="settings-card">
              <p className="notification-empty">{t('meteor.noPackages')}</p>
            </div>
          )}

          {/* Brew section */}
          {(() => {
            const brewPkgs = installedPackages
              .filter((p) => p.source === 'brew' && !RECOMMENDED_NAMES.has(p.name))
              .sort((a, b) => Number(b.updateAvailable) - Number(a.updateAvailable) || a.name.localeCompare(b.name))
            if (brewPkgs.length === 0) return null
            return (
              <div className="settings-card">
                <div className="meteor-pkg-section-header">
                  <span className="notification-item-badge notification-item-badge--brew">brew</span>
                  <span className="meteor-pkg-section-count">{brewPkgs.length} packages</span>
                </div>
                <div className="notification-panel-content">
                  {brewPkgs.map((pkg) => (
                    <div
                      key={`brew-${pkg.name}`}
                      className={`notification-item${pkg.updateAvailable ? ' notification-item--update' : ''}`}
                    >
                      <div className="notification-item-info">
                        <span className="notification-item-name">{pkg.name}</span>
                        <span className="notification-item-version">
                          {pkg.currentVersion}
                          {pkg.updateAvailable && pkg.latestVersion && (
                            <> {' \u2192 '} <span className="notification-item-latest">{pkg.latestVersion}</span> </>
                          )}
                        </span>
                      </div>
                      <div className="notification-item-actions">
                        <button
                          className="notification-item-btn notification-item-btn--subtle"
                          onClick={() => window.open(`${BREW_FORMULA_URL}${pkg.name}`, '_blank')}
                          title={t('meteor.viewPackage')}
                        >
                          {'\u2197'}
                        </button>
                        <button
                          className="notification-item-btn notification-item-btn--uninstall"
                          onClick={() => handleUninstallPackage(pkg)}
                          title={t('updates.uninstall')}
                        >
                          {'\u2717'}
                        </button>
                        {pkg.updateAvailable && (
                          <button
                            className="notification-item-btn"
                            onClick={() => handleUpdatePackage(pkg)}
                            title={t('updates.update')}
                          >
                            {'\u2191'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* npm section */}
          {(() => {
            const npmPkgs = installedPackages
              .filter((p) => p.source === 'npm' && !RECOMMENDED_NAMES.has(p.name))
              .sort((a, b) => Number(b.updateAvailable) - Number(a.updateAvailable) || a.name.localeCompare(b.name))
            if (npmPkgs.length === 0) return null
            return (
              <div className="settings-card">
                <div className="meteor-pkg-section-header">
                  <span className="notification-item-badge notification-item-badge--npm">npm</span>
                  <span className="meteor-pkg-section-count">{npmPkgs.length} packages</span>
                </div>
                <div className="notification-panel-content">
                  {npmPkgs.map((pkg) => (
                    <div
                      key={`npm-${pkg.name}`}
                      className={`notification-item${pkg.updateAvailable ? ' notification-item--update' : ''}`}
                    >
                      <div className="notification-item-info">
                        <span className="notification-item-name">{pkg.name}</span>
                        <span className="notification-item-version">
                          {pkg.currentVersion}
                          {pkg.updateAvailable && pkg.latestVersion && (
                            <> {' \u2192 '} <span className="notification-item-latest">{pkg.latestVersion}</span> </>
                          )}
                        </span>
                      </div>
                      <div className="notification-item-actions">
                        <button
                          className="notification-item-btn notification-item-btn--subtle"
                          onClick={() => window.open(`${NPM_PKG_URL}${pkg.name}`, '_blank')}
                          title={t('meteor.viewPackage')}
                        >
                          {'\u2197'}
                        </button>
                        <button
                          className="notification-item-btn notification-item-btn--uninstall"
                          onClick={() => handleUninstallPackage(pkg)}
                          title={t('updates.uninstall')}
                        >
                          {'\u2717'}
                        </button>
                        {pkg.updateAvailable && (
                          <button
                            className="notification-item-btn"
                            onClick={() => handleUpdatePackage(pkg)}
                            title={t('updates.update')}
                          >
                            {'\u2191'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
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
