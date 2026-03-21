import { v4 as uuid } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  AnalysisFinding,
  AnalysisReport,
  AnalysisRunOptions,
  AnalysisProgress,
} from '../../../shared/types'
import {
  getWhichCommand,
  getAnalysisToolPaths,
  getInstallCommands,
  getInstallShell,
  killChildProcess,
  PATH_SEP,
  crossExecFile,
  crossSpawn,
} from '../../../shared/platform'
import { TOOL_CATALOG, ToolCatalogEntry } from './analysis-parsers'

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/** Build an enriched env with common tool paths (Homebrew, pip, Chocolatey, etc.) */
export function enrichedEnv(): NodeJS.ProcessEnv {
  const home = os.homedir()
  const extraPaths = getAnalysisToolPaths()
  return {
    ...process.env,
    HOME: home,
    PATH: `${process.env.PATH || ''}${PATH_SEP}${extraPaths.join(PATH_SEP)}`,
  }
}

// ---------------------------------------------------------------------------
// Command availability checks
// ---------------------------------------------------------------------------

export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const { stdout } = await crossExecFile(getWhichCommand(), [command], { env: enrichedEnv() })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

export async function isGrauditAvailable(): Promise<boolean> {
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

export async function isEslintAvailable(projectPath: string): Promise<boolean> {
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

export function resolveCommand(toolId: string, projectPath: string): string {
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

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

export function computeSummary(findings: AnalysisFinding[]): AnalysisReport['summary'] {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }
  for (const f of findings) {
    summary[f.severity]++
    summary.total++
  }
  return summary
}

// ---------------------------------------------------------------------------
// Process tracking for cancellation
// ---------------------------------------------------------------------------

/** Track running child processes for cancellation */
export const runningProcesses = new Map<string, ChildProcess>()

/** Track installing processes */
export const installingProcesses = new Map<string, ChildProcess>()

// Per-tool timeout (ms) — Docker-based tools get a shorter default to avoid runaway processes
const TOOL_TIMEOUT: Record<string, number> = {
  megalinter: 10 * 60 * 1000, // 10 min (Docker-based, inherently slow)
}
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

// Install commands per tool
const INSTALL_COMMANDS: Record<string, string> = getInstallCommands()

// ---------------------------------------------------------------------------
// Progress callback types
// ---------------------------------------------------------------------------

export type ProgressCallback = (progress: AnalysisProgress) => void

export type InstallProgressCallback = (data: { toolId: string; output: string; status: 'running' | 'done' | 'error' }) => void

// ---------------------------------------------------------------------------
// Main tool runner
// ---------------------------------------------------------------------------

export async function runTool(
  toolEntry: ToolCatalogEntry,
  options: AnalysisRunOptions,
  onProgress?: ProgressCallback,
): Promise<AnalysisReport> {
  const startTime = Date.now()
  const reportId = uuid()
  const { projectPath, extraArgs } = options
  const resolvedCommand = resolveCommand(toolEntry.id, projectPath)
  const args = toolEntry.buildArgs(projectPath, extraArgs)

  onProgress?.({
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
      onProgress?.({
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
        onProgress?.({
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

      onProgress?.({
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
// Cancel a running analysis
// ---------------------------------------------------------------------------

export function cancelAnalysis(toolId: string): { success: boolean; error?: string } {
  const child = runningProcesses.get(toolId)
  if (child) {
    killChildProcess(child, 'SIGTERM')
    // Force kill fallback for stubborn/Docker processes
    setTimeout(() => {
      killChildProcess(child, 'SIGKILL')
    }, 3000)
    runningProcesses.delete(toolId)
    return { success: true }
  }
  return { success: false, error: 'No running process for this tool' }
}

// ---------------------------------------------------------------------------
// Install a tool with streaming output
// ---------------------------------------------------------------------------

export async function installTool(
  toolId: string,
  onProgress?: InstallProgressCallback,
): Promise<{ success: boolean; installed: boolean; error?: string }> {
  const installCmd = INSTALL_COMMANDS[toolId]
  if (!installCmd) {
    return { success: false, installed: false, error: `Unknown tool: ${toolId}` }
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
      onProgress?.({ toolId, output: chunk.toString(), status: 'running' })
    })

    child.stderr.on('data', (chunk: Buffer) => {
      onProgress?.({ toolId, output: chunk.toString(), status: 'running' })
    })

    child.on('error', (err) => {
      installingProcesses.delete(toolId)
      onProgress?.({ toolId, output: err.message, status: 'error' })
      resolve({ success: false, installed: false, error: err.message })
    })

    child.on('close', async (code) => {
      installingProcesses.delete(toolId)

      if (code !== 0) {
        onProgress?.({ toolId, output: `\nProcess exited with code ${code}`, status: 'error' })
        resolve({ success: false, installed: false, error: `Exit code ${code}` })
        return
      }

      // Re-detect if the tool is now available
      const toolEntry = TOOL_CATALOG.find((t) => t.id === toolId)
      let installed = false
      if (toolEntry) {
        installed = await isCommandAvailable(toolEntry.command)
      }

      onProgress?.({ toolId, output: '\nInstallation complete.', status: 'done' })
      resolve({ success: true, installed })
    })
  })
}
