import { useState } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
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

export function GeminiSecurityTab({ config, onUpdate }: Props) {
  const { t } = useI18n()
  const security = config.security ?? {}
  const [extensionsList, setExtensionsList] = useState(
    (security.allowedExtensions ?? []).join('\n'),
  )

  const setSecurity = (patch: Partial<NonNullable<GeminiFullConfig['security']>>) =>
    onUpdate({ security: { ...security, ...patch } })

  return (
    <div className="cs-general-tab">
      {/* Core security */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.securityCore')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.disableYoloMode')} desc={t('gemini.disableYoloModeDesc')}>
            <Toggle active={security.disableYoloMode ?? false} onToggle={() => setSecurity({ disableYoloMode: !security.disableYoloMode })} />
          </Row>
          <Row label={t('gemini.featurePermanentApproval')} desc={t('gemini.featurePermanentApprovalDesc')}>
            <Toggle active={security.enablePermanentToolApproval ?? false} onToggle={() => setSecurity({ enablePermanentToolApproval: !security.enablePermanentToolApproval })} />
          </Row>
          <Row label={t('gemini.enableConseca')} desc={t('gemini.enableConsecaDesc')}>
            <Toggle active={security.enableConseca ?? false} onToggle={() => setSecurity({ enableConseca: !security.enableConseca })} />
          </Row>
        </div>
      </div>

      {/* Extensions */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.securityExtensions')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.blockGitExtensions')} desc={t('gemini.blockGitExtensionsDesc')}>
            <Toggle active={security.blockGitExtensions ?? false} onToggle={() => setSecurity({ blockGitExtensions: !security.blockGitExtensions })} />
          </Row>
          <div style={{ marginTop: 12 }}>
            <span className="cs-toggle-label">{t('gemini.allowedExtensions')}</span>
            <span className="cs-toggle-desc" style={{ display: 'block', marginBottom: 8 }}>{t('gemini.allowedExtensionsDesc')}</span>
            <textarea
              className="claude-md-editor"
              value={extensionsList}
              onChange={(e) => setExtensionsList(e.target.value)}
              onBlur={() => {
                const exts = extensionsList.split('\n').map((p) => p.trim()).filter(Boolean)
                setSecurity({ allowedExtensions: exts.length > 0 ? exts : undefined })
              }}
              rows={4}
              spellCheck={false}
              placeholder="extension-name-1&#10;extension-name-2"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* Trust & privacy */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.securityTrust')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.folderTrust')} desc={t('gemini.folderTrustDesc')}>
            <Toggle
              active={security.folderTrust?.enabled ?? true}
              onToggle={() => setSecurity({ folderTrust: { enabled: !(security.folderTrust?.enabled ?? true) } })}
            />
          </Row>
          <Row label={t('gemini.envVarRedaction')} desc={t('gemini.envVarRedactionDesc')}>
            <Toggle
              active={security.environmentVariableRedaction?.enabled ?? true}
              onToggle={() => setSecurity({ environmentVariableRedaction: { enabled: !(security.environmentVariableRedaction?.enabled ?? true) } })}
            />
          </Row>
        </div>
      </div>

      {/* Advanced */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.securityAdvanced')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.autoConfigureMemory')} desc={t('gemini.autoConfigureMemoryDesc')}>
            <Toggle
              active={config.advanced?.autoConfigureMemory ?? true}
              onToggle={() => onUpdate({ advanced: { autoConfigureMemory: !(config.advanced?.autoConfigureMemory ?? true) } })}
            />
          </Row>
        </div>
      </div>
    </div>
  )
}
