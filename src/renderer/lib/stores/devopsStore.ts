import { create } from 'zustand'
import type {
  DevOpsFile,
  DevOpsConnection,
  PipelineDefinition,
  PipelineRun,
  PipelineStatus,
  PipelineStage,
  PipelineApproval,
} from '../../../shared/types'
import { pushNotification } from './notificationStore'

const MONITOR_INTERVAL_MS = 30_000

/** Statuses that trigger a notification when a pipeline transitions into them */
const NOTIFIABLE_STATUSES: ReadonlySet<PipelineStatus> = new Set([
  'succeeded',
  'failed',
  'canceled',
  'notStarted',
])

function notificationTypeForStatus(status: PipelineStatus): 'success' | 'error' | 'warning' | 'info' {
  switch (status) {
    case 'succeeded': return 'success'
    case 'failed': return 'error'
    case 'canceled': return 'warning'
    case 'notStarted': return 'info'
    default: return 'info'
  }
}

interface DevOpsState {
  data: DevOpsFile | null
  loading: boolean
  activeConnectionId: string | null
  pipelines: PipelineDefinition[]
  pipelinesLoading: boolean
  pipelinesError: string | null
  selectedPipelineId: number | null
  pipelineRuns: PipelineRun[]
  runsLoading: boolean
  monitoringActive: boolean
  selectedRunId: number | null
  expandedRunId: number | null
  runStages: PipelineStage[]
  stagesLoading: boolean
  runApprovals: PipelineApproval[]
  approvalsLoading: boolean
  approving: string | null

  loadData: (projectPath: string) => Promise<void>
  saveData: (projectPath: string) => Promise<void>
  addConnection: (projectPath: string, connection: Omit<DevOpsConnection, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateConnection: (projectPath: string, id: string, updates: Partial<DevOpsConnection>) => Promise<void>
  deleteConnection: (projectPath: string, id: string) => Promise<void>
  setActiveConnection: (id: string | null) => void
  testConnection: (connection: DevOpsConnection) => Promise<{ success: boolean; error?: string }>
  loadPipelines: (connection: DevOpsConnection) => Promise<void>
  selectPipeline: (pipelineId: number | null) => void
  loadPipelineRuns: (connection: DevOpsConnection, pipelineId: number) => Promise<void>
  selectRun: (runId: number | null) => void
  loadRunStages: (connection: DevOpsConnection, buildId: number) => Promise<void>
  runPipeline: (connection: DevOpsConnection, pipelineId: number, branch?: string) => Promise<{ success: boolean; error?: string }>
  startMonitoring: (connection: DevOpsConnection) => void
  stopMonitoring: () => void
  expandRun: (connection: DevOpsConnection, buildId: number) => Promise<void>
  collapseRun: () => void
  approveRun: (connection: DevOpsConnection, approvalId: string, status: 'approved' | 'rejected', comment?: string) => Promise<{ success: boolean; error?: string }>
  reorderPipelines: (projectPath: string, fromIndex: number, toIndex: number) => Promise<void>
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Tracks the last known status per pipeline (by definition id + latest run id) */
const previousStatuses = new Map<number, { runId: number; status: PipelineStatus }>()
let monitorTimer: ReturnType<typeof setInterval> | null = null

function detectAndNotifyChanges(pipelines: PipelineDefinition[]): void {
  for (const pipeline of pipelines) {
    const run = pipeline.latestRun
    if (!run) continue

    const prev = previousStatuses.get(pipeline.id)
    const changed = prev
      ? (prev.runId !== run.id || prev.status !== run.status)
      : false

    // Only notify on changes (not on first load)
    if (changed && NOTIFIABLE_STATUSES.has(run.status)) {
      const notifType = notificationTypeForStatus(run.status)
      const title = `Pipeline ${pipeline.name}`
      const statusLabel = run.status === 'notStarted' ? 'waiting' : run.status
      const body = `${run.name} — ${statusLabel}`

      pushNotification(notifType, title, body)
      window.kanbai.notify(title, body)
    }

    previousStatuses.set(pipeline.id, { runId: run.id, status: run.status })
  }
}

function applySavedOrder(pipelines: PipelineDefinition[], savedOrder: number[] | undefined): PipelineDefinition[] {
  if (!savedOrder || savedOrder.length === 0) return pipelines
  const pipelineMap = new Map(pipelines.map((p) => [p.id, p]))
  const ordered: PipelineDefinition[] = []
  for (const id of savedOrder) {
    const pipeline = pipelineMap.get(id)
    if (pipeline) {
      ordered.push(pipeline)
      pipelineMap.delete(id)
    }
  }
  // Append any new pipelines not in saved order
  for (const pipeline of pipelineMap.values()) {
    ordered.push(pipeline)
  }
  return ordered
}

function sortRunsByDate(runs: PipelineRun[]): PipelineRun[] {
  return [...runs].sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0
    return timeB - timeA
  })
}

export const useDevOpsStore = create<DevOpsState>((set, get) => ({
  data: null,
  loading: false,
  activeConnectionId: null,
  pipelines: [],
  pipelinesLoading: false,
  pipelinesError: null,
  selectedPipelineId: null,
  pipelineRuns: [],
  runsLoading: false,
  monitoringActive: false,
  selectedRunId: null,
  expandedRunId: null,
  runStages: [],
  stagesLoading: false,
  runApprovals: [],
  approvalsLoading: false,
  approving: null,

  loadData: async (projectPath) => {
    set({ loading: true })
    try {
      const data = await window.kanbai.devops.load(projectPath)
      set({ data, loading: false })
      if (data.connections.length > 0 && !get().activeConnectionId) {
        set({ activeConnectionId: data.connections[0]!.id })
      }
    } catch {
      set({ loading: false })
    }
  },

  saveData: async (projectPath) => {
    const { data } = get()
    if (!data) return
    await window.kanbai.devops.save(projectPath, data)
  },

  addConnection: async (projectPath, connectionData) => {
    const { data } = get()
    if (!data) return
    const now = Date.now()
    const connection: DevOpsConnection = {
      ...connectionData,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    const updated = { ...data, connections: [...data.connections, connection] }
    set({ data: updated, activeConnectionId: connection.id })
    await window.kanbai.devops.save(projectPath, updated)
  },

  updateConnection: async (projectPath, id, updates) => {
    const { data } = get()
    if (!data) return
    const updated = {
      ...data,
      connections: data.connections.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c,
      ),
    }
    set({ data: updated })
    await window.kanbai.devops.save(projectPath, updated)
  },

  deleteConnection: async (projectPath, id) => {
    const { data, activeConnectionId } = get()
    if (!data) return
    const updated = {
      ...data,
      connections: data.connections.filter((c) => c.id !== id),
    }
    const newActive = activeConnectionId === id
      ? (updated.connections[0]?.id ?? null)
      : activeConnectionId
    set({ data: updated, activeConnectionId: newActive, pipelines: [], selectedPipelineId: null, pipelineRuns: [] })
    await window.kanbai.devops.save(projectPath, updated)
  },

  setActiveConnection: (id) => {
    set({ activeConnectionId: id, pipelines: [], selectedPipelineId: null, pipelineRuns: [], pipelinesError: null, selectedRunId: null, runStages: [] })
  },

  testConnection: async (connection) => {
    return window.kanbai.devops.testConnection(connection)
  },

  loadPipelines: async (connection) => {
    set({ pipelinesLoading: true, pipelinesError: null })
    const result = await window.kanbai.devops.listPipelines(connection)
    if (result.success) {
      detectAndNotifyChanges(result.pipelines)
      const { data, activeConnectionId } = get()
      const savedOrder = activeConnectionId ? data?.pipelineOrder?.[activeConnectionId] : undefined
      const ordered = applySavedOrder(result.pipelines, savedOrder)
      set({ pipelines: ordered, pipelinesLoading: false })
    } else {
      set({ pipelines: [], pipelinesLoading: false, pipelinesError: result.error ?? 'Unknown error' })
    }
  },

  selectPipeline: (pipelineId) => {
    set({ selectedPipelineId: pipelineId, pipelineRuns: [], selectedRunId: null, runStages: [] })
  },

  loadPipelineRuns: async (connection, pipelineId) => {
    set({ runsLoading: true })
    const result = await window.kanbai.devops.getPipelineRuns(connection, pipelineId)
    if (result.success) {
      set({ pipelineRuns: sortRunsByDate(result.runs), runsLoading: false })
    } else {
      set({ pipelineRuns: [], runsLoading: false })
    }
  },

  selectRun: (runId) => {
    set({ selectedRunId: runId, runStages: [] })
  },

  loadRunStages: async (connection, buildId) => {
    set({ stagesLoading: true })
    const result = await window.kanbai.devops.getBuildTimeline(connection, buildId)
    if (result.success) {
      set({ runStages: result.stages, stagesLoading: false })
    } else {
      set({ runStages: [], stagesLoading: false })
    }
  },

  runPipeline: async (connection, pipelineId, branch) => {
    const result = await window.kanbai.devops.runPipeline(connection, pipelineId, branch)
    if (result.success) {
      // Refresh pipeline runs after triggering
      const { loadPipelineRuns } = get()
      await loadPipelineRuns(connection, pipelineId)
    }
    return { success: result.success, error: result.error }
  },

  startMonitoring: (connection) => {
    const { stopMonitoring, loadPipelines } = get()
    stopMonitoring()

    monitorTimer = setInterval(() => {
      loadPipelines(connection)
    }, MONITOR_INTERVAL_MS)

    set({ monitoringActive: true })
  },

  stopMonitoring: () => {
    if (monitorTimer) {
      clearInterval(monitorTimer)
      monitorTimer = null
    }
    set({ monitoringActive: false })
  },

  expandRun: async (connection, buildId) => {
    set({ expandedRunId: buildId, stagesLoading: true, approvalsLoading: true, runStages: [], runApprovals: [] })

    const [timelineResult, approvalsResult] = await Promise.all([
      window.kanbai.devops.getBuildTimeline(connection, buildId),
      window.kanbai.devops.getApprovals(connection, [buildId]),
    ])

    set({
      runStages: timelineResult.success ? timelineResult.stages : [],
      stagesLoading: false,
      runApprovals: approvalsResult.success ? approvalsResult.approvals : [],
      approvalsLoading: false,
    })
  },

  collapseRun: () => {
    set({ expandedRunId: null, runStages: [], runApprovals: [] })
  },

  approveRun: async (connection, approvalId, status, comment) => {
    set({ approving: approvalId })
    const result = await window.kanbai.devops.approve(connection, approvalId, status, comment)
    set({ approving: null })

    if (result.success) {
      const { expandedRunId, expandRun } = get()
      if (expandedRunId) {
        await expandRun(connection, expandedRunId)
      }
    }
    return { success: result.success, error: result.error }
  },

  reorderPipelines: async (projectPath, fromIndex, toIndex) => {
    const { pipelines, data, activeConnectionId } = get()
    if (!data || !activeConnectionId) return
    const reordered = [...pipelines]
    const [moved] = reordered.splice(fromIndex, 1)
    if (!moved) return
    reordered.splice(toIndex, 0, moved)
    const newOrder = reordered.map((p) => p.id)
    const updatedData: DevOpsFile = {
      ...data,
      pipelineOrder: {
        ...data.pipelineOrder,
        [activeConnectionId]: newOrder,
      },
    }
    set({ pipelines: reordered, data: updatedData })
    await window.kanbai.devops.save(projectPath, updatedData)
  },
}))

/**
 * Returns the global pipeline status based on the most recent pipeline run.
 * Finds the pipeline whose latestRun has the most recent finishTime (or startTime),
 * and returns its status along with the pipeline name.
 */
export function selectGlobalPipelineStatus(state: DevOpsState): {
  status: PipelineStatus
  pipelineName: string
} | null {
  const { pipelines } = state
  if (pipelines.length === 0) return null

  let mostRecent: PipelineDefinition | null = null
  let mostRecentTime = 0

  for (const pipeline of pipelines) {
    if (!pipeline.latestRun) continue
    const timeStr = pipeline.latestRun.finishTime ?? pipeline.latestRun.startTime
    if (!timeStr) continue
    const time = new Date(timeStr).getTime()
    if (time > mostRecentTime) {
      mostRecentTime = time
      mostRecent = pipeline
    }
  }

  if (!mostRecent || !mostRecent.latestRun) return null

  return {
    status: mostRecent.latestRun.status,
    pipelineName: mostRecent.name,
  }
}
