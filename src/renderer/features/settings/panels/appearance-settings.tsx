import type { AppSettings } from '../../../../shared/types'
import { useI18n } from '../../../lib/i18n'

const FONT_FAMILIES = [
  'Menlo',
  'Monaco',
  'JetBrains Mono',
  'Fira Code',
  'SF Mono',
  'Courier New',
]

interface AppearanceSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function AppearanceSettings({ settings, updateSetting }: AppearanceSettingsProps) {
  const { t } = useI18n()

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.theme')}</label>
          </div>
          <div className="settings-radio-group">
            {(['dark', 'light', 'terracotta', 'system'] as const).map((th) => (
              <button
                key={th}
                className={`settings-radio-btn${settings.theme === th ? ' settings-radio-btn--active' : ''}`}
                onClick={() => updateSetting('theme', th)}
              >
                {t(`settings.theme${th.charAt(0).toUpperCase() + th.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.fontSize')}</label>
          </div>
          <div className="settings-input-row">
            <input
              type="range"
              min={8}
              max={24}
              value={settings.fontSize}
              onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
              className="settings-slider"
            />
            <span className="settings-value">{settings.fontSize}px</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.fontFamily')}</label>
          </div>
          <select
            className="settings-select"
            value={settings.fontFamily}
            onChange={(e) => updateSetting('fontFamily', e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
