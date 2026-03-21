import { useI18n } from '../../lib/i18n'
import type { KanbanConfig } from '../../../shared/types/index'

export function KanbanSettingsDrawer({
  kanbanConfig,
  onClose,
  onUpdateConfig,
}: {
  kanbanConfig: KanbanConfig
  onClose: () => void
  onUpdateConfig: (key: keyof KanbanConfig, value: boolean | number) => void
}) {
  const { t } = useI18n()

  return (
    <div className="kanban-settings-drawer">
      <div className="kanban-settings-drawer-header">
        <span className="kanban-settings-drawer-title">{t('kanban.settingsTitle')}</span>
        <button className="kanban-settings-drawer-close" onClick={onClose}>&times;</button>
      </div>
      {([
        { key: 'autoCloseCompletedTerminals' as const, label: t('kanban.autoCloseCompletedTerminals'), hint: t('kanban.autoCloseCompletedTerminalsHint') },
        { key: 'autoCloseCtoTerminals' as const, label: t('kanban.autoCloseCtoTerminals'), hint: t('kanban.autoCloseCtoTerminalsHint') },
        { key: 'autoCreateAiMemoryRefactorTickets' as const, label: t('kanban.autoCreateAiMemoryRefactorTickets'), hint: t('kanban.autoCreateAiMemoryRefactorTicketsHint') },
        { key: 'autoPrequalifyTickets' as const, label: t('kanban.autoPrequalifyTickets'), hint: t('kanban.autoPrequalifyTicketsHint') },
        { key: 'autoPrioritizeBugs' as const, label: t('kanban.autoPrioritizeBugs'), hint: t('kanban.autoPrioritizeBugsHint') },
        { key: 'useWorktrees' as const, label: t('kanban.useWorktrees'), hint: t('kanban.useWorktreesHint') },
      ]).map(({ key, label, hint }) => (
        <div key={key} className="kanban-settings-row">
          <div className="kanban-settings-row-info">
            <span className="kanban-settings-label">{label}</span>
            <span className="kanban-settings-hint">{hint}</span>
          </div>
          <button
            className={`settings-toggle${kanbanConfig[key] ? ' settings-toggle--active' : ''}`}
            onClick={() => onUpdateConfig(key, !kanbanConfig[key])}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      ))}
      {kanbanConfig.autoCreateAiMemoryRefactorTickets && (
        <div className="kanban-settings-row">
          <div className="kanban-settings-row-info">
            <span className="kanban-settings-label">{t('kanban.aiMemoryRefactorInterval')}</span>
            <span className="kanban-settings-hint">{t('kanban.aiMemoryRefactorIntervalHint')}</span>
          </div>
          <input
            type="number"
            className="kanban-settings-number-input"
            min={2}
            max={100}
            value={kanbanConfig.aiMemoryRefactorInterval}
            onChange={(e) => {
              const val = Math.max(2, Math.min(100, parseInt(e.target.value, 10) || 10))
              onUpdateConfig('aiMemoryRefactorInterval', val)
            }}
          />
        </div>
      )}
      {kanbanConfig.useWorktrees && (<>
        <div className="kanban-settings-row">
          <div className="kanban-settings-row-info">
            <span className="kanban-settings-label">{t('kanban.autoMergeWorktrees')}</span>
            <span className="kanban-settings-hint">{t('kanban.autoMergeWorktreesHint')}</span>
          </div>
          <button
            className={`settings-toggle${kanbanConfig.autoMergeWorktrees ? ' settings-toggle--active' : ''}`}
            onClick={() => onUpdateConfig('autoMergeWorktrees', !kanbanConfig.autoMergeWorktrees)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
        <div className="kanban-settings-row">
          <div className="kanban-settings-row-info">
            <span className="kanban-settings-label">{t('kanban.maxConcurrentWorktrees')}</span>
            <span className="kanban-settings-hint">{t('kanban.maxConcurrentWorktreesHint')}</span>
          </div>
          <input
            type="number"
            className="kanban-settings-number-input"
            min={1}
            max={10}
            value={kanbanConfig.maxConcurrentWorktrees}
            onChange={(e) => {
              const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
              onUpdateConfig('maxConcurrentWorktrees', val)
            }}
          />
        </div>
      </>)}
    </div>
  )
}
