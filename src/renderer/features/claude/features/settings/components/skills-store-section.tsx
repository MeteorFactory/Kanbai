import { useState, useCallback, useEffect, useMemo } from 'react'
import { useI18n } from '../../../../../lib/i18n'
import type { SkillStoreEntry, SkillStoreRepo } from '../../../../../../shared/types'

interface Props {
  projectPath: string
  installedSkillNames: Set<string>
  onInstalled: () => void
}

export function SkillsStoreSection({ projectPath, installedSkillNames, onInstalled }: Props) {
  const { t } = useI18n()
  const [repos, setRepos] = useState<SkillStoreRepo[]>([])
  const [skills, setSkills] = useState<SkillStoreEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [filterRepo, setFilterRepo] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchSkills = useCallback(async (force?: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.kanbai.skillsStore.fetch(force)
      setRepos(result.repos)
      setSkills(result.skills)
    } catch {
      setError(t('claude.skillsStoreError'))
    }
    setLoading(false)
  }, [t])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const handleInstall = useCallback(async (skill: SkillStoreEntry) => {
    setInstalling((prev) => new Set(prev).add(skill.id))
    try {
      const result = await window.kanbai.skillsStore.install(projectPath, skill)
      if (result.success) {
        onInstalled()
      }
    } catch {
      // Installation failed silently
    }
    setInstalling((prev) => {
      const next = new Set(prev)
      next.delete(skill.id)
      return next
    })
  }, [projectPath, onInstalled])

  const handleOpenRepo = useCallback(async (url: string) => {
    await window.kanbai.shell.openExternal(url)
  }, [])

  const filteredSkills = useMemo(() => {
    let result = skills
    if (filterRepo !== 'all') {
      result = result.filter((s) => s.repoId === filterRepo)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.filename.toLowerCase().includes(q)
      )
    }
    return result
  }, [skills, filterRepo, searchQuery])

  return (
    <div className="cs-agents-section">
      <div className="claude-profile-section-header">
        <span className="claude-profile-section-title">{t('claude.skillsStore')}</span>
        <button
          className="modal-btn modal-btn--secondary"
          style={{ fontSize: 11, padding: '3px 10px', marginLeft: 'auto' }}
          onClick={() => fetchSkills(true)}
          disabled={loading}
        >
          {loading ? t('claude.skillsStoreRefreshing') : t('claude.skillsStoreRefresh')}
        </button>
      </div>
      <p className="cs-store-desc">{t('claude.skillsStoreDesc')}</p>

      {/* Filter bar */}
      <div className="cs-store-filters">
        <select
          className="cs-store-filter-select"
          value={filterRepo}
          onChange={(e) => setFilterRepo(e.target.value)}
        >
          <option value="all">{t('claude.skillsStoreFilterAll')}</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.id}>{repo.displayName}</option>
          ))}
        </select>
        <input
          className="cs-store-search"
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Repo links */}
      <div className="cs-store-repos">
        {repos.map((repo) => (
          <button
            key={repo.id}
            className="cs-store-repo-chip"
            onClick={() => handleOpenRepo(repo.url)}
            title={repo.description}
          >
            <span className="cs-store-repo-name">{repo.displayName}</span>
            <span className="cs-store-repo-link">{t('claude.skillsStoreViewRepo')}</span>
          </button>
        ))}
      </div>

      {error && <p className="cs-store-error">{error}</p>}

      {!loading && !error && filteredSkills.length === 0 && (
        <p className="cs-store-empty">{t('claude.skillsStoreEmpty')}</p>
      )}

      {/* Skills grid */}
      <div className="cs-store-grid">
        {filteredSkills.map((skill) => {
          const isInstalled = installedSkillNames.has(skill.filename.replace(/\.md$/, ''))
          const isInstalling = installing.has(skill.id)
          const repo = repos.find((r) => r.id === skill.repoId)

          return (
            <div key={skill.id} className="cs-store-card">
              <div className="cs-store-card-header">
                <span className="cs-store-card-name">{skill.name}</span>
                {isInstalled ? (
                  <span className="cs-store-card-installed">{t('claude.skillsStoreInstalled')}</span>
                ) : (
                  <button
                    className="modal-btn modal-btn--primary"
                    style={{ fontSize: 11, padding: '2px 10px' }}
                    onClick={() => handleInstall(skill)}
                    disabled={isInstalling}
                  >
                    {isInstalling ? '...' : t('claude.skillsStoreInstall')}
                  </button>
                )}
              </div>
              {skill.description && (
                <p className="cs-store-card-desc">{skill.description}</p>
              )}
              <div className="cs-store-card-meta">
                <span className="cs-store-card-author">
                  {t('claude.skillsStoreBy')}{' '}
                  <button
                    className="cs-store-card-author-link"
                    onClick={() => handleOpenRepo(skill.authorUrl)}
                    title={skill.author}
                  >
                    {skill.author}
                  </button>
                </span>
                {repo && (
                  <span className="cs-store-card-repo">
                    {t('claude.skillsStoreFrom')} {repo.displayName}
                  </span>
                )}
                <button
                  className="cs-store-card-link"
                  onClick={() => handleOpenRepo(skill.repoUrl)}
                  title={skill.repoUrl}
                >
                  {t('claude.skillsStoreViewRepo')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
