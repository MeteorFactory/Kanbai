import { useCallback, useState } from 'react'
import { useDevOpsStore } from './devops-store'
import { useI18n } from '../../lib/i18n'
import { pushNotification } from '../../lib/stores/notificationStore'
import { StatusDot } from './devops-icons'
import { formatRelativeTime } from './devops-utils'
import { InlineStageDetail } from './stage-detail'
import type {
  DevOpsConnection,
  PipelineRun,
  PipelineApproval,
} from '../../../shared/types'

export function PipelineRunsDetail({
  runs,
  loading,
  pipelineName,
  activeConnection,
  onCreateTicket,
  onReplay,
}: {
  runs: PipelineRun[]
  loading: boolean
  pipelineName: string
  activeConnection: DevOpsConnection | null
  onCreateTicket: (title: string, description: string) => void
  onReplay: (run: PipelineRun) => void
}) {
  const { t } = useI18n()
  const {
    expandedRunId,
    runStages,
    stagesLoading,
    allRunApprovals,
    approving,
    expandRun,
    collapseRun,
    approveRun,
  } = useDevOpsStore()

  const [approvalComment, setApprovalComment] = useState('')
  const [inlineApprovalRunId, setInlineApprovalRunId] = useState<number | null>(null)

  const handleToggleRun = useCallback((buildId: number) => {
    if (!activeConnection) return
    if (expandedRunId === buildId) {
      collapseRun()
    } else {
      expandRun(activeConnection, buildId)
    }
  }, [activeConnection, expandedRunId, expandRun, collapseRun])

  const handleApprove = useCallback(async (approvalId: string, status: 'approved' | 'rejected') => {
    if (!activeConnection) return
    const result = await approveRun(activeConnection, approvalId, status, approvalComment || undefined)
    if (result.success) {
      setApprovalComment('')
    } else {
      pushNotification('error', t('devops.approvalFailed'), result.error ?? 'Unknown error')
    }
  }, [activeConnection, approveRun, approvalComment, t])

  if (loading) {
    return <div className="devops-runs-loading">{t('devops.loadingRuns')}</div>
  }

  if (runs.length === 0) {
    return <div className="devops-runs-empty">{t('devops.noRuns')}</div>
  }

  // Build pending approvals map from allRunApprovals (loaded with pipeline runs)
  const pendingApprovalsByBuild = new Map<number, PipelineApproval[]>()
  for (const approval of allRunApprovals) {
    if (approval.status === 'pending') {
      const existing = pendingApprovalsByBuild.get(approval.buildId) ?? []
      existing.push(approval)
      pendingApprovalsByBuild.set(approval.buildId, existing)
    }
  }

  return (
    <div className="devops-runs-detail">
      <h4>{pipelineName} - {t('devops.recentRuns')}</h4>
      <div className="devops-runs-list">
        {runs.map((run) => {
          const isExpanded = expandedRunId === run.id
          const pendingApprovals = pendingApprovalsByBuild.get(run.id) ?? []
          const hasPendingApprovals = pendingApprovals.length > 0

          return (
            <div key={run.id} className={`devops-run-item${hasPendingApprovals ? ' devops-run-item--pending' : ''}`}>
              <div
                className={`devops-run-row devops-run-row--expandable${isExpanded ? ' devops-run-row--expanded' : ''}`}
                onClick={() => handleToggleRun(run.id)}
              >
                <span className={`devops-run-expand-icon${isExpanded ? ' devops-run-expand-icon--open' : ''}`}>{'\u25B6'}</span>
                <StatusDot status={run.status} size={9} />
                <span className="devops-run-name">#{run.name}</span>
                <span className="devops-run-branch">{run.sourceBranch}</span>
                <span className="devops-run-time">{formatRelativeTime(run.finishTime ?? run.startTime)}</span>
                <span className="devops-run-by">{run.requestedBy}</span>
                {hasPendingApprovals && (
                  <span
                    className={`devops-run-approval-badge${inlineApprovalRunId === run.id ? ' devops-run-approval-badge--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setInlineApprovalRunId(inlineApprovalRunId === run.id ? null : run.id)
                    }}
                  >
                    {t('devops.pendingApproval')}
                  </span>
                )}
                <button
                  className="devops-btn devops-btn--small"
                  onClick={(e) => { e.stopPropagation(); onReplay(run) }}
                  title={t('devops.replay')}
                >
                  {'\u21BB'}
                </button>
                {run.url && (
                  <button
                    className="devops-btn devops-btn--small"
                    onClick={(e) => { e.stopPropagation(); window.kanbai.shell.openExternal(run.url) }}
                    title="Open in browser"
                  >
                    {'\u2197'}
                  </button>
                )}
              </div>

              {/* Inline approval actions — visible on badge click */}
              {inlineApprovalRunId === run.id && !isExpanded && hasPendingApprovals && (
                <div className="devops-run-inline-approvals">
                  {pendingApprovals.map((approval) => (
                    <div key={approval.id} className="devops-inline-approval">
                      <div className="devops-inline-approval-info">
                        {approval.instructions && (
                          <span className="devops-inline-approval-instructions">{approval.instructions}</span>
                        )}
                        <span className="devops-inline-approval-assignees">
                          {approval.steps.map((s) => s.assignedApprover).join(', ')}
                        </span>
                      </div>
                      <div className="devops-inline-approval-actions">
                        <input
                          className="devops-approval-comment devops-approval-comment--inline"
                          type="text"
                          placeholder={t('devops.approvalComment')}
                          value={approvalComment}
                          onChange={(e) => setApprovalComment(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          className="devops-btn devops-btn--approve"
                          disabled={approving === approval.id}
                          onClick={(e) => { e.stopPropagation(); handleApprove(approval.id, 'approved') }}
                        >
                          {approving === approval.id ? '...' : t('devops.approve')}
                        </button>
                        <button
                          className="devops-btn devops-btn--reject"
                          disabled={approving === approval.id}
                          onClick={(e) => { e.stopPropagation(); handleApprove(approval.id, 'rejected') }}
                        >
                          {t('devops.reject')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && (
                <div className="devops-run-expanded">
                  {/* Parameters */}
                  {Object.keys(run.parameters ?? {}).length > 0 && (
                    <div className="devops-params-display">
                      <h5>{t('devops.parameters')}</h5>
                      <div className="devops-params-list">
                        {Object.entries(run.parameters).map(([key, value]) => (
                          <div key={key} className="devops-param-display-row">
                            <span className="devops-param-display-key">{key}</span>
                            <span className="devops-param-display-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stages */}
                  <div className="devops-stages-section">
                    <h5>{t('devops.stages')}</h5>
                    <InlineStageDetail
                      stages={runStages}
                      loading={stagesLoading}
                      buildId={run.id}
                      activeConnection={activeConnection}
                      pipelineName={pipelineName}
                      onCreateTicket={onCreateTicket}
                    />
                  </div>

                  {/* Approvals — detailed view when expanded */}
                  {hasPendingApprovals && (
                    <div className="devops-approvals-section">
                      <h5>{t('devops.approvals')}</h5>
                      {pendingApprovals.map((approval) => (
                        <div key={approval.id} className="devops-approval-card">
                          {approval.instructions && (
                            <p className="devops-approval-instructions">{approval.instructions}</p>
                          )}
                          <div className="devops-approval-assignees">
                            {approval.steps.map((step, idx) => (
                              <span key={idx} className={`devops-approval-assignee devops-approval-assignee--${step.status}`}>
                                {step.assignedApprover}
                                {step.status !== 'pending' && ` (${step.status})`}
                              </span>
                            ))}
                          </div>
                          <div className="devops-approval-actions">
                            <input
                              className="devops-approval-comment"
                              type="text"
                              placeholder={t('devops.approvalComment')}
                              value={approvalComment}
                              onChange={(e) => setApprovalComment(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              className="devops-btn devops-btn--approve"
                              disabled={approving === approval.id}
                              onClick={(e) => { e.stopPropagation(); handleApprove(approval.id, 'approved') }}
                            >
                              {approving === approval.id ? '...' : t('devops.approve')}
                            </button>
                            <button
                              className="devops-btn devops-btn--reject"
                              disabled={approving === approval.id}
                              onClick={(e) => { e.stopPropagation(); handleApprove(approval.id, 'rejected') }}
                            >
                              {t('devops.reject')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
