import { useState, useCallback, useMemo, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n'
import { MCP_CATALOG, MCP_CATEGORIES, MCP_CATEGORY_ICONS } from '../../shared/constants/mcpCatalog'
import type { McpCategory, McpCatalogEntry } from '../../shared/types'

type McpView = 'catalog' | 'installed'
type McpTransport = 'stdio' | 'http'

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

type McpServerConfig = McpStdioConfig | McpHttpConfig

interface McpPanelProps {
  mcpServers: Record<string, McpServerConfig>
  settings: Record<string, unknown>
  projectPath: string
  onServersChange: (servers: Record<string, McpServerConfig>, settings: Record<string, unknown>) => void
}

export function McpPanel({ mcpServers, settings, projectPath, onServersChange }: McpPanelProps) {
  const { t } = useI18n()

  // View state
  const [view, setView] = useState<McpView>('catalog')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<McpCategory | 'all'>('all')

  // Manual add state
  const [mcpAddingNew, setMcpAddingNew] = useState(false)
  const [mcpNewName, setMcpNewName] = useState('')
  const [mcpNewTransport, setMcpNewTransport] = useState<McpTransport>('stdio')
  const [mcpNewCommand, setMcpNewCommand] = useState('')
  const [mcpNewArgs, setMcpNewArgs] = useState('')
  const [mcpNewEnv, setMcpNewEnv] = useState('')
  const [mcpNewUrl, setMcpNewUrl] = useState('')
  const [mcpNewHeaders, setMcpNewHeaders] = useState('')

  // Catalog install state (for env variable configuration)
  const [installingEntry, setInstallingEntry] = useState<McpCatalogEntry | null>(null)
  const [installEnvValues, setInstallEnvValues] = useState<Record<string, string>>({})

  // Installed server IDs (match catalog entries by command+args pattern)
  const installedCatalogIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [name] of Object.entries(mcpServers)) {
      const match = MCP_CATALOG.find(e => e.id === name)
      if (match) ids.add(match.id)
    }
    return ids
  }, [mcpServers])

  // Filter catalog
  const filteredCatalog = useMemo(() => {
    let entries = MCP_CATALOG
    if (selectedCategory !== 'all') {
      entries = entries.filter(e => e.category === selectedCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      entries = entries.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.features.some(f => f.toLowerCase().includes(q))
      )
    }
    return entries
  }, [selectedCategory, searchQuery])

  // Group catalog by category
  const catalogByCategory = useMemo(() => {
    const groups: Record<string, McpCatalogEntry[]> = {}
    for (const entry of filteredCatalog) {
      if (!groups[entry.category]) groups[entry.category] = []
      groups[entry.category]!.push(entry)
    }
    return groups
  }, [filteredCatalog])

  const doInstall = useCallback(async (entry: McpCatalogEntry, envValues: Record<string, string>) => {
    const env: Record<string, string> = {}
    let hasEnv = false
    for (const [key, val] of Object.entries(envValues)) {
      if (val.trim()) {
        env[key] = val.trim()
        hasEnv = true
      }
    }
    const newServer = {
      command: entry.command,
      args: entry.args,
      ...(hasEnv ? { env } : entry.env ? { env: entry.env } : {}),
    }
    const newServers = { ...mcpServers, [entry.id]: newServer }
    const newSettings = { ...settings, mcpServers: newServers }
    await window.kanbai.project.writeClaudeSettings(projectPath, newSettings)
    onServersChange(newServers, newSettings)
    setInstallingEntry(null)
    setInstallEnvValues({})
  }, [mcpServers, settings, projectPath, onServersChange])

  // Install from catalog
  const handleCatalogInstall = useCallback((entry: McpCatalogEntry) => {
    if (entry.envPlaceholders && Object.keys(entry.envPlaceholders).length > 0) {
      setInstallingEntry(entry)
      setInstallEnvValues({ ...entry.envPlaceholders })
      return
    }
    // No env needed, install directly
    doInstall(entry, {})
  }, [doInstall])

  const handleConfirmInstall = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!installingEntry) return
    await doInstall(installingEntry, installEnvValues)
  }, [installingEntry, installEnvValues, doInstall])

  // Manual add
  const handleAddMcpServer = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!mcpNewName.trim()) return

    let newServer: McpServerConfig

    if (mcpNewTransport === 'http') {
      if (!mcpNewUrl.trim()) return
      let headers: Record<string, string> | undefined
      if (mcpNewHeaders.trim()) {
        headers = {}
        for (const line of mcpNewHeaders.trim().split('\n')) {
          const sep = line.indexOf(':')
          if (sep > 0) {
            headers[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
          }
        }
        if (Object.keys(headers).length === 0) headers = undefined
      }
      newServer = { type: 'http', url: mcpNewUrl.trim(), ...(headers ? { headers } : {}) }
    } else {
      if (!mcpNewCommand.trim()) return
      const args = mcpNewArgs.trim() ? mcpNewArgs.trim().split('\n').map(a => a.trim()).filter(Boolean) : undefined
      let env: Record<string, string> | undefined
      if (mcpNewEnv.trim()) {
        env = {}
        for (const line of mcpNewEnv.trim().split('\n')) {
          const eq = line.indexOf('=')
          if (eq > 0) {
            env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
          }
        }
        if (Object.keys(env).length === 0) env = undefined
      }
      newServer = { command: mcpNewCommand.trim(), ...(args ? { args } : {}), ...(env ? { env } : {}) }
    }

    const newServers = { ...mcpServers, [mcpNewName.trim()]: newServer }
    const newSettings = { ...settings, mcpServers: newServers }
    await window.kanbai.project.writeClaudeSettings(projectPath, newSettings)
    onServersChange(newServers, newSettings)
    setMcpNewName('')
    setMcpNewTransport('stdio')
    setMcpNewCommand('')
    setMcpNewArgs('')
    setMcpNewEnv('')
    setMcpNewUrl('')
    setMcpNewHeaders('')
    setMcpAddingNew(false)
  }, [mcpNewName, mcpNewTransport, mcpNewCommand, mcpNewArgs, mcpNewEnv, mcpNewUrl, mcpNewHeaders, mcpServers, settings, projectPath, onServersChange])

  // Remove server
  const handleRemoveMcpServer = useCallback(async (name: string) => {
    const newServers = { ...mcpServers }
    delete newServers[name]
    const newSettings = { ...settings }
    if (Object.keys(newServers).length > 0) {
      newSettings.mcpServers = newServers
    } else {
      delete newSettings.mcpServers
    }
    await window.kanbai.project.writeClaudeSettings(projectPath, newSettings)
    onServersChange(newServers, newSettings)
  }, [mcpServers, settings, projectPath, onServersChange])

  const installedCount = Object.keys(mcpServers).length

  return (
    <div className="claude-rules-mcp">
      {/* View Tabs */}
      <div className="mcp-view-tabs">
        <button
          className={`mcp-view-tab${view === 'catalog' ? ' mcp-view-tab--active' : ''}`}
          onClick={() => setView('catalog')}
        >
          {t('claude.mcpCatalog')}
        </button>
        <button
          className={`mcp-view-tab${view === 'installed' ? ' mcp-view-tab--active' : ''}`}
          onClick={() => setView('installed')}
        >
          {t('claude.mcpInstalled')} ({installedCount})
        </button>
      </div>

      {/* ===== CATALOG VIEW ===== */}
      {view === 'catalog' && (
        <div className="mcp-catalog">
          {/* Search */}
          <div className="mcp-catalog-search">
            <input
              className="mcp-catalog-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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
                      const isInstalled = installedCatalogIds.has(entry.id)
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
                                onClick={() => handleCatalogInstall(entry)}
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

          {/* Install modal for env vars */}
          {installingEntry && (
            <div className="mcp-install-overlay" onClick={() => setInstallingEntry(null)}>
              <form className="mcp-install-modal" onClick={e => e.stopPropagation()} onSubmit={handleConfirmInstall}>
                <div className="mcp-install-modal-title">
                  {t('claude.mcpConfigureServer', { name: installingEntry.name })}
                </div>
                <div className="mcp-install-modal-desc">
                  {t('claude.mcpConfigureEnvDesc')}
                </div>
                {Object.entries(installingEntry.envPlaceholders ?? {}).map(([key, placeholder]) => (
                  <div key={key} className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{key}</label>
                    <input
                      className="claude-mcp-form-input"
                      value={installEnvValues[key] ?? ''}
                      onChange={e => setInstallEnvValues(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      autoFocus
                    />
                  </div>
                ))}
                <div className="claude-mcp-form-actions">
                  <button type="button" className="claude-mcp-action-btn" onClick={() => setInstallingEntry(null)}>
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
      {view === 'installed' && (
        <div className="mcp-installed">
          <div className="claude-mcp-header">
            <span className="claude-mcp-title">{t('claude.mcpServers')}</span>
            {!mcpAddingNew && (
              <button className="claude-mcp-add-btn" onClick={() => setMcpAddingNew(true)}>
                {t('claude.mcpAddManual')}
              </button>
            )}
          </div>

          {mcpAddingNew && (
            <form className="claude-mcp-add-form" onSubmit={handleAddMcpServer}>
              <div className="claude-mcp-form-row">
                <label className="claude-mcp-form-label">{t('claude.mcpServerName')}</label>
                <input
                  className="claude-mcp-form-input"
                  value={mcpNewName}
                  onChange={e => setMcpNewName(e.target.value)}
                  placeholder="filesystem"
                  autoFocus
                />
              </div>
              <div className="claude-mcp-form-row">
                <label className="claude-mcp-form-label">{t('claude.mcpTransport')}</label>
                <div className="cs-mcp-transport-toggle">
                  <button
                    type="button"
                    className={`cs-mcp-transport-toggle-btn${mcpNewTransport === 'stdio' ? ' cs-mcp-transport-toggle-btn--active' : ''}`}
                    onClick={() => setMcpNewTransport('stdio')}
                  >
                    stdio
                  </button>
                  <button
                    type="button"
                    className={`cs-mcp-transport-toggle-btn${mcpNewTransport === 'http' ? ' cs-mcp-transport-toggle-btn--active' : ''}`}
                    onClick={() => setMcpNewTransport('http')}
                  >
                    http
                  </button>
                </div>
              </div>
              {mcpNewTransport === 'stdio' ? (
                <>
                  <div className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{t('claude.mcpServerCommand')}</label>
                    <input
                      className="claude-mcp-form-input"
                      value={mcpNewCommand}
                      onChange={e => setMcpNewCommand(e.target.value)}
                      placeholder="npx"
                    />
                  </div>
                  <div className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{t('claude.mcpServerArgs')}</label>
                    <textarea
                      className="claude-mcp-form-textarea"
                      value={mcpNewArgs}
                      onChange={e => setMcpNewArgs(e.target.value)}
                      placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/tmp"}
                      rows={3}
                    />
                  </div>
                  <div className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{t('claude.mcpServerEnv')}</label>
                    <textarea
                      className="claude-mcp-form-textarea"
                      value={mcpNewEnv}
                      onChange={e => setMcpNewEnv(e.target.value)}
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
                      value={mcpNewUrl}
                      onChange={e => setMcpNewUrl(e.target.value)}
                      placeholder="https://example.com/mcp"
                    />
                  </div>
                  <div className="claude-mcp-form-row">
                    <label className="claude-mcp-form-label">{t('claude.mcpServerHeaders')}</label>
                    <textarea
                      className="claude-mcp-form-textarea"
                      value={mcpNewHeaders}
                      onChange={e => setMcpNewHeaders(e.target.value)}
                      placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
                      rows={2}
                    />
                  </div>
                </>
              )}
              <div className="claude-mcp-form-actions">
                <button type="button" className="claude-mcp-action-btn" onClick={() => setMcpAddingNew(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="claude-mcp-add-btn"
                  disabled={!mcpNewName.trim() || (mcpNewTransport === 'stdio' ? !mcpNewCommand.trim() : !mcpNewUrl.trim())}
                >
                  {t('common.add')}
                </button>
              </div>
            </form>
          )}

          {installedCount === 0 ? (
            <div className="claude-mcp-empty">
              <div>{t('claude.mcpNoServers')}</div>
              <button className="mcp-catalog-install-btn" style={{ marginTop: 8 }} onClick={() => setView('catalog')}>
                {t('claude.mcpBrowseCatalog')}
              </button>
            </div>
          ) : (
            <div className="claude-mcp-server-list">
              {Object.entries(mcpServers).map(([name, config]) => {
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
                        <button className="claude-mcp-action-btn claude-mcp-action-btn--danger" onClick={() => handleRemoveMcpServer(name)}>
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
    </div>
  )
}
