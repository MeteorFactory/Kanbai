import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useViewStore } from '../lib/stores/viewStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import type { SearchResult } from '../../shared/types'

interface GroupedResults {
  file: string
  relativePath: string
  matches: SearchResult[]
}

export function GlobalSearch() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { openFile } = useViewStore()
  const { activeProjectId, projects } = useWorkspaceStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Group results by file
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

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const toggleFile = useCallback((file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }, [])

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      openFile(result.file)
      // FileViewer uses selectedFilePath — we could also pass line info
      // via store if needed. For now, opening the file is sufficient.
    },
    [openFile],
  )

  if (!activeProject) {
    return (
      <div className="global-search">
        <div className="global-search-empty">{t('search.selectProject')}</div>
      </div>
    )
  }

  return (
    <div className="global-search">
      <div className="global-search-header">
        <div className="global-search-input-wrap">
          <svg
            className="global-search-icon"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="global-search-input"
            type="text"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className={`global-search-case-btn${caseSensitive ? ' global-search-case-btn--active' : ''}`}
            onClick={() => setCaseSensitive((v) => !v)}
            title={t('search.caseSensitive')}
          >
            Aa
          </button>
        </div>
        <div className="global-search-meta">
          {searching && <span className="global-search-searching">{t('search.searching')}</span>}
          {!searching && results.length > 0 && (
            <span className="global-search-count">
              {t('search.resultCount', { results: String(results.length), files: String(grouped.length) })}
            </span>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <span className="global-search-count">{t('search.noResults')}</span>
          )}
        </div>
      </div>
      <div className="global-search-results">
        {grouped.map((group) => (
          <div key={group.file} className="global-search-file-group">
            <button
              className="global-search-file-header"
              onClick={() => toggleFile(group.file)}
            >
              <svg
                className={`global-search-file-chevron${expandedFiles.has(group.file) ? ' global-search-file-chevron--expanded' : ''}`}
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
              >
                <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="global-search-file-name">{group.relativePath}</span>
              <span className="global-search-file-count">{group.matches.length}</span>
            </button>
            {expandedFiles.has(group.file) && (
              <div className="global-search-file-matches">
                {group.matches.map((match, idx) => (
                  <button
                    key={`${match.line}-${idx}`}
                    className="global-search-match"
                    onClick={() => handleResultClick(match)}
                  >
                    <span className="global-search-match-line">{match.line}</span>
                    <span className="global-search-match-text">{match.text.trim()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
