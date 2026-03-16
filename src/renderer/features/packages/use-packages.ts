import { useEffect, useMemo } from 'react'
import { usePackagesStore } from './packages-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

/**
 * Hook that wires workspace context into the packages store.
 * Handles workspace switching and manager detection automatically.
 */
export function usePackages() {
  const { projects, activeWorkspaceId } = useWorkspaceStore()
  const switchWorkspace = usePackagesStore((s) => s.switchWorkspace)
  const detectManagers = usePackagesStore((s) => s.detectManagers)
  const managers = usePackagesStore((s) => s.managers)
  const selectedProjectId = usePackagesStore((s) => s.selectedProjectId)
  const selectedManager = usePackagesStore((s) => s.selectedManager)

  const workspaceProjects = useMemo(
    () => projects.filter((p) => p.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId],
  )

  useEffect(() => {
    if (activeWorkspaceId) {
      switchWorkspace(activeWorkspaceId)
    }
  }, [activeWorkspaceId, switchWorkspace])

  useEffect(() => {
    if (workspaceProjects.length > 0) {
      detectManagers(
        workspaceProjects.map((p) => ({ id: p.id, path: p.path, name: p.name })),
      )
    }
  }, [workspaceProjects, detectManagers])

  return {
    managers,
    workspaceProjects,
    selectedProjectId,
    selectedManager,
    hasProjects: workspaceProjects.length > 0,
  }
}
