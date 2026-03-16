import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { CardSelector } from '../../components/card-selector'

const ACCENT_COLOR = AI_PROVIDERS.codex.detectionColor

interface Props {
  projectPath: string
}

interface AgentRole {
  name: string
  description: string
  model: string
  reasoningEffort: string
  sandboxMode: string
}

interface AgentsConfig {
  maxThreads: number
  maxDepth: number
  jobMaxRuntimeSeconds: number
  roles: AgentRole[]
}

const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  maxThreads: 6,
  maxDepth: 1,
  jobMaxRuntimeSeconds: 1800,
  roles: [],
}

function parseAgentsConfig(content: string): AgentsConfig {
  const config = { ...DEFAULT_AGENTS_CONFIG, roles: [] as AgentRole[] }

  const agentsMatch = content.match(/\[agents\]([\s\S]*?)(?=\n\[agents\.|$)/)
  if (agentsMatch?.[1]) {
    for (const line of agentsMatch[1].split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const key = trimmed.slice(0, eqIdx).trim()
      const rawVal = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      switch (key) {
        case 'max_threads': config.maxThreads = parseInt(rawVal, 10) || 6; break
        case 'max_depth': config.maxDepth = parseInt(rawVal, 10) || 1; break
        case 'job_max_runtime_seconds': config.jobMaxRuntimeSeconds = parseInt(rawVal, 10) || 1800; break
      }
    }
  }

  const roleRegex = /\[agents\.([^\]]+)\]([\s\S]*?)(?=\n\[|$)/g
  let match
  while ((match = roleRegex.exec(content)) !== null) {
    const name = match[1] ?? ''
    const body = match[2] ?? ''
    const vals: Record<string, string> = {}
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      vals[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    }
    config.roles.push({
      name,
      description: vals['description'] ?? '',
      model: vals['model'] ?? '',
      reasoningEffort: vals['model_reasoning_effort'] ?? '',
      sandboxMode: vals['sandbox_mode'] ?? '',
    })
  }

  return config
}

function serializeAgentsConfig(config: AgentsConfig): string {
  const lines = ['[agents]']
  lines.push(`max_threads = ${config.maxThreads}`)
  lines.push(`max_depth = ${config.maxDepth}`)
  lines.push(`job_max_runtime_seconds = ${config.jobMaxRuntimeSeconds}`)
  lines.push('')

  for (const role of config.roles) {
    lines.push(`[agents.${role.name}]`)
    if (role.description) lines.push(`description = "${role.description}"`)
    if (role.model) lines.push(`model = "${role.model}"`)
    if (role.reasoningEffort) lines.push(`model_reasoning_effort = "${role.reasoningEffort}"`)
    if (role.sandboxMode) lines.push(`sandbox_mode = "${role.sandboxMode}"`)
    lines.push('')
  }
  return lines.join('\n')
}

function replaceAgentsSection(fullContent: string, newSection: string): string {
  const cleaned = fullContent
    .replace(/\n?\[agents\][\s\S]*?(?=\n\[(?!agents\.)|$)/g, '')
    .replace(/\n?\[agents\.[^\]]+\][\s\S]*?(?=\n\[(?!agents\.)|$)/g, '')
  const trimmed = cleaned.trimEnd()
  if (!newSection) return trimmed + '\n'
  return trimmed + '\n\n' + newSection + '\n'
}

export function CodexAgentsTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [config, setConfig] = useState<AgentsConfig>(DEFAULT_AGENTS_CONFIG)
  const [fullContent, setFullContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null)
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
          setConfig(parseAgentsConfig(result.content))
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const saveAgentsConfig = useCallback(async (newConfig: AgentsConfig) => {
    const section = serializeAgentsConfig(newConfig)
    const newContent = replaceAgentsSection(fullContent, section)
    await window.kanbai.codexConfig.write(projectPath, newContent)
    setFullContent(newContent)
    setConfig(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath, fullContent])

  const handleDeleteRole = useCallback(async (name: string) => {
    await saveAgentsConfig({ ...config, roles: config.roles.filter((r) => r.name !== name) })
  }, [config, saveAgentsConfig])

  const handleSaveRole = useCallback(async () => {
    if (!editingRole) return
    const existingIdx = config.roles.findIndex((r) => r.name === editingRole.name)
    const newRoles = existingIdx >= 0
      ? config.roles.map((r) => r.name === editingRole.name ? editingRole : r)
      : [...config.roles, editingRole]
    await saveAgentsConfig({ ...config, roles: newRoles })
    setEditingRole(null)
  }, [editingRole, config, saveAgentsConfig])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  if (!exists) {
    return (
      <div className="cs-general-tab">
        <div className="cs-general-section">
          <div className="claude-rules-section">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{t('codex.agentsNoConfig')}</p>
          </div>
        </div>
      </div>
    )
  }

  const sandboxOptions = [
    { value: '', label: 'Default', description: t('codex.agentsRoleSandboxDefault') },
    { value: 'read-only', label: 'Read-only', description: t('codex.sandboxReadOnly') },
    { value: 'workspace-write', label: 'Workspace', description: t('codex.sandboxWorkspaceWrite') },
  ]

  const reasoningOptions = [
    { value: '', label: 'Default', description: t('codex.reasoningDefault') },
    { value: 'high', label: 'High', description: t('codex.reasoningHigh') },
    { value: 'medium', label: 'Medium', description: t('codex.reasoningMedium') },
    { value: 'low', label: 'Low', description: t('codex.reasoningLow') },
  ]

  return (
    <div className="cs-general-tab">
      {/* Thread settings */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.agentsSettings')}</div>
        <div className="cs-toggle-desc" style={{ marginBottom: 12 }}>{t('codex.agentsSettingsDesc')}</div>
        <div className="cs-general-card">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                {t('codex.agentsMaxThreads')}
              </label>
              <input
                type="number"
                className="claude-md-editor"
                value={config.maxThreads}
                onChange={(e) => saveAgentsConfig({ ...config, maxThreads: parseInt(e.target.value, 10) || 6 })}
                min={1}
                max={20}
                style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                {t('codex.agentsMaxDepth')}
              </label>
              <input
                type="number"
                className="claude-md-editor"
                value={config.maxDepth}
                onChange={(e) => saveAgentsConfig({ ...config, maxDepth: parseInt(e.target.value, 10) || 1 })}
                min={1}
                max={5}
                style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                {t('codex.agentsMaxRuntime')}
              </label>
              <input
                type="number"
                className="claude-md-editor"
                value={config.jobMaxRuntimeSeconds}
                onChange={(e) => saveAgentsConfig({ ...config, jobMaxRuntimeSeconds: parseInt(e.target.value, 10) || 1800 })}
                min={60}
                step={60}
                style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>
        {saved && <span style={{ color: 'var(--green)', fontSize: 12, marginLeft: 4 }}>{t('codex.saved')}</span>}
      </div>

      {/* Agent roles */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.agentsRoles')}</div>
        <div className="cs-toggle-desc" style={{ marginBottom: 12 }}>{t('codex.agentsRolesDesc')}</div>

        {config.roles.map((role) => (
          <div key={role.name} className="cs-general-card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontFamily: 'monospace' }}>{role.name}</strong>
                {role.model && <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>{role.model}</span>}
                {role.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '4px 0 0 0' }}>{role.description}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="modal-btn" onClick={() => setEditingRole({ ...role })} style={{ fontSize: 11, padding: '2px 8px' }}>
                  {t('common.edit')}
                </button>
                <button className="modal-btn" onClick={() => handleDeleteRole(role.name)} style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {config.roles.length === 0 && (
          <div className="cs-toggle-desc" style={{ marginTop: 8 }}>
            {t('codex.agentsNoRoles')}
          </div>
        )}

        <button
          className="modal-btn modal-btn--primary"
          style={{ marginTop: 8 }}
          onClick={() => setEditingRole({ name: '', description: '', model: '', reasoningEffort: '', sandboxMode: '' })}
        >
          {t('codex.agentsAddRole')}
        </button>
      </div>

      {editingRole && (
        <div className="modal-overlay" onClick={() => setEditingRole(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editingRole.name ? t('codex.agentsEditRole') : t('codex.agentsAddRole')}</h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.agentsRoleName')}</label>
                <input
                  className="claude-md-editor"
                  value={editingRole.name}
                  onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
                  placeholder="explorer"
                  style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.agentsRoleDescription')}</label>
                <textarea
                  className="claude-md-editor"
                  value={editingRole.description}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  placeholder={t('codex.agentsRoleDescPlaceholder')}
                  rows={3}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('codex.agentsRoleModel')}</label>
                <input
                  className="claude-md-editor"
                  value={editingRole.model}
                  onChange={(e) => setEditingRole({ ...editingRole, model: e.target.value })}
                  placeholder="gpt-5.3-codex"
                  style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{t('codex.agentsRoleReasoning')}</label>
                <CardSelector
                  label={t('codex.reasoning')}
                  options={reasoningOptions}
                  value={editingRole.reasoningEffort}
                  onChange={(v) => setEditingRole({ ...editingRole, reasoningEffort: v })}
                  accentColor={ACCENT_COLOR}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{t('codex.agentsRoleSandbox')}</label>
                <CardSelector
                  label={t('codex.sandboxMode')}
                  options={sandboxOptions}
                  value={editingRole.sandboxMode}
                  onChange={(v) => setEditingRole({ ...editingRole, sandboxMode: v })}
                  accentColor={ACCENT_COLOR}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn" onClick={() => setEditingRole(null)}>{t('common.cancel')}</button>
              <button
                className="modal-btn modal-btn--primary"
                onClick={handleSaveRole}
                disabled={!editingRole.name}
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
