import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { FeatureToggleGrid } from '../../../../../../components/claude-settings/FeatureToggleGrid'
import type { GeminiFullConfig } from './use-gemini-config'

const ACCENT_COLOR = AI_PROVIDERS.gemini.detectionColor

interface Props {
  config: GeminiFullConfig
  onUpdate: (patch: Partial<GeminiFullConfig>) => Promise<void>
}

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      className={`cs-toggle-switch${active ? ' cs-toggle-switch--active' : ''}`}
      style={active ? { background: ACCENT_COLOR } : undefined}
      onClick={onToggle}
    />
  )
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="cs-toggle-row">
      <div className="cs-toggle-info">
        <span className="cs-toggle-label">{label}</span>
        <span className="cs-toggle-desc">{desc}</span>
      </div>
      {children}
    </div>
  )
}

export function GeminiAgentsTab({ config, onUpdate }: Props) {
  const { t } = useI18n()
  const exp = config.experimental ?? {}

  const setExp = (patch: Partial<NonNullable<GeminiFullConfig['experimental']>>) =>
    onUpdate({ experimental: { ...exp, ...patch } })

  const experimentalFeatures = [
    {
      key: 'enableAgents',
      label: t('gemini.enableAgents'),
      description: t('gemini.enableAgentsDesc'),
      active: exp.enableAgents ?? false,
      onToggle: () => setExp({ enableAgents: !exp.enableAgents }),
    },
    {
      key: 'plan',
      label: t('gemini.experimentalPlan'),
      description: t('gemini.experimentalPlanDesc'),
      active: exp.plan ?? false,
      onToggle: () => setExp({ plan: !exp.plan }),
    },
    {
      key: 'modelSteering',
      label: t('gemini.modelSteering'),
      description: t('gemini.modelSteeringDesc'),
      active: exp.modelSteering ?? false,
      onToggle: () => setExp({ modelSteering: !exp.modelSteering }),
    },
    {
      key: 'directWebFetch',
      label: t('gemini.directWebFetch'),
      description: t('gemini.directWebFetchDesc'),
      active: exp.directWebFetch ?? false,
      onToggle: () => setExp({ directWebFetch: !exp.directWebFetch }),
    },
  ]

  return (
    <div className="cs-general-tab">
      {/* Experimental features */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.experimentalFeatures')}</div>
        <div className="cs-general-card cs-agent-teams">
          <FeatureToggleGrid features={experimentalFeatures} accentColor={ACCENT_COLOR} />
        </div>
      </div>

      {/* Subagents details */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.subagentsConfig')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.gemmaModelRouter')} desc={t('gemini.gemmaModelRouterDesc')}>
            <Toggle
              active={exp.gemmaModelRouter?.enabled ?? false}
              onToggle={() => setExp({ gemmaModelRouter: { enabled: !exp.gemmaModelRouter?.enabled } })}
            />
          </Row>
          <Row label={t('gemini.toolOutputMasking')} desc={t('gemini.toolOutputMaskingDesc')}>
            <Toggle
              active={exp.toolOutputMasking?.enabled ?? false}
              onToggle={() => setExp({ toolOutputMasking: { enabled: !exp.toolOutputMasking?.enabled } })}
            />
          </Row>
        </div>
      </div>

      {/* Clipboard */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.clipboard')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.osc52Paste')} desc={t('gemini.osc52PasteDesc')}>
            <Toggle active={exp.useOSC52Paste ?? false} onToggle={() => setExp({ useOSC52Paste: !exp.useOSC52Paste })} />
          </Row>
          <Row label={t('gemini.osc52Copy')} desc={t('gemini.osc52CopyDesc')}>
            <Toggle active={exp.useOSC52Copy ?? false} onToggle={() => setExp({ useOSC52Copy: !exp.useOSC52Copy })} />
          </Row>
        </div>
      </div>

      {/* Skills & hooks config */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.skillsAndHooks')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.skillsEnabled')} desc={t('gemini.skillsEnabledDesc')}>
            <Toggle
              active={config.skills?.enabled ?? true}
              onToggle={() => onUpdate({ skills: { enabled: !(config.skills?.enabled ?? true) } })}
            />
          </Row>
          <Row label={t('gemini.hooksEnabled')} desc={t('gemini.hooksEnabledDesc')}>
            <Toggle
              active={config.hooksConfig?.enabled ?? true}
              onToggle={() => onUpdate({ hooksConfig: { ...config.hooksConfig, enabled: !(config.hooksConfig?.enabled ?? true) } })}
            />
          </Row>
          <Row label={t('gemini.hooksNotifications')} desc={t('gemini.hooksNotificationsDesc')}>
            <Toggle
              active={config.hooksConfig?.notifications ?? true}
              onToggle={() => onUpdate({ hooksConfig: { ...config.hooksConfig, notifications: !(config.hooksConfig?.notifications ?? true) } })}
            />
          </Row>
        </div>
      </div>

      {/* Info about custom agents */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.customAgentsInfo')}</div>
        <div className="cs-general-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
            {t('gemini.customAgentsInfoDesc')}
          </p>
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            <div>.gemini/agents/*.md</div>
            <div>~/.gemini/agents/*.md</div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
            {t('gemini.remoteAgentsInfo')}
          </p>
        </div>
      </div>
    </div>
  )
}
