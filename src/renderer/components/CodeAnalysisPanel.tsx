import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import type {
  AnalysisToolDef,
  AnalysisReport,
  AnalysisFinding,
  AnalysisSeverity,
  AnalysisProgress,
  ProjectStatsData,
} from '../../shared/types'
import '../styles/analysis.css'

type GroupBy = 'file' | 'rule' | 'severity'
type TicketGroupBy = 'individual' | 'file' | 'rule' | 'severity'

const SEVERITY_ORDER: AnalysisSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

// Map file extensions to language identifiers used in tool catalog
const EXT_TO_LANGUAGES: Record<string, string[]> = {
  '.py': ['python'],
  '.pyw': ['python'],
  '.pyx': ['python'],
  '.js': ['javascript'],
  '.jsx': ['javascript'],
  '.mjs': ['javascript'],
  '.cjs': ['javascript'],
  '.ts': ['typescript'],
  '.tsx': ['typescript'],
  '.mts': ['typescript'],
  '.cts': ['typescript'],
  '.go': ['go'],
  '.java': ['java'],
  '.rb': ['ruby'],
  '.erb': ['ruby'],
  '.c': ['c'],
  '.h': ['c', 'cpp'],
  '.cpp': ['cpp'],
  '.cc': ['cpp'],
  '.cxx': ['cpp'],
  '.hpp': ['cpp'],
  '.hxx': ['cpp'],
  '.php': ['php'],
  '.tf': ['terraform'],
  '.hcl': ['terraform'],
  '.yaml': ['kubernetes', 'cloudformation'],
  '.yml': ['kubernetes', 'cloudformation'],
  '.dockerfile': ['docker'],
}

const ALL_REPORTS_ID = '__all__'

function formatDuration(ms: number): string {
  const seconds = (ms / 1000).toFixed(1)
  return seconds
}

function computeGrade(reports: AnalysisReport[]): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
  let critical = 0, high = 0, medium = 0
  for (const r of reports) {
    critical += r.summary.critical
    high += r.summary.high
    medium += r.summary.medium
  }
  if (critical === 0 && high === 0 && medium <= 5) return 'A'
  if (critical === 0 && high <= 3 && medium <= 20) return 'B'
  if (critical === 0 && high <= 10) return 'C'
  if (critical <= 3 && high <= 20) return 'D'
  if (critical <= 10) return 'E'
  return 'F'
}

export function CodeAnalysisPanel() {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { openFile } = useViewStore()

  const [tools, setTools] = useState<AnalysisToolDef[]>([])
  const [reports, setReports] = useState<AnalysisReport[]>([])
  const [activeReportId, setActiveReportId] = useState<string | null>(ALL_REPORTS_ID)
  const [runningTools, setRunningTools] = useState<Set<string>>(new Set())
  const [severityFilter, setSeverityFilter] = useState<AnalysisSeverity | 'all'>('all')
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set())
  const [groupBy] = useState<GroupBy>('file')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [ticketGroupBy, setTicketGroupBy] = useState<TicketGroupBy>('individual')
  const [ticketPriority, setTicketPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [detectingTools, setDetectingTools] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [projectStats, setProjectStats] = useState<ProjectStatsData | null>(null)

  // Install states
  const [installingTools, setInstallingTools] = useState<Set<string>>(new Set())
  const [installOutput, setInstallOutput] = useState<Record<string, string>>({})
  const [activeInstallTool, setActiveInstallTool] = useState<string | null>(null)
  const [copiedInstallOutput, setCopiedInstallOutput] = useState(false)

  // Finding detail
  const [selectedFinding, setSelectedFinding] = useState<AnalysisFinding | null>(null)
  const [copiedError, setCopiedError] = useState(false)

  const installBufferRef = useRef<HTMLPreElement>(null)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Compute project languages from file extensions
  const projectLanguages = useMemo(() => {
    if (!projectStats) return new Set<string>()
    const langs = new Set<string>()
    for (const entry of projectStats.fileTypeBreakdown) {
      const ext = entry.ext.startsWith('.') ? entry.ext : `.${entry.ext}`
      const mapped = EXT_TO_LANGUAGES[ext.toLowerCase()]
      if (mapped) {
        for (const lang of mapped) langs.add(lang)
      }
    }
    // Also detect Docker from Dockerfile (no extension)
    if (projectStats.fileTypeBreakdown.some((e) => e.ext === '' || e.ext === 'Dockerfile')) {
      langs.add('docker')
    }
    return langs
  }, [projectStats])

  // Filter tools: only show tools relevant to the project languages
  const relevantTools = useMemo(() => {
    if (!projectStats || projectLanguages.size === 0) return tools
    return tools.filter((tool) => {
      // Universal tools (languages: ['*']) always relevant
      if (tool.languages.includes('*')) return true
      // Tool is relevant if any of its languages matches project languages
      return tool.languages.some((lang) => projectLanguages.has(lang))
    })
  }, [tools, projectStats, projectLanguages])

  const aggregatedReport = useMemo(() => {
    if (reports.length === 0) return null
    const allFindings: AnalysisFinding[] = []
    const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const r of reports) {
      allFindings.push(...r.findings)
      summary.total += r.summary.total
      summary.critical += r.summary.critical
      summary.high += r.summary.high
      summary.medium += r.summary.medium
      summary.low += r.summary.low
      summary.info += r.summary.info
    }
    return {
      id: ALL_REPORTS_ID,
      toolId: ALL_REPORTS_ID,
      toolName: t('analysis.allReports'),
      findings: allFindings,
      summary,
      duration: reports.reduce((sum, r) => sum + r.duration, 0),
      timestamp: Date.now(),
    } as AnalysisReport
  }, [reports, t])

  const activeReport = useMemo(() => {
    if (activeReportId === ALL_REPORTS_ID) return aggregatedReport
    if (!activeReportId) return null
    return reports.find((r) => r.id === activeReportId) ?? null
  }, [reports, activeReportId, aggregatedReport])

  const projectGrade = useMemo(() => {
    if (reports.length === 0) return null
    return computeGrade(reports)
  }, [reports])

  // Map toolId → report for sidebar navigation
  const reportsByTool = useMemo(() => {
    const map = new Map<string, AnalysisReport>()
    for (const r of reports) {
      map.set(r.toolId, r)
    }
    return map
  }, [reports])

  // Detect tools on project change
  const detectTools = useCallback(async () => {
    if (!activeProject) return
    setDetectingTools(true)
    try {
      const detected = await window.kanbai.analysis.detectTools(activeProject.path)
      setTools(detected)
    } catch {
      setTools([])
    } finally {
      setDetectingTools(false)
    }
  }, [activeProject])

  // Load persisted reports from disk
  const loadReports = useCallback(async () => {
    if (!activeProject) return
    try {
      const loaded = await window.kanbai.analysis.loadReports(activeProject.path)
      if (loaded.length > 0) {
        setReports(loaded)
        setActiveReportId(ALL_REPORTS_ID)
      }
    } catch {
      // silently fail
    }
  }, [activeProject])

  // Load project stats to determine relevant languages
  const loadProjectStats = useCallback(async () => {
    if (!activeProject) return
    try {
      const stats = await window.kanbai.project.stats(activeProject.path)
      setProjectStats(stats)
    } catch {
      setProjectStats(null)
    }
  }, [activeProject])

  useEffect(() => {
    detectTools()
    loadProjectStats()
    setReports([])
    setActiveReportId(ALL_REPORTS_ID)
    setSelectedFindings(new Set())
    setInstallOutput({})
    setActiveInstallTool(null)
    setInstallingTools(new Set())
    setSelectedFinding(null)
    loadReports()
  }, [detectTools, loadProjectStats, loadReports])

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = window.kanbai.analysis.onProgress((data: AnalysisProgress) => {
      if (data.status === 'running') {
        setRunningTools((prev) => new Set(prev).add(data.toolId))
      } else {
        setRunningTools((prev) => {
          const next = new Set(prev)
          next.delete(data.toolId)
          return next
        })
      }
    })
    return unsubscribe
  }, [])

  // Subscribe to install progress events
  useEffect(() => {
    const unsub = window.kanbai.analysis.onInstallProgress((data) => {
      setInstallOutput((prev) => ({
        ...prev,
        [data.toolId]: (prev[data.toolId] || '') + data.output,
      }))
    })
    return unsub
  }, [])

  // Auto-scroll install buffer
  useEffect(() => {
    if (installBufferRef.current) {
      installBufferRef.current.scrollTop = installBufferRef.current.scrollHeight
    }
  }, [installOutput, activeInstallTool])

  // Copy error to clipboard
  const copyError = useCallback(() => {
    if (!activeReport?.error) return
    navigator.clipboard.writeText(activeReport.error)
    setCopiedError(true)
    setTimeout(() => setCopiedError(false), 2000)
  }, [activeReport])

  // Copy install output to clipboard
  const copyInstallOutput = useCallback(() => {
    if (!activeInstallTool || !installOutput[activeInstallTool]) return
    navigator.clipboard.writeText(installOutput[activeInstallTool])
    setCopiedInstallOutput(true)
    setTimeout(() => setCopiedInstallOutput(false), 2000)
  }, [activeInstallTool, installOutput])

  // Install a tool
  const installTool = useCallback(async (toolId: string) => {
    setInstallingTools((prev) => new Set(prev).add(toolId))
    setInstallOutput((prev) => ({ ...prev, [toolId]: '' }))
    setActiveInstallTool(toolId)
    try {
      const result = await window.kanbai.analysis.installTool(toolId)
      if (result.installed) {
        detectTools()
        setToastMessage(t('analysis.installSuccess'))
        setTimeout(() => setToastMessage(null), 3000)
      } else if (result.error) {
        setToastMessage(t('analysis.installError'))
        setTimeout(() => setToastMessage(null), 3000)
      }
    } catch {
      setToastMessage(t('analysis.installError'))
      setTimeout(() => setToastMessage(null), 3000)
    } finally {
      setInstallingTools((prev) => {
        const n = new Set(prev)
        n.delete(toolId)
        return n
      })
    }
  }, [detectTools, t])

  // Run a single tool
  const runTool = useCallback(async (toolId: string) => {
    if (!activeProject) return
    setActiveInstallTool(null) // switch to reports view
    setRunningTools((prev) => new Set(prev).add(toolId))
    try {
      const report = await window.kanbai.analysis.run({
        projectPath: activeProject.path,
        toolId,
      })
      setReports((prev) => {
        const filtered = prev.filter((r) => r.toolId !== toolId)
        return [...filtered, report]
      })
      setActiveReportId(report.id)
    } catch {
      // error handled by progress events
    } finally {
      setRunningTools((prev) => {
        const next = new Set(prev)
        next.delete(toolId)
        return next
      })
    }
  }, [activeProject])

  // Cancel a running tool
  const cancelTool = useCallback(async (toolId: string) => {
    try {
      await window.kanbai.analysis.cancel(toolId)
      setRunningTools((prev) => {
        const next = new Set(prev)
        next.delete(toolId)
        return next
      })
    } catch {
      // silently fail
    }
  }, [])

  // Delete a report
  const deleteReport = useCallback(async (reportId: string) => {
    if (!activeProject) return
    try {
      await window.kanbai.analysis.deleteReport(activeProject.path, reportId)
      setReports((prev) => prev.filter((r) => r.id !== reportId))
      if (activeReportId === reportId) {
        setActiveReportId(null)
      }
    } catch {
      // silently fail
    }
  }, [activeProject, activeReportId])

  // Run all installed relevant tools
  const runAll = useCallback(async () => {
    const installed = relevantTools.filter((tool) => tool.installed)
    for (const tool of installed) {
      await runTool(tool.id)
    }
    if (installed.length > 1) {
      setActiveReportId(ALL_REPORTS_ID)
    }
  }, [relevantTools, runTool])

  // Re-analyze current report or all reports
  const reanalyze = useCallback(async () => {
    if (activeReportId === ALL_REPORTS_ID) {
      await runAll()
    } else {
      const report = reports.find((r) => r.id === activeReportId)
      if (report) await runTool(report.toolId)
    }
  }, [activeReportId, reports, runAll, runTool])

  // Filtered findings
  const filteredFindings = useMemo(() => {
    if (!activeReport) return []
    if (severityFilter === 'all') return activeReport.findings
    return activeReport.findings.filter((f) => f.severity === severityFilter)
  }, [activeReport, severityFilter])

  // Grouped findings
  const grouped = useMemo(() => {
    const groups: Record<string, AnalysisFinding[]> = {}
    for (const finding of filteredFindings) {
      let key: string
      if (groupBy === 'file') {
        key = finding.file
      } else if (groupBy === 'rule') {
        key = finding.rule || '(no rule)'
      } else {
        key = finding.severity
      }
      if (!groups[key]) groups[key] = []
      groups[key]!.push(finding)
    }
    const entries = Object.entries(groups)
    if (groupBy === 'severity') {
      entries.sort(([a], [b]) => {
        return SEVERITY_ORDER.indexOf(a as AnalysisSeverity) - SEVERITY_ORDER.indexOf(b as AnalysisSeverity)
      })
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b))
    }
    return entries
  }, [filteredFindings, groupBy])

  // Toggle group collapse
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }, [])

  // Toggle finding selection
  const toggleFinding = useCallback((findingId: string) => {
    setSelectedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(findingId)) {
        next.delete(findingId)
      } else {
        next.add(findingId)
      }
      return next
    })
  }, [])

  // Select / deselect all visible
  const selectAll = useCallback(() => {
    setSelectedFindings(new Set(filteredFindings.map((f) => f.id)))
  }, [filteredFindings])

  const deselectAll = useCallback(() => {
    setSelectedFindings(new Set())
  }, [])

  // Handle click on finding row (show detail)
  const handleClickFinding = useCallback((finding: AnalysisFinding) => {
    setSelectedFinding((prev) => prev?.id === finding.id ? null : finding)
  }, [])

  // Handle click on file link (navigate to file)
  const handleNavigateToFile = useCallback(
    (finding: AnalysisFinding) => {
      if (!activeProject) return
      const fullPath = activeProject.path + '/' + finding.file
      openFile(fullPath, finding.line)
    },
    [activeProject, openFile],
  )

  // Ticket preview count
  const ticketPreviewCount = useMemo(() => {
    if (selectedFindings.size === 0) return 0
    if (ticketGroupBy === 'individual') return selectedFindings.size
    const selected = filteredFindings.filter((f) => selectedFindings.has(f.id))
    const keys = new Set<string>()
    for (const f of selected) {
      if (ticketGroupBy === 'file') keys.add(f.file)
      else if (ticketGroupBy === 'rule') keys.add(f.rule || '(no rule)')
      else keys.add(f.severity)
    }
    return keys.size
  }, [selectedFindings, ticketGroupBy, filteredFindings])

  // Create tickets
  const handleCreateTickets = useCallback(async () => {
    if (!activeReport || !activeWorkspaceId) return
    try {
      if (activeReportId === ALL_REPORTS_ID) {
        // Group findings by source report
        const findingToReport = new Map<string, string>()
        for (const r of reports) {
          for (const f of r.findings) {
            findingToReport.set(f.id, r.id)
          }
        }
        const grouped = new Map<string, string[]>()
        for (const fid of selectedFindings) {
          const rid = findingToReport.get(fid)
          if (rid) {
            if (!grouped.has(rid)) grouped.set(rid, [])
            grouped.get(rid)!.push(fid)
          }
        }
        let totalTickets = 0
        for (const [reportId, findingIds] of grouped) {
          const result = await window.kanbai.analysis.createTickets({
            findingIds,
            reportId,
            workspaceId: activeWorkspaceId,
            priority: ticketPriority,
            groupBy: ticketGroupBy,
          })
          if (result.success) totalTickets += result.ticketCount
        }
        setShowTicketModal(false)
        setSelectedFindings(new Set())
        setToastMessage(t('analysis.ticketsCreatedReanalyze', { count: String(totalTickets) }))
        setTimeout(() => setToastMessage(null), 5000)
      } else {
        const result = await window.kanbai.analysis.createTickets({
          findingIds: Array.from(selectedFindings),
          reportId: activeReport.id,
          workspaceId: activeWorkspaceId,
          priority: ticketPriority,
          groupBy: ticketGroupBy,
        })
        if (result.success) {
          setShowTicketModal(false)
          setSelectedFindings(new Set())
          setToastMessage(t('analysis.ticketsCreatedReanalyze', { count: String(result.ticketCount) }))
          setTimeout(() => setToastMessage(null), 5000)
        }
      }
    } catch {
      // silently fail
    }
  }, [activeReport, activeReportId, activeWorkspaceId, reports, selectedFindings, ticketPriority, ticketGroupBy, t])

  const installedCount = relevantTools.filter((tool) => tool.installed).length
  const isAnyRunning = runningTools.size > 0

  // Name of the currently running tool (for display in content area)
  const runningToolName = useMemo(() => {
    if (runningTools.size === 0) return null
    const firstRunningId = runningTools.values().next().value as string
    const tool = relevantTools.find((t) => t.id === firstRunningId)
    return tool?.name ?? firstRunningId
  }, [runningTools, relevantTools])

  if (!activeProject) {
    return <div className="analysis-panel-empty">{t('analysis.noProject')}</div>
  }

  return (
    <div className="analysis-panel">
      {/* Header */}
      <div className="analysis-header">
        <h3>{t('analysis.title')}</h3>
        {activeReport && (
          <span className="analysis-header-count">
            {activeReport.summary.total} {t('analysis.findings')}
          </span>
        )}
        {projectGrade && (
          <span className="analysis-grade-badge" data-grade={projectGrade}>
            {projectGrade}
          </span>
        )}
        <button
          className="analysis-refresh-btn"
          onClick={detectTools}
          disabled={detectingTools}
          title={t('common.refresh')}
        >
          {detectingTools ? '...' : '\u21BB'}
        </button>
      </div>

      {/* Panel body: sidebar + content */}
      <div className="analysis-panel-body">
        {/* Sidebar */}
        <div className="analysis-sidebar">
          <div className="analysis-sidebar-header">
            <span>{t('analysis.relevantTools')}</span>
          </div>
          <div className="analysis-sidebar-list">
            {detectingTools && tools.length === 0 && (
              <div className="analysis-loading">
                <span className="analysis-spinner" />
                {t('analysis.detectingTools')}
              </div>
            )}

            {!detectingTools && relevantTools.length === 0 && (
              <div className="analysis-tools-empty">
                <span>{t('analysis.notRelevant')}</span>
                <span className="analysis-tools-empty-hint">{t('analysis.installHint')}</span>
              </div>
            )}

            {/* "Tous" entry */}
            {reports.length > 0 && (
              <div
                className={`analysis-tool-item analysis-tool-item--tous${activeReportId === ALL_REPORTS_ID ? ' analysis-tool-item--active' : ''}`}
                onClick={() => setActiveReportId(ALL_REPORTS_ID)}
              >
                <span className="analysis-tool-name">{t('common.all')}</span>
                {aggregatedReport && (
                  <span className="analysis-tool-count">{aggregatedReport.summary.total}</span>
                )}
              </div>
            )}

            {relevantTools.map((tool) => {
              const toolReport = reportsByTool.get(tool.id)
              const isToolActive = activeReportId !== ALL_REPORTS_ID && toolReport?.id === activeReportId
              return (
                <div
                  key={tool.id}
                  className={`analysis-tool-item${isToolActive ? ' analysis-tool-item--active' : ''}`}
                  onClick={() => toolReport && setActiveReportId(toolReport.id)}
                  style={toolReport ? { cursor: 'pointer' } : undefined}
                >
                  <span className="analysis-tool-category-dot" data-category={tool.category} />
                  <span className="analysis-tool-name">{tool.name}</span>
                  {toolReport && (
                    <span className="analysis-tool-count">{toolReport.summary.total}</span>
                  )}
                  {tool.installed ? (
                    runningTools.has(tool.id) ? (
                      <button
                        className="analysis-tool-cancel-btn"
                        onClick={(e) => { e.stopPropagation(); cancelTool(tool.id) }}
                        title={t('common.cancel')}
                      >
                        {'\u25A0'}
                      </button>
                    ) : (
                      <button
                        className="analysis-tool-run-btn"
                        onClick={(e) => { e.stopPropagation(); runTool(tool.id) }}
                        title={t('analysis.runAll')}
                      >
                        {'\u25B6'}
                      </button>
                    )
                  ) : installingTools.has(tool.id) ? (
                    <span className="analysis-tool-installing-spinner" />
                  ) : (
                    <button
                      className="analysis-tool-install-btn"
                      onClick={(e) => { e.stopPropagation(); installTool(tool.id) }}
                      title={t('analysis.installButton')}
                    >
                      {'\u2B07'} {t('analysis.installButton')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {installedCount > 1 && (
            <button
              className="analysis-run-all-btn"
              onClick={runAll}
              disabled={isAnyRunning}
            >
              {isAnyRunning ? t('analysis.running') : t('analysis.runAll')}
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="analysis-content">
          {/* Install buffer view */}
          {activeInstallTool && (
            <div className="analysis-install-buffer">
              <div className="analysis-install-buffer-header">
                <span>
                  {installingTools.has(activeInstallTool)
                    ? t('analysis.installing')
                    : t('analysis.installButton')}
                  {' '}{activeInstallTool}
                </span>
                <div className="analysis-install-buffer-actions">
                  <button
                    className={`analysis-install-buffer-copy${copiedInstallOutput ? ' analysis-install-buffer-copy--copied' : ''}`}
                    onClick={copyInstallOutput}
                    title={t('common.copy')}
                  >
                    {copiedInstallOutput ? '\u2713' : '\u2398'}
                  </button>
                  <button
                    className="analysis-install-buffer-close"
                    onClick={() => setActiveInstallTool(null)}
                  >
                    {'\u00D7'}
                  </button>
                </div>
              </div>
              <pre ref={installBufferRef}>
                {installOutput[activeInstallTool] || t('analysis.installing')}
              </pre>
            </div>
          )}

          {/* Reports view (when not viewing install buffer) */}
          {!activeInstallTool && (
            <>
              {/* Running indicator */}
              {isAnyRunning && (
                <div className="analysis-running-indicator">
                  <span className="analysis-spinner" />
                  <span>{t('analysis.runningTool', { tool: runningToolName ?? '' })}</span>
                </div>
              )}

              {/* Empty state: no reports yet, nothing running — central launch button */}
              {reports.length === 0 && !isAnyRunning && (
                <div className="analysis-content-empty">
                  <span className="analysis-content-empty-icon">{'\u{1F50D}'}</span>
                  <span>{t('analysis.emptyTitle')}</span>
                  <span className="analysis-content-empty-hint">{t('analysis.emptyHint')}</span>
                  {installedCount > 0 && (
                    <button
                      className="analysis-launch-btn"
                      onClick={runAll}
                    >
                      {'\u25B6'} {t('analysis.launchAnalysis')}
                    </button>
                  )}
                </div>
              )}

              {/* Success state: individual report with 0 findings and nothing running */}
              {activeReport && activeReportId !== ALL_REPORTS_ID && activeReport.summary.total === 0 && !activeReport.error && !isAnyRunning && (
                <div className="analysis-success-message">
                  <span className="analysis-success-icon">{'\u2713'}</span>
                  <span>{t('analysis.allClear')}</span>
                </div>
              )}

              {reports.length > 0 && (
                <div className="analysis-reports">
                  {activeReport && (
                    <>
                      {/* Grade panel for All view */}
                      {activeReportId === ALL_REPORTS_ID && projectGrade && (
                        <div className="analysis-grade-panel">
                          <span className="analysis-grade-large" data-grade={projectGrade}>
                            {projectGrade}
                          </span>
                          <div className="analysis-grade-info">
                            <span className="analysis-grade-label">{t('analysis.projectGrade')}</span>
                            <span className="analysis-grade-detail">
                              {aggregatedReport?.summary.critical ?? 0} critical {'\u00B7'} {aggregatedReport?.summary.high ?? 0} high {'\u00B7'} {aggregatedReport?.summary.medium ?? 0} medium
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Error display */}
                      {activeReport.error && (
                        <div className="analysis-report-error">
                          <span className="analysis-report-error-text">
                            {t('analysis.error')}: {activeReport.error}
                          </span>
                          <button
                            className={`analysis-report-error-copy${copiedError ? ' analysis-report-error-copy--copied' : ''}`}
                            onClick={copyError}
                            title={t('common.copy')}
                          >
                            {copiedError ? '\u2713' : '\u2398'}
                          </button>
                        </div>
                      )}

                      {/* Duration + Re-analyze */}
                      {activeReport.duration > 0 && (
                        <span className="analysis-report-duration">
                          {t('analysis.duration')}: {formatDuration(activeReport.duration)} {t('analysis.seconds')}
                        </span>
                      )}
                      {!isAnyRunning && (
                        <button
                          className="analysis-reanalyze-btn"
                          onClick={reanalyze}
                        >
                          {'\u21BB'} {t('analysis.reanalyze')}
                        </button>
                      )}

                      {/* Summary badges */}
                      <div className="analysis-summary">
                        <button
                          className={`analysis-severity-badge${severityFilter === 'all' ? ' analysis-severity-badge--active' : ''}`}
                          data-severity="all"
                          onClick={() => setSeverityFilter('all')}
                        >
                          {t('common.all')} {activeReport.summary.total}
                        </button>
                        {SEVERITY_ORDER.map((sev) => {
                          const count = activeReport.summary[sev]
                          if (count === 0) return null
                          return (
                            <button
                              key={sev}
                              className={`analysis-severity-badge${severityFilter === sev ? ' analysis-severity-badge--active' : ''}`}
                              data-severity={sev}
                              onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}
                            >
                              {sev} {count}
                            </button>
                          )
                        })}
                      </div>

                      {/* Findings list */}
                      <div className="analysis-findings">
                        {filteredFindings.length === 0 && (
                          <div className="analysis-findings-empty">{t('analysis.noFindings')}</div>
                        )}
                        {grouped.map(([group, items]) => (
                          <div key={group} className="analysis-group">
                            <button
                              className="analysis-group-header"
                              onClick={() => toggleGroup(group)}
                            >
                              <span
                                className="analysis-group-chevron"
                                style={{ transform: collapsedGroups.has(group) ? 'rotate(0deg)' : 'rotate(90deg)' }}
                              >
                                {'\u25B6'}
                              </span>
                              <span className="analysis-group-name">{group}</span>
                              <span className="analysis-group-count">{items.length}</span>
                            </button>
                            {!collapsedGroups.has(group) && (
                              <div className="analysis-entries">
                                {items.map((finding) => (
                                  <div key={finding.id}>
                                    <div
                                      className={`analysis-entry${selectedFinding?.id === finding.id ? ' analysis-entry--selected' : ''}`}
                                      onClick={() => handleClickFinding(finding)}
                                    >
                                      <input
                                        type="checkbox"
                                        className="analysis-entry-checkbox"
                                        checked={selectedFindings.has(finding.id)}
                                        onChange={() => toggleFinding(finding.id)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <span
                                        className="analysis-entry-severity"
                                        data-severity={finding.severity}
                                      >
                                        {finding.severity}
                                      </span>
                                      <button
                                        className="analysis-entry-location"
                                        onClick={(e) => { e.stopPropagation(); handleNavigateToFile(finding) }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                      >
                                        {finding.file}:{finding.line}
                                      </button>
                                      <span className="analysis-entry-message">{finding.message}</span>
                                      {finding.rule && (
                                        <span className="analysis-entry-rule">{finding.rule}</span>
                                      )}
                                    </div>
                                    {selectedFinding?.id === finding.id && (
                                      <div className="analysis-finding-detail">
                                        <div className="analysis-finding-detail-row">
                                          <span className="analysis-finding-detail-label">{t('analysis.detailSeverity')}</span>
                                          <span className="analysis-entry-severity" data-severity={finding.severity}>
                                            {finding.severity}
                                          </span>
                                        </div>
                                        <div className="analysis-finding-detail-row">
                                          <span className="analysis-finding-detail-label">{t('analysis.detailFile')}</span>
                                          <button
                                            className="analysis-finding-detail-link"
                                            onClick={() => handleNavigateToFile(finding)}
                                          >
                                            {finding.file}:{finding.line}
                                            {finding.column ? `:${finding.column}` : ''}
                                            {finding.endLine ? ` - ${finding.endLine}${finding.endColumn ? `:${finding.endColumn}` : ''}` : ''}
                                          </button>
                                        </div>
                                        <div className="analysis-finding-detail-row">
                                          <span className="analysis-finding-detail-label">{t('analysis.detailMessage')}</span>
                                          <span className="analysis-finding-detail-value">{finding.message}</span>
                                        </div>
                                        {finding.rule && (
                                          <div className="analysis-finding-detail-row">
                                            <span className="analysis-finding-detail-label">{t('analysis.detailRule')}</span>
                                            <span className="analysis-finding-detail-value">
                                              {finding.ruleUrl ? (
                                                <button
                                                  className="analysis-finding-detail-link"
                                                  onClick={() => finding.ruleUrl && window.open(finding.ruleUrl)}
                                                >
                                                  {finding.rule}
                                                </button>
                                              ) : finding.rule}
                                            </span>
                                          </div>
                                        )}
                                        {finding.cwe && (
                                          <div className="analysis-finding-detail-row">
                                            <span className="analysis-finding-detail-label">CWE</span>
                                            <span className="analysis-finding-detail-value">{finding.cwe}</span>
                                          </div>
                                        )}
                                        {finding.snippet && (
                                          <div className="analysis-finding-detail-snippet">
                                            <span className="analysis-finding-detail-label">{t('analysis.detailSnippet')}</span>
                                            <pre>{finding.snippet}</pre>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Footer */}
                      {activeReport.summary.total > 0 && (
                        <div className="analysis-footer">
                          <div className="analysis-footer-left">
                            <div className="analysis-select-btns">
                              <button className="analysis-select-btn" onClick={selectAll}>
                                {t('analysis.selectAll')}
                              </button>
                              <button className="analysis-select-btn" onClick={deselectAll}>
                                {t('analysis.deselectAll')}
                              </button>
                            </div>
                            <span className="analysis-footer-count">
                              {t('analysis.selectedFindings', { count: String(selectedFindings.size) })}
                            </span>
                          </div>
                          <div className="analysis-footer-right">
                            {activeReportId !== ALL_REPORTS_ID && (
                              <button
                                className="analysis-delete-report-btn"
                                onClick={() => deleteReport(activeReport.id)}
                                title={t('common.delete')}
                              >
                                {'\u00D7'}
                              </button>
                            )}
                            <button
                              className="analysis-create-tickets-btn"
                              disabled={selectedFindings.size === 0}
                              onClick={() => setShowTicketModal(true)}
                            >
                              {t('analysis.createTickets')}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ticket creation modal */}
      {showTicketModal && (
        <div className="analysis-modal-overlay" onClick={() => setShowTicketModal(false)}>
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="analysis-modal-header">
              <h3>{t('analysis.createTickets')}</h3>
              <button className="analysis-modal-close" onClick={() => setShowTicketModal(false)}>
                {'\u00D7'}
              </button>
            </div>
            <div className="analysis-modal-body">
              <div className="analysis-modal-field">
                <span className="analysis-modal-label">
                  {t('analysis.selectedFindings', { count: String(selectedFindings.size) })}
                </span>
              </div>

              <div className="analysis-modal-field">
                <span className="analysis-modal-label">{t('analysis.ticketGroupBy')}</span>
                <select
                  className="analysis-modal-select"
                  value={ticketGroupBy}
                  onChange={(e) => setTicketGroupBy(e.target.value as TicketGroupBy)}
                >
                  <option value="individual">{t('analysis.ticketGroupIndividual')}</option>
                  <option value="file">{t('analysis.ticketGroupFile')}</option>
                  <option value="rule">{t('analysis.ticketGroupRule')}</option>
                  <option value="severity">{t('analysis.ticketGroupSeverity')}</option>
                </select>
              </div>

              <div className="analysis-modal-field">
                <span className="analysis-modal-label">{t('analysis.ticketPriority')}</span>
                <select
                  className="analysis-modal-select"
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                >
                  <option value="low">{t('kanban.low')}</option>
                  <option value="medium">{t('kanban.medium')}</option>
                  <option value="high">{t('kanban.high')}</option>
                  <option value="critical">{t('kanban.critical')}</option>
                </select>
              </div>

              <div className="analysis-modal-preview">
                {t('analysis.ticketPreview', { count: String(ticketPreviewCount) })}
              </div>
            </div>
            <div className="analysis-modal-actions">
              <button className="analysis-modal-cancel" onClick={() => setShowTicketModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="analysis-modal-submit"
                disabled={selectedFindings.size === 0}
                onClick={handleCreateTickets}
              >
                {t('analysis.createButton', { count: String(ticketPreviewCount) })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toastMessage && (
        <div className="analysis-toast">{toastMessage}</div>
      )}
    </div>
  )
}
