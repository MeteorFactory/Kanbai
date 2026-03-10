import { useEffect, useCallback, useState, useMemo } from 'react'
import { useDevOpsStore } from '../lib/stores/devopsStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import type {
  DevOpsConnection,
  DevOpsAuth,
  DevOpsAuthMethod,
  PipelineDefinition,
  PipelineRun,
  PipelineStatus,
} from '../../shared/types'
import '../styles/devops.css'

type DevOpsSubTab = 'pipelines'

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

function statusClassName(status: PipelineStatus): string {
  return `devops-status devops-status--${status}`
}

// --- Connection Form ---

function ConnectionForm({
  onSave,
  onCancel,
  initial,
}: {
  onSave: (data: { name: string; organizationUrl: string; projectName: string; auth: DevOpsAuth }) => void
  onCancel: () => void
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
    <div className="devops-connection-form">
      <h3>{initial ? t('devops.editConnection') : t('devops.addConnection')}</h3>

      <label>{t('devops.connectionName')}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Azure DevOps" />

      <label>{t('devops.organizationUrl')}</label>
      <input value={organizationUrl} onChange={(e) => setOrganizationUrl(e.target.value)} placeholder="https://dev.azure.com/myorg" />

      <label>{t('devops.projectName')}</label>
      <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="MyProject" />

      <label>{t('devops.authMethod')}</label>
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

      {authMethod === 'pat' ? (
        <>
          <label>Personal Access Token</label>
          <input type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" />
        </>
      ) : (
        <>
          <label>Tenant ID</label>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <label>Client ID</label>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <label>Client Secret</label>
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="..." />
        </>
      )}

      {testResult && (
        <div className={`devops-test-result devops-test-result--${testResult.success ? 'success' : 'error'}`}>
          {testResult.success ? t('devops.connectionSuccess') : `${t('devops.connectionFailed')}: ${testResult.error}`}
        </div>
      )}

      <div className="devops-form-actions">
        <button className="devops-btn devops-btn--secondary" onClick={onCancel}>{t('devops.cancel')}</button>
        <button className="devops-btn devops-btn--secondary" onClick={handleTest} disabled={!isValid || testing}>
          {testing ? t('devops.testing') : t('devops.testConnection')}
        </button>
        <button className="devops-btn devops-btn--primary" onClick={handleSubmit} disabled={!isValid}>
          {t('devops.save')}
        </button>
      </div>
    </div>
  )
}

// --- Pipeline Card ---

function PipelineCard({
  pipeline,
  isSelected,
  onSelect,
  onRun,
  onOpenUrl,
}: {
  pipeline: PipelineDefinition
  isSelected: boolean
  onSelect: () => void
  onRun: () => void
  onOpenUrl: () => void
}) {
  const latestRun = pipeline.latestRun
  const status = latestRun?.status ?? 'unknown'

  return (
    <div
      className={`devops-pipeline-card${isSelected ? ' devops-pipeline-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="devops-pipeline-card-header">
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
          \u25B6
        </button>
        {pipeline.url && (
          <button className="devops-btn devops-btn--small" onClick={(e) => { e.stopPropagation(); onOpenUrl() }} title="Open in browser">
            \u2197
          </button>
        )}
      </div>
    </div>
  )
}

// --- Pipeline Runs Detail ---

function PipelineRunsDetail({
  runs,
  loading,
  pipelineName,
}: {
  runs: PipelineRun[]
  loading: boolean
  pipelineName: string
}) {
  const { t } = useI18n()

  if (loading) {
    return <div className="devops-runs-loading">{t('devops.loadingRuns')}</div>
  }

  if (runs.length === 0) {
    return <div className="devops-runs-empty">{t('devops.noRuns')}</div>
  }

  return (
    <div className="devops-runs-detail">
      <h4>{pipelineName} - {t('devops.recentRuns')}</h4>
      <div className="devops-runs-list">
        {runs.map((run) => (
          <div key={run.id} className="devops-run-row">
            <span className={statusClassName(run.status)}>{statusIcon(run.status)}</span>
            <span className="devops-run-name">#{run.name}</span>
            <span className="devops-run-branch">{run.sourceBranch}</span>
            <span className="devops-run-time">{formatRelativeTime(run.finishTime ?? run.startTime)}</span>
            <span className="devops-run-by">{run.requestedBy}</span>
            {run.url && (
              <button
                className="devops-btn devops-btn--small"
                onClick={() => window.kanbai.shell.openExternal(run.url)}
                title="Open in browser"
              >
                \u2197
              </button>
            )}
          </div>
        ))}
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
  const [showForm, setShowForm] = useState(false)
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
  } = useDevOpsStore()

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

  // Load pipelines when active connection changes
  useEffect(() => {
    if (!activeConnection) return
    loadPipelines(activeConnection)
  }, [activeConnection, loadPipelines])

  // Load pipeline runs when selected pipeline changes
  useEffect(() => {
    if (!activeConnection || !selectedPipelineId) return
    loadPipelineRuns(activeConnection, selectedPipelineId)
  }, [activeConnection, selectedPipelineId, loadPipelineRuns])

  const handleSaveConnection = useCallback(
    async (formData: { name: string; organizationUrl: string; projectName: string; auth: DevOpsAuth }) => {
      if (editingConnection) {
        await updateConnection(workspacePath, editingConnection.id, formData)
      } else {
        await addConnection(workspacePath, formData)
      }
      setShowForm(false)
      setEditingConnection(null)
    },
    [workspacePath, editingConnection, addConnection, updateConnection],
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

  const handleRefresh = useCallback(() => {
    if (!activeConnection) return
    loadPipelines(activeConnection)
    if (selectedPipelineId) {
      loadPipelineRuns(activeConnection, selectedPipelineId)
    }
  }, [activeConnection, selectedPipelineId, loadPipelines, loadPipelineRuns])

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

  // Show form
  if (showForm) {
    return (
      <div className="devops-panel">
        <ConnectionForm
          initial={editingConnection ?? undefined}
          onSave={handleSaveConnection}
          onCancel={() => { setShowForm(false); setEditingConnection(null) }}
        />
      </div>
    )
  }

  return (
    <div className="devops-panel">
      {/* Header */}
      <div className="devops-header">
        <h2>{t('devops.title')}</h2>
        <div className="devops-header-actions">
          <button className="devops-btn devops-btn--primary" onClick={() => { setEditingConnection(null); setShowForm(true) }}>
            + {t('devops.addConnection')}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="devops-subtabs">
        <button className={`devops-subtab${subTab === 'pipelines' ? ' devops-subtab--active' : ''}`}>
          {t('devops.pipelines')}
        </button>
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
          <button className="devops-btn devops-btn--small" onClick={() => { if (activeConnection) { setEditingConnection(activeConnection); setShowForm(true) } }} title={t('devops.editConnection')}>
            \u270E
          </button>
          <button className="devops-btn devops-btn--small" onClick={() => { if (activeConnectionId) handleDeleteConnection(activeConnectionId) }} title={t('devops.deleteConnection')}>
            \u2716
          </button>
          <button className="devops-btn devops-btn--small" onClick={handleRefresh} title={t('devops.refresh')}>
            \u21BB
          </button>
        </div>
      )}

      {/* No connections */}
      {(!data || data.connections.length === 0) && (
        <div className="devops-empty">
          <p>{t('devops.noConnections')}</p>
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
            {pipelines.map((pipeline) => (
              <PipelineCard
                key={pipeline.id}
                pipeline={pipeline}
                isSelected={selectedPipelineId === pipeline.id}
                onSelect={() => selectPipeline(pipeline.id)}
                onRun={() => handleRunPipeline(pipeline.id)}
                onOpenUrl={() => handleOpenPipelineUrl(pipeline.url)}
              />
            ))}
          </div>
          <div className="devops-detail-panel">
            {selectedPipeline ? (
              <PipelineRunsDetail
                runs={pipelineRuns}
                loading={runsLoading}
                pipelineName={selectedPipeline.name}
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
