import { useCallback, useMemo } from 'react'
import { useClaudeStore } from './claude-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

export function useClaude() {
  const {
    sessions,
    sessionHistory,
    flashingSessionId,
    flashingWorkspaceId,
    workspaceClaudeStatus,
    startSession,
    stopSession,
    refreshSessions,
    getSessionsForProject,
    getSessionHistory,
  } = useClaudeStore()

  const { activeProjectId, projects } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  const projectSessions = useMemo(
    () => (activeProject ? sessions.filter((s) => s.projectId === activeProject.id) : []),
    [sessions, activeProject],
  )

  const hasActiveSessions = projectSessions.some((s) => s.status === 'running')

  const startProjectSession = useCallback(
    async (prompt?: string, loopMode?: boolean, loopDelay?: number) => {
      if (!activeProject) return null
      return startSession(
        activeProject.id,
        activeProject.path,
        `claude-${activeProject.id}-${Date.now()}`,
        prompt,
        loopMode,
        loopDelay,
      )
    },
    [activeProject, startSession],
  )

  return {
    sessions,
    sessionHistory,
    projectSessions,
    hasActiveSessions,
    flashingSessionId,
    flashingWorkspaceId,
    workspaceClaudeStatus,
    activeProject,
    startSession: startProjectSession,
    stopSession,
    refreshSessions,
    getSessionsForProject,
    getSessionHistory,
  }
}
