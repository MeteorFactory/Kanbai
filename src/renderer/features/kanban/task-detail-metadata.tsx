import { useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import type { KanbanTask } from '../../../shared/types/index'
import { useKanbanStore } from './kanban-store'
import { TYPE_CONFIG, PRIORITY_COLORS } from './kanban-constants'

export function TaskDetailSplitSuggestions({
  task,
  onClose,
}: {
  task: KanbanTask
  onClose: () => void
}) {
  const { t, locale } = useI18n()

  const priorityLabels: Record<string, string> = {
    low: t('kanban.low'),
    medium: t('kanban.medium'),
    high: t('kanban.high'),
  }

  if (!task.splitSuggestions || task.splitSuggestions.length === 0) return null

  return (
    <div className="kanban-detail-section kanban-split-section">
      <span className="kanban-detail-section-title kanban-split-title">{t('kanban.splitDetected')}</span>
      <p className="kanban-split-hint">{t('kanban.splitDetectedHint')}</p>
      <div className="kanban-split-suggestions">
        {task.splitSuggestions.map((s, i) => (
          <div key={i} className="kanban-split-suggestion-card">
            <span className="kanban-split-suggestion-type" style={{ color: TYPE_CONFIG[s.type]?.color ?? '#E0DCE8' }}>
              {locale === 'en' ? (TYPE_CONFIG[s.type]?.labelEn ?? s.type) : (TYPE_CONFIG[s.type]?.labelFr ?? s.type)}
            </span>
            <span className="kanban-split-suggestion-title">{s.title}</span>
            <span className="kanban-split-suggestion-desc">{s.description}</span>
            <span className="kanban-split-suggestion-priority" style={{ color: PRIORITY_COLORS[s.priority] ?? '#6B6A65' }}>
              {priorityLabels[s.priority] ?? s.priority}
            </span>
          </div>
        ))}
      </div>
      <div className="kanban-split-actions">
        <button
          className="kanban-split-accept-btn"
          onClick={() => {
            useKanbanStore.getState().acceptSplit(task.id)
            onClose()
          }}
        >
          {t('kanban.splitAccept').replace('{count}', String(task.splitSuggestions.length))}
        </button>
        <button
          className="kanban-split-dismiss-btn"
          onClick={() => useKanbanStore.getState().dismissSplit(task.id)}
        >
          {t('kanban.splitDismiss')}
        </button>
      </div>
    </div>
  )
}

export function TaskDetailAiInfo({ task }: { task: KanbanTask }) {
  const { t } = useI18n()

  if (!task.agentId) return null

  return (
    <div className="kanban-detail-section">
      <span className="kanban-detail-section-title">{t('kanban.aiAgent')}</span>
      <div className="kanban-detail-agent">
        <span className={`kanban-detail-agent-status${task.status === 'WORKING' ? ' kanban-detail-agent-status--active' : ''}`}>
          {task.status === 'WORKING' ? t('kanban.processing') : t('kanban.done')}
        </span>
        <span className="kanban-detail-agent-id">{task.agentId}</span>
      </div>
    </div>
  )
}

export function TaskDetailQuestion({ task }: { task: KanbanTask }) {
  const { t } = useI18n()

  if (!task.question) return null

  return (
    <div className="kanban-detail-section">
      <span className="kanban-detail-section-title">{t('kanban.aiQuestion')}</span>
      <div className="kanban-detail-question">{task.question}</div>
    </div>
  )
}

export function TaskDetailResult({ task }: { task: KanbanTask }) {
  const { t } = useI18n()
  const [copiedResult, setCopiedResult] = useState(false)

  if (!task.result) return null

  return (
    <div className="kanban-detail-section">
      <div className="kanban-detail-section-header">
        <span className="kanban-detail-section-title">{t('kanban.result')}</span>
        <button
          className={`kanban-detail-copy-btn${copiedResult ? ' kanban-detail-copy-btn--copied' : ''}`}
          onClick={() => {
            navigator.clipboard.writeText(task.result!).then(() => {
              setCopiedResult(true)
              setTimeout(() => setCopiedResult(false), 2000)
            })
          }}
          title={t('common.copy')}
        >
          {copiedResult ? '\u2713' : t('common.copy')}
        </button>
      </div>
      {(task.aiProvider || task.aiModel) && (
        <div className="kanban-detail-ai-badge">
          {task.aiProvider && (
            <span
              className="kanban-detail-ai-provider"
              style={{ color: AI_PROVIDERS[task.aiProvider]?.detectionColor }}
            >
              {AI_PROVIDERS[task.aiProvider]?.displayName ?? task.aiProvider}
            </span>
          )}
          {task.aiModel && (
            <span className="kanban-detail-ai-model">{task.aiModel}</span>
          )}
        </div>
      )}
      <div className="kanban-detail-result">{task.result}</div>
    </div>
  )
}

export function TaskDetailError({ task }: { task: KanbanTask }) {
  const { t } = useI18n()

  if (!task.error) return null

  return (
    <div className="kanban-detail-section">
      <span className="kanban-detail-section-title">{t('kanban.error')}</span>
      {(task.aiProvider || task.aiModel) && (
        <div className="kanban-detail-ai-badge">
          {task.aiProvider && (
            <span
              className="kanban-detail-ai-provider"
              style={{ color: AI_PROVIDERS[task.aiProvider]?.detectionColor }}
            >
              {AI_PROVIDERS[task.aiProvider]?.displayName ?? task.aiProvider}
            </span>
          )}
          {task.aiModel && (
            <span className="kanban-detail-ai-model">{task.aiModel}</span>
          )}
        </div>
      )}
      <div className="kanban-detail-error">{task.error}</div>
    </div>
  )
}

export function TaskDetailComments({ task }: { task: KanbanTask }) {
  const { t, localeCode } = useI18n()

  if (!task.comments || task.comments.length === 0) return null

  return (
    <div className="kanban-detail-section">
      <span className="kanban-detail-section-title">{t('kanban.comments')} ({task.comments.length})</span>
      <div className="kanban-detail-comments">
        {task.comments.map((comment) => {
          const isResolution = comment.type === 'resolution-done' || comment.type === 'resolution-failed'
          const commentClass = isResolution
            ? `kanban-detail-comment kanban-detail-comment--${comment.type}`
            : 'kanban-detail-comment'
          const label = comment.type === 'resolution-done'
            ? t('kanban.previousResult')
            : comment.type === 'resolution-failed'
              ? t('kanban.previousError')
              : null
          return (
            <div key={comment.id} className={commentClass}>
              <span className="kanban-detail-comment-date">
                {label && <span className="kanban-detail-comment-label">{label} — </span>}
                {new Date(comment.createdAt).toLocaleString(localeCode)}
              </span>
              <p className="kanban-detail-comment-text">{comment.text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TaskDetailConversationHistory({ task }: { task: KanbanTask }) {
  const { t, localeCode } = useI18n()
  const [showConversationHistory, setShowConversationHistory] = useState(false)
  const [conversationContent, setConversationContent] = useState<Array<{ role: string; message: string; timestamp?: string }>>([])
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationError, setConversationError] = useState<string | null>(null)

  const openConversationHistory = useCallback(async () => {
    if (!task.conversationHistoryPath) return
    setShowConversationHistory(true)
    setConversationLoading(true)
    setConversationError(null)
    setConversationContent([])
    try {
      const result = await window.kanbai.fs.readFile(task.conversationHistoryPath)
      if (result.error || !result.content) {
        setConversationError(result.error || t('kanban.conversationHistoryErrorRead'))
        return
      }
      const lines = result.content.split('\n').filter((line: string) => line.trim())
      const entries: Array<{ role: string; message: string; timestamp?: string }> = []
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          // Claude format: type = 'human' | 'assistant'
          if (parsed.type === 'human' || parsed.type === 'assistant') {
            const message = typeof parsed.message === 'string'
              ? parsed.message
              : parsed.message?.content
                ? (Array.isArray(parsed.message.content)
                  ? parsed.message.content
                      .filter((block: { type: string }) => block.type === 'text')
                      .map((block: { text: string }) => block.text)
                      .join('\n')
                  : String(parsed.message.content))
                : ''
            if (message.trim()) {
              entries.push({
                role: parsed.type,
                message,
                timestamp: parsed.timestamp,
              })
            }
          }
          // Codex format: type = 'item.completed' with item.type = 'agent_message' | 'user_message'
          else if (parsed.type === 'item.completed' && parsed.item) {
            const itemType = parsed.item.type
            if (itemType === 'user_message' || itemType === 'agent_message') {
              const message = parsed.item.text || ''
              if (message.trim()) {
                entries.push({
                  role: itemType === 'user_message' ? 'human' : 'assistant',
                  message,
                  timestamp: parsed.timestamp,
                })
              }
            }
          }
          // Copilot format: type = 'user.message' | 'assistant.message'
          else if (parsed.type === 'user.message' && parsed.data?.content) {
            const message = typeof parsed.data.content === 'string' ? parsed.data.content : ''
            if (message.trim()) {
              entries.push({
                role: 'human',
                message,
                timestamp: parsed.timestamp,
              })
            }
          } else if (parsed.type === 'assistant.message' && parsed.data?.content) {
            const message = typeof parsed.data.content === 'string' ? parsed.data.content : ''
            if (message.trim()) {
              entries.push({
                role: 'assistant',
                message,
                timestamp: parsed.timestamp,
              })
            }
          }
        } catch {
          // skip malformed lines
        }
      }
      setConversationContent(entries)
    } catch {
      setConversationError(t('kanban.conversationHistoryErrorRead'))
    } finally {
      setConversationLoading(false)
    }
  }, [task.conversationHistoryPath, t])

  if (!task.conversationHistoryPath) return null

  return (
    <>
      <div className="kanban-detail-section">
        <span className="kanban-detail-section-title">{t('kanban.conversationHistory')}</span>
        <div className="kanban-detail-conversation">
          <span className="kanban-detail-conversation-path" title={task.conversationHistoryPath}>
            {task.conversationHistoryPath.split(/[\\/]/).pop()}
          </span>
          <button
            className="kanban-detail-conversation-view-btn"
            onClick={openConversationHistory}
            title={t('kanban.conversationHistoryView')}
          >
            {t('kanban.conversationHistoryView')}
          </button>
        </div>
      </div>

      {/* Conversation History Modal */}
      {showConversationHistory && (
        <div className="modal-overlay" onClick={() => setShowConversationHistory(false)}>
          <div className="conversation-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="conversation-history-modal-header">
              <h3>{t('kanban.conversationHistory')}</h3>
              <span className="conversation-history-modal-filename">
                {task.conversationHistoryPath?.split(/[\\/]/).pop()}
              </span>
              <button className="kanban-detail-close" onClick={() => setShowConversationHistory(false)}>&times;</button>
            </div>
            <div className="conversation-history-modal-body">
              {conversationLoading && (
                <div className="conversation-history-loading">{t('kanban.conversationHistoryLoading')}</div>
              )}
              {conversationError && (
                <div className="conversation-history-error">{conversationError}</div>
              )}
              {!conversationLoading && !conversationError && conversationContent.length === 0 && (
                <div className="conversation-history-empty">{t('kanban.conversationHistoryEmpty')}</div>
              )}
              {conversationContent.map((entry, index) => (
                <div key={index} className={`conversation-history-entry conversation-history-entry--${entry.role}`}>
                  <div className="conversation-history-entry-header">
                    <span className="conversation-history-entry-role">
                      {entry.role === 'human' ? t('kanban.conversationRoleUser') : t('kanban.conversationRoleAssistant')}
                    </span>
                    {entry.timestamp && (
                      <span className="conversation-history-entry-time">
                        {new Date(entry.timestamp).toLocaleString(localeCode)}
                      </span>
                    )}
                  </div>
                  <pre className="conversation-history-entry-message">{entry.message}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
