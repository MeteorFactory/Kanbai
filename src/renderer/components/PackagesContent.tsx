import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react'
import { usePackagesStore } from '../lib/stores/packagesStore'
import { PackagesChat } from './PackagesChat'
import { ResizeDivider } from './ResizeDivider'
import { clampPanelHeight } from './DatabaseQueryArea'
import { useI18n } from '../lib/i18n'
import type { PackageManagerType } from '../../shared/types'

type FilterMode = 'all' | 'dependency' | 'devDependency' | 'updates' | 'deprecated'

const REGISTRY_URLS: Record<PackageManagerType, (name: string) => string> = {
  npm: (name) => `https://www.npmjs.com/package/${name}`,
  go: (name) => `https://pkg.go.dev/${name}`,
  pip: (name) => `https://pypi.org/project/${name}`,
  cargo: (name) => `https://crates.io/crates/${name}`,
  nuget: (name) => `https://www.nuget.org/packages/${name}`,
  composer: (name) => `https://packagist.org/packages/${name}`,
  bower: (name) => `https://bower.io/search/?q=${encodeURIComponent(name)}`,
}

export function PackagesContent() {
  const { t } = useI18n()
  const {
    selectedProjectId,
    selectedManager,
    packages,
    loading,
    managers,
    loadPackages,
    updatePackage,
    searchQuery,
    setSearchQuery,
  } = usePackagesStore()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [updatingPackages, setUpdatingPackages] = useState<Set<string>>(new Set())
  const [updateAllLoading, setUpdateAllLoading] = useState(false)
  const [feedback, setFeedback] = useState<{
    message: string
    success: boolean
  } | null>(null)
  const [copiedError, setCopiedError] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [chatHeight, setChatHeight] = useState(200)

  const handleChatResize = useCallback((deltaY: number) => {
    const ch = containerRef.current?.clientHeight ?? null
    setChatHeight((h) => clampPanelHeight(h, -deltaY, ch))
  }, [])

  const selectedInfo = managers.find(
    (m) => m.projectId === selectedProjectId && m.manager === selectedManager,
  )
  const key =
    selectedProjectId && selectedManager
      ? `${selectedProjectId}:${selectedManager}`
      : null
  const pkgList = key ? (packages[key] ?? []) : []
  const isLoading = key ? (loading[key] ?? false) : false

  useEffect(() => {
    if (selectedProjectId && selectedManager && selectedInfo) {
      loadPackages(selectedProjectId, selectedInfo.projectPath, selectedManager)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only on selection change
  }, [selectedProjectId, selectedManager])

  useEffect(() => {
    if (!feedback || !feedback.success) return
    const timer = setTimeout(() => setFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [feedback])

  const handleCopyError = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    if (!feedback) return
    navigator.clipboard.writeText(feedback.message).then(() => {
      setCopiedError(true)
      setTimeout(() => setCopiedError(false), 2000)
    })
  }, [feedback])

  const filtered = pkgList.filter((pkg) => {
    if (searchQuery && !pkg.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false
    switch (filter) {
      case 'dependency':
        return pkg.type === 'dependency'
      case 'devDependency':
        return pkg.type === 'devDependency'
      case 'deprecated':
        return pkg.isDeprecated
      case 'updates':
        return pkg.updateAvailable
      default:
        return true
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const handleUpdate = useCallback(
    async (packageName: string) => {
      if (!selectedInfo || !selectedManager) return
      setUpdatingPackages((prev) => new Set(prev).add(packageName))
      try {
        const result = await updatePackage(
          selectedInfo.projectPath,
          selectedManager,
          packageName,
        )
        setFeedback({
          message: result.success
            ? t('packages.updated', { name: packageName })
            : t('packages.failedUpdate', {
                name: packageName,
                error: result.error ?? '',
              }),
          success: result.success,
        })
        if (result.success && selectedProjectId) {
          loadPackages(selectedProjectId, selectedInfo.projectPath, selectedManager)
        }
      } finally {
        setUpdatingPackages((prev) => {
          const next = new Set(prev)
          next.delete(packageName)
          return next
        })
      }
    },
    [selectedInfo, selectedProjectId, selectedManager, updatePackage, loadPackages, t],
  )

  const handleUpdateAll = useCallback(async () => {
    if (!selectedInfo || !selectedManager) return
    setUpdateAllLoading(true)
    try {
      const result = await updatePackage(selectedInfo.projectPath, selectedManager)
      setFeedback({
        message: result.success
          ? t('packages.allUpdated')
          : t('packages.failedUpdate', {
              name: 'all',
              error: result.error ?? '',
            }),
        success: result.success,
      })
      if (result.success && selectedProjectId) {
        loadPackages(selectedProjectId, selectedInfo.projectPath, selectedManager)
      }
    } finally {
      setUpdateAllLoading(false)
    }
  }, [selectedInfo, selectedProjectId, selectedManager, updatePackage, loadPackages, t])

  if (!selectedProjectId || !selectedManager) {
    return (
      <div className="packages-content">
        <div className="packages-empty">{t('packages.selectManager')}</div>
      </div>
    )
  }

  const updatesCount = pkgList.filter((p) => p.updateAvailable).length
  const deprecatedCount = pkgList.filter((p) => p.isDeprecated).length
  const depsCount = pkgList.filter((p) => p.type === 'dependency').length
  const devDepsCount = pkgList.filter((p) => p.type === 'devDependency').length

  return (
    <div className="packages-content" ref={containerRef}>
      {/* Header */}
      <div className="packages-content-header">
        <h3>
          {selectedInfo?.projectName} — {selectedManager}
        </h3>
        <span className="packages-content-count">
          {t('packages.packageCount', { count: String(pkgList.length) })}
        </span>
        {updatesCount > 0 && (
          <button
            className={`packages-update-all-btn${updateAllLoading ? ' packages-update-all-btn--loading' : ''}`}
            onClick={handleUpdateAll}
            disabled={updateAllLoading}
          >
            {updateAllLoading ? (
              <span className="packages-spinner-inline">⟳</span>
            ) : (
              t('packages.updateAllCount', { count: String(updatesCount) })
            )}
          </button>
        )}
        <button
          className="packages-content-refresh"
          onClick={() =>
            selectedInfo &&
            selectedProjectId &&
            loadPackages(
              selectedProjectId,
              selectedInfo.projectPath,
              selectedManager,
            )
          }
          disabled={isLoading}
          title={t('common.refresh')}
        >
          &#x21bb;
        </button>
      </div>

      {feedback && (
        <div
          className={`packages-feedback ${feedback.success ? 'packages-feedback--success' : 'packages-feedback--error'}`}
        >
          <span className="packages-feedback-text">
            {feedback.success ? '\u2713' : '\u2717'} {feedback.message}
          </span>
          {!feedback.success && (
            <button
              className="packages-feedback-copy"
              onClick={handleCopyError}
              title={t('common.copy')}
            >
              {copiedError ? '\u2713' : '\u2398'}
            </button>
          )}
          <button
            className="packages-feedback-dismiss"
            onClick={() => setFeedback(null)}
            title={t('common.close')}
          >
            \u00d7
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="packages-filters">
        <button
          className={`packages-filter-btn${filter === 'all' ? ' packages-filter-btn--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('packages.allCount', { count: String(pkgList.length) })}
        </button>
        <button
          className={`packages-filter-btn${filter === 'dependency' ? ' packages-filter-btn--active' : ''}`}
          onClick={() => setFilter('dependency')}
        >
          {t('packages.depsCount', { count: String(depsCount) })}
        </button>
        <button
          className={`packages-filter-btn${filter === 'devDependency' ? ' packages-filter-btn--active' : ''}`}
          onClick={() => setFilter('devDependency')}
        >
          {t('packages.devDepsCount', { count: String(devDepsCount) })}
        </button>
        {updatesCount > 0 && (
          <button
            className={`packages-filter-btn packages-filter-btn--updates${filter === 'updates' ? ' packages-filter-btn--active' : ''}`}
            onClick={() => setFilter('updates')}
          >
            {t('packages.updatesCount', { count: String(updatesCount) })}
          </button>
        )}
        {deprecatedCount > 0 && (
          <button
            className={`packages-filter-btn packages-filter-btn--deprecated${filter === 'deprecated' ? ' packages-filter-btn--active' : ''}`}
            onClick={() => setFilter('deprecated')}
          >
            {t('packages.deprecatedCount', { count: String(deprecatedCount) })}
          </button>
        )}
        <input
          className="packages-search-input"
          type="text"
          placeholder={t('packages.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Package list */}
      <div className="packages-list">
        {isLoading && (
          <div className="packages-loading">{t('packages.analyzing')}</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="packages-empty-list">{t('packages.noPackages')}</div>
        )}
        {!isLoading &&
          filtered.map((pkg) => (
            <div
              key={pkg.name}
              className={`packages-row${pkg.isDeprecated ? ' packages-deprecated' : ''}${pkg.updateAvailable ? ' packages-update-available' : ''}`}
            >
              <div className="packages-row-info">
                <button
                  className="packages-row-name packages-row-link"
                  onClick={() =>
                    window.kanbai.shell.openExternal(
                      REGISTRY_URLS[selectedManager](pkg.name),
                    )
                  }
                  title={REGISTRY_URLS[selectedManager](pkg.name)}
                >
                  {pkg.name}
                  <span className="packages-row-link-icon">&#x2197;</span>
                </button>
                <span className="packages-row-type">
                  {pkg.type === 'devDependency'
                    ? t('packages.dev')
                    : t('packages.dep')}
                </span>
              </div>
              <div className="packages-row-versions">
                <span className="packages-row-current">{pkg.currentVersion}</span>
                {pkg.updateAvailable && pkg.latestVersion && (
                  <>
                    <span className="packages-row-arrow">&rarr;</span>
                    <span className="packages-row-latest">{pkg.latestVersion}</span>
                  </>
                )}
              </div>
              {pkg.updateAvailable && (
                <button
                  className={`packages-row-update-btn${updatingPackages.has(pkg.name) ? ' packages-row-update-btn--loading' : ''}`}
                  onClick={() => handleUpdate(pkg.name)}
                  disabled={updatingPackages.has(pkg.name) || updateAllLoading}
                  title={t('packages.updatePackage', { name: pkg.name })}
                >
                  <span className={updatingPackages.has(pkg.name) ? 'packages-spinner' : ''}>
                    {updatingPackages.has(pkg.name) ? '⟳' : '\u2191'}
                  </span>
                </button>
              )}
              {pkg.isDeprecated && pkg.deprecationMessage && (
                <div className="packages-row-deprecated-msg">
                  {pkg.deprecationMessage}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Chat resize + panel */}
      <ResizeDivider onResize={handleChatResize} />
      <div style={{ height: chatHeight, flexShrink: 0 }}>
        <PackagesChat
          projectPath={selectedInfo?.projectPath ?? ''}
          manager={selectedManager}
        />
      </div>
    </div>
  )
}
