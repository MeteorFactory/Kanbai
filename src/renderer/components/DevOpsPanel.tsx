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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog devops-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {t('devops.selectProvider')}
        </div>
        <div className="modal-body">
          <p className="devops-modal-subtitle">{t('devops.selectProviderDesc')}</p>
          <div className="devops-provider-grid">
            <button
              className="devops-provider-card"
              onClick={() => onSelect('azure-devops')}
            >
              <AzureDevOpsIcon size={48} />
              <span className="devops-provider-name">Azure DevOps</span>
              <span className="devops-provider-desc">{t('devops.azureDevOpsDesc')}</span>
            </button>
            <div className="devops-provider-card devops-provider-card--disabled">
              <div className="devops-provider-icon-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11v6h2v-6h-2zm0-4v2h2V7h-2z" fill="currentColor" opacity="0.3"/>
                </svg>
              </div>
              <span className="devops-provider-name">{t('devops.moreProviders')}</span>
              <span className="devops-provider-desc">{t('devops.comingSoon')}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn--secondary" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog devops-modal devops-modal--form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="devops-modal-header-row">
            {onBack && (
              <button className="devops-modal-back" onClick={onBack} title={t('devops.back')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <div className="devops-modal-header-title">
              <AzureDevOpsIcon size={24} />
              <span>{initial ? t('devops.editConnection') : t('devops.addConnection')}</span>
            </div>
          </div>
        </div>
        <div className="modal-body devops-modal-body">
          <div className="devops-form-group">
            <label className="devops-form-label">{t('devops.connectionName')}</label>
            <input
              className="devops-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Azure DevOps"
            />
          </div>

          <div className="devops-form-group">
            <label className="devops-form-label">{t('devops.organizationUrl')}</label>
            <input
              className="devops-form-input"
              value={organizationUrl}
              onChange={(e) => setOrganizationUrl(e.target.value)}
              placeholder="https://dev.azure.com/myorg"
            />
          </div>

          <div className="devops-form-group">
            <label className="devops-form-label">{t('devops.projectName')}</label>
            <input
              className="devops-form-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="MyProject"
            />
          </div>

          <div className="devops-form-group">
            <label className="devops-form-label">{t('devops.authMethod')}</label>
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
            <div className="devops-form-group">
              <label className="devops-form-label">Personal Access Token</label>
              <input
                className="devops-form-input"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          ) : (
            <>
              <div className="devops-form-group">
                <label className="devops-form-label">Tenant ID</label>
                <input
                  className="devops-form-input"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="devops-form-group">
                <label className="devops-form-label">Client ID</label>
                <input
                  className="devops-form-input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="devops-form-group">
                <label className="devops-form-label">Client Secret</label>
                <input
                  className="devops-form-input"
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
        <div className="modal-footer">
          <button className="modal-btn modal-btn--secondary" onClick={onClose}>
            {t('devops.cancel')}
          </button>
          <button
            className="modal-btn modal-btn--secondary"
            onClick={handleTest}
            disabled={!isValid || testing}
          >
            {testing ? t('devops.testing') : t('devops.testConnection')}
          </button>
          <button
            className="modal-btn modal-btn--primary"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            {t('devops.save')}
          </button>
        </div>
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
                {'\u2197'}
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
