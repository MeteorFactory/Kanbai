import { useState, useEffect } from 'react'
import { useI18n } from '../../lib/i18n'

interface DefaultProfile {
  id: string
  name: string
  description: string
  category: string
  content: string
  filename: string
}

interface Props {
  onCreateFromTemplate: (profile: DefaultProfile) => void
}

export function AgentTemplateGallery({ onCreateFromTemplate }: Props) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<DefaultProfile[]>([])

  useEffect(() => {
    window.kanbai.claudeDefaults.profiles().then(setProfiles).catch(() => setProfiles([]))
  }, [])

  if (profiles.length === 0) return null

  return (
    <div className="cs-template-section">
      <label className="claude-rules-label">{t('claude.templateGallery')}</label>
      <div className="cs-template-grid">
        {profiles.map((profile) => (
          <button key={profile.id} className="cs-template-card" onClick={() => onCreateFromTemplate(profile)}>
            <div className="cs-template-card-top">
              <span className="cs-template-card-icon">{'\u{1F916}'}</span>
              <span className="cs-template-card-name">{profile.name}</span>
            </div>
            <div className="cs-template-card-desc">{profile.description}</div>
            <div className="cs-template-card-footer">
              <span className="cs-template-card-cat">{profile.category}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
