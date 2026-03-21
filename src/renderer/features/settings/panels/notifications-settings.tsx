import type { AppSettings } from '../../../../shared/types'
import { useI18n } from '../../../lib/i18n'

interface NotificationsSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function NotificationsSettings({ settings, updateSetting }: NotificationsSettingsProps) {
  const { t } = useI18n()

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.sound')}</label>
            <span className="settings-hint">{t('settings.soundHint')}</span>
          </div>
          <button
            className={`settings-toggle${settings.notificationSound ? ' settings-toggle--active' : ''}`}
            onClick={() => updateSetting('notificationSound', !settings.notificationSound)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.badge')}</label>
            <span className="settings-hint">{t('settings.badgeHint')}</span>
          </div>
          <button
            className={`settings-toggle${settings.notificationBadge ? ' settings-toggle--active' : ''}`}
            onClick={() => updateSetting('notificationBadge', !settings.notificationBadge)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.checkUpdates')}</label>
            <span className="settings-hint">{t('settings.checkUpdatesHint')}</span>
          </div>
          <button
            className={`settings-toggle${settings.checkUpdatesOnLaunch ? ' settings-toggle--active' : ''}`}
            onClick={() => updateSetting('checkUpdatesOnLaunch', !settings.checkUpdatesOnLaunch)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>
    </div>
  )
}
