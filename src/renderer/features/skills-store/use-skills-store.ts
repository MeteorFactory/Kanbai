import { useState, useCallback, useEffect, useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import type { SkillStoreEntry, SkillStoreRepo } from '../../../shared/types'

interface UseSkillsStoreOptions {
  projectPath: string
  installedSkillNames: Set<string>
  onInstalled: () => void
}

export function useSkillsStore({ projectPath, installedSkillNames, onInstalled }: UseSkillsStoreOptions) {
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
        (s.name ?? '').toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (s.filename ?? '').toLowerCase().includes(q)
      )
    }
    return result
  }, [skills, filterRepo, searchQuery])

  const isSkillInstalled = useCallback((skill: SkillStoreEntry) => {
    return installedSkillNames.has(skill.filename.replace(/\.md$/, ''))
  }, [installedSkillNames])

  return {
    repos,
    skills: filteredSkills,
    loading,
    error,
    installing,
    filterRepo,
    searchQuery,
    setFilterRepo,
    setSearchQuery,
    fetchSkills,
    handleInstall,
    handleOpenRepo,
    isSkillInstalled,
  }
}
