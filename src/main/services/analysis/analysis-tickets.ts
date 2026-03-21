import { v4 as uuid } from 'uuid'
import {
  AnalysisFinding,
  AnalysisTicketRequest,
  KanbanTask,
} from '../../../shared/types'
import {
  readKanbanTasks,
  writeKanbanTasks,
} from '../../../mcp-server/lib/kanban-store'

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

export function groupFindings(
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

// ---------------------------------------------------------------------------
// Title / description builders
// ---------------------------------------------------------------------------

export function buildTicketTitle(
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

export function buildTicketDescription(findings: AnalysisFinding[]): string {
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
// Ticket creation orchestrator
// ---------------------------------------------------------------------------

export function createTicketsFromFindings(
  request: AnalysisTicketRequest,
  reportFindings: AnalysisFinding[],
  toolName: string,
): { success: boolean; ticketCount: number; error?: string } {
  const { findingIds, workspaceId, targetProjectId, groupBy } = request

  // Filter findings by requested IDs
  const selectedFindings = reportFindings.filter((f) => findingIds.includes(f.id))
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
      title: buildTicketTitle(key, groupBy, findings, toolName),
      description: buildTicketDescription(findings),
      status: 'TODO',
      priority: 'high',
      type: 'bug',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    tasks.push(task)
  })

  writeKanbanTasks(workspaceId, tasks)

  return { success: true, ticketCount: ticketIdx }
}
