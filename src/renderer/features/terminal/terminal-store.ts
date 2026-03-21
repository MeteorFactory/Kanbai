import { create } from 'zustand'

// --- Pane tree types ---

export interface PaneLeaf {
  type: 'leaf'
  id: string
  sessionId: string | null
  initialCommand: string | null
  externalSessionId: string | null
  componentType?: 'terminal' | 'pixel-agents'
  shell?: string
}

export interface PaneSplit {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: [PaneNode, PaneNode]
  ratio: number // 0..1, first child gets ratio, second gets 1-ratio
}

export type PaneNode = PaneLeaf | PaneSplit

// --- Tab types ---

export interface TerminalTabData {
  id: string
  label: string
  color: string | null
  hasActivity: boolean
  paneTree: PaneNode
  activePaneId: string
  zoomedPaneId: string | null
  workspaceId: string
  cwd: string
  initialCommand: string | null
}

// --- Store ---

interface TerminalTabState {
  tabs: TerminalTabData[]
  activeTabId: string | null
}

interface TerminalTabActions {
  createTab: (workspaceId: string, cwd: string, label?: string, initialCommand?: string, activate?: boolean, shell?: string) => string
  createSplitTab: (workspaceId: string, cwd: string, label: string, leftCommand: string | null, rightCommand: string | null) => string
  createViewOnlyTab: (workspaceId: string, cwd: string, label: string, externalSessionId: string) => string
  createPixelAgentsTab: (workspaceId: string, cwd: string) => string
  createPixelAgentsSplitTab: (workspaceId: string, cwd: string) => string
  closeTab: (id: string) => void
  killTabProcesses: (id: string) => void
  setActiveTab: (id: string) => void
  renameTab: (id: string, label: string) => void
  setTabColor: (id: string, color: string | null) => void
  setTabActivity: (id: string, hasActivity: boolean) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  activateNext: (workspaceId?: string) => void
  activatePrev: (workspaceId?: string) => void
  activateByIndex: (index: number, workspaceId?: string) => void
  activateFirstInWorkspace: (workspaceId: string) => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void
  duplicateTab: (tabId: string) => string | null

  // Pane actions
  splitPane: (tabId: string, paneId: string, direction: 'horizontal' | 'vertical') => string | null
  closePane: (tabId: string, paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  setPaneSessionId: (tabId: string, paneId: string, sessionId: string) => void
  resizePane: (tabId: string, splitId: string, ratio: number) => void
  toggleZoomPane: (tabId: string, paneId: string) => void
  focusDirection: (tabId: string, direction: 'left' | 'right' | 'up' | 'down') => void
}

type TerminalTabStore = TerminalTabState & TerminalTabActions

let nextTabNumber = 1

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createLeafPane(initialCommand?: string, externalSessionId?: string, componentType?: 'terminal' | 'pixel-agents', shell?: string): PaneLeaf {
  return {
    type: 'leaf',
    id: generateId('pane'),
    sessionId: null,
    initialCommand: initialCommand ?? null,
    externalSessionId: externalSessionId ?? null,
    ...(componentType && componentType !== 'terminal' ? { componentType } : {}),
    ...(shell ? { shell } : {}),
  }
}

// Count leaf panes in a tree
function countLeaves(node: PaneNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.children[0]) + countLeaves(node.children[1])
}

// Collect all leaf pane ids
function collectLeafIds(node: PaneNode): string[] {
  if (node.type === 'leaf') return [node.id]
  return [...collectLeafIds(node.children[0]), ...collectLeafIds(node.children[1])]
}

// Collect all active session ids from a pane tree
function collectSessionIds(node: PaneNode): string[] {
  if (node.type === 'leaf') return node.sessionId ? [node.sessionId] : []
  return [...collectSessionIds(node.children[0]), ...collectSessionIds(node.children[1])]
}

// Find a pane by id in the tree and return it
function findPane(node: PaneNode, paneId: string): PaneLeaf | null {
  if (node.type === 'leaf') return node.id === paneId ? node : null
  return findPane(node.children[0], paneId) || findPane(node.children[1], paneId)
}

// Replace a node in the tree (returns a new tree)
function replaceNode(tree: PaneNode, targetId: string, replacement: PaneNode): PaneNode {
  if (tree.id === targetId) return replacement
  if (tree.type === 'leaf') return tree
  return {
    ...tree,
    children: [
      replaceNode(tree.children[0], targetId, replacement),
      replaceNode(tree.children[1], targetId, replacement),
    ],
  }
}

// Remove a leaf from the tree: replace the parent split with the sibling
function removeLeaf(tree: PaneNode, paneId: string): PaneNode | null {
  if (tree.type === 'leaf') {
    return tree.id === paneId ? null : tree
  }

  const [left, right] = tree.children

  // Check if direct children are the target
  if (left.id === paneId) return right
  if (right.id === paneId) return left

  // Recurse
  const newLeft = removeLeaf(left, paneId)
  const newRight = removeLeaf(right, paneId)

  if (newLeft === null) return right
  if (newRight === null) return left

  return { ...tree, children: [newLeft, newRight] }
}

// Get approximate position of a leaf pane for directional focus
interface PaneRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

function computePaneRects(
  node: PaneNode,
  x: number,
  y: number,
  w: number,
  h: number,
): PaneRect[] {
  if (node.type === 'leaf') {
    return [{ id: node.id, x, y, w, h }]
  }

  const { direction, ratio, children } = node
  if (direction === 'horizontal') {
    const leftW = w * ratio
    const rightW = w * (1 - ratio)
    return [
      ...computePaneRects(children[0], x, y, leftW, h),
      ...computePaneRects(children[1], x + leftW, y, rightW, h),
    ]
  } else {
    const topH = h * ratio
    const bottomH = h * (1 - ratio)
    return [
      ...computePaneRects(children[0], x, y, w, topH),
      ...computePaneRects(children[1], x, y + topH, w, bottomH),
    ]
  }
}

function isAiCommand(cmd: string | null | undefined): boolean {
  if (!cmd) return false
  return cmd === 'claude' || cmd.includes('claude ') || cmd === 'codex' || cmd.includes('codex ') || cmd === 'copilot' || cmd.includes('copilot ')
}

function countAiPanes(node: PaneNode): number {
  if (node.type === 'leaf') return isAiCommand(node.initialCommand) ? 1 : 0
  return countAiPanes(node.children[0]) + countAiPanes(node.children[1])
}

// Lazy getter to avoid circular imports; returns null in test environments
function getClaudeStore() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../features/claude/claude-store').useClaudeStore
  } catch {
    return null
  }
}

// Lazy getter for kanbanStore to avoid circular imports
function getKanbanStore() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../lib/stores/kanbanStore').useKanbanStore
  } catch {
    return null
  }
}

// Lazy getter for notificationStore to avoid circular imports
function getNotificationStore() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../lib/stores/notificationStore').useNotificationStore
  } catch {
    return null
  }
}

const MAX_TERMINALS_PER_WORKSPACE = 10

export const useTerminalTabStore = create<TerminalTabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  createTab: (workspaceId: string, cwd: string, label?: string, initialCommand?: string, activate = true, shell?: string) => {
    const workspaceTabs = get().tabs.filter((t) => t.workspaceId === workspaceId)
    if (workspaceTabs.length >= MAX_TERMINALS_PER_WORKSPACE) {
      console.warn(`Terminal limit (${MAX_TERMINALS_PER_WORKSPACE}) reached for workspace ${workspaceId}`)
      return ''
    }
    const pane = createLeafPane(initialCommand, undefined, undefined, shell)
    const id = generateId('tab')
    const tabLabel = label || `Terminal ${nextTabNumber++}`
    const tab: TerminalTabData = {
      id,
      label: tabLabel,
      color: null,
      hasActivity: false,
      paneTree: pane,
      activePaneId: pane.id,
      zoomedPaneId: null,
      workspaceId,
      cwd,
      initialCommand: initialCommand ?? null,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      ...(activate ? { activeTabId: id } : {}),
    }))
    if (isAiCommand(initialCommand)) {
      getClaudeStore()?.getState().incrementWorkspaceClaude(workspaceId)
    }
    return id
  },

  createSplitTab: (workspaceId: string, cwd: string, label: string, leftCommand: string | null, rightCommand: string | null) => {
    const workspaceTabs = get().tabs.filter((t) => t.workspaceId === workspaceId)
    if (workspaceTabs.length >= MAX_TERMINALS_PER_WORKSPACE) {
      console.warn(`Terminal limit (${MAX_TERMINALS_PER_WORKSPACE}) reached for workspace ${workspaceId}`)
      return ''
    }
    const leftPane = createLeafPane(leftCommand ?? undefined)
    const rightPane = createLeafPane(rightCommand ?? undefined)
    const splitNode: PaneSplit = {
      type: 'split',
      id: generateId('split'),
      direction: 'horizontal',
      children: [leftPane, rightPane],
      ratio: 0.5,
    }
    const id = generateId('tab')
    const tab: TerminalTabData = {
      id,
      label,
      color: null,
      hasActivity: false,
      paneTree: splitNode,
      activePaneId: rightPane.id,
      zoomedPaneId: null,
      workspaceId,
      cwd,
      initialCommand: null,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }))
    const claudeCount = (isAiCommand(leftCommand) ? 1 : 0) + (isAiCommand(rightCommand) ? 1 : 0)
    if (claudeCount > 0) {
      const store = getClaudeStore()?.getState()
      if (store) for (let i = 0; i < claudeCount; i++) store.incrementWorkspaceClaude(workspaceId)
    }
    return id
  },

  createViewOnlyTab: (workspaceId: string, cwd: string, label: string, externalSessionId: string) => {
    const workspaceTabs = get().tabs.filter((t) => t.workspaceId === workspaceId)
    if (workspaceTabs.length >= MAX_TERMINALS_PER_WORKSPACE) {
      console.warn(`Terminal limit (${MAX_TERMINALS_PER_WORKSPACE}) reached for workspace ${workspaceId}`)
      return ''
    }
    const pane = createLeafPane(undefined, externalSessionId)
    const id = generateId('tab')
    const tab: TerminalTabData = {
      id,
      label,
      color: '#F5A623',
      hasActivity: false,
      paneTree: pane,
      activePaneId: pane.id,
      zoomedPaneId: null,
      workspaceId,
      cwd,
      initialCommand: null,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }))
    return id
  },

  createPixelAgentsTab: (workspaceId: string, cwd: string) => {
    const workspaceTabs = get().tabs.filter((t) => t.workspaceId === workspaceId)
    if (workspaceTabs.length >= MAX_TERMINALS_PER_WORKSPACE) {
      console.warn(`Terminal limit (${MAX_TERMINALS_PER_WORKSPACE}) reached for workspace ${workspaceId}`)
      return ''
    }
    const pane = createLeafPane(undefined, undefined, 'pixel-agents')
    const id = generateId('tab')
    const tab: TerminalTabData = {
      id,
      label: 'Pixel Agents',
      color: null,
      hasActivity: false,
      paneTree: pane,
      activePaneId: pane.id,
      zoomedPaneId: null,
      workspaceId,
      cwd,
      initialCommand: null,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }))
    return id
  },

  createPixelAgentsSplitTab: (workspaceId: string, cwd: string) => {
    const workspaceTabs = get().tabs.filter((t) => t.workspaceId === workspaceId)
    if (workspaceTabs.length >= MAX_TERMINALS_PER_WORKSPACE) {
      console.warn(`Terminal limit (${MAX_TERMINALS_PER_WORKSPACE}) reached for workspace ${workspaceId}`)
      return ''
    }
    const leftPane = createLeafPane('claude')
    const rightPane = createLeafPane(undefined, undefined, 'pixel-agents')
    const splitNode: PaneSplit = {
      type: 'split',
      id: generateId('split'),
      direction: 'horizontal',
      children: [leftPane, rightPane],
      ratio: 0.5,
    }
    const id = generateId('tab')
    const tab: TerminalTabData = {
      id,
      label: 'Claude + Pixel Agents',
      color: null,
      hasActivity: false,
      paneTree: splitNode,
      activePaneId: leftPane.id,
      zoomedPaneId: null,
      workspaceId,
      cwd,
      initialCommand: null,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }))
    getClaudeStore()?.getState().incrementWorkspaceClaude(workspaceId)
    return id
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get()
    const tab = tabs.find((t) => t.id === id)
    if (!tab) return
    const index = tabs.indexOf(tab)

    // Track Claude pane removals
    const claudePaneCount = countAiPanes(tab.paneTree)
    if (claudePaneCount > 0) {
      const store = getClaudeStore()?.getState()
      if (store) for (let i = 0; i < claudePaneCount; i++) store.decrementWorkspaceClaude(tab.workspaceId)
    }

    // Notify kanban store that this tab was closed (may update WORKING → PENDING)
    getKanbanStore()?.getState().handleTabClosed(id)

    // Remove notifications linked to this tab
    getNotificationStore()?.getState().removeByTabId(id)

    const newTabs = tabs.filter((t) => t.id !== id)

    let newActiveId = activeTabId
    if (activeTabId === id) {
      if (newTabs.length === 0) {
        newActiveId = null
      } else if (index >= newTabs.length) {
        newActiveId = newTabs[newTabs.length - 1]!.id
      } else {
        newActiveId = newTabs[index]!.id
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  killTabProcesses: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    for (const sessionId of collectSessionIds(tab.paneTree)) {
      window.kanbai.terminal.close(sessionId).catch(() => { /* best-effort */ })
    }
  },

  setActiveTab: (id: string) => {
    set((state) => ({
      activeTabId: id,
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, hasActivity: false } : t)),
    }))
  },

  renameTab: (id: string, label: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, label } : t)),
    }))
  },

  setTabColor: (id: string, color: string | null) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, color } : t)),
    }))
  },

  setTabActivity: (id: string, hasActivity: boolean) => {
    const { activeTabId } = get()
    if (id === activeTabId) return
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, hasActivity } : t)),
    }))
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const newTabs = [...state.tabs]
      const [moved] = newTabs.splice(fromIndex, 1)
      if (!moved) return state
      newTabs.splice(toIndex, 0, moved)
      return { tabs: newTabs }
    })
  },

  activateNext: (workspaceId?: string) => {
    const { tabs, activeTabId } = get()
    const scopedTabs = workspaceId ? tabs.filter((t) => t.workspaceId === workspaceId) : tabs
    if (scopedTabs.length <= 1) return
    const index = scopedTabs.findIndex((t) => t.id === activeTabId)
    const nextIndex = (index + 1) % scopedTabs.length
    const nextTab = scopedTabs[nextIndex]
    if (nextTab) get().setActiveTab(nextTab.id)
  },

  activatePrev: (workspaceId?: string) => {
    const { tabs, activeTabId } = get()
    const scopedTabs = workspaceId ? tabs.filter((t) => t.workspaceId === workspaceId) : tabs
    if (scopedTabs.length <= 1) return
    const index = scopedTabs.findIndex((t) => t.id === activeTabId)
    const prevIndex = (index - 1 + scopedTabs.length) % scopedTabs.length
    const prevTab = scopedTabs[prevIndex]
    if (prevTab) get().setActiveTab(prevTab.id)
  },

  activateByIndex: (index: number, workspaceId?: string) => {
    const { tabs } = get()
    const scopedTabs = workspaceId ? tabs.filter((t) => t.workspaceId === workspaceId) : tabs
    const tab = scopedTabs[index]
    if (tab) get().setActiveTab(tab.id)
  },

  activateFirstInWorkspace: (workspaceId: string) => {
    const { tabs } = get()
    const workspaceTabs = tabs.filter((t) => t.workspaceId === workspaceId)
    if (workspaceTabs.length > 0) {
      get().setActiveTab(workspaceTabs[0]!.id)
    }
  },

  closeOtherTabs: (id: string) => {
    const { tabs } = get()
    const removedTabs = tabs.filter((t) => t.id !== id)
    // Notify kanban, claude, and notification stores for each removed tab
    const kanbanStore = getKanbanStore()?.getState()
    const claudeStoreState = getClaudeStore()?.getState()
    const notifStore = getNotificationStore()?.getState()
    for (const tab of removedTabs) {
      kanbanStore?.handleTabClosed(tab.id)
      notifStore?.removeByTabId(tab.id)
      const claudePaneCount = countAiPanes(tab.paneTree)
      if (claudePaneCount > 0 && claudeStoreState) {
        for (let i = 0; i < claudePaneCount; i++) claudeStoreState.decrementWorkspaceClaude(tab.workspaceId)
      }
    }
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id === id),
      activeTabId: id,
    }))
  },

  closeTabsToRight: (id: string) => {
    const { tabs } = get()
    const index = tabs.findIndex((t) => t.id === id)
    if (index === -1) return
    const removedTabs = tabs.slice(index + 1)
    // Notify kanban, claude, and notification stores for each removed tab
    const kanbanStore = getKanbanStore()?.getState()
    const claudeStoreState = getClaudeStore()?.getState()
    const notifStore = getNotificationStore()?.getState()
    for (const tab of removedTabs) {
      kanbanStore?.handleTabClosed(tab.id)
      notifStore?.removeByTabId(tab.id)
      const claudePaneCount = countAiPanes(tab.paneTree)
      if (claudePaneCount > 0 && claudeStoreState) {
        for (let i = 0; i < claudePaneCount; i++) claudeStoreState.decrementWorkspaceClaude(tab.workspaceId)
      }
    }
    const kept = tabs.slice(0, index + 1)
    const newActiveId = kept.find((t) => t.id === get().activeTabId)
      ? get().activeTabId
      : id
    set({ tabs: kept, activeTabId: newActiveId })
  },

  duplicateTab: (tabId: string) => {
    const { tabs } = get()
    const source = tabs.find((t) => t.id === tabId)
    if (!source) return null
    const pane = createLeafPane()
    const newId = generateId('tab')
    const tab: TerminalTabData = {
      id: newId,
      label: `Copy of ${source.label}`,
      color: null,
      hasActivity: false,
      paneTree: pane,
      activePaneId: pane.id,
      zoomedPaneId: null,
      workspaceId: source.workspaceId,
      cwd: source.cwd,
      initialCommand: null,
    }
    const sourceIndex = tabs.findIndex((t) => t.id === tabId)
    set((state) => {
      const newTabs = [...state.tabs]
      newTabs.splice(sourceIndex + 1, 0, tab)
      return { tabs: newTabs, activeTabId: newId }
    })
    return newId
  },

  // --- Pane actions ---

  splitPane: (tabId: string, paneId: string, direction: 'horizontal' | 'vertical') => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return null

    // Check max 4 panes
    if (countLeaves(tab.paneTree) >= 4) return null

    const targetPane = findPane(tab.paneTree, paneId)
    if (!targetPane) return null

    const newPane = createLeafPane()
    const splitNode: PaneSplit = {
      type: 'split',
      id: generateId('split'),
      direction,
      children: [{ ...targetPane }, newPane],
      ratio: 0.5,
    }

    const newTree = replaceNode(tab.paneTree, paneId, splitNode)
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, paneTree: newTree, activePaneId: newPane.id, zoomedPaneId: null }
          : t,
      ),
    }))

    return newPane.id
  },

  closePane: (tabId: string, paneId: string) => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    // If only one pane, close the tab (closeTab already handles Claude tracking)
    if (countLeaves(tab.paneTree) <= 1) {
      get().closeTab(tabId)
      return
    }

    // Track Claude pane removal before modifying tree
    const closedPane = findPane(tab.paneTree, paneId)
    if (closedPane && isAiCommand(closedPane.initialCommand)) {
      getClaudeStore()?.getState().decrementWorkspaceClaude(tab.workspaceId)
    }

    const newTree = removeLeaf(tab.paneTree, paneId)
    if (!newTree) return

    // If we closed the active pane, pick another one
    let newActivePaneId = tab.activePaneId
    if (tab.activePaneId === paneId) {
      const leaves = collectLeafIds(newTree)
      newActivePaneId = leaves[0] ?? tab.activePaneId
    }

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              paneTree: newTree,
              activePaneId: newActivePaneId,
              zoomedPaneId: t.zoomedPaneId === paneId ? null : t.zoomedPaneId,
            }
          : t,
      ),
    }))
  },

  setActivePane: (tabId: string, paneId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)),
    }))
  },

  setPaneSessionId: (tabId: string, paneId: string, sessionId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const updateSession = (node: PaneNode): PaneNode => {
          if (node.type === 'leaf') {
            return node.id === paneId ? { ...node, sessionId } : node
          }
          return {
            ...node,
            children: [updateSession(node.children[0]), updateSession(node.children[1])],
          }
        }
        return { ...t, paneTree: updateSession(t.paneTree) }
      }),
    }))
  },

  resizePane: (tabId: string, splitId: string, ratio: number) => {
    const clampedRatio = Math.max(0.1, Math.min(0.9, ratio))
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const updateRatio = (node: PaneNode): PaneNode => {
          if (node.type === 'leaf') return node
          if (node.id === splitId) return { ...node, ratio: clampedRatio }
          return {
            ...node,
            children: [updateRatio(node.children[0]), updateRatio(node.children[1])],
          }
        }
        return { ...t, paneTree: updateRatio(t.paneTree) }
      }),
    }))
  },

  toggleZoomPane: (tabId: string, paneId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        return {
          ...t,
          zoomedPaneId: t.zoomedPaneId === paneId ? null : paneId,
          activePaneId: paneId,
        }
      }),
    }))
  },

  focusDirection: (tabId: string, direction: 'left' | 'right' | 'up' | 'down') => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    const rects = computePaneRects(tab.paneTree, 0, 0, 1, 1)
    const current = rects.find((r) => r.id === tab.activePaneId)
    if (!current) return

    const cx = current.x + current.w / 2
    const cy = current.y + current.h / 2

    let best: PaneRect | null = null
    let bestDist = Infinity

    for (const r of rects) {
      if (r.id === current.id) continue
      const rx = r.x + r.w / 2
      const ry = r.y + r.h / 2

      let valid = false
      switch (direction) {
        case 'left':
          valid = rx < cx
          break
        case 'right':
          valid = rx > cx
          break
        case 'up':
          valid = ry < cy
          break
        case 'down':
          valid = ry > cy
          break
      }

      if (valid) {
        const dist = Math.abs(rx - cx) + Math.abs(ry - cy)
        if (dist < bestDist) {
          bestDist = dist
          best = r
        }
      }
    }

    if (best) {
      get().setActivePane(tabId, best.id)
    }
  },
}))

export function findPaneComponentType(node: PaneNode, paneId: string): 'terminal' | 'pixel-agents' {
  if (node.type === 'leaf') {
    return node.id === paneId ? (node.componentType ?? 'terminal') : 'terminal'
  }
  const left = findPaneComponentType(node.children[0], paneId)
  return left !== 'terminal' ? left : findPaneComponentType(node.children[1], paneId)
}

// Export utility for components
export { countLeaves, collectLeafIds, computePaneRects }
export type { PaneRect }

// Compute split divider positions for flat rendering
export interface SplitDividerInfo {
  splitId: string
  direction: 'horizontal' | 'vertical'
  x: number
  y: number
  w: number
  h: number
}

export function computeSplitDividers(
  node: PaneNode,
  x: number,
  y: number,
  w: number,
  h: number,
): SplitDividerInfo[] {
  if (node.type === 'leaf') return []

  const { direction, ratio, children } = node
  const dividers: SplitDividerInfo[] = []

  if (direction === 'horizontal') {
    const leftW = w * ratio
    const rightW = w * (1 - ratio)
    dividers.push({
      splitId: node.id,
      direction: 'horizontal',
      x: x + leftW,
      y,
      w: 0,
      h,
    })
    dividers.push(...computeSplitDividers(children[0], x, y, leftW, h))
    dividers.push(...computeSplitDividers(children[1], x + leftW, y, rightW, h))
  } else {
    const topH = h * ratio
    const bottomH = h * (1 - ratio)
    dividers.push({
      splitId: node.id,
      direction: 'vertical',
      x,
      y: y + topH,
      w,
      h: 0,
    })
    dividers.push(...computeSplitDividers(children[0], x, y, w, topH))
    dividers.push(...computeSplitDividers(children[1], x, y + topH, w, bottomH))
  }

  return dividers
}

// Sync tab metadata to the main process whenever tabs change.
// This allows the companion/mobile app to see ALL open tabs, even those
// whose PTY process has exited.
useTerminalTabStore.subscribe((state, prevState) => {
  if (state.tabs !== prevState.tabs && typeof window !== 'undefined' && window.kanbai?.terminal?.syncTabs) {
    const tabSummary = state.tabs.map((t) => ({
      id: t.id,
      label: t.label,
      workspaceId: t.workspaceId,
    }))
    window.kanbai.terminal.syncTabs(tabSummary)
  }
})
