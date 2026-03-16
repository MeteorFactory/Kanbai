import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { CardSelector } from '../../components/card-selector'
import { FeatureToggleGrid } from '../../components/feature-toggle-grid'

const ACCENT_COLOR = AI_PROVIDERS.codex.detectionColor

interface Props {
  projectPath: string
}

interface CodexConfig {
  model: string
  provider: string
  approvalPolicy: string
  sandboxMode: string
  webSearch: string
  multiAgent: boolean
  historyPersistence: string
  flex: boolean
  reasoning: string
  quiet: boolean
  disableProjectDoc: boolean
  personality: string
  serviceTier: string
  modelReasoningSummary: string
  fileOpener: string
  undo: boolean
  shellSnapshot: boolean
  unifiedExec: boolean
  shellTool: boolean
  commitAttribution: string
  notify: string
}

const DEFAULT_CONFIG: CodexConfig = {
  model: '',
  provider: '',
  approvalPolicy: 'untrusted',
  sandboxMode: 'workspace-write',
  webSearch: 'cached',
  multiAgent: false,
  historyPersistence: 'save-all',
  flex: false,
  reasoning: '',
  quiet: false,
  disableProjectDoc: false,
  personality: 'friendly',
  serviceTier: '',
  modelReasoningSummary: 'auto',
  fileOpener: '',
  undo: true,
  shellSnapshot: false,
  unifiedExec: false,
  shellTool: true,
  commitAttribution: '',
  notify: '',
}

function parseSectionValues(sectionContent: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of sectionContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    const rawVal = trimmed.slice(eqIdx + 1).trim()
    values[key] = rawVal.replace(/^["']|["']$/g, '')
  }
  return values
}

function parseToml(content: string): CodexConfig {
  const config = { ...DEFAULT_CONFIG }

  // Parse top-level values (before any section)
  const topLevel = content.split(/^\[/m)[0] ?? content
  const topValues = parseSectionValues(topLevel)

  if (topValues.model) config.model = topValues.model
  if (topValues.provider) config.provider = topValues.provider
  if (topValues.approval_policy) config.approvalPolicy = topValues.approval_policy
  if (topValues.sandbox_mode) config.sandboxMode = topValues.sandbox_mode
  if (topValues.flex !== undefined) config.flex = topValues.flex === 'true'
  if (topValues.model_reasoning_effort) config.reasoning = topValues.model_reasoning_effort
  if (topValues.reasoning) config.reasoning = topValues.reasoning
  if (topValues.quiet !== undefined) config.quiet = topValues.quiet === 'true'
  if (topValues.disable_project_doc !== undefined) config.disableProjectDoc = topValues.disable_project_doc === 'true'
  if (topValues.personality) config.personality = topValues.personality
  if (topValues.service_tier) config.serviceTier = topValues.service_tier
  if (topValues.model_reasoning_summary) config.modelReasoningSummary = topValues.model_reasoning_summary
  if (topValues.file_opener) config.fileOpener = topValues.file_opener
  if (topValues.commit_attribution) config.commitAttribution = topValues.commit_attribution
  if (topValues.web_search) config.webSearch = topValues.web_search

  // Parse [features] section
  const featuresMatch = content.match(/\[features\]([\s\S]*?)(?=\n\[|$)/)
  if (featuresMatch?.[1]) {
    const vals = parseSectionValues(featuresMatch[1])
    if (vals.web_search) config.webSearch = vals.web_search
    if (vals.multi_agent !== undefined) config.multiAgent = vals.multi_agent === 'true'
    if (vals.undo !== undefined) config.undo = vals.undo === 'true'
    if (vals.shell_snapshot !== undefined) config.shellSnapshot = vals.shell_snapshot === 'true'
    if (vals.unified_exec !== undefined) config.unifiedExec = vals.unified_exec === 'true'
    if (vals.shell_tool !== undefined) config.shellTool = vals.shell_tool === 'true'
  }

  // Parse [history] section
  const historyMatch = content.match(/\[history\]([\s\S]*?)(?=\n\[|$)/)
  if (historyMatch?.[1]) {
    const vals = parseSectionValues(historyMatch[1])
    if (vals.persistence) config.historyPersistence = vals.persistence
    if (vals.notify) config.notify = vals.notify
  }

  return config
}

function serializeToml(config: CodexConfig): string {
  const lines: string[] = []

  if (config.model) lines.push(`model = "${config.model}"`)
  if (config.provider) lines.push(`provider = "${config.provider}"`)
  lines.push(`approval_policy = "${config.approvalPolicy}"`)
  lines.push(`sandbox_mode = "${config.sandboxMode}"`)
  if (config.personality && config.personality !== 'friendly') lines.push(`personality = "${config.personality}"`)
  if (config.serviceTier) lines.push(`service_tier = "${config.serviceTier}"`)
  if (config.reasoning) lines.push(`model_reasoning_effort = "${config.reasoning}"`)
  if (config.modelReasoningSummary && config.modelReasoningSummary !== 'auto') lines.push(`model_reasoning_summary = "${config.modelReasoningSummary}"`)
  if (config.fileOpener) lines.push(`file_opener = "${config.fileOpener}"`)
  if (config.quiet) lines.push(`quiet = true`)
  if (config.disableProjectDoc) lines.push(`disable_project_doc = true`)
  if (config.commitAttribution) lines.push(`commit_attribution = "${config.commitAttribution}"`)

  lines.push('')
  lines.push('[features]')
  lines.push(`web_search = ${config.webSearch !== 'disabled'}`)
  lines.push(`multi_agent = ${config.multiAgent}`)
  if (!config.undo) lines.push(`undo = false`)
  if (config.shellSnapshot) lines.push(`shell_snapshot = true`)
  if (config.unifiedExec) lines.push(`unified_exec = true`)
  if (!config.shellTool) lines.push(`shell_tool = false`)
  if (config.flex) lines.push(`flex = true`)

  lines.push('')
  lines.push('[history]')
  lines.push(`persistence = "${config.historyPersistence}"`)
  if (config.notify) lines.push(`notify = ${config.notify}`)

  lines.push('')
  return lines.join('\n')
}

type ConfigScope = 'project' | 'global'

export function CodexGeneralTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [config, setConfig] = useState<CodexConfig>(DEFAULT_CONFIG)
  const [rawContent, setRawContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scope, setScope] = useState<ConfigScope>('project')

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      if (scope === 'global') {
        const check = await window.kanbai.codexConfig.checkGlobal()
        setExists(check.exists)
        if (check.exists) {
          const result = await window.kanbai.codexConfig.readGlobal()
          if (result.success && result.content) {
            setRawContent(result.content)
            setConfig(parseToml(result.content))
          }
        }
      } else {
        const check = await window.kanbai.codexConfig.check(projectPath)
        setExists(check.exists)
        if (check.exists) {
          const result = await window.kanbai.codexConfig.read(projectPath)
          if (result.success && result.content) {
            setRawContent(result.content)
            setConfig(parseToml(result.content))
          }
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectPath, scope])

  useEffect(() => { loadConfig() }, [loadConfig])

  const saveConfig = useCallback(async (newConfig: CodexConfig) => {
    setConfig(newConfig)
    const toml = serializeToml(newConfig)
    setRawContent(toml)
    if (scope === 'global') {
      await window.kanbai.codexConfig.writeGlobal(toml)
    } else {
      await window.kanbai.codexConfig.write(projectPath, toml)
    }
    setExists(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath, scope])

  const saveRaw = useCallback(async () => {
    if (scope === 'global') {
      await window.kanbai.codexConfig.writeGlobal(rawContent)
    } else {
      await window.kanbai.codexConfig.write(projectPath, rawContent)
    }
    setConfig(parseToml(rawContent))
    setExists(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [projectPath, rawContent, scope])

  const handleCreateConfig = useCallback(async () => {
    await saveConfig(DEFAULT_CONFIG)
  }, [saveConfig])

  const handleScopeChange = useCallback((newScope: ConfigScope) => {
    setScope(newScope)
    setConfig(DEFAULT_CONFIG)
    setRawContent('')
    setExists(false)
  }, [])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  const scopeSelector = (
    <div className="cs-general-section">
      <div className="cs-general-card cs-agent-teams">
        <CardSelector
          label={t('codex.configScope')}
          options={[
            { value: 'project', label: t('codex.configScopeProject'), description: t('codex.configScopeProjectDesc') },
            { value: 'global', label: t('codex.configScopeGlobal'), description: t('codex.configScopeGlobalDesc') },
          ]}
          value={scope}
          onChange={(v) => handleScopeChange(v as ConfigScope)}
          accentColor={ACCENT_COLOR}
        />
      </div>
    </div>
  )

  if (!exists) {
    return (
      <div className="cs-general-tab">
        {scopeSelector}
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
    { value: '', label: 'Default', description: 'gpt-5.4' },
    { value: 'gpt-5.4', label: 'GPT-5.4', description: t('codex.modelGpt54') },
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

  const reasoningOptions = [
    { value: '', label: 'Default', description: t('codex.reasoningDefault') },
    { value: 'xhigh', label: 'Extra high', description: t('codex.reasoningXhigh') },
    { value: 'high', label: 'High', description: t('codex.reasoningHigh') },
    { value: 'medium', label: 'Medium', description: t('codex.reasoningMedium') },
    { value: 'low', label: 'Low', description: t('codex.reasoningLow') },
    { value: 'minimal', label: 'Minimal', description: t('codex.reasoningMinimal') },
  ]

  const personalityOptions = [
    { value: 'friendly', label: 'Friendly', description: t('codex.personalityFriendly') },
    { value: 'pragmatic', label: 'Pragmatic', description: t('codex.personalityPragmatic') },
    { value: 'none', label: 'None', description: t('codex.personalityNone') },
  ]

  const webSearchOptions = [
    { value: 'cached', label: 'Cached', description: t('codex.webSearchCached') },
    { value: 'live', label: 'Live', description: t('codex.webSearchLive') },
    { value: 'disabled', label: 'Disabled', description: t('codex.webSearchDisabled') },
  ]

  const serviceTierOptions = [
    { value: '', label: 'Default', description: t('codex.serviceTierDefault') },
    { value: 'fast', label: 'Fast', description: t('codex.serviceTierFast') },
    { value: 'flex', label: 'Flex', description: t('codex.serviceTierFlex') },
  ]

  const reasoningSummaryOptions = [
    { value: 'auto', label: 'Auto', description: t('codex.reasoningSummaryAuto') },
    { value: 'concise', label: 'Concise', description: t('codex.reasoningSummaryConcise') },
    { value: 'detailed', label: 'Detailed', description: t('codex.reasoningSummaryDetailed') },
    { value: 'none', label: 'None', description: t('codex.reasoningSummaryNone') },
  ]

  const fileOpenerOptions = [
    { value: '', label: 'None', description: t('codex.fileOpenerNone') },
    { value: 'vscode', label: 'VS Code', description: t('codex.fileOpenerVscode') },
    { value: 'cursor', label: 'Cursor', description: t('codex.fileOpenerCursor') },
    { value: 'windsurf', label: 'Windsurf', description: t('codex.fileOpenerWindsurf') },
    { value: 'vscode-insiders', label: 'VS Code Insiders', description: t('codex.fileOpenerVscodeInsiders') },
  ]

  const features = [
    {
      key: 'multiAgent',
      label: t('codex.featureMultiAgent'),
      description: t('codex.featureMultiAgentDesc'),
      active: config.multiAgent,
      onToggle: () => saveConfig({ ...config, multiAgent: !config.multiAgent }),
    },
    {
      key: 'undo',
      label: t('codex.featureUndo'),
      description: t('codex.featureUndoDesc'),
      active: config.undo,
      onToggle: () => saveConfig({ ...config, undo: !config.undo }),
    },
    {
      key: 'shellTool',
      label: t('codex.featureShellTool'),
      description: t('codex.featureShellToolDesc'),
      active: config.shellTool,
      onToggle: () => saveConfig({ ...config, shellTool: !config.shellTool }),
    },
    {
      key: 'shellSnapshot',
      label: t('codex.featureShellSnapshot'),
      description: t('codex.featureShellSnapshotDesc'),
      active: config.shellSnapshot,
      onToggle: () => saveConfig({ ...config, shellSnapshot: !config.shellSnapshot }),
    },
    {
      key: 'unifiedExec',
      label: t('codex.featureUnifiedExec'),
      description: t('codex.featureUnifiedExecDesc'),
      active: config.unifiedExec,
      onToggle: () => saveConfig({ ...config, unifiedExec: !config.unifiedExec }),
    },
    {
      key: 'quiet',
      label: t('codex.featureQuiet'),
      description: t('codex.featureQuietDesc'),
      active: config.quiet,
      onToggle: () => saveConfig({ ...config, quiet: !config.quiet }),
    },
    {
      key: 'disableProjectDoc',
      label: t('codex.featureDisableProjectDoc'),
      description: t('codex.featureDisableProjectDocDesc'),
      active: config.disableProjectDoc,
      onToggle: () => saveConfig({ ...config, disableProjectDoc: !config.disableProjectDoc }),
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
      {scopeSelector}

      {/* Model */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.model')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.model')}
            options={modelOptions}
            value={config.model}
            onChange={(v) => saveConfig({ ...config, model: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Provider */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.provider')}</div>
        <div className="cs-general-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>{t('codex.providerDesc')}</p>
          <input
            type="text"
            className="claude-md-editor"
            value={config.provider}
            onChange={(e) => saveConfig({ ...config, provider: e.target.value })}
            placeholder="openai (default)"
            style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
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
            accentColor={ACCENT_COLOR}
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
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Personality */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.personality')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.personality')}
            options={personalityOptions}
            value={config.personality}
            onChange={(v) => saveConfig({ ...config, personality: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Reasoning effort */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.reasoning')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.reasoning')}
            options={reasoningOptions}
            value={config.reasoning}
            onChange={(v) => saveConfig({ ...config, reasoning: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Reasoning summary */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.reasoningSummary')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.reasoningSummary')}
            options={reasoningSummaryOptions}
            value={config.modelReasoningSummary}
            onChange={(v) => saveConfig({ ...config, modelReasoningSummary: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Web search */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.webSearch')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.webSearch')}
            options={webSearchOptions}
            value={config.webSearch}
            onChange={(v) => saveConfig({ ...config, webSearch: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Service tier */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.serviceTier')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.serviceTier')}
            options={serviceTierOptions}
            value={config.serviceTier}
            onChange={(v) => saveConfig({ ...config, serviceTier: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* File opener */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.fileOpener')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('codex.fileOpener')}
            options={fileOpenerOptions}
            value={config.fileOpener}
            onChange={(v) => saveConfig({ ...config, fileOpener: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Features */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.features')}</div>
        <div className="cs-general-card cs-agent-teams">
          <FeatureToggleGrid features={features} accentColor={ACCENT_COLOR} />
        </div>
      </div>

      {/* Commit attribution */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.commitAttribution')}</div>
        <div className="cs-general-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>{t('codex.commitAttributionDesc')}</p>
          <input
            type="text"
            className="claude-md-editor"
            value={config.commitAttribution}
            onChange={(e) => saveConfig({ ...config, commitAttribution: e.target.value })}
            placeholder={t('codex.commitAttributionPlaceholder')}
            style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Notify command */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('codex.notifyCommand')}</div>
        <div className="cs-general-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>{t('codex.notifyCommandDesc')}</p>
          <input
            type="text"
            className="claude-md-editor"
            value={config.notify}
            onChange={(e) => saveConfig({ ...config, notify: e.target.value })}
            placeholder='["python3", "/path/to/notify.py"]'
            style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
          />
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
              rows={16}
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
