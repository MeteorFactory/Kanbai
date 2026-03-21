import { IpcMain, BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import {
  IPC_CHANNELS,
  AnalysisReport,
  AnalysisRunOptions,
  AnalysisTicketRequest,
  AnalysisProgress,
} from '../../shared/types'
import {
  TOOL_CATALOG,
  getToolDef,
  isCommandAvailable,
  isGrauditAvailable,
  isEslintAvailable,
  runTool,
  cancelAnalysis,
  installTool,
  storeReport,
  getStoredReport,
  deleteStoredReport,
  persistReport,
  loadPersistedReports,
  deletePersistedReport,
  ensureGitignoreExcludesReportsForWorkspace,
  createTicketsFromFindings,
} from '../services/analysis'

// ---------------------------------------------------------------------------
// Progress routing helpers
// ---------------------------------------------------------------------------

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

function sendInstallProgress(
  getMainWindow: (() => BrowserWindow | null) | undefined,
  data: { toolId: string; output: string; status: 'running' | 'done' | 'error' },
): void {
  if (!getMainWindow) return
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.ANALYSIS_INSTALL_PROGRESS, data)
  }
}

// ---------------------------------------------------------------------------
// Register IPC handlers
// ---------------------------------------------------------------------------

export function registerAnalysisHandlers(
  ipcMain: IpcMain,
  getMainWindow?: () => BrowserWindow | null,
): void {
  // 1. Detect installed tools
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_DETECT_TOOLS,
    async (_event, args?: { projectPath?: string }) => {
      const projectPath = args?.projectPath || ''

      const results = await Promise.all(
        TOOL_CATALOG.map(async (entry) => {
          let installed = false
          if (entry.id === 'eslint') {
            installed = await isEslintAvailable(projectPath)
          } else if (entry.id === 'graudit') {
            installed = await isGrauditAvailable()
          } else {
            installed = await isCommandAvailable(entry.command)
          }
          return getToolDef(entry, installed)
        }),
      )

      return results
    },
  )

  // 2. Run analysis
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

      const report = await runTool(
        entry,
        options,
        (progress) => sendProgress(getMainWindow, progress),
      )
      storeReport(report)
      persistReport(report)

      // Auto-update .gitignore for all projects in the workspace
      ensureGitignoreExcludesReportsForWorkspace(options.projectPath, options.toolId)

      return report
    },
  )

  // 3. Cancel running analysis
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_CANCEL,
    async (_event, args: { toolId: string }) => {
      return cancelAnalysis(args.toolId)
    },
  )

  // 4. Load persisted reports
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

  // 5. Delete a persisted report
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_DELETE_REPORT,
    async (_event, args: { projectPath: string; reportId: string }) => {
      const deleted = deletePersistedReport(args.projectPath, args.reportId)
      if (deleted) {
        deleteStoredReport(args.reportId)
      }
      return { success: deleted, error: deleted ? undefined : 'Report not found' }
    },
  )

  // 6. Create kanban tickets from findings
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_CREATE_TICKETS,
    async (_event, request: AnalysisTicketRequest) => {
      const report = getStoredReport(request.reportId)
      if (!report) {
        return { success: false, ticketCount: 0, error: 'Report not found. Run the analysis again.' }
      }

      return createTicketsFromFindings(request, report.findings, report.toolName)
    },
  )

  // 7. Install a tool in background with streaming output
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_INSTALL_TOOL,
    async (_event, args: { toolId: string }) => {
      return installTool(
        args.toolId,
        (data) => sendInstallProgress(getMainWindow, data),
      )
    },
  )
}
