import { v4 as uuid } from 'uuid'
import {
  AnalysisToolCategory,
  AnalysisToolDef,
  AnalysisFinding,
  AnalysisSeverity,
} from '../../../shared/types'

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
// Tool catalog entry shape (internal to this module)
// ---------------------------------------------------------------------------

export interface ToolCatalogEntry {
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

// ---------------------------------------------------------------------------
// Severity mappers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Path helper (shared by parsers)
// ---------------------------------------------------------------------------

function relativize(filePath: string, projectPath: string): string {
  if (filePath.startsWith(projectPath)) {
    return filePath.slice(projectPath.length).replace(/^\//, '')
  }
  return filePath
}

// ---------------------------------------------------------------------------
// Tool catalog — all 11 tool definitions
// ---------------------------------------------------------------------------

export const TOOL_CATALOG: ToolCatalogEntry[] = [
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

/** Convert a catalog entry to the public AnalysisToolDef shape */
export function getToolDef(entry: ToolCatalogEntry, installed: boolean): AnalysisToolDef {
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
