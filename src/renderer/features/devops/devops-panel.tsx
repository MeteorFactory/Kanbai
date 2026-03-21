import { useEffect, useCallback, useState, useMemo } from 'react'
import { useDevOpsStore } from './devops-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { pushNotification } from '../../lib/stores/notificationStore'
import { useI18n } from '../../lib/i18n'
import { AzureDevOpsIcon, GitHubIcon } from './devops-icons'
import { ProviderSelection } from './provider-selection'
import { ConnectionFormModal } from './connection-form-modal'
import { RunPipelineModal } from './run-pipeline-modal'
import { PipelineCard } from './pipeline-card'
import { PipelineRunsDetail } from './runs-detail'
import type {
  DevOpsConnection,
  DevOpsAuth,
  DevOpsProvider,
  PipelineRun,
} from '../../../shared/types'
import './devops.css'

type DevOpsSubTab = 'pipelines'
type ModalStep = 'provider' | 'form'

export function DevOpsPanel() {
  const { t } = useI18n()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [workspacePath, setWorkspacePath] = useState('')
  const [subTab] = useState<DevOpsSubTab>('pipelines')
  const [modalStep, setModalStep] = useState<ModalStep | null>(null)
  const [editingConnection, setEditingConnection] = useState<DevOpsConnection | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<DevOpsProvider>('azure-devops')

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
  const [runModalPipeline, setRunModalPipeline] = useState<{ id: number; name: string; branch: string; parameters: Record<string, string> } | null>(null)

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

  const handleProviderSelect = useCallback((provider: DevOpsProvider) => {
    setSelectedProvider(provider)
    setModalStep('form')
  }, [])

  const handleSaveConnection = useCallback(
    async (formData: { name: string; organizationUrl: string; projectName: string; auth: DevOpsAuth; provider?: DevOpsProvider }) => {
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

  const handleOpenRunModal = useCallback(
    (pipelineId: number, branch?: string, parameters?: Record<string, string>) => {
      const pipeline = pipelines.find((p) => p.id === pipelineId)
      if (!pipeline) return
      setRunModalPipeline({
        id: pipelineId,
        name: pipeline.name,
        branch: branch ?? pipeline.latestRun?.sourceBranch ?? '',
        parameters: parameters ?? {},
      })
    },
    [pipelines],
  )

  const handleRunPipeline = useCallback(
    async (branch: string, parameters: Record<string, string>) => {
      if (!activeConnection || !runModalPipeline) return
      setRunModalPipeline(null)
      const result = await runPipeline(activeConnection, runModalPipeline.id, branch || undefined, Object.keys(parameters).length > 0 ? parameters : undefined)
      if (!result.success) {
        console.error('[DevOps] Run pipeline failed:', result.error)
      }
    },
    [activeConnection, runModalPipeline, runPipeline],
  )

  const handleReplayRun = useCallback(
    (run: PipelineRun) => {
      if (!selectedPipelineId) return
      const pipeline = pipelines.find((p) => p.id === selectedPipelineId)
      if (!pipeline) return
      setRunModalPipeline({
        id: selectedPipelineId,
        name: pipeline.name,
        branch: run.sourceBranch,
        parameters: run.parameters ?? {},
      })
    },
    [selectedPipelineId, pipelines],
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

  const handleCreateTicket = useCallback(async (title: string, description: string) => {
    if (!activeWorkspaceId) return
    await window.kanbai.kanban.create({
      workspaceId: activeWorkspaceId,
      title,
      description,
      priority: 'high',
      type: 'bug',
      status: 'TODO',
    })
    pushNotification('success', t('devops.ticketCreated'), title)
  }, [activeWorkspaceId, t])

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
      {/* Run Pipeline Modal */}
      {runModalPipeline && (
        <RunPipelineModal
          pipelineName={runModalPipeline.name}
          initialBranch={runModalPipeline.branch}
          initialParameters={runModalPipeline.parameters}
          onRun={handleRunPipeline}
          onClose={() => setRunModalPipeline(null)}
        />
      )}

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
          provider={selectedProvider}
          onSave={handleSaveConnection}
          onClose={closeModal}
          onBack={editingConnection ? undefined : () => setModalStep('provider')}
        />
      )}

      {/* No connections — empty state */}
      {(!data || data.connections.length === 0) && (
        <div className="devops-empty-state">
          <div className="devops-empty-state-icons">
            <AzureDevOpsIcon size={40} />
            <GitHubIcon size={40} />
          </div>
          <h3>{t('devops.noConnectionsTitle')}</h3>
          <p>{t('devops.noConnections')}</p>
          <button className="devops-btn devops-btn--primary" onClick={openNewConnection}>
            + {t('devops.addConnection')}
          </button>
        </div>
      )}

      {/* Main layout with optional connections sidebar */}
      {data && data.connections.length > 0 && (
        <div className="devops-main-layout">
          {/* Connections sidebar — only shown when multiple connections */}
          {data.connections.length > 1 && (
            <div className="devops-connections-sidebar">
              <div className="devops-connections-sidebar-header">
                <span className="devops-connections-sidebar-title">{t('devops.connections')}</span>
                <button className="devops-btn devops-btn--icon" onClick={openNewConnection} title={t('devops.addConnection')}>
                  +
                </button>
              </div>
              <div className="devops-connections-sidebar-list">
                {data.connections.map((c) => {
                  const isActive = activeConnectionId === c.id
                  const providerIcon = c.provider === 'github' ? <GitHubIcon size={16} /> : <AzureDevOpsIcon size={16} />
                  const projectLabel = c.provider === 'github' ? `${c.organizationUrl}/${c.projectName}` : c.projectName
                  return (
                    <div
                      key={c.id}
                      className={`devops-connection-item${isActive ? ' devops-connection-item--active' : ''}`}
                      onClick={() => setActiveConnection(c.id)}
                    >
                      <div className="devops-connection-item-icon">{providerIcon}</div>
                      <div className="devops-connection-item-info">
                        <span className="devops-connection-item-name">{c.name}</span>
                        <span className="devops-connection-item-project">{projectLabel}</span>
                      </div>
                      {isActive && (
                        <div className="devops-connection-item-actions">
                          <button className="devops-btn devops-btn--icon" onClick={(e) => { e.stopPropagation(); openEditConnection() }} title={t('devops.editConnection')}>
                            {'\u270E'}
                          </button>
                          <button className="devops-btn devops-btn--icon" onClick={(e) => { e.stopPropagation(); handleDeleteConnection(c.id) }} title={t('devops.deleteConnection')}>
                            {'\u2716'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pipeline content area */}
          <div className="devops-pipeline-area">
            {/* Header */}
            <div className="devops-header">
              <h2>{t('devops.pipelines')}{activeConnection ? ` — ${activeConnection.name}` : ''}</h2>
              <div className="devops-header-actions">
                {data.connections.length === 1 && (
                  <>
                    <button className="devops-btn devops-btn--small" onClick={openEditConnection} title={t('devops.editConnection')}>
                      {'\u270E'}
                    </button>
                    <button className="devops-btn devops-btn--small" onClick={() => { if (activeConnectionId) handleDeleteConnection(activeConnectionId) }} title={t('devops.deleteConnection')}>
                      {'\u2716'}
                    </button>
                  </>
                )}
                <button className="devops-btn devops-btn--small" onClick={handleRefresh} title={t('devops.refresh')}>
                  {'\u21BB'}
                </button>
                <button className="devops-btn devops-btn--primary" onClick={openNewConnection}>
                  + {t('devops.addConnection')}
                </button>
              </div>
            </div>

            {/* Pipelines content */}
            {activeConnection && subTab === 'pipelines' && (
              <div className="devops-content">
                <div className="devops-pipelines-list">
                  {pipelinesLoading && <div className="devops-loading">{t('devops.loadingPipelines')}</div>}
                  {pipelinesError && (
                    <div className="devops-broken-connection">
                      <div className="devops-broken-connection-icon">{'\u26A0'}</div>
                      <div className="devops-broken-connection-title">{t('devops.connectionBroken')}</div>
                      <div className="devops-broken-connection-message">{pipelinesError}</div>
                      <div className="devops-broken-connection-actions">
                        <button className="devops-btn devops-btn--primary" onClick={openEditConnection}>
                          {'\u270E'} {t('devops.editConnection')}
                        </button>
                        <button className="devops-btn devops-btn--danger" onClick={() => { if (activeConnectionId) handleDeleteConnection(activeConnectionId) }}>
                          {'\u2716'} {t('devops.deleteConnection')}
                        </button>
                      </div>
                    </div>
                  )}
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
                      onRun={() => handleOpenRunModal(pipeline.id)}
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
                      onCreateTicket={handleCreateTicket}
                      onReplay={handleReplayRun}
                    />
                  ) : (
                    <div className="devops-empty">{t('devops.selectPipeline')}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
