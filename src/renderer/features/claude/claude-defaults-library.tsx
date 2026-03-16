import { useState, useEffect, useCallback } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useI18n } from '../../lib/i18n'
import type { DefaultProfile } from '../../../shared/constants/defaultProfiles'
import type { DefaultSkill } from '../../../shared/constants/defaultSkills'

interface Props {
  onDeploySuccess?: () => void
}

export function ClaudeDefaultsLibrary({ onDeploySuccess }: Props) {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  const [profiles, setProfiles] = useState<DefaultProfile[]>([])
  const [skills, setSkills] = useState<DefaultSkill[]>([])
  const [deployedProfiles, setDeployedProfiles] = useState<string[]>([])
  const [deployedSkills, setDeployedSkills] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [deploying, setDeploying] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        window.kanbai.claudeDefaults.profiles(),
        window.kanbai.claudeDefaults.skills(),
      ])
      setProfiles(p as DefaultProfile[])
      setSkills(s as DefaultSkill[])
    } catch {
      setProfiles([])
      setSkills([])
    }
  }, [])

  const checkDeployed = useCallback(async () => {
    if (!activeProject) return
    try {
      const result = await window.kanbai.claudeDefaults.checkDeployed(activeProject.path)
      setDeployedProfiles(result.deployedProfiles)
      setDeployedSkills(result.deployedSkills)
    } catch {
      setDeployedProfiles([])
      setDeployedSkills([])
    }
  }, [activeProject])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    checkDeployed()
  }, [checkDeployed])

  const handleDeployProfile = useCallback(async (profileId: string) => {
    if (!activeProject) return
    setDeploying(profileId)
    try {
      await window.kanbai.claudeDefaults.deployProfile(activeProject.path, profileId)
      setDeployedProfiles((prev) => [...prev, profileId])
      onDeploySuccess?.()
    } catch { /* ignore */ }
    setDeploying(null)
  }, [activeProject, onDeploySuccess])

  const handleDeploySkill = useCallback(async (skillId: string) => {
    if (!activeProject) return
    setDeploying(skillId)
    try {
      await window.kanbai.claudeDefaults.deploySkill(activeProject.path, skillId)
      setDeployedSkills((prev) => [...prev, skillId])
      onDeploySuccess?.()
    } catch { /* ignore */ }
    setDeploying(null)
  }, [activeProject, onDeploySuccess])

  const handleDeployAll = useCallback(async () => {
    if (!activeProject) return
    setDeploying('all')
    for (const p of profiles) {
      if (!deployedProfiles.includes(p.id)) {
        try {
          await window.kanbai.claudeDefaults.deployProfile(activeProject.path, p.id)
        } catch { /* continue */ }
      }
    }
    for (const s of skills) {
      if (!deployedSkills.includes(s.id)) {
        try {
          await window.kanbai.claudeDefaults.deploySkill(activeProject.path, s.id)
        } catch { /* continue */ }
      }
    }
    await checkDeployed()
    onDeploySuccess?.()
    setDeploying(null)
  }, [activeProject, profiles, skills, deployedProfiles, deployedSkills, checkDeployed, onDeploySuccess])

  if (!activeProject) {
    return <div className="claude-rules-empty">{t('claude.noProject')}</div>
  }

  const allCategories = new Set<string>()
  profiles.forEach((p) => allCategories.add(p.category))
  skills.forEach((s) => allCategories.add(s.category))

  const filteredProfiles = categoryFilter === 'all'
    ? profiles
    : profiles.filter((p) => p.category === categoryFilter)

  const filteredSkills = categoryFilter === 'all'
    ? skills
    : skills.filter((s) => s.category === categoryFilter)

  const totalUndeployed = profiles.filter((p) => !deployedProfiles.includes(p.id)).length
    + skills.filter((s) => !deployedSkills.includes(s.id)).length

  return (
    <div className="claude-library">
      <div className="claude-library-header">
        <div className="claude-library-filters">
          <button
            className={`claude-library-filter-btn${categoryFilter === 'all' ? ' claude-library-filter-btn--active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            {t('claude.allCategories')}
          </button>
          {[...allCategories].sort().map((cat) => (
            <button
              key={cat}
              className={`claude-library-filter-btn${categoryFilter === cat ? ' claude-library-filter-btn--active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        {totalUndeployed > 0 && (
          <button
            className="claude-library-deploy-all-btn"
            onClick={handleDeployAll}
            disabled={deploying !== null}
          >
            {deploying === 'all' ? t('common.loading') : t('claude.deployAll')}
          </button>
        )}
      </div>

      {filteredProfiles.length > 0 && (
        <div className="claude-library-section">
          <h3 className="claude-library-section-title">{t('claude.defaultProfiles')}</h3>
          <div className="claude-library-grid">
            {filteredProfiles.map((profile) => {
              const isDeployed = deployedProfiles.includes(profile.id)
              return (
                <div key={profile.id} className={`claude-library-card${isDeployed ? ' claude-library-card--deployed' : ''}`}>
                  <div className="claude-library-card-header">
                    <span className="claude-library-card-icon">&#x1F916;</span>
                    <span className="claude-library-card-name">{profile.name}</span>
                    <span className="claude-library-card-category">{profile.category}</span>
                  </div>
                  <p className="claude-library-card-desc">{profile.description}</p>
                  <div className="claude-library-card-actions">
                    {isDeployed ? (
                      <span className="claude-library-badge--deployed">{t('claude.deployed')}</span>
                    ) : (
                      <button
                        className="claude-library-deploy-btn"
                        onClick={() => handleDeployProfile(profile.id)}
                        disabled={deploying !== null}
                      >
                        {deploying === profile.id ? t('common.loading') : t('claude.deploy')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {filteredSkills.length > 0 && (
        <div className="claude-library-section">
          <h3 className="claude-library-section-title">{t('claude.defaultSkills')}</h3>
          <div className="claude-library-grid">
            {filteredSkills.map((skill) => {
              const isDeployed = deployedSkills.includes(skill.id)
              return (
                <div key={skill.id} className={`claude-library-card${isDeployed ? ' claude-library-card--deployed' : ''}`}>
                  <div className="claude-library-card-header">
                    <span className="claude-library-card-icon">&#x2699;</span>
                    <span className="claude-library-card-name">{skill.name}</span>
                    <span className="claude-library-card-category">{skill.category}</span>
                  </div>
                  <p className="claude-library-card-desc">{skill.description}</p>
                  <div className="claude-library-card-actions">
                    {isDeployed ? (
                      <span className="claude-library-badge--deployed">{t('claude.deployed')}</span>
                    ) : (
                      <button
                        className="claude-library-deploy-btn"
                        onClick={() => handleDeploySkill(skill.id)}
                        disabled={deploying !== null}
                      >
                        {deploying === skill.id ? t('common.loading') : t('claude.deploy')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
