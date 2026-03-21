import { useState, useEffect } from 'react'
import { useI18n } from '../../lib/i18n'
import { useSettings } from './hooks/use-settings'
import { GeneralSettings } from './panels/general-settings'
import { AppearanceSettings } from './panels/appearance-settings'
import { TabsSettings } from './panels/tabs-settings'
import { TerminalSettings } from './panels/terminal-settings'
import { GitSettings } from './panels/git-settings'
import { SshSettings } from './panels/ssh-settings'
import { KanbanSettings } from './panels/kanban-settings'
import { AiSettings } from './panels/ai-settings'
import { ToolsSettings } from './panels/tools-settings'
import { NotificationsSettings } from './panels/notifications-settings'
import { AboutSettings } from './panels/about-settings'

type SettingsSection = 'general' | 'appearance' | 'tabs' | 'terminal' | 'git' | 'ssh' | 'claude' | 'ai' | 'kanban' | 'tools' | 'notifications' | 'about'

const SECTIONS: { id: SettingsSection; icon: string }[] = [
  { id: 'general', icon: '\u2699' },
  { id: 'appearance', icon: '\uD83C\uDFA8' },
  { id: 'tabs', icon: '\u25EB' },
  { id: 'terminal', icon: '\u25B8' },
  { id: 'kanban', icon: '\u25A6' },
  { id: 'git', icon: '\u2387' },
  { id: 'ssh', icon: '\uD83D\uDD11' },
  { id: 'ai', icon: '\u2726' },
  { id: 'tools', icon: '\u2B06' },
  { id: 'notifications', icon: '\uD83D\uDD14' },
  { id: 'about', icon: '\u2139' },
]

function isSettingsSection(value: string | null): value is SettingsSection {
  return value !== null && SECTIONS.some((section) => section.id === value)
}

export function SettingsPanel() {
  const { t } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  const {
    settings,
    setSettings,
    loading,
    appVersion,
    updateSetting,
    handleLocaleChange,
  } = useSettings()

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

      <div className="settings-content">
        <div className="settings-content-header">
          <h3>{sectionLabel(activeSection)}</h3>
        </div>
        <div className="settings-content-body">
          {activeSection === 'general' && (
            <GeneralSettings
              settings={settings}
              updateSetting={updateSetting}
              setSettings={setSettings}
              handleLocaleChange={handleLocaleChange}
            />
          )}

          {activeSection === 'appearance' && (
            <AppearanceSettings settings={settings} updateSetting={updateSetting} />
          )}

          {activeSection === 'tabs' && (
            <TabsSettings settings={settings} updateSetting={updateSetting} />
          )}

          {activeSection === 'terminal' && (
            <TerminalSettings settings={settings} updateSetting={updateSetting} />
          )}

          {activeSection === 'git' && <GitSettings />}

          {activeSection === 'ssh' && <SshSettings />}

          {activeSection === 'kanban' && <KanbanSettings />}

          {activeSection === 'ai' && (
            <AiSettings settings={settings} updateSetting={updateSetting} />
          )}

          {activeSection === 'tools' && (
            <ToolsSettings
              settings={settings}
              updateSetting={updateSetting}
              appVersion={appVersion}
            />
          )}

          {activeSection === 'notifications' && (
            <NotificationsSettings settings={settings} updateSetting={updateSetting} />
          )}

          {activeSection === 'about' && <AboutSettings appVersion={appVersion} />}
        </div>
      </div>
    </div>
  )
}
