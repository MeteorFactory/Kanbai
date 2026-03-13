import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../lib/i18n'
import { CONFIGURABLE_TABS, ALL_TAB_IDS } from '../../shared/constants/tabs'

const SECTION_ICONS: Record<string, string> = {
  welcome: '👋',
  kanban: '📋',
  terminal: '▸',
  git: '⎇',
  database: '🗄',
  packages: '📦',
  analysis: '🔍',
  todos: '✓',
  stats: '📊',
  prompts: '💬',
  api: '🌐',
  settings: '⚙',
  search: '🔎',
  shortcuts: '⌨',
  claude: '✦',
  ai: '✦',
  healthcheck: '🏥',
}

interface TutorialModalProps {
  section: string
  onDone: () => void
  onDismissAll: () => void
}

const TAB_GROUP_LABELS: Record<string, { fr: string; en: string }> = {
  standalone: { fr: 'Principaux', en: 'Main' },
  services: { fr: 'Services', en: 'Services' },
  devops: { fr: 'Pipelines', en: 'Pipelines' },
  projects: { fr: 'Projets', en: 'Projects' },
}

const TAB_GROUP_ORDER = ['standalone', 'services', 'devops', 'projects'] as const

export function TutorialModal({ section, onDone, onDismissAll }: TutorialModalProps) {
  const { t, locale, setLocale } = useI18n()
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set(ALL_TAB_IDS))

  const toggleTab = useCallback((tabId: string) => {
    setSelectedTabs((prev) => {
      const next = new Set(prev)
      if (next.has(tabId)) {
        next.delete(tabId)
      } else {
        next.add(tabId)
      }
      return next
    })
  }, [])

  const handleWelcomeDone = useCallback(() => {
    const tabs = Array.from(selectedTabs)
    window.kanbai.settings.set({ defaultVisibleTabs: tabs })
    onDone()
  }, [selectedTabs, onDone])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onDismissAll()
    } else if (e.key === 'Enter') {
      onDone()
    }
  }, [onDone, onDismissAll])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const icon = SECTION_ICONS[section] ?? '📌'
  const titleKey = `tutorial.${section}.title`
  const descriptionKey = `tutorial.${section}.description`

  return (
    <div className="tutorial-modal-overlay" onClick={onDismissAll}>
      <div className="tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-modal-header">
          <span className="tutorial-modal-step-indicator">
            {t(titleKey)}
          </span>
          <button className="tutorial-modal-close" onClick={onDismissAll} title={t('tutorial.dismiss')}>
            ✕
          </button>
        </div>

        <div className="tutorial-modal-body">
          <div className="tutorial-modal-icon">{icon}</div>
          {section === 'welcome' && (
            <>
              <div className="tutorial-language-selector">
                <span className="tutorial-language-label">{t('tutorial.welcome.chooseLanguage')}</span>
                <div className="tutorial-language-buttons">
                  <button
                    className={`tutorial-lang-btn${locale === 'fr' ? ' tutorial-lang-btn--active' : ''}`}
                    onClick={() => setLocale('fr')}
                  >
                    Français
                  </button>
                  <button
                    className={`tutorial-lang-btn${locale === 'en' ? ' tutorial-lang-btn--active' : ''}`}
                    onClick={() => setLocale('en')}
                  >
                    English
                  </button>
                </div>
              </div>
              <div className="tutorial-tab-selector">
                <span className="tutorial-language-label">{t('tutorial.welcome.chooseTabs')}</span>
                <div className="tutorial-tab-groups">
                  {TAB_GROUP_ORDER.map((group) => {
                    const tabs = CONFIGURABLE_TABS.filter((tab) => tab.group === group)
                    if (tabs.length === 0) return null
                    return (
                      <div key={group} className="tutorial-tab-group">
                        <span className="tutorial-tab-group-label">
                          {TAB_GROUP_LABELS[group]?.[locale] ?? group}
                        </span>
                        <div className="tutorial-tab-buttons">
                          {tabs.map((tab) => (
                            <button
                              key={tab.id}
                              className={`settings-radio-btn${selectedTabs.has(tab.id) ? ' settings-radio-btn--active' : ''}`}
                              onClick={() => toggleTab(tab.id)}
                            >
                              {t(tab.labelKey)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
          <h2 className="tutorial-modal-title">{t(titleKey)}</h2>
          <p className="tutorial-modal-description">{t(descriptionKey)}</p>
        </div>

        <div className="tutorial-modal-actions">
          <button className="tutorial-modal-btn tutorial-modal-btn--secondary" onClick={onDismissAll}>
            {t('tutorial.dismiss')}
          </button>
          <button className="tutorial-modal-btn tutorial-modal-btn--primary" onClick={section === 'welcome' ? handleWelcomeDone : onDone}>
            {t('tutorial.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
