import { usePackagesStore } from './packages-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useI18n } from '../../lib/i18n'
import type { ProjectPackageManager, PackageManagerType } from '../../../shared/types'

interface Props {
  managers: ProjectPackageManager[]
}

const MANAGER_COLORS: Record<PackageManagerType, string> = {
  npm: '#cb3837',
  go: '#00add8',
  pip: '#3776ab',
  cargo: '#dea584',
  nuget: '#004880',
  composer: '#885630',
  bower: '#ef5734',
}

export function PackagesSidebar({ managers }: Props) {
  const { t } = useI18n()
  const { selectedProjectId, selectedManager, setSelection, detectManagers } =
    usePackagesStore()
  const { projects, activeWorkspaceId } = useWorkspaceStore()

  const grouped = managers.reduce(
    (acc, m) => {
      if (!acc[m.projectId]) acc[m.projectId] = { name: m.projectName, items: [] }
      acc[m.projectId]!.items.push(m)
      return acc
    },
    {} as Record<string, { name: string; items: ProjectPackageManager[] }>,
  )

  const handleRefresh = () => {
    const workspaceProjects = projects.filter(
      (p) => p.workspaceId === activeWorkspaceId,
    )
    if (workspaceProjects.length > 0) {
      detectManagers(
        workspaceProjects.map((p) => ({ id: p.id, path: p.path, name: p.name })),
      )
    }
  }

  return (
    <div className="packages-sidebar">
      <div className="packages-sidebar-header">
        <span>{t('packages.projects')}</span>
        <button
          className="packages-sidebar-refresh"
          onClick={handleRefresh}
          title={t('common.refresh')}
        >
          &#x21bb;
        </button>
      </div>
      <div className="packages-sidebar-list">
        {Object.entries(grouped).map(([projectId, { name, items }]) => (
          <div key={projectId} className="packages-project-group">
            <div className="packages-project-name">{name}</div>
            {items.map((item) => {
              const isActive =
                selectedProjectId === item.projectId &&
                selectedManager === item.manager
              return (
                <button
                  key={item.manager}
                  className={`packages-manager-btn${isActive ? ' packages-manager-btn--active' : ''}`}
                  onClick={() => setSelection(item.projectId, item.manager)}
                >
                  <span
                    className="packages-manager-badge"
                    style={{ background: MANAGER_COLORS[item.manager] }}
                  >
                    {item.manager}
                  </span>
                  <span className="packages-manager-count">{item.packageCount}</span>
                </button>
              )
            })}
          </div>
        ))}
        {managers.length === 0 && (
          <div className="packages-sidebar-empty">{t('packages.noManagers')}</div>
        )}
      </div>
    </div>
  )
}
