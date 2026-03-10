import { create } from 'zustand'
import type {
  DevOpsFile,
  DevOpsConnection,
  PipelineDefinition,
  PipelineRun,
} from '../../../shared/types'

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
  runPipeline: (connection: DevOpsConnection, pipelineId: number, branch?: string) => Promise<{ success: boolean; error?: string }>
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
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
    set({ activeConnectionId: id, pipelines: [], selectedPipelineId: null, pipelineRuns: [], pipelinesError: null })
  },

  testConnection: async (connection) => {
    return window.kanbai.devops.testConnection(connection)
  },

  loadPipelines: async (connection) => {
    set({ pipelinesLoading: true, pipelinesError: null })
    const result = await window.kanbai.devops.listPipelines(connection)
    if (result.success) {
      set({ pipelines: result.pipelines, pipelinesLoading: false })
    } else {
      set({ pipelines: [], pipelinesLoading: false, pipelinesError: result.error ?? 'Unknown error' })
    }
  },

  selectPipeline: (pipelineId) => {
    set({ selectedPipelineId: pipelineId, pipelineRuns: [] })
  },

  loadPipelineRuns: async (connection, pipelineId) => {
    set({ runsLoading: true })
    const result = await window.kanbai.devops.getPipelineRuns(connection, pipelineId)
    if (result.success) {
      set({ pipelineRuns: result.runs, runsLoading: false })
    } else {
      set({ pipelineRuns: [], runsLoading: false })
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
}))
