import { useI18n } from '../../lib/i18n'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import type { KanbanTaskType, Project } from '../../../shared/types/index'
import {
  PRIORITIES,
  TASK_TYPES,
  TYPE_CONFIG,
} from './kanban-constants'

export function KanbanEditModal({
  editTitle,
  setEditTitle,
  editDesc,
  setEditDesc,
  editPriority,
  setEditPriority,
  editType,
  setEditType,
  editTargetProjectId,
  setEditTargetProjectId,
  editAiProvider,
  setEditAiProvider,
  workspaceDefaultAiProvider,
  workspaceProjects,
  activeWorkspaceId,
  workspaces,
  onClose,
  onSave,
}: {
  editTitle: string
  setEditTitle: (v: string) => void
  editDesc: string
  setEditDesc: (v: string) => void
  editPriority: (typeof PRIORITIES)[number]
  setEditPriority: (v: (typeof PRIORITIES)[number]) => void
  editType: KanbanTaskType
  setEditType: (v: KanbanTaskType) => void
  editTargetProjectId: string
  setEditTargetProjectId: (v: string) => void
  editAiProvider: AiProviderId | ''
  setEditAiProvider: (v: AiProviderId | '') => void
  workspaceDefaultAiProvider: AiProviderId
  workspaceProjects: Array<Pick<Project, 'id' | 'name'>>
  activeWorkspaceId: string
  workspaces: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: () => void
}) {
  const { t, locale } = useI18n()

  const editResolvedProvider: AiProviderId = (editAiProvider as AiProviderId) || workspaceDefaultAiProvider
  const editProviderInfo = AI_PROVIDERS[editResolvedProvider]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="kanban-create-modal" onClick={(e) => e.stopPropagation()}>
        <button className="kanban-create-modal-close" onClick={onClose}>&times;</button>
        <div className="kanban-create-modal-body">
          {/* Type Selector — visual buttons */}
          <div className="kanban-create-type-bar">
            {TASK_TYPES.map((tp) => {
              const conf = TYPE_CONFIG[tp]
              const isActive = editType === tp
              return (
                <button
                  key={tp}
                  className={`kanban-create-type-btn${isActive ? ' kanban-create-type-btn--active' : ''}`}
                  style={isActive ? { color: conf.color } : undefined}
                  onClick={() => setEditType(tp)}
                >
                  {locale === 'en' ? conf.labelEn : conf.labelFr}
                </button>
              )
            })}
          </div>

          {/* Title */}
          <input
            className="kanban-create-modal-title-input"
            placeholder={t('kanban.taskTitlePlaceholder')}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
            autoFocus
          />

          {/* Description */}
          <textarea
            className="kanban-create-modal-desc"
            placeholder={t('kanban.descriptionPlaceholder')}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={4}
          />

          {/* Meta row: Priority, Scope, AI Provider */}
          <div className="kanban-create-modal-meta">
            {/* Priority pills */}
            <div className="kanban-create-meta-group">
              <span className="kanban-create-meta-label">{t('kanban.priority')}</span>
              <div className="kanban-create-pill-row">
                {PRIORITIES.map((p) => {
                  const isActive = editPriority === p
                  return (
                    <button
                      key={p}
                      className={`kanban-create-pill${isActive ? ' kanban-create-pill--active' : ''}`}
                      onClick={() => setEditPriority(p)}
                    >
                      {t(`kanban.${p}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Scope */}
            <div className="kanban-create-meta-group">
              <span className="kanban-create-meta-label">{t('kanban.scope')}</span>
              <select
                className="kanban-select"
                value={editTargetProjectId}
                onChange={(e) => setEditTargetProjectId(e.target.value)}
              >
                <option value="">Workspace{(() => { const ws = workspaces.find((w) => w.id === activeWorkspaceId); return ws ? ` (${ws.name})` : '' })()}</option>
                {workspaceProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* AI Provider pills */}
            <div className="kanban-create-meta-group">
              <span className="kanban-create-meta-label">AI</span>
              <div className="kanban-create-pill-row">
                {Object.values(AI_PROVIDERS).map((p) => {
                  const isActive = editResolvedProvider === p.id
                  const isDefault = p.id === workspaceDefaultAiProvider && !editAiProvider
                  return (
                    <button
                      key={p.id}
                      className={`kanban-create-pill kanban-create-pill--ai${isActive ? ' kanban-create-pill--active' : ''}`}
                      style={isActive ? { color: '#fff', background: p.detectionColor } : undefined}
                      onClick={() => setEditAiProvider(isDefault ? '' : p.id)}
                    >
                      {p.displayName}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="kanban-create-modal-footer">
          <button className="kanban-create-modal-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="kanban-create-modal-submit"
            style={{ background: editProviderInfo.detectionColor }}
            onClick={onSave}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
