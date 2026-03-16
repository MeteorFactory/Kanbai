import { useEffect, useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useTerminalTabStore, type PaneNode } from '../features/terminal'
import type { ProjectInfo } from '../../shared/types'

/** Find a terminal pane session (never Claude). Prefers active pane if it's not Claude. */
function findTerminalSession(tree: PaneNode, activePaneId: string): string | null {
  // First try: active pane if it's not Claude
  const activeLeaf = findLeaf(tree, activePaneId)
  if (activeLeaf && activeLeaf.initialCommand !== 'claude' && activeLeaf.sessionId) {
    return activeLeaf.sessionId
  }
  // Fallback: any non-Claude pane
  return findNonClaudeSession(tree)
}

function findLeaf(tree: PaneNode, paneId: string): PaneNode & { type: 'leaf' } | null {
  if (tree.type === 'leaf') return tree.id === paneId ? tree : null
  return findLeaf(tree.children[0], paneId) || findLeaf(tree.children[1], paneId)
}

function findNonClaudeSession(tree: PaneNode): string | null {
  if (tree.type === 'leaf') {
    return tree.initialCommand !== 'claude' ? tree.sessionId : null
  }
  return findNonClaudeSession(tree.children[0]) || findNonClaudeSession(tree.children[1])
}

interface ProjectMakeInfo {
  projectId: string
  projectName: string
  projectPath: string
  gitBranch: string | null
  targets: string[]
}

export function ProjectToolbar() {
  const { activeWorkspaceId, projects } = useWorkspaceStore()
  const { tabs, activeTabId } = useTerminalTabStore()
  const [projectInfos, setProjectInfos] = useState<ProjectMakeInfo[]>([])

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

  const runMakeTarget = useCallback(
    (projectPath: string, target: string) => {
      if (!activeTabId) return
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!tab) return

      const sessionId = findTerminalSession(tab.paneTree, tab.activePaneId)
      if (sessionId) {
        const escapedPath = projectPath.replace(/'/g, "'\\''")
        window.kanbai.terminal.write(sessionId, `cd '${escapedPath}' && make ${target}\n`)
      }
    },
    [activeTabId, tabs],
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
            {pi.targets.map((target) => (
              <button
                key={target}
                className="project-toolbar-btn"
                onClick={() => runMakeTarget(pi.projectPath, target)}
                title={`make ${target} (${pi.projectName})`}
              >
                {target}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
