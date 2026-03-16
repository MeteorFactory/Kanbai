import { useCallback, useMemo } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../shared/types/ai-provider'
import { PermissionModeSelector } from './features/security/permission-mode-selector'
import { EffortSlider } from './features/model/effort-slider'
import { CompanyAnnouncements } from './components/company-announcements'
import { CardSelector } from './components/card-selector'
import { FeatureToggleGrid } from './components/feature-toggle-grid'
import { TokenSlider } from './features/model/token-slider'

const ACCENT_COLOR = AI_PROVIDERS.claude.detectionColor

interface Props {
  settings: Record<string, unknown>
  settingsErrors: string[]
  fixingSettings: boolean
  hooksStatus: { installed: boolean; upToDate: boolean }
  installingHooks: boolean
  removingHooks: boolean
  projectPath: string
  onFixSettings: () => void
  onInstallHooks: () => void
  onUpdateHooks: () => void
  onRemoveHooks: () => void
  onSettingsChange: (settings: Record<string, unknown>) => void
  onExportConfig: () => void
  onImportConfig: () => void
}

export function GeneralTab({
  settings,
  settingsErrors,
  fixingSettings,
  hooksStatus,
  installingHooks,
  removingHooks,
  projectPath,
  onFixSettings,
  onInstallHooks,
  onUpdateHooks,
  onRemoveHooks,
  onSettingsChange,
  onExportConfig,
  onImportConfig,
}: Props) {
  const { t } = useI18n()
  const autoMemoryEnabled = (settings.autoMemoryEnabled as boolean) ?? true

  const handleAutoMemoryToggle = useCallback(async () => {
    const next = !autoMemoryEnabled
    onSettingsChange({ ...settings, autoMemoryEnabled: next })
    await window.kanbai.claudeMemory.toggleAuto(projectPath, next)
  }, [autoMemoryEnabled, settings, projectPath, onSettingsChange])

  const permsObj = useMemo(() => {
    const p = settings.permissions
    return (typeof p === 'object' && p !== null) ? p as { defaultMode?: string; disableBypassPermissionsMode?: boolean; autoApprove?: boolean } : {}
  }, [settings.permissions])

  const permissionMode = permsObj.defaultMode ?? (settings as Record<string, unknown>)._kanbaiMode as string ?? 'default'
  const disableBypass = permsObj.disableBypassPermissionsMode ?? false
  const autoApprove = permsObj.autoApprove ?? false
  const model = (settings.model as string) ?? ''
  const effortLevel = (settings.effortLevel as 'low' | 'medium' | 'high') ?? 'high'
  const announcements = useMemo(() => (settings.companyAnnouncements as string[]) ?? [], [settings.companyAnnouncements])

  const envVars = useMemo(() => (settings.env as Record<string, string>) ?? {}, [settings.env])
  const alwaysThinking = (settings.alwaysThinkingEnabled as boolean) ?? false
  const adaptiveThinkingActive = envVars['CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING'] !== '1'
  const fastModeActive = envVars['CLAUDE_CODE_DISABLE_FAST_MODE'] !== '1'
  const promptCachingActive = envVars['DISABLE_PROMPT_CACHING'] !== '1'
  const extendedContextActive = envVars['CLAUDE_CODE_DISABLE_1M_CONTEXT'] !== '1'
  const agentTeamsActive = envVars['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1'
  const tasksActive = envVars['CLAUDE_CODE_ENABLE_TASKS'] !== 'false'
  const backgroundTasksActive = envVars['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'] !== '1'
  const maxThinkingTokens = parseInt(envVars['MAX_THINKING_TOKENS'] || '31999', 10)
  const maxOutputTokens = parseInt(envVars['CLAUDE_CODE_MAX_OUTPUT_TOKENS'] || '32000', 10)
  const teammateMode = (settings.teammateMode as string) ?? ''
  const subagentModel = envVars['CLAUDE_CODE_SUBAGENT_MODEL'] ?? ''

  const handleModeChange = useCallback((mode: string) => {
    const newSettings = { ...settings }
    delete (newSettings as Record<string, unknown>)._kanbaiMode
    newSettings.permissions = { ...permsObj, defaultMode: mode }
    onSettingsChange(newSettings)
  }, [settings, permsObj, onSettingsChange])

  const handleModelChange = useCallback((m: string) => {
    const next = { ...settings }
    if (m) next.model = m; else delete next.model
    onSettingsChange(next)
  }, [settings, onSettingsChange])

  const handleEffortChange = useCallback((level: 'low' | 'medium' | 'high') => {
    onSettingsChange({ ...settings, effortLevel: level })
  }, [settings, onSettingsChange])

  // Generic env flag toggle: set '1' to enable, delete to reset
  const setEnvFlag = useCallback((key: string, value: string | undefined) => {
    const newEnv = { ...envVars }
    if (value) newEnv[key] = value; else delete newEnv[key]
    const next = { ...settings }
    if (Object.keys(newEnv).length > 0) next.env = newEnv; else delete next.env
    onSettingsChange(next)
  }, [envVars, settings, onSettingsChange])

  const setEnvValue = useCallback((key: string, value: string) => {
    const newEnv = { ...envVars }
    if (value) newEnv[key] = value; else delete newEnv[key]
    const next = { ...settings }
    if (Object.keys(newEnv).length > 0) next.env = newEnv; else delete next.env
    onSettingsChange(next)
  }, [envVars, settings, onSettingsChange])

  const handleAutoApproveChange = useCallback(() => {
    const newPerms = { ...permsObj, autoApprove: !autoApprove }
    if (autoApprove) delete (newPerms as Record<string, unknown>).autoApprove
    onSettingsChange({ ...settings, permissions: newPerms })
  }, [settings, permsObj, autoApprove, onSettingsChange])

  const handleAlwaysThinkingChange = useCallback(() => {
    const next = { ...settings }
    if (alwaysThinking) delete next.alwaysThinkingEnabled; else next.alwaysThinkingEnabled = true
    onSettingsChange(next)
  }, [settings, alwaysThinking, onSettingsChange])

  const handleAnnouncementsChange = useCallback((items: string[]) => {
    const next = { ...settings }
    if (items.length > 0) next.companyAnnouncements = items; else delete next.companyAnnouncements
    onSettingsChange(next)
  }, [settings, onSettingsChange])

  const handleTeammateModeChange = useCallback((mode: string) => {
    const next = { ...settings }
    if (mode) next.teammateMode = mode; else delete next.teammateMode
    onSettingsChange(next)
  }, [settings, onSettingsChange])

  // --- Feature grid: Model & Perf ---
  const perfFeatures = useMemo(() => [
    { key: 'autoApprove', label: t('claude.featureAutoApprove'), description: t('claude.featureAutoApproveDesc'), active: autoApprove, onToggle: handleAutoApproveChange },
    { key: 'extendedThinking', label: t('claude.featureExtendedThinking'), description: t('claude.featureExtendedThinkingDesc'), active: alwaysThinking, onToggle: handleAlwaysThinkingChange },
    { key: 'adaptiveThinking', label: t('claude.featureAdaptiveThinking'), description: t('claude.featureAdaptiveThinkingDesc'), active: adaptiveThinkingActive, onToggle: () => setEnvFlag('CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING', adaptiveThinkingActive ? '1' : undefined) },
    { key: 'fastMode', label: t('claude.featureFastMode'), description: t('claude.featureFastModeDesc'), active: fastModeActive, onToggle: () => setEnvFlag('CLAUDE_CODE_DISABLE_FAST_MODE', fastModeActive ? '1' : undefined) },
    { key: 'promptCaching', label: t('claude.featurePromptCaching'), description: t('claude.featurePromptCachingDesc'), active: promptCachingActive, onToggle: () => setEnvFlag('DISABLE_PROMPT_CACHING', promptCachingActive ? '1' : undefined) },
    { key: 'extendedContext', label: t('claude.featureExtendedContext'), description: t('claude.featureExtendedContextDesc'), active: extendedContextActive, onToggle: () => setEnvFlag('CLAUDE_CODE_DISABLE_1M_CONTEXT', extendedContextActive ? '1' : undefined) },
    { key: 'autoMemory', label: t('claude.autoMemory'), description: t('claude.autoMemoryDesc'), active: autoMemoryEnabled, onToggle: handleAutoMemoryToggle },
  ], [t, autoApprove, alwaysThinking, adaptiveThinkingActive, fastModeActive, promptCachingActive, extendedContextActive, autoMemoryEnabled, handleAutoApproveChange, handleAlwaysThinkingChange, handleAutoMemoryToggle, setEnvFlag])

  // --- Feature grid: Agent Teams ---
  const agentFeatures = useMemo(() => [
    { key: 'agentTeams', label: t('claude.featureAgentTeams'), description: t('claude.featureAgentTeamsDesc'), active: agentTeamsActive, onToggle: () => setEnvFlag('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', agentTeamsActive ? undefined : '1') },
    { key: 'taskList', label: t('claude.featureTaskList'), description: t('claude.featureTaskListDesc'), active: tasksActive, onToggle: () => setEnvFlag('CLAUDE_CODE_ENABLE_TASKS', tasksActive ? 'false' : undefined) },
    { key: 'backgroundTasks', label: t('claude.featureBackgroundTasks'), description: t('claude.featureBackgroundTasksDesc'), active: backgroundTasksActive, onToggle: () => setEnvFlag('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', backgroundTasksActive ? '1' : undefined) },
  ], [t, agentTeamsActive, tasksActive, backgroundTasksActive, setEnvFlag])

  const teammateModeOptions = [
    { value: '', label: 'Default', description: t('claude.teammateFull') },
    { value: 'compact', label: 'Compact', description: t('claude.teammateCompact') },
    { value: 'hidden', label: 'Hidden', description: t('claude.teammateHidden') },
  ]

  const subagentModelOptions = [
    { value: '', label: 'Inherit', description: t('claude.subagentInherit') },
    { value: 'claude-sonnet-4-6', label: 'Sonnet', description: t('claude.subagentSonnet') },
    { value: 'claude-opus-4-6', label: 'Opus', description: t('claude.subagentOpus') },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku', description: t('claude.subagentHaiku') },
  ]

  const modelOptions = [
    { value: '', label: 'Default', description: t('claude.modelDefault') },
    { value: 'sonnet', label: 'Sonnet', description: t('claude.modelSonnetDesc') },
    { value: 'opus', label: 'Opus', description: t('claude.modelOpusDesc') },
    { value: 'haiku', label: 'Haiku', description: t('claude.modelHaikuDesc') },
    { value: 'sonnet[1m]', label: 'Sonnet 1M', description: t('claude.modelSonnet1mDesc') },
  ]

  return (
    <div className="cs-general-tab">
      {/* Error banner */}
      {settingsErrors.length > 0 && (
        <div className="claude-settings-error-banner">
          <div className="claude-settings-error-icon">&#x26A0;</div>
          <div className="claude-settings-error-body">
            <div className="claude-settings-error-title">{t('claude.settingsError')}</div>
            {settingsErrors.map((err, i) => (
              <div key={i} className="claude-settings-error-detail">{err}</div>
            ))}
          </div>
          <button className="claude-settings-fix-btn" onClick={onFixSettings} disabled={fixingSettings}>
            {fixingSettings ? t('common.loading') : t('claude.fixSettings')}
          </button>
        </div>
      )}

      {/* Activity hooks */}
      <div className="cs-general-section">
        <div className="claude-rules-section claude-hooks-section">
          <div className="claude-hooks-row">
            <div className="claude-hooks-info">
              <label className="claude-rules-label">{t('claude.activityHooks')}</label>
              <span className="claude-hooks-desc">{t('claude.activityHooksDesc')}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!hooksStatus.installed && (
                <button className="claude-hooks-btn" onClick={onInstallHooks} disabled={installingHooks}>
                  {installingHooks ? t('common.loading') : t('claude.installHooks')}
                </button>
              )}
              {hooksStatus.installed && !hooksStatus.upToDate && (
                <button className="claude-hooks-btn claude-hooks-btn--warning" onClick={onUpdateHooks} disabled={installingHooks}>
                  {t('claude.updateHooks')}
                </button>
              )}
              {hooksStatus.installed && (
                <button className="claude-hooks-btn--danger-outline" onClick={onRemoveHooks} disabled={removingHooks}>
                  {removingHooks ? t('common.loading') : t('claude.removeHooks')}
                </button>
              )}
              {hooksStatus.installed && hooksStatus.upToDate && (
                <span className="claude-hooks-btn claude-hooks-btn--success" style={{ cursor: 'default' }}>
                  {t('claude.hooksInstalled')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Company announcements */}
      <div className="cs-general-section">
        <div className="cs-announcements-featured">
          <CompanyAnnouncements announcements={announcements} onChange={handleAnnouncementsChange} />
        </div>
      </div>

      {/* Import / Export */}
      <div className="cs-general-section">
        <div className="cs-import-export-row">
          <button className="modal-btn modal-btn--secondary" onClick={onImportConfig}>
            {t('claude.importConfig')}
          </button>
          <button className="modal-btn modal-btn--secondary" onClick={onExportConfig}>
            {t('claude.exportConfig')}
          </button>
        </div>
      </div>

      {/* Permission mode */}
      <div className="cs-general-section">
        <PermissionModeSelector value={permissionMode} onChange={handleModeChange} disableBypass={disableBypass} />
      </div>

      {/* Model & Perf */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('claude.modelTab')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('claude.modelSelection')}
            options={modelOptions}
            value={model}
            onChange={handleModelChange}
            accentColor={ACCENT_COLOR}
          />
          <EffortSlider value={effortLevel} onChange={handleEffortChange} />
          <FeatureToggleGrid features={perfFeatures} accentColor={ACCENT_COLOR} />
          <TokenSlider
            label={t('claude.thinkingBudget')}
            description={t('claude.thinkingBudgetDesc')}
            value={maxThinkingTokens}
            min={0}
            max={128000}
            step={1000}
            defaultValue={31999}
            onChange={(v) => setEnvValue('MAX_THINKING_TOKENS', v === 31999 ? '' : String(v))}
          />
          <TokenSlider
            label={t('claude.outputLimit')}
            description={t('claude.outputLimitDesc')}
            value={maxOutputTokens}
            min={1000}
            max={64000}
            step={1000}
            defaultValue={32000}
            onChange={(v) => setEnvValue('CLAUDE_CODE_MAX_OUTPUT_TOKENS', v === 32000 ? '' : String(v))}
          />
        </div>
      </div>

      {/* Agent Teams */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('claude.agentTeams')}</div>
        <div className="cs-general-card cs-agent-teams">
          <FeatureToggleGrid features={agentFeatures} accentColor={ACCENT_COLOR} />
          <CardSelector
            label={t('claude.teammateMode')}
            options={teammateModeOptions}
            value={teammateMode}
            onChange={handleTeammateModeChange}
            accentColor={ACCENT_COLOR}
          />
          <CardSelector
            label={t('claude.subagentModelDefault')}
            options={subagentModelOptions}
            value={subagentModel}
            onChange={(v) => setEnvValue('CLAUDE_CODE_SUBAGENT_MODEL', v)}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

    </div>
  )
}
