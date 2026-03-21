import type { AppSettings } from '../../../../shared/types'
import type { AiProviderId } from '../../../../shared/types/ai-provider'
import { useI18n } from '../../../lib/i18n'
import { AiProviderSelector } from '../../claude'

interface GeneralSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  handleLocaleChange: (newLocale: 'fr' | 'en') => void
}

export function GeneralSettings({
  settings,
  updateSetting,
  setSettings,
  handleLocaleChange,
}: GeneralSettingsProps) {
  const { t, locale } = useI18n()

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.language')}</label>
            <span className="settings-hint">{t('settings.languageHint')}</span>
          </div>
          <div className="settings-radio-group">
            <button
              className={`settings-radio-btn${locale === 'fr' ? ' settings-radio-btn--active' : ''}`}
              onClick={() => handleLocaleChange('fr')}
            >
              {t('settings.french')}
            </button>
            <button
              className={`settings-radio-btn${locale === 'en' ? ' settings-radio-btn--active' : ''}`}
              onClick={() => handleLocaleChange('en')}
            >
              {t('settings.english')}
            </button>
          </div>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('ai.defaultProvider')}</label>
            <span className="settings-hint">{t('ai.defaultProviderHint')}</span>
          </div>
          <AiProviderSelector
            value={(settings.defaultAiProvider || 'claude') as AiProviderId}
            onChange={(provider) => updateSetting('defaultAiProvider', provider)}
            showInstall={false}
          />
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.tutorialEnabled')}</label>
            <span className="settings-hint">{t('settings.tutorialEnabledHint')}</span>
          </div>
          <button
            className={`settings-toggle${!settings.tutorialCompleted ? ' settings-toggle--active' : ''}`}
            onClick={() => {
              const nowCompleted = !settings.tutorialCompleted
              if (!nowCompleted) {
                setSettings((prev) => ({ ...prev, tutorialCompleted: false, tutorialSeenSections: [] }))
                window.kanbai.settings.set({ tutorialCompleted: false, tutorialSeenSections: [] })
              } else {
                updateSetting('tutorialCompleted', true)
              }
            }}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>
    </div>
  )
}
