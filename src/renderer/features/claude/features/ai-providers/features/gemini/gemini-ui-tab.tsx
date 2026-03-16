import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { CardSelector } from '../../../../../../components/claude-settings/CardSelector'
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

export function GeminiUiTab({ config, onUpdate }: Props) {
  const { t } = useI18n()

  const ui = config.ui ?? {}
  const footer = ui.footer ?? {}

  const setUi = (patch: Partial<NonNullable<GeminiFullConfig['ui']>>) =>
    onUpdate({ ui: { ...ui, ...patch } })

  const setFooter = (patch: Partial<NonNullable<NonNullable<GeminiFullConfig['ui']>['footer']>>) =>
    onUpdate({ ui: { ...ui, footer: { ...footer, ...patch } } })

  const thinkingOptions = [
    { value: 'off', label: 'Off', description: t('gemini.thinkingOff') },
    { value: 'full', label: 'Full', description: t('gemini.thinkingFull') },
  ]

  const loadingPhrasesOptions = [
    { value: 'tips', label: 'Tips', description: t('gemini.loadingTips') },
    { value: 'witty', label: 'Witty', description: t('gemini.loadingWitty') },
    { value: 'both', label: 'Both', description: t('gemini.loadingBoth') },
    { value: 'nothing', label: 'Nothing', description: t('gemini.loadingNothing') },
  ]

  const errorVerbosityOptions = [
    { value: 'low', label: 'Low', description: t('gemini.errorVerbosityLow') },
    { value: 'full', label: 'Full', description: t('gemini.errorVerbosityFull') },
  ]

  return (
    <div className="cs-general-tab">
      {/* Thinking mode */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.thinkingMode')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.thinkingMode')}
            options={thinkingOptions}
            value={ui.inlineThinkingMode ?? 'off'}
            onChange={(v) => setUi({ inlineThinkingMode: v })}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Display */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.uiDisplay')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.uiAutoTheme')} desc={t('gemini.uiAutoThemeDesc')}>
            <Toggle active={ui.autoThemeSwitching ?? false} onToggle={() => setUi({ autoThemeSwitching: !ui.autoThemeSwitching })} />
          </Row>
          <Row label={t('gemini.uiHideWindowTitle')} desc={t('gemini.uiHideWindowTitleDesc')}>
            <Toggle active={ui.hideWindowTitle ?? false} onToggle={() => setUi({ hideWindowTitle: !ui.hideWindowTitle })} />
          </Row>
          <Row label={t('gemini.uiShowStatusInTitle')} desc={t('gemini.uiShowStatusInTitleDesc')}>
            <Toggle active={ui.showStatusInTitle ?? false} onToggle={() => setUi({ showStatusInTitle: !ui.showStatusInTitle })} />
          </Row>
          <Row label={t('gemini.uiDynamicWindowTitle')} desc={t('gemini.uiDynamicWindowTitleDesc')}>
            <Toggle active={ui.dynamicWindowTitle ?? false} onToggle={() => setUi({ dynamicWindowTitle: !ui.dynamicWindowTitle })} />
          </Row>
          <Row label={t('gemini.uiUseAlternateBuffer')} desc={t('gemini.uiUseAlternateBufferDesc')}>
            <Toggle active={ui.useAlternateBuffer ?? false} onToggle={() => setUi({ useAlternateBuffer: !ui.useAlternateBuffer })} />
          </Row>
          <Row label={t('gemini.uiUseBackgroundColor')} desc={t('gemini.uiUseBackgroundColorDesc')}>
            <Toggle active={ui.useBackgroundColor ?? false} onToggle={() => setUi({ useBackgroundColor: !ui.useBackgroundColor })} />
          </Row>
          <Row label={t('gemini.uiIncrementalRendering')} desc={t('gemini.uiIncrementalRenderingDesc')}>
            <Toggle active={ui.incrementalRendering ?? true} onToggle={() => setUi({ incrementalRendering: !(ui.incrementalRendering ?? true) })} />
          </Row>
        </div>
      </div>

      {/* Visibility */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.uiVisibility')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.uiHideBanner')} desc={t('gemini.uiHideBannerDesc')}>
            <Toggle active={ui.hideBanner ?? false} onToggle={() => setUi({ hideBanner: !ui.hideBanner })} />
          </Row>
          <Row label={t('gemini.uiHideTips')} desc={t('gemini.uiHideTipsDesc')}>
            <Toggle active={ui.hideTips ?? false} onToggle={() => setUi({ hideTips: !ui.hideTips })} />
          </Row>
          <Row label={t('gemini.uiShowShortcutsHint')} desc={t('gemini.uiShowShortcutsHintDesc')}>
            <Toggle active={ui.showShortcutsHint ?? true} onToggle={() => setUi({ showShortcutsHint: !(ui.showShortcutsHint ?? true) })} />
          </Row>
          <Row label={t('gemini.uiHideContextSummary')} desc={t('gemini.uiHideContextSummaryDesc')}>
            <Toggle active={ui.hideContextSummary ?? false} onToggle={() => setUi({ hideContextSummary: !ui.hideContextSummary })} />
          </Row>
          <Row label={t('gemini.uiShowSpinner')} desc={t('gemini.uiShowSpinnerDesc')}>
            <Toggle active={ui.showSpinner ?? true} onToggle={() => setUi({ showSpinner: !(ui.showSpinner ?? true) })} />
          </Row>
          <Row label={t('gemini.uiShowHomeDirectoryWarning')} desc={t('gemini.uiShowHomeDirectoryWarningDesc')}>
            <Toggle active={ui.showHomeDirectoryWarning ?? true} onToggle={() => setUi({ showHomeDirectoryWarning: !(ui.showHomeDirectoryWarning ?? true) })} />
          </Row>
          <Row label={t('gemini.uiShowCompatibilityWarnings')} desc={t('gemini.uiShowCompatibilityWarningsDesc')}>
            <Toggle active={ui.showCompatibilityWarnings ?? true} onToggle={() => setUi({ showCompatibilityWarnings: !(ui.showCompatibilityWarnings ?? true) })} />
          </Row>
        </div>
      </div>

      {/* Content display */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.uiContent')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.uiShowLineNumbers')} desc={t('gemini.uiShowLineNumbersDesc')}>
            <Toggle active={ui.showLineNumbers ?? false} onToggle={() => setUi({ showLineNumbers: !ui.showLineNumbers })} />
          </Row>
          <Row label={t('gemini.uiShowCitations')} desc={t('gemini.uiShowCitationsDesc')}>
            <Toggle active={ui.showCitations ?? false} onToggle={() => setUi({ showCitations: !ui.showCitations })} />
          </Row>
          <Row label={t('gemini.uiShowModelInfoInChat')} desc={t('gemini.uiShowModelInfoInChatDesc')}>
            <Toggle active={ui.showModelInfoInChat ?? false} onToggle={() => setUi({ showModelInfoInChat: !ui.showModelInfoInChat })} />
          </Row>
          <Row label={t('gemini.uiShowUserIdentity')} desc={t('gemini.uiShowUserIdentityDesc')}>
            <Toggle active={ui.showUserIdentity ?? false} onToggle={() => setUi({ showUserIdentity: !ui.showUserIdentity })} />
          </Row>
          <Row label={t('gemini.uiShowMemoryUsage')} desc={t('gemini.uiShowMemoryUsageDesc')}>
            <Toggle active={ui.showMemoryUsage ?? false} onToggle={() => setUi({ showMemoryUsage: !ui.showMemoryUsage })} />
          </Row>
        </div>
      </div>

      {/* Footer */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.uiFooter')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.uiHideFooter')} desc={t('gemini.uiHideFooterDesc')}>
            <Toggle active={ui.hideFooter ?? false} onToggle={() => setUi({ hideFooter: !ui.hideFooter })} />
          </Row>
          <Row label={t('gemini.uiFooterHideCwd')} desc={t('gemini.uiFooterHideCwdDesc')}>
            <Toggle active={footer.hideCWD ?? false} onToggle={() => setFooter({ hideCWD: !footer.hideCWD })} />
          </Row>
          <Row label={t('gemini.uiFooterHideSandbox')} desc={t('gemini.uiFooterHideSandboxDesc')}>
            <Toggle active={footer.hideSandboxStatus ?? false} onToggle={() => setFooter({ hideSandboxStatus: !footer.hideSandboxStatus })} />
          </Row>
          <Row label={t('gemini.uiFooterHideModel')} desc={t('gemini.uiFooterHideModelDesc')}>
            <Toggle active={footer.hideModelInfo ?? false} onToggle={() => setFooter({ hideModelInfo: !footer.hideModelInfo })} />
          </Row>
          <Row label={t('gemini.uiFooterHideContext')} desc={t('gemini.uiFooterHideContextDesc')}>
            <Toggle active={footer.hideContextPercentage ?? false} onToggle={() => setFooter({ hideContextPercentage: !footer.hideContextPercentage })} />
          </Row>
        </div>
      </div>

      {/* Loading phrases & error verbosity */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.uiMessages')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.loadingPhrases')}
            options={loadingPhrasesOptions}
            value={ui.loadingPhrases ?? 'tips'}
            onChange={(v) => setUi({ loadingPhrases: v })}
            accentColor={ACCENT_COLOR}
          />
          <div style={{ marginTop: 16 }}>
            <CardSelector
              label={t('gemini.errorVerbosity')}
              options={errorVerbosityOptions}
              value={ui.errorVerbosity ?? 'full'}
              onChange={(v) => setUi({ errorVerbosity: v })}
              accentColor={ACCENT_COLOR}
            />
          </div>
        </div>
      </div>

      {/* Accessibility */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.uiAccessibility')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.uiScreenReader')} desc={t('gemini.uiScreenReaderDesc')}>
            <Toggle active={ui.accessibility?.screenReader ?? false} onToggle={() => setUi({ accessibility: { screenReader: !ui.accessibility?.screenReader } })} />
          </Row>
        </div>
      </div>
    </div>
  )
}
