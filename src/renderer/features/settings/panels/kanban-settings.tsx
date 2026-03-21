import { useI18n } from '../../../lib/i18n'
import { useWorkspaceStore } from '../../workspace/workspace-store'
import { useKanbanConfig } from '../hooks/use-kanban-config'

export function KanbanSettings() {
  const { t } = useI18n()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? ''

  const {
    kanbanDefaultConfig,
    setKanbanDefaultConfig,
    kanbanProjectConfig,
    setKanbanProjectConfig,
    kanbanProjectLoading,
  } = useKanbanConfig(activeWorkspaceId)

  const kanbanToggleItems = [
    { key: 'autoCloseCompletedTerminals' as const, label: t('kanban.autoCloseCompletedTerminals'), hint: t('kanban.autoCloseCompletedTerminalsHint') },
    { key: 'autoCloseCtoTerminals' as const, label: t('kanban.autoCloseCtoTerminals'), hint: t('kanban.autoCloseCtoTerminalsHint') },
    { key: 'autoCreateAiMemoryRefactorTickets' as const, label: t('kanban.autoCreateAiMemoryRefactorTickets'), hint: t('kanban.autoCreateAiMemoryRefactorTicketsHint') },
    { key: 'autoPrequalifyTickets' as const, label: t('kanban.autoPrequalifyTickets'), hint: t('kanban.autoPrequalifyTicketsHint') },
    { key: 'autoPrioritizeBugs' as const, label: t('kanban.autoPrioritizeBugs'), hint: t('kanban.autoPrioritizeBugsHint') },
    { key: 'useWorktrees' as const, label: t('kanban.useWorktrees'), hint: t('kanban.useWorktreesHint') },
  ]

  return (
    <div className="settings-section">
      {/* Default config (editable) */}
      <h4 className="settings-section-subtitle">{t('settings.kanbanDefaultConfig')}</h4>
      <p className="settings-section-hint">{t('settings.kanbanDefaultConfigHint')}</p>
      {kanbanDefaultConfig && (
        <div className="settings-card">
          {kanbanToggleItems.map(({ key, label, hint }) => (
            <div key={key} className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{label}</label>
                <span className="settings-hint">{hint}</span>
              </div>
              <button
                className={`settings-toggle${kanbanDefaultConfig[key] ? ' settings-toggle--active' : ''}`}
                onClick={async () => {
                  const updated = await window.kanbai.kanban.setDefaultConfig({ [key]: !kanbanDefaultConfig[key] })
                  setKanbanDefaultConfig(updated)
                }}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          ))}
          {kanbanDefaultConfig.autoCreateAiMemoryRefactorTickets && (
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('kanban.aiMemoryRefactorInterval')}</label>
                <span className="settings-hint">{t('kanban.aiMemoryRefactorIntervalHint')}</span>
              </div>
              <input
                type="number"
                className="kanban-settings-number-input"
                min={2}
                max={100}
                value={kanbanDefaultConfig.aiMemoryRefactorInterval}
                onChange={async (e) => {
                  const val = Math.max(2, Math.min(100, parseInt(e.target.value, 10) || 10))
                  const updated = await window.kanbai.kanban.setDefaultConfig({ aiMemoryRefactorInterval: val })
                  setKanbanDefaultConfig(updated)
                }}
              />
            </div>
          )}
          {kanbanDefaultConfig.useWorktrees && (
            <>
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('kanban.autoMergeWorktrees')}</label>
                <span className="settings-hint">{t('kanban.autoMergeWorktreesHint')}</span>
              </div>
              <button
                className={`settings-toggle${kanbanDefaultConfig.autoMergeWorktrees ? ' settings-toggle--active' : ''}`}
                onClick={async () => {
                  const updated = await window.kanbai.kanban.setDefaultConfig({ autoMergeWorktrees: !kanbanDefaultConfig.autoMergeWorktrees })
                  setKanbanDefaultConfig(updated)
                }}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('kanban.maxConcurrentWorktrees')}</label>
                <span className="settings-hint">{t('kanban.maxConcurrentWorktreesHint')}</span>
              </div>
              <input
                type="number"
                className="kanban-settings-number-input"
                min={1}
                max={10}
                value={kanbanDefaultConfig.maxConcurrentWorktrees}
                onChange={async (e) => {
                  const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                  const updated = await window.kanbai.kanban.setDefaultConfig({ maxConcurrentWorktrees: val })
                  setKanbanDefaultConfig(updated)
                }}
              />
            </div>
            </>
          )}
        </div>
      )}

      {/* Workspace-specific config (editable) */}
      <h4 className="settings-section-subtitle" style={{ marginTop: 24 }}>
        {t('settings.kanbanWorkspaceConfig')}
        {activeWorkspaceName && <span className="settings-section-subtitle-badge">{activeWorkspaceName}</span>}
      </h4>
      <p className="settings-section-hint">{t('settings.kanbanWorkspaceConfigHint')}</p>
      {!activeWorkspaceId && (
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-hint">{t('settings.kanbanNoWorkspace')}</span>
          </div>
        </div>
      )}
      {activeWorkspaceId && kanbanProjectLoading && (
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-hint">{t('common.loading')}</span>
          </div>
        </div>
      )}
      {activeWorkspaceId && kanbanProjectConfig && !kanbanProjectLoading && (
        <div className="settings-card">
          {kanbanToggleItems.map(({ key, label, hint }) => (
            <div key={key} className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{label}</label>
                <span className="settings-hint">{hint}</span>
              </div>
              <button
                className={`settings-toggle${kanbanProjectConfig[key] ? ' settings-toggle--active' : ''}`}
                onClick={async () => {
                  const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { [key]: !kanbanProjectConfig[key] })
                  setKanbanProjectConfig(updated)
                }}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          ))}
          {kanbanProjectConfig.autoCreateAiMemoryRefactorTickets && (
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('kanban.aiMemoryRefactorInterval')}</label>
                <span className="settings-hint">{t('kanban.aiMemoryRefactorIntervalHint')}</span>
              </div>
              <input
                type="number"
                className="kanban-settings-number-input"
                min={2}
                max={100}
                value={kanbanProjectConfig.aiMemoryRefactorInterval}
                onChange={async (e) => {
                  const val = Math.max(2, Math.min(100, parseInt(e.target.value, 10) || 10))
                  const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { aiMemoryRefactorInterval: val })
                  setKanbanProjectConfig(updated)
                }}
              />
            </div>
          )}
          {kanbanProjectConfig.useWorktrees && (
            <>
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('kanban.autoMergeWorktrees')}</label>
                <span className="settings-hint">{t('kanban.autoMergeWorktreesHint')}</span>
              </div>
              <button
                className={`settings-toggle${kanbanProjectConfig.autoMergeWorktrees ? ' settings-toggle--active' : ''}`}
                onClick={async () => {
                  const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { autoMergeWorktrees: !kanbanProjectConfig.autoMergeWorktrees })
                  setKanbanProjectConfig(updated)
                }}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">{t('kanban.maxConcurrentWorktrees')}</label>
                <span className="settings-hint">{t('kanban.maxConcurrentWorktreesHint')}</span>
              </div>
              <input
                type="number"
                className="kanban-settings-number-input"
                min={1}
                max={10}
                value={kanbanProjectConfig.maxConcurrentWorktrees}
                onChange={async (e) => {
                  const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                  const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, { maxConcurrentWorktrees: val })
                  setKanbanProjectConfig(updated)
                }}
              />
            </div>
            </>
          )}
          <div className="settings-row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button
              className="settings-btn"
              onClick={async () => {
                if (!confirm(t('settings.kanbanResetConfirm'))) return
                const defaults = await window.kanbai.kanban.getDefaultConfig()
                const updated = await window.kanbai.kanban.setConfig(activeWorkspaceId, defaults)
                setKanbanProjectConfig(updated)
              }}
            >
              {t('settings.kanbanResetToDefaults')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
