import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

/**
 * Convenience hook for git feature.
 * Returns commonly used workspace state relevant to git operations.
 */
export function useGit() {
  const {
    activeWorkspaceId,
    activeProjectId,
    projects,
  } = useWorkspaceStore()

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  return {
    activeWorkspaceId,
    activeProjectId,
    activeProject,
    projects,
  }
}
