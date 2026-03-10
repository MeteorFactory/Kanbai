import { useEffect, useCallback, useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDevOpsStore, selectGlobalPipelineStatus } from '../lib/stores/devopsStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import type {
  DevOpsConnection,
  DevOpsAuth,
  DevOpsAuthMethod,
  PipelineDefinition,
  PipelineRun,
  PipelineStage,
  PipelineStatus,
  StageStatus,
  PipelineApproval,
} from '../../shared/types'
import '../styles/devops.css'

type DevOpsSubTab = 'pipelines'
type ModalStep = 'provider' | 'form'

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '-'
  const date = new Date(isoString)
  const now = Date.now()
  const diffSec = Math.floor((now - date.getTime()) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

function formatDuration(startTime: string | null, finishTime: string | null): string {
  if (!startTime) return '-'
  const start = new Date(startTime).getTime()
  const end = finishTime ? new Date(finishTime).getTime() : Date.now()
  const diffSec = Math.floor((end - start) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) {
    const minutes = Math.floor(diffSec / 60)
    const seconds = diffSec % 60
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  const hours = Math.floor(diffSec / 3600)
  const minutes = Math.floor((diffSec % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function statusIcon(status: PipelineStatus): string {
  switch (status) {
    case 'succeeded': return '\u2705'
    case 'failed': return '\u274C'
    case 'canceled': return '\u26D4'
    case 'running': return '\u23F3'
    case 'notStarted': return '\u23F8\uFE0F'
    default: return '\u2753'
  }
}

function stageStatusIcon(status: StageStatus): string {
  switch (status) {
    case 'succeeded': return '\u2705'
    case 'failed': return '\u274C'
    case 'canceled': return '\u26D4'
    case 'running': return '\u23F3'
    case 'pending': return '\u23F8\uFE0F'
    case 'notStarted': return '\u2B58'
    default: return '\u2753'
  }
}

function statusClassName(status: PipelineStatus): string {
  return `devops-status devops-status--${status}`
}

// --- Azure DevOps SVG Icon ---

function AzureDevOpsIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 3.762v10.135l-4.574 4.103-6.326-2.2v2.145L2.4 13.143l11.085.831V3.62L17 3.762zM13.113 4.478L8.3 1v2.1L3.113 4.983.9 7.483v5.084l2.1.745V7.1l10.113-2.622z" fill="#0078D7"/>
    </svg>
  )
}

// --- Provider Selection Step ---

function ProviderSelection({
  onSelect,
  onClose,
}: {
  onSelect: (provider: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="devops-modal-overlay" onClick={onClose}>
      <div className="devops-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="devops-modal-header">
          <h3>{t('devops.selectProvider')}</h3>
          <button className="devops-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <p className="devops-modal-desc">{t('devops.selectProviderDesc')}</p>
        <div className="devops-provider-list">
          <button
            className="devops-provider-item"
            onClick={() => onSelect('azure-devops')}
          >
            <div className="devops-provider-item-icon">
              <AzureDevOpsIcon size={32} />
            </div>
            <div className="devops-provider-item-text">
              <span className="devops-provider-item-name">Azure DevOps</span>
              <span className="devops-provider-item-desc">{t('devops.azureDevOpsDesc')}</span>
            </div>
            <svg className="devops-provider-item-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="devops-modal-footer">
          <button className="devops-modal-btn devops-modal-btn--secondary" onClick={onClose}>
            {t('devops.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Connection Form Modal ---

function ConnectionFormModal({
  onSave,
  onClose,
  onBack,
  initial,
}: {
  onSave: (data: { name: string; organizationUrl: string; projectName: string; auth: DevOpsAuth }) => void
  onClose: () => void
  onBack?: () => void
  initial?: DevOpsConnection
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [organizationUrl, setOrganizationUrl] = useState(initial?.organizationUrl ?? '')
  const [projectName, setProjectName] = useState(initial?.projectName ?? '')
  const [authMethod, setAuthMethod] = useState<DevOpsAuthMethod>(initial?.auth.method ?? 'pat')
  const [pat, setPat] = useState(initial?.auth.method === 'pat' ? initial.auth.token : '')
  const [clientId, setClientId] = useState(initial?.auth.method === 'oauth2' ? initial.auth.clientId : '')
  const [clientSecret, setClientSecret] = useState(initial?.auth.method === 'oauth2' ? initial.auth.clientSecret : '')
  const [tenantId, setTenantId] = useState(initial?.auth.method === 'oauth2' ? initial.auth.tenantId : '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const buildAuth = useCallback((): DevOpsAuth => {
    if (authMethod === 'pat') {
      return { method: 'pat', token: pat }
    }
    return { method: 'oauth2', clientId, clientSecret, tenantId }
  }, [authMethod, pat, clientId, clientSecret, tenantId])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    const auth = buildAuth()
    const connection: DevOpsConnection = {
      id: 'test',
      name,
      organizationUrl: organizationUrl.replace(/\/$/, ''),
      projectName,
      auth,
      createdAt: 0,
      updatedAt: 0,
    }
    const result = await window.kanbai.devops.testConnection(connection)
    setTestResult(result)
    setTesting(false)
  }, [name, organizationUrl, projectName, buildAuth])

  const handleSubmit = useCallback(() => {
    onSave({
      name: name.trim(),
      organizationUrl: organizationUrl.replace(/\/$/, ''),
      projectName: projectName.trim(),
      auth: buildAuth(),
    })
  }, [name, organizationUrl, projectName, buildAuth, onSave])

  const isValid = name.trim() && organizationUrl.trim() && projectName.trim() &&
    (authMethod === 'pat' ? pat.trim() : (clientId.trim() && clientSecret.trim() && tenantId.trim()))

  return (
    <div className="devops-modal-overlay" onClick={onClose}>
      <div className="devops-modal-container devops-modal-container--form" onClick={(e) => e.stopPropagation()}>
        <div className="devops-modal-header">
          <div className="devops-modal-header-left">
            {onBack && (
              <button className="devops-modal-back" onClick={onBack} title={t('devops.back')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <AzureDevOpsIcon size={22} />
            <h3>{initial ? t('devops.editConnection') : t('devops.addConnection')}</h3>
          </div>
          <button className="devops-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="devops-modal-body">
          <div className="devops-field">
            <label className="devops-field-label">{t('devops.connectionName')}</label>
            <input
              className="devops-field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Azure DevOps"
            />
          </div>

          <div className="devops-field">
            <label className="devops-field-label">{t('devops.organizationUrl')}</label>
            <input
              className="devops-field-input"
              value={organizationUrl}
              onChange={(e) => setOrganizationUrl(e.target.value)}
              placeholder="https://dev.azure.com/myorg"
            />
          </div>

          <div className="devops-field">
            <label className="devops-field-label">{t('devops.projectName')}</label>
            <input
              className="devops-field-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="MyProject"
            />
          </div>

          <div className="devops-field">
            <label className="devops-field-label">{t('devops.authMethod')}</label>
            <div className="devops-auth-toggle">
              <button
                className={`devops-auth-btn${authMethod === 'pat' ? ' devops-auth-btn--active' : ''}`}
                onClick={() => setAuthMethod('pat')}
              >
                PAT
              </button>
              <button
                className={`devops-auth-btn${authMethod === 'oauth2' ? ' devops-auth-btn--active' : ''}`}
                onClick={() => setAuthMethod('oauth2')}
              >
                OAuth2
              </button>
            </div>
          </div>

          {authMethod === 'pat' ? (
            <div className="devops-field">
              <label className="devops-field-label">Personal Access Token</label>
              <input
                className="devops-field-input"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          ) : (
            <>
              <div className="devops-field">
                <label className="devops-field-label">Tenant ID</label>
                <input
                  className="devops-field-input"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="devops-field">
                <label className="devops-field-label">Client ID</label>
                <input
                  className="devops-field-input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="devops-field">
                <label className="devops-field-label">Client Secret</label>
                <input
                  className="devops-field-input"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="..."
                />
              </div>
            </>
          )}

          {testResult && (
            <div className={`devops-test-result devops-test-result--${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? t('devops.connectionSuccess') : `${t('devops.connectionFailed')}: ${testResult.error}`}
            </div>
          )}
        </div>
        <div className="devops-modal-footer">
          <button
            className="devops-modal-btn devops-modal-btn--test"
            onClick={handleTest}
            disabled={!isValid || testing}
          >
            {testing ? t('devops.testing') : t('devops.testConnection')}
          </button>
          <div className="devops-modal-footer-right">
            <button className="devops-modal-btn devops-modal-btn--secondary" onClick={onClose}>
              {t('devops.cancel')}
            </button>
            <button
              className="devops-modal-btn devops-modal-btn--primary"
              onClick={handleSubmit}
              disabled={!isValid}
            >
              {t('devops.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Pipeline Card ---

function PipelineCard({
  pipeline,
  index,
  isSelected,
  onSelect,
  onRun,
  onOpenUrl,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}: {
  pipeline: PipelineDefinition
  index: number
  isSelected: boolean
  onSelect: () => void
  onRun: () => void
  onOpenUrl: () => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  isDragOver: boolean
}) {
  const latestRun = pipeline.latestRun
  const status = latestRun?.status ?? 'unknown'

  return (
    <div
      className={`devops-pipeline-card${isSelected ? ' devops-pipeline-card--selected' : ''}${isDragOver ? ' devops-pipeline-card--drag-over' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <div className="devops-pipeline-card-header">
        <span className="devops-pipeline-card-drag-handle">{'\u2261'}</span>
        <span className={statusClassName(status)}>{statusIcon(status)}</span>
        <span className="devops-pipeline-card-name">{pipeline.name}</span>
        {pipeline.folder !== '\\' && (
          <span className="devops-pipeline-card-folder">{pipeline.folder}</span>
        )}
      </div>
      {latestRun && (
        <div className="devops-pipeline-card-info">
          <span className="devops-pipeline-card-branch">{latestRun.sourceBranch}</span>
          <span className="devops-pipeline-card-time">{formatRelativeTime(latestRun.finishTime ?? latestRun.startTime)}</span>
          <span className="devops-pipeline-card-by">{latestRun.requestedBy}</span>
        </div>
      )}
      <div className="devops-pipeline-card-actions">
        <button className="devops-btn devops-btn--small" onClick={(e) => { e.stopPropagation(); onRun() }} title="Run pipeline">
          {'\u25B6'}
        </button>
        {pipeline.url && (
          <button className="devops-btn devops-btn--small" onClick={(e) => { e.stopPropagation(); onOpenUrl() }} title="Open in browser">
            {'\u2197'}
          </button>
        )}
      </div>
    </div>
  )
}

// --- Inline Stage Detail (expandable within run) ---

function InlineStageDetail({
  stages,
  loading,
  buildId,
  activeConnection,
}: {
  stages: PipelineStage[]
  loading: boolean
  buildId: number | null
  activeConnection: DevOpsConnection | null
}) {
  const { t } = useI18n()
  const { jobLogs, jobLogsLoading, loadJobLog } = useDevOpsStore()
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  // Auto-expand the first failed stage
  useEffect(() => {
    if (stages.length === 0) return
    const failedStage = stages.find((s) => s.status === 'failed')
    if (failedStage) {
      setExpandedStageId(failedStage.id)
    }
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

  const handleViewLogs = (jobId: string, logId: number | null) => {
    if (!activeConnection || !buildId || !logId) return
    if (expandedJobId === jobId) {
      setExpandedJobId(null)
    } else {
      setExpandedJobId(jobId)
      loadJobLog(activeConnection, buildId, jobId, logId)
    }
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
          </div>
          <div className="devops-error-summary-list">
            {allErrors.map((err, idx) => (
              <div key={idx} className="devops-error-summary-item">
                <span className="devops-error-summary-location">{err.stageName} / {err.jobName}</span>
                <span className="devops-error-summary-message">{err.message}</span>
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
              <span className="devops-stage-duration">{formatDuration(stage.startTime, stage.finishTime)}</span>
            </div>
            {isExpanded && (
              <div className="devops-stage-expanded">
                {stage.jobs.length > 0 && (
                  <div className="devops-jobs-list">
                    {stage.jobs.map((job) => {
                      const isJobExpanded = expandedJobId === job.id
                      const logContent = jobLogs[job.id]
                      const logLoading = jobLogsLoading[job.id]

                      return (
                        <div key={job.id} className="devops-job-item">
                          <div className="devops-job-row">
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
                                className={`devops-btn devops-btn--small devops-btn--log${isJobExpanded ? ' devops-btn--log-active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleViewLogs(job.id, job.logId) }}
                                title={t('devops.viewLogs')}
                              >
                                {'\uD83D\uDCCB'}
                              </button>
                            )}
                          </div>
                          {job.issues.length > 0 && (
                            <div className="devops-job-issues">
                              {job.issues.map((issue, idx) => (
                                <div key={idx} className={`devops-issue devops-issue--${issue.type}`}>
                                  <span className="devops-issue-icon">{issue.type === 'error' ? '\u274C' : '\u26A0\uFE0F'}</span>
                                  <span className="devops-issue-message">{issue.message}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {isJobExpanded && (
                            <div className="devops-job-log">
                              {logLoading ? (
                                <div className="devops-job-log-loading">{t('devops.loadingLogs')}</div>
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

// --- Pipeline Runs Detail ---

function PipelineRunsDetail({
  runs,
  loading,
  pipelineName,
  activeConnection,
}: {
  runs: PipelineRun[]
  loading: boolean
  pipelineName: string
  activeConnection: DevOpsConnection | null
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
    await approveRun(activeConnection, approvalId, status, approvalComment || undefined)
    setApprovalComment('')
  }, [activeConnection, approveRun, approvalComment])

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
                <span className={statusClassName(run.status)}>{statusIcon(run.status)}</span>
                <span className="devops-run-name">#{run.name}</span>
                <span className="devops-run-branch">{run.sourceBranch}</span>
                <span className="devops-run-time">{formatRelativeTime(run.finishTime ?? run.startTime)}</span>
                <span className="devops-run-by">{run.requestedBy}</span>
                {hasPendingApprovals && (
                  <span className="devops-run-approval-badge">{t('devops.pendingApproval')}</span>
                )}
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

              {/* Inline approval actions — visible without expanding */}
              {hasPendingApprovals && !isExpanded && (
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
                  {/* Stages */}
                  <div className="devops-stages-section">
                    <h5>{t('devops.stages')}</h5>
                    <InlineStageDetail
                      stages={runStages}
                      loading={stagesLoading}
                      buildId={run.id}
                      activeConnection={activeConnection}
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

// --- Main Panel ---

export function DevOpsPanel() {
  const { t } = useI18n()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [workspacePath, setWorkspacePath] = useState('')
  const [subTab] = useState<DevOpsSubTab>('pipelines')
  const [modalStep, setModalStep] = useState<ModalStep | null>(null)
  const [editingConnection, setEditingConnection] = useState<DevOpsConnection | null>(null)

  const {
    data,
    loading,
    activeConnectionId,
    pipelines,
    pipelinesLoading,
    pipelinesError,
    selectedPipelineId,
    pipelineRuns,
    runsLoading,
    loadData,
    addConnection,
    updateConnection,
    deleteConnection,
    setActiveConnection,
    loadPipelines,
    selectPipeline,
    loadPipelineRuns,
    runPipeline,
    startMonitoring,
    stopMonitoring,
    reorderPipelines,
  } = useDevOpsStore()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  const activeConnection = useMemo(
    () => data?.connections.find((c) => c.id === activeConnectionId) ?? null,
    [data, activeConnectionId],
  )

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId],
  )

  // Resolve workspace env path
  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspacePath('')
      return
    }
    window.kanbai.workspaceEnv.getPath(activeWorkspace.name).then((envPath) => {
      setWorkspacePath(envPath ?? '')
    })
  }, [activeWorkspace])

  // Load data when workspace path changes
  useEffect(() => {
    if (!workspacePath) return
    loadData(workspacePath)
  }, [workspacePath, loadData])

  // Load pipelines and start monitoring when active connection changes
  useEffect(() => {
    if (!activeConnection) return
    loadPipelines(activeConnection)
    startMonitoring(activeConnection)
    return () => { stopMonitoring() }
  }, [activeConnection, loadPipelines, startMonitoring, stopMonitoring])

  // Load pipeline runs when selected pipeline changes
  useEffect(() => {
    if (!activeConnection || !selectedPipelineId) return
    loadPipelineRuns(activeConnection, selectedPipelineId)
  }, [activeConnection, selectedPipelineId, loadPipelineRuns])

  const closeModal = useCallback(() => {
    setModalStep(null)
    setEditingConnection(null)
  }, [])

  const openNewConnection = useCallback(() => {
    setEditingConnection(null)
    setModalStep('provider')
  }, [])

  const openEditConnection = useCallback(() => {
    if (activeConnection) {
      setEditingConnection(activeConnection)
      setModalStep('form')
    }
  }, [activeConnection])

  const handleProviderSelect = useCallback((_provider: string) => {
    setModalStep('form')
  }, [])

  const handleSaveConnection = useCallback(
    async (formData: { name: string; organizationUrl: string; projectName: string; auth: DevOpsAuth }) => {
      if (editingConnection) {
        await updateConnection(workspacePath, editingConnection.id, formData)
      } else {
        await addConnection(workspacePath, formData)
      }
      closeModal()
    },
    [workspacePath, editingConnection, addConnection, updateConnection, closeModal],
  )

  const handleDeleteConnection = useCallback(
    async (id: string) => {
      if (!confirm(t('devops.deleteConnectionConfirm'))) return
      await deleteConnection(workspacePath, id)
    },
    [workspacePath, deleteConnection, t],
  )

  const handleRunPipeline = useCallback(
    async (pipelineId: number) => {
      if (!activeConnection) return
      const result = await runPipeline(activeConnection, pipelineId)
      if (!result.success) {
        console.error('[DevOps] Run pipeline failed:', result.error)
      }
    },
    [activeConnection, runPipeline],
  )

  const handleOpenPipelineUrl = useCallback(
    (url: string) => {
      if (url) window.kanbai.shell.openExternal(url)
    },
    [],
  )

  const globalStatus = useDevOpsStore(useShallow(selectGlobalPipelineStatus))

  const handleRefresh = useCallback(() => {
    if (!activeConnection) return
    loadPipelines(activeConnection)
    if (selectedPipelineId) {
      loadPipelineRuns(activeConnection, selectedPipelineId)
    }
  }, [activeConnection, selectedPipelineId, loadPipelines, loadPipelineRuns])

  const handlePipelineDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handlePipelineDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dragIndex !== null && dragIndex !== index) {
        setDropTarget(index)
      }
    },
    [dragIndex],
  )

  const handlePipelineDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      if (dragIndex !== null && dragIndex !== toIndex && workspacePath) {
        reorderPipelines(workspacePath, dragIndex, toIndex)
      }
      setDragIndex(null)
      setDropTarget(null)
    },
    [dragIndex, workspacePath, reorderPipelines],
  )

  const handlePipelineDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropTarget(null)
  }, [])

  if (!activeWorkspace) {
    return (
      <div className="devops-panel">
        <div className="devops-empty">{t('devops.noWorkspace')}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="devops-panel">
        <div className="devops-loading">{t('devops.loading')}</div>
      </div>
    )
  }

  return (
    <div className="devops-panel">
      {/* Modal */}
      {modalStep === 'provider' && (
        <ProviderSelection
          onSelect={handleProviderSelect}
          onClose={closeModal}
        />
      )}
      {modalStep === 'form' && (
        <ConnectionFormModal
          initial={editingConnection ?? undefined}
          onSave={handleSaveConnection}
          onClose={closeModal}
          onBack={editingConnection ? undefined : () => setModalStep('provider')}
        />
      )}

      {/* Header */}
      <div className="devops-header">
        <h2>{t('devops.pipelines')}</h2>
        {globalStatus && (
          <div className={`devops-global-status devops-global-status--${globalStatus.status}`} title={globalStatus.pipelineName}>
            <span className={statusClassName(globalStatus.status)}>{statusIcon(globalStatus.status)}</span>
            <span className="devops-global-status-label">{globalStatus.pipelineName}</span>
          </div>
        )}
        <div className="devops-header-actions">
          <button className="devops-btn devops-btn--primary" onClick={openNewConnection}>
            + {t('devops.addConnection')}
          </button>
        </div>
      </div>

      {/* Connection selector */}
      {data && data.connections.length > 0 && (
        <div className="devops-connection-bar">
          <select
            className="devops-connection-select"
            value={activeConnectionId ?? ''}
            onChange={(e) => setActiveConnection(e.target.value || null)}
          >
            {data.connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.projectName})</option>
            ))}
          </select>
          <button className="devops-btn devops-btn--small" onClick={openEditConnection} title={t('devops.editConnection')}>
            {'\u270E'}
          </button>
          <button className="devops-btn devops-btn--small" onClick={() => { if (activeConnectionId) handleDeleteConnection(activeConnectionId) }} title={t('devops.deleteConnection')}>
            {'\u2716'}
          </button>
          <button className="devops-btn devops-btn--small" onClick={handleRefresh} title={t('devops.refresh')}>
            {'\u21BB'}
          </button>
        </div>
      )}

      {/* No connections — empty state */}
      {(!data || data.connections.length === 0) && (
        <div className="devops-empty-state">
          <AzureDevOpsIcon size={56} />
          <h3>{t('devops.noConnectionsTitle')}</h3>
          <p>{t('devops.noConnections')}</p>
          <button className="devops-btn devops-btn--primary" onClick={openNewConnection}>
            + {t('devops.addConnection')}
          </button>
        </div>
      )}

      {/* Pipelines content */}
      {activeConnection && subTab === 'pipelines' && (
        <div className="devops-content">
          <div className="devops-pipelines-list">
            {pipelinesLoading && <div className="devops-loading">{t('devops.loadingPipelines')}</div>}
            {pipelinesError && <div className="devops-error">{pipelinesError}</div>}
            {!pipelinesLoading && !pipelinesError && pipelines.length === 0 && (
              <div className="devops-empty">{t('devops.noPipelines')}</div>
            )}
            {pipelines.map((pipeline, index) => (
              <PipelineCard
                key={pipeline.id}
                pipeline={pipeline}
                index={index}
                isSelected={selectedPipelineId === pipeline.id}
                onSelect={() => selectPipeline(pipeline.id)}
                onRun={() => handleRunPipeline(pipeline.id)}
                onOpenUrl={() => handleOpenPipelineUrl(pipeline.url)}
                onDragStart={handlePipelineDragStart}
                onDragOver={handlePipelineDragOver}
                onDrop={handlePipelineDrop}
                onDragEnd={handlePipelineDragEnd}
                isDragOver={dropTarget === index}
              />
            ))}
          </div>
          <div className="devops-detail-panel">
            {selectedPipeline ? (
              <PipelineRunsDetail
                runs={pipelineRuns}
                loading={runsLoading}
                pipelineName={selectedPipeline.name}
                activeConnection={activeConnection}
              />
            ) : (
              <div className="devops-empty">{t('devops.selectPipeline')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
