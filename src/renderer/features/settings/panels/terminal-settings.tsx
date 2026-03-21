import type { AppSettings } from '../../../../shared/types'
import { useI18n } from '../../../lib/i18n'

const IS_WIN_RENDERER = navigator.platform.startsWith('Win')

const SHELLS = IS_WIN_RENDERER
  ? [
      { value: 'powershell.exe', label: 'PowerShell' },
      { value: 'cmd.exe', label: 'Command Prompt' },
      { value: 'C:\\Program Files\\Git\\bin\\bash.exe', label: 'Git Bash' },
      { value: 'pwsh.exe', label: 'PowerShell 7' },
    ]
  : [
      { value: '/bin/zsh', label: 'zsh' },
      { value: '/bin/bash', label: 'bash' },
      { value: '/usr/local/bin/fish', label: 'fish' },
    ]

interface TerminalSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function TerminalSettings({ settings, updateSetting }: TerminalSettingsProps) {
  const { t } = useI18n()

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.defaultShell')}</label>
          </div>
          <select
            className="settings-select"
            value={settings.defaultShell}
            onChange={(e) => updateSetting('defaultShell', e.target.value)}
          >
            {SHELLS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.scrollbackLines')}</label>
          </div>
          <div className="settings-input-row">
            <input
              type="number"
              min={1000}
              max={50000}
              step={1000}
              value={settings.scrollbackLines}
              onChange={(e) => updateSetting('scrollbackLines', Number(e.target.value))}
              className="settings-number-input"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
