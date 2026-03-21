import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { AnalysisReport } from '../../../shared/types'
import { StorageService } from '../storage'

// ---------------------------------------------------------------------------
// In-memory report store (for ticket creation lookups)
// ---------------------------------------------------------------------------

const reportStore = new Map<string, AnalysisReport>()

export function storeReport(report: AnalysisReport): void {
  reportStore.set(report.id, report)
  // Keep at most 50 reports in memory
  if (reportStore.size > 50) {
    const oldest = reportStore.keys().next().value
    if (oldest) reportStore.delete(oldest)
  }
}

export function getStoredReport(reportId: string): AnalysisReport | undefined {
  return reportStore.get(reportId)
}

export function deleteStoredReport(reportId: string): void {
  reportStore.delete(reportId)
}

// ---------------------------------------------------------------------------
// Report directory computation
// ---------------------------------------------------------------------------

function getReportDir(projectPath: string): string {
  const hash = crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 12)
  return path.join(os.homedir(), '.kanbai', 'analysis', hash)
}

// ---------------------------------------------------------------------------
// Report persistence
// ---------------------------------------------------------------------------

export function persistReport(report: AnalysisReport): void {
  const dir = getReportDir(report.projectPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const filePath = path.join(dir, `report-${report.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')
}

export function loadPersistedReports(projectPath: string): AnalysisReport[] {
  const dir = getReportDir(projectPath)
  if (!fs.existsSync(dir)) return []
  const reports: AnalysisReport[] = []
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('report-') && f.endsWith('.json'))
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      reports.push(JSON.parse(content))
    } catch {
      // skip corrupted files
    }
  }
  return reports.sort((a, b) => b.timestamp - a.timestamp)
}

export function deletePersistedReport(projectPath: string, reportId: string): boolean {
  const dir = getReportDir(projectPath)
  const filePath = path.join(dir, `report-${reportId}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Gitignore auto-update for analysis report directories
// ---------------------------------------------------------------------------

/** Known report directories that analysis tools may generate inside a project */
export const TOOL_REPORT_PATTERNS: Record<string, string[]> = {
  megalinter: ['megalinter-reports/'],
  semgrep: ['.semgrep/'],
  bearer: ['.bearer/'],
  trivy: ['.trivycache/'],
  checkov: ['.checkov/'],
}

const GITIGNORE_SECTION_HEADER = '# Analysis tool reports (auto-managed by Kanbai)'
const GITIGNORE_SECTION_FOOTER = '# End analysis tool reports'

export function ensureGitignoreExcludesReports(projectPath: string, toolId?: string): void {
  const patterns = toolId
    ? (TOOL_REPORT_PATTERNS[toolId] ?? [])
    : Object.values(TOOL_REPORT_PATTERNS).flat()
  if (patterns.length === 0) return

  const gitignorePath = path.join(projectPath, '.gitignore')
  const content = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf-8')
    : ''
  const missingPatterns = patterns.filter((p) => !content.includes(p))
  if (missingPatterns.length === 0) return

  const hasSection = content.includes(GITIGNORE_SECTION_HEADER)

  if (hasSection) {
    const updatedContent = content.replace(
      GITIGNORE_SECTION_FOOTER,
      missingPatterns.join('\n') + '\n' + GITIGNORE_SECTION_FOOTER,
    )
    fs.writeFileSync(gitignorePath, updatedContent, 'utf-8')
  } else {
    const section = [
      '',
      GITIGNORE_SECTION_HEADER,
      ...missingPatterns,
      GITIGNORE_SECTION_FOOTER,
      '',
    ].join('\n')
    fs.writeFileSync(gitignorePath, content.trimEnd() + '\n' + section, 'utf-8')
  }
}

/**
 * Update .gitignore for ALL projects in the same workspace as the given project.
 * Adds ALL known report patterns (not just the current tool's) to every project.
 * Falls back to single-project update if the project cannot be resolved to a workspace.
 */
export function ensureGitignoreExcludesReportsForWorkspace(projectPath: string, toolId: string): void {
  const storage = new StorageService()
  const allProjects = storage.getProjects()
  const project = allProjects.find((p) => p.path === projectPath)

  if (!project) {
    ensureGitignoreExcludesReports(projectPath, toolId)
    return
  }

  // Add ALL known report patterns to ALL projects in the workspace
  const workspaceProjects = allProjects.filter((p) => p.workspaceId === project.workspaceId)
  for (const wp of workspaceProjects) {
    ensureGitignoreExcludesReports(wp.path)
  }
}
