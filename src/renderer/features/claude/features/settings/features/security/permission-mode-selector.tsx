import { useI18n } from '../../../../../../lib/i18n'

const PERMISSION_MODES = [
  { value: 'bypassPermissions', label: 'Bypass', descKey: 'claude.noConfirmation', className: 'claude-perm--bypass' },
  { value: 'acceptEdits', label: 'Accept Edits', descKey: 'claude.confirmEditsOnly', className: 'claude-perm--accept' },
  { value: 'dontAsk', label: "Don't Ask", descKey: 'claude.dontAskMode', className: 'claude-perm--dontask' },
  { value: 'plan', label: 'Plan', descKey: 'claude.planApproval', className: 'claude-perm--plan' },
  { value: 'default', label: 'Default', descKey: 'claude.defaultMode', className: 'claude-perm--default' },
]

interface Props {
  value: string
  onChange: (mode: string) => void
  disableBypass?: boolean
}

export function PermissionModeSelector({ value, onChange, disableBypass }: Props) {
  const { t } = useI18n()

  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{t('claude.permissionMode')}</label>
      <div className="claude-rules-mode-list">
        {PERMISSION_MODES.map((mode) => (
          <button
            key={mode.value}
            className={`claude-rules-mode-btn${value === mode.value ? ' claude-rules-mode-btn--active' : ''} ${mode.className}`}
            onClick={() => onChange(mode.value)}
            disabled={mode.value === 'bypassPermissions' && disableBypass}
          >
            <span className="claude-rules-mode-name">{mode.label}</span>
            <span className="claude-rules-mode-desc">{t(mode.descKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
