import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import type { KanbanTask, KanbanStatus } from '../../shared/types'

export function getKanbanDir(): string {
  const dir = path.join(os.homedir(), '.kanbai', 'kanban')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getKanbanPath(workspaceId: string): string {
  return path.join(getKanbanDir(), `${workspaceId}.json`)
}

export function readKanbanTasks(workspaceId: string): KanbanTask[] {
  const filePath = getKanbanPath(workspaceId)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function writeKanbanTasks(workspaceId: string, tasks: KanbanTask[]): void {
  const filePath = getKanbanPath(workspaceId)
  getKanbanDir()
  fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8')
}

export function getNextTicketNumber(tasks: KanbanTask[]): number {
  return tasks.reduce((max, t) => Math.max(max, t.ticketNumber ?? 0), 0) + 1
}

export const AI_MEMORY_REFACTOR_LABEL = 'ai-memory-refactor'

const MEMORY_REFACTOR_INTERVAL = 10

const MEMORY_REFACTOR_DESCRIPTION = `## Objective
Review and consolidate all AI memory files to reflect the current project state.
All work must be done in the **workspace** (not the project).

## Files to review (per provider)

### Claude Code
- [ ] CLAUDE.md (workspace root — agent team protocol)
- [ ] .claude/rules/ (rule files)
- [ ] .claude/agents/ (agent configs)

### Codex
- [ ] AGENTS.md (workspace root — Codex instruction file)
- [ ] .codex/config.toml (settings)

### Copilot
- [ ] .github/copilot-instructions.md (global instructions)
- [ ] .github/instructions/*.instructions.md (path-specific rules)
- [ ] .copilot/config.json (settings)

### Gemini CLI
- [ ] GEMINI.md (workspace root — Gemini instruction file)
- [ ] .gemini/settings.json (settings)

## Tasks
1. Read all existing AI memory files in the workspace and each project
2. Ensure all 4 providers have comprehensive, up-to-date instruction files
3. Consolidate duplicated information — each file should have the same project knowledge adapted to the provider format
4. Update with new knowledge gained from recent tickets
5. Improve clarity: architecture, technologies, conventions, decisions
6. Copy useful project-level memory files to the workspace level
7. Remove outdated or contradictory information

## Acceptance Criteria
- All 4 providers have comprehensive instruction files in the workspace
- Same knowledge base across all files (architecture, conventions, decisions)
- No redundant information within each file
- Memory reflects the current project architecture and conventions
- Files are clear and easy to understand for any AI agent
`

function readAutoMemoryRefactorSetting(): boolean {
  try {
    const dataPath = path.join(os.homedir(), '.kanbai', 'data.json')
    if (!fs.existsSync(dataPath)) return true
    const raw = fs.readFileSync(dataPath, 'utf-8')
    const data = JSON.parse(raw)
    return data.settings?.autoCreateAiMemoryRefactorTickets ?? true
  } catch {
    return true
  }
}

/**
 * Creates an AI memory refactor ticket when:
 * - The setting is enabled in app settings (defaults to true)
 * - No open refactor ticket (TODO/WORKING) already exists
 * - Either: (a) no refactor ticket has ever been created (first run),
 *   or (b) the ticket count has reached a multiple of MEMORY_REFACTOR_INTERVAL
 */
export function maybeCreateMemoryRefactorTicket(
  workspaceId: string,
  tasks: KanbanTask[],
): KanbanTask | null {
  if (!readAutoMemoryRefactorSetting()) return null

  const hasOpenRefactor = tasks.some(
    (t) =>
      t.labels?.includes(AI_MEMORY_REFACTOR_LABEL) &&
      (t.status === 'TODO' || t.status === 'WORKING'),
  )
  if (hasOpenRefactor) return null

  const hasAnyRefactorHistory = tasks.some(
    (t) => t.labels?.includes(AI_MEMORY_REFACTOR_LABEL),
  )

  const shouldCreate = !hasAnyRefactorHistory || tasks.length % MEMORY_REFACTOR_INTERVAL === 0
  if (!shouldCreate) return null

  const refactorTask: KanbanTask = {
    id: uuid(),
    workspaceId,
    ticketNumber: getNextTicketNumber(tasks),
    title: 'Refonte des memoires IA (Claude.md, Gemini.md, etc)',
    description: MEMORY_REFACTOR_DESCRIPTION,
    status: 'TODO',
    priority: 'medium',
    labels: [AI_MEMORY_REFACTOR_LABEL, 'maintenance'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.push(refactorTask)
  writeKanbanTasks(workspaceId, tasks)
  return refactorTask
}

export function createKanbanTask(
  workspaceId: string,
  data: {
    title: string
    description: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    status?: KanbanStatus
    targetProjectId?: string
    labels?: string[]
    isCtoTicket?: boolean
    disabled?: boolean
    parentTicketId?: string
  },
): KanbanTask {
  const tasks = readKanbanTasks(workspaceId)
  const task: KanbanTask = {
    id: uuid(),
    workspaceId,
    targetProjectId: data.targetProjectId,
    ticketNumber: getNextTicketNumber(tasks),
    title: data.title,
    description: data.description,
    status: data.status || 'TODO',
    priority: data.priority,
    labels: data.labels,
    isCtoTicket: data.isCtoTicket,
    disabled: data.disabled,
    parentTicketId: data.parentTicketId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.push(task)

  // If parentTicketId is set, update the parent's childTicketIds
  if (data.parentTicketId) {
    const parentIdx = tasks.findIndex((t) => t.id === data.parentTicketId)
    if (parentIdx !== -1) {
      const parent = tasks[parentIdx]!
      const children = parent.childTicketIds ?? []
      if (!children.includes(task.id)) {
        tasks[parentIdx] = {
          ...parent,
          childTicketIds: [...children, task.id],
          updatedAt: Date.now(),
        }
      }
    }
  }

  writeKanbanTasks(workspaceId, tasks)

  // Auto-create memory refactor ticket every N tickets
  // Setting check is delegated to the caller (IPC handler passes the setting value).
  // When called from MCP, defaults to enabled.
  maybeCreateMemoryRefactorTicket(workspaceId, readKanbanTasks(workspaceId))

  return task
}

export function updateKanbanTask(
  workspaceId: string,
  taskId: string,
  updates: Partial<KanbanTask>,
): KanbanTask {
  const tasks = readKanbanTasks(workspaceId)
  const idx = tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) throw new Error(`Kanban task ${taskId} not found`)
  const { workspaceId: _wid, ...safeUpdates } = updates
  tasks[idx] = { ...tasks[idx]!, ...safeUpdates, updatedAt: Date.now() }
  writeKanbanTasks(workspaceId, tasks)
  return tasks[idx]!
}

export function deleteKanbanTask(workspaceId: string, taskId: string): void {
  const tasks = readKanbanTasks(workspaceId)
  const taskToDelete = tasks.find((t) => t.id === taskId)

  // Clean up parent's childTicketIds if this task has a parent
  if (taskToDelete?.parentTicketId) {
    const parent = tasks.find((t) => t.id === taskToDelete.parentTicketId)
    if (parent?.childTicketIds) {
      parent.childTicketIds = parent.childTicketIds.filter((id) => id !== taskId)
      parent.updatedAt = Date.now()
    }
  }

  // Clean up children's parentTicketId if this task is a parent
  if (taskToDelete?.childTicketIds) {
    for (const childId of taskToDelete.childTicketIds) {
      const child = tasks.find((t) => t.id === childId)
      if (child) {
        child.parentTicketId = undefined
        child.updatedAt = Date.now()
      }
    }
  }

  const filtered = tasks.filter((t) => t.id !== taskId)
  writeKanbanTasks(workspaceId, filtered)
}
