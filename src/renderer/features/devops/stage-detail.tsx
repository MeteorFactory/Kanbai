import { useEffect, useCallback, useState } from 'react'
import { useDevOpsStore } from './devops-store'
import { useI18n } from '../../lib/i18n'
import { statusIcon, stageStatusIcon, formatStageDateTime, formatDuration } from './devops-utils'
import { ErrorActions } from './error-actions'
import { TaskRow } from './task-row'
import type { PipelineStage, DevOpsConnection } from '../../../shared/types'

export function InlineStageDetail({
  stages,
  loading,
  buildId,
  activeConnection,
  pipelineName,
  onCreateTicket,
}: {
  stages: PipelineStage[]
  loading: boolean
  buildId: number | null
  activeConnection: DevOpsConnection | null
  pipelineName?: string
  onCreateTicket: (title: string, description: string) => void
}) {
  const { t } = useI18n()
  const { jobLogs, jobLogsLoading, jobLogsError, loadJobLog } = useDevOpsStore()
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null)
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set())

  const toggleJob = useCallback((jobId: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      return next
    })
  }, [])

  // Reset expanded state when stages change (new run selected)
  useEffect(() => {
    setExpandedStageId(null)
    setExpandedJobIds(new Set())
  }, [stages])

  if (loading) {
    return <div className="devops-stages-loading">{t('devops.loadingStages')}</div>
  }

  if (stages.length === 0) {
    return <div className="devops-stages-empty">{t('devops.noStages')}</div>
  }

  // Collect all errors across stages for a summary
  const allErrors = stages.flatMap((stage) =>
    stage.jobs.flatMap((job) =>
      job.issues
        .filter((i) => i.type === 'error')
        .map((i) => ({ stageName: stage.name, jobName: job.name, message: i.message }))
    )
  )

  const handleViewJobLogs = (jobId: string, logId: number | null) => {
    if (!activeConnection || !buildId || !logId) return
    toggleJob(jobId)
    loadJobLog(activeConnection, buildId, jobId, logId)
  }

  const handleCopyAllErrors = () => {
    const text = allErrors.map((e) => `[${e.stageName} / ${e.jobName}] ${e.message}`).join('\n')
    navigator.clipboard.writeText(text)
  }

  const handleCreateTicketFromAllErrors = () => {
    const errorsText = allErrors.map((e) => `- **${e.stageName} / ${e.jobName}:** ${e.message}`).join('\n')
    const title = `[Pipeline${pipelineName ? ` ${pipelineName}` : ''}] ${allErrors.length} error${allErrors.length > 1 ? 's' : ''}`
    const description = `**Pipeline:** ${pipelineName ?? 'Unknown'}\n**Errors:**\n${errorsText}`
    onCreateTicket(title, description)
  }

  return (
    <div className="devops-stages-list">
      {/* Error summary for failed runs */}
      {allErrors.length > 0 && (
        <div className="devops-error-summary">
          <div className="devops-error-summary-header">
            <span className="devops-error-summary-icon">{'\u274C'}</span>
            <span className="devops-error-summary-title">
              {allErrors.length} {allErrors.length === 1 ? 'error' : 'errors'}
            </span>
            <span className="devops-error-summary-actions">
              <button
                className="devops-btn devops-btn--icon"
                onClick={handleCopyAllErrors}
                title={t('devops.copyAllErrors')}
              >
                {'\uD83D\uDCCB'}
              </button>
              <button
                className="devops-btn devops-btn--icon"
                onClick={handleCreateTicketFromAllErrors}
                title={t('devops.createTicketFromErrors')}
              >
                {'\uD83C\uDFAB'}
              </button>
            </span>
          </div>
          <div className="devops-error-summary-list">
            {allErrors.map((err, idx) => (
              <div key={idx} className="devops-error-summary-item">
                <div className="devops-error-summary-item-content">
                  <span className="devops-error-summary-location">{err.stageName} / {err.jobName}</span>
                  <span className="devops-error-summary-message">{err.message}</span>
                </div>
                <ErrorActions
                  message={err.message}
                  location={`${err.stageName} / ${err.jobName}`}
                  pipelineName={pipelineName}
                  onCreateTicket={onCreateTicket}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {stages.map((stage) => {
        const isExpanded = expandedStageId === stage.id
        const hasIssues = stage.errorCount > 0 || stage.warningCount > 0

        return (
          <div key={stage.id} className="devops-stage-item">
            <div
              className={`devops-stage-row${isExpanded ? ' devops-stage-row--expanded' : ''}${stage.status === 'failed' ? ' devops-stage-row--failed' : ''}`}
              onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
            >
              <span className={`devops-stage-expand-icon${isExpanded ? ' devops-stage-expand-icon--open' : ''}`}>{'\u25B6'}</span>
              <span className={`devops-status devops-status--${stage.status}`}>
                {stageStatusIcon(stage.status)}
              </span>
              <span className="devops-stage-name">{stage.name}</span>
              {hasIssues && (
                <span className="devops-stage-badges">
                  {stage.errorCount > 0 && (
                    <span className="devops-badge devops-badge--error">{stage.errorCount} {stage.errorCount === 1 ? 'error' : 'errors'}</span>
                  )}
                  {stage.warningCount > 0 && (
                    <span className="devops-badge devops-badge--warning">{stage.warningCount} {stage.warningCount === 1 ? 'warning' : 'warnings'}</span>
                  )}
                </span>
              )}
              {stage.startTime && (
                <span className="devops-stage-datetime">{formatStageDateTime(stage.startTime)}</span>
              )}
              <span className="devops-stage-duration">{formatDuration(stage.startTime, stage.finishTime)}</span>
            </div>
            {isExpanded && (
              <div className="devops-stage-expanded">
                {stage.jobs.length > 0 && (
                  <div className="devops-jobs-list">
                    {stage.jobs.map((job) => {
                      const isJobExpanded = expandedJobIds.has(job.id)
                      const logContent = jobLogs[job.id]
                      const logLoading = jobLogsLoading[job.id]
                      const showJobLog = isJobExpanded
                      const hasTasks = job.tasks.length > 0

                      return (
                        <div key={job.id} className={`devops-job-item${job.status === 'failed' ? ' devops-job-item--failed' : ''}`}>
                          <div
                            className={`devops-job-row${hasTasks ? ' devops-job-row--expandable' : ''}`}
                            onClick={() => { if (hasTasks) toggleJob(job.id) }}
                          >
                            {hasTasks && (
                              <span className={`devops-job-expand-icon${isJobExpanded ? ' devops-job-expand-icon--open' : ''}`}>{'\u25B6'}</span>
                            )}
                            <span className={`devops-status devops-status--${job.status}`}>
                              {statusIcon(job.status)}
                            </span>
                            <span className="devops-job-name">{job.name}</span>
                            {job.errorCount > 0 && (
                              <span className="devops-badge devops-badge--error">{job.errorCount}</span>
                            )}
                            {job.warningCount > 0 && (
                              <span className="devops-badge devops-badge--warning">{job.warningCount}</span>
                            )}
                            <span className="devops-job-duration">{formatDuration(job.startTime, job.finishTime)}</span>
                            {job.workerName && (
                              <span className="devops-job-worker" title={t('devops.worker')}>
                                {job.workerName}
                              </span>
                            )}
                            {job.logId && (
                              <button
                                className={`devops-btn devops-btn--small devops-btn--log${showJobLog ? ' devops-btn--log-active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleViewJobLogs(job.id, job.logId) }}
                                title={t('devops.viewLogs')}
                              >
                                {'\uD83D\uDCCB'}
                              </button>
                            )}
                          </div>

                          {/* Job-level issues (bubbled up from tasks) */}
                          {job.issues.length > 0 && !isJobExpanded && (
                            <div className="devops-job-issues">
                              {job.issues.map((issue, idx) => (
                                <div key={idx} className={`devops-issue devops-issue--${issue.type}`}>
                                  <span className="devops-issue-icon">{issue.type === 'error' ? '\u274C' : '\u26A0\uFE0F'}</span>
                                  <span className="devops-issue-message">{issue.message}</span>
                                  {issue.type === 'error' && (
                                    <ErrorActions
                                      message={issue.message}
                                      location={`${stage.name} / ${job.name}`}
                                      pipelineName={pipelineName}
                                      onCreateTicket={onCreateTicket}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Expanded: show tasks hierarchy */}
                          {isJobExpanded && hasTasks && (
                            <div className="devops-tasks-list">
                              {job.tasks.map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  buildId={buildId}
                                  activeConnection={activeConnection}
                                  pipelineName={pipelineName}
                                  stageName={stage.name}
                                  jobName={job.name}
                                  onCreateTicket={onCreateTicket}
                                />
                              ))}
                            </div>
                          )}

                          {/* Job-level log viewer */}
                          {showJobLog && (
                            <div className="devops-job-log">
                              {logLoading ? (
                                <div className="devops-job-log-loading">{t('devops.loadingLogs')}</div>
                              ) : jobLogsError[job.id] ? (
                                <div className="devops-job-log-error">
                                  <span>{logContent}</span>
                                  <button
                                    className="devops-btn devops-btn--small"
                                    onClick={() => { if (activeConnection && buildId && job.logId) loadJobLog(activeConnection, buildId, job.id, job.logId) }}
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
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
