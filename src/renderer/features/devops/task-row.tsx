import { useState } from 'react'
import { useDevOpsStore } from './devops-store'
import { useI18n } from '../../lib/i18n'
import { statusIcon, formatDuration } from './devops-utils'
import { ErrorActions } from './error-actions'
import type { PipelineTask, DevOpsConnection } from '../../../shared/types'

export function TaskRow({
  task,
  buildId,
  activeConnection,
  pipelineName,
  stageName,
  jobName,
  onCreateTicket,
}: {
  task: PipelineTask
  buildId: number | null
  activeConnection: DevOpsConnection | null
  pipelineName?: string
  stageName: string
  jobName: string
  onCreateTicket: (title: string, description: string) => void
}) {
  const { t } = useI18n()
  const { jobLogs, jobLogsLoading, jobLogsError, loadJobLog } = useDevOpsStore()
  const [showLog, setShowLog] = useState(false)

  const logContent = jobLogs[task.id]
  const logLoading = jobLogsLoading[task.id]

  const handleViewLogs = () => {
    if (!activeConnection || !buildId || !task.logId) return
    if (showLog) {
      setShowLog(false)
    } else {
      setShowLog(true)
      loadJobLog(activeConnection, buildId, task.id, task.logId)
    }
  }

  const location = `${stageName} / ${jobName} / ${task.name}`

  return (
    <div className={`devops-task-item${task.status === 'failed' ? ' devops-task-item--failed' : ''}`}>
      <div
        className={`devops-task-row${task.logId ? ' devops-task-row--clickable' : ''}${showLog ? ' devops-task-row--active' : ''}`}
        onClick={task.logId ? handleViewLogs : undefined}
      >
        <span className={`devops-status devops-status--${task.status}`}>
          {statusIcon(task.status)}
        </span>
        <span className="devops-task-name">{task.name}</span>
        {task.errorCount > 0 && (
          <span className="devops-badge devops-badge--error">{task.errorCount}</span>
        )}
        {task.warningCount > 0 && (
          <span className="devops-badge devops-badge--warning">{task.warningCount}</span>
        )}
        <span className="devops-task-duration">{formatDuration(task.startTime, task.finishTime)}</span>
      </div>
      {task.issues.length > 0 && (
        <div className="devops-task-issues">
          {task.issues.map((issue, idx) => (
            <div key={idx} className={`devops-issue devops-issue--${issue.type}`}>
              <span className="devops-issue-icon">{issue.type === 'error' ? '\u274C' : '\u26A0\uFE0F'}</span>
              <span className="devops-issue-message">{issue.message}</span>
              {issue.type === 'error' && (
                <ErrorActions
                  message={issue.message}
                  location={location}
                  pipelineName={pipelineName}
                  onCreateTicket={onCreateTicket}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {showLog && (
        <div className="devops-job-log">
          {logLoading ? (
            <div className="devops-job-log-loading">{t('devops.loadingLogs')}</div>
          ) : jobLogsError[task.id] ? (
            <div className="devops-job-log-error">
              <span>{logContent}</span>
              <button
                className="devops-btn devops-btn--small"
                onClick={() => { if (activeConnection && buildId && task.logId) loadJobLog(activeConnection, buildId, task.id, task.logId) }}
              >
                {t('devops.retry')}
              </button>
            </div>
          ) : (
            <pre className="devops-job-log-content">{logContent ?? ''}</pre>
          )}
        </div>
      )}
    </div>
  )
}
