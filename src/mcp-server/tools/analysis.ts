import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { WorkspaceContext } from '../lib/context.js'
import {
  TOOL_CATALOG,
  getToolDef,
  isCommandAvailable,
  isGrauditAvailable,
  isEslintAvailable,
  runTool,
  loadPersistedReports,
  groupFindings,
  buildTicketTitle,
  buildTicketDescription,
  ensureGitignoreExcludesReports,
} from '../lib/analysis-runner.js'
import {
  readKanbanTasks,
  writeKanbanTasks,
  getNextTicketNumber,
} from '../lib/kanban-store.js'
import { v4 as uuid } from 'uuid'
import type { KanbanTask } from '../../shared/types/index.js'

export function registerAnalysisTools(server: McpServer, ctx: WorkspaceContext): void {
  // analysis_detect_tools
  server.tool(
    'analysis_detect_tools',
    'Detect installed analysis tools (semgrep, trivy, eslint, etc.)',
    {
      projectPath: z.string().optional().describe('Project path for local tool detection (e.g. eslint)'),
    },
    async ({ projectPath }) => {
      const pp = projectPath || ''
      const results = []

      for (const entry of TOOL_CATALOG) {
        let installed = false
        if (entry.id === 'eslint') {
          installed = await isEslintAvailable(pp)
        } else if (entry.id === 'graudit') {
          installed = await isGrauditAvailable()
        } else {
          installed = await isCommandAvailable(entry.command)
        }
        results.push(getToolDef(entry, installed))
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      }
    },
  )

  // analysis_run
  server.tool(
    'analysis_run',
    'Run a code analysis tool on a project',
    {
      projectPath: z.string().describe('Absolute path to the project to analyze'),
      toolId: z.string().describe('Tool ID (semgrep, trivy, eslint, bandit, etc.)'),
      extraArgs: z.array(z.string()).optional().describe('Extra CLI arguments for the tool'),
    },
    async ({ projectPath, toolId, extraArgs }) => {
      const entry = TOOL_CATALOG.find((t) => t.id === toolId)
      if (!entry) {
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${toolId}` }],
          isError: true,
        }
      }

      const report = await runTool(entry, { projectPath, toolId, extraArgs })

      // Auto-update .gitignore to exclude tool report directories
      ensureGitignoreExcludesReports(projectPath, toolId)

      const summaryText = report.error
        ? `Error: ${report.error}`
        : `Found ${report.summary.total} issue(s) — critical:${report.summary.critical} high:${report.summary.high} medium:${report.summary.medium} low:${report.summary.low} info:${report.summary.info}`

      return {
        content: [{
          type: 'text' as const,
          text: `${summaryText}\n\n${JSON.stringify(report, null, 2)}`,
        }],
      }
    },
  )

  // analysis_list_reports
  server.tool(
    'analysis_list_reports',
    'List persisted analysis reports for a project',
    {
      projectPath: z.string().describe('Absolute path to the project'),
    },
    async ({ projectPath }) => {
      const reports = loadPersistedReports(projectPath)
      const summary = reports.map((r) => ({
        id: r.id,
        toolId: r.toolId,
        toolName: r.toolName,
        timestamp: r.timestamp,
        duration: r.duration,
        total: r.summary.total,
        error: r.error,
      }))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      }
    },
  )

  // analysis_create_tickets
  server.tool(
    'analysis_create_tickets',
    'Create kanban tickets from analysis findings',
    {
      projectPath: z.string().describe('Project path to load reports from'),
      reportId: z.string().describe('Report ID to extract findings from'),
      findingIds: z.array(z.string()).optional().describe('Specific finding IDs (all if omitted)'),
      targetProjectId: z.string().optional().describe('Target project UUID for tickets'),
      groupBy: z.enum(['individual', 'file', 'rule', 'severity']).default('individual').describe('How to group findings into tickets'),
    },
    async ({ projectPath, reportId, findingIds, targetProjectId, groupBy }) => {
      const reports = loadPersistedReports(projectPath)
      const report = reports.find((r) => r.id === reportId)
      if (!report) {
        return {
          content: [{ type: 'text' as const, text: 'Report not found. Run analysis first.' }],
          isError: true,
        }
      }

      const selectedFindings = findingIds
        ? report.findings.filter((f) => findingIds.includes(f.id))
        : report.findings

      if (selectedFindings.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No findings to create tickets from.' }],
          isError: true,
        }
      }

      const groups = groupFindings(selectedFindings, groupBy)
      const tasks = readKanbanTasks(ctx.workspaceId)
      let nextNum = getNextTicketNumber(tasks)

      let ticketCount = 0
      groups.forEach((findings, key) => {
        const task: KanbanTask = {
          id: uuid(),
          workspaceId: ctx.workspaceId,
          targetProjectId,
          ticketNumber: nextNum++,
          title: buildTicketTitle(key, groupBy, findings, report.toolName),
          description: buildTicketDescription(findings),
          status: 'TODO',
          priority: 'high',
          labels: ['refactor', 'bug', report.toolName.toLowerCase()],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        tasks.push(task)
        ticketCount++
      })

      writeKanbanTasks(ctx.workspaceId, tasks)

      return {
        content: [{
          type: 'text' as const,
          text: `Created ${ticketCount} ticket(s) from ${selectedFindings.length} finding(s).`,
        }],
      }
    },
  )
}
