import { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import { useHealthCheckStore } from './healthcheck-store'
import { useWorkspaceStore } from '../workspace/workspace-store'
import type {
  HealthCheckConfig,
  HealthCheckSchedulerStatus,
  ApiHeader,
} from '../../../shared/types'

const HISTORY_PAGE_SIZE = 50

/**
 * Convenience hook for the health check feature.
 * Manages workspace path resolution, data loading, scheduler lifecycle,
 * and provides all actions needed by the HealthCheckPanel.
 */
export function useHealthcheck() {
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [workspacePath, setWorkspacePath] = useState('')

  const {
    data,
    statuses,
    selectedCheckId,
    schedulerRunning,
    loading,
    loadData,
    importData,
    refreshData,
    addCheck,
    updateCheck,
    deleteCheck,
    executeCheck,
    startScheduler,
    stopScheduler,
    updateInterval,
    handleStatusUpdate,
    clearHistory,
    selectCheck,
    flushSave,
  } = useHealthCheckStore()

  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set())
  const [historyPage, setHistoryPage] = useState(0)
  const autoStartAttempted = useRef(false)

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
    autoStartAttempted.current = false
    loadData(workspacePath)

    return () => {
      flushSave(workspacePath)
    }
  }, [workspacePath, loadData, flushSave])

  // Auto-start scheduler when data is loaded and checks have enabled schedules
  useEffect(() => {
    if (!workspacePath || loading || schedulerRunning || autoStartAttempted.current) return
    const hasEnabledSchedules = data.checks.some((c) => c.schedule.enabled)
    if (hasEnabledSchedules) {
      autoStartAttempted.current = true
      startScheduler(workspacePath)
    }
  }, [workspacePath, loading, schedulerRunning, data.checks, startScheduler])

  // IPC listener for real-time status updates
  useEffect(() => {
    if (!workspacePath) return
    const unsubscribe = window.kanbai.healthcheck.onStatusUpdate(
      (payload: { projectPath: string; statuses: HealthCheckSchedulerStatus[] }) => {
        if (payload.projectPath === workspacePath) {
          handleStatusUpdate(workspacePath, payload.statuses)
          refreshData(workspacePath)
        }
      },
    )
    return () => { unsubscribe() }
  }, [workspacePath, handleStatusUpdate, refreshData])

  useEffect(() => {
    setHistoryPage(0)
  }, [selectedCheckId])

  // Derived state
  const selectedCheck = useMemo(
    () => data.checks.find((c) => c.id === selectedCheckId) ?? null,
    [data.checks, selectedCheckId],
  )

  const selectedStatus = selectedCheckId ? statuses[selectedCheckId] : undefined

  const checkHistory = useMemo(() => {
    if (!selectedCheckId) return []
    return data.history
      .filter((h) => h.healthCheckId === selectedCheckId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [data.history, selectedCheckId])

  const checkIncidents = useMemo(() => {
    if (!selectedCheckId) return []
    return data.incidents
      .filter((i) => i.healthCheckId === selectedCheckId)
      .sort((a, b) => b.startedAt - a.startedAt)
  }, [data.incidents, selectedCheckId])

  const historyPageCount = Math.max(1, Math.ceil(checkHistory.length / HISTORY_PAGE_SIZE))
  const paginatedHistory = checkHistory.slice(
    historyPage * HISTORY_PAGE_SIZE,
    (historyPage + 1) * HISTORY_PAGE_SIZE,
  )

  // Actions
  const handleAddCheck = useCallback(() => {
    if (!workspacePath) return
    addCheck(workspacePath)
  }, [workspacePath, addCheck])

  const handleUpdateCheck = useCallback(
    (updates: Partial<HealthCheckConfig>) => {
      if (!workspacePath || !selectedCheckId) return
      updateCheck(workspacePath, selectedCheckId, updates)
    },
    [workspacePath, selectedCheckId, updateCheck],
  )

  const handleDeleteCheck = useCallback(() => {
    if (!workspacePath || !selectedCheckId) return
    deleteCheck(workspacePath, selectedCheckId)
  }, [workspacePath, selectedCheckId, deleteCheck])

  const handleRunSingleCheck = useCallback(async (checkId: string) => {
    if (!workspacePath) return
    setExecutingIds((prev) => new Set(prev).add(checkId))
    try {
      await executeCheck(workspacePath, checkId)
    } finally {
      setExecutingIds((prev) => {
        const next = new Set(prev)
        next.delete(checkId)
        return next
      })
    }
  }, [workspacePath, executeCheck])

  const handleRunAllChecks = useCallback(async () => {
    if (!workspacePath || data.checks.length === 0) return
    const ids = data.checks.map((c) => c.id)
    setExecutingIds(new Set(ids))
    try {
      await Promise.all(ids.map((id) => executeCheck(workspacePath, id)))
    } finally {
      setExecutingIds(new Set())
    }
  }, [workspacePath, data.checks, executeCheck])

  const handleStartScheduler = useCallback(async () => {
    if (!workspacePath) return
    await startScheduler(workspacePath)
  }, [workspacePath, startScheduler])

  const handleStopScheduler = useCallback(async () => {
    if (!workspacePath) return
    await stopScheduler(workspacePath)
  }, [workspacePath, stopScheduler])

  const handleUpdateInterval = useCallback(async () => {
    if (!workspacePath || !selectedCheckId) return
    await updateInterval(workspacePath, selectedCheckId)
  }, [workspacePath, selectedCheckId, updateInterval])

  const handleQuickCheck = useCallback(async () => {
    if (!workspacePath || !selectedCheckId) return
    updateCheck(workspacePath, selectedCheckId, {
      schedule: { enabled: true, interval: 10, unit: 'seconds' },
    })
    await updateInterval(workspacePath, selectedCheckId)
  }, [workspacePath, selectedCheckId, updateCheck, updateInterval])

  const handleClearHistory = useCallback(async () => {
    if (!workspacePath) return
    await clearHistory(workspacePath)
    setHistoryPage(0)
  }, [workspacePath, clearHistory])

  const handleExport = useCallback(async () => {
    await window.kanbai.healthcheck.export(data)
  }, [data])

  const handleImport = useCallback(async () => {
    const result = await window.kanbai.healthcheck.import()
    if (result.success && result.data && workspacePath) {
      await importData(workspacePath, result.data)
    }
  }, [workspacePath, importData])

  const handleAddHeader = useCallback(() => {
    if (!selectedCheck) return
    const newHeader: ApiHeader = { key: '', value: '', enabled: true }
    handleUpdateCheck({ headers: [...selectedCheck.headers, newHeader] })
  }, [selectedCheck, handleUpdateCheck])

  const handleUpdateHeader = useCallback(
    (index: number, field: keyof ApiHeader, value: string | boolean) => {
      if (!selectedCheck) return
      const headers = selectedCheck.headers.map((h, i) =>
        i === index ? { ...h, [field]: value } : h,
      )
      handleUpdateCheck({ headers })
    },
    [selectedCheck, handleUpdateCheck],
  )

  const handleRemoveHeader = useCallback(
    (index: number) => {
      if (!selectedCheck) return
      handleUpdateCheck({ headers: selectedCheck.headers.filter((_, i) => i !== index) })
    },
    [selectedCheck, handleUpdateCheck],
  )

  return {
    // State
    activeWorkspace,
    loading,
    data,
    statuses,
    selectedCheckId,
    selectedCheck,
    selectedStatus,
    schedulerRunning,
    executingIds,
    checkHistory,
    checkIncidents,
    paginatedHistory,
    historyPage,
    historyPageCount,

    // Actions
    selectCheck,
    setHistoryPage,
    handleAddCheck,
    handleUpdateCheck,
    handleDeleteCheck,
    handleRunSingleCheck,
    handleRunAllChecks,
    handleStartScheduler,
    handleStopScheduler,
    handleUpdateInterval,
    handleQuickCheck,
    handleClearHistory,
    handleExport,
    handleImport,
    handleAddHeader,
    handleUpdateHeader,
    handleRemoveHeader,
  }
}
