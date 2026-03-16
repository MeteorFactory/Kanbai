import { useState, useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import { MCP_CATALOG, MCP_CATEGORIES, MCP_CATEGORY_ICONS } from '../../../shared/constants/mcpCatalog'
import type { McpCategory, McpCatalogEntry } from '../../../shared/types'
import { useMcp, type McpServerConfig } from './use-mcp'

interface McpStdioConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface McpHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

interface McpPanelProps {
  mcpServers: Record<string, McpServerConfig>
  settings: Record<string, unknown>
  projectPath: string
  workspaceName?: string
  onServersChange: (servers: Record<string, McpServerConfig>, settings: Record<string, unknown>) => void
}

export function McpPanel({ mcpServers, settings, projectPath, workspaceName, onServersChange }: McpPanelProps) {
  const { t } = useI18n()

  const mcp = useMcp({ mcpServers, settings, projectPath, workspaceName, onServersChange })

  const [selectedCategory, setSelectedCategory] = useState<McpCategory | 'all'>('all')

  // Filter catalog
  const filteredCatalog = useMemo(() => {
    let entries = MCP_CATALOG
    if (selectedCategory !== 'all') {
      entries = entries.filter(e => e.category === selectedCategory)
    }
    if (mcp.searchQuery.trim()) {
      const q = mcp.searchQuery.toLowerCase()
      entries = entries.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.features.some(f => f.toLowerCase().includes(q))
      )
    }
    return entries
  }, [selectedCategory, mcp.searchQuery])

  // Group catalog by category
  const catalogByCategory = useMemo(() => {
    const groups: Record<string, McpCatalogEntry[]> = {}
    for (const entry of filteredCatalog) {
      if (!groups[entry.category]) groups[entry.category] = []
      groups[entry.category]!.push(entry)
    }
    return groups
  }, [filteredCatalog])

  return (
    <div className="claude-rules-mcp">
      {/* View Tabs */}
      <div className="mcp-view-tabs">
        <button
          className={`mcp-view-tab${mcp.view === 'catalog' ? ' mcp-view-tab--active' : ''}`}
          onClick={() => mcp.setView('catalog')}
        >
          {t('claude.mcpCatalog')}
        </button>
        <button
          className={`mcp-view-tab${mcp.view === 'installed' ? ' mcp-view-tab--active' : ''}`}
          onClick={() => mcp.setView('installed')}
        >
          {t('claude.mcpInstalled')} ({mcp.installedCount})
        </button>
      </div>

      {/* Scope Toggle */}
      {workspaceName && (
        <div className="mcp-scope-toggle">
          <div className="cs-mcp-transport-toggle">
            <button
              type="button"
              className={`cs-mcp-transport-toggle-btn${mcp.scope === 'project' ? ' cs-mcp-transport-toggle-btn--active' : ''}`}
              onClick={() => mcp.setScope('project')}
            >
              {t('claude.mcpScopeProject')}
            </button>
            <button
              type="button"
              className={`cs-mcp-transport-toggle-btn${mcp.scope === 'workspace' ? ' cs-mcp-transport-toggle-btn--active' : ''}`}
              onClick={() => mcp.setScope('workspace')}
            >
              {t('claude.mcpScopeWorkspace')}
            </button>
          </div>
          {mcp.scope === 'workspace' && (
            <div className="mcp-scope-info">{t('claude.mcpScopeWorkspaceDesc')}</div>
          )}
        </div>
      )}

      {mcp.loadingWorkspace && mcp.scope === 'workspace' ? (
        <div className="claude-mcp-empty">{t('common.loading')}</div>
      ) : (
        <>
          {/* ===== CATALOG VIEW ===== */}
          {mcp.view === 'catalog' && (
            <div className="mcp-catalog">
              {/* Search */}
              <div className="mcp-catalog-search">
                <input
                  className="mcp-catalog-search-input"
                  type="text"
                  value={mcp.searchQuery}
                  onChange={e => mcp.setSearchQuery(e.target.value)}
                  placeholder={t('claude.mcpSearchPlaceholder')}
                />
              </div>

              {/* Category Chips */}
              <div className="mcp-catalog-categories">
                <button
                  className={`mcp-cat-chip${selectedCategory === 'all' ? ' mcp-cat-chip--active' : ''}`}
                  onClick={() => setSelectedCategory('all')}
                >
                  {t('claude.mcpCatAll')}
                </button>
                {MCP_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    className={`mcp-cat-chip${selectedCategory === cat.id ? ' mcp-cat-chip--active' : ''}`}
                    onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
                  >
                    <span className="mcp-cat-chip-icon">{MCP_CATEGORY_ICONS[cat.id]}</span>
                    {t(cat.labelKey)}
                  </button>
                ))}
              </div>

              {/* Catalog Entries */}
              {filteredCatalog.length === 0 ? (
                <div className="claude-mcp-empty">{t('claude.mcpCatalogEmpty')}</div>
              ) : (
                <div className="mcp-catalog-grid">
                  {Object.entries(catalogByCategory).map(([category, entries]) => (
                    <div key={category} className="mcp-catalog-group">
                      <div className="mcp-catalog-group-title">
                        <span className="mcp-catalog-group-icon">{MCP_CATEGORY_ICONS[category as McpCategory]}</span>
                        {t(MCP_CATEGORIES.find(c => c.id === category)?.labelKey ?? '')}
                      </div>
                      <div className="mcp-catalog-entries">
                        {entries.map(entry => {
                          const isInstalled = mcp.installedCatalogIds.has(entry.id)
                          return (
                            <div key={entry.id} className={`mcp-catalog-card${isInstalled ? ' mcp-catalog-card--installed' : ''}`}>
                              <div className="mcp-catalog-card-header">
                                <div className="mcp-catalog-card-title">
                                  {entry.name}
                                  {entry.official && <span className="mcp-catalog-badge-official" title="Official">MCP</span>}
                                </div>
                                {isInstalled ? (
                                  <span className="mcp-catalog-badge-installed">{t('claude.mcpAlreadyInstalled')}</span>
                                ) : (
                                  <button
                                    className="mcp-catalog-install-btn"
                                    onClick={() => mcp.handleCatalogInstall(entry)}
                                  >
                                    {t('claude.mcpInstall')}
                                  </button>
                                )}
                              </div>
                              <div className="mcp-catalog-card-desc">{entry.description}</div>
                              <div className="mcp-catalog-card-features">
                                {entry.features.slice(0, 5).map(f => (
                                  <span key={f} className="mcp-catalog-feature-chip">{f}</span>
                                ))}
                                {entry.features.length > 5 && (
                                  <span className="mcp-catalog-feature-chip mcp-catalog-feature-more">+{entry.features.length - 5}</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Install modal for args and env vars */}
              {mcp.installingEntry && (
                <div className="mcp-install-overlay" onClick={() => mcp.setInstallingEntry(null)}>
                  <form className="mcp-install-modal" onClick={e => e.stopPropagation()} onSubmit={mcp.handleConfirmInstall}>
                    <div className="mcp-install-modal-title">
                      {t('claude.mcpConfigureServer', { name: mcp.installingEntry.name })}
                    </div>
                    <div className="mcp-install-modal-desc">
                      {t('claude.mcpConfigureDesc')}
                    </div>
                    {mcp.installingEntry.argsPlaceholders && Object.keys(mcp.installingEntry.argsPlaceholders).length > 0 && (
                      <>
                        <div className="mcp-install-section-label">{t('claude.mcpConfigureArgsSection')}</div>
                        {Object.entries(mcp.installingEntry.argsPlaceholders).map(([key, placeholder]) => (
                          <div key={`arg-${key}`} className="claude-mcp-form-row">
                            <label className="claude-mcp-form-label">{key}</label>
                            <input
                              className="claude-mcp-form-input"
                              value={mcp.installArgsValues[key] ?? ''}
                              onChange={e => mcp.setInstallArgsValues(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={placeholder}
                              autoFocus
                            />
                          </div>
                        ))}
                      </>
                    )}
                    {mcp.installingEntry.envPlaceholders && Object.keys(mcp.installingEntry.envPlaceholders).length > 0 && (
                      <>
                        <div className="mcp-install-section-label">{t('claude.mcpConfigureEnvSection')}</div>
                        {Object.entries(mcp.installingEntry.envPlaceholders).map(([key, placeholder]) => (
                          <div key={`env-${key}`} className="claude-mcp-form-row">
                            <label className="claude-mcp-form-label">{key}</label>
                            <input
                              className="claude-mcp-form-input"
                              value={mcp.installEnvValues[key] ?? ''}
                              onChange={e => mcp.setInstallEnvValues(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={placeholder}
                            />
                          </div>
                        ))}
                      </>
                    )}
                    <div className="claude-mcp-form-actions">
                      <button type="button" className="claude-mcp-action-btn" onClick={() => mcp.setInstallingEntry(null)}>
                        {t('common.cancel')}
                      </button>
                      <button type="submit" className="claude-mcp-add-btn">
                        {t('claude.mcpInstall')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ===== INSTALLED VIEW ===== */}
          {mcp.view === 'installed' && (
            <div className="mcp-installed">
              <div className="claude-mcp-header">
                <span className="claude-mcp-title">{t('claude.mcpServers')}</span>
                {!mcp.mcpAddingNew && (
                  <button className="claude-mcp-add-btn" onClick={() => mcp.setMcpAddingNew(true)}>
                    {t('claude.mcpAddManual')}
                  </button>
                )}
              </div>

              {mcp.mcpAddingNew && (
                <form className="claude-mcp-add-form" onSubmit={mcp.handleAddMcpServer}>
                  <div className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{t('claude.mcpServerName')}</label>
                    <input
                      className="claude-mcp-form-input"
                      value={mcp.mcpNewName}
                      onChange={e => mcp.setMcpNewName(e.target.value)}
                      placeholder="filesystem"
                      autoFocus
                    />
                  </div>
                  <div className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{t('claude.mcpTransport')}</label>
                    <div className="cs-mcp-transport-toggle">
                      <button
                        type="button"
                        className={`cs-mcp-transport-toggle-btn${mcp.mcpNewTransport === 'stdio' ? ' cs-mcp-transport-toggle-btn--active' : ''}`}
                        onClick={() => mcp.setMcpNewTransport('stdio')}
                      >
                        stdio
                      </button>
                      <button
                        type="button"
                        className={`cs-mcp-transport-toggle-btn${mcp.mcpNewTransport === 'http' ? ' cs-mcp-transport-toggle-btn--active' : ''}`}
                        onClick={() => mcp.setMcpNewTransport('http')}
                      >
                        http
                      </button>
                    </div>
                  </div>
                  {mcp.mcpNewTransport === 'stdio' ? (
                    <>
                      <div className="claude-mcp-form-row">
                        <label className="claude-mcp-form-label">{t('claude.mcpServerCommand')}</label>
                        <input
                          className="claude-mcp-form-input"
                          value={mcp.mcpNewCommand}
                          onChange={e => mcp.setMcpNewCommand(e.target.value)}
                          placeholder="npx"
                        />
                      </div>
                      <div className="claude-mcp-form-row">
                        <label className="claude-mcp-form-label">{t('claude.mcpServerArgs')}</label>
                        <textarea
                          className="claude-mcp-form-textarea"
                          value={mcp.mcpNewArgs}
                          onChange={e => mcp.setMcpNewArgs(e.target.value)}
                          placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/tmp"}
                          rows={3}
                        />
                      </div>
                      <div className="claude-mcp-form-row">
                        <label className="claude-mcp-form-label">{t('claude.mcpServerEnv')}</label>
                        <textarea
                          className="claude-mcp-form-textarea"
                          value={mcp.mcpNewEnv}
                          onChange={e => mcp.setMcpNewEnv(e.target.value)}
                          placeholder={"API_KEY=xxx\nDEBUG=true"}
                          rows={2}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="claude-mcp-form-row">
                        <label className="claude-mcp-form-label">{t('claude.mcpServerUrl')}</label>
                        <input
                          className="claude-mcp-form-input"
                          value={mcp.mcpNewUrl}
                          onChange={e => mcp.setMcpNewUrl(e.target.value)}
                          placeholder="https://example.com/mcp"
                        />
                      </div>
                      <div className="claude-mcp-form-row">
                        <label className="claude-mcp-form-label">{t('claude.mcpServerHeaders')}</label>
                        <textarea
                          className="claude-mcp-form-textarea"
                          value={mcp.mcpNewHeaders}
                          onChange={e => mcp.setMcpNewHeaders(e.target.value)}
                          placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
                          rows={2}
                        />
                      </div>
                    </>
                  )}
                  <div className="claude-mcp-form-actions">
                    <button type="button" className="claude-mcp-action-btn" onClick={() => mcp.setMcpAddingNew(false)}>
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="claude-mcp-add-btn"
                      disabled={!mcp.mcpNewName.trim() || (mcp.mcpNewTransport === 'stdio' ? !mcp.mcpNewCommand.trim() : !mcp.mcpNewUrl.trim())}
                    >
                      {t('common.add')}
                    </button>
                  </div>
                </form>
              )}

              {mcp.installedCount === 0 ? (
                <div className="claude-mcp-empty">
                  <div>{t('claude.mcpNoServers')}</div>
                  <button className="mcp-catalog-install-btn" style={{ marginTop: 8 }} onClick={() => mcp.setView('catalog')}>
                    {t('claude.mcpBrowseCatalog')}
                  </button>
                </div>
              ) : (
                <div className="claude-mcp-server-list">
                  {Object.entries(mcp.activeServers).map(([name, config]) => {
                    const catalogEntry = MCP_CATALOG.find(e => e.id === name)
                    const isHttp = 'type' in config && config.type === 'http'
                    return (
                      <div key={name} className="claude-mcp-server-item">
                        <div className="claude-mcp-server-header">
                          <div className="claude-mcp-server-info">
                            <div className="claude-mcp-server-name">
                              {catalogEntry && <span className="mcp-server-cat-icon">{MCP_CATEGORY_ICONS[catalogEntry.category]}</span>}
                              {name}
                              {catalogEntry?.official && <span className="mcp-catalog-badge-official" title="Official">MCP</span>}
                              {isHttp && <span className="mcp-server-transport-badge">HTTP</span>}
                              {mcp.scope === 'workspace' && <span className="mcp-server-scope-badge">{t('claude.mcpWorkspaceBadge')}</span>}
                            </div>
                            {catalogEntry && (
                              <div className="mcp-server-description">{catalogEntry.description}</div>
                            )}
                            {isHttp ? (
                              <div className="claude-mcp-server-command">
                                {(config as McpHttpConfig).url}
                              </div>
                            ) : (
                              <div className="claude-mcp-server-command">
                                {(config as McpStdioConfig).command}{(config as McpStdioConfig).args ? ' ' + (config as McpStdioConfig).args!.join(' ') : ''}
                              </div>
                            )}
                            {!isHttp && (config as McpStdioConfig).env && Object.keys((config as McpStdioConfig).env!).length > 0 && (
                              <div className="claude-mcp-server-env-chips">
                                {Object.keys((config as McpStdioConfig).env!).map(key => (
                                  <span key={key} className="claude-mcp-env-chip">{key}</span>
                                ))}
                              </div>
                            )}
                            {isHttp && (config as McpHttpConfig).headers && Object.keys((config as McpHttpConfig).headers!).length > 0 && (
                              <div className="claude-mcp-server-env-chips">
                                {Object.keys((config as McpHttpConfig).headers!).map(key => (
                                  <span key={key} className="claude-mcp-env-chip">{key}</span>
                                ))}
                              </div>
                            )}
                            {catalogEntry && (
                              <div className="mcp-server-features">
                                {catalogEntry.features.slice(0, 6).map(f => (
                                  <span key={f} className="mcp-catalog-feature-chip">{f}</span>
                                ))}
                                {catalogEntry.features.length > 6 && (
                                  <span className="mcp-catalog-feature-chip mcp-catalog-feature-more">+{catalogEntry.features.length - 6}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="claude-mcp-server-actions">
                            <button className="claude-mcp-action-btn claude-mcp-action-btn--danger" onClick={() => mcp.handleRemoveMcpServer(name)}>
                              {t('claude.mcpRemoveServer')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
