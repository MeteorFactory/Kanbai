import { create } from 'zustand'
import type {
  HealthCheckFile,
  HealthCheckConfig,
  HealthCheckLogEntry,
  HealthCheckSchedulerStatus,
} from '../../../shared/types'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function defaultHealthCheckFile(): HealthCheckFile {
  return { version: 1, checks: [], history: [], incidents: [] }
}

interface HealthCheckState {
  data: HealthCheckFile
  statuses: Record<string, HealthCheckSchedulerStatus>
  selectedCheckId: string | null
  schedulerRunning: boolean
  loading: boolean
  currentProjectPath: string | null
  dirty: boolean

  loadData: (projectPath: string) => Promise<void>
  importData: (projectPath: string, data: HealthCheckFile) => Promise<void>
  saveData: (projectPath: string) => Promise<void>
  addCheck: (projectPath: string) => Promise<void>
  updateCheck: (projectPath: string, checkId: string, updates: Partial<HealthCheckConfig>) => void
  deleteCheck: (projectPath: string, checkId: string) => Promise<void>
  executeCheck: (projectPath: string, checkId: string) => Promise<HealthCheckLogEntry | null>
  startScheduler: (projectPath: string) => Promise<void>
  stopScheduler: (projectPath: string) => Promise<void>
  updateInterval: (projectPath: string, checkId: string) => Promise<void>
  handleStatusUpdate: (projectPath: string, statuses: HealthCheckSchedulerStatus[]) => void
  refreshData: (projectPath: string) => Promise<void>
  clearHistory: (projectPath: string) => Promise<void>
  selectCheck: (checkId: string | null) => void
  flushSave: (projectPath: string) => Promise<void>
  reset: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function persistData(projectPath: string, data: HealthCheckFile): Promise<void> {
  try {
    await window.kanbai.healthcheck.save(projectPath, data)
  } catch (err) {
    console.error('[HealthCheck] Failed to save data:', err)
  }
}

function debouncedSave(projectPath: string, data: HealthCheckFile): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistData(projectPath, data)
  }, 300)
}

export const useHealthCheckStore = create<HealthCheckState>((set, get) => ({
  data: defaultHealthCheckFile(),
  statuses: {},
  selectedCheckId: null,
  schedulerRunning: false,
  loading: false,
  currentProjectPath: null,
  dirty: false,

  loadData: async (projectPath: string) => {
    const { currentProjectPath, dirty } = get()

    // If we already have data for this project and it hasn't been flushed yet, skip reload
    if (currentProjectPath === projectPath && dirty) {
      return
    }

    set({ loading: true })
    try {
      const data = await window.kanbai.healthcheck.load(projectPath)
      const statuses = await window.kanbai.healthcheck.getStatuses(projectPath)
      const statusMap: Record<string, HealthCheckSchedulerStatus> = {}
      for (const s of statuses) {
        statusMap[s.checkId] = s
      }
      set({
        data,
        statuses: statusMap,
        schedulerRunning: statuses.length > 0,
        loading: false,
        currentProjectPath: projectPath,
        dirty: false,
      })
    } catch (err) {
      console.error('[HealthCheck] Failed to load data:', err)
      set({ data: defaultHealthCheckFile(), loading: false, currentProjectPath: projectPath, dirty: false })
    }
  },

  importData: async (projectPath: string, data: HealthCheckFile) => {
    set({ data, currentProjectPath: projectPath, dirty: true })
    await persistData(projectPath, data)
    set({ dirty: false })
  },

  saveData: async (projectPath: string) => {
    const { data } = get()
    await persistData(projectPath, data)
    set({ dirty: false })
  },

  addCheck: async (projectPath: string) => {
    const { data } = get()
    const now = Date.now()
    const newCheck: HealthCheckConfig = {
      id: generateId(),
      name: `Health Check ${data.checks.length + 1}`,
      url: '',
      method: 'GET',
      expectedStatus: 200,
      headers: [],
      schedule: { enabled: false, interval: 30, unit: 'seconds' },
      notifyOnDown: true,
      createdAt: now,
      updatedAt: now,
    }
    const updated = { ...data, checks: [...data.checks, newCheck] }
    set({ data: updated, selectedCheckId: newCheck.id, dirty: true })
    await persistData(projectPath, updated)
    set({ dirty: false })
  },

  updateCheck: (projectPath: string, checkId: string, updates: Partial<HealthCheckConfig>) => {
    const { data } = get()
    const updated = {
      ...data,
      checks: data.checks.map((c) =>
        c.id === checkId ? { ...c, ...updates, updatedAt: Date.now() } : c,
      ),
    }
    set({ data: updated, dirty: true })
    debouncedSave(projectPath, updated)
  },

  deleteCheck: async (projectPath: string, checkId: string) => {
    const { data, selectedCheckId } = get()
    const updated = {
      ...data,
      checks: data.checks.filter((c) => c.id !== checkId),
      history: data.history.filter((h) => h.healthCheckId !== checkId),
      incidents: data.incidents.filter((i) => i.healthCheckId !== checkId),
    }
    set({
      data: updated,
      selectedCheckId: selectedCheckId === checkId ? null : selectedCheckId,
      dirty: true,
    })
    await persistData(projectPath, updated)
    set({ dirty: false })
  },

  executeCheck: async (projectPath: string, checkId: string) => {
    const { data } = get()
    const check = data.checks.find((c) => c.id === checkId)
    if (!check) return null

    const logEntry = await window.kanbai.healthcheck.execute(projectPath, check, data)
    // Reload data after execution (scheduler updates it)
    const freshData = await window.kanbai.healthcheck.load(projectPath)
    set({ data: freshData, dirty: false })
    return logEntry
  },

  startScheduler: async (projectPath: string) => {
    const { data } = get()
    await window.kanbai.healthcheck.startScheduler(projectPath, data)
    set({ schedulerRunning: true })
  },

  stopScheduler: async (projectPath: string) => {
    await window.kanbai.healthcheck.stopScheduler(projectPath)
    set({ schedulerRunning: false, statuses: {} })
  },

  updateInterval: async (projectPath: string, checkId: string) => {
    const { data } = get()
    await window.kanbai.healthcheck.updateInterval(projectPath, checkId, data)
  },

  handleStatusUpdate: (_projectPath: string, statuses: HealthCheckSchedulerStatus[]) => {
    const statusMap: Record<string, HealthCheckSchedulerStatus> = {}
    for (const s of statuses) {
      statusMap[s.checkId] = s
    }
    set({ statuses: statusMap })
  },

  refreshData: async (projectPath: string) => {
    const { dirty } = get()
    // Don't reload from disk if we have unsaved changes
    if (dirty) return
    try {
      const freshData = await window.kanbai.healthcheck.load(projectPath)
      set({ data: freshData })
    } catch {
      // Silently ignore — keep current data
    }
  },

  clearHistory: async (projectPath: string) => {
    const { data } = get()
    const updated = { ...data, history: [] }
    await window.kanbai.healthcheck.clearHistory(projectPath, updated)
    set({ data: updated })
  },

  selectCheck: (checkId: string | null) => {
    set({ selectedCheckId: checkId })
  },

  flushSave: async (projectPath: string) => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const { data, dirty } = get()
    if (dirty) {
      await persistData(projectPath, data)
      set({ dirty: false })
    }
  },

  reset: () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    set({
      data: defaultHealthCheckFile(),
      statuses: {},
      selectedCheckId: null,
      schedulerRunning: false,
      loading: false,
      currentProjectPath: null,
      dirty: false,
    })
  },
}))
