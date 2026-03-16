import { useEffect, useRef, useCallback } from 'react'
import { useViewStore } from '../../lib/stores/viewStore'
import { useI18n } from '../../lib/i18n'
import { useSearch } from './use-search'
import type { SearchResult } from '../../../shared/types'

export function GlobalSearch() {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const { openFile } = useViewStore()
  const {
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
  } = useSearch()

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      openFile(result.file)
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
            onClick={toggleCaseSensitive}
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
