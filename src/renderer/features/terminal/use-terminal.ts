import { useCallback } from 'react'
import { useTerminalTabStore } from './terminal-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

/**
 * Hook that provides workspace-aware terminal tab operations.
 * Wraps the terminal store with the active workspace context.
 */
export function useTerminal() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const {
    tabs: allTabs,
    activeTabId,
    createTab,
    closeTab,
    setActiveTab,
    renameTab,
    reorderTabs,
    activateNext,
    activatePrev,
    activateByIndex,
    splitPane,
    closePane,
    toggleZoomPane,
    focusDirection,
    createSplitTab,
    createPixelAgentsTab,
    createPixelAgentsSplitTab,
  } = useTerminalTabStore()

  const workspaceTabs = allTabs.filter((t) => t.workspaceId === activeWorkspaceId)

  const createWorkspaceTab = useCallback(
    (cwd: string, label?: string, initialCommand?: string, activate?: boolean, shell?: string) => {
      if (!activeWorkspaceId) return ''
      return createTab(activeWorkspaceId, cwd, label, initialCommand, activate, shell)
    },
    [activeWorkspaceId, createTab],
  )

  const createWorkspaceSplitTab = useCallback(
    (cwd: string, label: string, leftCommand: string | null, rightCommand: string | null) => {
      if (!activeWorkspaceId) return ''
      return createSplitTab(activeWorkspaceId, cwd, label, leftCommand, rightCommand)
    },
    [activeWorkspaceId, createSplitTab],
  )

  const createWorkspacePixelAgentsTab = useCallback(
    (cwd: string) => {
      if (!activeWorkspaceId) return ''
      return createPixelAgentsTab(activeWorkspaceId, cwd)
    },
    [activeWorkspaceId, createPixelAgentsTab],
  )

  const createWorkspacePixelAgentsSplitTab = useCallback(
    (cwd: string) => {
      if (!activeWorkspaceId) return ''
      return createPixelAgentsSplitTab(activeWorkspaceId, cwd)
    },
    [activeWorkspaceId, createPixelAgentsSplitTab],
  )

  const activateNextInWorkspace = useCallback(() => {
    activateNext(activeWorkspaceId ?? undefined)
  }, [activeWorkspaceId, activateNext])

  const activatePrevInWorkspace = useCallback(() => {
    activatePrev(activeWorkspaceId ?? undefined)
  }, [activeWorkspaceId, activatePrev])

  const activateByIndexInWorkspace = useCallback(
    (index: number) => {
      activateByIndex(index, activeWorkspaceId ?? undefined)
    },
    [activeWorkspaceId, activateByIndex],
  )

  return {
    tabs: workspaceTabs,
    allTabs,
    activeTabId,
    activeWorkspaceId,
    createTab: createWorkspaceTab,
    createSplitTab: createWorkspaceSplitTab,
    createPixelAgentsTab: createWorkspacePixelAgentsTab,
    createPixelAgentsSplitTab: createWorkspacePixelAgentsSplitTab,
    closeTab,
    setActiveTab,
    renameTab,
    reorderTabs,
    activateNext: activateNextInWorkspace,
    activatePrev: activatePrevInWorkspace,
    activateByIndex: activateByIndexInWorkspace,
    splitPane,
    closePane,
    toggleZoomPane,
    focusDirection,
  }
}
