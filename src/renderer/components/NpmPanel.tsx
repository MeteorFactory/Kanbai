import { useEffect, useState, useCallback } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import type { NpmPackageInfo } from '../../shared/types'

type FilterMode = 'all' | 'dependency' | 'devDependency' | 'deprecated' | 'updates'

export function NpmPanel() {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const [packages, setPackages] = useState<NpmPackageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [updatingPackages, setUpdatingPackages] = useState<Set<string>>(new Set())
  const [updateAllLoading, setUpdateAllLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const loadPackages = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.kanbai.project.checkPackages(activeProject.path)
      setPackages(result.packages)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [activeProject])

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  // Auto-dismiss feedback after 5 seconds
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [feedback])

  const handleUpdatePackage = useCallback(async (packageName: string) => {
    if (!activeProject) return
    setUpdatingPackages((prev) => new Set(prev).add(packageName))
    try {
      const result = await window.kanbai.project.updatePackage(activeProject.path, packageName)
      if (result.success) {
        setFeedback({ message: t('npm.updated', { name: packageName }), success: true })
      } else {
        setFeedback({ message: t('npm.failedUpdate', { name: packageName, error: result.error ?? '' }), success: false })
      }
      await loadPackages()
    } catch (err) {
      setFeedback({ message: t('npm.error', { error: String(err) }), success: false })
    } finally {
      setUpdatingPackages((prev) => {
        const next = new Set(prev)
        next.delete(packageName)
        return next
      })
    }
  }, [activeProject, loadPackages, t])

  const handleUpdateAll = useCallback(async () => {
    if (!activeProject) return
    setUpdateAllLoading(true)
    try {
      const result = await window.kanbai.project.updatePackage(activeProject.path)
      if (result.success) {
        setFeedback({ message: t('npm.allUpdated'), success: true })
      } else {
        setFeedback({ message: t('npm.failedUpdate', { name: 'all', error: result.error ?? '' }), success: false })
      }
      await loadPackages()
    } catch (err) {
      setFeedback({ message: t('npm.error', { error: String(err) }), success: false })
    } finally {
      setUpdateAllLoading(false)
    }
  }, [activeProject, loadPackages, t])

  if (!activeProject) {
    return (
      <div className="npm-panel-empty">
        {t('npm.selectProject')}
      </div>
    )
  }

  const filtered = packages.filter((pkg) => {
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
  })

  const deprecatedCount = packages.filter((p) => p.isDeprecated).length
  const updatesCount = packages.filter((p) => p.updateAvailable).length
  const depsCount = packages.filter((p) => p.type === 'dependency').length
  const devDepsCount = packages.filter((p) => p.type === 'devDependency').length

  return (
    <div className="npm-panel">
      <div className="npm-panel-header">
        <h3>{t('npm.title')}</h3>
        <span className="npm-panel-count">{t('npm.packageCount', { count: String(packages.length) })}</span>
        {updatesCount > 0 && (
          <button
            className="npm-update-all-btn"
            onClick={handleUpdateAll}
            disabled={updateAllLoading}
            title={t('npm.updateAll')}
          >
            {updateAllLoading ? '...' : t('npm.updateAllCount', { count: String(updatesCount) })}
          </button>
        )}
        <button
          className="npm-panel-refresh"
          onClick={loadPackages}
          disabled={loading}
          title={t('common.refresh')}
        >
          &#x21bb;
        </button>
      </div>

      {feedback && (
        <div
          className={`npm-feedback ${feedback.success ? 'npm-feedback--success' : 'npm-feedback--error'}`}
          onClick={() => setFeedback(null)}
        >
          {feedback.success ? '\u2713' : '\u2717'} {feedback.message}
        </div>
      )}

      <div className="npm-panel-filters">
        <button
          className={`npm-filter-btn${filter === 'all' ? ' npm-filter-btn--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('npm.allCount', { count: String(packages.length) })}
        </button>
        <button
          className={`npm-filter-btn${filter === 'dependency' ? ' npm-filter-btn--active' : ''}`}
          onClick={() => setFilter('dependency')}
        >
          {t('npm.depsCount', { count: String(depsCount) })}
        </button>
        <button
          className={`npm-filter-btn${filter === 'devDependency' ? ' npm-filter-btn--active' : ''}`}
          onClick={() => setFilter('devDependency')}
        >
          {t('npm.devDepsCount', { count: String(devDepsCount) })}
        </button>
        {updatesCount > 0 && (
          <button
            className={`npm-filter-btn npm-filter-btn--updates${filter === 'updates' ? ' npm-filter-btn--active' : ''}`}
            onClick={() => setFilter('updates')}
          >
            {t('npm.updatesCount', { count: String(updatesCount) })}
          </button>
        )}
        {deprecatedCount > 0 && (
          <button
            className={`npm-filter-btn npm-filter-btn--deprecated${filter === 'deprecated' ? ' npm-filter-btn--active' : ''}`}
            onClick={() => setFilter('deprecated')}
          >
            {t('npm.deprecatedCount', { count: String(deprecatedCount) })}
          </button>
        )}
      </div>

      {error && <div className="npm-panel-error">{error}</div>}

      <div className="npm-panel-list">
        {loading && <div className="npm-panel-loading">{t('npm.analyzing')}</div>}
        {!loading && filtered.length === 0 && (
          <div className="npm-panel-empty-list">{t('npm.noPackages')}</div>
        )}
        {!loading &&
          filtered.map((pkg) => (
            <div
              key={pkg.name}
              className={`npm-package-row${pkg.isDeprecated ? ' npm-deprecated' : ''}${pkg.updateAvailable ? ' npm-update-available' : ''}`}
            >
              <div className="npm-package-info">
                <span className="npm-package-name">{pkg.name}</span>
                <span className="npm-package-type">
                  {pkg.type === 'devDependency' ? t('npm.dev') : t('npm.dep')}
                </span>
              </div>
              <div className="npm-package-versions">
                <span className="npm-package-current">{pkg.currentVersion}</span>
                {pkg.updateAvailable && pkg.latestVersion && (
                  <>
                    <span className="npm-package-arrow">&rarr;</span>
                    <span className="npm-package-latest">{pkg.latestVersion}</span>
                  </>
                )}
              </div>
              {pkg.updateAvailable && (
                <button
                  className="npm-package-update-btn"
                  onClick={() => handleUpdatePackage(pkg.name)}
                  disabled={updatingPackages.has(pkg.name) || updateAllLoading}
                  title={t('npm.updatePackage', { name: pkg.name })}
                >
                  {updatingPackages.has(pkg.name) ? '...' : '\u2191'}
                </button>
              )}
              {pkg.isDeprecated && pkg.deprecationMessage && (
                <div className="npm-package-deprecated-msg">{pkg.deprecationMessage}</div>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
