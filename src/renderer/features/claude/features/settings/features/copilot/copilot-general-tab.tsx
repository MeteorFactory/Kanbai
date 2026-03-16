import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { CardSelector } from '../../components/card-selector'
import { FeatureToggleGrid } from '../../components/feature-toggle-grid'

const ACCENT_COLOR = AI_PROVIDERS.copilot.detectionColor

interface Props {
  projectPath: string
}

interface CopilotConfig {
  model: string
  approval_mode: string
  features: {
    web_search: boolean
    plan_mode: boolean
    delegation: boolean
  }
}

const DEFAULT_CONFIG: CopilotConfig = {
  model: '',
  approval_mode: 'suggest',
  features: {
    web_search: true,
    plan_mode: true,
    delegation: false,
  },
}

function parseConfig(content: string): CopilotConfig {
  const config: CopilotConfig = {
    ...DEFAULT_CONFIG,
    features: { ...DEFAULT_CONFIG.features },
  }
  try {
    const parsed = JSON.parse(content)
    // Migrate legacy {provider, model} format
    if (parsed.model) config.model = parsed.model
    if (parsed.approval_mode) config.approval_mode = parsed.approval_mode
    if (parsed.features) {
      if (typeof parsed.features.web_search === 'boolean') config.features.web_search = parsed.features.web_search
      if (typeof parsed.features.plan_mode === 'boolean') config.features.plan_mode = parsed.features.plan_mode
      if (typeof parsed.features.delegation === 'boolean') config.features.delegation = parsed.features.delegation
    }
  } catch { /* ignore corrupt JSON */ }
  return config
}

function serializeConfig(config: CopilotConfig): string {
  const obj: Record<string, unknown> = {}
  if (config.model) obj.model = config.model
  obj.approval_mode = config.approval_mode
  obj.features = { ...config.features }
  return JSON.stringify(obj, null, 2)
}

export function CopilotGeneralTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [config, setConfig] = useState<CopilotConfig>(DEFAULT_CONFIG)
  const [rawContent, setRawContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const check = await window.kanbai.copilotConfig.check(projectPath)
      setExists(check.exists)
      if (check.exists) {
        const result = await window.kanbai.copilotConfig.read(projectPath)
        if (result.success && result.content) {
          setRawContent(result.content)
          setConfig(parseConfig(result.content))
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectPath])

  useEffect(() => { loadConfig() }, [loadConfig])

  const saveConfig = useCallback(async (newConfig: CopilotConfig) => {
    setConfig(newConfig)
    const json = serializeConfig(newConfig)
    setRawContent(json)
    await window.kanbai.copilotConfig.write(projectPath, json)
    setExists(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath])

  const saveRaw = useCallback(async () => {
    await window.kanbai.copilotConfig.write(projectPath, rawContent)
    setConfig(parseConfig(rawContent))
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
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{t('copilot.noConfig')}</p>
            <button className="modal-btn modal-btn--primary" onClick={handleCreateConfig}>
              {t('copilot.createConfig')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const modelOptions = [
    { value: '', label: 'Default', description: t('copilot.modelDefault') },
    { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', description: t('copilot.modelSonnet') },
    { value: 'claude-opus-4.5', label: 'Claude Opus 4.5', description: t('copilot.modelOpus') },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', description: t('copilot.modelGpt52Codex') },
    { value: 'o4-mini', label: 'o4-mini', description: t('copilot.modelO4Mini') },
  ]

  const approvalOptions = [
    { value: 'suggest', label: 'Suggest', description: t('copilot.approvalSuggest') },
    { value: 'auto-edit', label: 'Auto-edit', description: t('copilot.approvalAutoEdit') },
    { value: 'full-auto', label: 'Full auto', description: t('copilot.approvalFullAuto') },
  ]

  const features = [
    {
      key: 'webSearch',
      label: t('copilot.featureWebSearch'),
      description: t('copilot.featureWebSearchDesc'),
      active: config.features.web_search,
      onToggle: () => saveConfig({ ...config, features: { ...config.features, web_search: !config.features.web_search } }),
    },
    {
      key: 'planMode',
      label: t('copilot.featurePlanMode'),
      description: t('copilot.featurePlanModeDesc'),
      active: config.features.plan_mode,
      onToggle: () => saveConfig({ ...config, features: { ...config.features, plan_mode: !config.features.plan_mode } }),
    },
    {
      key: 'delegation',
      label: t('copilot.featureDelegation'),
      description: t('copilot.featureDelegationDesc'),
      active: config.features.delegation,
      onToggle: () => saveConfig({ ...config, features: { ...config.features, delegation: !config.features.delegation } }),
    },
  ]

  return (
    <div className="cs-general-tab">
      {/* Model */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('copilot.model')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('copilot.model')}
            options={modelOptions}
            value={config.model}
            onChange={(v) => saveConfig({ ...config, model: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Approval mode */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('copilot.approvalMode')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('copilot.approvalMode')}
            options={approvalOptions}
            value={config.approval_mode}
            onChange={(v) => saveConfig({ ...config, approval_mode: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Features */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('copilot.features')}</div>
        <div className="cs-general-card cs-agent-teams">
          <FeatureToggleGrid features={features} accentColor={ACCENT_COLOR} />
        </div>
      </div>

      {/* Raw JSON editor */}
      <div className="cs-general-section">
        <div className="cs-general-section-header" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? '▼' : '▶'} {t('copilot.configRaw')}
        </div>
        {showRaw && (
          <div className="cs-general-card">
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>{t('copilot.configRawDesc')}</p>
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
                {t('copilot.saveConfig')}
              </button>
              {saved && <span style={{ color: 'var(--green)', fontSize: 12 }}>{t('copilot.saved')}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
