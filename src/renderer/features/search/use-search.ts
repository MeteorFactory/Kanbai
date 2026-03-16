import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import type { SearchResult } from '../../../shared/types'

interface GroupedResults {
  file: string
  relativePath: string
  matches: SearchResult[]
}

export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { activeProjectId, projects } = useWorkspaceStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const grouped = useMemo<GroupedResults[]>(() => {
    const map = new Map<string, SearchResult[]>()
    for (const r of results) {
      const existing = map.get(r.file)
      if (existing) {
        existing.push(r)
      } else {
        map.set(r.file, [r])
      }
    }

    const projectPath = activeProject?.path ?? ''
    return Array.from(map.entries()).map(([file, matches]) => ({
      file,
      relativePath: projectPath ? file.replace(projectPath + '/', '') : file,
      matches,
    }))
  }, [results, activeProject])

  // Auto-expand all files when results change
  useEffect(() => {
    setExpandedFiles(new Set(grouped.map((g) => g.file)))
  }, [grouped])

  const doSearch = useCallback(
    async (searchQuery: string) => {
      if (!activeProject || searchQuery.trim().length < 2) {
        setResults([])
        setSearching(false)
        return
      }

      setSearching(true)
      try {
        const r = await window.kanbai.fs.search(
          activeProject.path,
          searchQuery,
          undefined,
          caseSensitive,
        )
        setResults(r)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [activeProject, caseSensitive],
  )

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      doSearch(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  const toggleFile = useCallback((file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }, [])

  const toggleCaseSensitive = useCallback(() => {
    setCaseSensitive((v) => !v)
  }, [])

  return {
    query,
    setQuery,
    results,
    searching,
    caseSensitive,
    toggleCaseSensitive,
    expandedFiles,
    grouped,
    toggleFile,
    activeProject,
  }
}
