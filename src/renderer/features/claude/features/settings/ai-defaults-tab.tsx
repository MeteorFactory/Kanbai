import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../shared/types/ai-provider'
import type { AiProviderId } from '../../../../../shared/types/ai-provider'
import type { AiDefaults } from '../../../../../shared/types'
import { useWorkspaceStore } from '../../../../lib/stores/workspaceStore'

interface Props {
  projectId?: string
  workspaceId?: string
}

type DefaultsScope = 'project' | 'workspace'

function ProviderSelector({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: AiProviderId
  onChange: (id: AiProviderId) => void
}) {
  return (
    <div className="ai-defaults-row">
      <div className="ai-defaults-info">
        <span className="ai-defaults-label">{label}</span>
        <span className="ai-defaults-desc">{description}</span>
      </div>
      <div className="ai-defaults-btns">
        {(Object.keys(AI_PROVIDERS) as AiProviderId[]).map((id) => (
          <button
            key={id}
            className={`ai-defaults-btn${value === id ? ' ai-defaults-btn--active' : ''}`}
            style={
              value === id
                ? { backgroundColor: AI_PROVIDERS[id].detectionColor, borderColor: AI_PROVIDERS[id].detectionColor, color: '#fff' }
                : undefined
            }
            onClick={() => onChange(id)}
          >
            {AI_PROVIDERS[id].displayName}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AiDefaultsTab({ projectId, workspaceId }: Props) {
  const { t } = useI18n()
  const [defaults, setDefaults] = useState<AiDefaults>({})
  const [wsDefaults, setWsDefaults] = useState<AiDefaults>({})
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<DefaultsScope>('project')
  const [propagating, setPropagating] = useState(false)
  const [propagated, setPropagated] = useState(false)

  const isWorkspaceMode = !projectId && !!workspaceId

  const { projects, workspaces } = useWorkspaceStore()
  const project = projects.find((p) => p.id === projectId)
  const resolvedWorkspaceId = workspaceId ?? project?.workspaceId
  const workspace = workspaces.find((w) => w.id === resolvedWorkspaceId)

  useEffect(() => {
    setLoading(true)
    if (isWorkspaceMode && workspaceId) {
      // Workspace-only mode
      window.kanbai.aiDefaults.getWorkspace(workspaceId).then((d: AiDefaults) => {
        setDefaults(d ?? {})
        setLoading(false)
      }).catch(() => setLoading(false))
    } else if (projectId) {
      // Project mode: load project defaults + workspace defaults
      const promises: Promise<void>[] = [
        window.kanbai.aiDefaults.get(projectId).then((d: AiDefaults) => {
          setDefaults(d ?? {})
        }).catch(() => { /* ignore */ }),
      ]
      if (workspace) {
        promises.push(
          window.kanbai.aiDefaults.getWorkspace(workspace.id).then((d: AiDefaults) => {
            setWsDefaults(d ?? {})
          }).catch(() => { /* ignore */ }),
        )
      }
      Promise.all(promises).then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [projectId, workspaceId, isWorkspaceMode, workspace])

  const save = useCallback(async (next: AiDefaults) => {
    setPropagated(false)

    if (isWorkspaceMode && workspaceId) {
      // Workspace-only mode: save and propagate to all projects
      setDefaults(next)
      await window.kanbai.aiDefaults.setWorkspace(workspaceId, next as unknown as Record<string, unknown>)
      const { workspaces: currentWs, projects: currentProjects } = useWorkspaceStore.getState()
      const updatedWs = currentWs.map((w) =>
        w.id === workspaceId ? { ...w, aiDefaults: next } : w,
      )
      const updatedProjects = currentProjects.map((p) => {
        if (p.workspaceId === workspaceId) {
          return { ...p, aiDefaults: { ...next, ...(p.aiDefaults ?? {}) } }
        }
        return p
      })
      useWorkspaceStore.setState({ workspaces: updatedWs, projects: updatedProjects })
      setPropagated(true)
      setTimeout(() => setPropagated(false), 2000)
    } else if (scope === 'workspace' && workspace) {
      setWsDefaults(next)
      await window.kanbai.aiDefaults.setWorkspace(workspace.id, next as unknown as Record<string, unknown>)
      const allProjects = await window.kanbai.project.list()
      useWorkspaceStore.setState((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === workspace.id ? { ...w, aiDefaults: next } : w,
        ),
        projects: allProjects,
      }))
      setPropagated(true)
      setTimeout(() => setPropagated(false), 2000)
    } else if (projectId) {
      setDefaults(next)
      await window.kanbai.aiDefaults.set(projectId, next as unknown as Record<string, unknown>)
      useWorkspaceStore.setState((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, aiDefaults: next } : p,
        ),
      }))
    }
  }, [projectId, workspaceId, scope, workspace, isWorkspaceMode])

  const handlePropagate = useCallback(async () => {
    if (!workspace) return
    setPropagating(true)
    try {
      await window.kanbai.aiDefaults.propagateWorkspace(workspace.id)
      const allProjects = await window.kanbai.project.list()
      useWorkspaceStore.setState({ projects: allProjects })
    } catch { /* ignore */ }
    setPropagating(false)
  }, [workspace])

  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  const activeDefaults = scope === 'workspace' ? wsDefaults : defaults

  const kanbanProvider: AiProviderId = activeDefaults.kanban ?? 'claude'
  const packagesProvider: AiProviderId = activeDefaults.packages ?? 'claude'
  const databaseProvider: AiProviderId = activeDefaults.database ?? 'claude'

  const allSame = kanbanProvider === packagesProvider && packagesProvider === databaseProvider
  const globalProvider: AiProviderId = allSame ? kanbanProvider : 'claude'

  const setAll = (id: AiProviderId) => {
    save({
      ...activeDefaults,
      kanban: id,
      packages: id,
      packagesModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '',
      database: id,
      databaseModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '',
    })
  }

  return (
    <div className="cs-general-tab">
      {isWorkspaceMode && (
        <div className="cs-general-section">
          <div className="cs-general-card" style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('ai.defaults.workspaceMode')}
          </div>
        </div>
      )}
      {!isWorkspaceMode && workspace && (
        <div className="cs-general-section">
          <div className="ai-defaults-scope-toggle">
            <button
              className={`ai-defaults-scope-btn${scope === 'project' ? ' ai-defaults-scope-btn--active' : ''}`}
              onClick={() => setScope('project')}
            >
              {t('ai.defaults.scopeProject')}
            </button>
            <button
              className={`ai-defaults-scope-btn${scope === 'workspace' ? ' ai-defaults-scope-btn--active' : ''}`}
              onClick={() => setScope('workspace')}
            >
              {t('ai.defaults.scopeWorkspace')}
            </button>
          </div>
          {scope === 'workspace' && (
            <div className="ai-defaults-propagate">
              <span className="ai-defaults-propagate-info">{t('ai.defaults.propagateInfo')}</span>
              <button
                className="modal-btn modal-btn--primary"
                onClick={handlePropagate}
                disabled={propagating}
              >
                {propagating ? t('common.loading') : t('ai.defaults.propagateBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('ai.defaults.allLabel')}</div>
        <div className="cs-general-card">
          <ProviderSelector
            label={t('ai.defaults.allLabel')}
            description={t('ai.defaults.allDesc')}
            value={allSame ? globalProvider : '' as AiProviderId}
            onChange={setAll}
          />
        </div>
      </div>

      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('ai.defaults.kanban')}</div>
        <div className="cs-general-card">
          <ProviderSelector
            label={t('ai.defaults.kanbanLabel')}
            description={t('ai.defaults.kanbanDesc')}
            value={kanbanProvider}
            onChange={(id) => save({ ...activeDefaults, kanban: id })}
          />
        </div>
      </div>

      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('ai.defaults.packages')}</div>
        <div className="cs-general-card">
          <ProviderSelector
            label={t('ai.defaults.packagesLabel')}
            description={t('ai.defaults.packagesDesc')}
            value={packagesProvider}
            onChange={(id) => save({ ...activeDefaults, packages: id, packagesModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' })}
          />
        </div>
      </div>

      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('ai.defaults.database')}</div>
        <div className="cs-general-card">
          <ProviderSelector
            label={t('ai.defaults.databaseLabel')}
            description={t('ai.defaults.databaseDesc')}
            value={databaseProvider}
            onChange={(id) => save({ ...activeDefaults, database: id, databaseModel: id === 'codex' ? 'gpt-5.1-codex-mini' : id === 'copilot' ? 'gpt-4o' : '' })}
          />
        </div>
      </div>

      {propagated && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--green)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, zIndex: 9999 }}>
          {t('ai.defaults.propagated')}
        </div>
      )}
    </div>
  )
}
