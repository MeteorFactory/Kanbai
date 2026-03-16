import { create } from 'zustand'
import type { KanbanTask, KanbanTaskType, KanbanStatus, KanbanComment } from '../../../shared/types/index'
import { AI_PROVIDERS, type AiProviderId } from '../../../shared/types/ai-provider'
import { useTerminalTabStore } from './terminalTabStore'
import { useWorkspaceStore } from './workspaceStore'
import { pushNotification } from './notificationStore'
import { useI18n } from '../i18n'

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

const TYPE_PREFIX: Record<KanbanTaskType, string> = {
  bug: 'B', feature: 'F', test: 'T', doc: 'D', ia: 'A', refactor: 'R',
}

function formatTicketLabel(task: KanbanTask): string {
  if (task.ticketNumber == null) return task.title
  const prefix = task.isPrequalifying ? 'T' : TYPE_PREFIX[task.type ?? 'feature']
  return `${prefix}-${String(task.ticketNumber).padStart(2, '0')}`
}

// Track tasks that have been re-launched once to avoid infinite loops
const relaunchedTaskIds = new Set<string>()

// Track tasks currently being reactivated to prevent duplicate updates
const reactivatingTaskIds = new Set<string>()

// Track tasks currently being launched to prevent duplicate sendToAi calls
const launchingTaskIds = new Set<string>()

/** Derive the git repo root from a worktree path (removes /.kanbai-worktrees/{id}). */
function repoPathFromWorktree(worktreePath: string): string {
  const worktreesDir = '/.kanbai-worktrees/'
  const idx = worktreePath.lastIndexOf(worktreesDir)
  if (idx === -1) return worktreePath
  return worktreePath.slice(0, idx)
}

/**
 * Auto-merge a completed task's worktree branch into the working branch,
 * then remove the worktree and delete the branch.
 * Uses worktreeBaseBranch to merge into the branch that was active at worktree creation.
 * Only runs if the task has worktree info and autoMergeWorktrees is enabled.
 *
 * On merge conflict: aborts the merge, preserves the worktree and branch,
 * sets the task to PENDING with conflict details, and notifies the user.
 */
async function autoMergeWorktree(
  task: KanbanTask,
  workspaceId: string,
): Promise<void> {
  if (!task.worktreePath || !task.worktreeBranch) return
  try {
    const kanbanConfig = await window.kanbai.kanban.getConfig(workspaceId)
    if (!kanbanConfig?.autoMergeWorktrees) return
    const repoPath = repoPathFromWorktree(task.worktreePath)
    const ticketLabel = formatTicketLabel(task)
    const result = await window.kanbai.git.worktreeMergeAndCleanup(
      repoPath,
      task.worktreePath,
      task.worktreeBranch,
      ticketLabel,
      task.worktreeBaseBranch,
    )
    if (result?.success && task.worktreeEnvPath) {
      // Clean up the task-specific workspace env now that the worktree is merged
      const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
      if (workspace) {
        const worktreeId = task.id.slice(0, 8)
        await window.kanbai.workspaceEnv.delete(workspace.name, worktreeId).catch(() => { /* best-effort */ })
      }
    }
    if (!result?.success) {
      if (result?.conflict) {
        // Merge conflict detected — preserve worktree, notify user, set task PENDING
        const conflictFiles: string[] = result.conflictFiles ?? []
        const t = useI18n.getState().t
        const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)?.name ?? ''
        const conflictSummary = conflictFiles.length <= 5
          ? conflictFiles.join(', ')
          : `${conflictFiles.slice(0, 5).join(', ')} (+${conflictFiles.length - 5})`

        pushNotification(
          'warning',
          wsName,
          t('notifications.mergeConflict', {
            ticket: ticketLabel,
            branch: task.worktreeBranch,
            target: result.targetBranch ?? task.worktreeBaseBranch ?? 'main',
            files: conflictSummary,
            count: conflictFiles.length,
          }),
          { workspaceId },
        )

        // Update task to PENDING with conflict details so user can resolve manually
        const conflictQuestion = t('notifications.mergeConflictQuestion', {
          branch: task.worktreeBranch,
          target: result.targetBranch ?? task.worktreeBaseBranch ?? 'main',
          files: conflictFiles.join('\n  - '),
        })

        await window.kanbai.kanban.update({
          id: task.id,
          workspaceId,
          status: 'PENDING',
          question: conflictQuestion,
        }).catch(() => { /* best-effort */ })

        return
      }
      // eslint-disable-next-line no-console
      console.warn(`Auto-merge failed for ${ticketLabel}:`, result?.error)
    }
  } catch {
    // Auto-merge is best-effort — do not block task completion
  }
}

export function pickNextTask(tasks: KanbanTask[]): KanbanTask | null {
  const todo = tasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying && !launchingTaskIds.has(t.id))
  if (!todo.length) return null
  todo.sort((a, b) => {
    // CTO tickets always go last — they should never block regular tickets
    const aCto = a.isCtoTicket ? 1 : 0
    const bCto = b.isCtoTicket ? 1 : 0
    if (aCto !== bCto) return aCto - bCto
    const pa = PRIORITY_ORDER[a.priority] ?? 99
    const pb = PRIORITY_ORDER[b.priority] ?? 99
    if (pa !== pb) return pa - pb
    return a.createdAt - b.createdAt
  })
  return todo[0]!
}

/**
 * Returns the number of available slots for launching new tasks.
 * 0 means no room (or paused). >0 means that many tasks can be launched.
 */
async function availableSlots(tasks: KanbanTask[], workspaceId: string): Promise<number> {
  let maxConcurrent = 1
  try {
    const kanbanConfig = await window.kanbai.kanban.getConfig(workspaceId)
    if (kanbanConfig?.paused) return 0
    if (kanbanConfig?.useWorktrees && kanbanConfig.maxConcurrentWorktrees > 1) {
      maxConcurrent = kanbanConfig.maxConcurrentWorktrees
    }
  } catch { /* default to 1 */ }
  const workingCount = tasks.filter((t) => t.status === 'WORKING').length + launchingTaskIds.size
  return Math.max(0, maxConcurrent - workingCount)
}

function isChildOfCto(task: KanbanTask, tasks: KanbanTask[]): boolean {
  if (!task.parentTicketId) return false
  const parent = tasks.find((t) => t.id === task.parentTicketId)
  return parent?.isCtoTicket ?? false
}

function buildCtoPrompt(task: KanbanTask, ticketLabel: string, kanbanFilePath: string): string {
  const childInfo = task.childTicketIds?.length
    ? `\n### Sous-tickets existants\nSous-tickets deja crees: ${task.childTicketIds.map((id) => `\`${id}\``).join(', ')}. Utilise \`kanban_list\` pour voir leur statut.`
    : ''

  const MAX_RESULT_CHARS = 2000
  const trimmedResult = task.result
    ? task.result.length > MAX_RESULT_CHARS
      ? `…${task.result.slice(-MAX_RESULT_CHARS)}`
      : task.result
    : null
  const previousContext = trimmedResult
    ? `\n### Contexte des sessions precedentes\n${trimmedResult}`
    : ''

  const conversationHistory = task.conversationHistoryPath
    ? `\n### Historique de la derniere session\nLis \`${task.conversationHistoryPath}\` avec Read pour recuperer le contexte.`
    : ''

  return [
    `> **REGLES CTO — IMPERATIVES**`,
    `> - **JAMAIS** passer ce ticket en \`DONE\` — c'est un ticket d'amelioration continue`,
    `> - **JAMAIS** coder, modifier des fichiers source, ou faire des commits — tu es CTO, pas developpeur`,
    `> - **TOUJOURS** creer des sous-tickets via \`kanban_create\` avec \`parentTicketId: "${task.id}"\``,
    `> - **EN FIN DE SESSION** : editer \`${kanbanFilePath}\` (ticket \`${task.id}\`) → status \`TODO\`, \`result\` avec bilan, \`updatedAt\` = \`Date.now()\``,
    `> - Si besoin de precisions : status \`PENDING\` + \`question\` | Si erreur bloquante : status \`FAILED\` + \`error\``,
    `> - **NE JAMAIS terminer sans avoir mis a jour le ticket**`,
    ``,
    `Tu es le **CTO** de ce projet. Tu analyses, evalues et crees des tickets — tu ne codes jamais.`,
    ``,
    `## Contexte`,
    `- Ticket: ${ticketLabel} (CTO) — ID: \`${task.id}\` — Kanban: \`${kanbanFilePath}\``,
    task.description ? `- Description: ${task.description}` : '',
    previousContext,
    conversationHistory,
    task.comments && task.comments.length > 0
      ? `\n### Commentaires de l'utilisateur\n${task.comments.map((c) => `- **[${new Date(c.createdAt).toLocaleString('fr-FR')}]** : ${c.text}`).join('\n')}`
      : '',
    childInfo,
    ``,
    `## Outils MCP`,
    `- **Kanban** : \`kanban_list\`, \`kanban_get\`, \`kanban_create\` (avec \`parentTicketId: "${task.id}"\`), \`kanban_update\`, \`kanban_delete\``,
    `- **Projet** : \`project_list\`, \`project_scan_info\`, \`workspace_info\`, \`project_setup_claude_rules\``,
    `- **Analyse** : \`analysis_detect_tools\`, \`analysis_run\`, \`analysis_list_reports\`, \`analysis_create_tickets\``,
    ``,
    `## Workflow`,
    `1. \`kanban_list\` — voir l'etat des sous-tickets existants`,
    `2. \`project_scan_info\` — scanner le(s) projet(s)`,
    `3. Lire les fichiers cles (README, package.json, CLAUDE.md)`,
    `4. Identifier 3-5 axes d'amelioration`,
    `5. Creer un sous-ticket par axe via \`kanban_create\` avec \`parentTicketId: "${task.id}"\``,
    `6. Mettre a jour ce ticket CTO : status \`TODO\`, \`result\` avec bilan, \`updatedAt\``,
  ].filter(Boolean).join('\n')
}

interface KanbanState {
  tasks: KanbanTask[]
  isLoading: boolean
  draggedTaskId: string | null
  currentWorkspaceId: string | null
  startupDoneCleanupPerformed: boolean
  kanbanTabIds: Record<string, string>
  kanbanPromptCwds: Record<string, string>
  backgroundTasks: Record<string, KanbanTask[]>
}

interface KanbanActions {
  loadTasks: (workspaceId: string) => Promise<void>
  syncTasksFromFile: () => Promise<void>
  createTask: (
    workspaceId: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high',
    type?: KanbanTaskType,
    targetProjectId?: string,
    isCtoTicket?: boolean,
    aiProvider?: AiProviderId,
  ) => Promise<void>
  updateTaskStatus: (taskId: string, status: KanbanStatus) => Promise<void>
  updateTask: (taskId: string, data: Partial<KanbanTask>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  duplicateTask: (task: KanbanTask) => Promise<void>
  setDragged: (taskId: string | null) => void
  getTasksByStatus: (status: KanbanStatus) => KanbanTask[]
  sendToAi: (task: KanbanTask, explicitWorkspaceId?: string, options?: { activate?: boolean }) => Promise<void>
  syncBackgroundWorkspace: (workspaceId: string) => Promise<void>
  attachFiles: (taskId: string) => Promise<void>
  attachFromClipboard: (taskId: string, dataBase64: string, filename: string, mimeType: string) => Promise<void>
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>
  handleTabClosed: (tabId: string) => void
  reactivateIfDone: (tabId: string, message?: string) => void
  acceptSplit: (taskId: string) => Promise<void>
  dismissSplit: (taskId: string) => void
  applyCompanionUpdate: (task: KanbanTask) => void
}

type KanbanStore = KanbanState & KanbanActions

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  tasks: [],
  isLoading: false,
  draggedTaskId: null,
  currentWorkspaceId: null,
  startupDoneCleanupPerformed: false,
  kanbanTabIds: {},
  kanbanPromptCwds: {},
  backgroundTasks: {},

  loadTasks: async (workspaceId: string) => {
    // Save current tasks to backgroundTasks before switching
    const { currentWorkspaceId: oldWsId, tasks: oldTasks } = get()
    if (oldWsId && oldWsId !== workspaceId && oldTasks.length > 0) {
      set((state) => ({
        backgroundTasks: { ...state.backgroundTasks, [oldWsId]: oldTasks },
      }))
    }

    // Load from backgroundTasks cache if available
    const cached = get().backgroundTasks[workspaceId]
    set({ isLoading: true, currentWorkspaceId: workspaceId, ...(cached ? { tasks: cached } : {}) })
    try {
      const tasks: KanbanTask[] = await window.kanbai.kanban.list(workspaceId)
      // isPrequalifying is transient (in-memory only) — clear any stale flags from file
      for (const t of tasks) {
        delete t.isPrequalifying
      }
      set({ tasks })

      // Startup-only cleanup: close stale terminals linked to DONE tickets (respects config).
      if (!get().startupDoneCleanupPerformed) {
        set({ startupDoneCleanupPerformed: true })
        const { kanbanTabIds: staleTabIds } = get()
        const closedTabIds: string[] = []
        window.kanbai.kanban.getConfig?.(workspaceId)?.then((kanbanConfig) => {
          for (const [taskId, tabId] of Object.entries(staleTabIds)) {
            const task = tasks.find((t) => t.id === taskId)
            if (!task) continue
            if (task.status === 'DONE') {
              const isCto = task.isCtoTicket || isChildOfCto(task, tasks)
              const shouldClose = isCto
                ? kanbanConfig?.autoCloseCtoTerminals
                : kanbanConfig?.autoCloseCompletedTerminals
              if (shouldClose) {
                closedTabIds.push(tabId)
              }
            }
            // CTO tickets reset to TODO — close stale terminals from previous sessions
            if (task.status === 'TODO' && (task.isCtoTicket || isChildOfCto(task, tasks))) {
              if (kanbanConfig?.autoCloseCtoTerminals) {
                closedTabIds.push(tabId)
              }
            }
          }
          if (closedTabIds.length > 0) {
            const termStore = useTerminalTabStore.getState()
            for (const tabId of closedTabIds) {
              termStore.closeTab(tabId)
            }
          }
        }).catch(() => { /* best-effort */ })
      }

      // Scheduling: resume WORKING without terminal, or pick next TODO (respecting concurrency limit)
      const capturedWorkspaceId = workspaceId
      setTimeout(async () => {
        // Guard against stale callbacks after workspace switch
        if (get().currentWorkspaceId !== capturedWorkspaceId) return

        const { kanbanTabIds } = get()

        // Determine max concurrent tasks (>1 only when worktrees enabled) and pause state
        let maxConcurrent = 1
        let isPaused = false
        try {
          const kanbanConfig = await window.kanbai.kanban.getConfig(capturedWorkspaceId)
          if (kanbanConfig?.paused) isPaused = true
          if (kanbanConfig?.useWorktrees && kanbanConfig.maxConcurrentWorktrees > 1) {
            maxConcurrent = kanbanConfig.maxConcurrentWorktrees
          }
        } catch { /* default to 1 */ }

        if (isPaused) return

        // 1. Resume WORKING tasks that lost their terminal
        const workingWithoutTerminal = tasks.filter(
          (t) => t.status === 'WORKING' && !kanbanTabIds[t.id],
        )
        for (const task of workingWithoutTerminal) {
          const workingCount = tasks.filter((t) => t.status === 'WORKING' && (kanbanTabIds[t.id] || t.id === task.id)).length
          if (workingCount <= maxConcurrent) {
            get().sendToAi(task, capturedWorkspaceId, { activate: false })
          }
        }
        if (workingWithoutTerminal.length > 0) return

        // 2. Fill available slots with next TODOs
        const workingCount = tasks.filter((t) => t.status === 'WORKING').length
        const freeSlots = maxConcurrent - workingCount
        if (freeSlots > 0) {
          const remaining = tasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < freeSlots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, capturedWorkspaceId, { activate: false })
          }
        }
      }, 500)
    } finally {
      set({ isLoading: false })
    }
  },

  syncTasksFromFile: async () => {
    const { currentWorkspaceId, tasks: oldTasks, kanbanTabIds, kanbanPromptCwds } = get()
    if (!currentWorkspaceId) return
    try {
      const newTasks: KanbanTask[] = await window.kanbai.kanban.list(currentWorkspaceId)
      // Preserve in-memory transient flags (not persisted to file)
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (oldTask?.isPrequalifying) {
          newTask.isPrequalifying = true
        } else {
          delete newTask.isPrequalifying
        }
        if (oldTask?.splitSuggestions?.length) {
          newTask.splitSuggestions = oldTask.splitSuggestions
        } else {
          delete newTask.splitSuggestions
        }
      }

      // Archive previous resolutions as styled comments when a reopened ticket gets re-resolved
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (!oldTask) continue

        const resultChanged = oldTask.result && newTask.result && oldTask.result !== newTask.result
        const errorChanged = oldTask.error && newTask.error && oldTask.error !== newTask.error

        if (resultChanged || errorChanged) {
          const archiveComments: KanbanComment[] = [...(newTask.comments ?? [])]

          if (resultChanged) {
            archiveComments.push({
              id: crypto.randomUUID(),
              text: oldTask.result!,
              type: 'resolution-done',
              createdAt: oldTask.updatedAt,
            })
          }
          if (errorChanged) {
            archiveComments.push({
              id: crypto.randomUUID(),
              text: oldTask.error!,
              type: 'resolution-failed',
              createdAt: oldTask.updatedAt,
            })
          }

          newTask.comments = archiveComments
          window.kanbai.kanban.update({
            id: newTask.id,
            comments: archiveComments,
            workspaceId: currentWorkspaceId!,
          }).catch(() => { /* best-effort */ })
        }
      }

      let taskFinished = false

      // Detect status transitions for all tasks
      const tasksToLaunch: KanbanTask[] = []
      const tabsToAutoClose: Array<{ tabId: string; isCto: boolean }> = []
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (!oldTask) continue
        if (oldTask.status === newTask.status) continue

        const tabId = kanbanTabIds[newTask.id]

        // Detect manual transition to WORKING without an existing terminal
        if (newTask.status === 'WORKING' && !tabId) {
          tasksToLaunch.push(newTask)
          continue
        }

        // Determine if this task operates in CTO mode (direct ticket or child of CTO)
        const isCtoMode = newTask.isCtoTicket || isChildOfCto(newTask, newTasks)

        // CTO auto-approve: when a CTO-mode ticket transitions to PENDING, auto-set to TODO
        if (newTask.status === 'PENDING' && isCtoMode) {
          // Auto-approve by setting to TODO — unblocks the CTO cycle
          window.kanbai.kanban.update({
            id: newTask.id,
            status: 'TODO',
            workspaceId: currentWorkspaceId!,
          }).catch(() => { /* best-effort */ })
          newTask.status = 'TODO'
          taskFinished = true
          // Close the terminal to free the slot for the next CTO iteration
          if (tabId) {
            tabsToAutoClose.push({ tabId, isCto: true })
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
          }
          continue
        }

        // CTO cycle reset: when a CTO-mode ticket transitions from WORKING to TODO,
        // close the terminal to free the slot for the next iteration.
        if (newTask.status === 'TODO' && oldTask.status === 'WORKING' && isCtoMode) {
          taskFinished = true
          if (tabId) {
            tabsToAutoClose.push({ tabId, isCto: true })
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
          }
          continue
        }

        // Handle DONE/FAILED when tab is already closed (race: tab closed before sync detected status)
        if (!tabId) {
          if ((newTask.status === 'DONE' || newTask.status === 'FAILED') && newTask.worktreePath && currentWorkspaceId) {
            taskFinished = true
            relaunchedTaskIds.delete(newTask.id)
            const ticketLabel = formatTicketLabel(newTask)
            // Finalize + merge directly since no tab is left to defer to
            if (newTask.status === 'DONE') {
              autoMergeWorktree(newTask, currentWorkspaceId).catch(() => { /* best-effort */ })
            }
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
            const t = useI18n.getState().t
            const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
            const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
            if (newTask.status === 'DONE') {
              const body = todoCount > 0
                ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
                : t('notifications.noMoreTickets', { ticket: ticketLabel })
              pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: currentWorkspaceId })
            } else {
              pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
                { workspaceId: currentWorkspaceId })
            }
          }
          continue
        }

        const termStore = useTerminalTabStore.getState()
        if (newTask.status === 'DONE') {
          termStore.setTabColor(tabId, '#3DD68C')
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id) // allow future re-launch
          tabsToAutoClose.push({ tabId, isCto: isCtoMode })

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          // Auto-merge is deferred to handleTabClosed to avoid deleting the
          // worktree while Claude's process is still running in it.

          // Push notification
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          const body = todoCount > 0
            ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
            : t('notifications.noMoreTickets', { ticket: ticketLabel })
          pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: currentWorkspaceId!, tabId })
        }
        if (newTask.status === 'FAILED') {
          termStore.setTabColor(tabId, '#F47067')
          termStore.killTabProcesses(tabId)
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id) // allow future re-launch

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          // Push notification
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
            { workspaceId: currentWorkspaceId!, tabId })
        }
        if (newTask.status === 'PENDING') {
          termStore.setTabColor(tabId, '#fbbf24')
          termStore.setTabActivity(tabId, true)
          termStore.killTabProcesses(tabId)
        }
      }

      set({ tasks: newTasks })

      // Launch Claude terminals for tasks manually moved to WORKING
      for (const task of tasksToLaunch) {
        get().sendToAi(task, task.workspaceId)
      }

      // After a task finishes (DONE/FAILED), pick the next one if under concurrency limit
      if (taskFinished) {
        const wsId = currentWorkspaceId
        const capturedTabsToClose = [...tabsToAutoClose]
        setTimeout(async () => {
          let maxConcurrent = 1
          if (wsId) {
            try {
              const kanbanConfig = await window.kanbai.kanban.getConfig(wsId)
              if (kanbanConfig?.paused) return
              if (kanbanConfig?.useWorktrees && kanbanConfig.maxConcurrentWorktrees > 1) {
                maxConcurrent = kanbanConfig.maxConcurrentWorktrees
              }

              // Auto-close terminals for completed tickets based on config.
              // Merge worktrees BEFORE closing tabs so the merge hook completes
              // while the terminal process is still alive.
              const termStore = useTerminalTabStore.getState()
              const { kanbanTabIds: currentTabIds, tasks: currentTasksForClose } = get()
              for (const { tabId, isCto } of capturedTabsToClose) {
                const shouldClose = isCto
                  ? kanbanConfig?.autoCloseCtoTerminals
                  : kanbanConfig?.autoCloseCompletedTerminals
                if (shouldClose) {
                  // Find the task linked to this tab and merge its worktree first
                  const taskId = Object.keys(currentTabIds).find((id) => currentTabIds[id] === tabId)
                  const task = taskId ? currentTasksForClose.find((t) => t.id === taskId) : undefined
                  if (task?.worktreePath && task.worktreeBranch && task.status === 'DONE' && wsId) {
                    try {
                      await window.kanbai.git.worktreeUnlock(task.worktreePath).catch(() => { /* best-effort */ })
                      await autoMergeWorktree(task, wsId)
                    } catch { /* best-effort — closeTab will still run */ }
                  }
                  termStore.closeTab(tabId)
                }
              }
            } catch { /* default to 1 */ }
          }
          const currentTasks = get().tasks
          const workingCount = currentTasks.filter((t) => t.status === 'WORKING').length
          const freeSlots = maxConcurrent - workingCount
          if (freeSlots > 0) {
            const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
            for (let i = 0; i < freeSlots; i++) {
              const next = pickNextTask(remaining)
              if (!next) break
              remaining.splice(remaining.indexOf(next), 1)
              get().sendToAi(next, wsId ?? undefined, { activate: false })
            }
          }
        }, 1000)
      }
    } catch { /* ignore sync errors */ }
  },

  createTask: async (workspaceId, title, description, priority, type?, targetProjectId?, isCtoTicket?, aiProvider?) => {
    // Check per-workspace config (prequalification + pause state)
    let prequalifyEnabled = false
    let workspacePaused = false
    try {
      const kanbanConfig = await window.kanbai.kanban.getConfig(workspaceId)
      prequalifyEnabled = kanbanConfig?.autoPrequalifyTickets === true
      workspacePaused = kanbanConfig?.paused === true
    } catch { /* default to false */ }

    const task: KanbanTask = await window.kanbai.kanban.create({
      workspaceId,
      targetProjectId,
      title,
      description,
      status: 'TODO',
      priority,
      type: type ?? 'feature',
      isCtoTicket,
      aiProvider,
    })

    // Mark as prequalifying if enabled (in-memory flag, not persisted)
    if (prequalifyEnabled) {
      task.isPrequalifying = true
    }
    set((state) => ({ tasks: [...state.tasks, task] }))

    if (prequalifyEnabled) {
    // Run prequalification in the background
    ;(async () => {
      try {
        const result = await window.kanbai.kanban.prequalify({
          title,
          description,
          priority,
          type: type ?? 'feature',
          targetProjectId,
          isCtoTicket,
          hasAttachments: false,
          hasComments: false,
        })
        if (!result) {
          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(task)
          pushNotification('error', ticketLabel, t('kanban.prequalifyFailed'))
        }
        const updates: Partial<KanbanTask> = {}
        if (result) {
          if (result.suggestedType && result.suggestedType !== (type ?? 'feature')) {
            updates.type = result.suggestedType as KanbanTaskType
          }
          if (result.suggestedPriority && result.suggestedPriority !== priority) {
            updates.priority = result.suggestedPriority as KanbanTask['priority']
          }
          if (result.clarifiedDescription && result.clarifiedDescription !== description) {
            updates.aiClarification = result.clarifiedDescription
          }
          if (result.splitSuggestions && Array.isArray(result.splitSuggestions) && result.splitSuggestions.length > 0) {
            // Auto-split: create child tickets inheriting metadata from the original
            const childIds: string[] = []
            for (const suggestion of result.splitSuggestions) {
              const child = await window.kanbai.kanban.create({
                workspaceId,
                targetProjectId: task.targetProjectId,
                title: suggestion.title,
                description: suggestion.description,
                status: 'TODO',
                priority: suggestion.priority as KanbanTask['priority'],
                type: suggestion.type as KanbanTaskType,
                isCtoTicket: task.isCtoTicket,
                aiProvider: task.aiProvider,
                splitFromId: task.id,
              })
              childIds.push(child.id)
            }
            // Archive the original ticket instead of deleting — preserves audit trail
            await window.kanbai.kanban.update({
              id: task.id,
              workspaceId,
              status: 'DONE' as KanbanStatus,
              archived: true,
              childTicketIds: childIds,
              result: `Ticket auto-split en ${childIds.length} sous-tickets lors de la pre-qualification`,
            })

            const newTasks: KanbanTask[] = await window.kanbai.kanban.list(workspaceId)
            for (const t of newTasks) {
              delete t.isPrequalifying
            }
            set({ tasks: newTasks })

            if (!workspacePaused) {
              const slots = await availableSlots(newTasks, workspaceId)
              const remaining = newTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
              for (let i = 0; i < slots; i++) {
                const next = pickNextTask(remaining)
                if (!next) break
                remaining.splice(remaining.indexOf(next), 1)
                get().sendToAi(next, workspaceId, { activate: false })
              }
            }
            return
          }
        }
        // Only persist non-transient fields to file
        if (Object.keys(updates).length > 0) {
          await window.kanbai.kanban.update({ id: task.id, ...updates, workspaceId })
        }
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...updates, isPrequalifying: false } : t)),
        }))

        // After prequalification finishes, try to auto-send if under concurrency limit
        if (!workspacePaused) {
          const currentTasks = get().tasks
          const slots = await availableSlots(currentTasks, workspaceId)
          const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < slots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, workspaceId, { activate: false })
          }
        }
      } catch (err) {
        // On failure, clear prequalifying flag and store error on the task
        const errorMessage = err instanceof Error ? err.message : String(err)
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, isPrequalifying: false } : t)),
        }))
        const t = useI18n.getState().t
        const ticketLabel = formatTicketLabel(task)
        pushNotification('error', ticketLabel, t('kanban.prequalifyFailed'))
        console.error('[kanban-prequalify] Error:', errorMessage)
        // Still try to auto-send on failure
        if (!workspacePaused) {
          const currentTasks = get().tasks
          const slots = await availableSlots(currentTasks, workspaceId)
          const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < slots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, workspaceId, { activate: false })
          }
        }
      }
    })()
    } else {
      // No prequalification — auto-send immediately
      if (!workspacePaused) {
        const currentTasks = get().tasks
        const slots = await availableSlots(currentTasks, workspaceId)
        const remaining = currentTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
        for (let i = 0; i < slots; i++) {
          const next = pickNextTask(remaining)
          if (!next) break
          remaining.splice(remaining.indexOf(next), 1)
          get().sendToAi(next, workspaceId, { activate: false })
        }
      }
    }
  },

  updateTaskStatus: async (taskId, status) => {
    const { currentWorkspaceId, kanbanTabIds, tasks, backgroundTasks } = get()
    // Resolve the task's actual workspace — prefer the task's own workspaceId over the current view
    const task = tasks.find((t) => t.id === taskId)
    let taskWorkspaceId = task?.workspaceId
    if (!taskWorkspaceId) {
      for (const [wsId, wsTasks] of Object.entries(backgroundTasks)) {
        if (wsTasks.find((t) => t.id === taskId)) { taskWorkspaceId = wsId; break }
      }
    }
    const workspaceId = taskWorkspaceId ?? currentWorkspaceId
    if (!workspaceId) return
    // Kill terminal process when ticket moves to PENDING or FAILED (not DONE — hooks handle that)
    if (status === 'PENDING' || status === 'FAILED') {
      const tabId = kanbanTabIds[taskId]
      if (tabId) {
        useTerminalTabStore.getState().killTabProcesses(tabId)
      }
    }
    await window.kanbai.kanban.update({ id: taskId, status, workspaceId })
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t)),
    }))
  },

  updateTask: async (taskId, data) => {
    const { currentWorkspaceId, tasks, backgroundTasks } = get()
    // Resolve the task's actual workspace — prefer the task's own workspaceId over the current view
    const task = tasks.find((t) => t.id === taskId)
    let taskWorkspaceId = task?.workspaceId
    if (!taskWorkspaceId) {
      for (const [wsId, wsTasks] of Object.entries(backgroundTasks)) {
        if (wsTasks.find((t) => t.id === taskId)) { taskWorkspaceId = wsId; break }
      }
    }
    const workspaceId = taskWorkspaceId ?? currentWorkspaceId
    if (!workspaceId) return
    await window.kanbai.kanban.update({ id: taskId, ...data, workspaceId })
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...data, updatedAt: Date.now() } : t)),
    }))
  },

  deleteTask: async (taskId) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    await window.kanbai.kanban.delete(taskId, currentWorkspaceId)
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }))
  },

  duplicateTask: async (task) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    const newTask: KanbanTask = await window.kanbai.kanban.create({
      workspaceId: currentWorkspaceId,
      targetProjectId: task.targetProjectId,
      title: `Copy of ${task.title}`,
      description: task.description,
      status: 'TODO',
      priority: task.priority,
      type: task.type,
      dueDate: task.dueDate,
      error: task.error,
      result: task.result,
      question: task.question,
      comments: task.comments,
    })
    set((state) => ({ tasks: [...state.tasks, newTask] }))
  },

  setDragged: (taskId) => set({ draggedTaskId: taskId }),

  getTasksByStatus: (status) => {
    return get().tasks.filter((t) => t.status === status)
  },

  sendToAi: async (task: KanbanTask, explicitWorkspaceId?: string, options?: { activate?: boolean }) => {
    const shouldActivate = options?.activate ?? true
    if (task.disabled) return
    if (launchingTaskIds.has(task.id)) return
    const workspaceId = explicitWorkspaceId ?? task.workspaceId ?? get().currentWorkspaceId
    if (!workspaceId) return
    launchingTaskIds.add(task.id)

    // If a tab already exists for this task, activate it instead of recreating
    const { kanbanTabIds } = get()
    const existingTabId = kanbanTabIds[task.id]
    if (existingTabId) {
      const termStore = useTerminalTabStore.getState()
      const tab = termStore.tabs.find((t) => t.id === existingTabId)
      if (tab) {
        if (shouldActivate) termStore.setActiveTab(existingTabId)
        launchingTaskIds.delete(task.id)
        return
      }
      // Tab was closed — remove stale mapping and proceed to create a new one
      const newTabIds = { ...get().kanbanTabIds }
      delete newTabIds[task.id]
      set({ kanbanTabIds: newTabIds })
    }

    // Determine AI provider first — it affects cwd strategy
    // Priority: ticket → target project kanban default → target project provider → workspace project kanban default → workspace provider → 'claude'
    const { projects, workspaces } = useWorkspaceStore.getState()
    const targetProject = task.targetProjectId ? projects.find((p) => p.id === task.targetProjectId) : undefined
    const workspaceProjects = projects.filter((p) => p.workspaceId === workspaceId)
    const firstProject = workspaceProjects[0]
    const kanbanDefault = targetProject?.aiDefaults?.kanban ?? firstProject?.aiDefaults?.kanban
    const provider: AiProviderId = task.aiProvider ?? kanbanDefault ?? targetProject?.aiProvider ?? firstProject?.aiProvider ?? 'claude'
    const providerConfig = AI_PROVIDERS[provider]

    // Determine cwd: if task targets a specific project, use its path
    let cwd: string | null = null
    if (task.targetProjectId) {
      const project = projects.find((p) => p.id === task.targetProjectId)
      if (project) cwd = project.path
    }
    if (!cwd) {
      // Setup workspace env (meta-directory with symlinks to all projects)
      // so the agent can navigate between projects regardless of AI provider
      const workspace = workspaces.find((w) => w.id === workspaceId)
      if (workspace && workspaceProjects.length > 0) {
        try {
          const envResult = await window.kanbai.workspaceEnv.setup(
            workspace.name,
            workspaceProjects.map((p) => p.path),
            workspaceId,
          )
          if (envResult?.success && envResult.envPath) {
            cwd = envResult.envPath
          }
        } catch { /* fallback below */ }
      }
      if (!cwd) {
        cwd = workspaceProjects[0]?.path ?? null
      }
    }
    if (!cwd) { launchingTaskIds.delete(task.id); return }

    // Worktree support: create a git worktree for this task if enabled
    if (!task.isCtoTicket && !isChildOfCto(task, get().tasks) && !task.worktreePath) {
      try {
        const kanbanConfig = await window.kanbai.kanban.getConfig(workspaceId)
        if (kanbanConfig?.useWorktrees) {
          // Determine the git project root — worktrees need a git repo
          const projectPath = task.targetProjectId
            ? projects.find((p) => p.id === task.targetProjectId)?.path
            : workspaceProjects.find((p) => p.hasGit)?.path
          if (projectPath) {
            const ticketBranch = `kanban/${formatTicketLabel(task).toLowerCase()}`
            const worktreeDir = `${projectPath}/.kanbai-worktrees/${task.id}`
            const result = await window.kanbai.git.worktreeAdd(projectPath, worktreeDir, ticketBranch)
            if (result?.success) {
              cwd = worktreeDir
              // Store the base branch (the branch that was active when worktree was created)
              // so we can merge back into it when the task completes
              const baseBranch = result.baseBranch ?? 'main'
              let worktreeEnvPath: string | undefined

              // For workspace-scoped tasks, wrap the worktree in a workspace env
              // so the agent sees all projects, not just the worktree directory
              if (!task.targetProjectId) {
                try {
                  const workspace = workspaces.find((w) => w.id === workspaceId)
                  if (workspace && workspaceProjects.length > 0) {
                    const worktreeId = task.id.slice(0, 8)
                    // Replace the git project's path with the worktree, preserving the original folder name
                    const modifiedPaths = workspaceProjects.map((p) =>
                      p.path === projectPath
                        ? { path: worktreeDir, name: p.path.split('/').pop()! }
                        : p.path,
                    )
                    const envResult = await window.kanbai.workspaceEnv.setup(
                      workspace.name,
                      modifiedPaths,
                      workspaceId,
                      worktreeId,
                    )
                    if (envResult?.success && envResult.envPath) {
                      cwd = envResult.envPath
                      worktreeEnvPath = envResult.envPath
                    }
                  }
                } catch {
                  // Env setup failed — fall through to use worktreeDir as cwd
                }
              }

              // Persist worktree info on the task
              await window.kanbai.kanban.update({
                id: task.id,
                workspaceId,
                worktreePath: worktreeDir,
                worktreeBranch: ticketBranch,
                worktreeBaseBranch: baseBranch,
                ...(worktreeEnvPath ? { worktreeEnvPath } : {}),
              })
              set((state) => ({
                tasks: state.tasks.map((t) =>
                  t.id === task.id ? { ...t, worktreePath: worktreeDir, worktreeBranch: ticketBranch, worktreeBaseBranch: baseBranch, ...(worktreeEnvPath ? { worktreeEnvPath } : {}) } : t,
                ),
              }))
            }
          }
        }
      } catch {
        // Worktree creation failed — fall through to use original cwd
      }
    } else if (task.worktreePath) {
      // Reuse existing worktree — prefer workspace env path if available
      if (task.worktreeEnvPath) {
        cwd = task.worktreeEnvPath
      } else if (!task.targetProjectId) {
        // Workspace-scoped task without env — create one now (migration path)
        try {
          const workspace = workspaces.find((w) => w.id === workspaceId)
          if (workspace && workspaceProjects.length > 0) {
            const repoPath = task.worktreePath.replace(/\/\.kanbai-worktrees\/[^/]+$/, '')
            const worktreeId = task.id.slice(0, 8)
            const wtPath = task.worktreePath!
            const modifiedPaths = workspaceProjects.map((p) =>
              p.path === repoPath
                ? { path: wtPath, name: p.path.split('/').pop()! }
                : p.path,
            )
            const envResult = await window.kanbai.workspaceEnv.setup(
              workspace.name,
              modifiedPaths,
              workspaceId,
              worktreeId,
            )
            if (envResult?.success && envResult.envPath) {
              cwd = envResult.envPath
              // Persist worktreeEnvPath for future reuse
              await window.kanbai.kanban.update({ id: task.id, workspaceId, worktreeEnvPath: envResult.envPath })
              set((state) => ({
                tasks: state.tasks.map((t) =>
                  t.id === task.id ? { ...t, worktreeEnvPath: envResult.envPath } : t,
                ),
              }))
            } else {
              cwd = task.worktreePath
            }
          } else {
            cwd = task.worktreePath
          }
        } catch {
          cwd = task.worktreePath
        }
      } else {
        cwd = task.worktreePath
      }
    }

    // Re-assert after worktree try/catch — cwd cannot become null in those branches
    if (!cwd) { launchingTaskIds.delete(task.id); return }

    // Get kanban file path via IPC
    let kanbanFilePath: string
    try {
      kanbanFilePath = await window.kanbai.kanban.getPath(workspaceId)
    } catch {
      kanbanFilePath = `~/.kanbai/kanban/${workspaceId}.json`
    }

    const ticketLabel = formatTicketLabel(task)

    let prompt: string
    if (task.isCtoTicket) {
      prompt = buildCtoPrompt(task, ticketLabel, kanbanFilePath)
    } else {
      const promptParts = [
        `> **IMPORTANT — OBLIGATION DE MISE A JOUR DU TICKET**`,
        `> Tu DOIS mettre a jour le fichier kanban \`${kanbanFilePath}\` (ticket id \`${task.id}\`) a la FIN de ton travail.`,
        `> Change \`status\` a \`DONE\` (ou \`FAILED\`/\`PENDING\` selon le cas), ajoute \`result\`/\`error\`/\`question\`, et mets a jour \`updatedAt\` avec \`Date.now()\`.`,
        `> NE JAMAIS terminer sans avoir mis a jour le ticket.`,
        ``,
        `Tu travailles sur un ticket Kanban.`,
        ``,
        `## Ticket ${ticketLabel}`,
        `- **ID**: ${task.id}`,
        `- **Numero**: ${ticketLabel}`,
        `- **Titre**: ${task.title}`,
        task.description ? `- **Description**: ${task.description}` : null,
        task.originalDescription ? `- **Description originale** (avant pre-qualification): ${task.originalDescription}` : null,
        task.aiClarification ? `- **Clarification IA** (contexte supplementaire de la pre-qualification): ${task.aiClarification}` : null,
        `- **Priorite**: ${task.priority}`,
        task.targetProjectId ? `- **Scope**: Projet ${task.targetProjectId}` : `- **Scope**: Workspace entier`,
        task.splitFromId ? `- **Issu du ticket**: ${task.splitFromId} (split automatique)` : null,
      ]

      // Add attachments section if any
      if (task.attachments && task.attachments.length > 0) {
        const imageAtts = task.attachments.filter((a) => a.mimeType.startsWith('image/'))
        const otherAtts = task.attachments.filter((a) => !a.mimeType.startsWith('image/'))

        if (otherAtts.length > 0) {
          promptParts.push(``, `## Fichiers joints`, `Les fichiers suivants sont attaches a ce ticket. Lis-les pour du contexte.`)
          for (const att of otherAtts) {
            promptParts.push(`- **${att.filename}** (${att.mimeType}): \`${att.storedPath}\``)
          }
        }

        if (imageAtts.length > 0) {
          promptParts.push(``, `## Images jointes`, `Les images suivantes sont jointes a ce ticket. Utilise le tool Read sur le chemin pour les visualiser.`)
          for (const att of imageAtts) {
            promptParts.push(`- **${att.filename}**: \`${att.storedPath}\``)
          }
        }
      }

      // Detect reopening: ticket was previously completed or failed
      const isReopening = !!(task.result || task.error)

      // Add previous conversation history for context recovery
      if (task.conversationHistoryPath) {
        if (isReopening) {
          promptParts.push(
            ``,
            `## Historique de la session precedente`,
            `Ce ticket a deja ete traite dans une session precedente.`,
            `Le fichier suivant contient l'historique complet de cette conversation :`,
            `\`${task.conversationHistoryPath}\``,
            ``,
            `**IMPORTANT** : Lis ce fichier avec le tool Read pour comprendre ce qui a ete fait precedemment.`,
          )
        } else {
          promptParts.push(
            ``,
            `## Historique de la session precedente`,
            `Ce ticket a deja ete travaille dans une session precedente qui a ete interrompue.`,
            `Le fichier suivant contient l'historique complet de cette conversation :`,
            `\`${task.conversationHistoryPath}\``,
            ``,
            `**IMPORTANT** : Lis ce fichier avec le tool Read pour recuperer le contexte de ce qui a deja ete fait.`,
            `Reprends le travail la ou il s'est arrete, sans refaire ce qui a deja ete accompli.`,
          )
        }
      }

      // Add reopening context (previous result/error) for tickets being resent
      if (isReopening) {
        promptParts.push(``, `## Contexte de reouverture`)
        if (task.result) {
          promptParts.push(`### Resultat precedent`, task.result)
        }
        if (task.error) {
          promptParts.push(`### Erreur precedente`, task.error)
        }
        promptParts.push(
          ``,
          `L'utilisateur a rouvert ce ticket. Lis attentivement les commentaires ci-dessous pour comprendre ce qu'il attend de cette reprise.`,
        )
      }

      // Add user comments for context
      if (task.comments && task.comments.length > 0) {
        const commentsTitle = isReopening
          ? `## INSTRUCTIONS DE REPRISE (commentaires de l'utilisateur)`
          : `## Commentaires de l'utilisateur`
        promptParts.push(``, commentsTitle)
        for (const comment of task.comments) {
          const date = new Date(comment.createdAt).toLocaleString('fr-FR')
          promptParts.push(`- **[${date}]** : ${comment.text}`)
        }
      }

      // Check if multi-agent is enabled for the selected AI provider
      const multiAgentProjectPath = targetProject?.path ?? firstProject?.path
      if (multiAgentProjectPath) {
        try {
          const multiAgentResult = await window.kanbai.aiProvider.checkMultiAgent(provider, multiAgentProjectPath)
          if (multiAgentResult?.enabled) {
            promptParts.push(
              ``,
              `## Mode Multi-Agents`,
              `L'option multi-agents est **activee** pour le provider ${providerConfig.displayName}.`,
              `Tu DOIS utiliser les sous-agents/agents multiples pour realiser cette tache.`,
              `Decompose le travail en sous-taches et delegue-les a des agents specialises (architecture, implementation, tests, etc.).`,
              `Coordonne les agents et assure-toi que leurs contributions sont coherentes.`,
            )
          }
        } catch { /* multi-agent check is best-effort */ }
      }

      promptParts.push(
        ``,
        `## Fichier Kanban`,
        `Le fichier kanban se trouve a: ${kanbanFilePath}`,
        ``,
        `## Instructions`,
        `1. Realise la tache decrite ci-dessus dans le projet.`,
        `2. **AVANT de mettre a jour le ticket**, commit TOUS tes changements sur la branche de travail :`,
        `   - \`git add -A && git commit -m "feat(kanban): ${ticketLabel} - description courte"\``,
        `   - Ne laisse AUCUN changement non commite dans le worktree.`,
        `3. Quand tu as termine avec succes, edite le fichier \`${kanbanFilePath}\`:`,
        `   - Trouve le ticket avec l'id \`${task.id}\``,
        `   - Change son champ \`status\` de \`WORKING\` a \`DONE\``,
        `   - Ajoute un champ \`result\` avec un resume court de ce que tu as fait`,
        `   - Mets a jour \`updatedAt\` avec \`Date.now()\``,
        `4. Si tu as besoin de precisions de l'utilisateur:`,
        `   - Change le status a \`PENDING\``,
        `   - Ajoute un champ \`question\` expliquant ce que tu as besoin de savoir`,
        `5. Si tu ne peux pas realiser la tache, change le status a \`FAILED\` et ajoute un champ \`error\` expliquant pourquoi.`,
        ``,
        `---`,
        `**RAPPEL FINAL** : Ta DERNIERE action avant de terminer doit TOUJOURS etre la mise a jour du fichier kanban \`${kanbanFilePath}\` pour le ticket \`${task.id}\`. Assure-toi d'avoir commite tous tes changements AVANT. Sans cette mise a jour, ton travail ne sera pas comptabilise.`,
      )

      prompt = promptParts.filter(Boolean).join('\n')
    }

    // Write prompt to file — Claude will read it via a one-liner once initialized
    try {
      await window.kanbai.kanban.writePrompt(cwd, task.id, prompt)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to write prompt file for task:', task.id, err)
      launchingTaskIds.delete(task.id)
      return
    }

    // Determine if this task should use CTO terminal-direct mode
    // A task uses CTO mode if it is a CTO ticket itself, or if its parent is a CTO ticket
    const isCtoMode = task.isCtoTicket || isChildOfCto(task, get().tasks)

    // Launch AI CLI — CTO uses direct non-interactive mode, regular uses interactive
    const relativePromptPath = `.kanbai/.kanban-prompt-${task.id}.md`
    const isWin = navigator.platform.startsWith('Win')

    // Detect shell type to generate correct syntax (PowerShell vs cmd.exe vs bash)
    let shellType: 'powershell' | 'cmd' | 'bash' = 'bash'
    if (isWin) {
      try {
        const settings = await window.kanbai.settings.get()
        const shell = (settings.defaultShell || '').toLowerCase()
        if (shell.includes('cmd')) {
          shellType = 'cmd'
        } else if (shell.includes('bash')) {
          shellType = 'bash'
        } else {
          shellType = 'powershell'
        }
      } catch {
        shellType = 'powershell'
      }
    }

    // Build platform-specific shell fragments
    let unsetEnv: string
    let exportEnv: string
    let catCmd: string
    let recoverySuffix: string

    if (isWin && shellType === 'powershell') {
      // PowerShell syntax
      unsetEnv = providerConfig.envVarsToUnset.length > 0
        ? providerConfig.envVarsToUnset.map((v) => `Remove-Item Env:${v} -ErrorAction SilentlyContinue`).join('; ') + '; '
        : ''
      exportEnv = `$env:KANBAI_KANBAN_TASK_ID="${task.id}"; $env:KANBAI_KANBAN_FILE="${kanbanFilePath}"; $env:KANBAI_KANBAN_TICKET="${ticketLabel}"; $env:KANBAI_WORKSPACE_ID="${workspaceId}"; `
      catCmd = `Get-Content "${relativePromptPath}" | `
      recoverySuffix = '; $recoveryScript = "$env:USERPROFILE\\.kanbai\\hooks\\kanbai-terminal-recovery.ps1"; if (Test-Path $recoveryScript) { & $recoveryScript }'
    } else if (isWin && shellType === 'cmd') {
      // cmd.exe syntax
      unsetEnv = providerConfig.envVarsToUnset.length > 0
        ? providerConfig.envVarsToUnset.map((v) => `set "${v}="`).join(' & ') + ' & '
        : ''
      exportEnv = `set "KANBAI_KANBAN_TASK_ID=${task.id}" & set "KANBAI_KANBAN_FILE=${kanbanFilePath}" & set "KANBAI_KANBAN_TICKET=${ticketLabel}" & set "KANBAI_WORKSPACE_ID=${workspaceId}" & `
      catCmd = `type "${relativePromptPath}" | `
      recoverySuffix = ` & if exist "%USERPROFILE%\\.kanbai\\hooks\\kanbai-terminal-recovery.ps1" powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\\.kanbai\\hooks\\kanbai-terminal-recovery.ps1"`
    } else {
      // Bash / POSIX syntax (macOS, Linux, Git Bash on Windows)
      unsetEnv = providerConfig.envVarsToUnset.length > 0
        ? `unset ${providerConfig.envVarsToUnset.join(' ')} && `
        : ''
      exportEnv = `export KANBAI_KANBAN_TASK_ID="${task.id}" KANBAI_KANBAN_FILE="${kanbanFilePath}" KANBAI_KANBAN_TICKET="${ticketLabel}" KANBAI_WORKSPACE_ID="${workspaceId}" && `
      catCmd = `cat "${relativePromptPath}" | `
      recoverySuffix = ' ; bash "$HOME/.kanbai/hooks/kanbai-terminal-recovery.sh"'
    }

    let initialCommand: string
    if (isCtoMode) {
      // CTO mode: direct invocation, no back-and-forth — prompt piped from file
      initialCommand = `${unsetEnv}${exportEnv}${catCmd}${providerConfig.cliCommand} ${providerConfig.nonInteractiveArgs.join(' ')}${recoverySuffix}`
    } else {
      // Regular tickets: interactive mode — with fallback to kanban JSON if prompt file is missing
      const escapedPrompt = `Lis et execute les instructions du fichier ${relativePromptPath}. Si le fichier n'existe pas, lis le ticket id  dans  et realise la tache decrite. Mets a jour le ticket (status DONE/FAILED/PENDING + result/error/question + updatedAt) a la fin.`
      initialCommand = `${unsetEnv}${exportEnv}${providerConfig.cliCommand} ${providerConfig.interactiveArgs.join(' ')} "${escapedPrompt}"${recoverySuffix}`
    }

    // Create an interactive terminal tab for this task
    let tabId: string | null = null
    try {
      const termStore = useTerminalTabStore.getState()
      if (workspaceId) {
        // Auto-close oldest completed terminals to free slots when at capacity
        const workspaceTabs = termStore.tabs.filter((t) => t.workspaceId === workspaceId)
        if (workspaceTabs.length >= 10) {
          const { kanbanTabIds: currentKanbanTabIds, tasks: currentTasks } = get()
          const completedTabEntries: Array<{ tabId: string; taskId: string }> = []
          for (const [tId, tTabId] of Object.entries(currentKanbanTabIds)) {
            const t = currentTasks.find((tt) => tt.id === tId)
            if (t && (t.status === 'DONE' || t.status === 'FAILED') && workspaceTabs.some((wt) => wt.id === tTabId)) {
              completedTabEntries.push({ tabId: tTabId, taskId: tId })
            }
          }
          // Close oldest completed terminals first (by tab order in array)
          const needed = workspaceTabs.length - 9 // free at least 1 slot
          for (let i = 0; i < Math.min(needed, completedTabEntries.length); i++) {
            const entry = completedTabEntries[i]
            if (entry) termStore.closeTab(entry.tabId)
          }
        }

        const tabLabel = task.isCtoTicket ? 'CTO' : isCtoMode ? `[CTO] ${task.title}` : task.ticketNumber != null ? `[${ticketLabel}] ${task.title}` : `[${providerConfig.displayName}] ${task.title}`
        tabId = termStore.createTab(workspaceId, cwd, tabLabel, initialCommand, shouldActivate) || null
        if (tabId) {
          termStore.setTabColor(tabId, providerConfig.detectionColor)
          set((state) => ({
            kanbanTabIds: { ...state.kanbanTabIds, [task.id]: tabId! },
          }))
        }
      }
    } catch {
      // Terminal tab creation is non-blocking
    }

    // Abort if terminal could not be created (e.g. workspace limit reached)
    if (!tabId) { launchingTaskIds.delete(task.id); return }

    // Update local state to WORKING immediately (optimistic)
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, status: 'WORKING' as KanbanStatus, updatedAt: Date.now() } : t)),
    }))

    // Persist WORKING status to file
    try {
      await window.kanbai.kanban.update({
        id: task.id,
        status: 'WORKING',
        workspaceId,
      })
    } catch { /* file update is best-effort */ }
    launchingTaskIds.delete(task.id)

    // Lock the worktree to prevent deletion while the session is active
    const currentWorktreePath = task.worktreePath ?? get().tasks.find((t) => t.id === task.id)?.worktreePath
    if (currentWorktreePath && tabId) {
      window.kanbai.git.worktreeLock(currentWorktreePath, task.id, tabId).catch(() => { /* best-effort */ })
    }

    // Store prompt cwd for cleanup when the task finishes (DONE/FAILED).
    // We do NOT clean up on a timer — Claude Code can take arbitrarily long
    // to initialize, and deleting the prompt file before it's read causes the
    // AI to think it can't access the ticket.
    if (tabId) {
      const capturedCwd = cwd
      const capturedWorkspaceId = workspaceId
      set((state) => ({
        kanbanPromptCwds: { ...state.kanbanPromptCwds, [task.id]: cwd! },
      }))

      // Link the conversation JSONL file to the ticket for context recovery
      const capturedProvider = provider
      setTimeout(async () => {
        try {
          await window.kanbai.kanban.linkConversation(capturedCwd!, task.id, capturedWorkspaceId!, capturedProvider)
        } catch { /* best-effort */ }
      }, 10000)

      // Verify Claude actually started: if the tab disappeared within 20s,
      // the terminal likely crashed. Reset to TODO so it gets relaunched.
      // Only reset if the task is still WORKING (not PENDING from handleTabClosed).
      const capturedTaskId = task.id
      const capturedTabId = tabId
      setTimeout(() => {
        const termStore = useTerminalTabStore.getState()
        const tabStillExists = termStore.tabs.some((t) => t.id === capturedTabId)
        if (tabStillExists) return
        const currentTask = get().tasks.find((t) => t.id === capturedTaskId)
        if (!currentTask || currentTask.status !== 'WORKING') return
        // Tab is gone and task is still WORKING — the terminal crashed before
        // handleTabClosed could fire. Reset to TODO for relaunch.
        if (!relaunchedTaskIds.has(capturedTaskId)) {
          relaunchedTaskIds.add(capturedTaskId)
          get().updateTaskStatus(capturedTaskId, 'TODO')
        }
      }, 20000)
    }
  },

  syncBackgroundWorkspace: async (wsId: string) => {
    try {
      const newTasks: KanbanTask[] = await window.kanbai.kanban.list(wsId)
      const oldTasks = get().backgroundTasks[wsId] ?? []
      // Clear stale isPrequalifying from file (transient flag, in-memory only)
      for (const t of newTasks) {
        delete t.isPrequalifying
      }
      const { kanbanTabIds, kanbanPromptCwds } = get()

      let taskFinished = false
      const tabsToAutoClose: Array<{ tabId: string; isCto: boolean }> = []
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (!oldTask) continue
        if (oldTask.status === newTask.status) continue

        const tabId = kanbanTabIds[newTask.id]

        // Determine if this task operates in CTO mode (direct ticket or child of CTO)
        const isCtoMode = newTask.isCtoTicket || isChildOfCto(newTask, newTasks)

        // CTO auto-approve: PENDING → TODO
        if (newTask.status === 'PENDING' && isCtoMode) {
          window.kanbai.kanban.update({
            id: newTask.id,
            status: 'TODO',
            workspaceId: wsId,
          }).catch(() => { /* best-effort */ })
          newTask.status = 'TODO'
          taskFinished = true
          // Close the terminal to free the slot for the next CTO iteration
          if (tabId) {
            tabsToAutoClose.push({ tabId, isCto: true })
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
          }
          continue
        }

        // CTO cycle reset: when a CTO-mode ticket transitions from WORKING to TODO,
        // close the terminal to free the slot for the next iteration.
        if (newTask.status === 'TODO' && oldTask.status === 'WORKING' && isCtoMode) {
          taskFinished = true
          if (tabId) {
            tabsToAutoClose.push({ tabId, isCto: true })
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
          }
          continue
        }

        // Handle DONE/FAILED when tab is already closed (race: tab closed before sync detected status)
        if (!tabId) {
          if ((newTask.status === 'DONE' || newTask.status === 'FAILED') && newTask.worktreePath) {
            taskFinished = true
            relaunchedTaskIds.delete(newTask.id)
            const ticketLabel = formatTicketLabel(newTask)
            if (newTask.status === 'DONE') {
              autoMergeWorktree(newTask, wsId).catch(() => { /* best-effort */ })
            }
            const promptCwd = kanbanPromptCwds[newTask.id]
            if (promptCwd) {
              window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
            }
            const t = useI18n.getState().t
            const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ?? ''
            const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
            if (newTask.status === 'DONE') {
              const body = todoCount > 0
                ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
                : t('notifications.noMoreTickets', { ticket: ticketLabel })
              pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: wsId })
            } else {
              pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
                { workspaceId: wsId })
            }
          }
          continue
        }

        const termStore = useTerminalTabStore.getState()
        if (newTask.status === 'DONE') {
          termStore.setTabColor(tabId, '#3DD68C')
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id)
          tabsToAutoClose.push({ tabId, isCto: isCtoMode })

          // Auto-commit any uncommitted worktree changes (safety net — covered by merge handler too)
          if (newTask.worktreePath) {
            const ticketLabel = formatTicketLabel(newTask)
            window.kanbai.git.worktreeFinalize(newTask.worktreePath, ticketLabel).catch(() => { /* best-effort */ })
          }

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          // Auto-merge is deferred to handleTabClosed to avoid deleting the
          // worktree while Claude's process is still running in it.

          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          const body = todoCount > 0
            ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
            : t('notifications.noMoreTickets', { ticket: ticketLabel })
          pushNotification('success', wsName, `${ticketLabel} — ${body}`, { workspaceId: wsId, tabId })
        }
        if (newTask.status === 'FAILED') {
          termStore.setTabColor(tabId, '#F47067')
          termStore.killTabProcesses(tabId)
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id)

          // Auto-commit any uncommitted worktree changes (safety net)
          if (newTask.worktreePath) {
            const ticketLabel = formatTicketLabel(newTask)
            window.kanbai.git.worktreeFinalize(newTask.worktreePath, ticketLabel).catch(() => { /* best-effort */ })
          }

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const wsName = useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ?? ''
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          pushNotification('error', wsName, `${ticketLabel} — ${t('notifications.taskFailed', { ticket: ticketLabel })}${todoCount > 0 ? `. ${t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })}` : ''}`,
            { workspaceId: wsId, tabId })
        }
        if (newTask.status === 'PENDING') {
          termStore.setTabColor(tabId, '#fbbf24')
          termStore.setTabActivity(tabId, true)
          termStore.killTabProcesses(tabId)
        }
      }

      // Update background cache
      set((state) => ({
        backgroundTasks: { ...state.backgroundTasks, [wsId]: newTasks },
      }))

      // Pick next TODO after a task finishes (skip if workspace is paused or at concurrency limit)
      if (taskFinished) {
        const capturedTabsToClose = [...tabsToAutoClose]
        setTimeout(async () => {
          // Auto-close terminals for completed tickets based on config.
          // Merge worktrees BEFORE closing tabs so the merge hook completes
          // while the terminal process is still alive.
          if (capturedTabsToClose.length > 0) {
            try {
              const kanbanConfig = await window.kanbai.kanban.getConfig(wsId)
              const termStore = useTerminalTabStore.getState()
              const { kanbanTabIds: bgTabIds, tasks: bgTasksForClose, backgroundTasks: bgTasksMap } = get()
              const allBgTasks = bgTasksMap[wsId] ?? []
              for (const { tabId, isCto } of capturedTabsToClose) {
                const shouldClose = isCto
                  ? kanbanConfig?.autoCloseCtoTerminals
                  : kanbanConfig?.autoCloseCompletedTerminals
                if (shouldClose) {
                  // Find the task linked to this tab and merge its worktree first
                  const taskId = Object.keys(bgTabIds).find((id) => bgTabIds[id] === tabId)
                  const task = taskId
                    ? (bgTasksForClose.find((t) => t.id === taskId) ?? allBgTasks.find((t) => t.id === taskId))
                    : undefined
                  if (task?.worktreePath && task.worktreeBranch && task.status === 'DONE') {
                    try {
                      await window.kanbai.git.worktreeUnlock(task.worktreePath).catch(() => { /* best-effort */ })
                      await autoMergeWorktree(task, wsId)
                    } catch { /* best-effort — closeTab will still run */ }
                  }
                  termStore.closeTab(tabId)
                }
              }
            } catch { /* best-effort */ }
          }

          const bgTasks = get().backgroundTasks[wsId] ?? []
          const slots = await availableSlots(bgTasks, wsId)
          const remaining = bgTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
          for (let i = 0; i < slots; i++) {
            const next = pickNextTask(remaining)
            if (!next) break
            remaining.splice(remaining.indexOf(next), 1)
            get().sendToAi(next, wsId, { activate: false })
          }
        }, 1000)
      }
    } catch { /* ignore sync errors */ }
  },

  handleTabClosed: (tabId: string) => {
    const { kanbanTabIds, tasks, currentWorkspaceId, backgroundTasks } = get()
    // Find the task linked to this tab
    const taskId = Object.keys(kanbanTabIds).find((id) => kanbanTabIds[id] === tabId)
    if (!taskId) return

    // Remove the tab mapping
    const newTabIds = { ...kanbanTabIds }
    delete newTabIds[taskId]
    set({ kanbanTabIds: newTabIds })

    // Find the task across current and background workspaces
    let task = tasks.find((t) => t.id === taskId)
    let wsId = currentWorkspaceId
    if (!task) {
      for (const [bgWsId, bgTasks] of Object.entries(backgroundTasks)) {
        task = bgTasks.find((t) => t.id === taskId)
        if (task) { wsId = bgWsId; break }
      }
    }

    // Unlock the worktree session lock now that the terminal process has exited
    if (task?.worktreePath) {
      window.kanbai.git.worktreeUnlock(task.worktreePath).catch(() => { /* best-effort */ })
    }

    // Cleanup worktree if its branch has been merged (handles autoMerge disabled or manual merge)
    const cleanupMergedWorktree = (t: KanbanTask) => {
      if (!t.worktreePath || !t.worktreeBranch) return
      const repoPath = repoPathFromWorktree(t.worktreePath)
      const worktreePath = t.worktreePath
      const worktreeBranch = t.worktreeBranch
      window.kanbai.git.branchIsMerged(repoPath, worktreeBranch).then(async (merged) => {
        if (!merged) return
        await window.kanbai.git.worktreeRemove(repoPath, worktreePath, true).catch(() => { /* best-effort */ })
        await window.kanbai.git.deleteBranch(repoPath, worktreeBranch).catch(() => { /* best-effort */ })
      }).catch(() => { /* best-effort */ })
    }

    // If task is already DONE in memory, try auto-merge then cleanup any remaining worktree.
    // This may be a no-op if auto-close already merged the worktree before closing the tab.
    if (task?.worktreePath && task.worktreeBranch && task.status === 'DONE' && wsId) {
      autoMergeWorktree(task, wsId)
        .finally(() => cleanupMergedWorktree(task!))
      return
    }

    // If task was WORKING, check actual file status before setting to PENDING.
    // The agent may have already written DONE to the file — avoid overwriting it.
    if (task && task.status === 'WORKING' && wsId) {
      const capturedTask = task
      const capturedWsId = wsId
      window.kanbai.kanban.list(capturedWsId).then((fileTasks: KanbanTask[]) => {
        const fileTask = fileTasks.find((t) => t.id === taskId)
        if (fileTask && (fileTask.status === 'DONE' || fileTask.status === 'FAILED')) {
          // File says DONE/FAILED — update in-memory and trigger merge
          const currentTasks = get().tasks
          const updatedTasks = currentTasks.map((t) =>
            t.id === taskId ? { ...t, status: fileTask.status as KanbanStatus, result: fileTask.result, error: fileTask.error, updatedAt: Date.now() } : t,
          )
          set({ tasks: updatedTasks })
          if (fileTask.status === 'DONE' && capturedTask.worktreePath && capturedTask.worktreeBranch) {
            autoMergeWorktree({ ...capturedTask, status: 'DONE' }, capturedWsId)
              .finally(() => cleanupMergedWorktree(capturedTask))
          }
        } else {
          // File is not DONE — safe to set to PENDING
          const currentTasks = get().tasks
          const updatedTasks = currentTasks.map((t) =>
            t.id === taskId ? { ...t, status: 'PENDING' as KanbanStatus, updatedAt: Date.now() } : t,
          )
          set({ tasks: updatedTasks })
          window.kanbai.kanban.update({
            id: taskId,
            status: 'PENDING',
            workspaceId: capturedWsId,
          }).catch(() => { /* best-effort */ })
        }
      }).catch(() => {
        // Fallback: set to PENDING if file read fails
        const currentTasks = get().tasks
        const updatedTasks = currentTasks.map((t) =>
          t.id === taskId ? { ...t, status: 'PENDING' as KanbanStatus, updatedAt: Date.now() } : t,
        )
        set({ tasks: updatedTasks })
        if (wsId) {
          window.kanbai.kanban.update({
            id: taskId,
            status: 'PENDING',
            workspaceId: wsId,
          }).catch(() => { /* best-effort */ })
        }
      })
    } else if (task) {
      // Task not WORKING and not DONE — cleanup worktree if branch was already merged
      cleanupMergedWorktree(task)
    }
  },

  reactivateIfDone: (tabId: string, message?: string) => {
    const { kanbanTabIds } = get()
    const taskId = Object.keys(kanbanTabIds).find((id) => kanbanTabIds[id] === tabId)
    if (!taskId || reactivatingTaskIds.has(taskId)) return

    // Find the task across current and background workspaces
    const { tasks, currentWorkspaceId, backgroundTasks } = get()
    let task: KanbanTask | undefined
    let workspaceId: string | null = null

    task = tasks.find((t) => t.id === taskId)
    if (task) {
      workspaceId = currentWorkspaceId
    } else {
      for (const [wsId, wsTasks] of Object.entries(backgroundTasks)) {
        task = wsTasks.find((t) => t.id === taskId)
        if (task) {
          workspaceId = wsId
          break
        }
      }
    }

    if (!task || task.status !== 'DONE' || !workspaceId) return

    // Grace period: don't reactivate a ticket marked DONE less than 30s ago.
    // This prevents accidental reactivation when the user presses Enter
    // right after an AI agent finishes and marks the ticket as DONE.
    const REACTIVATION_GRACE_PERIOD_MS = 30_000
    if (task.updatedAt && Date.now() - task.updatedAt < REACTIVATION_GRACE_PERIOD_MS) return

    const isCurrentWorkspace = workspaceId === currentWorkspaceId

    // Create a comment from the terminal message if provided
    const commentText = message?.trim()
    let updatedComments = task.comments ?? []
    if (commentText) {
      const newComment: KanbanComment = {
        id: crypto.randomUUID(),
        text: commentText,
        createdAt: Date.now(),
      }
      updatedComments = [...updatedComments, newComment]
    }

    reactivatingTaskIds.add(taskId)
    const updateTask = (t: KanbanTask): KanbanTask =>
      t.id === taskId ? { ...t, status: 'WORKING' as KanbanStatus, comments: updatedComments, updatedAt: Date.now() } : t

    if (isCurrentWorkspace) {
      set((state) => ({ tasks: state.tasks.map(updateTask) }))
    } else {
      set((state) => ({
        backgroundTasks: {
          ...state.backgroundTasks,
          [workspaceId!]: (state.backgroundTasks[workspaceId!] ?? []).map(updateTask),
        },
      }))
    }

    // Reset tab color to provider detection color
    const termStore = useTerminalTabStore.getState()
    const providerColor = AI_PROVIDERS[task.aiProvider ?? 'claude']?.detectionColor ?? null
    termStore.setTabColor(tabId, providerColor)

    // Persist to file (include comments if a message was captured)
    window.kanbai.kanban.update({
      id: taskId,
      status: 'WORKING',
      workspaceId,
      ...(commentText ? { comments: updatedComments } : {}),
    }).then(() => {
      reactivatingTaskIds.delete(taskId)
    }).catch(() => {
      reactivatingTaskIds.delete(taskId)
    })
  },

  attachFiles: async (taskId: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    const filePaths = await window.kanbai.kanban.selectFiles()
    if (!filePaths || filePaths.length === 0) return

    for (const filePath of filePaths) {
      const attachment = await window.kanbai.kanban.attachFile(taskId, currentWorkspaceId, filePath)
      set((state) => ({
        tasks: state.tasks.map((t) => {
          if (t.id !== taskId) return t
          return { ...t, attachments: [...(t.attachments || []), attachment], updatedAt: Date.now() }
        }),
      }))
    }
  },

  attachFromClipboard: async (taskId: string, dataBase64: string, filename: string, mimeType: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    const attachment = await window.kanbai.kanban.attachFromClipboard(taskId, currentWorkspaceId, dataBase64, filename, mimeType)
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t
        return { ...t, attachments: [...(t.attachments || []), attachment], updatedAt: Date.now() }
      }),
    }))
  },

  removeAttachment: async (taskId: string, attachmentId: string) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    await window.kanbai.kanban.removeAttachment(taskId, currentWorkspaceId, attachmentId)
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t
        return {
          ...t,
          attachments: (t.attachments || []).filter((a) => a.id !== attachmentId),
          updatedAt: Date.now(),
        }
      }),
    }))
  },

  acceptSplit: async (taskId: string) => {
    const { currentWorkspaceId, tasks } = get()
    if (!currentWorkspaceId) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task?.splitSuggestions?.length) return

    // Create child tickets from split suggestions
    for (const suggestion of task.splitSuggestions) {
      await window.kanbai.kanban.create({
        workspaceId: currentWorkspaceId,
        targetProjectId: task.targetProjectId,
        title: suggestion.title,
        description: suggestion.description,
        status: 'TODO',
        priority: suggestion.priority,
        type: suggestion.type,
      })
    }

    // Delete the original task
    await window.kanbai.kanban.delete(taskId, currentWorkspaceId)

    // Reload tasks from file to get the new tickets
    const newTasks: KanbanTask[] = await window.kanbai.kanban.list(currentWorkspaceId)
    for (const t of newTasks) {
      delete t.isPrequalifying
    }
    set({ tasks: newTasks })

    // Auto-send if under concurrency limit (skip if paused)
    const slots = await availableSlots(newTasks, currentWorkspaceId)
    const remaining = newTasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
    for (let i = 0; i < slots; i++) {
      const next = pickNextTask(remaining)
      if (!next) break
      remaining.splice(remaining.indexOf(next), 1)
      get().sendToAi(next, currentWorkspaceId, { activate: false })
    }
  },

  dismissSplit: (taskId: string) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, splitSuggestions: undefined } : t,
      ),
    }))
  },

  applyCompanionUpdate: (task: KanbanTask) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
    }))
  },
}))
