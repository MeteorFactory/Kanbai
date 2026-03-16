import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { CardSelector } from '../../components/card-selector'
import { FeatureToggleGrid } from '../../components/feature-toggle-grid'
import type { GeminiFullConfig } from './use-gemini-config'

interface Props {
  config: GeminiFullConfig
  onUpdate: (patch: Partial<GeminiFullConfig>) => Promise<void>
}

const ACCENT_COLOR = AI_PROVIDERS.gemini.detectionColor

export function GeminiGeneralTab({ config, onUpdate }: Props) {
  const { t } = useI18n()

  const modelOptions = [
    { value: '', label: 'Default', description: t('gemini.modelDefault') },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: t('gemini.model25Pro') },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: t('gemini.model25Flash') },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', description: t('gemini.model25FlashLite') },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', description: t('gemini.model3Pro') },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', description: t('gemini.model3Flash') },
  ]

  const approvalOptions = [
    { value: 'default', label: 'Default', description: t('gemini.approvalDefault') },
    { value: 'auto_edit', label: 'Auto-edit', description: t('gemini.approvalAutoEdit') },
    { value: 'plan', label: 'Plan', description: t('gemini.approvalPlan') },
  ]

  const overageOptions = [
    { value: 'ask', label: 'Ask', description: t('gemini.overageAsk') },
    { value: 'always', label: 'Always', description: t('gemini.overageAlways') },
    { value: 'never', label: 'Never', description: t('gemini.overageNever') },
  ]

  const outputOptions = [
    { value: 'text', label: 'Text', description: t('gemini.outputText') },
    { value: 'json', label: 'JSON', description: t('gemini.outputJson') },
  ]

  const generalFeatures = [
    {
      key: 'vimMode',
      label: t('gemini.featureVimMode'),
      description: t('gemini.featureVimModeDesc'),
      active: config.general?.vimMode ?? false,
      onToggle: () => onUpdate({ general: { ...config.general, vimMode: !(config.general?.vimMode ?? false) } }),
    },
    {
      key: 'autoUpdate',
      label: t('gemini.featureAutoUpdate'),
      description: t('gemini.featureAutoUpdateDesc'),
      active: config.general?.enableAutoUpdate ?? true,
      onToggle: () => onUpdate({ general: { ...config.general, enableAutoUpdate: !(config.general?.enableAutoUpdate ?? true) } }),
    },
    {
      key: 'notifications',
      label: t('gemini.featureNotifications'),
      description: t('gemini.featureNotificationsDesc'),
      active: config.general?.enableNotifications ?? false,
      onToggle: () => onUpdate({ general: { ...config.general, enableNotifications: !(config.general?.enableNotifications ?? false) } }),
    },
    {
      key: 'debugKeystroke',
      label: t('gemini.featureDebugKeystroke'),
      description: t('gemini.featureDebugKeystrokeDesc'),
      active: config.general?.debugKeystrokeLogging ?? false,
      onToggle: () => onUpdate({ general: { ...config.general, debugKeystrokeLogging: !(config.general?.debugKeystrokeLogging ?? false) } }),
    },
    {
      key: 'ide',
      label: t('gemini.featureIde'),
      description: t('gemini.featureIdeDesc'),
      active: config.ide?.enabled ?? false,
      onToggle: () => onUpdate({ ide: { enabled: !(config.ide?.enabled ?? false) } }),
    },
  ]

  return (
    <div className="cs-general-tab">
      {/* Model */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.model')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.model')}
            options={modelOptions}
            value={config.model?.name ?? ''}
            onChange={(v) => onUpdate({ model: { ...config.model, name: v } })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Model advanced */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.modelAdvanced')}</div>
        <div className="cs-general-card">
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.maxSessionTurns')}</span>
              <span className="cs-toggle-desc">{t('gemini.maxSessionTurnsDesc')}</span>
            </div>
            <input
              type="number"
              className="cs-input-number"
              value={config.model?.maxSessionTurns ?? -1}
              min={-1}
              onChange={(e) => onUpdate({ model: { ...config.model, maxSessionTurns: parseInt(e.target.value) || -1 } })}
              style={{ width: 80, textAlign: 'center' }}
            />
          </div>
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.compressionThreshold')}</span>
              <span className="cs-toggle-desc">{t('gemini.compressionThresholdDesc')}</span>
            </div>
            <input
              type="number"
              className="cs-input-number"
              value={config.model?.compressionThreshold ?? 0.8}
              min={0}
              max={1}
              step={0.1}
              onChange={(e) => onUpdate({ model: { ...config.model, compressionThreshold: parseFloat(e.target.value) || 0.8 } })}
              style={{ width: 80, textAlign: 'center' }}
            />
          </div>
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.disableLoopDetection')}</span>
              <span className="cs-toggle-desc">{t('gemini.disableLoopDetectionDesc')}</span>
            </div>
            <button
              className={`cs-toggle-switch${config.model?.disableLoopDetection ? ' cs-toggle-switch--active' : ''}`}
              style={config.model?.disableLoopDetection ? { background: ACCENT_COLOR } : undefined}
              onClick={() => onUpdate({ model: { ...config.model, disableLoopDetection: !config.model?.disableLoopDetection } })}
            />
          </div>
        </div>
      </div>

      {/* Approval mode */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.approvalMode')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.approvalMode')}
            options={approvalOptions}
            value={config.general?.defaultApprovalMode ?? 'default'}
            onChange={(v) => onUpdate({ general: { ...config.general, defaultApprovalMode: v } })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Max attempts */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.maxAttempts')}</div>
        <div className="cs-general-card">
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.maxAttempts')}</span>
              <span className="cs-toggle-desc">{t('gemini.maxAttemptsDesc')}</span>
            </div>
            <input
              type="number"
              className="cs-input-number"
              value={config.general?.maxAttempts ?? 3}
              min={1}
              max={10}
              onChange={(e) => onUpdate({ general: { ...config.general, maxAttempts: parseInt(e.target.value) || 3 } })}
              style={{ width: 80, textAlign: 'center' }}
            />
          </div>
        </div>
      </div>

      {/* Session retention */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.sessionRetention')}</div>
        <div className="cs-general-card">
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.sessionRetentionEnabled')}</span>
              <span className="cs-toggle-desc">{t('gemini.sessionRetentionEnabledDesc')}</span>
            </div>
            <button
              className={`cs-toggle-switch${config.general?.sessionRetention?.enabled !== false ? ' cs-toggle-switch--active' : ''}`}
              style={config.general?.sessionRetention?.enabled !== false ? { background: ACCENT_COLOR } : undefined}
              onClick={() => onUpdate({
                general: {
                  ...config.general,
                  sessionRetention: {
                    ...config.general?.sessionRetention,
                    enabled: config.general?.sessionRetention?.enabled === false,
                  },
                },
              })}
            />
          </div>
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.sessionRetentionMaxAge')}</span>
              <span className="cs-toggle-desc">{t('gemini.sessionRetentionMaxAgeDesc')}</span>
            </div>
            <input
              type="text"
              className="cs-input-number"
              value={config.general?.sessionRetention?.maxAge ?? '30d'}
              onChange={(e) => onUpdate({
                general: {
                  ...config.general,
                  sessionRetention: {
                    ...config.general?.sessionRetention,
                    maxAge: e.target.value,
                  },
                },
              })}
              placeholder="30d"
              style={{ width: 80, textAlign: 'center' }}
            />
          </div>
        </div>
      </div>

      {/* Plan settings */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.planSettings')}</div>
        <div className="cs-general-card">
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.planModelRouting')}</span>
              <span className="cs-toggle-desc">{t('gemini.planModelRoutingDesc')}</span>
            </div>
            <button
              className={`cs-toggle-switch${config.general?.plan?.modelRouting !== false ? ' cs-toggle-switch--active' : ''}`}
              style={config.general?.plan?.modelRouting !== false ? { background: ACCENT_COLOR } : undefined}
              onClick={() => onUpdate({
                general: {
                  ...config.general,
                  plan: {
                    ...config.general?.plan,
                    modelRouting: config.general?.plan?.modelRouting === false,
                  },
                },
              })}
            />
          </div>
          <div className="cs-toggle-row">
            <div className="cs-toggle-info">
              <span className="cs-toggle-label">{t('gemini.planDirectory')}</span>
              <span className="cs-toggle-desc">{t('gemini.planDirectoryDesc')}</span>
            </div>
            <input
              type="text"
              className="cs-input-number"
              value={config.general?.plan?.directory ?? ''}
              onChange={(e) => onUpdate({
                general: {
                  ...config.general,
                  plan: {
                    ...config.general?.plan,
                    directory: e.target.value || undefined,
                  },
                },
              })}
              placeholder=".gemini/plans"
              style={{ width: 160, textAlign: 'left', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* Billing */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.billing')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.overageStrategy')}
            options={overageOptions}
            value={config.billing?.overageStrategy ?? 'ask'}
            onChange={(v) => onUpdate({ billing: { overageStrategy: v } })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Output format */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.outputFormat')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.outputFormat')}
            options={outputOptions}
            value={config.output?.format ?? 'text'}
            onChange={(v) => onUpdate({ output: { format: v } })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* General features */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.features')}</div>
        <div className="cs-general-card cs-agent-teams">
          <FeatureToggleGrid features={generalFeatures} accentColor={ACCENT_COLOR} />
        </div>
      </div>
    </div>
  )
}
