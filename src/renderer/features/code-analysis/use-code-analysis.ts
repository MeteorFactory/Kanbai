import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useViewStore } from '../../lib/stores/viewStore'
import { useI18n } from '../../lib/i18n'
import type {
  AnalysisToolDef,
  AnalysisReport,
  AnalysisFinding,
  AnalysisSeverity,
  AnalysisProgress,
  ProjectStatsData,
  Project,
} from '../../../shared/types'

export type GroupBy = 'file' | 'rule' | 'severity'
export type TicketGroupBy = 'individual' | 'file' | 'rule' | 'severity'

export const SEVERITY_ORDER: AnalysisSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

const ALL_REPORTS_ID = '__all__'
const ALL_PROJECTS_ID = '__all_projects__'

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

export function formatDuration(ms: number): string {
  const seconds = (ms / 1000).toFixed(1)
  return seconds
}

export function computeGrade(reports: AnalysisReport[]): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
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

function computeProjectLanguages(stats: ProjectStatsData | null): Set<string> {
  if (!stats) return new Set<string>()
  const langs = new Set<string>()
  for (const entry of stats.fileTypeBreakdown) {
    const ext = entry.ext.startsWith('.') ? entry.ext : `.${entry.ext}`
    const mapped = EXT_TO_LANGUAGES[ext.toLowerCase()]
    if (mapped) {
      for (const lang of mapped) langs.add(lang)
    }
  }
  if (stats.fileTypeBreakdown.some((e) => e.ext === '' || e.ext === 'Dockerfile')) {
    langs.add('docker')
  }
  return langs
}

function filterRelevantTools(tools: AnalysisToolDef[], stats: ProjectStatsData | null, languages: Set<string>): AnalysisToolDef[] {
  if (!stats || languages.size === 0) return tools
  return tools.filter((tool) => {
    if (tool.languages.includes('*')) return true
    return tool.languages.some((lang) => languages.has(lang))
  })
}

/** Find which project owns a given finding by searching through all reports */
export function findProjectForFinding(
  finding: AnalysisFinding,
  reportsByProject: Map<string, AnalysisReport[]>,
  workspaceProjects: Project[],
): Project | null {
  for (const [projectId, reports] of reportsByProject) {
    for (const r of reports) {
      if (r.findings.some((f) => f.id === finding.id)) {
        return workspaceProjects.find((p) => p.id === projectId) ?? null
      }
    }
  }
  return null
}

export function useCodeAnalysis() {
  const { t } = useI18n()
  const { projects } = useWorkspaceStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { openFile } = useViewStore()

  // Multi-project state: Maps keyed by project ID
  const [toolsByProject, setToolsByProject] = useState<Map<string, AnalysisToolDef[]>>(new Map())
  const [reportsByProject, setReportsByProject] = useState<Map<string, AnalysisReport[]>>(new Map())
  const [statsByProject, setStatsByProject] = useState<Map<string, ProjectStatsData>>(new Map())

  // Sidebar selection
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeReportId, setActiveReportId] = useState<string | null>(ALL_REPORTS_ID)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  // Running / UI state
  const [runningTools, setRunningTools] = useState<Set<string>>(new Set())
  const [severityFilter, setSeverityFilter] = useState<AnalysisSeverity | 'all'>('all')
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set())
  const [groupBy] = useState<GroupBy>('file')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [ticketGroupBy, setTicketGroupBy] = useState<TicketGroupBy>('individual')
  const [ticketPriority, setTicketPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [detectingTools, setDetectingTools] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Install states
  const [installingTools, setInstallingTools] = useState<Set<string>>(new Set())
  const [installOutput, setInstallOutput] = useState<Record<string, string>>({})
  const [activeInstallTool, setActiveInstallTool] = useState<string | null>(null)
  const [copiedInstallOutput, setCopiedInstallOutput] = useState(false)

  // Finding detail
  const [selectedFinding, setSelectedFinding] = useState<AnalysisFinding | null>(null)
  const [copiedError, setCopiedError] = useState(false)

  const installBufferRef = useRef<HTMLPreElement>(null)

  // All projects in the current workspace
  const workspaceProjects = useMemo(() => {
    if (!activeWorkspaceId) return []
    return projects.filter((p) => p.workspaceId === activeWorkspaceId)
  }, [projects, activeWorkspaceId])

  // The project currently selected in the sidebar (or null for "All")
  const selectedProject = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === ALL_PROJECTS_ID) return null
    return workspaceProjects.find((p) => p.id === selectedProjectId) ?? null
  }, [workspaceProjects, selectedProjectId])

  // Compute relevant tools per project
  const relevantToolsByProject = useMemo(() => {
    const result = new Map<string, AnalysisToolDef[]>()
    for (const project of workspaceProjects) {
      const tools = toolsByProject.get(project.id) ?? []
      const stats = statsByProject.get(project.id) ?? null
      const languages = computeProjectLanguages(stats)
      result.set(project.id, filterRelevantTools(tools, stats, languages))
    }
    return result
  }, [workspaceProjects, toolsByProject, statsByProject])

  // Current view: tools for selected project or all
  const currentRelevantTools = useMemo(() => {
    if (selectedProjectId && selectedProjectId !== ALL_PROJECTS_ID) {
      return relevantToolsByProject.get(selectedProjectId) ?? []
    }
    const seen = new Set<string>()
    const result: AnalysisToolDef[] = []
    for (const tools of relevantToolsByProject.values()) {
      for (const tool of tools) {
        if (!seen.has(tool.id)) {
          seen.add(tool.id)
          result.push(tool)
        }
      }
    }
    return result
  }, [selectedProjectId, relevantToolsByProject])

  // Reports for the current view
  const currentReports = useMemo(() => {
    if (selectedProjectId && selectedProjectId !== ALL_PROJECTS_ID) {
      return reportsByProject.get(selectedProjectId) ?? []
    }
    const allReports: AnalysisReport[] = []
    for (const reports of reportsByProject.values()) {
      allReports.push(...reports)
    }
    return allReports
  }, [selectedProjectId, reportsByProject])

  // All reports flattened (for grade computation)
  const allReportsFlat = useMemo(() => {
    const result: AnalysisReport[] = []
    for (const reports of reportsByProject.values()) {
      result.push(...reports)
    }
    return result
  }, [reportsByProject])

  const aggregatedReport = useMemo(() => {
    if (currentReports.length === 0) return null
    const allFindings: AnalysisFinding[] = []
    const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const r of currentReports) {
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
      duration: currentReports.reduce((sum, r) => sum + r.duration, 0),
      timestamp: Date.now(),
    } as AnalysisReport
  }, [currentReports, t])

  const activeReport = useMemo(() => {
    if (activeReportId === ALL_REPORTS_ID) return aggregatedReport
    if (!activeReportId) return null
    return currentReports.find((r) => r.id === activeReportId) ?? null
  }, [currentReports, activeReportId, aggregatedReport])

  const projectGrade = useMemo(() => {
    if (allReportsFlat.length === 0) return null
    return computeGrade(allReportsFlat)
  }, [allReportsFlat])

  // Count findings per project (for sidebar badges)
  const findingsCountByProject = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [projectId, reports] of reportsByProject) {
      let total = 0
      for (const r of reports) total += r.summary.total
      counts.set(projectId, total)
    }
    return counts
  }, [reportsByProject])

  // Detect tools for a single project
  const detectToolsForProject = useCallback(async (project: Project) => {
    try {
      const detected = await window.kanbai.analysis.detectTools(project.path)
      setToolsByProject((prev) => new Map(prev).set(project.id, detected))
    } catch {
      setToolsByProject((prev) => new Map(prev).set(project.id, []))
    }
  }, [])

  // Load reports for a single project
  const loadReportsForProject = useCallback(async (project: Project) => {
    try {
      const loaded = await window.kanbai.analysis.loadReports(project.path)
      if (loaded.length > 0) {
        setReportsByProject((prev) => new Map(prev).set(project.id, loaded))
      }
    } catch {
      // silently fail
    }
  }, [])

  // Load stats for a single project
  const loadStatsForProject = useCallback(async (project: Project) => {
    try {
      const stats = await window.kanbai.project.stats(project.path)
      setStatsByProject((prev) => new Map(prev).set(project.id, stats))
    } catch {
      // silently fail
    }
  }, [])

  // Detect tools and load data for all workspace projects
  const detectAllTools = useCallback(async () => {
    if (workspaceProjects.length === 0) return
    setDetectingTools(true)
    try {
      await Promise.allSettled(
        workspaceProjects.map((project) => detectToolsForProject(project)),
      )
    } finally {
      setDetectingTools(false)
    }
  }, [workspaceProjects, detectToolsForProject])

  // Load all data on workspace change
  useEffect(() => {
    if (workspaceProjects.length === 0) return

    setDetectingTools(true)
    const loadAll = async () => {
      try {
        await Promise.allSettled([
          ...workspaceProjects.map((p) => detectToolsForProject(p)),
          ...workspaceProjects.map((p) => loadStatsForProject(p)),
          ...workspaceProjects.map((p) => loadReportsForProject(p)),
        ])
      } finally {
        setDetectingTools(false)
      }
    }
    loadAll()

    setActiveReportId(ALL_REPORTS_ID)
    setSelectedProjectId(null)
    setSelectedFindings(new Set())
    setInstallOutput({})
    setActiveInstallTool(null)
    setInstallingTools(new Set())
    setSelectedFinding(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load on workspace change only
  }, [activeWorkspaceId])

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
        detectAllTools()
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
  }, [detectAllTools, t])

  // Run a tool on a specific project
  const runToolForProject = useCallback(async (project: Project, toolId: string) => {
    setActiveInstallTool(null)
    setRunningTools((prev) => new Set(prev).add(`${project.id}:${toolId}`))
    try {
      const report = await window.kanbai.analysis.run({
        projectPath: project.path,
        toolId,
      })
      setReportsByProject((prev) => {
        const next = new Map(prev)
        const existing = next.get(project.id) ?? []
        const filtered = existing.filter((r) => r.toolId !== toolId)
        next.set(project.id, [...filtered, report])
        return next
      })
      setActiveReportId(report.id)
    } catch {
      // error handled by progress events
    } finally {
      setRunningTools((prev) => {
        const next = new Set(prev)
        next.delete(`${project.id}:${toolId}`)
        return next
      })
    }
  }, [])

  // Cancel a running tool
  const cancelTool = useCallback(async (toolId: string) => {
    try {
      await window.kanbai.analysis.cancel(toolId)
      setRunningTools((prev) => {
        const next = new Set(prev)
        for (const key of next) {
          if (key === toolId || key.endsWith(`:${toolId}`)) {
            next.delete(key)
          }
        }
        return next
      })
    } catch {
      // silently fail
    }
  }, [])

  // Delete a report
  const deleteReport = useCallback(async (reportId: string) => {
    for (const [projectId, reports] of reportsByProject) {
      const report = reports.find((r) => r.id === reportId)
      if (report) {
        const project = workspaceProjects.find((p) => p.id === projectId)
        if (!project) return
        try {
          await window.kanbai.analysis.deleteReport(project.path, reportId)
          setReportsByProject((prev) => {
            const next = new Map(prev)
            const existing = next.get(projectId) ?? []
            next.set(projectId, existing.filter((r) => r.id !== reportId))
            return next
          })
          if (activeReportId === reportId) {
            setActiveReportId(ALL_REPORTS_ID)
          }
        } catch {
          // silently fail
        }
        return
      }
    }
  }, [reportsByProject, workspaceProjects, activeReportId])

  // Run all installed relevant tools on ALL workspace projects
  const runAll = useCallback(async () => {
    const promises = workspaceProjects.flatMap((project) => {
      const tools = relevantToolsByProject.get(project.id) ?? []
      return tools
        .filter((tool) => tool.installed)
        .map((tool) => runToolForProject(project, tool.id))
    })
    await Promise.allSettled(promises)
    setActiveReportId(ALL_REPORTS_ID)
    setSelectedProjectId(null)
  }, [workspaceProjects, relevantToolsByProject, runToolForProject])

  // Run all tools for a specific project
  const runAllForProject = useCallback(async (project: Project) => {
    const tools = relevantToolsByProject.get(project.id) ?? []
    const installed = tools.filter((tool) => tool.installed)
    await Promise.allSettled(installed.map((tool) => runToolForProject(project, tool.id)))
    setSelectedProjectId(project.id)
    setActiveReportId(ALL_REPORTS_ID)
  }, [relevantToolsByProject, runToolForProject])

  // Re-analyze current report or all reports
  const reanalyze = useCallback(async () => {
    if (activeReportId === ALL_REPORTS_ID) {
      if (selectedProjectId && selectedProjectId !== ALL_PROJECTS_ID) {
        const project = workspaceProjects.find((p) => p.id === selectedProjectId)
        if (project) await runAllForProject(project)
      } else {
        await runAll()
      }
    } else {
      const report = currentReports.find((r) => r.id === activeReportId)
      if (report) {
        for (const [projectId, reports] of reportsByProject) {
          if (reports.some((r) => r.id === activeReportId)) {
            const project = workspaceProjects.find((p) => p.id === projectId)
            if (project) await runToolForProject(project, report.toolId)
            break
          }
        }
      }
    }
  }, [activeReportId, selectedProjectId, currentReports, reportsByProject, workspaceProjects, runAll, runAllForProject, runToolForProject])

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
        if (!selectedProjectId || selectedProjectId === ALL_PROJECTS_ID) {
          const ownerProject = findProjectForFinding(finding, reportsByProject, workspaceProjects)
          const prefix = ownerProject ? `${ownerProject.name}/` : ''
          key = prefix + finding.file
        } else {
          key = finding.file
        }
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
  }, [filteredFindings, groupBy, selectedProjectId, reportsByProject, workspaceProjects])

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

  // Toggle project collapse in sidebar
  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
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
      const ownerProject = selectedProject ?? findProjectForFinding(finding, reportsByProject, workspaceProjects)
      if (!ownerProject) return
      const fullPath = ownerProject.path + '/' + finding.file
      openFile(fullPath, finding.line)
    },
    [selectedProject, reportsByProject, workspaceProjects, openFile],
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
        const findingToReport = new Map<string, string>()
        for (const reports of reportsByProject.values()) {
          for (const r of reports) {
            for (const f of r.findings) {
              findingToReport.set(f.id, r.id)
            }
          }
        }
        const groupedByReport = new Map<string, string[]>()
        for (const fid of selectedFindings) {
          const rid = findingToReport.get(fid)
          if (rid) {
            if (!groupedByReport.has(rid)) groupedByReport.set(rid, [])
            groupedByReport.get(rid)!.push(fid)
          }
        }
        let totalTickets = 0
        for (const [reportId, findingIds] of groupedByReport) {
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
  }, [activeReport, activeReportId, activeWorkspaceId, reportsByProject, selectedFindings, ticketPriority, ticketGroupBy, t])

  // Is a tool running for a given project?
  const isToolRunningForProject = useCallback((projectId: string, toolId: string) => {
    return runningTools.has(`${projectId}:${toolId}`)
  }, [runningTools])

  const installedCount = currentRelevantTools.filter((tool) => tool.installed).length
  const isAnyRunning = runningTools.size > 0

  // Name of the currently running tool (for display in content area)
  const runningToolName = useMemo(() => {
    if (runningTools.size === 0) return null
    const firstRunningKey = runningTools.values().next().value as string
    const toolId = firstRunningKey.includes(':') ? firstRunningKey.split(':')[1]! : firstRunningKey
    const tool = currentRelevantTools.find((t) => t.id === toolId)
    return tool?.name ?? toolId
  }, [runningTools, currentRelevantTools])

  // Total findings across all projects
  const totalFindingsAllProjects = useMemo(() => {
    let total = 0
    for (const reports of reportsByProject.values()) {
      for (const r of reports) total += r.summary.total
    }
    return total
  }, [reportsByProject])

  return {
    t,
    // Projects
    workspaceProjects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    collapsedProjects,
    toggleProjectCollapse,
    // Tools
    toolsByProject,
    relevantToolsByProject,
    currentRelevantTools,
    detectAllTools,
    detectingTools,
    installedCount,
    // Reports
    reportsByProject,
    currentReports,
    allReportsFlat,
    aggregatedReport,
    activeReport,
    activeReportId,
    setActiveReportId,
    projectGrade,
    findingsCountByProject,
    totalFindingsAllProjects,
    // Running state
    runningTools,
    isAnyRunning,
    runningToolName,
    isToolRunningForProject,
    // Actions
    runAll,
    runAllForProject,
    runToolForProject,
    cancelTool,
    deleteReport,
    reanalyze,
    // Install
    installingTools,
    installOutput,
    activeInstallTool,
    setActiveInstallTool,
    copiedInstallOutput,
    installTool,
    copyInstallOutput,
    installBufferRef,
    // Findings
    filteredFindings,
    grouped,
    severityFilter,
    setSeverityFilter,
    selectedFindings,
    toggleFinding,
    selectAll,
    deselectAll,
    collapsedGroups,
    toggleGroup,
    selectedFinding,
    setSelectedFinding,
    handleClickFinding,
    handleNavigateToFile,
    copiedError,
    copyError,
    // Tickets
    showTicketModal,
    setShowTicketModal,
    ticketGroupBy,
    setTicketGroupBy,
    ticketPriority,
    setTicketPriority,
    ticketPreviewCount,
    handleCreateTickets,
    // Toast
    toastMessage,
    // Constants
    ALL_REPORTS_ID,
    ALL_PROJECTS_ID,
  } as const
}
