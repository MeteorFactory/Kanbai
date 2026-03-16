import { useEffect, useMemo } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { usePackagesStore } from './packages-store'
import { PackagesSidebar } from './packages-sidebar'
import { PackagesContent } from './packages-content'
import { useI18n } from '../../lib/i18n'

export function PackagesPanel() {
  const { t } = useI18n()
  const { projects, activeWorkspaceId } = useWorkspaceStore()
  const workspaceProjects = useMemo(
    () => projects.filter((p) => p.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId],
  )
  const switchWorkspace = usePackagesStore((s) => s.switchWorkspace)
  const detectManagers = usePackagesStore((s) => s.detectManagers)
  const managers = usePackagesStore((s) => s.managers)

  // Save/restore per-workspace state when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      switchWorkspace(activeWorkspaceId)
    }
  }, [activeWorkspaceId, switchWorkspace])

  // Detect managers when workspace projects change
  useEffect(() => {
    if (workspaceProjects.length > 0) {
      detectManagers(
        workspaceProjects.map((p) => ({ id: p.id, path: p.path, name: p.name })),
      )
    }
  }, [workspaceProjects, detectManagers])

  if (workspaceProjects.length === 0) {
    return <div className="packages-empty">{t('packages.noProjects')}</div>
  }

  return (
    <div className="packages-panel">
      <div className="packages-panel-body">
        <PackagesSidebar managers={managers} />
        <PackagesContent />
      </div>
    </div>
  )
}
