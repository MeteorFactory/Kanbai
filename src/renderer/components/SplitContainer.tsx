import React, { useCallback, useRef } from 'react'
import {
  useTerminalTabStore,
  computePaneRects,
  computeSplitDividers,
  findPaneComponentType,
  type PaneNode,
} from '../lib/stores/terminalTabStore'
import { useKanbanStore } from '../features/kanban'
import { Terminal } from './Terminal'
import { PixelAgentsPane } from './PixelAgentsPane'

function findPaneInitialCommand(node: PaneNode, paneId: string): string | null {
  if (node.type === 'leaf') return node.id === paneId ? node.initialCommand : null
  return findPaneInitialCommand(node.children[0], paneId) ?? findPaneInitialCommand(node.children[1], paneId)
}

function findPaneExternalSessionId(node: PaneNode, paneId: string): string | null {
  if (node.type === 'leaf') return node.id === paneId ? node.externalSessionId : null
  return findPaneExternalSessionId(node.children[0], paneId) ?? findPaneExternalSessionId(node.children[1], paneId)
}

function findPaneComponent(node: PaneNode, paneId: string): 'terminal' | 'pixel-agents' {
  return findPaneComponentType(node, paneId)
}

function findPaneShell(node: PaneNode, paneId: string): string | undefined {
  if (node.type === 'leaf') return node.id === paneId ? node.shell : undefined
  return findPaneShell(node.children[0], paneId) ?? findPaneShell(node.children[1], paneId)
}

interface SplitContainerProps {
  tabId: string
  fontSize: number
}

export function SplitContainer({ tabId, fontSize }: SplitContainerProps) {
  const tab = useTerminalTabStore((s) => s.tabs.find((t) => t.id === tabId))
  const activeTabId = useTerminalTabStore((s) => s.activeTabId)
  const setActivePane = useTerminalTabStore((s) => s.setActivePane)
  const setTabActivity = useTerminalTabStore((s) => s.setTabActivity)
  const closePane = useTerminalTabStore((s) => s.closePane)
  const resizePane = useTerminalTabStore((s) => s.resizePane)
  const setPaneSessionId = useTerminalTabStore((s) => s.setPaneSessionId)
  const containerRef = useRef<HTMLDivElement>(null)

  if (!tab) return null

  const isTabVisible = tabId === activeTabId
  const cwd = tab.cwd

  // Compute flat layout from tree (values in 0-1 range)
  const allPaneRects = computePaneRects(tab.paneTree, 0, 0, 1, 1)
  const allDividers = computeSplitDividers(tab.paneTree, 0, 0, 1, 1)

  // If zoomed, show only the zoomed pane at full size
  const paneRects = tab.zoomedPaneId
    ? allPaneRects
        .filter((r) => r.id === tab.zoomedPaneId)
        .map((r) => ({ ...r, x: 0, y: 0, w: 1, h: 1 }))
    : allPaneRects

  const showDividers = !tab.zoomedPaneId && allDividers.length > 0

  return (
    <div ref={containerRef} className="split-container" style={{ position: 'relative' }}>
      {paneRects.map((rect) => (
        <FlatPaneView
          key={rect.id}
          tabId={tabId}
          paneId={rect.id}
          isActive={tab.activePaneId === rect.id}
          isTabVisible={isTabVisible}
          cwd={cwd}
          workspaceId={tab.workspaceId}
          initialCommand={findPaneInitialCommand(tab.paneTree, rect.id)}
          externalSessionId={findPaneExternalSessionId(tab.paneTree, rect.id)}
          componentType={findPaneComponent(tab.paneTree, rect.id)}
          shell={findPaneShell(tab.paneTree, rect.id)}
          isSplit={allPaneRects.length > 1}
          rect={rect}
          fontSize={fontSize}
          setActivePane={setActivePane}
          setTabActivity={setTabActivity}
          closePane={closePane}
          setPaneSessionId={setPaneSessionId}
          activeTabId={activeTabId}
        />
      ))}
      {showDividers &&
        allDividers.map((div) => (
          <FlatDivider
            key={div.splitId}
            tabId={tabId}
            divider={div}
            containerRef={containerRef}
            resizePane={resizePane}
          />
        ))}
    </div>
  )
}

// --- Flat pane view with absolute positioning ---

interface FlatPaneViewProps {
  tabId: string
  paneId: string
  isActive: boolean
  isTabVisible: boolean
  cwd: string
  workspaceId: string
  initialCommand: string | null
  externalSessionId: string | null
  componentType: 'terminal' | 'pixel-agents'
  shell?: string
  isSplit: boolean
  rect: { x: number; y: number; w: number; h: number }
  fontSize: number
  setActivePane: (tabId: string, paneId: string) => void
  setTabActivity: (tabId: string, hasActivity: boolean) => void
  closePane: (tabId: string, paneId: string) => void
  setPaneSessionId: (tabId: string, paneId: string, sessionId: string) => void
  activeTabId: string | null
}

function FlatPaneView({
  tabId,
  paneId,
  isActive,
  isTabVisible,
  cwd,
  workspaceId,
  initialCommand,
  externalSessionId,
  componentType,
  shell,
  isSplit,
  rect,
  fontSize,
  setActivePane,
  setTabActivity,
  closePane,
  setPaneSessionId,
  activeTabId,
}: FlatPaneViewProps) {
  const handleActivity = useCallback(() => {
    if (tabId !== activeTabId) {
      setTabActivity(tabId, true)
    }
  }, [tabId, activeTabId, setTabActivity])

  const handleFocus = useCallback(() => {
    setActivePane(tabId, paneId)
  }, [tabId, paneId, setActivePane])

  const isKanbanLinkedTab = useKanbanStore((s) =>
    Object.values(s.kanbanTabIds).includes(tabId),
  )

  const handleClose = useCallback(() => {
    // For Kanban-linked terminals, never auto-close on PTY exit.
    // The tab stays visible and can only be closed explicitly by the user.
    if (isKanbanLinkedTab) return
    closePane(tabId, paneId)
  }, [tabId, paneId, closePane, isKanbanLinkedTab])

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      setPaneSessionId(tabId, paneId, sessionId)
    },
    [tabId, paneId, setPaneSessionId],
  )

  const reactivateIfDone = useKanbanStore((s) => s.reactivateIfDone)
  const handleUserInput = useCallback((message: string) => {
    reactivateIfDone(tabId, message)
  }, [tabId, reactivateIfDone])

  // Gap for dividers (2px on each side = 1px effective divider)
  const gap = 1

  return (
    <div
      className={`pane-view${isActive ? ' pane-view--active' : ''}`}
      style={{
        position: 'absolute',
        left: `calc(${rect.x * 100}% + ${rect.x > 0 ? gap : 0}px)`,
        top: `calc(${rect.y * 100}% + ${rect.y > 0 ? gap : 0}px)`,
        width: `calc(${rect.w * 100}% - ${(rect.x > 0 ? gap : 0) + (rect.x + rect.w < 1 ? gap : 0)}px)`,
        height: `calc(${rect.h * 100}% - ${(rect.y > 0 ? gap : 0) + (rect.y + rect.h < 1 ? gap : 0)}px)`,
      }}
      onMouseDown={handleFocus}
    >
      {componentType === 'pixel-agents' ? (
        <PixelAgentsPane isVisible={isTabVisible} workspaceId={workspaceId} />
      ) : (
        <Terminal cwd={cwd} shell={shell} initialCommand={initialCommand} externalSessionId={externalSessionId} workspaceId={workspaceId} tabId={tabId} isVisible={isTabVisible} fontSize={fontSize} isSplit={isSplit} onActivity={handleActivity} onClose={handleClose} onSessionCreated={handleSessionCreated} onUserInput={handleUserInput} />
      )}
    </div>
  )
}

// --- Flat divider with absolute positioning ---

interface FlatDividerProps {
  tabId: string
  divider: { splitId: string; direction: 'horizontal' | 'vertical'; x: number; y: number; w: number; h: number }
  containerRef: React.RefObject<HTMLDivElement | null>
  resizePane: (tabId: string, splitId: string, ratio: number) => void
}

function FlatDivider({ tabId, divider, containerRef, resizePane }: FlatDividerProps) {
  const isHorizontal = divider.direction === 'horizontal'

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()

        // We need to find the split's parent bounds to compute ratio correctly
        // For now, use the full container as reference
        if (isHorizontal) {
          const offset = (moveEvent.clientX - rect.left) / rect.width
          // The ratio needs to be relative to the split node's bounds
          // For top-level splits this works directly
          // For nested splits, we approximate
          resizePane(tabId, divider.splitId, offset)
        } else {
          const offset = (moveEvent.clientY - rect.top) / rect.height
          resizePane(tabId, divider.splitId, offset)
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [tabId, divider.splitId, isHorizontal, containerRef, resizePane],
  )

  const dividerThickness = 4

  return (
    <div
      className={`split-divider split-divider--${divider.direction}`}
      style={{
        position: 'absolute',
        left: isHorizontal
          ? `calc(${divider.x * 100}% - ${dividerThickness / 2}px)`
          : `${divider.x * 100}%`,
        top: isHorizontal
          ? `${divider.y * 100}%`
          : `calc(${divider.y * 100}% - ${dividerThickness / 2}px)`,
        width: isHorizontal ? `${dividerThickness}px` : `${divider.w * 100}%`,
        height: isHorizontal ? `${divider.h * 100}%` : `${dividerThickness}px`,
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
    />
  )
}
