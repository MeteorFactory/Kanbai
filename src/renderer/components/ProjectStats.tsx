import { useEffect, useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import type { ProjectStatsData } from '../../shared/types'

const EXT_COLORS: Record<string, string> = {
  '.ts': '#3178c6',
  '.tsx': '#3178c6',
  '.js': '#f7df1e',
  '.jsx': '#f7df1e',
  '.css': '#264de4',
  '.html': '#e34c26',
  '.json': '#292929',
  '.md': '#083fa1',
  '.py': '#3572A5',
  '.go': '#00ADD8',
  '.rs': '#dea584',
  '.java': '#b07219',
  '.yaml': '#cb171e',
  '.yml': '#cb171e',
  '.sh': '#89e051',
  '.toml': '#9c4221',
}

function getExtColor(ext: string): string {
  return EXT_COLORS[ext] || 'var(--text-muted)'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return '<1m'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function ProjectStats() {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const { openFile } = useViewStore()
  const [stats, setStats] = useState<ProjectStatsData | null>(null)
  const [loading, setLoading] = useState(false)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const loadStats = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const result = await window.kanbai.project.stats(activeProject.path)
      setStats(result)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [activeProject])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const maxLines = useMemo(() => {
    if (!stats) return 0
    return Math.max(...stats.fileTypeBreakdown.map((f) => f.lines), 1)
  }, [stats])

  const topTypes = useMemo(() => {
    if (!stats) return []
    return stats.fileTypeBreakdown.slice(0, 15)
  }, [stats])

  const handleClickFile = useCallback(
    (filePath: string) => {
      if (!activeProject) return
      openFile(activeProject.path + '/' + filePath)
    },
    [activeProject, openFile],
  )

  if (!activeProject) {
    return <div className="project-stats-empty">{t('stats.selectProject')}</div>
  }

  return (
    <div className="project-stats">
      <div className="project-stats-header">
        <h3>{t('stats.title')}</h3>
        <button
          className="project-stats-refresh"
          onClick={loadStats}
          disabled={loading}
          title={t('common.refresh')}
        >
          {loading ? '...' : '\u21BB'}
        </button>
      </div>

      {loading && !stats && (
        <div className="project-stats-loading">{t('stats.scanning')}</div>
      )}

      {stats && (
        <div className="project-stats-body">
          <div className="project-stats-overview">
            <div className="project-stats-card">
              <span className="project-stats-card-value">{formatNumber(stats.totalFiles)}</span>
              <span className="project-stats-card-label">{t('stats.totalFiles')}</span>
            </div>
            <div className="project-stats-card">
              <span className="project-stats-card-value">{formatNumber(stats.totalLines)}</span>
              <span className="project-stats-card-label">{t('stats.totalLines')}</span>
            </div>
            <div className="project-stats-card">
              <span className="project-stats-card-value">{formatSize(stats.totalSize)}</span>
              <span className="project-stats-card-label">{t('stats.totalSize')}</span>
            </div>
            <div className="project-stats-card">
              <span className="project-stats-card-value">{formatNumber(stats.totalDirs)}</span>
              <span className="project-stats-card-label">{t('stats.totalDirs')}</span>
            </div>
            <div className="project-stats-card">
              <span className="project-stats-card-value">{formatSize(stats.avgFileSize)}</span>
              <span className="project-stats-card-label">{t('stats.avgFileSize')}</span>
            </div>
            <div className="project-stats-card">
              <span className="project-stats-card-value">{stats.fileTypeBreakdown.length}</span>
              <span className="project-stats-card-label">{t('stats.fileTypes')}</span>
            </div>
          </div>

          <div className="project-stats-section">
            <h4 className="project-stats-section-title">{t('stats.breakdown')}</h4>
            <div className="project-stats-bars">
              {topTypes.map((item) => (
                <div key={item.ext} className="project-stats-bar-row">
                  <span className="project-stats-bar-label">{item.ext}</span>
                  <div className="project-stats-bar-track">
                    <div
                      className="project-stats-bar-fill"
                      style={{
                        width: `${(item.lines / maxLines) * 100}%`,
                        background: getExtColor(item.ext),
                      }}
                    />
                  </div>
                  <span className="project-stats-bar-count">
                    {t('stats.filesAndLines', { files: formatNumber(item.count), lines: formatNumber(item.lines) })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="project-stats-section">
            <h4 className="project-stats-section-title">{t('stats.largestFiles')}</h4>
            <div className="project-stats-files">
              {stats.largestFiles.map((file) => (
                <button
                  key={file.path}
                  className="project-stats-file-row"
                  onClick={() => handleClickFile(file.path)}
                >
                  <span className="project-stats-file-path">{file.path}</span>
                  <span className="project-stats-file-size">{formatSize(file.size)}</span>
                  <span className="project-stats-file-lines">{formatNumber(file.lines)} lines</span>
                </button>
              ))}
            </div>
          </div>

          <div className="project-stats-section">
            <h4 className="project-stats-section-title">{t('stats.recentFiles')}</h4>
            <div className="project-stats-files">
              {stats.recentFiles.map((file) => (
                <button
                  key={file.path}
                  className="project-stats-file-row"
                  onClick={() => handleClickFile(file.path)}
                >
                  <span className="project-stats-file-path">{file.path}</span>
                  <span className="project-stats-file-size">{timeAgo(file.modifiedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
