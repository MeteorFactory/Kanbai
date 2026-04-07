import { useState, useCallback, useEffect, useRef } from 'react'
import { useI18n } from '../../lib/i18n'
import type { KanbanStatus, KanbanTask } from '../../../shared/types/index'
import {
  COLUMNS,
  PRIORITIES,
  TASK_TYPES,
  TYPE_CONFIG,
  PRIORITY_COLORS,
  formatTicketNumber,
} from './kanban-constants'
import { TaskDetailAttachments } from './task-detail-attachments'
import {
  TaskDetailSplitSuggestions,
  TaskDetailWorktreeInfo,
  TaskDetailAiInfo,
  TaskDetailQuestion,
  TaskDetailResult,
  TaskDetailError,
  TaskDetailComments,
  TaskDetailConversationHistory,
} from './task-detail-metadata'
import { ReopenOrSendSection } from './reopen-or-send-section'

export function TaskDetailPanel({
  task,
  onClose,
  onUpdate,
  onDelete,
  onStatusChange,
  onSendToAi,
  onAttachFiles,
  onAttachFromClipboard,
  onRemoveAttachment,
  projects,
  agentProgress,
}: {
  task: KanbanTask
  onClose: () => void
  onUpdate: (data: Partial<KanbanTask>) => void
  onDelete: () => void
  onStatusChange: (status: KanbanStatus) => void
  onSendToAi: () => void
  onAttachFiles: () => void
  onAttachFromClipboard: (dataBase64: string, filename: string, mimeType: string) => void
  onRemoveAttachment: (attachmentId: string) => void
  projects: Array<{ id: string; name: string }>
  agentProgress?: { progress?: string; message?: string; items?: Array<{ label: string; status: 'pending' | 'in_progress' | 'completed' }> }
}) {
  const { t, locale, localeCode } = useI18n()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState(task.description)
  const titleRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTitleValue(task.title)
    setDescValue(task.description)
  }, [task.id, task.title, task.description])

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [editingTitle])

  useEffect(() => {
    if (editingDesc && descRef.current) {
      descRef.current.focus()
    }
  }, [editingDesc])

  const saveTitle = useCallback(() => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate({ title: trimmed })
    }
    setEditingTitle(false)
  }, [titleValue, task.title, onUpdate])

  const saveDesc = useCallback(() => {
    if (descValue !== task.description) {
      onUpdate({ description: descValue })
    }
    setEditingDesc(false)
  }, [descValue, task.description, onUpdate])

  const priorityLabels: Record<string, string> = {
    low: t('kanban.low'),
    medium: t('kanban.medium'),
    high: t('kanban.high'),
  }

  const statusColumn = COLUMNS.find((c) => c.status === task.status)

  return (
    <div className="kanban-detail" tabIndex={-1}>
      <div className="kanban-detail-header">
        <span className="kanban-detail-id">{task.ticketNumber != null ? formatTicketNumber(task.ticketNumber, task.type, task.isPrequalifying) : `#${task.id.slice(0, 8)}`}</span>
        <button className="kanban-detail-close" onClick={onClose}>&times;</button>
      </div>

      {/* Title */}
      <div className="kanban-detail-section">
        {editingTitle ? (
          <input
            ref={titleRef}
            className="kanban-detail-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
          />
        ) : (
          <h3
            className="kanban-detail-title"
            onDoubleClick={() => setEditingTitle(true)}
          >
            {task.title}
          </h3>
        )}
      </div>

      {/* Agent Task List */}
      {task.status === 'WORKING' && agentProgress?.items && agentProgress.items.length > 0 && (
        <div className="kanban-detail-task-list">
          <div className="kanban-detail-task-list-header">
            <span className="kanban-detail-task-list-title">{t('kanban.agentTasks')}</span>
            {agentProgress.progress && (
              <span className="kanban-detail-task-list-count">{agentProgress.progress}</span>
            )}
          </div>
          <ul className="kanban-detail-task-items">
            {agentProgress.items.map((item, i) => (
              <li key={i} className={`kanban-detail-task-item kanban-detail-task-item--${item.status}`}>
                <span className="kanban-detail-task-item-icon">
                  {item.status === 'completed' ? '\u2713' : item.status === 'in_progress' ? '\u25B6' : '\u25CB'}
                </span>
                <span className="kanban-detail-task-item-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status & Priority & Scope */}
      <div className="kanban-detail-meta">
        <div className="kanban-detail-meta-item">
          <span className="kanban-detail-meta-label">{t('kanban.status')}</span>
          <select
            className="kanban-detail-select"
            value={task.status}
            onChange={(e) => onStatusChange(e.target.value as KanbanStatus)}
            style={{ borderColor: statusColumn?.color }}
          >
            {COLUMNS.map((col) => (
              <option key={col.status} value={col.status}>{t(col.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="kanban-detail-meta-item">
          <span className="kanban-detail-meta-label">{t('kanban.priority')}</span>
          <select
            className="kanban-detail-select"
            value={task.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as KanbanTask['priority'] })}
            style={{ borderColor: PRIORITY_COLORS[task.priority] }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{priorityLabels[p]}</option>
            ))}
          </select>
        </div>
        <div className="kanban-detail-meta-item">
          <span className="kanban-detail-meta-label">{t('kanban.scope')}</span>
          <select
            className="kanban-detail-select"
            value={task.targetProjectId || ''}
            onChange={(e) => onUpdate({ targetProjectId: e.target.value || undefined })}
          >
            <option value="">{t('kanban.entireWorkspace')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>


      {/* Type */}
      <div className="kanban-detail-section">
        <span className="kanban-detail-section-title">{t('kanban.type')}</span>
        <div className="kanban-detail-labels">
          {TASK_TYPES.map((tp) => {
            const conf = TYPE_CONFIG[tp]
            const isActive = (task.type ?? 'feature') === tp
            return (
              <button
                key={tp}
                className={`kanban-label-chip${isActive ? ' kanban-label-chip--active' : ''}`}
                style={{ color: conf.color, background: isActive ? `${conf.color}25` : `${conf.color}10` }}
                onClick={() => onUpdate({ type: tp })}
              >
                {locale === 'en' ? conf.labelEn : conf.labelFr}
              </button>
            )
          })}
        </div>
      </div>

      {/* Attachments */}
      <TaskDetailAttachments
        task={task}
        onAttachFiles={onAttachFiles}
        onAttachFromClipboard={onAttachFromClipboard}
        onRemoveAttachment={onRemoveAttachment}
      />

      {/* Description */}
      <div className="kanban-detail-section">
        <span className="kanban-detail-section-title">{t('kanban.description')}</span>
        {editingDesc ? (
          <textarea
            ref={descRef}
            className="kanban-detail-desc-edit"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={saveDesc}
            rows={4}
          />
        ) : (
          <div
            className="kanban-detail-desc"
            onDoubleClick={() => setEditingDesc(true)}
          >
            {task.description || t('kanban.noDescription')}
          </div>
        )}
      </div>

      {/* Split Suggestions */}
      <TaskDetailSplitSuggestions task={task} onClose={onClose} />

      {/* Worktree info (project, branch, merge status) */}
      <TaskDetailWorktreeInfo task={task} />

      {/* AI Agent info */}
      <TaskDetailAiInfo task={task} />

      {/* Question */}
      <TaskDetailQuestion task={task} />

      {/* Result */}
      <TaskDetailResult task={task} />

      {/* Error */}
      <TaskDetailError task={task} />

      {/* Comments */}
      <TaskDetailComments task={task} />

      {/* Conversation History */}
      <TaskDetailConversationHistory task={task} />

      {/* Timestamps */}
      <div className="kanban-detail-timestamps">
        <span>{t('kanban.created')} {new Date(task.createdAt).toLocaleString(localeCode)}</span>
        <span>{t('kanban.modified')} {new Date(task.updatedAt).toLocaleString(localeCode)}</span>
      </div>

      {/* Send to AI / Reopen */}
      {task.status !== 'WORKING' && (
        <ReopenOrSendSection task={task} onUpdate={onUpdate} onSendToAi={onSendToAi} />
      )}

      {/* Delete */}
      <div className="kanban-detail-actions">
        <button className="kanban-detail-delete-btn" onClick={onDelete}>
          {t('kanban.deleteTask')}
        </button>
      </div>
    </div>
  )
}
