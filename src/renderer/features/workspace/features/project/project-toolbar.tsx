import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../../workspace-store'
import { useTerminalTabStore, type PaneNode, type PaneLeaf } from '../../../../lib/stores/terminalTabStore'
import type { ProjectInfo } from '../../../../../shared/types'

/** Check if a pane's initial command is an AI tool (claude, codex, copilot, etc.) */
function isAiPane(leaf: PaneLeaf): boolean {
  const cmd = leaf.initialCommand
  if (!cmd) return false
  return cmd === 'claude' || cmd.includes('claude ') || cmd === 'codex' || cmd.includes('codex ') || cmd === 'copilot' || cmd.includes('copilot ')
}

/** Collect all non-AI leaf panes with their session IDs from a pane tree */
function collectNonAiLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === 'leaf') {
    return !isAiPane(node) && node.componentType !== 'pixel-agents' ? [node] : []
  }
  return [...collectNonAiLeaves(node.children[0]), ...collectNonAiLeaves(node.children[1])]
}

interface ProjectMakeInfo {
  projectId: string
  projectName: string
  projectPath: string
  gitBranch: string | null
  targets: string[]
}

/** Attachment: which terminal session a Makefile button is bound to */
interface MakeAttachment {
  sessionId: string
  tabId: string
  paneId: string
}

/** Unique key for a Makefile button */
function attachmentKey(projectPath: string, target: string): string {
  return `${projectPath}::${target}`
}

export function ProjectToolbar() {
  const { activeWorkspaceId, projects } = useWorkspaceStore()
  const { tabs, createTab, setActiveTab, renameTab } = useTerminalTabStore()
  const [projectInfos, setProjectInfos] = useState<ProjectMakeInfo[]>([])
  const attachmentsRef = useRef<Map<string, MakeAttachment>>(new Map())

  const workspaceProjects = projects.filter((p) => p.workspaceId === activeWorkspaceId)
  const workspaceProjectPaths = useMemo(() => workspaceProjects.map((p) => p.path).join(','), [workspaceProjects])

  useEffect(() => {
    if (workspaceProjects.length === 0) {
      setProjectInfos([])
      return
    }
    Promise.all(
      workspaceProjects.map(async (proj) => {
        try {
          const info: ProjectInfo = await window.kanbai.project.scanInfo(proj.path)
          const targets = info.hasMakefile
            ? info.makeTargets.filter((t) => !t.startsWith('_') && t !== '.PHONY')
            : []
          return {
            projectId: proj.id,
            projectName: proj.name,
            projectPath: proj.path,
            gitBranch: info.gitBranch,
            targets,
          } as ProjectMakeInfo
        } catch {
          return null
        }
      }),
    ).then((results) => {
      setProjectInfos(results.filter((r): r is ProjectMakeInfo => r !== null && r.targets.length > 0))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceProjectPaths])

  /** Check if an attachment is still valid (tab+pane+session still exist) */
  const isAttachmentValid = useCallback(
    (att: MakeAttachment): boolean => {
      const tab = tabs.find((t) => t.id === att.tabId)
      if (!tab) return false
      const leaves = collectNonAiLeaves(tab.paneTree)
      return leaves.some((l) => l.id === att.paneId && l.sessionId === att.sessionId)
    },
    [tabs],
  )

  /** Find a free (non-busy) non-AI terminal in the current workspace */
  const findFreeTerminal = useCallback(
    async (): Promise<{ tabId: string; paneId: string; sessionId: string } | null> => {
      const workspaceTabs = tabs.filter((t) => t.workspaceId === activeWorkspaceId)
      for (const tab of workspaceTabs) {
        const leaves = collectNonAiLeaves(tab.paneTree)
        for (const leaf of leaves) {
          if (!leaf.sessionId) continue
          try {
            const busy = await window.kanbai.terminal.checkBusy(leaf.sessionId)
            if (!busy) {
              return { tabId: tab.id, paneId: leaf.id, sessionId: leaf.sessionId }
            }
          } catch {
            // Terminal might be gone, skip
          }
        }
      }
      return null
    },
    [tabs, activeWorkspaceId],
  )

  /** Build the make command string */
  const buildMakeCommand = useCallback((projectPath: string, target: string): string => {
    const escapedPath = projectPath.replace(/'/g, "'\\''")
    return `cd '${escapedPath}' && make ${target}\n`
  }, [])

  /** Send Ctrl+C to interrupt the running process, then run new command */
  const interruptAndRun = useCallback(
    (sessionId: string, command: string) => {
      // Send Ctrl+C to interrupt current process
      window.kanbai.terminal.write(sessionId, '\x03')
      // Small delay to let the shell process the interrupt
      setTimeout(() => {
        window.kanbai.terminal.write(sessionId, command)
      }, 100)
    },
    [],
  )

  const runMakeTarget = useCallback(
    async (projectName: string, projectPath: string, target: string) => {
      if (!activeWorkspaceId) return

      const key = attachmentKey(projectPath, target)
      const command = buildMakeCommand(projectPath, target)
      const tabLabel = `${projectName} - ${target}`
      const existing = attachmentsRef.current.get(key)

      // Case 2: Button already attached to a terminal
      if (existing && isAttachmentValid(existing)) {
        const busy = await window.kanbai.terminal.checkBusy(existing.sessionId).catch(() => false)
        if (busy) {
          // Kill running process and re-run
          interruptAndRun(existing.sessionId, command)
        } else {
          // Terminal is idle, just run the command
          window.kanbai.terminal.write(existing.sessionId, command)
        }
        setActiveTab(existing.tabId)
        return
      }

      // Case 1: Find a free non-AI terminal
      const free = await findFreeTerminal()
      if (free) {
        attachmentsRef.current.set(key, free)
        renameTab(free.tabId, tabLabel)
        window.kanbai.terminal.write(free.sessionId, command)
        setActiveTab(free.tabId)
        return
      }

      // Case 3: No terminal available — create a new tab
      const cwd = projectPath
      const newTabId = createTab(activeWorkspaceId, cwd, tabLabel)
      if (!newTabId) return

      // Wait for the terminal to be initialized (session ID gets set asynchronously)
      const waitForSession = (): Promise<MakeAttachment | null> => {
        return new Promise((resolve) => {
          let attempts = 0
          const check = () => {
            attempts++
            const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === newTabId)
            if (!tab) {
              resolve(null)
              return
            }
            const leaves = collectNonAiLeaves(tab.paneTree)
            const leaf = leaves[0]
            if (leaf?.sessionId) {
              resolve({ sessionId: leaf.sessionId, tabId: newTabId, paneId: leaf.id })
              return
            }
            if (attempts > 50) {
              resolve(null)
              return
            }
            setTimeout(check, 100)
          }
          check()
        })
      }

      const att = await waitForSession()
      if (att) {
        attachmentsRef.current.set(key, att)
        window.kanbai.terminal.write(att.sessionId, command)
      }
    },
    [activeWorkspaceId, tabs, buildMakeCommand, isAttachmentValid, findFreeTerminal, interruptAndRun, setActiveTab, createTab, renameTab],
  )

  /** Check if a button has an active attachment */
  const getAttachmentStatus = useCallback(
    (projectPath: string, target: string): boolean => {
      const key = attachmentKey(projectPath, target)
      const att = attachmentsRef.current.get(key)
      return att ? isAttachmentValid(att) : false
    },
    [isAttachmentValid],
  )

  if (projectInfos.length === 0) return null

  return (
    <div className="project-toolbar">
      {projectInfos.map((pi) => (
        <div key={pi.projectId} className="project-toolbar-group">
          <span className="project-toolbar-group-label">
            {pi.projectName}
            {pi.gitBranch && <span className="project-toolbar-branch"> ({pi.gitBranch})</span>}
          </span>
          <div className="project-toolbar-make">
            {pi.targets.map((target) => {
              const attached = getAttachmentStatus(pi.projectPath, target)
              return (
                <button
                  key={target}
                  className={`project-toolbar-btn${attached ? ' project-toolbar-btn--attached' : ''}`}
                  onClick={() => runMakeTarget(pi.projectName, pi.projectPath, target)}
                  title={`make ${target} (${pi.projectName})${attached ? ' — attached' : ''}`}
                >
                  {target}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
