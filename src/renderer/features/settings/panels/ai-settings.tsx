import type { AppSettings, AiDefaults } from '../../../../shared/types'
import type { AiProviderId } from '../../../../shared/types/ai-provider'
import { AI_PROVIDERS } from '../../../../shared/types/ai-provider'
import { useI18n } from '../../../lib/i18n'
import { useWorkspaceStore } from '../../workspace/workspace-store'
import { useAiDefaults } from '../hooks/use-ai-defaults'

interface AiSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function AiSettings({ settings, updateSetting }: AiSettingsProps) {
  const { t } = useI18n()
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)
  const projects = useWorkspaceStore((s) => s.projects)
  const activeProjectName = projects.find((p) => p.id === activeProjectId)?.name ?? ''

  const {
    aiGlobalDefaults,
    setAiGlobalDefaults,
    aiProjectDefaults,
    setAiProjectDefaults,
    aiProjectLoading,
  } = useAiDefaults(activeProjectId)

  const aiProviderEntries = [
    { key: 'kanban' as const, label: t('settings.aiKanbanProvider'), hint: t('settings.aiKanbanProviderHint') },
    { key: 'packages' as const, label: t('settings.aiPackagesProvider'), hint: t('settings.aiPackagesProviderHint') },
    { key: 'database' as const, label: t('settings.aiDatabaseProvider'), hint: t('settings.aiDatabaseProviderHint') },
  ]

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.detectionColor')}</label>
            <span className="settings-hint">{t('settings.claudeColorHint')}</span>
          </div>
          <input
            type="color"
            value={settings.claudeDetectionColor}
            onChange={(e) => updateSetting('claudeDetectionColor', e.target.value)}
            className="settings-color-input"
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.codexColor')}</label>
            <span className="settings-hint">{t('settings.codexColorHint')}</span>
          </div>
          <input
            type="color"
            value={settings.codexDetectionColor}
            onChange={(e) => updateSetting('codexDetectionColor', e.target.value)}
            className="settings-color-input"
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.copilotColor')}</label>
            <span className="settings-hint">{t('settings.copilotColorHint')}</span>
          </div>
          <input
            type="color"
            value={settings.copilotDetectionColor}
            onChange={(e) => updateSetting('copilotDetectionColor', e.target.value)}
            className="settings-color-input"
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.geminiColor')}</label>
            <span className="settings-hint">{t('settings.geminiColorHint')}</span>
          </div>
          <input
            type="color"
            value={settings.geminiDetectionColor}
            onChange={(e) => updateSetting('geminiDetectionColor', e.target.value)}
            className="settings-color-input"
          />
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.autoClaude')}</label>
            <span className="settings-hint">{t('settings.autoClaudeHint')}</span>
          </div>
          <button
            className={`settings-toggle${settings.autoClauderEnabled ? ' settings-toggle--active' : ''}`}
            onClick={() => updateSetting('autoClauderEnabled', !settings.autoClauderEnabled)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.autoApprove')}</label>
            <span className="settings-hint">{t('settings.autoApproveHint')}</span>
          </div>
          <button
            className={`settings-toggle${settings.autoApprove ? ' settings-toggle--active' : ''}`}
            onClick={() => updateSetting('autoApprove', !settings.autoApprove)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      {/* Global AI defaults */}
      <h4 className="settings-section-subtitle" style={{ marginTop: 24 }}>{t('settings.aiDefaultConfig')}</h4>
      <p className="settings-section-hint">{t('settings.aiDefaultConfigHint')}</p>
      {aiGlobalDefaults && (
        <div className="settings-card">
          {aiProviderEntries.map(({ key, label, hint }) => (
            <div key={key} className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{label}</label>
                <span className="settings-hint">{hint}</span>
              </div>
              <div className="ai-defaults-btns">
                {(Object.keys(AI_PROVIDERS) as AiProviderId[]).map((id) => (
                  <button
                    key={id}
                    className={`ai-defaults-btn${aiGlobalDefaults[key] === id ? ' ai-defaults-btn--active' : ''}`}
                    style={
                      aiGlobalDefaults[key] === id
                        ? { backgroundColor: AI_PROVIDERS[id].detectionColor, borderColor: AI_PROVIDERS[id].detectionColor, color: '#fff' }
                        : undefined
                    }
                    onClick={async () => {
                      const modelDefaults: Partial<AiDefaults> = key === 'packages'
                        ? { packagesModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                        : key === 'database'
                          ? { databaseModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                          : {}
                      const updated = await window.kanbai.aiDefaults.setGlobal({ [key]: id, ...modelDefaults })
                      setAiGlobalDefaults(updated)
                    }}
                  >
                    {AI_PROVIDERS[id].displayName}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project-specific AI defaults */}
      <h4 className="settings-section-subtitle" style={{ marginTop: 24 }}>
        {t('settings.aiProjectConfig')}
        {activeProjectName && <span className="settings-section-subtitle-badge">{activeProjectName}</span>}
      </h4>
      <p className="settings-section-hint">{t('settings.aiProjectConfigHint')}</p>
      {!activeProjectId && (
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-hint">{t('settings.aiNoProject')}</span>
          </div>
        </div>
      )}
      {activeProjectId && aiProjectLoading && (
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-hint">{t('common.loading')}</span>
          </div>
        </div>
      )}
      {activeProjectId && aiProjectDefaults && !aiProjectLoading && (
        <div className="settings-card">
          {aiProviderEntries.map(({ key, label, hint }) => (
            <div key={key} className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{label}</label>
                <span className="settings-hint">{hint}</span>
              </div>
              <div className="ai-defaults-btns">
                {(Object.keys(AI_PROVIDERS) as AiProviderId[]).map((id) => (
                  <button
                    key={id}
                    className={`ai-defaults-btn${aiProjectDefaults[key] === id ? ' ai-defaults-btn--active' : ''}`}
                    style={
                      aiProjectDefaults[key] === id
                        ? { backgroundColor: AI_PROVIDERS[id].detectionColor, borderColor: AI_PROVIDERS[id].detectionColor, color: '#fff' }
                        : undefined
                    }
                    onClick={async () => {
                      const modelDefaults: Partial<AiDefaults> = key === 'packages'
                        ? { packagesModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                        : key === 'database'
                          ? { databaseModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                          : {}
                      const next: AiDefaults = { ...aiProjectDefaults, [key]: id, ...modelDefaults }
                      await window.kanbai.aiDefaults.set(activeProjectId, next as unknown as Record<string, unknown>)
                      setAiProjectDefaults(next)
                      const { projects: currentProjects } = useWorkspaceStore.getState()
                      const updatedProjects = currentProjects.map((p) =>
                        p.id === activeProjectId ? { ...p, aiDefaults: next } : p,
                      )
                      useWorkspaceStore.setState({ projects: updatedProjects })
                    }}
                  >
                    {AI_PROVIDERS[id].displayName}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="settings-row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button
              className="settings-btn"
              onClick={async () => {
                if (!confirm(t('settings.aiResetConfirm'))) return
                const globalDefaults = await window.kanbai.aiDefaults.getGlobal()
                await window.kanbai.aiDefaults.set(activeProjectId, globalDefaults as unknown as Record<string, unknown>)
                setAiProjectDefaults(globalDefaults)
                const { projects: currentProjects } = useWorkspaceStore.getState()
                const updatedProjects = currentProjects.map((p) =>
                  p.id === activeProjectId ? { ...p, aiDefaults: globalDefaults } : p,
                )
                useWorkspaceStore.setState({ projects: updatedProjects })
              }}
            >
              {t('settings.aiResetToDefaults')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
