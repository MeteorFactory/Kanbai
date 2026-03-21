import { useState, useEffect } from 'react'
import type { KanbanConfig } from '../../../../shared/types'

interface UseKanbanConfigReturn {
  kanbanDefaultConfig: KanbanConfig | null
  setKanbanDefaultConfig: (config: KanbanConfig | null) => void
  kanbanProjectConfig: KanbanConfig | null
  setKanbanProjectConfig: (config: KanbanConfig | null) => void
  kanbanProjectLoading: boolean
}

export function useKanbanConfig(
  activeWorkspaceId: string | null,
): UseKanbanConfigReturn {
  const [kanbanDefaultConfig, setKanbanDefaultConfig] = useState<KanbanConfig | null>(null)
  const [kanbanProjectConfig, setKanbanProjectConfig] = useState<KanbanConfig | null>(null)
  const [kanbanProjectLoading, setKanbanProjectLoading] = useState(false)

  useEffect(() => {
    window.kanbai.kanban.getDefaultConfig().then(setKanbanDefaultConfig).catch(() => {})
    if (activeWorkspaceId) {
      setKanbanProjectLoading(true)
      window.kanbai.kanban.getConfig(activeWorkspaceId).then(setKanbanProjectConfig).catch(() => {
        setKanbanProjectConfig(null)
      }).finally(() => {
        setKanbanProjectLoading(false)
      })
    }
  }, [activeWorkspaceId])

  return {
    kanbanDefaultConfig,
    setKanbanDefaultConfig,
    kanbanProjectConfig,
    setKanbanProjectConfig,
    kanbanProjectLoading,
  }
}
