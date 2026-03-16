import { useState, useEffect, useCallback } from 'react'
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
  projectPath: string
  onCustomize: (profile: DefaultProfile, isDeployed: boolean) => void
  onRefresh: () => void
}

export function DefaultAgentsSection({ projectPath, onCustomize, onRefresh }: Props) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<DefaultProfile[]>([])
  const [deployedIds, setDeployedIds] = useState<string[]>([])

  const load = useCallback(async () => {
    const [profs, deployed] = await Promise.all([
      window.kanbai.claudeDefaults.profiles(),
      window.kanbai.claudeDefaults.checkDeployed(projectPath),
    ])
    setProfiles(profs)
    setDeployedIds(deployed.deployedProfiles ?? [])
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const handleToggle = useCallback(async (profile: DefaultProfile) => {
    const isDeployed = deployedIds.includes(profile.id)
    if (isDeployed) {
      // Remove: delete the agent file
      await window.kanbai.claudeAgents.delete(projectPath, profile.filename)
    } else {
      // Deploy
      await window.kanbai.claudeDefaults.deployProfile(projectPath, profile.id)
    }
    await load()
    onRefresh()
  }, [deployedIds, projectPath, load, onRefresh])

  if (profiles.length === 0) return null

  return (
    <div className="cs-agents-section">
      <div className="claude-profile-section-header">
        <span className="claude-profile-section-title">{t('claude.defaultAgents')}</span>
      </div>
      <div className="cs-default-agents-grid">
        {profiles.map((profile) => {
          const isDeployed = deployedIds.includes(profile.id)
          return (
            <div key={profile.id} className={`cs-agent-card${!isDeployed ? ' cs-agent-card--disabled' : ''}`}>
              <div className="cs-agent-card-header">
                <span className={`cs-agent-card-status${isDeployed ? ' cs-agent-card-status--active' : ''}`} />
                <span className="cs-agent-card-name">{profile.name}</span>
                <button
                  className={`cs-switch cs-agent-card-toggle${isDeployed ? ' cs-switch--on' : ''}`}
                  onClick={() => handleToggle(profile)}
                >
                  <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
                </button>
              </div>
              <div className="cs-agent-card-desc">{profile.description}</div>
              <div className="cs-agent-card-actions">
                <button
                  className="modal-btn modal-btn--secondary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => onCustomize(profile, isDeployed)}
                >
                  {t('claude.customize')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
