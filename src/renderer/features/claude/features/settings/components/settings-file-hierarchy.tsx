import { useI18n } from '../../../../../lib/i18n'

interface Props {
  userSettingsExists: boolean
  projectSettingsExists: boolean
  localSettingsExists: boolean
  managedSettingsExists: boolean
  settingsTarget: 'project' | 'local'
  onTargetChange: (target: 'project' | 'local') => void
  onOpenFile?: (path: string) => void
}

export function SettingsFileHierarchy({
  userSettingsExists,
  projectSettingsExists,
  localSettingsExists,
  managedSettingsExists,
  settingsTarget,
  onTargetChange,
  onOpenFile,
}: Props) {
  const { t } = useI18n()

  const levels = [
    { id: 'managed', label: t('claude.managedSettings'), path: 'managed-settings.json', exists: managedSettingsExists, readOnly: true },
    { id: 'user', label: t('claude.userSettings'), path: '~/.claude/settings.json', exists: userSettingsExists, readOnly: true },
    { id: 'project' as const, label: t('claude.projectSettings'), path: '.claude/settings.json', exists: projectSettingsExists, readOnly: false },
    { id: 'local' as const, label: t('claude.localSettings'), path: '.claude/settings.local.json', exists: localSettingsExists, readOnly: false },
  ]

  return (
    <div className="cs-hierarchy">
      <label className="claude-rules-label">{t('claude.settingsTarget')}</label>
      <div className="cs-hierarchy-subtitle">{t('claude.settingsTargetDesc')}</div>
      <div className="cs-hierarchy-levels">
        {levels.map((level, i) => {
          const isTarget = !level.readOnly && settingsTarget === level.id
          const isClickable = !level.readOnly
          return (
            <div key={level.id}>
              <div
                className={`cs-hierarchy-item${isClickable ? ' cs-hierarchy-item--clickable' : ''}${isTarget ? ' cs-hierarchy-item--active' : ''}`}
                onClick={isClickable ? () => onTargetChange(level.id as 'project' | 'local') : undefined}
              >
                <div className="cs-hierarchy-item-main">
                  <span className="cs-hierarchy-item-label">{level.label}</span>
                  <code className="cs-hierarchy-item-path">{level.path}</code>
                </div>
                <div className="cs-hierarchy-item-badges">
                  <span className={`cs-hierarchy-badge${level.exists ? ' cs-hierarchy-badge--exists' : ' cs-hierarchy-badge--missing'}`}>
                    {level.exists ? t('claude.settingsExists') : t('claude.settingsMissing')}
                  </span>
                  {level.readOnly && <span className="cs-hierarchy-badge cs-hierarchy-badge--readonly">{t('claude.readOnly')}</span>}
                  {isTarget && <span className="cs-hierarchy-badge cs-hierarchy-badge--target">&#x2713;</span>}
                  {level.exists && onOpenFile && (
                    <button
                      className="cs-hierarchy-item-open-btn"
                      onClick={(e) => { e.stopPropagation(); onOpenFile(level.path) }}
                      title={t('claude.openFile')}
                    >
                      &#x270E;
                    </button>
                  )}
                </div>
              </div>
              {i < levels.length - 1 && (
                <div className="cs-hierarchy-arrow-row">
                  <span className="cs-hierarchy-arrow-icon">&#x2193;</span>
                  <span className="cs-hierarchy-arrow-text">{t('claude.precedenceArrow')}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
