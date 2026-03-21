import { useI18n } from '../../../lib/i18n'
import { useSshKeys } from '../hooks/use-ssh-keys'

export function SshSettings() {
  const { t } = useI18n()
  const {
    sshKeys,
    sshLoading,
    sshError,
    showGenerateForm,
    setShowGenerateForm,
    showImportForm,
    setShowImportForm,
    genName,
    setGenName,
    genType,
    setGenType,
    genComment,
    setGenComment,
    genLoading,
    importName,
    setImportName,
    importPrivateKey,
    setImportPrivateKey,
    importPublicKey,
    setImportPublicKey,
    copiedKeyId,
    handleGenerateKey,
    handleImportKey,
    handleSelectKeyFile,
    handleCopyPublicKey,
    handleDeleteKey,
    handleOpenSshDir,
  } = useSshKeys()

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="ssh-actions">
          <button className="ssh-action-btn" onClick={() => { setShowGenerateForm(!showGenerateForm); setShowImportForm(false) }}>
            + {t('settings.sshGenerate')}
          </button>
          <button className="ssh-action-btn" onClick={() => { setShowImportForm(!showImportForm); setShowGenerateForm(false) }}>
            {t('settings.sshImport')}
          </button>
          <button className="ssh-action-btn" onClick={handleSelectKeyFile}>
            {t('settings.sshSelectFile')}
          </button>
          <button className="ssh-action-btn" onClick={handleOpenSshDir}>
            {t('settings.sshOpenFolder')}
          </button>
        </div>

        {sshError && (
          <div className="ssh-error">{sshError}</div>
        )}

        {showGenerateForm && (
          <div className="ssh-form">
            <div className="ssh-form-row">
              <label className="settings-label">{t('settings.sshKeyName')}</label>
              <input
                type="text"
                className="ssh-input"
                value={genName}
                onChange={(e) => setGenName(e.target.value)}
                placeholder="id_ed25519"
              />
            </div>
            <div className="ssh-form-row">
              <label className="settings-label">{t('settings.sshKeyType')}</label>
              <div className="settings-radio-group">
                {(['ed25519', 'rsa'] as const).map((kt) => (
                  <button
                    key={kt}
                    className={`settings-radio-btn${genType === kt ? ' settings-radio-btn--active' : ''}`}
                    onClick={() => {
                      setGenType(kt)
                      setGenName(kt === 'ed25519' ? 'id_ed25519' : 'id_rsa')
                    }}
                  >
                    {kt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="ssh-form-row">
              <label className="settings-label">{t('settings.sshKeyComment')}</label>
              <input
                type="text"
                className="ssh-input"
                value={genComment}
                onChange={(e) => setGenComment(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="ssh-form-actions">
              <button className="ssh-btn ssh-btn--primary" onClick={handleGenerateKey} disabled={genLoading || !genName.trim()}>
                {genLoading ? t('settings.sshGenerating') : t('settings.sshGenerateBtn')}
              </button>
              <button className="ssh-btn" onClick={() => setShowGenerateForm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {showImportForm && (
          <div className="ssh-form">
            <div className="ssh-form-row">
              <label className="settings-label">{t('settings.sshKeyName')}</label>
              <input
                type="text"
                className="ssh-input"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="my_key"
              />
            </div>
            <div className="ssh-form-row">
              <label className="settings-label">{t('settings.sshPastePrivateKey')}</label>
              <textarea
                className="ssh-textarea"
                value={importPrivateKey}
                onChange={(e) => setImportPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                rows={4}
              />
            </div>
            <div className="ssh-form-row">
              <label className="settings-label">{t('settings.sshPastePublicKey')}</label>
              <textarea
                className="ssh-textarea"
                value={importPublicKey}
                onChange={(e) => setImportPublicKey(e.target.value)}
                placeholder="ssh-ed25519 AAAA..."
                rows={2}
              />
            </div>
            <div className="ssh-form-actions">
              <button className="ssh-btn ssh-btn--primary" onClick={handleImportKey} disabled={!importName.trim() || !importPrivateKey.trim()}>
                {t('settings.sshImportBtn')}
              </button>
              <button className="ssh-btn" onClick={() => setShowImportForm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Key list */}
      <div className="settings-card">
        {sshLoading ? (
          <div className="ssh-loading">{t('common.loading')}</div>
        ) : sshKeys.length === 0 ? (
          <div className="ssh-empty">{t('settings.sshNoKeys')}</div>
        ) : (
          <div className="ssh-key-list">
            {sshKeys.map((key) => (
              <div key={key.id} className="ssh-key-card">
                <div className="ssh-key-header">
                  <span className="ssh-key-name">{key.name}</span>
                  <span className="ssh-key-type">{key.type.toUpperCase()}</span>
                  {key.isDefault && <span className="ssh-key-badge">{t('settings.sshDefault')}</span>}
                </div>
                {key.comment && <div className="ssh-key-comment">{key.comment}</div>}
                {key.fingerprint && (
                  <div className="ssh-key-fingerprint">{key.fingerprint}</div>
                )}
                <div className="ssh-key-actions">
                  {key.publicKeyPath && (
                    <button className="ssh-btn ssh-btn--small" onClick={() => handleCopyPublicKey(key)}>
                      {copiedKeyId === key.id ? t('settings.sshCopied') : t('settings.sshCopyPublicKey')}
                    </button>
                  )}
                  <button className="ssh-btn ssh-btn--small ssh-btn--danger" onClick={() => handleDeleteKey(key, t('settings.sshDeleteConfirm'))}>
                    {t('settings.sshDelete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
