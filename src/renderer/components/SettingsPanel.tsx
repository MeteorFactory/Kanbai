import { useState, useEffect, useCallback } from 'react'
import type { AppSettings, SshKeyInfo, SshKeyType, Namespace } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { useAppUpdateStore } from '../lib/stores/appUpdateStore'

const FONT_FAMILIES = [
  'Menlo',
  'Monaco',
  'JetBrains Mono',
  'Fira Code',
  'SF Mono',
  'Courier New',
]

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

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  locale: 'fr',
  defaultShell: IS_WIN_RENDERER ? 'powershell.exe' : '/bin/zsh',
  fontSize: 13,
  fontFamily: 'Menlo',
  scrollbackLines: 5000,
  claudeDetectionColor: '#7c3aed',
  autoClauderEnabled: false,
  notificationSound: true,
  notificationBadge: true,
  checkUpdatesOnLaunch: true,
  autoCloseCompletedTerminals: false,
  autoCloseCtoTerminals: true,
  autoApprove: true,
}

type SettingsSection = 'general' | 'appearance' | 'terminal' | 'git' | 'ssh' | 'claude' | 'kanban' | 'notifications' | 'about'

const SECTIONS: { id: SettingsSection; icon: string }[] = [
  { id: 'general', icon: '⚙' },
  { id: 'appearance', icon: '🎨' },
  { id: 'terminal', icon: '▸' },
  { id: 'git', icon: '⎇' },
  { id: 'ssh', icon: '🔑' },
  { id: 'claude', icon: '✦' },
  { id: 'kanban', icon: '☰' },
  { id: 'notifications', icon: '🔔' },
  { id: 'about', icon: 'ℹ' },
]

export function SettingsPanel() {
  const { t, locale, setLocale } = useI18n()
  const { status: updateStatus, checkForUpdate } = useAppUpdateStore()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [appVersion, setAppVersion] = useState<{ version: string; name: string; isElevated?: boolean } | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  // Git config state
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<string>('')
  const [gitUserName, setGitUserName] = useState('')
  const [gitUserEmail, setGitUserEmail] = useState('')
  const [gitIsCustom, setGitIsCustom] = useState(false)
  const [gitLoading, setGitLoading] = useState(false)
  const [gitSaved, setGitSaved] = useState(false)

  // SSH state
  const [sshKeys, setSshKeys] = useState<SshKeyInfo[]>([])
  const [sshLoading, setSshLoading] = useState(false)
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [genName, setGenName] = useState('id_ed25519')
  const [genType, setGenType] = useState<SshKeyType>('ed25519')
  const [genComment, setGenComment] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [importName, setImportName] = useState('')
  const [importPrivateKey, setImportPrivateKey] = useState('')
  const [importPublicKey, setImportPublicKey] = useState('')
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)
  const [sshError, setSshError] = useState<string | null>(null)

  const loadGitConfig = useCallback(async (nsId: string) => {
    if (!nsId) return
    setGitLoading(true)
    try {
      const config = await window.mirehub.gitConfig.get(nsId)
      setGitUserName(config.userName)
      setGitUserEmail(config.userEmail)
      setGitIsCustom(config.isCustom)
    } catch {
      setGitUserName('')
      setGitUserEmail('')
      setGitIsCustom(false)
    } finally {
      setGitLoading(false)
    }
  }, [])

  const handleGitNamespaceChange = useCallback((nsId: string) => {
    setSelectedNamespaceId(nsId)
    setGitSaved(false)
    loadGitConfig(nsId)
  }, [loadGitConfig])

  const handleGitSave = useCallback(async () => {
    if (!selectedNamespaceId) return
    setGitLoading(true)
    try {
      const result = await window.mirehub.gitConfig.set(selectedNamespaceId, gitUserName, gitUserEmail)
      setGitIsCustom(result.isCustom)
      setGitSaved(true)
      setTimeout(() => setGitSaved(false), 2000)
    } catch {
      // silently fail
    } finally {
      setGitLoading(false)
    }
  }, [selectedNamespaceId, gitUserName, gitUserEmail])

  const handleGitReset = useCallback(async () => {
    if (!selectedNamespaceId || !confirm(t('settings.gitResetConfirm'))) return
    setGitLoading(true)
    try {
      await window.mirehub.gitConfig.delete(selectedNamespaceId)
      await loadGitConfig(selectedNamespaceId)
    } catch {
      // silently fail
    } finally {
      setGitLoading(false)
    }
  }, [selectedNamespaceId, loadGitConfig, t])

  const loadSshKeys = useCallback(async () => {
    setSshLoading(true)
    setSshError(null)
    try {
      const result = await window.mirehub.ssh.listKeys()
      if (result.success) {
        setSshKeys(result.keys)
      } else {
        setSshError(result.error || 'Failed to load SSH keys')
      }
    } catch (err) {
      setSshError(String(err))
    } finally {
      setSshLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    window.mirehub.settings.get().then((s: AppSettings) => {
      setSettings({ ...DEFAULT_SETTINGS, ...s })
      if (s.locale) {
        setLocale(s.locale)
      }
      setLoading(false)
    })
    window.mirehub.app.version().then(setAppVersion)
    loadSshKeys()
    // Load namespaces for git config section
    window.mirehub.namespace.list().then((nsList) => {
      setNamespaces(nsList)
      const defaultNs = nsList.find((ns) => ns.isDefault)
      if (defaultNs) {
        setSelectedNamespaceId(defaultNs.id)
        loadGitConfig(defaultNs.id)
      }
    })
  }, [setLocale, loadSshKeys, loadGitConfig])

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    window.mirehub.settings.set({ [key]: value })

    if (key === 'theme') {
      const theme = value as string
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', theme)
      }
    }
  }, [])

  const handleLocaleChange = useCallback((newLocale: 'fr' | 'en') => {
    setLocale(newLocale)
    setSettings((prev) => ({ ...prev, locale: newLocale }))
  }, [setLocale])

  const handleGenerateKey = useCallback(async () => {
    if (!genName.trim()) return
    setGenLoading(true)
    setSshError(null)
    try {
      const result = await window.mirehub.ssh.generateKey(genName.trim(), genType, genComment.trim())
      if (result.success) {
        setShowGenerateForm(false)
        setGenName('id_ed25519')
        setGenType('ed25519')
        setGenComment('')
        await loadSshKeys()
      } else {
        setSshError(result.error || 'Generation failed')
      }
    } catch (err) {
      setSshError(String(err))
    } finally {
      setGenLoading(false)
    }
  }, [genName, genType, genComment, loadSshKeys])

  const handleImportKey = useCallback(async () => {
    if (!importName.trim() || !importPrivateKey.trim()) return
    setSshError(null)
    try {
      const result = await window.mirehub.ssh.importKey(
        importName.trim(),
        importPrivateKey,
        importPublicKey || undefined,
      )
      if (result.success) {
        setShowImportForm(false)
        setImportName('')
        setImportPrivateKey('')
        setImportPublicKey('')
        await loadSshKeys()
      } else {
        setSshError(result.error || 'Import failed')
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [importName, importPrivateKey, importPublicKey, loadSshKeys])

  const handleSelectKeyFile = useCallback(async () => {
    setSshError(null)
    try {
      const result = await window.mirehub.ssh.selectKeyFile()
      if (result.success && result.content && result.fileName) {
        setImportName(result.fileName)
        setImportPrivateKey(result.content)
        setShowImportForm(true)
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [])

  const handleCopyPublicKey = useCallback(async (key: SshKeyInfo) => {
    if (!key.publicKeyPath) return
    try {
      const result = await window.mirehub.ssh.readPublicKey(key.publicKeyPath)
      if (result.success) {
        await navigator.clipboard.writeText(result.content)
        setCopiedKeyId(key.id)
        setTimeout(() => setCopiedKeyId(null), 2000)
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [])

  const handleDeleteKey = useCallback(async (key: SshKeyInfo) => {
    if (!confirm(t('settings.sshDeleteConfirm'))) return
    setSshError(null)
    try {
      const result = await window.mirehub.ssh.deleteKey(key.name)
      if (result.success) {
        await loadSshKeys()
      } else {
        setSshError(result.error || 'Delete failed')
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [loadSshKeys, t])

  const handleOpenSshDir = useCallback(() => {
    window.mirehub.ssh.openDirectory()
  }, [])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  const sectionLabel = (id: SettingsSection): string => {
    const map: Record<SettingsSection, string> = {
      general: t('settings.general'),
      appearance: t('settings.appearance'),
      terminal: t('settings.terminal'),
      git: t('settings.git'),
      ssh: t('settings.ssh'),
      claude: t('settings.claude'),
      kanban: t('settings.kanban'),
      notifications: t('settings.notifications'),
      about: t('settings.about'),
    }
    return map[id]
  }

  return (
    <div className="settings-panel settings-panel--split">
      {/* Navigation sidebar */}
      <nav className="settings-nav">
        <h3 className="settings-nav-title">{t('settings.title')}</h3>
        <ul className="settings-nav-list">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <button
                className={`settings-nav-item${activeSection === section.id ? ' settings-nav-item--active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-nav-icon">{section.icon}</span>
                <span className="settings-nav-label">{sectionLabel(section.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content area */}
      <div className="settings-content">
        <div className="settings-content-header">
          <h3>{sectionLabel(activeSection)}</h3>
        </div>
        <div className="settings-content-body">

          {/* General */}
          {activeSection === 'general' && (
            <div className="settings-section">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.language')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Langue de l\'interface' : 'Interface language'}</span>
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
            </div>
          )}

          {/* Appearance */}
          {activeSection === 'appearance' && (
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
          )}

          {/* Terminal */}
          {activeSection === 'terminal' && (
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
          )}

          {/* Git */}
          {activeSection === 'git' && (
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
                          onClick={handleGitReset}
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
          )}

          {/* SSH */}
          {activeSection === 'ssh' && (
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
                          <button className="ssh-btn ssh-btn--small ssh-btn--danger" onClick={() => handleDeleteKey(key)}>
                            {t('settings.sshDelete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Claude */}
          {activeSection === 'claude' && (
            <div className="settings-section">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.detectionColor')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Couleur des indicateurs Claude dans les terminaux' : 'Color of Claude indicators in terminals'}</span>
                  </div>
                  <input
                    type="color"
                    value={settings.claudeDetectionColor}
                    onChange={(e) => updateSetting('claudeDetectionColor', e.target.value)}
                    className="settings-color-input"
                  />
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.autoClaude')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Activer le lancement automatique des sessions Claude' : 'Enable automatic Claude session launching'}</span>
                  </div>
                  <button
                    className={`settings-toggle${settings.autoClauderEnabled ? ' settings-toggle--active' : ''}`}
                    onClick={() => updateSetting('autoClauderEnabled', !settings.autoClauderEnabled)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.autoApprove')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Approuver automatiquement toutes les actions Claude (outils, commandes, etc.)' : 'Automatically approve all Claude actions (tools, commands, etc.)'}</span>
                  </div>
                  <button
                    className={`settings-toggle${settings.autoApprove ? ' settings-toggle--active' : ''}`}
                    onClick={() => updateSetting('autoApprove', !settings.autoApprove)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Kanban */}
          {activeSection === 'kanban' && (
            <div className="settings-section">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.autoCloseCompletedTerminals')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Ferme automatiquement les terminaux des tickets termines' : 'Automatically close terminals of completed tickets'}</span>
                  </div>
                  <button
                    className={`settings-toggle${settings.autoCloseCompletedTerminals ? ' settings-toggle--active' : ''}`}
                    onClick={() => updateSetting('autoCloseCompletedTerminals', !settings.autoCloseCompletedTerminals)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.autoCloseCtoTerminals')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Ferme automatiquement les terminaux des sessions CTO terminees' : 'Automatically close terminals when CTO sessions end'}</span>
                  </div>
                  <button
                    className={`settings-toggle${settings.autoCloseCtoTerminals ? ' settings-toggle--active' : ''}`}
                    onClick={() => updateSetting('autoCloseCtoTerminals', !settings.autoCloseCtoTerminals)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <div className="settings-section">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.sound')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Jouer un son lors des notifications' : 'Play a sound on notifications'}</span>
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
                    <span className="settings-hint">{locale === 'fr' ? 'Afficher une pastille sur l\'icone du dock' : 'Show a badge on the dock icon'}</span>
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
                    <span className="settings-hint">{locale === 'fr' ? 'Verifier les mises a jour au demarrage de l\'application' : 'Check for updates when the application starts'}</span>
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
          )}

          {/* About */}
          {activeSection === 'about' && (
            <div className="settings-section">
              <div className="settings-card settings-card--about">
                <div className="settings-about-header">
                  <span className="settings-about-icon">M</span>
                  <div>
                    <div className="settings-about-name">{appVersion?.name ?? 'Mirehub'}</div>
                    <div className="settings-about-version">v{appVersion?.version ?? '—'}</div>
                  </div>
                </div>
                {appVersion?.isElevated && (
                  <div className="settings-elevated-badge">
                    <span className="settings-elevated-icon">⚠</span>
                    <span>{t('settings.elevatedMode')}</span>
                  </div>
                )}
              </div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.developer')}</label>
                  </div>
                  <span className="settings-value">Antony KERVAZO CANUT</span>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('appUpdate.checkNow')}</label>
                    <span className="settings-hint">{locale === 'fr' ? 'Verifier si une nouvelle version est disponible' : 'Check if a new version is available'}</span>
                  </div>
                  <button
                    className="settings-btn"
                    onClick={checkForUpdate}
                    disabled={updateStatus === 'checking'}
                  >
                    {updateStatus === 'checking' ? t('common.loading') : t('appUpdate.checkNow')}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
