import React, { useCallback, useRef } from 'react'
import { useI18n } from '../../lib/i18n'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import type { KanbanTask, AiDefaults } from '../../../shared/types/index'
import { TYPE_CONFIG, PRIORITY_COLORS, formatTicketNumber } from './kanban-constants'

function parseProgress(p?: string): number | null {
  if (!p) return null
  const match = p.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) return null
  const [, current, total] = match
  if (Number(total) === 0) return 0
  return Math.min(100, Math.max(0, (Number(current!) / Number(total!)) * 100))
}

export function KanbanCard({
  task,
  isSelected,
  onDragStart,
  onClick,
  onDelete,
  onContextMenu,
  onDoubleClick,
  onGoToTerminal,
  projects,
  defaultAiProvider,
  agentProgress,
}: {
  task: KanbanTask
  isSelected: boolean
  onDragStart: () => void
  onClick: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onGoToTerminal: (() => void) | null
  projects: Array<{ id: string; name: string; aiProvider?: AiProviderId | null; aiDefaults?: AiDefaults }>
  defaultAiProvider: AiProviderId
  agentProgress?: { progress?: string; message?: string; phase?: string; activity?: { type: string; label: string; detail?: string }; subagents?: Array<{ name: string; status: string }> }
}) {
  const { t, locale, localeCode } = useI18n()
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delayed single-click: allows double-click to cancel opening the detail panel
  const handleCardClick = useCallback(() => {
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null
      onClick()
    }, 250)
  }, [onClick])

  const handleCardDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    onDoubleClick()
  }, [onDoubleClick])

  const isWorking = task.status === 'WORKING'
  const typeConf = TYPE_CONFIG[task.type ?? 'feature'] ?? TYPE_CONFIG.feature

  const targetProject = projects.find((p) => p.id === task.targetProjectId)
  const resolvedProvider: AiProviderId = task.aiProvider
    ?? targetProject?.aiDefaults?.kanban
    ?? targetProject?.aiProvider
    ?? defaultAiProvider
  const workingColor = AI_PROVIDERS[resolvedProvider].detectionColor

  return (
    <div
      className={`kanban-card${isSelected ? ' kanban-card--selected' : ''}${isWorking ? ' kanban-card--working' : ''}${task.disabled ? ' kanban-card--disabled' : ''}${task.isCtoTicket ? ' kanban-card--cto' : ''}${task.isPrequalifying ? ' kanban-card--prequalifying' : ''}`}
      style={isWorking ? { '--working-color': workingColor } as React.CSSProperties : undefined}
      draggable={!task.disabled}
      onDragStart={onDragStart}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="kanban-card-accent" style={{ backgroundColor: typeConf.color }} />
      <div className="kanban-card-inner">
        <div className="kanban-card-top-row">
          {task.ticketNumber != null && (
            <span className="kanban-card-ticket-number">{formatTicketNumber(task.ticketNumber, task.type, task.isPrequalifying)}</span>
          )}
          <span className="kanban-card-type-badge" style={{ color: typeConf.color, background: `${typeConf.color}1a` }}>
            {locale === 'en' ? typeConf.labelEn : typeConf.labelFr}
          </span>
          <span
            className="kanban-card-priority"
            style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
            title={task.priority}
          />
          <button
            className="kanban-card-delete"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title={t('common.delete')}
          >
            &times;
          </button>
        </div>
        <span className="kanban-card-title">{task.title}</span>
        <p className="kanban-card-desc">
          {task.description || t('kanban.noDescription')}
        </p>
        {task.isPrequalifying && (
          <span className="kanban-card-prequalifying">{t('kanban.prequalifyRunning')}</span>
        )}
        {task.prequalifyError && !task.isPrequalifying && (
          <span
            className="kanban-card-prequalify-error"
            title={task.prequalifyError.message}
          >
            {t('kanban.prequalifyFailed')}
          </span>
        )}
        {task.splitSuggestions && task.splitSuggestions.length > 0 && (
          <span className="kanban-card-split-badge">{t('kanban.splitDetected')}</span>
        )}
        {isWorking && agentProgress && (agentProgress.progress || agentProgress.activity || agentProgress.phase) && (
          <div className="kanban-card-progress">
            {agentProgress.phase && (
              <div className="kanban-card-phase" style={{ borderLeftColor: workingColor }}>
                {agentProgress.phase}
              </div>
            )}
            {agentProgress.progress && (
              <div className="kanban-card-progress-track">
                <div
                  className="kanban-card-progress-fill"
                  style={{
                    width: `${parseProgress(agentProgress.progress) ?? 0}%`,
                    backgroundColor: workingColor,
                  }}
                />
                <span className="kanban-card-progress-text" style={{ color: workingColor }}>
                  {agentProgress.progress}
                </span>
              </div>
            )}
            {agentProgress.activity && agentProgress.activity.type !== 'idle' && (
              <div className="kanban-card-activity">
                <span className={`kanban-card-activity-dot kanban-card-activity-dot--${agentProgress.activity.type}`} />
                <span className="kanban-card-activity-label">{agentProgress.activity.label}</span>
                {agentProgress.activity.detail && agentProgress.activity.detail.length > 2 && (
                  <span className="kanban-card-activity-detail">{agentProgress.activity.detail}</span>
                )}
              </div>
            )}
            {agentProgress.subagents && agentProgress.subagents.length > 0 && (
              <div className="kanban-card-subagents">
                {agentProgress.subagents.map((sa, i) => (
                  <div key={i} className="kanban-card-subagent">
                    <span className="kanban-card-subagent-branch">{i < agentProgress.subagents!.length - 1 ? '├' : '└'}</span>
                    <span className="kanban-card-subagent-name">{sa.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="kanban-card-footer">
          <span className="kanban-card-date" title={new Date(task.updatedAt).toLocaleString(localeCode)}>
            {new Date(task.updatedAt).toLocaleDateString(localeCode, { day: 'numeric', month: 'short' })}
            {' '}
            {new Date(task.updatedAt).toLocaleTimeString(localeCode, { hour: '2-digit', minute: '2-digit' })}
          </span>
          {onGoToTerminal && (
            <button
              className="kanban-card-terminal-btn"
              style={{ color: workingColor, background: `${workingColor}1a` }}
              onClick={(e) => { e.stopPropagation(); onGoToTerminal() }}
              title={t('kanban.goToTerminal')}
            >
              &#9002; {t('kanban.terminal')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
