import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import { CardSelector } from './CardSelector'
import { FeatureToggleGrid } from './FeatureToggleGrid'

interface Props {
  projectPath: string
}

interface CodexConfig {
  model: string
  approvalPolicy: string
  sandboxMode: string
  webSearch: string
  multiAgent: boolean
  historyPersistence: string
}

const DEFAULT_CONFIG: CodexConfig = {
  model: '',
  approvalPolicy: 'untrusted',
  sandboxMode: 'workspace-write',
  webSearch: 'disabled',
  multiAgent: false,
  historyPersistence: 'save-all',
}

function parseToml(content: string): CodexConfig {
  const config = { ...DEFAULT_CONFIG }
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    const rawVal = trimmed.slice(eqIdx + 1).trim()
    const val = rawVal.replace(/^["']|["']$/g, '')
    switch (key) {
      case 'model': config.model = val; break
      case 'approval_policy': config.approvalPolicy = val; break
      case 'sandbox_mode': config.sandboxMode = val; break
      default: break
    }
  }
  // Parse [features] section
  const featuresMatch = content.match(/\[features\]([\s\S]*?)(?=\n\[|$)/)
  if (featuresMatch?.[1]) {
    for (const line of featuresMatch[1].split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const key = trimmed.slice(0, eqIdx).trim()
      const rawVal = trimmed.slice(eqIdx + 1).trim()
      const val = rawVal.replace(/^["']|["']$/g, '')
      switch (key) {
        case 'web_search': config.webSearch = val; break
        case 'multi_agent': config.multiAgent = val === 'true'; break
        default: break
      }
    }
  }
  // Parse [history] section
  const historyMatch = content.match(/\[history\]([\s\S]*?)(?=\n\[|$)/)
  if (historyMatch?.[1]) {
    for (const line of historyMatch[1].split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const key = trimmed.slice(0, eqIdx).trim()
      const rawVal = trimmed.slice(eqIdx + 1).trim()
      const val = rawVal.replace(/^["']|["']$/g, '')
      if (key === 'persistence') config.historyPersistence = val
    }
  }
  return config
}

function serializeToml(config: CodexConfig): string {
  const lines: string[] = []
  if (config.model) lines.push(`model = "${config.model}"`)
  lines.push(`approval_policy = "${config.approvalPolicy}"`)
  lines.push(`sandbox_mode = "${config.sandboxMode}"`)
  lines.push('')
  lines.push('[features]')
  lines.push(`web_search = "${config.webSearch}"`)
  lines.push(`multi_agent = ${config.multiAgent}`)
  lines.push('')
  lines.push('[history]')
  lines.push(`persistence = "${config.historyPersistence}"`)
  lines.push('')
  return lines.join('\n')
}

export function CodexGeneralTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [config, setConfig] = useState<CodexConfig>(DEFAULT_CONFIG)
  const [rawContent, setRawContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const check = await window.kanbai.codexConfig.check(projectPath)
      setExists(check.exists)
      if (check.exists) {
        const result = await window.kanbai.codexConfig.read(projectPath)
        if (result.success && result.content) {
          setRawContent(result.content)
          setConfig(parseToml(result.content))
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectPath])

  useEffect(() => { loadConfig() }, [loadConfig])

  const saveConfig = useCallback(async (newConfig: CodexConfig) => {
    setConfig(newConfig)
    const toml = serializeToml(newConfig)
    setRawContent(toml)
    await window.kanbai.codexConfig.write(projectPath, toml)
    setExists(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath])

  const saveRaw = useCallback(async () => {
    await window.kanbai.codexConfig.write(projectPath, rawContent)
    setConfig(parseToml(rawContent))
    setExists(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath, rawContent])

  const handleCreateConfig = useCallback(async () => {
    await saveConfig(DEFAULT_CONFIG)
  }, [saveConfig])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  if (!exists) {
    return (
      <div className="cs-general-tab">
        <div className="cs-general-section">
          <div className="claude-rules-section">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{t('codex.noConfig')}</p>
            <button className="modal-btn modal-btn--primary" onClick={handleCreateConfig}>
              {t('codex.createConfig')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const modelOptions = [
    { value: '', label: 'Default', description: 'gpt-5.3-codex' },
    { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', description: t('codex.modelGpt53Codex') },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', description: t('codex.modelGpt52Codex') },
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max', description: t('codex.modelGpt51CodexMax') },
    { value: 'gpt-5.2', label: 'GPT-5.2', description: t('codex.modelGpt52') },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', description: t('codex.modelGpt51CodexMini') },
  ]

  const approvalOptions = [
    { value: 'untrusted', label: 'Untrusted', description: t('codex.approvalUntrusted') },
    { value: 'on-request', label: 'On-request', description: t('codex.approvalOnRequest') },
    { value: 'never', label: 'Auto', description: t('codex.approvalNever') },
  ]

  const sandboxOptions = [
    { value: 'read-only', label: 'Read-only', description: t('codex.sandboxReadOnly') },
    { value: 'workspace-write', label: 'Workspace', description: t('codex.sandboxWorkspaceWrite') },
    { value: 'danger-full-access', label: 'Full access', description: t('codex.sandboxFullAccess') },
  ]

  const features = [
    {
      key: 'webSearch',
      label: t('codex.featureWebSearch'),
      description: t('codex.featureWebSearchDesc'),
      active: config.webSearch !== 'disabled',
      onToggle: () => saveConfig({ ...config, webSearch: config.webSearch === 'disabled' ? 'live' : 'disabled' }),
    },
    {
      key: 'multiAgent',
      label: t('codex.featureMultiAgent'),
      description: t('codex.featureMultiAgentDesc'),
      active: config.multiAgent,
      onToggle: () => saveConfig({ ...config, multiAgent: !config.multiAgent }),
    },
    {
      key: 'history',
      label: t('codex.historyPersistence'),
      description: t('codex.historyPersistenceDesc'),
      active: config.historyPersistence === 'save-all',
      onToggle: () => saveConfig({ ...config, historyPersistence: config.historyPersistence === 'save-all' ? 'none' : 'save-all' }),
    },
  ]

  return (
    <div className="cs-general-tab">
      {/* Model */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.model')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.model')}
            options={modelOptions}
            value={config.model}
            onChange={(v) => saveConfig({ ...config, model: v })}
          />
        </div>
      </div>

      {/* Approval policy */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.approvalPolicy')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.approvalPolicy')}
            options={approvalOptions}
            value={config.approvalPolicy}
            onChange={(v) => saveConfig({ ...config, approvalPolicy: v })}
          />
        </div>
      </div>

      {/* Sandbox mode */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.sandboxMode')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.sandboxMode')}
            options={sandboxOptions}
            value={config.sandboxMode}
            onChange={(v) => saveConfig({ ...config, sandboxMode: v })}
          />
        </div>
      </div>

      {/* Features */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.features')}</div>
        <div className="cs-general-card cs-agent-teams">
          <FeatureToggleGrid features={features} />
        </div>
      </div>

      {/* Raw TOML editor */}
      <div className="cs-general-section">
        <div className="cs-general-section-header" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? '▼' : '▶'} {t('codex.configRaw')}
        </div>
        {showRaw && (
          <div className="cs-general-card">
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>{t('codex.configRawDesc')}</p>
            <textarea
              className="claude-md-editor"
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              rows={12}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button className="modal-btn modal-btn--primary" onClick={saveRaw}>
                {t('codex.saveConfig')}
              </button>
              {saved && <span style={{ color: 'var(--green)', fontSize: 12 }}>{t('codex.saved')}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
