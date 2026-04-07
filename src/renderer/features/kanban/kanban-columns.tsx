import React from 'react'
import { useI18n } from '../../lib/i18n'
import type { KanbanStatus, KanbanTask } from '../../../shared/types/index'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import type { VisiblePredefinedEntry } from './kanban-constants'
import { ACTIVE_COLUMNS, formatTicketNumber } from './kanban-constants'
import { KanbanCard } from './kanban-card'
import { PredefinedTaskCard } from './predefined-task-card'

export function KanbanColumns({
  getTasksByStatus,
  sortTasks,
  activeDoneTasks,
  doneTasks,
  archivedTasks,
  selectedTaskId,
  visiblePredefined,
  workspaceProjects,
  workspaceDefaultAiProvider,
  isPaused,
  archiveExpanded,
  onDragOver,
  onDrop,
  onDragStart,
  onSelectTask,
  onDeleteTask,
  onContextMenu,
  onDoubleClickTask,
  onGoToTerminal,
  onAddPredefined,
  onDismissPredefined,
  onEditPredefined,
  onArchiveTask,
  onRestoreFromArchive,
  onToggleArchive,
  agentProgress,
}: {
  getTasksByStatus: (status: KanbanStatus) => KanbanTask[]
  sortTasks: (taskList: KanbanTask[], newestFirst?: boolean) => KanbanTask[]
  activeDoneTasks: KanbanTask[]
  doneTasks: KanbanTask[]
  archivedTasks: KanbanTask[]
  selectedTaskId: string | undefined
  visiblePredefined: VisiblePredefinedEntry[]
  workspaceProjects: Array<{ id: string; name: string; aiProvider?: AiProviderId | null; aiDefaults?: import('../../../shared/types/index').AiDefaults }>
  workspaceDefaultAiProvider: AiProviderId
  isPaused: boolean
  archiveExpanded: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (status: KanbanStatus) => void
  onDragStart: (taskId: string) => void
  onSelectTask: (task: KanbanTask) => void
  onDeleteTask: (taskId: string) => void
  onContextMenu: (e: React.MouseEvent, task: KanbanTask) => void
  onDoubleClickTask: (task: KanbanTask) => void
  onGoToTerminal: (taskId: string) => (() => void) | null
  onAddPredefined: (entry: VisiblePredefinedEntry) => void
  onDismissPredefined: (entry: VisiblePredefinedEntry) => void
  onEditPredefined: (entry: VisiblePredefinedEntry) => void
  onArchiveTask: (task: KanbanTask) => void
  onRestoreFromArchive: (task: KanbanTask) => void
  onToggleArchive: () => void
  agentProgress: Record<string, { progress?: string; message?: string }>
}) {
  const { t } = useI18n()

  return (
    <div className={`kanban-columns${isPaused ? ' kanban-columns--paused' : ''}`}>
      {ACTIVE_COLUMNS.map((col) => (
        <div
          key={col.status}
          className="kanban-column"
          onDragOver={onDragOver}
          onDrop={() => onDrop(col.status)}
        >
          <div className="kanban-column-header" style={{ borderColor: col.color }}>
            <span className="kanban-column-dot" style={{ backgroundColor: col.color }} />
            <span className="kanban-column-title">{t(col.labelKey)}</span>
            <span className="kanban-column-count">{getTasksByStatus(col.status).length}</span>
          </div>
          <div className="kanban-column-body">
            {getTasksByStatus(col.status).map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                isSelected={selectedTaskId === task.id}
                onDragStart={() => onDragStart(task.id)}
                onClick={() => onSelectTask(task)}
                onDelete={() => onDeleteTask(task.id)}
                onContextMenu={(e) => onContextMenu(e, task)}
                onDoubleClick={() => onDoubleClickTask(task)}
                onGoToTerminal={onGoToTerminal(task.id)}
                projects={workspaceProjects}
                defaultAiProvider={workspaceDefaultAiProvider}
                agentProgress={agentProgress[task.id]}
              />
            ))}
            {col.status === 'TODO' && visiblePredefined.length > 0 && (
              <>
                {visiblePredefined.map((entry) => (
                  <PredefinedTaskCard
                    key={`${entry.template.id}:${entry.projectId ?? 'ws'}`}
                    template={entry.template}
                    projectName={entry.projectName}
                    onAdd={() => onAddPredefined(entry)}
                    onDismiss={() => onDismissPredefined(entry)}
                    onDoubleClick={() => onEditPredefined(entry)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      ))}

      {/* DONE column: recent done + archive */}
      <div
        className="kanban-column"
        onDragOver={onDragOver}
        onDrop={() => onDrop('DONE')}
      >
        <div className="kanban-column-header" style={{ borderColor: '#20D4A0' }}>
          <span className="kanban-column-dot" style={{ backgroundColor: '#20D4A0' }} />
          <span className="kanban-column-title">{t('kanban.done')}</span>
          <span className="kanban-column-count">{doneTasks.length}</span>
        </div>
        <div className="kanban-column-body">
          {sortTasks(activeDoneTasks, true).map((task) => (
            <div key={task.id} className="kanban-done-card-wrapper">
              <KanbanCard
                task={task}
                isSelected={selectedTaskId === task.id}
                onDragStart={() => onDragStart(task.id)}
                onClick={() => onSelectTask(task)}
                onDelete={() => onDeleteTask(task.id)}
                onContextMenu={(e) => onContextMenu(e, task)}
                onDoubleClick={() => onDoubleClickTask(task)}
                onGoToTerminal={onGoToTerminal(task.id)}
                projects={workspaceProjects}
                defaultAiProvider={workspaceDefaultAiProvider}
                agentProgress={agentProgress[task.id]}
              />
              <button
                className="kanban-archive-btn"
                onClick={() => onArchiveTask(task)}
                title={t('kanban.archiveTask')}
              >
                {t('kanban.archiveTask')}
              </button>
            </div>
          ))}

          {/* Archive section */}
          {archivedTasks.length > 0 && (
            <div className="kanban-archive">
              <button
                className="kanban-archive-toggle"
                onClick={onToggleArchive}
              >
                <span className={`kanban-archive-arrow${archiveExpanded ? ' kanban-archive-arrow--open' : ''}`}>&#9654;</span>
                {t('kanban.archives', { count: String(archivedTasks.length) })}
              </button>
              {archiveExpanded && (
                <div className="kanban-archive-list">
                  {sortTasks(archivedTasks, true).map((task) => (
                    <div key={task.id} className="kanban-archive-item">
                      <span className="kanban-archive-item-title">
                        {task.ticketNumber != null && <span className="kanban-card-ticket-number">{formatTicketNumber(task.ticketNumber, task.type, task.isPrequalifying)}</span>}
                        {task.title}
                      </span>
                      <button
                        className="kanban-archive-restore-btn"
                        onClick={() => onRestoreFromArchive(task)}
                        title={t('kanban.restoreToTodo')}
                      >
                        {t('common.restore')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
