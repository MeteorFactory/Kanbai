import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import type { KanbanTask, KanbanTaskType, KanbanStatus } from '../../shared/types'

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

function migrateTask(task: KanbanTask & { labels?: string[] }): boolean {
  let changed = false

  if (!task.type) {
    const labels = (task as { labels?: string[] }).labels ?? []
    const labelMap: Record<string, KanbanTaskType> = {
      bug: 'bug',
      feature: 'feature',
      refactor: 'refactor',
      docs: 'doc',
      test: 'test',
    }
    let inferred: KanbanTaskType = 'feature'
    for (const label of labels) {
      if (label in labelMap) {
        inferred = labelMap[label]!
        break
      }
    }
    task.type = inferred
    changed = true
  }

  if ((task.priority as string) === 'critical') {
    task.priority = 'high'
    changed = true
  }

  if ('labels' in task) {
    delete (task as unknown as Record<string, unknown>).labels
    changed = true
  }

  return changed
}

export function readKanbanTasks(workspaceId: string): KanbanTask[] {
  const filePath = getKanbanPath(workspaceId)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const tasks: KanbanTask[] = JSON.parse(raw)

    // Migrate legacy tasks
    let needsWrite = false
    for (const task of tasks) {
      if (migrateTask(task)) needsWrite = true
    }
    if (needsWrite) {
      fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8')
    }

    return tasks
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

const DEFAULT_MEMORY_REFACTOR_INTERVAL = 10

const MEMORY_REFACTOR_TITLES: Record<string, string> = {
  fr: 'Refonte des memoires IA (Claude.md, Gemini.md, etc)',
  en: 'AI memory refactor (Claude.md, Gemini.md, etc)',
}

function readLocaleFromSettings(): string {
  try {
    const dataPath = path.join(os.homedir(), '.kanbai', 'data.json')
    if (!fs.existsSync(dataPath)) return 'fr'
    const raw = fs.readFileSync(dataPath, 'utf-8')
    const data = JSON.parse(raw)
    return data.settings?.locale ?? 'fr'
  } catch {
    return 'fr'
  }
}

const MEMORY_REFACTOR_DESCRIPTIONS: Record<string, string> = {
  en: `## Objective
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
`,
  fr: `## Objectif
Revoir et consolider tous les fichiers memoire IA pour refleter l'etat actuel du projet.
Tout le travail doit etre fait dans le **workspace** (pas le projet).

## Fichiers a revoir (par provider)

### Claude Code
- [ ] CLAUDE.md (racine du workspace — protocole equipe d'agents)
- [ ] .claude/rules/ (fichiers de regles)
- [ ] .claude/agents/ (configurations des agents)

### Codex
- [ ] AGENTS.md (racine du workspace — instructions Codex)
- [ ] .codex/config.toml (parametres)

### Copilot
- [ ] .github/copilot-instructions.md (instructions globales)
- [ ] .github/instructions/*.instructions.md (regles par chemin)
- [ ] .copilot/config.json (parametres)

### Gemini CLI
- [ ] GEMINI.md (racine du workspace — instructions Gemini)
- [ ] .gemini/settings.json (parametres)

## Taches
1. Lire tous les fichiers memoire IA existants dans le workspace et chaque projet
2. S'assurer que les 4 providers ont des fichiers d'instructions complets et a jour
3. Consolider les informations dupliquees — chaque fichier doit avoir la meme base de connaissances adaptee au format du provider
4. Mettre a jour avec les nouvelles connaissances acquises lors des tickets recents
5. Ameliorer la clarte : architecture, technologies, conventions, decisions
6. Copier les fichiers memoire utiles du niveau projet vers le niveau workspace
7. Supprimer les informations obsoletes ou contradictoires

## Criteres d'acceptation
- Les 4 providers ont des fichiers d'instructions complets dans le workspace
- Meme base de connaissances dans tous les fichiers (architecture, conventions, decisions)
- Pas d'information redondante dans chaque fichier
- La memoire reflete l'architecture et les conventions actuelles du projet
- Les fichiers sont clairs et faciles a comprendre pour tout agent IA
`,
}

function readMemoryRefactorSettings(workspaceId?: string): { enabled: boolean; interval: number } {
  // Try per-workspace config first
  if (workspaceId) {
    try {
      const configPath = path.join(os.homedir(), '.kanbai', 'kanban', `${workspaceId}-config.json`)
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw)
        if (typeof config.autoCreateAiMemoryRefactorTickets === 'boolean') {
          return {
            enabled: config.autoCreateAiMemoryRefactorTickets,
            interval: typeof config.aiMemoryRefactorInterval === 'number' && config.aiMemoryRefactorInterval >= 1
              ? config.aiMemoryRefactorInterval
              : DEFAULT_MEMORY_REFACTOR_INTERVAL,
          }
        }
      }
    } catch { /* fallback below */ }
  }
  // Fallback to global default config, then data.json
  try {
    const defaultConfigPath = path.join(os.homedir(), '.kanbai', 'kanban', 'default-config.json')
    if (fs.existsSync(defaultConfigPath)) {
      const raw = fs.readFileSync(defaultConfigPath, 'utf-8')
      const config = JSON.parse(raw)
      if (typeof config.autoCreateAiMemoryRefactorTickets === 'boolean') {
        return {
          enabled: config.autoCreateAiMemoryRefactorTickets,
          interval: typeof config.aiMemoryRefactorInterval === 'number' && config.aiMemoryRefactorInterval >= 1
            ? config.aiMemoryRefactorInterval
            : DEFAULT_MEMORY_REFACTOR_INTERVAL,
        }
      }
    }
  } catch { /* fallback below */ }
  try {
    const dataPath = path.join(os.homedir(), '.kanbai', 'data.json')
    if (!fs.existsSync(dataPath)) return { enabled: true, interval: DEFAULT_MEMORY_REFACTOR_INTERVAL }
    const raw = fs.readFileSync(dataPath, 'utf-8')
    const data = JSON.parse(raw)
    return {
      enabled: data.settings?.autoCreateAiMemoryRefactorTickets ?? true,
      interval: DEFAULT_MEMORY_REFACTOR_INTERVAL,
    }
  } catch {
    return { enabled: true, interval: DEFAULT_MEMORY_REFACTOR_INTERVAL }
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
  const memorySettings = readMemoryRefactorSettings(workspaceId)
  if (!memorySettings.enabled) return null

  const isRefactorTicket = (t: KanbanTask) =>
    t.type === 'ia' && t.title === (MEMORY_REFACTOR_TITLES[readLocaleFromSettings()] ?? MEMORY_REFACTOR_TITLES['fr']!)

  const hasOpenRefactor = tasks.some(
    (t) =>
      isRefactorTicket(t) &&
      (t.status === 'TODO' || t.status === 'WORKING'),
  )
  if (hasOpenRefactor) return null

  const hasAnyRefactorHistory = tasks.some(isRefactorTicket)

  const interval = memorySettings.interval
  const shouldCreate = !hasAnyRefactorHistory || tasks.length % interval === 0
  if (!shouldCreate) return null

  const refactorTask: KanbanTask = {
    id: uuid(),
    workspaceId,
    ticketNumber: getNextTicketNumber(tasks),
    title: MEMORY_REFACTOR_TITLES[readLocaleFromSettings()] ?? MEMORY_REFACTOR_TITLES['fr']!,
    description: MEMORY_REFACTOR_DESCRIPTIONS[readLocaleFromSettings()] ?? MEMORY_REFACTOR_DESCRIPTIONS['fr']!,
    status: 'TODO',
    priority: 'medium',
    type: 'ia',
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
    priority: 'low' | 'medium' | 'high'
    type?: KanbanTaskType
    status?: KanbanStatus
    targetProjectId?: string
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
    type: data.type ?? 'feature',
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
