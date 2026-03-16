import { useState, useEffect } from 'react'
import { useI18n } from '../../../../lib/i18n'

interface DefaultProfile {
  id: string
  name: string
  description: string
  category: string
  content: string
  filename: string
}

interface Props {
  onCreateBlank: () => void
  onCreateFromTemplate: (profile: DefaultProfile) => void
  onClose: () => void
}

export function AddAgentModal({ onCreateBlank, onCreateFromTemplate, onClose }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'template' | 'blank'>('template')
  const [profiles, setProfiles] = useState<DefaultProfile[]>([])

  useEffect(() => {
    window.kanbai.claudeDefaults.profiles().then(setProfiles).catch(() => setProfiles([]))
  }, [])

  return (
    <div className="cs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cs-modal">
        <div className="cs-modal-header">
          <span className="cs-modal-title">{t('claude.createAgent')}</span>
          <button className="cs-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="cs-modal-body">
          <div className="cs-modal-choice-row">
            <button
              className={`cs-modal-choice-btn${mode === 'template' ? ' cs-modal-choice-btn--active' : ''}`}
              onClick={() => setMode('template')}
            >
              {t('claude.fromTemplateBtn')}
            </button>
            <button
              className={`cs-modal-choice-btn${mode === 'blank' ? ' cs-modal-choice-btn--active' : ''}`}
              onClick={() => { setMode('blank'); onCreateBlank() }}
            >
              {t('claude.blankAgent')}
            </button>
          </div>

          {mode === 'template' && profiles.length > 0 && (
            <>
              <label className="claude-rules-label" style={{ marginTop: 12 }}>{t('claude.pickTemplate')}</label>
              <div className="cs-modal-template-grid">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    className="cs-modal-template-card"
                    onClick={() => onCreateFromTemplate(profile)}
                  >
                    <div className="cs-modal-template-name">{profile.name}</div>
                    <div className="cs-modal-template-desc">{profile.description}</div>
                    <div className="cs-modal-template-cat">{profile.category}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="cs-modal-footer">
          <button className="modal-btn modal-btn--secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  )
}
