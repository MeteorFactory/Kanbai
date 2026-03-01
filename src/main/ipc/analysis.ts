import { IpcMain, BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  IPC_CHANNELS,
  AnalysisToolDef,
  AnalysisToolCategory,
  AnalysisFinding,
  AnalysisReport,
  AnalysisRunOptions,
  AnalysisTicketRequest,
  AnalysisProgress,
  AnalysisSeverity,
  KanbanTask,
} from '../../shared/types'
import { getWhichCommand, getAnalysisToolPaths, getInstallCommands, getInstallShell, killChildProcess, PATH_SEP, crossExecFile, crossSpawn } from '../../shared/platform'
import {
  readKanbanTasks as readKanbanTasksShared,
  writeKanbanTasks as writeKanbanTasksShared,
} from '../../mcp-server/lib/kanban-store'

// ---------------------------------------------------------------------------
// Tool-specific JSON output types (used by parsers)
// ---------------------------------------------------------------------------

interface SemgrepResult {
  path?: string
  start?: { line?: number; col?: number }
  end?: { line?: number; col?: number }
  check_id?: string
  extra?: {
    severity?: string
    message?: string
    lines?: string
    metadata?: {
      source?: string
      cwe?: string | string[]
    }
  }
}

interface BanditResult {
  filename?: string
  line_number?: number
  col_offset?: number
  issue_severity?: string
  issue_text?: string
  test_id?: string
  issue_cwe?: { id?: number }
}

interface BearerWarning {
  filename?: string
  file?: string
  line_number?: number
  line?: number
  severity?: string
  description?: string
  title?: string
  rule_id?: string
  id?: string
  documentation_url?: string
  cwe_ids?: number[]
}

interface TrivyVulnerability {
  Severity?: string
  VulnerabilityID?: string
  Title?: string
  Description?: string
  PkgName?: string
  InstalledVersion?: string
  PrimaryURL?: string
  CweIDs?: string[]
}

interface TrivyResultEntry {
  Target?: string
  Vulnerabilities?: TrivyVulnerability[]
}

interface OsvVulnerability {
  id?: string
  summary?: string
  database_specific?: { severity?: string }
  references?: { url?: string }[]
}

interface OsvPackage {
  package?: { name?: string; version?: string }
  vulnerabilities?: OsvVulnerability[]
}

interface OsvResultEntry {
  source?: { path?: string }
  packages?: OsvPackage[]
}

interface EslintMessage {
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  severity?: number
  message?: string
  ruleId?: string
}

interface EslintFileResult {
  filePath?: string
  messages?: EslintMessage[]
}

interface CheckovCheck {
  file_path?: string
  file_line_range?: number[]
  severity?: string
  check_id?: string
  name?: string
  check_result?: { result?: string }
  guideline?: string
}

interface PylintResult {
  path?: string
  module?: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  type?: string
  message?: string
  symbol?: string
  'message-id'?: string
}

interface MegaLinterError {
  line?: number
  column?: number
  message?: string
}

interface MegaLinterFileResult {
  file?: string
  errors?: MegaLinterError[]
}

interface MegaLinterLinter {
  linter_name?: string
  files_lint_results?: MegaLinterFileResult[]
}

// ---------------------------------------------------------------------------
// Tool catalog
// ---------------------------------------------------------------------------

interface ToolCatalogEntry {
  id: string
  name: string
  command: string
  category: AnalysisToolCategory
  description: string
  languages: string[]
  jsonFlag: string
  buildArgs: (projectPath: string, extraArgs?: string[]) => string[]
  parse: (stdout: string, projectPath: string) => AnalysisFinding[]
}

function mapSemgrepSeverity(sev: string): AnalysisSeverity {
  const lower = sev.toLowerCase()
  if (lower === 'error') return 'high'
  if (lower === 'warning') return 'medium'
  if (lower === 'info') return 'info'
  return 'medium'
}

function mapBanditSeverity(sev: string): AnalysisSeverity {
  const lower = sev.toLowerCase()
  if (lower === 'high') return 'high'
  if (lower === 'medium') return 'medium'
  if (lower === 'low') return 'low'
  return 'medium'
}

function mapTrivySeverity(sev: string): AnalysisSeverity {
  const lower = sev.toLowerCase()
  if (lower === 'critical') return 'critical'
  if (lower === 'high') return 'high'
  if (lower === 'medium') return 'medium'
  if (lower === 'low') return 'low'
  return 'info'
}

function mapEslintSeverity(sev: number): AnalysisSeverity {
  if (sev === 2) return 'high'
  if (sev === 1) return 'medium'
  return 'info'
}

function mapCheckovSeverity(sev: string): AnalysisSeverity {
  const lower = (sev || '').toLowerCase()
  if (lower === 'critical') return 'critical'
  if (lower === 'high') return 'high'
  if (lower === 'medium') return 'medium'
  if (lower === 'low') return 'low'
  return 'medium'
}

function mapPylintSeverity(type: string): AnalysisSeverity {
  const lower = (type || '').toLowerCase()
  if (lower === 'error' || lower === 'fatal') return 'high'
  if (lower === 'warning') return 'medium'
  if (lower === 'convention' || lower === 'refactor') return 'low'
  return 'info'
}

/** Build an enriched env with common tool paths (Homebrew, pip, Chocolatey, etc.) */
function enrichedEnv(): NodeJS.ProcessEnv {
  const home = os.homedir()
  const extraPaths = getAnalysisToolPaths()
  return {
    ...process.env,
    HOME: home,
    PATH: `${process.env.PATH || ''}${PATH_SEP}${extraPaths.join(PATH_SEP)}`,
  }
}

function relativize(filePath: string, projectPath: string): string {
  if (filePath.startsWith(projectPath)) {
    return filePath.slice(projectPath.length).replace(/^\//, '')
  }
  return filePath
}

const TOOL_CATALOG: ToolCatalogEntry[] = [
  // 1. Semgrep
  {
    id: 'semgrep',
    name: 'Semgrep',
    command: 'semgrep',
    category: 'security',
    description: 'Static analysis for security vulnerabilities (multi-language)',
    languages: ['python', 'javascript', 'typescript', 'go', 'java', 'ruby', 'c', 'cpp'],
    jsonFlag: '--json',
    buildArgs: (projectPath, extraArgs) => [
      'scan', '--json', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const results = (data.results || []) as SemgrepResult[]
      return results.map((r) => ({
        id: uuid(),
        tool: 'semgrep',
        file: relativize(r.path || '', projectPath),
        line: r.start?.line ?? 0,
        column: r.start?.col,
        endLine: r.end?.line,
        endColumn: r.end?.col,
        severity: mapSemgrepSeverity(r.extra?.severity || ''),
        message: r.extra?.message || r.check_id || '',
        rule: r.check_id,
        ruleUrl: r.extra?.metadata?.source,
        snippet: r.extra?.lines,
        cwe: Array.isArray(r.extra?.metadata?.cwe)
          ? r.extra.metadata.cwe[0]
          : r.extra?.metadata?.cwe,
      }))
    },
  },

  // 2. Bandit
  {
    id: 'bandit',
    name: 'Bandit',
    command: 'bandit',
    category: 'security',
    description: 'Security linter for Python code',
    languages: ['python'],
    jsonFlag: '-f json',
    buildArgs: (projectPath, extraArgs) => [
      '-r', projectPath, '-f', 'json', ...(extraArgs || []),
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const results = (data.results || []) as BanditResult[]
      return results.map((r) => ({
        id: uuid(),
        tool: 'bandit',
        file: relativize(r.filename || '', projectPath),
        line: r.line_number ?? 0,
        column: r.col_offset,
        severity: mapBanditSeverity(r.issue_severity || ''),
        message: r.issue_text || '',
        rule: r.test_id,
        cwe: r.issue_cwe?.id ? `CWE-${r.issue_cwe.id}` : undefined,
      }))
    },
  },

  // 3. Bearer
  {
    id: 'bearer',
    name: 'Bearer',
    command: 'bearer',
    category: 'security',
    description: 'Security and privacy analysis (multi-language)',
    languages: ['javascript', 'typescript', 'ruby', 'java', 'python', 'go', 'php'],
    jsonFlag: '--format json',
    buildArgs: (projectPath, extraArgs) => [
      'scan', projectPath, '--format', 'json', ...(extraArgs || []),
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const findings: AnalysisFinding[] = []
      // Bearer may use different output shapes; handle common ones
      const warnings: unknown[] = data.warnings || data.findings || []
      for (const w of warnings as BearerWarning[]) {
        findings.push({
          id: uuid(),
          tool: 'bearer',
          file: relativize(w.filename || w.file || '', projectPath),
          line: w.line_number ?? w.line ?? 0,
          severity: mapSemgrepSeverity(w.severity || 'warning'),
          message: w.description || w.title || '',
          rule: w.rule_id || w.id,
          ruleUrl: w.documentation_url,
          cwe: w.cwe_ids?.[0] ? `CWE-${w.cwe_ids[0]}` : undefined,
        })
      }
      return findings
    },
  },

  // 4. Trivy
  {
    id: 'trivy',
    name: 'Trivy',
    command: 'trivy',
    category: 'dependencies',
    description: 'Vulnerability scanner for dependencies and containers',
    languages: ['*'],
    jsonFlag: '-f json',
    buildArgs: (projectPath, extraArgs) => [
      'fs', '--scanners', 'vuln', '-f', 'json', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const findings: AnalysisFinding[] = []
      const results: unknown[] = data.Results || []
      for (const res of results as TrivyResultEntry[]) {
        const target = res.Target || ''
        const vulns: unknown[] = res.Vulnerabilities || []
        for (const v of vulns as TrivyVulnerability[]) {
          findings.push({
            id: uuid(),
            tool: 'trivy',
            file: relativize(target, projectPath),
            line: 0,
            severity: mapTrivySeverity(v.Severity || ''),
            message: `${v.VulnerabilityID}: ${v.Title || v.Description || ''} (${v.PkgName}@${v.InstalledVersion})`,
            rule: v.VulnerabilityID,
            ruleUrl: v.PrimaryURL,
            cwe: v.CweIDs?.[0],
          })
        }
      }
      return findings
    },
  },

  // 5. OSV-Scanner
  {
    id: 'osv-scanner',
    name: 'OSV-Scanner',
    command: 'osv-scanner',
    category: 'dependencies',
    description: 'Open Source Vulnerability scanner (Google)',
    languages: ['*'],
    jsonFlag: '--format json',
    buildArgs: (projectPath, extraArgs) => [
      'scan', '--format', 'json', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const findings: AnalysisFinding[] = []
      const results: unknown[] = data.results || []
      for (const res of results as OsvResultEntry[]) {
        const source = res.source?.path || ''
        const packages: unknown[] = res.packages || []
        for (const pkg of packages as OsvPackage[]) {
          const vulns: unknown[] = pkg.vulnerabilities || []
          for (const v of vulns as OsvVulnerability[]) {
            findings.push({
              id: uuid(),
              tool: 'osv-scanner',
              file: relativize(source, projectPath),
              line: 0,
              severity: mapTrivySeverity(v.database_specific?.severity || 'MEDIUM'),
              message: `${v.id}: ${v.summary || ''} (${pkg.package?.name}@${pkg.package?.version})`,
              rule: v.id,
              ruleUrl: v.references?.[0]?.url,
            })
          }
        }
      }
      return findings
    },
  },

  // 6. ESLint
  {
    id: 'eslint',
    name: 'ESLint',
    command: 'eslint',
    category: 'quality',
    description: 'Linter for JavaScript and TypeScript',
    languages: ['javascript', 'typescript'],
    jsonFlag: '-f json',
    buildArgs: (projectPath, extraArgs) => [
      '-f', 'json', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const findings: AnalysisFinding[] = []
      for (const file of data as EslintFileResult[]) {
        const filePath = relativize(file.filePath || '', projectPath)
        for (const msg of (file.messages || []) as EslintMessage[]) {
          findings.push({
            id: uuid(),
            tool: 'eslint',
            file: filePath,
            line: msg.line ?? 0,
            column: msg.column,
            endLine: msg.endLine,
            endColumn: msg.endColumn,
            severity: mapEslintSeverity(msg.severity ?? 1),
            message: msg.message || '',
            rule: msg.ruleId,
            ruleUrl: msg.ruleId
              ? `https://eslint.org/docs/latest/rules/${msg.ruleId}`
              : undefined,
          })
        }
      }
      return findings
    },
  },

  // 7. Graudit
  {
    id: 'graudit',
    name: 'Graudit',
    command: 'graudit',
    category: 'security',
    description: 'Grep-based source code auditing tool',
    languages: ['*'],
    jsonFlag: '',
    buildArgs: (projectPath, extraArgs) => [
      '-d', 'all', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      // Graudit outputs grep-style: file:line:content
      const findings: AnalysisFinding[] = []
      const lines = stdout.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(.*)$/)
        if (match) {
          findings.push({
            id: uuid(),
            tool: 'graudit',
            file: relativize(match[1]!, projectPath),
            line: parseInt(match[2]!, 10),
            severity: 'medium',
            message: match[3]!.trim(),
          })
        }
      }
      return findings
    },
  },

  // 8. Checkov
  {
    id: 'checkov',
    name: 'Checkov',
    command: 'checkov',
    category: 'infrastructure',
    description: 'Infrastructure-as-Code security scanner',
    languages: ['terraform', 'cloudformation', 'kubernetes', 'docker'],
    jsonFlag: '--output json',
    buildArgs: (projectPath, extraArgs) => [
      '-d', projectPath, '--output', 'json', ...(extraArgs || []),
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      const findings: AnalysisFinding[] = []
      // Checkov may return an array or single object
      const checks = Array.isArray(data) ? data : [data]
      for (const group of checks) {
        const failed: unknown[] = group.results?.failed_checks || []
        for (const check of failed as CheckovCheck[]) {
          findings.push({
            id: uuid(),
            tool: 'checkov',
            file: relativize(check.file_path || '', projectPath),
            line: check.file_line_range?.[0] ?? 0,
            endLine: check.file_line_range?.[1],
            severity: mapCheckovSeverity(check.severity || ''),
            message: `${check.check_id}: ${check.name || check.check_result?.result || ''}`,
            rule: check.check_id,
            ruleUrl: check.guideline,
          })
        }
      }
      return findings
    },
  },

  // 9. Pylint
  {
    id: 'pylint',
    name: 'Pylint',
    command: 'pylint',
    category: 'quality',
    description: 'Python code quality checker',
    languages: ['python'],
    jsonFlag: '--output-format=json',
    buildArgs: (projectPath, extraArgs) => [
      '--output-format=json', '--recursive=y', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      const data = JSON.parse(stdout)
      return (data as PylintResult[]).map((r: PylintResult) => ({
        id: uuid(),
        tool: 'pylint',
        file: relativize(r.path || r.module || '', projectPath),
        line: r.line ?? 0,
        column: r.column,
        endLine: r.endLine,
        endColumn: r.endColumn,
        severity: mapPylintSeverity(r.type || ''),
        message: r.message || '',
        rule: r.symbol || r['message-id'],
      }))
    },
  },

  // 10. Cppcheck
  {
    id: 'cppcheck',
    name: 'Cppcheck',
    command: 'cppcheck',
    category: 'quality',
    description: 'Static analysis for C/C++',
    languages: ['c', 'cpp'],
    jsonFlag: '--template=json',
    buildArgs: (projectPath, extraArgs) => [
      '--xml', '--enable=all', ...(extraArgs || []), projectPath,
    ],
    parse: (stdout, projectPath) => {
      // Cppcheck with --xml outputs to stderr typically, but we capture both.
      // Parse XML-like output line by line for <error> elements.
      const findings: AnalysisFinding[] = []
      // Simple regex-based XML parsing for cppcheck output
      const errorRegex = /<error\s+id="([^"]*)"[^>]*severity="([^"]*)"[^>]*msg="([^"]*)"[^>]*>/g
      const locationRegex = /<location\s+file="([^"]*)"[^>]*line="(\d+)"[^>]*(?:column="(\d+)")?/g

      let errorMatch: RegExpExecArray | null
      const errors: { id: string; severity: string; msg: string; locations: { file: string; line: number; column?: number }[] }[] = []

      while ((errorMatch = errorRegex.exec(stdout)) !== null) {
        errors.push({
          id: errorMatch[1]!,
          severity: errorMatch[2]!,
          msg: errorMatch[3]!,
          locations: [],
        })
      }

      let locMatch: RegExpExecArray | null
      let currentErrorIdx = 0
      while ((locMatch = locationRegex.exec(stdout)) !== null) {
        // Associate locations with nearest preceding error
        if (errors[currentErrorIdx]) {
          errors[currentErrorIdx]!.locations.push({
            file: locMatch[1]!,
            line: parseInt(locMatch[2]!, 10),
            column: locMatch[3] ? parseInt(locMatch[3], 10) : undefined,
          })
        }
      }

      // Also try a second pass correlating by position
      const xmlLines = stdout.split('\n')
      let curErr: typeof errors[0] | null = null
      for (const line of xmlLines) {
        const eMatch = line.match(/<error\s+id="([^"]*)"[^>]*severity="([^"]*)"[^>]*msg="([^"]*)"/)
        if (eMatch) {
          curErr = { id: eMatch[1]!, severity: eMatch[2]!, msg: eMatch[3]!, locations: [] }
        }
        const lMatch = line.match(/<location\s+file="([^"]*)"[^>]*line="(\d+)"(?:[^>]*column="(\d+)")?/)
        if (lMatch && curErr) {
          curErr.locations.push({
            file: lMatch[1]!,
            line: parseInt(lMatch[2]!, 10),
            column: lMatch[3] ? parseInt(lMatch[3], 10) : undefined,
          })
        }
        if (line.includes('</error>') && curErr) {
          for (const loc of curErr.locations) {
            const sev = curErr.severity.toLowerCase()
            findings.push({
              id: uuid(),
              tool: 'cppcheck',
              file: relativize(loc.file, projectPath),
              line: loc.line,
              column: loc.column,
              severity: sev === 'error' ? 'high' : sev === 'warning' ? 'medium' : sev === 'style' ? 'low' : 'info',
              message: curErr.msg,
              rule: curErr.id,
            })
          }
          curErr = null
        }
      }

      return findings
    },
  },

  // 11. MegaLinter
  {
    id: 'megalinter',
    name: 'MegaLinter',
    command: 'mega-linter-runner',
    category: 'quality',
    description: 'Aggregated linter runner for 50+ languages',
    languages: ['*'],
    jsonFlag: '',
    buildArgs: (projectPath, extraArgs) => [
      '--path', projectPath, '--json', ...(extraArgs || []),
    ],
    parse: (stdout, projectPath) => {
      const findings: AnalysisFinding[] = []
      try {
        const data = JSON.parse(stdout)
        const linters: unknown[] = data.linters || []
        for (const linter of linters as MegaLinterLinter[]) {
          const files: unknown[] = linter.files_lint_results || []
          for (const file of files as MegaLinterFileResult[]) {
            const errors: unknown[] = file.errors || []
            for (const err of errors as MegaLinterError[]) {
              findings.push({
                id: uuid(),
                tool: 'megalinter',
                file: relativize(file.file || '', projectPath),
                line: err.line ?? 0,
                column: err.column,
                severity: 'medium',
                message: err.message || `[${linter.linter_name}] issue`,
                rule: linter.linter_name,
              })
            }
          }
        }
      } catch {
        // MegaLinter output may not be JSON; parse text lines
        const lines = stdout.split('\n').filter((l) => l.includes('ERROR') || l.includes('WARNING'))
        for (const line of lines) {
          findings.push({
            id: uuid(),
            tool: 'megalinter',
            file: '',
            line: 0,
            severity: line.includes('ERROR') ? 'high' : 'medium',
            message: line.trim(),
          })
        }
      }
      return findings
    },
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToolDef(entry: ToolCatalogEntry, installed: boolean): AnalysisToolDef {
  return {
    id: entry.id,
    name: entry.name,
    command: entry.command,
    category: entry.category,
    description: entry.description,
    languages: entry.languages,
    installed,
    jsonFlag: entry.jsonFlag,
  }
}

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const { stdout } = await crossExecFile(getWhichCommand(), [command], { env: enrichedEnv() })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function isGrauditAvailable(): Promise<boolean> {
  // Check via which (enriched PATH includes ~/.graudit)
  const viaPath = await isCommandAvailable('graudit')
  if (viaPath) return true
  // Also check the clone location directly
  const clonedPath = path.join(os.homedir(), '.graudit', 'graudit')
  try {
    await fs.promises.access(clonedPath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function isEslintAvailable(projectPath: string): Promise<boolean> {
  // Check global first
  const globalAvailable = await isCommandAvailable('eslint')
  if (globalAvailable) return true

  // Check in project node_modules
  const localEslint = path.join(projectPath, 'node_modules', '.bin', 'eslint')
  try {
    await fs.promises.access(localEslint, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveCommand(toolId: string, projectPath: string): string {
  if (toolId === 'eslint') {
    const localEslint = path.join(projectPath, 'node_modules', '.bin', 'eslint')
    if (fs.existsSync(localEslint)) return localEslint
  }
  if (toolId === 'graudit') {
    const grauditPath = path.join(os.homedir(), '.graudit', 'graudit')
    if (fs.existsSync(grauditPath)) return grauditPath
  }
  return TOOL_CATALOG.find((t) => t.id === toolId)?.command ?? toolId
}

function sendProgress(
  getMainWindow: (() => BrowserWindow | null) | undefined,
  progress: AnalysisProgress,
): void {
  if (!getMainWindow) return
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.ANALYSIS_PROGRESS, progress)
  }
}

function computeSummary(findings: AnalysisFinding[]): AnalysisReport['summary'] {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }
  for (const f of findings) {
    summary[f.severity]++
    summary.total++
  }
  return summary
}

// Per-tool timeout (ms) — Docker-based tools get a shorter default to avoid runaway processes
const TOOL_TIMEOUT: Record<string, number> = {
  megalinter: 10 * 60 * 1000, // 10 min (Docker-based, inherently slow)
}
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

async function runTool(
  toolEntry: ToolCatalogEntry,
  options: AnalysisRunOptions,
  getMainWindow?: () => BrowserWindow | null,
): Promise<AnalysisReport> {
  const startTime = Date.now()
  const reportId = uuid()
  const { projectPath, extraArgs } = options
  const resolvedCommand = resolveCommand(toolEntry.id, projectPath)
  const args = toolEntry.buildArgs(projectPath, extraArgs)

  sendProgress(getMainWindow, {
    toolId: toolEntry.id,
    status: 'running',
    message: `Running ${toolEntry.name}...`,
  })

  return new Promise((resolve) => {
    const timeoutMs = TOOL_TIMEOUT[toolEntry.id] ?? DEFAULT_TIMEOUT_MS

    // Use spawn to capture both stdout and stderr
    const child = crossSpawn(resolvedCommand, args, {
      cwd: projectPath,
      env: enrichedEnv(),
    })

    // Manual timeout: SIGTERM first, SIGKILL 5s later as fallback
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killChildProcess(child, 'SIGTERM')
      // Force kill fallback for Docker/stubborn processes
      setTimeout(() => {
        killChildProcess(child, 'SIGKILL')
      }, 5000)
    }, timeoutMs)

    // Track process for cancellation
    runningProcesses.set(toolEntry.id, child)

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      runningProcesses.delete(toolEntry.id)
      const duration = Date.now() - startTime
      sendProgress(getMainWindow, {
        toolId: toolEntry.id,
        status: 'error',
        message: `${toolEntry.name} failed: ${err.message}`,
      })
      resolve({
        id: reportId,
        projectPath,
        toolId: toolEntry.id,
        toolName: toolEntry.name,
        timestamp: startTime,
        duration,
        findings: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        error: err.message,
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      runningProcesses.delete(toolEntry.id)
      const duration = Date.now() - startTime

      if (timedOut) {
        const timeoutSec = Math.round(timeoutMs / 1000)
        const error = `${toolEntry.name} timed out after ${timeoutSec}s and was killed.`
        sendProgress(getMainWindow, {
          toolId: toolEntry.id,
          status: 'error',
          message: error,
        })
        resolve({
          id: reportId,
          projectPath,
          toolId: toolEntry.id,
          toolName: toolEntry.name,
          timestamp: startTime,
          duration,
          findings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          error,
        })
        return
      }

      // Many analysis tools use non-zero exit codes to indicate findings found (not errors).
      // For example, eslint exits 1 when it finds issues, semgrep exits 1 for findings.
      // Only treat as error when there is no parseable output.
      const output = stdout || stderr

      let findings: AnalysisFinding[] = []
      let error: string | undefined

      try {
        findings = toolEntry.parse(output, projectPath)
      } catch (parseErr) {
        // If parsing fails AND exit code is non-zero, report error
        if (code !== 0) {
          error = `${toolEntry.name} exited with code ${code}. ${stderr.slice(0, 500)}`
        } else {
          error = `Failed to parse ${toolEntry.name} output: ${String(parseErr)}`
        }
      }

      sendProgress(getMainWindow, {
        toolId: toolEntry.id,
        status: error ? 'error' : 'done',
        message: error || `${toolEntry.name} found ${findings.length} issue(s)`,
      })

      resolve({
        id: reportId,
        projectPath,
        toolId: toolEntry.id,
        toolName: toolEntry.name,
        timestamp: startTime,
        duration,
        findings,
        summary: computeSummary(findings),
        error,
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Kanban integration (delegated to shared kanban-store)
// ---------------------------------------------------------------------------

const readKanbanTasks = readKanbanTasksShared
const writeKanbanTasks = writeKanbanTasksShared

// Install commands per tool
const INSTALL_COMMANDS: Record<string, string> = getInstallCommands()

// Track running child processes for cancellation
const runningProcesses = new Map<string, ChildProcess>()

// Track installing processes
const installingProcesses = new Map<string, ChildProcess>()

// In-memory report store so ticket creation can look up findings
const reportStore = new Map<string, AnalysisReport>()

function storeReport(report: AnalysisReport): void {
  reportStore.set(report.id, report)
  // Keep at most 50 reports in memory
  if (reportStore.size > 50) {
    const oldest = reportStore.keys().next().value
    if (oldest) reportStore.delete(oldest)
  }
}

// ---------------------------------------------------------------------------
// Report persistence
// ---------------------------------------------------------------------------

function getReportDir(projectPath: string): string {
  const hash = crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 12)
  return path.join(os.homedir(), '.mirehub', 'analysis', hash)
}

function persistReport(report: AnalysisReport): void {
  const dir = getReportDir(report.projectPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const filePath = path.join(dir, `report-${report.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')
}

function loadPersistedReports(projectPath: string): AnalysisReport[] {
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

function deletePersistedReport(projectPath: string, reportId: string): boolean {
  const dir = getReportDir(projectPath)
  const filePath = path.join(dir, `report-${reportId}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Ticket creation helpers
// ---------------------------------------------------------------------------

function groupFindings(
  findings: AnalysisFinding[],
  groupBy: AnalysisTicketRequest['groupBy'],
): Map<string, AnalysisFinding[]> {
  const groups = new Map<string, AnalysisFinding[]>()

  for (const f of findings) {
    let key: string
    switch (groupBy) {
      case 'file':
        key = f.file
        break
      case 'rule':
        key = f.rule || 'no-rule'
        break
      case 'severity':
        key = f.severity
        break
      case 'individual':
      default:
        key = f.id
        break
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }

  return groups
}

function buildTicketTitle(
  groupKey: string,
  groupBy: AnalysisTicketRequest['groupBy'],
  findings: AnalysisFinding[],
  toolName: string,
): string {
  const count = findings.length
  switch (groupBy) {
    case 'file':
      return `[${toolName}] ${count} issue(s) in ${groupKey}`
    case 'rule':
      return `[${toolName}] Rule ${groupKey} (${count} occurrence(s))`
    case 'severity':
      return `[${toolName}] ${count} ${groupKey.toUpperCase()} issue(s)`
    case 'individual':
    default: {
      const f = findings[0]!
      return `[${toolName}] ${f.severity.toUpperCase()}: ${f.message.slice(0, 80)}`
    }
  }
}

function buildTicketDescription(findings: AnalysisFinding[]): string {
  const lines: string[] = []
  for (const f of findings) {
    lines.push(`### ${f.file}:${f.line}`)
    lines.push(`- **Severity**: ${f.severity}`)
    if (f.rule) lines.push(`- **Rule**: ${f.rule}`)
    if (f.cwe) lines.push(`- **CWE**: ${f.cwe}`)
    lines.push(`- **Message**: ${f.message}`)
    if (f.snippet) lines.push(`\`\`\`\n${f.snippet}\n\`\`\``)
    if (f.ruleUrl) lines.push(`- [Documentation](${f.ruleUrl})`)
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Register IPC handlers
// ---------------------------------------------------------------------------

export function registerAnalysisHandlers(
  ipcMain: IpcMain,
  getMainWindow?: () => BrowserWindow | null,
): void {
  // Detect installed tools
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_DETECT_TOOLS,
    async (_event, args?: { projectPath?: string }) => {
      const projectPath = args?.projectPath || ''
      const results: AnalysisToolDef[] = []

      for (const entry of TOOL_CATALOG) {
        let installed = false
        if (entry.id === 'eslint') {
          installed = await isEslintAvailable(projectPath)
        } else if (entry.id === 'graudit') {
          installed = await isGrauditAvailable()
        } else {
          installed = await isCommandAvailable(entry.command)
        }
        results.push(getToolDef(entry, installed))
      }

      return results
    },
  )

  // Run analysis
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_RUN,
    async (_event, options: AnalysisRunOptions) => {
      const entry = TOOL_CATALOG.find((t) => t.id === options.toolId)
      if (!entry) {
        return {
          id: uuid(),
          projectPath: options.projectPath,
          toolId: options.toolId,
          toolName: options.toolId,
          timestamp: Date.now(),
          duration: 0,
          findings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          error: `Unknown tool: ${options.toolId}`,
        } satisfies AnalysisReport
      }

      const report = await runTool(entry, options, getMainWindow)
      storeReport(report)
      persistReport(report)
      return report
    },
  )

  // Cancel running analysis
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_CANCEL,
    async (_event, args: { toolId: string }) => {
      const child = runningProcesses.get(args.toolId)
      if (child) {
        killChildProcess(child, 'SIGTERM')
        // Force kill fallback for stubborn/Docker processes
        setTimeout(() => {
          killChildProcess(child, 'SIGKILL')
        }, 3000)
        runningProcesses.delete(args.toolId)
        return { success: true }
      }
      return { success: false, error: 'No running process for this tool' }
    },
  )

  // Load persisted reports
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_LOAD_REPORTS,
    async (_event, args: { projectPath: string }) => {
      const reports = loadPersistedReports(args.projectPath)
      // Re-populate in-memory store for ticket creation
      for (const report of reports) {
        storeReport(report)
      }
      return reports
    },
  )

  // Delete a persisted report
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_DELETE_REPORT,
    async (_event, args: { projectPath: string; reportId: string }) => {
      const deleted = deletePersistedReport(args.projectPath, args.reportId)
      if (deleted) {
        reportStore.delete(args.reportId)
      }
      return { success: deleted, error: deleted ? undefined : 'Report not found' }
    },
  )

  // Create kanban tickets from findings
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_CREATE_TICKETS,
    async (_event, request: AnalysisTicketRequest) => {
      const { findingIds, reportId, workspaceId, targetProjectId, groupBy } = request

      const report = reportStore.get(reportId)
      if (!report) {
        return { success: false, ticketCount: 0, error: 'Report not found. Run the analysis again.' }
      }

      // Filter findings by requested IDs
      const selectedFindings = report.findings.filter((f) => findingIds.includes(f.id))
      if (selectedFindings.length === 0) {
        return { success: false, ticketCount: 0, error: 'No matching findings found.' }
      }

      const groups = groupFindings(selectedFindings, groupBy)
      const tasks = readKanbanTasks(workspaceId)
      const maxTicketNumber = tasks.reduce((max, t) => Math.max(max, t.ticketNumber ?? 0), 0)

      let ticketIdx = 0
      groups.forEach((findings, key) => {
        ticketIdx++
        const task: KanbanTask = {
          id: uuid(),
          workspaceId,
          targetProjectId,
          ticketNumber: maxTicketNumber + ticketIdx,
          title: buildTicketTitle(key, groupBy, findings, report.toolName),
          description: buildTicketDescription(findings),
          status: 'TODO',
          priority: 'high',
          labels: ['refactor', 'bug', report.toolName.toLowerCase()],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        tasks.push(task)
      })

      writeKanbanTasks(workspaceId, tasks)

      return { success: true, ticketCount: ticketIdx }
    },
  )

  // Install a tool in background with streaming output
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_INSTALL_TOOL,
    async (_event, args: { toolId: string }) => {
      const { toolId } = args
      const installCmd = INSTALL_COMMANDS[toolId]
      if (!installCmd) {
        return { success: false, installed: false, error: `Unknown tool: ${toolId}` }
      }

      const sendInstallProgress = (data: { toolId: string; output: string; status: 'running' | 'done' | 'error' }) => {
        if (!getMainWindow) return
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ANALYSIS_INSTALL_PROGRESS, data)
        }
      }

      return new Promise((resolve) => {
        // Execute the hardcoded install command safely via platform shell.
        // installCmd is from a fixed dictionary (INSTALL_COMMANDS), never from user input.
        const installShell = getInstallShell()
        const child = spawn(installShell.command, installShell.buildArgs(installCmd), {
          env: enrichedEnv(),
        })

        installingProcesses.set(toolId, child)

        child.stdout.on('data', (chunk: Buffer) => {
          sendInstallProgress({ toolId, output: chunk.toString(), status: 'running' })
        })

        child.stderr.on('data', (chunk: Buffer) => {
          sendInstallProgress({ toolId, output: chunk.toString(), status: 'running' })
        })

        child.on('error', (err) => {
          installingProcesses.delete(toolId)
          sendInstallProgress({ toolId, output: err.message, status: 'error' })
          resolve({ success: false, installed: false, error: err.message })
        })

        child.on('close', async (code) => {
          installingProcesses.delete(toolId)

          if (code !== 0) {
            sendInstallProgress({ toolId, output: `\nProcess exited with code ${code}`, status: 'error' })
            resolve({ success: false, installed: false, error: `Exit code ${code}` })
            return
          }

          // Re-detect if the tool is now available
          const toolEntry = TOOL_CATALOG.find((t) => t.id === toolId)
          let installed = false
          if (toolEntry) {
            installed = await isCommandAvailable(toolEntry.command)
          }

          sendInstallProgress({ toolId, output: '\nInstallation complete.', status: 'done' })
          resolve({ success: true, installed })
        })
      })
    },
  )
}
