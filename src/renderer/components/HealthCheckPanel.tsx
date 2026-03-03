import { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import { useHealthCheckStore } from '../lib/stores/healthCheckStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import type {
  HealthCheckConfig,
  HealthCheckIntervalUnit,
  HealthCheckSchedulerStatus,
  ApiHeader,
} from '../../shared/types'

const HISTORY_PAGE_SIZE = 50

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString()
}

function formatDuration(startMs: number, endMs: number | null): string {
  const end = endMs ?? Date.now()
  const diffSec = Math.floor((end - startMs) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`
  const hours = Math.floor(diffSec / 3600)
  const mins = Math.floor((diffSec % 3600) / 60)
  return `${hours}h ${mins}m`
}

function statusDotClass(status: HealthCheckSchedulerStatus | undefined): string {
  if (!status) return 'hc-dot'
  return `hc-dot hc-dot--${status.status}`
}

function statusLabel(status: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    up: t('healthcheck.statusUp'),
    down: t('healthcheck.statusDown'),
    checking: t('healthcheck.statusChecking'),
    unknown: t('healthcheck.statusUnknown'),
  }
  return labels[status] ?? status
}

export function HealthCheckPanel() {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const projectPath = activeProject?.path ?? ''

  const {
    data,
    statuses,
    selectedCheckId,
    schedulerRunning,
    loading,
    loadData,
    refreshData,
    addCheck,
    updateCheck,
    deleteCheck,
    executeCheck,
    startScheduler,
    stopScheduler,
    updateInterval,
    handleStatusUpdate,
    clearHistory,
    selectCheck,
  } = useHealthCheckStore()

  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set())
  const [historyPage, setHistoryPage] = useState(0)
  const autoStartAttempted = useRef(false)

  // Load data when project changes
  useEffect(() => {
    if (!projectPath) return
    autoStartAttempted.current = false
    loadData(projectPath)
  }, [projectPath, loadData])

  // Auto-start scheduler when data is loaded and checks have enabled schedules
  useEffect(() => {
    if (!projectPath || loading || schedulerRunning || autoStartAttempted.current) return
    const hasEnabledSchedules = data.checks.some((c) => c.schedule.enabled)
    if (hasEnabledSchedules) {
      autoStartAttempted.current = true
      startScheduler(projectPath)
    }
  }, [projectPath, loading, schedulerRunning, data.checks, startScheduler])

  // IPC listener for real-time status updates
  useEffect(() => {
    if (!projectPath) return
    const unsubscribe = window.kanbai.healthcheck.onStatusUpdate(
      (payload: { projectPath: string; statuses: HealthCheckSchedulerStatus[] }) => {
        if (payload.projectPath === projectPath) {
          handleStatusUpdate(projectPath, payload.statuses)
          refreshData(projectPath)
        }
      },
    )
    return () => { unsubscribe() }
  }, [projectPath, handleStatusUpdate, refreshData])

  useEffect(() => {
    setHistoryPage(0)
  }, [selectedCheckId])

  const selectedCheck = useMemo(
    () => data.checks.find((c) => c.id === selectedCheckId) ?? null,
    [data.checks, selectedCheckId],
  )

  const selectedStatus = selectedCheckId ? statuses[selectedCheckId] : undefined

  const checkHistory = useMemo(() => {
    if (!selectedCheckId) return []
    return data.history
      .filter((h) => h.healthCheckId === selectedCheckId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [data.history, selectedCheckId])

  const checkIncidents = useMemo(() => {
    if (!selectedCheckId) return []
    return data.incidents
      .filter((i) => i.healthCheckId === selectedCheckId)
      .sort((a, b) => b.startedAt - a.startedAt)
  }, [data.incidents, selectedCheckId])

  const historyPageCount = Math.max(1, Math.ceil(checkHistory.length / HISTORY_PAGE_SIZE))
  const paginatedHistory = checkHistory.slice(
    historyPage * HISTORY_PAGE_SIZE,
    (historyPage + 1) * HISTORY_PAGE_SIZE,
  )

  // Handlers
  const handleAddCheck = useCallback(() => {
    if (!projectPath) return
    addCheck(projectPath)
  }, [projectPath, addCheck])

  const handleUpdateCheck = useCallback(
    (updates: Partial<HealthCheckConfig>) => {
      if (!projectPath || !selectedCheckId) return
      updateCheck(projectPath, selectedCheckId, updates)
    },
    [projectPath, selectedCheckId, updateCheck],
  )

  const handleDeleteCheck = useCallback(() => {
    if (!projectPath || !selectedCheckId) return
    deleteCheck(projectPath, selectedCheckId)
  }, [projectPath, selectedCheckId, deleteCheck])

  const handleRunSingleCheck = useCallback(async (checkId: string) => {
    if (!projectPath) return
    setExecutingIds((prev) => new Set(prev).add(checkId))
    try {
      await executeCheck(projectPath, checkId)
    } finally {
      setExecutingIds((prev) => {
        const next = new Set(prev)
        next.delete(checkId)
        return next
      })
    }
  }, [projectPath, executeCheck])

  const handleRunAllChecks = useCallback(async () => {
    if (!projectPath || data.checks.length === 0) return
    const ids = data.checks.map((c) => c.id)
    setExecutingIds(new Set(ids))
    try {
      await Promise.all(ids.map((id) => executeCheck(projectPath, id)))
    } finally {
      setExecutingIds(new Set())
    }
  }, [projectPath, data.checks, executeCheck])

  const handleStartScheduler = useCallback(async () => {
    if (!projectPath) return
    await startScheduler(projectPath)
  }, [projectPath, startScheduler])

  const handleStopScheduler = useCallback(async () => {
    if (!projectPath) return
    await stopScheduler(projectPath)
  }, [projectPath, stopScheduler])

  const handleUpdateInterval = useCallback(async () => {
    if (!projectPath || !selectedCheckId) return
    await updateInterval(projectPath, selectedCheckId)
  }, [projectPath, selectedCheckId, updateInterval])

  const handleQuickCheck = useCallback(async () => {
    if (!projectPath || !selectedCheckId) return
    updateCheck(projectPath, selectedCheckId, {
      schedule: { enabled: true, interval: 10, unit: 'seconds' },
    })
    await updateInterval(projectPath, selectedCheckId)
  }, [projectPath, selectedCheckId, updateCheck, updateInterval])

  const handleClearHistory = useCallback(async () => {
    if (!projectPath) return
    await clearHistory(projectPath)
    setHistoryPage(0)
  }, [projectPath, clearHistory])

  const handleExport = useCallback(async () => {
    await window.kanbai.healthcheck.export(data)
  }, [data])

  const handleImport = useCallback(async () => {
    const result = await window.kanbai.healthcheck.import()
    if (result.success && result.data && projectPath) {
      await window.kanbai.healthcheck.save(projectPath, result.data)
      await loadData(projectPath)
    }
  }, [projectPath, loadData])

  const handleAddHeader = useCallback(() => {
    if (!selectedCheck) return
    const newHeader: ApiHeader = { key: '', value: '', enabled: true }
    handleUpdateCheck({ headers: [...selectedCheck.headers, newHeader] })
  }, [selectedCheck, handleUpdateCheck])

  const handleUpdateHeader = useCallback(
    (index: number, field: keyof ApiHeader, value: string | boolean) => {
      if (!selectedCheck) return
      const headers = selectedCheck.headers.map((h, i) =>
        i === index ? { ...h, [field]: value } : h,
      )
      handleUpdateCheck({ headers })
    },
    [selectedCheck, handleUpdateCheck],
  )

  const handleRemoveHeader = useCallback(
    (index: number) => {
      if (!selectedCheck) return
      handleUpdateCheck({ headers: selectedCheck.headers.filter((_, i) => i !== index) })
    },
    [selectedCheck, handleUpdateCheck],
  )

  if (!activeProject) {
    return (
      <div className="hc-panel">
        <div className="hc-empty-state">{t('healthcheck.noProject')}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="hc-panel">
        <div className="hc-empty-state">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="hc-panel">
      <div className="hc-container">
        {/* Sidebar */}
        <div className="hc-sidebar">
          <div className="hc-sidebar-header">
            <span className="hc-sidebar-title">{t('healthcheck.title')}</span>
            <span className={`hc-sidebar-badge${schedulerRunning ? ' hc-sidebar-badge--active' : ' hc-sidebar-badge--stopped'}`}>
              {schedulerRunning ? t('healthcheck.schedulerActive') : t('healthcheck.schedulerStopped')}
            </span>
            <button className="hc-add-btn" onClick={handleAddCheck} title={t('healthcheck.addCheck')}>
              +
            </button>
          </div>

          <div className="hc-sidebar-toolbar">
            <button
              className={`hc-toolbar-btn${schedulerRunning ? ' hc-toolbar-btn--danger' : ''}`}
              onClick={schedulerRunning ? handleStopScheduler : handleStartScheduler}
            >
              {schedulerRunning ? t('healthcheck.stopScheduler') : t('healthcheck.startScheduler')}
            </button>
            {data.checks.length > 0 && (
              <button
                className="hc-toolbar-btn"
                onClick={handleRunAllChecks}
                disabled={executingIds.size > 0}
              >
                {executingIds.size > 0 ? t('healthcheck.executing') : t('healthcheck.runAll')}
              </button>
            )}
          </div>

          <div className="hc-sidebar-list">
            {data.checks.length === 0 && (
              <div className="hc-empty-hint">{t('healthcheck.empty')}</div>
            )}
            {data.checks.map((check) => (
              <div
                key={check.id}
                className={`hc-check-item${selectedCheckId === check.id ? ' hc-check-item--active' : ''}`}
                onClick={() => selectCheck(check.id)}
              >
                <span className={statusDotClass(statuses[check.id])} />
                <div className="hc-check-info">
                  <span className="hc-check-name">{check.name}</span>
                  <span className="hc-check-meta">
                    {check.method}
                    {check.schedule.enabled
                      ? ` · ${check.schedule.interval}${check.schedule.unit[0]}`
                      : ''}
                  </span>
                </div>
                <button
                  className="hc-check-play"
                  title={t('healthcheck.executeNow')}
                  disabled={!check.url || executingIds.has(check.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRunSingleCheck(check.id)
                  }}
                >
                  {executingIds.has(check.id) ? '···' : '\u25B6'}
                </button>
              </div>
            ))}
          </div>

          <div className="hc-sidebar-footer">
            <button className="hc-toolbar-btn" onClick={handleImport} style={{ flex: 1 }}>
              {t('healthcheck.importChecks')}
            </button>
            <button className="hc-toolbar-btn" onClick={handleExport} style={{ flex: 1 }}>
              {t('healthcheck.exportChecks')}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="hc-main">
          {!selectedCheck && (
            <div className="hc-empty-state">{t('healthcheck.selectCheck')}</div>
          )}

          {selectedCheck && (
            <>
              {/* Status bar */}
              <div className={`hc-status-bar hc-status-bar--${selectedStatus?.status ?? 'unknown'}`}>
                <span className={`hc-badge hc-badge--${selectedStatus?.status ?? 'unknown'}`}>
                  {statusLabel(selectedStatus?.status ?? 'unknown', t)}
                </span>
                <div className="hc-status-metrics">
                  {selectedStatus?.lastCheck && (
                    <div className="hc-metric">
                      <span className="hc-metric-label">{t('healthcheck.lastCheck')}</span>
                      <span className="hc-metric-value">{formatTimestamp(selectedStatus.lastCheck)}</span>
                    </div>
                  )}
                  {selectedStatus?.nextCheck && (
                    <div className="hc-metric">
                      <span className="hc-metric-label">{t('healthcheck.nextCheck')}</span>
                      <span className="hc-metric-value">{formatTimestamp(selectedStatus.nextCheck)}</span>
                    </div>
                  )}
                </div>
                {selectedStatus?.status === 'down' && (
                  <button className="hc-quick-btn" onClick={handleQuickCheck}>
                    {t('healthcheck.quickCheck')}
                  </button>
                )}
              </div>

              {/* Detail area — config + schedule */}
              <div className="hc-detail-area">
                {/* Config card */}
                <div className="hc-card">
                  <div className="hc-card-header">
                    <span>{t('healthcheck.config')}</span>
                    <button className="hc-delete-btn" onClick={handleDeleteCheck}>
                      {t('common.delete')}
                    </button>
                  </div>
                  <div className="hc-card-body">
                    <div className="hc-form-row">
                      <label>{t('healthcheck.name')}</label>
                      <input
                        value={selectedCheck.name}
                        placeholder={t('healthcheck.namePlaceholder')}
                        onChange={(e) => handleUpdateCheck({ name: e.target.value })}
                      />
                    </div>
                    <div className="hc-form-row">
                      <label>{t('healthcheck.url')}</label>
                      <input
                        value={selectedCheck.url}
                        placeholder={t('healthcheck.urlPlaceholder')}
                        onChange={(e) => handleUpdateCheck({ url: e.target.value })}
                      />
                    </div>
                    <div className="hc-form-row">
                      <label>{t('healthcheck.method')}</label>
                      <select
                        value={selectedCheck.method}
                        onChange={(e) => handleUpdateCheck({ method: e.target.value as 'GET' | 'HEAD' })}
                      >
                        <option value="GET">GET</option>
                        <option value="HEAD">HEAD</option>
                      </select>
                    </div>
                    <div className="hc-form-row">
                      <label>{t('healthcheck.expectedStatus')}</label>
                      <input
                        type="number"
                        value={selectedCheck.expectedStatus}
                        onChange={(e) =>
                          handleUpdateCheck({ expectedStatus: parseInt(e.target.value, 10) || 200 })
                        }
                      />
                    </div>
                    <div className="hc-toggle-row">
                      <input
                        type="checkbox"
                        checked={selectedCheck.notifyOnDown}
                        onChange={(e) => handleUpdateCheck({ notifyOnDown: e.target.checked })}
                      />
                      <label onClick={() => handleUpdateCheck({ notifyOnDown: !selectedCheck.notifyOnDown })}>
                        {t('healthcheck.notifications')}
                      </label>
                    </div>

                    {/* Headers */}
                    <div className="hc-headers-section">
                      <div className="hc-headers-title">
                        <span>{t('healthcheck.headers')}</span>
                        <button className="hc-toolbar-btn" onClick={handleAddHeader}>
                          {t('healthcheck.addHeader')}
                        </button>
                      </div>
                      {selectedCheck.headers.map((header, idx) => (
                        <div key={idx} className="hc-header-row">
                          <input
                            type="checkbox"
                            className="hc-header-toggle"
                            checked={header.enabled}
                            onChange={(e) => handleUpdateHeader(idx, 'enabled', e.target.checked)}
                          />
                          <input
                            placeholder={t('healthcheck.headerKey')}
                            value={header.key}
                            onChange={(e) => handleUpdateHeader(idx, 'key', e.target.value)}
                          />
                          <input
                            placeholder={t('healthcheck.headerValue')}
                            value={header.value}
                            onChange={(e) => handleUpdateHeader(idx, 'value', e.target.value)}
                          />
                          <button className="hc-header-remove" onClick={() => handleRemoveHeader(idx)}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Schedule card */}
                <div className="hc-card">
                  <div className="hc-card-header">
                    <span>{t('healthcheck.schedule')}</span>
                  </div>
                  <div className="hc-card-body">
                    <div className="hc-toggle-row">
                      <input
                        type="checkbox"
                        checked={selectedCheck.schedule.enabled}
                        onChange={(e) =>
                          handleUpdateCheck({
                            schedule: { ...selectedCheck.schedule, enabled: e.target.checked },
                          })
                        }
                      />
                      <label
                        onClick={() =>
                          handleUpdateCheck({
                            schedule: { ...selectedCheck.schedule, enabled: !selectedCheck.schedule.enabled },
                          })
                        }
                      >
                        {t('healthcheck.scheduleEnabled')}
                      </label>
                    </div>
                    <div className="hc-form-row">
                      <label>{t('healthcheck.interval')}</label>
                      <input
                        type="number"
                        min={1}
                        value={selectedCheck.schedule.interval}
                        onChange={(e) =>
                          handleUpdateCheck({
                            schedule: {
                              ...selectedCheck.schedule,
                              interval: parseInt(e.target.value, 10) || 1,
                            },
                          })
                        }
                      />
                      <select
                        value={selectedCheck.schedule.unit}
                        onChange={(e) =>
                          handleUpdateCheck({
                            schedule: {
                              ...selectedCheck.schedule,
                              unit: e.target.value as HealthCheckIntervalUnit,
                            },
                          })
                        }
                      >
                        <option value="seconds">{t('healthcheck.unitSeconds')}</option>
                        <option value="minutes">{t('healthcheck.unitMinutes')}</option>
                        <option value="hours">{t('healthcheck.unitHours')}</option>
                      </select>
                    </div>

                    {/* Down interval */}
                    <div className="hc-toggle-row">
                      <input
                        type="checkbox"
                        checked={!!selectedCheck.schedule.downInterval}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleUpdateCheck({
                              schedule: {
                                ...selectedCheck.schedule,
                                downInterval: 10,
                                downUnit: 'seconds',
                              },
                            })
                          } else {
                            handleUpdateCheck({
                              schedule: {
                                ...selectedCheck.schedule,
                                downInterval: undefined,
                                downUnit: undefined,
                              },
                            })
                          }
                        }}
                      />
                      <label
                        onClick={() => {
                          if (selectedCheck.schedule.downInterval) {
                            handleUpdateCheck({
                              schedule: {
                                ...selectedCheck.schedule,
                                downInterval: undefined,
                                downUnit: undefined,
                              },
                            })
                          } else {
                            handleUpdateCheck({
                              schedule: {
                                ...selectedCheck.schedule,
                                downInterval: 10,
                                downUnit: 'seconds',
                              },
                            })
                          }
                        }}
                      >
                        {t('healthcheck.downIntervalEnabled')}
                      </label>
                    </div>
                    {selectedCheck.schedule.downInterval && (
                      <div className="hc-form-row">
                        <label>{t('healthcheck.downInterval')}</label>
                        <input
                          type="number"
                          min={1}
                          value={selectedCheck.schedule.downInterval}
                          onChange={(e) =>
                            handleUpdateCheck({
                              schedule: {
                                ...selectedCheck.schedule,
                                downInterval: parseInt(e.target.value, 10) || 1,
                              },
                            })
                          }
                        />
                        <select
                          value={selectedCheck.schedule.downUnit ?? 'seconds'}
                          onChange={(e) =>
                            handleUpdateCheck({
                              schedule: {
                                ...selectedCheck.schedule,
                                downUnit: e.target.value as HealthCheckIntervalUnit,
                              },
                            })
                          }
                        >
                          <option value="seconds">{t('healthcheck.unitSeconds')}</option>
                          <option value="minutes">{t('healthcheck.unitMinutes')}</option>
                          <option value="hours">{t('healthcheck.unitHours')}</option>
                        </select>
                      </div>
                    )}

                    {schedulerRunning && (
                      <button
                        className="hc-toolbar-btn"
                        onClick={handleUpdateInterval}
                        style={{ marginTop: 4 }}
                      >
                        {t('healthcheck.updateInterval')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* History area — fills remaining space, scrolls independently */}
              <div className="hc-history-area">
                <div className="hc-history-header">
                  <span className="hc-history-title">
                    {t('healthcheck.history')}
                    <span className="hc-history-count">{checkHistory.length}</span>
                  </span>
                  {checkHistory.length > 0 && (
                    <button className="hc-clear-btn" onClick={handleClearHistory}>
                      {t('healthcheck.clearHistory')}
                    </button>
                  )}
                </div>
                <div className="hc-history-body">
                  {/* Incidents */}
                  {checkIncidents.length > 0 && (
                    <div className="hc-incidents-list">
                      {checkIncidents.map((incident) => {
                        const isOpen = incident.endedAt === null
                        return (
                          <div
                            key={incident.id}
                            className={`hc-incident${isOpen ? ' hc-incident--active' : ' hc-incident--resolved'}`}
                          >
                            <div className="hc-incident-top">
                              <span className={`hc-incident-badge${isOpen ? ' hc-incident-badge--ongoing' : ' hc-incident-badge--resolved'}`}>
                                {isOpen ? t('healthcheck.incidentOngoing') : t('healthcheck.incidentEnded')}
                              </span>
                              <span className="hc-incident-duration">
                                {formatDuration(incident.startedAt, incident.endedAt)}
                                {' · '}
                                {incident.failureCount} {t('healthcheck.incidentFailures').toLowerCase()}
                              </span>
                            </div>
                            <div className="hc-incident-times">
                              <span>{t('healthcheck.incidentStarted')}: {formatTimestamp(incident.startedAt)}</span>
                              {incident.endedAt && (
                                <span>{t('healthcheck.incidentEnded')}: {formatTimestamp(incident.endedAt)}</span>
                              )}
                            </div>
                            {incident.lastError && (
                              <div className="hc-incident-error">{incident.lastError}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Log entries */}
                  {checkHistory.length === 0 && checkIncidents.length === 0 && (
                    <div className="hc-empty-hint">{t('healthcheck.historyEmpty')}</div>
                  )}
                  {paginatedHistory.length > 0 && (
                    <div className="hc-log-list">
                      {paginatedHistory.map((entry) => (
                        <div key={entry.id} className={`hc-log-row${entry.success ? '' : ' hc-log-row--fail'}`}>
                          <span className="hc-log-time">{formatTimestamp(entry.timestamp)}</span>
                          <span className={`hc-log-code${entry.success ? ' hc-log-code--ok' : ' hc-log-code--err'}`}>
                            {entry.status}
                          </span>
                          <span className="hc-log-ms">{entry.responseTime}ms</span>
                          <span className={`hc-log-pill${entry.success ? ' hc-log-pill--pass' : ' hc-log-pill--fail'}`}>
                            {entry.success ? t('healthcheck.success') : t('healthcheck.failure')}
                          </span>
                          {entry.error && (
                            <span className="hc-log-error" title={entry.error}>
                              {entry.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {historyPageCount > 1 && (
                    <div className="hc-pagination">
                      <button
                        className="hc-toolbar-btn"
                        disabled={historyPage === 0}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        ‹
                      </button>
                      <span className="hc-pagination-label">
                        {historyPage + 1} / {historyPageCount}
                      </span>
                      <button
                        className="hc-toolbar-btn"
                        disabled={historyPage >= historyPageCount - 1}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
