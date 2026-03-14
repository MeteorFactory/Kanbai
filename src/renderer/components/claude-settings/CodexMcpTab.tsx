import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'

const ACCENT_COLOR = AI_PROVIDERS.codex.detectionColor

interface Props {
  projectPath: string
}

interface McpServer {
  name: string
  type: 'stdio' | 'http'
  command: string
  args: string
  url: string
  enabled: boolean
  required: boolean
  startupTimeout: number
  toolTimeout: number
  enabledTools: string
  disabledTools: string
  env: string
}

const EMPTY_SERVER: Omit<McpServer, 'name'> = {
  type: 'stdio',
  command: '',
  args: '',
  url: '',
  enabled: true,
  required: false,
  startupTimeout: 10,
  toolTimeout: 60,
  enabledTools: '',
  disabledTools: '',
  env: '',
}

function parseMcpServers(content: string): McpServer[] {
  const servers: McpServer[] = []
  const sectionRegex = /\[mcp_servers\.([^\]]+)\]([\s\S]*?)(?=\n\[|$)/g
  let match
  while ((match = sectionRegex.exec(content)) !== null) {
    const name = match[1] ?? ''
    const body = match[2] ?? ''
    const vals: Record<string, string> = {}
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      vals[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    }
    servers.push({
      name,
      type: vals['url'] ? 'http' : 'stdio',
      command: vals['command'] ?? '',
      args: vals['args'] ?? '',
      url: vals['url'] ?? '',
      enabled: vals['enabled'] !== 'false',
      required: vals['required'] === 'true',
      startupTimeout: parseInt(vals['startup_timeout_sec'] ?? '10', 10) || 10,
      toolTimeout: parseInt(vals['tool_timeout_sec'] ?? '60', 10) || 60,
      enabledTools: vals['enabled_tools'] ?? '',
      disabledTools: vals['disabled_tools'] ?? '',
      env: vals['env'] ? JSON.stringify(JSON.parse(vals['env'].replace(/'/g, '"')), null, 2) : '',
    })
  }
  return servers
}

function serializeMcpServers(servers: McpServer[]): string {
  return servers.map((s) => {
    const lines = [`[mcp_servers.${s.name}]`]
    if (s.type === 'stdio') {
      lines.push(`command = "${s.command}"`)
      if (s.args) lines.push(`args = ${s.args}`)
    } else {
      lines.push(`url = "${s.url}"`)
    }
    if (!s.enabled) lines.push(`enabled = false`)
    if (s.required) lines.push(`required = true`)
    if (s.startupTimeout !== 10) lines.push(`startup_timeout_sec = ${s.startupTimeout}`)
    if (s.toolTimeout !== 60) lines.push(`tool_timeout_sec = ${s.toolTimeout}`)
    if (s.enabledTools) lines.push(`enabled_tools = ${s.enabledTools}`)
    if (s.disabledTools) lines.push(`disabled_tools = ${s.disabledTools}`)
    if (s.env) {
      try {
        const parsed = JSON.parse(s.env)
        const tomlEntries = Object.entries(parsed).map(([k, v]) => `${k} = "${v}"`).join(', ')
        lines.push(`env = { ${tomlEntries} }`)
      } catch { /* invalid JSON, skip */ }
    }
    return lines.join('\n')
  }).join('\n\n')
}

function replaceConfigSection(fullContent: string, newMcpSection: string): string {
  const cleaned = fullContent.replace(/\n?\[mcp_servers\.[^\]]+\][\s\S]*?(?=\n\[(?!mcp_servers)|$)/g, '')
  const trimmed = cleaned.trimEnd()
  if (!newMcpSection) return trimmed + '\n'
  return trimmed + '\n\n' + newMcpSection + '\n'
}

export function CodexMcpTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServer[]>([])
  const [fullContent, setFullContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<McpServer | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const check = await window.kanbai.codexConfig.check(projectPath)
      setExists(check.exists)
      if (check.exists) {
        const result = await window.kanbai.codexConfig.read(projectPath)
        if (result.success && result.content) {
          setFullContent(result.content)
          setServers(parseMcpServers(result.content))
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const saveServers = useCallback(async (newServers: McpServer[]) => {
    const mcpToml = serializeMcpServers(newServers)
    const newContent = replaceConfigSection(fullContent, mcpToml)
    await window.kanbai.codexConfig.write(projectPath, newContent)
    setFullContent(newContent)
    setServers(newServers)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath, fullContent])

  const handleDelete = useCallback(async (name: string) => {
    await saveServers(servers.filter((s) => s.name !== name))
  }, [servers, saveServers])

  const handleToggle = useCallback(async (name: string) => {
    await saveServers(servers.map((s) => s.name === name ? { ...s, enabled: !s.enabled } : s))
  }, [servers, saveServers])

  const handleSaveEdit = useCallback(async () => {
    if (!editing) return
    const existing = servers.findIndex((s) => s.name === editing.name)
    const newServers = existing >= 0
      ? servers.map((s) => s.name === editing.name ? editing : s)
      : [...servers, editing]
    await saveServers(newServers)
    setEditing(null)
  }, [editing, servers, saveServers])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  if (!exists) {
    return (
      <div className="cs-general-tab">
        <div className="cs-general-section">
          <div className="claude-rules-section">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{t('codex.mcpNoConfig')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cs-general-tab">
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.mcpTitle')}</div>
        <div className="cs-toggle-desc" style={{ marginBottom: 12 }}>{t('codex.mcpDesc')}</div>

        {servers.map((server) => (
          <div key={server.name} className="cs-general-card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontFamily: 'monospace' }}>{server.name}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>
                  {server.type === 'stdio' ? server.command : server.url}
                </span>
                {server.required && (
                  <span style={{ color: ACCENT_COLOR, fontSize: 11, marginLeft: 8 }}>required</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  className="cs-toggle-btn"
                  style={{ background: server.enabled ? ACCENT_COLOR : 'var(--bg-tertiary)', width: 36, height: 20, borderRadius: 10, position: 'relative', border: 'none', cursor: 'pointer' }}
                  onClick={() => handleToggle(server.name)}
                >
                  <span style={{ position: 'absolute', top: 2, left: server.enabled ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: 'white', transition: 'left 0.2s' }} />
                </button>
                <button className="modal-btn" onClick={() => setEditing({ ...server })} style={{ fontSize: 11, padding: '2px 8px' }}>
                  {t('common.edit')}
                </button>
                <button className="modal-btn" onClick={() => handleDelete(server.name)} style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {servers.length === 0 && (
          <div className="cs-toggle-desc" style={{ marginTop: 8 }}>
            {t('codex.mcpNoServers')}
          </div>
        )}

        <button
          className="modal-btn modal-btn--primary"
          style={{ marginTop: 8 }}
          onClick={() => setEditing({ name: '', ...EMPTY_SERVER })}
        >
          {t('codex.mcpAddServer')}
        </button>
        {saved && <span style={{ color: 'var(--green)', fontSize: 12, marginLeft: 8 }}>{t('codex.saved')}</span>}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editing.name ? t('codex.mcpEditServer') : t('codex.mcpAddServer')}</h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpServerName')}</label>
                <input
                  className="claude-md-editor"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
                  placeholder="my-server"
                  style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpServerType')}</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {(['stdio', 'http'] as const).map((type) => (
                    <button
                      key={type}
                      className="modal-btn"
                      style={{ background: editing.type === type ? ACCENT_COLOR : undefined, color: editing.type === type ? 'white' : undefined }}
                      onClick={() => setEditing({ ...editing, type })}
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {editing.type === 'stdio' ? (
                <>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpCommand')}</label>
                    <input
                      className="claude-md-editor"
                      value={editing.command}
                      onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                      placeholder="npx"
                      style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpArgs')}</label>
                    <input
                      className="claude-md-editor"
                      value={editing.args}
                      onChange={(e) => setEditing({ ...editing, args: e.target.value })}
                      placeholder='["@modelcontextprotocol/server-example"]'
                      style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpUrl')}</label>
                  <input
                    className="claude-md-editor"
                    value={editing.url}
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                    placeholder="https://example.com/mcp"
                    style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpEnv')}</label>
                <textarea
                  className="claude-md-editor"
                  value={editing.env}
                  onChange={(e) => setEditing({ ...editing, env: e.target.value })}
                  placeholder='{ "API_KEY": "..." }'
                  rows={3}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpStartupTimeout')}</label>
                  <input
                    type="number"
                    className="claude-md-editor"
                    value={editing.startupTimeout}
                    onChange={(e) => setEditing({ ...editing, startupTimeout: parseInt(e.target.value, 10) || 10 })}
                    style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpToolTimeout')}</label>
                  <input
                    type="number"
                    className="claude-md-editor"
                    value={editing.toolTimeout}
                    onChange={(e) => setEditing({ ...editing, toolTimeout: parseInt(e.target.value, 10) || 60 })}
                    style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={editing.required} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} />
                  {t('codex.mcpRequired')}
                </label>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpEnabledTools')}</label>
                <input
                  className="claude-md-editor"
                  value={editing.enabledTools}
                  onChange={(e) => setEditing({ ...editing, enabledTools: e.target.value })}
                  placeholder='["tool1", "tool2"]'
                  style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.mcpDisabledTools')}</label>
                <input
                  className="claude-md-editor"
                  value={editing.disabledTools}
                  onChange={(e) => setEditing({ ...editing, disabledTools: e.target.value })}
                  placeholder='["tool3"]'
                  style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button
                className="modal-btn modal-btn--primary"
                onClick={handleSaveEdit}
                disabled={!editing.name || (editing.type === 'stdio' ? !editing.command : !editing.url)}
              >
                {t('codex.saveConfig')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
