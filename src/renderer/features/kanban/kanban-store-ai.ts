import type { KanbanTask, KanbanStatus } from '../../../shared/types/index'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import { resolveFeatureProvider } from '../../../shared/utils/ai-provider-resolver'
import type { Get, Set } from './kanban-store-types'
import { useTerminalTabStore } from '../terminal'
import { useWorkspaceStore } from '../workspace/workspace-store'
import {
  formatTicketLabel, isChildOfCto, launchingTaskIds, relaunchedTaskIds,
} from './kanban-store-utils'
import { buildCtoPrompt, buildRegularPrompt, buildShellCommand, detectShellType } from './kanban-store-cto'

export function createSendToAi(get: Get, set: Set) {
  return async (task: KanbanTask, explicitWorkspaceId?: string, options?: { activate?: boolean }) => {
    const shouldActivate = options?.activate ?? true
    if (task.disabled) return
    if (launchingTaskIds.has(task.id)) return
    const workspaceId = explicitWorkspaceId ?? task.workspaceId ?? get().currentWorkspaceId
    if (!workspaceId) return
    launchingTaskIds.add(task.id)

    // If a tab already exists for this task, try to continue the conversation in it
    const { kanbanTabIds } = get()
    const existingTabId = kanbanTabIds[task.id]
    let reuseTabId: string | null = null
    let reuseSessionId: string | null = null
    if (existingTabId) {
      const termStore = useTerminalTabStore.getState()
      const tab = termStore.tabs.find((t) => t.id === existingTabId)
      if (tab) {
        // Get the first session ID from the pane tree
        const sessionId = tab.paneTree.type === 'leaf'
          ? tab.paneTree.sessionId
          : null // Split panes: fall through to create new tab
        if (sessionId) {
          try {
            const isBusy = await window.kanbai.terminal.checkBusy(sessionId)
            if (isBusy) {
              // Claude is still running — type the user's latest comment directly
              if (shouldActivate) termStore.setActiveTab(existingTabId)
              const latestComment = task.comments?.[task.comments.length - 1]?.text
              if (latestComment) {
                window.kanbai.terminal.write(sessionId, latestComment + '\r')
              }
              launchingTaskIds.delete(task.id)
              return
            }
            // Claude has exited — mark for reuse so we relaunch in the same terminal
            reuseTabId = existingTabId
            reuseSessionId = sessionId
          } catch {
            // checkBusy failed — fall through to reuse as idle
            reuseTabId = existingTabId
            reuseSessionId = sessionId
          }
        } else if (!sessionId && tab.paneTree.type === 'leaf') {
          // Tab exists but session was killed (e.g. PENDING) — close the dead tab and create a new one
          termStore.closeTab(existingTabId)
          const newTabIds = { ...get().kanbanTabIds }
          delete newTabIds[task.id]
          set({ kanbanTabIds: newTabIds })
        } else {
          // Split pane — just activate the existing tab
          if (shouldActivate) termStore.setActiveTab(existingTabId)
          launchingTaskIds.delete(task.id)
          return
        }
      } else {
        // Tab was closed — remove stale mapping and proceed to create a new one
        const newTabIds = { ...get().kanbanTabIds }
        delete newTabIds[task.id]
        set({ kanbanTabIds: newTabIds })
      }
    }

    // Determine AI provider first — it affects cwd strategy
    // Priority: ticket → target project kanban default → target project provider → workspace project kanban default → workspace provider → 'claude'
    const { projects, workspaces } = useWorkspaceStore.getState()
    const targetProject = task.targetProjectId ? projects.find((p) => p.id === task.targetProjectId) : undefined
    const workspaceProjects = projects.filter((p) => p.workspaceId === workspaceId)
    const firstProject = workspaceProjects[0]
    const workspace = workspaces.find((w) => w.id === workspaceId)
    const effectiveProject = targetProject ?? firstProject
    const provider: AiProviderId = task.aiProvider ?? resolveFeatureProvider('kanban', effectiveProject, workspace)
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

    const prompt = task.isCtoTicket
      ? buildCtoPrompt(task, ticketLabel, kanbanFilePath)
      : await buildRegularPrompt({
          task,
          ticketLabel,
          kanbanFilePath,
          provider,
          providerDisplayName: providerConfig.displayName,
          targetProjectPath: targetProject?.path,
          firstProjectPath: firstProject?.path,
        })

    // Write prompt to file — Claude will read it via a one-liner once initialized
    try {
      await window.kanbai.kanban.writePrompt(cwd, task.id, prompt)
    } catch (err) {
      console.error('Failed to write prompt file for task:', task.id, err)
      launchingTaskIds.delete(task.id)
      return
    }

    // Determine if this task should use CTO terminal-direct mode
    // A task uses CTO mode if it is a CTO ticket itself, or if its parent is a CTO ticket
    const isCtoMode = task.isCtoTicket || isChildOfCto(task, get().tasks)

    // Build the shell command to launch the AI CLI
    const relativePromptPath = `.kanbai/.kanban-prompt-${task.id}.md`
    const isWin = navigator.platform.startsWith('Win')
    const shellType = await detectShellType()
    const initialCommand = buildShellCommand({
      taskId: task.id,
      kanbanFilePath,
      ticketLabel,
      workspaceId,
      isCtoMode,
      providerConfig,
      relativePromptPath,
      shellType,
      isWin,
    })

    // Create an interactive terminal tab for this task, or reuse an existing one
    let tabId: string | null = null
    try {
      const termStore = useTerminalTabStore.getState()
      if (workspaceId) {
        if (reuseTabId && reuseSessionId) {
          // Reuse existing terminal — Claude has exited, relaunch in same tab
          tabId = reuseTabId
          if (shouldActivate) termStore.setActiveTab(reuseTabId)
          // Send the new launch command to the existing terminal
          window.kanbai.terminal.write(reuseSessionId, initialCommand + '\r')
        } else {
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
          // Inform main process of the task-terminal link for companion API
          window.kanbai.terminal.setTaskInfo(tabId, task.id, ticketLabel)
        }
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
  }
}
