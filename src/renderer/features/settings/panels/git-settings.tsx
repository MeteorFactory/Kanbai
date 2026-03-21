import { useI18n } from '../../../lib/i18n'
import { useGitConfig } from '../hooks/use-git-config'

export function GitSettings() {
  const { t } = useI18n()
  const {
    namespaces,
    selectedNamespaceId,
    gitUserName,
    setGitUserName,
    gitUserEmail,
    setGitUserEmail,
    gitIsCustom,
    gitLoading,
    gitSaved,
    setGitSaved,
    handleGitNamespaceChange,
    handleGitSave,
    handleGitReset,
  } = useGitConfig()

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.gitNamespace')}</label>
          </div>
          <select
            className="settings-select"
            value={selectedNamespaceId}
            onChange={(e) => handleGitNamespaceChange(e.target.value)}
          >
            {namespaces.map((ns) => (
              <option key={ns.id} value={ns.id}>
                {ns.name}{ns.isDefault ? ` (${t('settings.sshDefault')})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-card">
        {gitLoading ? (
          <div className="ssh-loading">{t('common.loading')}</div>
        ) : (
          <>
            <div className="settings-row" style={{ marginBottom: 4 }}>
              <span className="settings-hint" style={{ fontSize: 11 }}>
                {namespaces.find((ns) => ns.id === selectedNamespaceId)?.isDefault
                  ? t('settings.gitGlobalConfig')
                  : gitIsCustom
                    ? t('settings.gitCustomProfile')
                    : t('settings.gitInheritedFromGlobal')}
              </span>
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('settings.gitUserName')}</label>
              </div>
              <input
                type="text"
                className="ssh-input"
                value={gitUserName}
                onChange={(e) => { setGitUserName(e.target.value); setGitSaved(false) }}
                placeholder={t('settings.gitNamePlaceholder')}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('settings.gitUserEmail')}</label>
              </div>
              <input
                type="text"
                className="ssh-input"
                value={gitUserEmail}
                onChange={(e) => { setGitUserEmail(e.target.value); setGitSaved(false) }}
                placeholder={t('settings.gitEmailPlaceholder')}
              />
            </div>
            <div className="ssh-form-actions" style={{ marginTop: 8 }}>
              <button
                className="ssh-btn ssh-btn--primary"
                onClick={handleGitSave}
                disabled={gitLoading}
              >
                {gitSaved ? t('settings.gitSaved') : t('common.save')}
              </button>
              {gitIsCustom && !namespaces.find((ns) => ns.id === selectedNamespaceId)?.isDefault && (
                <button
                  className="ssh-btn"
                  onClick={() => handleGitReset(t('settings.gitResetConfirm'))}
                  disabled={gitLoading}
                >
                  {t('settings.gitResetToGlobal')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
