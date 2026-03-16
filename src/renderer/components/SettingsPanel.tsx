import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppSettings, SshKeyInfo, SshKeyType, Namespace, KanbanConfig, AiDefaults } from '../../shared/types'
import type { AiProviderId } from '../../shared/types/ai-provider'
import { AI_PROVIDERS } from '../../shared/types/ai-provider'
import { useI18n } from '../lib/i18n'
import { useAppUpdateStore } from '../lib/stores/appUpdateStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useUpdateStore } from '../lib/stores/updateStore'
import { AiProviderSelector } from '../features/claude'
import { CONFIGURABLE_TABS, ALL_TAB_IDS } from '../../shared/constants/tabs'

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
  claudeDetectionColor: '#C15F3C',
  codexDetectionColor: '#10a37f',
  copilotDetectionColor: '#e2538a',
  geminiDetectionColor: '#4285F4',
  defaultAiProvider: 'claude',
  autoClauderEnabled: false,
  notificationSound: true,
  notificationBadge: true,
  checkUpdatesOnLaunch: true,
  toolAutoCheckEnabled: true,
  autoCloseCompletedTerminals: false,
  autoCloseCtoTerminals: true,
  autoApprove: true,
  tutorialCompleted: false,
  tutorialSeenSections: [],
  autoCreateAiMemoryRefactorTickets: true,
}

type SettingsSection = 'general' | 'appearance' | 'tabs' | 'terminal' | 'git' | 'ssh' | 'claude' | 'ai' | 'kanban' | 'tools' | 'notifications' | 'about'

const SECTIONS: { id: SettingsSection; icon: string }[] = [
  { id: 'general', icon: '⚙' },
  { id: 'appearance', icon: '🎨' },
  { id: 'tabs', icon: '◫' },
  { id: 'terminal', icon: '▸' },
  { id: 'kanban', icon: '▦' },
  { id: 'git', icon: '⎇' },
  { id: 'ssh', icon: '🔑' },
  { id: 'ai', icon: '✦' },
  { id: 'tools', icon: '⬆' },
  { id: 'notifications', icon: '🔔' },
  { id: 'about', icon: 'ℹ' },
]

function isSettingsSection(value: string | null): value is SettingsSection {
  return value !== null && SECTIONS.some((section) => section.id === value)
}

export function SettingsPanel() {
  const { t, locale, setLocale } = useI18n()
  const {
    status: appUpdateStatus,
    version: appUpdateVersion,
    downloadPercent,
    errorMessage: appUpdateError,
    checkForUpdate,
    downloadUpdate,
    installUpdate: installAppUpdate,
  } = useAppUpdateStore()
  const {
    updates: toolUpdates,
    isChecking: toolsChecking,
    lastChecked: toolsLastChecked,
    installingTool,
    installStatus,
    checkUpdates: checkToolUpdates,
    installUpdate: installToolUpdate,
    uninstallUpdate: uninstallToolUpdate,
    clearInstallStatus: clearToolInstallStatus,
  } = useUpdateStore()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [appVersion, setAppVersion] = useState<{ version: string; name: string; isElevated?: boolean } | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  // Workspace store for kanban config
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? ''

  // Kanban config state
  const [kanbanDefaultConfig, setKanbanDefaultConfig] = useState<KanbanConfig | null>(null)
  const [kanbanProjectConfig, setKanbanProjectConfig] = useState<KanbanConfig | null>(null)
  const [kanbanProjectLoading, setKanbanProjectLoading] = useState(false)

  // AI defaults config state
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)
  const projects = useWorkspaceStore((s) => s.projects)
  const activeProjectName = projects.find((p) => p.id === activeProjectId)?.name ?? ''
  const [aiGlobalDefaults, setAiGlobalDefaults] = useState<AiDefaults | null>(null)
  const [aiProjectDefaults, setAiProjectDefaults] = useState<AiDefaults | null>(null)
  const [aiProjectLoading, setAiProjectLoading] = useState(false)

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

  // Copy error state for tool update errors
  const [toolErrorCopied, setToolErrorCopied] = useState(false)
  const toolErrorCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadGitConfig = useCallback(async (nsId: string) => {
    if (!nsId) return
    setGitLoading(true)
    try {
      const config = await window.kanbai.gitConfig.get(nsId)
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
      const result = await window.kanbai.gitConfig.set(selectedNamespaceId, gitUserName, gitUserEmail)
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
      await window.kanbai.gitConfig.delete(selectedNamespaceId)
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
      const result = await window.kanbai.ssh.listKeys()
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
    window.kanbai.settings.get().then((s: AppSettings) => {
      setSettings({ ...DEFAULT_SETTINGS, ...s })
      if (s.locale) {
        setLocale(s.locale)
      }
      setLoading(false)
    })
    window.kanbai.app.version().then(setAppVersion)
    loadSshKeys()
    // Load namespaces for git config section
    window.kanbai.namespace.list().then((nsList) => {
      setNamespaces(nsList)
      const defaultNs = nsList.find((ns) => ns.isDefault)
      if (defaultNs) {
        setSelectedNamespaceId(defaultNs.id)
        loadGitConfig(defaultNs.id)
      }
    })
  }, [setLocale, loadSshKeys, loadGitConfig])

  useEffect(() => {
    const fromStorage = window.sessionStorage.getItem('kanbai:settingsSection')
    if (isSettingsSection(fromStorage)) {
      setActiveSection(fromStorage)
      window.sessionStorage.removeItem('kanbai:settingsSection')
    }

    const handleOpenSection = (event: Event) => {
      const custom = event as CustomEvent<{ section?: string }>
      const section = custom.detail?.section ?? null
      if (isSettingsSection(section)) {
        setActiveSection(section)
      }
    }
    window.addEventListener('kanbai:open-settings-section', handleOpenSection as EventListener)
    return () => window.removeEventListener('kanbai:open-settings-section', handleOpenSection as EventListener)
  }, [])

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    window.kanbai.settings.set({ [key]: value })

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
      const result = await window.kanbai.ssh.generateKey(genName.trim(), genType, genComment.trim())
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
      const result = await window.kanbai.ssh.importKey(
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
      const result = await window.kanbai.ssh.selectKeyFile()
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
      const result = await window.kanbai.ssh.readPublicKey(key.publicKeyPath)
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
      const result = await window.kanbai.ssh.deleteKey(key.name)
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
    window.kanbai.ssh.openDirectory()
  }, [])

  useEffect(() => {
    if (activeSection !== 'kanban') return
    window.kanbai.kanban.getDefaultConfig().then(setKanbanDefaultConfig).catch(() => {})
    if (activeWorkspaceId) {
      setKanbanProjectLoading(true)
      window.kanbai.kanban.getConfig(activeWorkspaceId).then(setKanbanProjectConfig).catch(() => {
        setKanbanProjectConfig(null)
      }).finally(() => {
        setKanbanProjectLoading(false)
      })
    }
  }, [activeSection, activeWorkspaceId])

  useEffect(() => {
    if (activeSection !== 'ai') return
    window.kanbai.aiDefaults.getGlobal().then(setAiGlobalDefaults).catch(() => {})
    if (activeProjectId) {
      setAiProjectLoading(true)
      window.kanbai.aiDefaults.get(activeProjectId).then((d: AiDefaults) => {
        setAiProjectDefaults(d ?? {})
      }).catch(() => {
        setAiProjectDefaults(null)
      }).finally(() => {
        setAiProjectLoading(false)
      })
    }
  }, [activeSection, activeProjectId])

  useEffect(() => {
    if (activeSection !== 'tools') return
    if (toolUpdates.length > 0) return
    checkToolUpdates()
  }, [activeSection, toolUpdates.length, checkToolUpdates])

  useEffect(() => {
    if (!installStatus?.success) return
    const timer = setTimeout(() => clearToolInstallStatus(), 5000)
    return () => clearTimeout(timer)
  }, [installStatus, clearToolInstallStatus])

  const handleToolInstall = useCallback((tool: string, scope: 'global' | 'project' | 'unit') => {
    installToolUpdate(tool, scope)
  }, [installToolUpdate])

  const handleToolUninstall = useCallback((tool: string) => {
    uninstallToolUpdate(tool)
  }, [uninstallToolUpdate])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  const sectionLabel = (id: SettingsSection): string => {
    const map: Record<SettingsSection, string> = {
      general: t('settings.general'),
      appearance: t('settings.appearance'),
      tabs: t('settings.tabs'),
      terminal: t('settings.terminal'),
      git: t('settings.git'),
      ssh: t('settings.ssh'),
      claude: t('settings.claude'),
      ai: t('settings.ai') ?? t('settings.claude'),
      kanban: t('settings.kanban'),
      tools: t('settings.tools'),
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

          {/* Tabs */}
          {activeSection === 'tabs' && (
            <div className="settings-section">
              {/* Workspace-level visible tabs */}
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.tabsWorkspace')}</label>
                    <span className="settings-hint">{t('settings.tabsWorkspaceHint')}{activeWorkspaceName ? ` (${activeWorkspaceName})` : ''}</span>
                  </div>
                </div>
                <div className="settings-tab-grid">
                  {CONFIGURABLE_TABS.map((tab) => {
                    const wsTabs = activeWorkspaceId
                      ? (workspaces.find((w) => w.id === activeWorkspaceId)?.visibleTabs ?? ALL_TAB_IDS)
                      : ALL_TAB_IDS
                    const isActive = wsTabs.includes(tab.id)
                    return (
                      <button
                        key={tab.id}
                        className={`settings-radio-btn${isActive ? ' settings-radio-btn--active' : ''}`}
                        onClick={() => {
                          if (!activeWorkspaceId) return
                          const current = workspaces.find((w) => w.id === activeWorkspaceId)?.visibleTabs ?? [...ALL_TAB_IDS]
                          const next = isActive
                            ? current.filter((id) => id !== tab.id)
                            : [...current, tab.id]
                          const ws = useWorkspaceStore.getState()
                          ws.updateWorkspace(activeWorkspaceId, { visibleTabs: next })
                        }}
                      >
                        {t(tab.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Default tabs for new workspaces */}
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.tabsDefault')}</label>
                    <span className="settings-hint">{t('settings.tabsDefaultHint')}</span>
                  </div>
                </div>
                <div className="settings-tab-grid">
                  {CONFIGURABLE_TABS.map((tab) => {
                    const defaultTabs = settings.defaultVisibleTabs ?? ALL_TAB_IDS
                    const isActive = defaultTabs.includes(tab.id)
                    return (
                      <button
                        key={tab.id}
                        className={`settings-radio-btn${isActive ? ' settings-radio-btn--active' : ''}`}
                        onClick={() => {
                          const current = settings.defaultVisibleTabs ?? [...ALL_TAB_IDS]
                          const next = isActive
                            ? current.filter((id) => id !== tab.id)
                            : [...current, tab.id]
                          updateSetting('defaultVisibleTabs', next)
                        }}
                      >
                        {t(tab.labelKey)}
                      </button>
                    )
                  })}
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

          {/* Kanban */}
          {activeSection === 'kanban' && (
            <div className="settings-section">
              {/* Default config (editable) */}
              <h4 className="settings-section-subtitle">{t('settings.kanbanDefaultConfig')}</h4>
              <p className="settings-section-hint">{t('settings.kanbanDefaultConfigHint')}</p>
              {kanbanDefaultConfig && (
                <div className="settings-card">
                  {([
                    { key: 'autoCloseCompletedTerminals' as const, label: t('kanban.autoCloseCompletedTerminals'), hint: t('kanban.autoCloseCompletedTerminalsHint') },
                    { key: 'autoCloseCtoTerminals' as const, label: t('kanban.autoCloseCtoTerminals'), hint: t('kanban.autoCloseCtoTerminalsHint') },
                    { key: 'autoCreateAiMemoryRefactorTickets' as const, label: t('kanban.autoCreateAiMemoryRefactorTickets'), hint: t('kanban.autoCreateAiMemoryRefactorTicketsHint') },
                    { key: 'autoPrequalifyTickets' as const, label: t('kanban.autoPrequalifyTickets'), hint: t('kanban.autoPrequalifyTicketsHint') },
                    { key: 'autoPrioritizeBugs' as const, label: t('kanban.autoPrioritizeBugs'), hint: t('kanban.autoPrioritizeBugsHint') },
                    { key: 'useWorktrees' as const, label: t('kanban.useWorktrees'), hint: t('kanban.useWorktreesHint') },
                  ]).map(({ key, label, hint }) => (
                    <div key={key} className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{label}</label>
                        <span className="settings-hint">{hint}</span>
                      </div>
                      <button
                        className={`settings-toggle${kanbanDefaultConfig[key] ? ' settings-toggle--active' : ''}`}
                        onClick={async () => {
                          const updated = await window.kanbai.kanban.setDefaultConfig({ [key]: !kanbanDefaultConfig[key] })
                          setKanbanDefaultConfig(updated)
                        }}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                  ))}
                  {kanbanDefaultConfig.useWorktrees && (
                    <>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{t('kanban.autoMergeWorktrees')}</label>
                        <span className="settings-hint">{t('kanban.autoMergeWorktreesHint')}</span>
                      </div>
                      <button
                        className={`settings-toggle${kanbanDefaultConfig.autoMergeWorktrees ? ' settings-toggle--active' : ''}`}
                        onClick={async () => {
                          const updated = await window.kanbai.kanban.setDefaultConfig({ autoMergeWorktrees: !kanbanDefaultConfig.autoMergeWorktrees })
                          setKanbanDefaultConfig(updated)
                        }}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{t('kanban.maxConcurrentWorktrees')}</label>
                        <span className="settings-hint">{t('kanban.maxConcurrentWorktreesHint')}</span>
                      </div>
                      <input
                        type="number"
                        className="kanban-settings-number-input"
                        min={1}
                        max={10}
                        value={kanbanDefaultConfig.maxConcurrentWorktrees}
                        onChange={async (e) => {
                          const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                          const updated = await window.kanbai.kanban.setDefaultConfig({ maxConcurrentWorktrees: val })
                          setKanbanDefaultConfig(updated)
                        }}
                      />
                    </div>
                    </>
                  )}
                </div>
              )}

              {/* Workspace-specific config (editable) */}
              <h4 className="settings-section-subtitle" style={{ marginTop: 24 }}>
                {t('settings.kanbanWorkspaceConfig')}
                {activeWorkspaceName && <span className="settings-section-subtitle-badge">{activeWorkspaceName}</span>}
              </h4>
              <p className="settings-section-hint">{t('settings.kanbanWorkspaceConfigHint')}</p>
              {!activeWorkspaceId && (
                <div className="settings-card">
                  <div className="settings-row">
                    <span className="settings-hint">{t('settings.kanbanNoWorkspace')}</span>
                  </div>
                </div>
              )}
              {activeWorkspaceId && kanbanProjectLoading && (
                <div className="settings-card">
                  <div className="settings-row">
                    <span className="settings-hint">{t('common.loading')}</span>
                  </div>
                </div>
              )}
              {activeWorkspaceId && kanbanProjectConfig && !kanbanProjectLoading && (
                <div className="settings-card">
                  {([
                    { key: 'autoCloseCompletedTerminals' as const, label: t('kanban.autoCloseCompletedTerminals'), hint: t('kanban.autoCloseCompletedTerminalsHint') },
                    { key: 'autoCloseCtoTerminals' as const, label: t('kanban.autoCloseCtoTerminals'), hint: t('kanban.autoCloseCtoTerminalsHint') },
                    { key: 'autoCreateAiMemoryRefactorTickets' as const, label: t('kanban.autoCreateAiMemoryRefactorTickets'), hint: t('kanban.autoCreateAiMemoryRefactorTicketsHint') },
                    { key: 'autoPrequalifyTickets' as const, label: t('kanban.autoPrequalifyTickets'), hint: t('kanban.autoPrequalifyTicketsHint') },
                    { key: 'autoPrioritizeBugs' as const, label: t('kanban.autoPrioritizeBugs'), hint: t('kanban.autoPrioritizeBugsHint') },
                    { key: 'useWorktrees' as const, label: t('kanban.useWorktrees'), hint: t('kanban.useWorktreesHint') },
                  ]).map(({ key, label, hint }) => (
                    <div key={key} className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{label}</label>
                        <span className="settings-hint">{hint}</span>
                      </div>
                      <button
                        className={`settings-toggle${kanbanProjectConfig[key] ? ' settings-toggle--active' : ''}`}
                        onClick={async () => {
                          const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { [key]: !kanbanProjectConfig[key] })
                          setKanbanProjectConfig(updated)
                        }}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                  ))}
                  {kanbanProjectConfig.useWorktrees && (
                    <>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{t('kanban.autoMergeWorktrees')}</label>
                        <span className="settings-hint">{t('kanban.autoMergeWorktreesHint')}</span>
                      </div>
                      <button
                        className={`settings-toggle${kanbanProjectConfig.autoMergeWorktrees ? ' settings-toggle--active' : ''}`}
                        onClick={async () => {
                          const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { autoMergeWorktrees: !kanbanProjectConfig.autoMergeWorktrees })
                          setKanbanProjectConfig(updated)
                        }}
                      >
                        <span className="settings-toggle-knob" />
                      </button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{t('kanban.maxConcurrentWorktrees')}</label>
                        <span className="settings-hint">{t('kanban.maxConcurrentWorktreesHint')}</span>
                      </div>
                      <input
                        type="number"
                        className="kanban-settings-number-input"
                        min={1}
                        max={10}
                        value={kanbanProjectConfig.maxConcurrentWorktrees}
                        onChange={async (e) => {
                          const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                          const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { maxConcurrentWorktrees: val })
                          setKanbanProjectConfig(updated)
                        }}
                      />
                    </div>
                    </>
                  )}
                  <div className="settings-row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <button
                      className="settings-btn"
                      onClick={async () => {
                        if (!confirm(t('settings.kanbanResetConfirm'))) return
                        const defaults = await window.kanbai.kanban.getDefaultConfig()
                        const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, defaults)
                        setKanbanProjectConfig(updated)
                      }}
                    >
                      {t('settings.kanbanResetToDefaults')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI */}
          {activeSection === 'ai' && (
            <div className="settings-section">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.detectionColor')}</label>
                    <span className="settings-hint">{t('settings.claudeColorHint')}</span>
                  </div>
                  <input
                    type="color"
                    value={settings.claudeDetectionColor}
                    onChange={(e) => updateSetting('claudeDetectionColor', e.target.value)}
                    className="settings-color-input"
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.codexColor')}</label>
                    <span className="settings-hint">{t('settings.codexColorHint')}</span>
                  </div>
                  <input
                    type="color"
                    value={settings.codexDetectionColor}
                    onChange={(e) => updateSetting('codexDetectionColor', e.target.value)}
                    className="settings-color-input"
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.copilotColor')}</label>
                    <span className="settings-hint">{t('settings.copilotColorHint')}</span>
                  </div>
                  <input
                    type="color"
                    value={settings.copilotDetectionColor}
                    onChange={(e) => updateSetting('copilotDetectionColor', e.target.value)}
                    className="settings-color-input"
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.geminiColor')}</label>
                    <span className="settings-hint">{t('settings.geminiColorHint')}</span>
                  </div>
                  <input
                    type="color"
                    value={settings.geminiDetectionColor}
                    onChange={(e) => updateSetting('geminiDetectionColor', e.target.value)}
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

              {/* Global AI defaults */}
              <h4 className="settings-section-subtitle" style={{ marginTop: 24 }}>{t('settings.aiDefaultConfig')}</h4>
              <p className="settings-section-hint">{t('settings.aiDefaultConfigHint')}</p>
              {aiGlobalDefaults && (
                <div className="settings-card">
                  {([
                    { key: 'kanban' as const, label: t('settings.aiKanbanProvider'), hint: t('settings.aiKanbanProviderHint') },
                    { key: 'packages' as const, label: t('settings.aiPackagesProvider'), hint: t('settings.aiPackagesProviderHint') },
                    { key: 'database' as const, label: t('settings.aiDatabaseProvider'), hint: t('settings.aiDatabaseProviderHint') },
                  ]).map(({ key, label, hint }) => (
                    <div key={key} className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{label}</label>
                        <span className="settings-hint">{hint}</span>
                      </div>
                      <div className="ai-defaults-btns">
                        {(Object.keys(AI_PROVIDERS) as AiProviderId[]).map((id) => (
                          <button
                            key={id}
                            className={`ai-defaults-btn${aiGlobalDefaults[key] === id ? ' ai-defaults-btn--active' : ''}`}
                            style={
                              aiGlobalDefaults[key] === id
                                ? { backgroundColor: AI_PROVIDERS[id].detectionColor, borderColor: AI_PROVIDERS[id].detectionColor, color: '#fff' }
                                : undefined
                            }
                            onClick={async () => {
                              const modelDefaults: Partial<AiDefaults> = key === 'packages'
                                ? { packagesModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                                : key === 'database'
                                  ? { databaseModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                                  : {}
                              const updated = await window.kanbai.aiDefaults.setGlobal({ [key]: id, ...modelDefaults })
                              setAiGlobalDefaults(updated)
                            }}
                          >
                            {AI_PROVIDERS[id].displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Project-specific AI defaults */}
              <h4 className="settings-section-subtitle" style={{ marginTop: 24 }}>
                {t('settings.aiProjectConfig')}
                {activeProjectName && <span className="settings-section-subtitle-badge">{activeProjectName}</span>}
              </h4>
              <p className="settings-section-hint">{t('settings.aiProjectConfigHint')}</p>
              {!activeProjectId && (
                <div className="settings-card">
                  <div className="settings-row">
                    <span className="settings-hint">{t('settings.aiNoProject')}</span>
                  </div>
                </div>
              )}
              {activeProjectId && aiProjectLoading && (
                <div className="settings-card">
                  <div className="settings-row">
                    <span className="settings-hint">{t('common.loading')}</span>
                  </div>
                </div>
              )}
              {activeProjectId && aiProjectDefaults && !aiProjectLoading && (
                <div className="settings-card">
                  {([
                    { key: 'kanban' as const, label: t('settings.aiKanbanProvider'), hint: t('settings.aiKanbanProviderHint') },
                    { key: 'packages' as const, label: t('settings.aiPackagesProvider'), hint: t('settings.aiPackagesProviderHint') },
                    { key: 'database' as const, label: t('settings.aiDatabaseProvider'), hint: t('settings.aiDatabaseProviderHint') },
                  ]).map(({ key, label, hint }) => (
                    <div key={key} className="settings-row">
                      <div className="settings-row-info">
                        <label className="settings-label">{label}</label>
                        <span className="settings-hint">{hint}</span>
                      </div>
                      <div className="ai-defaults-btns">
                        {(Object.keys(AI_PROVIDERS) as AiProviderId[]).map((id) => (
                          <button
                            key={id}
                            className={`ai-defaults-btn${aiProjectDefaults[key] === id ? ' ai-defaults-btn--active' : ''}`}
                            style={
                              aiProjectDefaults[key] === id
                                ? { backgroundColor: AI_PROVIDERS[id].detectionColor, borderColor: AI_PROVIDERS[id].detectionColor, color: '#fff' }
                                : undefined
                            }
                            onClick={async () => {
                              const modelDefaults: Partial<AiDefaults> = key === 'packages'
                                ? { packagesModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                                : key === 'database'
                                  ? { databaseModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' }
                                  : {}
                              const next: AiDefaults = { ...aiProjectDefaults, [key]: id, ...modelDefaults }
                              await window.kanbai.aiDefaults.set(activeProjectId, next as unknown as Record<string, unknown>)
                              setAiProjectDefaults(next)
                              const { projects: currentProjects } = useWorkspaceStore.getState()
                              const updatedProjects = currentProjects.map((p) =>
                                p.id === activeProjectId ? { ...p, aiDefaults: next } : p,
                              )
                              useWorkspaceStore.setState({ projects: updatedProjects })
                            }}
                          >
                            {AI_PROVIDERS[id].displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="settings-row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <button
                      className="settings-btn"
                      onClick={async () => {
                        if (!confirm(t('settings.aiResetConfirm'))) return
                        const globalDefaults = await window.kanbai.aiDefaults.getGlobal()
                        await window.kanbai.aiDefaults.set(activeProjectId, globalDefaults as unknown as Record<string, unknown>)
                        setAiProjectDefaults(globalDefaults)
                        const { projects: currentProjects } = useWorkspaceStore.getState()
                        const updatedProjects = currentProjects.map((p) =>
                          p.id === activeProjectId ? { ...p, aiDefaults: globalDefaults } : p,
                        )
                        useWorkspaceStore.setState({ projects: updatedProjects })
                      }}
                    >
                      {t('settings.aiResetToDefaults')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tools */}
          {activeSection === 'tools' && (
            <div className="settings-section">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('settings.toolsAutoCheck')}</label>
                    <span className="settings-hint">{t('settings.toolsAutoCheckHint')}</span>
                  </div>
                  <button
                    className={`settings-toggle${settings.toolAutoCheckEnabled ? ' settings-toggle--active' : ''}`}
                    onClick={() => updateSetting('toolAutoCheckEnabled', !settings.toolAutoCheckEnabled)}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label className="settings-label">{t('updates.lastCheck', { time: toolsLastChecked ? new Date(toolsLastChecked).toLocaleTimeString(locale === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }) : t('time.never') })}</label>
                    <span className="settings-hint">{t('settings.toolsManageHint')}</span>
                  </div>
                  <button
                    className="settings-btn"
                    onClick={checkToolUpdates}
                    disabled={toolsChecking}
                  >
                    {toolsChecking ? t('common.loading') : t('updates.checkTooltip')}
                  </button>
                </div>
              </div>

              {installStatus && (
                <div
                  className={`notification-status ${installStatus.success ? 'notification-status--success' : 'notification-status--error'}`}
                >
                  {installStatus.success ? (
                    <span onClick={clearToolInstallStatus} className="notification-status-text">
                      {'\u2713'} {t('updates.updated', { tool: installStatus.tool })}
                    </span>
                  ) : (
                    <div className="notification-status-error">
                      <span className="notification-status-text" onClick={clearToolInstallStatus}>
                        {'\u2717'} {t('updates.failedUpdate', { tool: installStatus.tool, error: installStatus.error || '' })}
                      </span>
                      <button
                        className="notification-status-copy"
                        title={t('updates.copyError')}
                        onClick={() => {
                          navigator.clipboard.writeText(installStatus.error || '')
                          setToolErrorCopied(true)
                          if (toolErrorCopiedTimerRef.current) clearTimeout(toolErrorCopiedTimerRef.current)
                          toolErrorCopiedTimerRef.current = setTimeout(() => setToolErrorCopied(false), 2000)
                        }}
                      >
                        {toolErrorCopied ? '\u2713' : '\u2398'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Kanbai app entry */}
              <div className="settings-card">
                <div
                  className={`notification-item${appUpdateStatus === 'available' ? ' notification-item--update' : ''}`}
                >
                  <div className="notification-item-info">
                    <span className="notification-item-name">Kanbai</span>
                    <span className="notification-item-version">
                      {appVersion?.version ?? '—'}
                      {appUpdateStatus === 'available' && appUpdateVersion && (
                        <> {' \u2192 '} <span className="notification-item-latest">{appUpdateVersion}</span> </>
                      )}
                    </span>
                    <span className="notification-item-scope">{t('appUpdate.appScope')}</span>
                  </div>
                  <div className="notification-item-actions">
                    {appUpdateStatus === 'available' && (
                      <button className="notification-item-btn" onClick={downloadUpdate}>
                        {t('appUpdate.download')}
                      </button>
                    )}
                    {appUpdateStatus === 'downloading' && (
                      <button className="notification-item-btn" disabled>
                        {downloadPercent}%
                      </button>
                    )}
                    {appUpdateStatus === 'downloaded' && (
                      <button className="notification-item-btn" onClick={installAppUpdate}>
                        {t('appUpdate.installAndRestart')}
                      </button>
                    )}
                    {(appUpdateStatus === 'idle' || appUpdateStatus === 'not-available' || appUpdateStatus === 'checking') && (
                      <button
                        className="notification-item-btn"
                        onClick={checkForUpdate}
                        disabled={appUpdateStatus === 'checking'}
                      >
                        {appUpdateStatus === 'checking' ? t('appUpdate.checking') : t('appUpdate.checkNow')}
                      </button>
                    )}
                    {appUpdateStatus === 'error' && (
                      <button className="notification-item-btn" onClick={checkForUpdate}>
                        {t('appUpdate.retry')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="settings-card">
                {toolUpdates.length === 0 && !toolsChecking ? (
                  <p className="notification-empty">{t('updates.noInfo')}</p>
                ) : (
                  <div className="notification-panel-content">
                    {[...toolUpdates]
                      .sort((a, b) => Number(b.updateAvailable) - Number(a.updateAvailable) || Number(a.installed) - Number(b.installed) || a.tool.localeCompare(b.tool))
                      .map((update) => (
                        <div
                          key={`${update.tool}-${update.scope}`}
                          className={`notification-item${update.updateAvailable ? ' notification-item--update' : ''}${!update.installed ? ' notification-item--missing' : ''}`}
                        >
                          <div className="notification-item-info">
                            <span className="notification-item-name">{update.tool}</span>
                            {update.installed ? (
                              <span className="notification-item-version">
                                {update.currentVersion}
                                {update.updateAvailable && (
                                  <> {' \u2192 '} <span className="notification-item-latest">{update.latestVersion.split('+')[0]}</span> </>
                                )}
                              </span>
                            ) : (
                              <span className="notification-item-version notification-item-version--missing">
                                {t('updates.notInstalled')}
                              </span>
                            )}
                            <span className="notification-item-scope">{update.scope}</span>
                          </div>
                          <div className="notification-item-actions">
                            {update.installed && update.updateAvailable && (
                              <button
                                className="notification-item-btn"
                                onClick={() => handleToolInstall(update.tool, update.scope)}
                                disabled={installingTool === update.tool}
                              >
                                {installingTool === update.tool ? (
                                  <span className="notification-spinner">{'\u21BB'}</span>
                                ) : t('updates.update')}
                              </button>
                            )}
                            {!update.installed && update.canInstall && (
                              <button
                                className="notification-item-btn notification-item-btn--install"
                                onClick={() => handleToolInstall(update.tool, update.scope)}
                                disabled={installingTool === update.tool}
                              >
                                {installingTool === update.tool ? (
                                  <span className="notification-spinner">{'\u21BB'}</span>
                                ) : t('updates.install')}
                              </button>
                            )}
                            {update.installed && update.canUninstall && (
                              <button
                                className="notification-item-btn notification-item-btn--uninstall"
                                onClick={() => handleToolUninstall(update.tool)}
                                disabled={installingTool === update.tool}
                              >
                                {installingTool === update.tool ? (
                                  <span className="notification-spinner">{'\u21BB'}</span>
                                ) : t('updates.uninstall')}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
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
                    <div className="settings-about-name">{appVersion?.name ?? 'Kanbai'}</div>
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
                    <span className="settings-hint">
                      {appUpdateStatus === 'available' && appUpdateVersion
                        ? t('appUpdate.newVersion', { version: appUpdateVersion })
                        : appUpdateStatus === 'downloading'
                          ? t('appUpdate.downloading')
                          : appUpdateStatus === 'downloaded'
                            ? t('appUpdate.ready')
                            : appUpdateStatus === 'error'
                              ? t('appUpdate.error')
                              : (locale === 'fr' ? 'Verifier si une nouvelle version est disponible' : 'Check if a new version is available')}
                    </span>
                  </div>
                  {appUpdateStatus === 'available' && (
                    <button className="settings-btn" onClick={downloadUpdate}>
                      {t('appUpdate.download')}
                    </button>
                  )}
                  {appUpdateStatus === 'downloading' && (
                    <button className="settings-btn" disabled>
                      {downloadPercent}%
                    </button>
                  )}
                  {appUpdateStatus === 'downloaded' && (
                    <button className="settings-btn" onClick={installAppUpdate}>
                      {t('appUpdate.installAndRestart')}
                    </button>
                  )}
                  {(appUpdateStatus === 'idle' || appUpdateStatus === 'not-available' || appUpdateStatus === 'checking') && (
                    <button
                      className="settings-btn"
                      onClick={checkForUpdate}
                      disabled={appUpdateStatus === 'checking'}
                    >
                      {appUpdateStatus === 'checking' ? t('common.loading') : t('appUpdate.checkNow')}
                    </button>
                  )}
                  {appUpdateStatus === 'error' && (
                    <button className="settings-btn" onClick={checkForUpdate}>
                      {t('appUpdate.retry')}
                    </button>
                  )}
                </div>
                {appUpdateStatus === 'error' && appUpdateError && (
                  <div className="notification-status notification-status--error" style={{ marginTop: 8 }}>
                    <div className="notification-status-error">
                      <span className="notification-status-text">
                        {t('appUpdate.errorDetail', { message: appUpdateError })}
                      </span>
                      <button
                        className="notification-status-copy"
                        title={t('updates.copyError')}
                        onClick={() => {
                          navigator.clipboard.writeText(appUpdateError)
                          setToolErrorCopied(true)
                          if (toolErrorCopiedTimerRef.current) clearTimeout(toolErrorCopiedTimerRef.current)
                          toolErrorCopiedTimerRef.current = setTimeout(() => setToolErrorCopied(false), 2000)
                        }}
                      >
                        {toolErrorCopied ? '\u2713' : '\u2398'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
