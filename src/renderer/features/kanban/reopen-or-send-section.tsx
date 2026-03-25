import React, { useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import type { KanbanTask, KanbanComment } from '../../../shared/types/index'
import { useKanbanStore } from './kanban-store'

export function ReopenOrSendSection({
  task,
  onUpdate,
  onSendToAi,
}: {
  task: KanbanTask
  onUpdate: (data: Partial<KanbanTask>) => void
  onSendToAi: () => void
}) {
  const { t } = useI18n()
  const canReopen = task.status === 'DONE' || task.status === 'FAILED' || task.status === 'PENDING'
  const [reopenMode, setReopenMode] = useState(false)
  const [reopenComment, setReopenComment] = useState('')
  const kanbanTabIds = useKanbanStore((s) => s.kanbanTabIds)
  const reactivateIfDone = useKanbanStore((s) => s.reactivateIfDone)

  const handleReopen = useCallback(() => {
    const text = reopenComment.trim()
    setReopenComment('')
    setReopenMode(false)

    // If the ticket is DONE and has an open terminal, write the message
    // directly to that terminal and reactivate the ticket
    const existingTabId = kanbanTabIds[task.id]
    if (task.status === 'DONE' && existingTabId) {
      reactivateIfDone(existingTabId, text || undefined, { skipGracePeriod: true })
      return
    }

    // No open terminal — fall through to full sendToAi flow
    if (text) {
      const newComment: KanbanComment = {
        id: crypto.randomUUID(),
        text,
        createdAt: Date.now(),
      }
      onUpdate({ comments: [...(task.comments ?? []), newComment] })
    }
    onSendToAi()
  }, [reopenComment, task.id, task.status, task.comments, kanbanTabIds, reactivateIfDone, onUpdate, onSendToAi])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        handleReopen()
      }
    },
    [handleReopen],
  )

  if (!canReopen) {
    return (
      <div className="kanban-detail-section">
        <button className="kanban-detail-ai-btn" onClick={onSendToAi}>
          {t('kanban.sendToAi')}
        </button>
      </div>
    )
  }

  if (!reopenMode) {
    return (
      <div className="kanban-detail-section">
        <button className="kanban-detail-reopen-btn" onClick={() => setReopenMode(true)}>
          {t('kanban.reopenTicket')}
        </button>
      </div>
    )
  }

  return (
    <div className="kanban-detail-section">
      <span className="kanban-detail-section-title">{t('kanban.reopenComment')}</span>
      <div className="kanban-reopen-form">
        <textarea
          className="kanban-comment-input"
          placeholder={t('kanban.reopenPlaceholder')}
          value={reopenComment}
          onChange={(e) => setReopenComment(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          autoFocus
        />
        <div className="kanban-reopen-actions">
          <button
            className="kanban-reopen-cancel"
            onClick={() => { setReopenMode(false); setReopenComment('') }}
          >
            {t('common.cancel')}
          </button>
          <button
            className="kanban-reopen-confirm"
            onClick={handleReopen}
          >
            {t('kanban.reopenAndSend')}
          </button>
        </div>
      </div>
    </div>
  )
}
