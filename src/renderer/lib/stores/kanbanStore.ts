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

export function pickNextTask(tasks: KanbanTask[]): KanbanTask | null {
  const todo = tasks.filter((t) => t.status === 'TODO' && !t.disabled && !t.isPrequalifying)
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
  sendToAi: (task: KanbanTask, explicitWorkspaceId?: string) => Promise<void>
  syncBackgroundWorkspace: (workspaceId: string) => Promise<void>
  attachFiles: (taskId: string) => Promise<void>
  attachFromClipboard: (taskId: string, dataBase64: string, filename: string, mimeType: string) => Promise<void>
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>
  handleTabClosed: (tabId: string) => void
  reactivateIfDone: (tabId: string, message?: string) => void
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

      // Startup-only cleanup: close stale terminals linked to DONE tickets.
      if (!get().startupDoneCleanupPerformed) {
        set({ startupDoneCleanupPerformed: true })
        const { kanbanTabIds: staleTabIds } = get()
        const closedTabIds: string[] = []
        for (const [taskId, tabId] of Object.entries(staleTabIds)) {
          const task = tasks.find((t) => t.id === taskId)
          if (task && task.status === 'DONE') {
            closedTabIds.push(tabId)
          }
        }
        if (closedTabIds.length > 0) {
          const termStore = useTerminalTabStore.getState()
          for (const tabId of closedTabIds) {
            termStore.closeTab(tabId)
          }
        }
      }

      // One-at-a-time scheduling: resume a WORKING without terminal, or pick next TODO
      const capturedWorkspaceId = workspaceId
      setTimeout(() => {
        // Guard against stale callbacks after workspace switch
        if (get().currentWorkspaceId !== capturedWorkspaceId) return

        const { kanbanTabIds } = get()

        // 1. Resume a WORKING task that lost its terminal (only one)
        const workingWithoutTerminal = tasks.find(
          (t) => t.status === 'WORKING' && !kanbanTabIds[t.id],
        )
        if (workingWithoutTerminal) {
          get().sendToAi(workingWithoutTerminal)
          return
        }

        // 2. If no WORKING task at all, pick the next TODO by priority
        const hasWorking = tasks.some((t) => t.status === 'WORKING')
        if (!hasWorking) {
          const next = pickNextTask(tasks)
          if (next) get().sendToAi(next)
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
      // Preserve in-memory isPrequalifying flag (not persisted to file)
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id)
        if (oldTask?.isPrequalifying) {
          newTask.isPrequalifying = true
        } else {
          delete newTask.isPrequalifying
        }
      }

      let taskFinished = false

      // Detect status transitions for all tasks
      const tasksToLaunch: KanbanTask[] = []
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
          continue
        }

        if (!tabId) continue

        const termStore = useTerminalTabStore.getState()
        if (newTask.status === 'DONE') {
          termStore.setTabColor(tabId, '#a6e3a1')
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
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          const body = todoCount > 0
            ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
            : t('notifications.noMoreTickets', { ticket: ticketLabel })
          pushNotification('success', newTask.title, body, { workspaceId: currentWorkspaceId!, tabId })
        }
        if (newTask.status === 'FAILED') {
          termStore.setTabColor(tabId, '#f38ba8')
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
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          pushNotification('error', t('notifications.taskFailed', { ticket: ticketLabel }),
            todoCount > 0
              ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
              : t('notifications.noMoreTickets', { ticket: ticketLabel }),
            { workspaceId: currentWorkspaceId!, tabId })
        }
        if (newTask.status === 'PENDING') {
          termStore.setTabColor(tabId, '#f9e2af')
          termStore.setTabActivity(tabId, true)
          // PENDING does NOT trigger next task — the task is still "in progress"
        }
      }

      set({ tasks: newTasks })

      // Launch Claude terminals for tasks manually moved to WORKING
      for (const task of tasksToLaunch) {
        get().sendToAi(task)
      }

      // After a task finishes (DONE/FAILED), pick the next one with a delay
      if (taskFinished) {
        const hasWorking = newTasks.some((t) => t.status === 'WORKING')
        if (!hasWorking) {
          setTimeout(() => {
            const currentTasks = get().tasks
            const next = pickNextTask(currentTasks)
            if (next) get().sendToAi(next)
          }, 1000)
        }
      }
    } catch { /* ignore sync errors */ }
  },

  createTask: async (workspaceId, title, description, priority, type?, targetProjectId?, isCtoTicket?, aiProvider?) => {
    // Check if prequalification is enabled (per-workspace config)
    let prequalifyEnabled = false
    try {
      const kanbanConfig = await window.kanbai.kanban.getConfig(workspaceId)
      prequalifyEnabled = kanbanConfig?.autoPrequalifyTickets === true
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
        const result = await window.kanbai.kanban.prequalify({ title, description })
        const updates: Partial<KanbanTask> = {}
        if (result) {
          if (result.suggestedType && result.suggestedType !== (type ?? 'feature')) {
            updates.type = result.suggestedType as KanbanTaskType
          }
          if (result.suggestedPriority && result.suggestedPriority !== priority) {
            updates.priority = result.suggestedPriority as KanbanTask['priority']
          }
          if (result.clarifiedDescription && result.clarifiedDescription !== description) {
            updates.description = result.clarifiedDescription
          }
        }
        if (Object.keys(updates).length > 0) {
          await window.kanbai.kanban.update({ id: task.id, ...updates, workspaceId })
        }
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...updates, isPrequalifying: false } : t)),
        }))

        // After prequalification finishes, try to auto-send if no WORKING task
        const hasWorking = get().tasks.some((t) => t.status === 'WORKING')
        if (!hasWorking) {
          const next = pickNextTask(get().tasks)
          if (next) get().sendToAi(next)
        }
      } catch {
        // On failure, clear prequalifying flag so the task becomes sendable
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, isPrequalifying: false } : t)),
        }))
        // Still try to auto-send on failure
        const hasWorking = get().tasks.some((t) => t.status === 'WORKING')
        if (!hasWorking) {
          const next = pickNextTask(get().tasks)
          if (next) get().sendToAi(next)
        }
      }
    })()
    } else {
      // No prequalification — auto-send immediately
      const hasWorking = get().tasks.some((t) => t.status === 'WORKING')
      if (!hasWorking) {
        const next = pickNextTask(get().tasks)
        if (next) get().sendToAi(next)
      }
    }
  },

  updateTaskStatus: async (taskId, status) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    await window.kanbai.kanban.update({ id: taskId, status, workspaceId: currentWorkspaceId })
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t)),
    }))
  },

  updateTask: async (taskId, data) => {
    const { currentWorkspaceId } = get()
    if (!currentWorkspaceId) return
    await window.kanbai.kanban.update({ id: taskId, ...data, workspaceId: currentWorkspaceId })
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
    })
    set((state) => ({ tasks: [...state.tasks, newTask] }))
  },

  setDragged: (taskId) => set({ draggedTaskId: taskId }),

  getTasksByStatus: (status) => {
    return get().tasks.filter((t) => t.status === status)
  },

  sendToAi: async (task: KanbanTask, explicitWorkspaceId?: string) => {
    if (task.disabled) return
    const workspaceId = explicitWorkspaceId ?? get().currentWorkspaceId
    if (!workspaceId) return

    // If a tab already exists for this task, activate it instead of recreating
    const { kanbanTabIds } = get()
    const existingTabId = kanbanTabIds[task.id]
    if (existingTabId) {
      const termStore = useTerminalTabStore.getState()
      const tab = termStore.tabs.find((t) => t.id === existingTabId)
      if (tab) {
        termStore.setActiveTab(existingTabId)
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
      // Claude can navigate the workspace env (meta-directory with symlinks).
      // Other providers (Codex) need a real project path to work correctly.
      if (provider === 'claude') {
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
      }
      if (!cwd) {
        cwd = workspaceProjects[0]?.path ?? null
      }
    }
    if (!cwd) return

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
        `- **Priorite**: ${task.priority}`,
        task.targetProjectId ? `- **Scope**: Projet ${task.targetProjectId}` : `- **Scope**: Workspace entier`,
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

      promptParts.push(
        ``,
        `## Fichier Kanban`,
        `Le fichier kanban se trouve a: ${kanbanFilePath}`,
        ``,
        `## Instructions`,
        `1. Realise la tache decrite ci-dessus dans le projet.`,
        `2. Quand tu as termine avec succes, edite le fichier \`${kanbanFilePath}\`:`,
        `   - Trouve le ticket avec l'id \`${task.id}\``,
        `   - Change son champ \`status\` de \`WORKING\` a \`DONE\``,
        `   - Ajoute un champ \`result\` avec un resume court de ce que tu as fait`,
        `   - Mets a jour \`updatedAt\` avec \`Date.now()\``,
        `3. Si tu as besoin de precisions de l'utilisateur:`,
        `   - Change le status a \`PENDING\``,
        `   - Ajoute un champ \`question\` expliquant ce que tu as besoin de savoir`,
        `4. Si tu ne peux pas realiser la tache, change le status a \`FAILED\` et ajoute un champ \`error\` expliquant pourquoi.`,
        ``,
        `---`,
        `**RAPPEL FINAL** : Ta DERNIERE action avant de terminer doit TOUJOURS etre la mise a jour du fichier kanban \`${kanbanFilePath}\` pour le ticket \`${task.id}\`. Sans cette mise a jour, ton travail ne sera pas comptabilise.`,
      )

      prompt = promptParts.filter(Boolean).join('\n')
    }

    // Write prompt to file — Claude will read it via a one-liner once initialized
    try {
      await window.kanbai.kanban.writePrompt(cwd, task.id, prompt)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to write prompt file for task:', task.id, err)
      return
    }

    // Determine if this task should use CTO terminal-direct mode
    // A task uses CTO mode if it is a CTO ticket itself, or if its parent is a CTO ticket
    const isCtoMode = task.isCtoTicket || isChildOfCto(task, get().tasks)

    // Launch AI CLI — CTO uses direct non-interactive mode, regular uses interactive
    const relativePromptPath = `.kanbai/.kanban-prompt-${task.id}.md`
    const unsetEnv = providerConfig.envVarsToUnset.length > 0
      ? `unset ${providerConfig.envVarsToUnset.join(' ')} && `
      : ''
    const exportEnv = `export KANBAI_KANBAN_TASK_ID="${task.id}" KANBAI_KANBAN_FILE="${kanbanFilePath}" KANBAI_KANBAN_TICKET="${ticketLabel}" KANBAI_WORKSPACE_ID="${workspaceId}" && `
    let initialCommand: string
    if (isCtoMode) {
      // CTO mode: direct invocation, no back-and-forth — prompt piped from file
      initialCommand = `${unsetEnv}${exportEnv}cat "${relativePromptPath}" | ${providerConfig.cliCommand} ${providerConfig.nonInteractiveArgs.join(' ')} ; bash "$HOME/.kanbai/hooks/kanbai-terminal-recovery.sh"`
    } else {
      // Regular tickets: interactive mode — with fallback to kanban JSON if prompt file is missing
      const escapedPrompt = `Lis et execute les instructions du fichier ${relativePromptPath}. Si le fichier n'existe pas, lis le ticket id \`${task.id}\` dans \`${kanbanFilePath}\` et realise la tache decrite. Mets a jour le ticket (status DONE/FAILED/PENDING + result/error/question + updatedAt) a la fin.`
      initialCommand = `${unsetEnv}${exportEnv}${providerConfig.cliCommand} ${providerConfig.interactiveArgs.join(' ')} "${escapedPrompt}" ; bash "$HOME/.kanbai/hooks/kanbai-terminal-recovery.sh"`
    }

    // Create an interactive terminal tab for this task
    let tabId: string | null = null
    try {
      const termStore = useTerminalTabStore.getState()
      if (workspaceId) {
        const tabLabel = task.isCtoTicket ? 'CTO' : isCtoMode ? `[CTO] ${task.title}` : task.ticketNumber != null ? `[${ticketLabel}] ${task.title}` : `[${providerConfig.displayName}] ${task.title}`
        tabId = termStore.createTab(workspaceId, cwd, tabLabel, initialCommand) || null
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
    if (!tabId) return

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
      setTimeout(async () => {
        try {
          await window.kanbai.kanban.linkConversation(capturedCwd!, task.id, capturedWorkspaceId!)
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
          continue
        }

        if (!tabId) continue

        const termStore = useTerminalTabStore.getState()
        if (newTask.status === 'DONE') {
          termStore.setTabColor(tabId, '#a6e3a1')
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id)

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          const body = todoCount > 0
            ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
            : t('notifications.noMoreTickets', { ticket: ticketLabel })
          pushNotification('success', newTask.title, body, { workspaceId: wsId, tabId })
        }
        if (newTask.status === 'FAILED') {
          termStore.setTabColor(tabId, '#f38ba8')
          taskFinished = true
          relaunchedTaskIds.delete(newTask.id)

          // Clean up prompt file now that the task is finished
          const promptCwd = kanbanPromptCwds[newTask.id]
          if (promptCwd) {
            window.kanbai.kanban.cleanupPrompt(promptCwd, newTask.id).catch(() => { /* best-effort */ })
          }

          const t = useI18n.getState().t
          const ticketLabel = formatTicketLabel(newTask)
          const todoCount = newTasks.filter((tt) => tt.status === 'TODO' && !tt.disabled).length
          pushNotification('error', t('notifications.taskFailed', { ticket: ticketLabel }),
            todoCount > 0
              ? t('notifications.ticketsRemaining', { ticket: ticketLabel, count: todoCount })
              : t('notifications.noMoreTickets', { ticket: ticketLabel }),
            { workspaceId: wsId, tabId })
        }
        if (newTask.status === 'PENDING') {
          termStore.setTabColor(tabId, '#f9e2af')
          termStore.setTabActivity(tabId, true)
        }
      }

      // Update background cache
      set((state) => ({
        backgroundTasks: { ...state.backgroundTasks, [wsId]: newTasks },
      }))

      // Pick next TODO after a task finishes
      if (taskFinished) {
        const hasWorking = newTasks.some((t) => t.status === 'WORKING')
        if (!hasWorking) {
          setTimeout(() => {
            const bgTasks = get().backgroundTasks[wsId] ?? []
            const next = pickNextTask(bgTasks)
            if (next) get().sendToAi(next, wsId)
          }, 1000)
        }
      }
    } catch { /* ignore sync errors */ }
  },

  handleTabClosed: (tabId: string) => {
    const { kanbanTabIds, tasks, currentWorkspaceId } = get()
    // Find the task linked to this tab
    const taskId = Object.keys(kanbanTabIds).find((id) => kanbanTabIds[id] === tabId)
    if (!taskId) return

    // Remove the tab mapping
    const newTabIds = { ...kanbanTabIds }
    delete newTabIds[taskId]
    set({ kanbanTabIds: newTabIds })

    // If task was WORKING, set it to PENDING
    const task = tasks.find((t) => t.id === taskId)
    if (task && task.status === 'WORKING' && currentWorkspaceId) {
      const updatedTasks = tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'PENDING' as KanbanStatus, updatedAt: Date.now() } : t,
      )
      set({ tasks: updatedTasks })
      // Persist to file
      window.kanbai.kanban.update({
        id: taskId,
        status: 'PENDING',
        workspaceId: currentWorkspaceId,
      }).catch(() => { /* best-effort */ })
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
}))
