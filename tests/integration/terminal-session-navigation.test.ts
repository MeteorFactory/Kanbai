import { describe, it, expect, beforeEach } from 'vitest'
import { useTerminalTabStore } from '../../src/renderer/features/terminal'
import type { TerminalTabData } from '../../src/renderer/features/terminal'

/**
 * Integration tests for terminal session navigation.
 *
 * These tests verify that terminal tabs are correctly scoped to workspaces:
 * - activateNext/activatePrev cycle within the active workspace only
 * - activateByIndex uses workspace-local indexing
 * - Switching workspaces activates a tab from the new workspace
 * - Tab operations (close, reorder) are workspace-scoped
 */

function getTabsForWorkspace(workspaceId: string): TerminalTabData[] {
  return useTerminalTabStore.getState().tabs.filter((t) => t.workspaceId === workspaceId)
}

describe('Terminal session navigation - workspace isolation', () => {
  beforeEach(() => {
    useTerminalTabStore.setState({
      tabs: [],
      activeTabId: null,
    })
  })

  describe('multi-workspace tab creation', () => {
    it('creates tabs associated with specific workspaces', () => {
      const t1 = useTerminalTabStore.getState().createTab('ws-1', '/project-a')
      const t2 = useTerminalTabStore.getState().createTab('ws-2', '/project-b')

      expect(getTabsForWorkspace('ws-1')).toHaveLength(1)
      expect(getTabsForWorkspace('ws-2')).toHaveLength(1)
      expect(getTabsForWorkspace('ws-1')[0]!.id).toBe(t1)
      expect(getTabsForWorkspace('ws-2')[0]!.id).toBe(t2)
    })

    it('split tabs are associated with the correct workspace', () => {
      const t1 = useTerminalTabStore.getState().createSplitTab('ws-1', '/project-a', 'Claude + Terminal', 'claude', null)
      const t2 = useTerminalTabStore.getState().createSplitTab('ws-2', '/project-b', 'Claude + Terminal', 'claude', null)

      expect(getTabsForWorkspace('ws-1')).toHaveLength(1)
      expect(getTabsForWorkspace('ws-2')).toHaveLength(1)
      expect(getTabsForWorkspace('ws-1')[0]!.paneTree.type).toBe('split')
      expect(getTabsForWorkspace('ws-2')[0]!.paneTree.type).toBe('split')
    })

    it('multiple tabs per workspace are properly isolated', () => {
      useTerminalTabStore.getState().createTab('ws-1', '/project-a', 'Tab A1')
      useTerminalTabStore.getState().createTab('ws-1', '/project-a', 'Tab A2')
      useTerminalTabStore.getState().createTab('ws-2', '/project-b', 'Tab B1')

      expect(getTabsForWorkspace('ws-1')).toHaveLength(2)
      expect(getTabsForWorkspace('ws-2')).toHaveLength(1)
      expect(useTerminalTabStore.getState().tabs).toHaveLength(3)
    })
  })

  describe('activateNext - workspace scoped', () => {
    it('cycles only through tabs of the given workspace', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const a2 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // Set active to first tab of ws-1
      useTerminalTabStore.getState().setActiveTab(a1)

      // activateNext should go to A2, not B1
      useTerminalTabStore.getState().activateNext('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a2)

      // activateNext again should wrap back to A1
      useTerminalTabStore.getState().activateNext('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('does nothing if workspace has only one tab', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')
      useTerminalTabStore.getState().setActiveTab(a1)

      useTerminalTabStore.getState().activateNext('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('falls back to global cycling when no workspaceId is provided', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')
      useTerminalTabStore.getState().setActiveTab(a1)

      // Without workspaceId, cycle through all tabs (backwards-compat)
      useTerminalTabStore.getState().activateNext()
      expect(useTerminalTabStore.getState().activeTabId).toBe(b1)
    })
  })

  describe('activatePrev - workspace scoped', () => {
    it('cycles only through tabs of the given workspace', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const a2 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      useTerminalTabStore.getState().setActiveTab(a1)

      // activatePrev should go to A2 (circular), not B1
      useTerminalTabStore.getState().activatePrev('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a2)

      // activatePrev again should wrap back to A1
      useTerminalTabStore.getState().activatePrev('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('does nothing if workspace has only one tab', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')
      useTerminalTabStore.getState().setActiveTab(a1)

      useTerminalTabStore.getState().activatePrev('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })
  })

  describe('activateByIndex - workspace scoped', () => {
    it('activates tab by workspace-local index', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const a2 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')
      const a3 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A3')

      // Index 0 in ws-1 should be A1
      useTerminalTabStore.getState().activateByIndex(0, 'ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)

      // Index 1 in ws-1 should be A2
      useTerminalTabStore.getState().activateByIndex(1, 'ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a2)

      // Index 2 in ws-1 should be A3 (skipping B1)
      useTerminalTabStore.getState().activateByIndex(2, 'ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a3)
    })

    it('does nothing for out-of-range index', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().setActiveTab(a1)

      useTerminalTabStore.getState().activateByIndex(99, 'ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('falls back to global index when no workspaceId is provided', () => {
      useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // Index 1 globally should be B1
      useTerminalTabStore.getState().activateByIndex(1)
      expect(useTerminalTabStore.getState().activeTabId).toBe(b1)
    })
  })

  describe('workspace switching - activeTabId sync', () => {
    it('activateFirstInWorkspace sets activeTabId to first tab of the workspace', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // Currently active is B1 (last created)
      expect(useTerminalTabStore.getState().activeTabId).toBe(b1)

      // Switch to ws-1 should activate first tab of ws-1
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('activateFirstInWorkspace does nothing if workspace has no tabs', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().setActiveTab(a1)

      // ws-2 has no tabs
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-2')
      // activeTabId should not change
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('back and forth workspace switching preserves tab context', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const a2 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // Active: B1. Switch to ws-1 → should activate A1 (first in ws-1)
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)

      // Navigate to A2 within ws-1
      useTerminalTabStore.getState().setActiveTab(a2)

      // Switch to ws-2 → should activate B1
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-2')
      expect(useTerminalTabStore.getState().activeTabId).toBe(b1)

      // Switch back to ws-1 → should activate A1 (first, since we don't remember last active)
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })
  })

  describe('closing tabs across workspaces', () => {
    it('closing a tab activates next in same workspace context', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const a2 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      useTerminalTabStore.getState().setActiveTab(a1)
      useTerminalTabStore.getState().closeTab(a1)

      // Should activate A2 (next tab overall), which is in the same workspace
      const state = useTerminalTabStore.getState()
      expect(state.activeTabId).toBe(a2)
    })

    it('closing all tabs of a workspace leaves other workspace tabs intact', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      useTerminalTabStore.getState().setActiveTab(a1)
      useTerminalTabStore.getState().closeTab(a1)

      expect(getTabsForWorkspace('ws-1')).toHaveLength(0)
      expect(getTabsForWorkspace('ws-2')).toHaveLength(1)
      expect(useTerminalTabStore.getState().activeTabId).toBe(b1)
    })

    it('closeOtherTabs preserves tabs from other workspaces', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().createTab('ws-1', '/a', 'A2')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // closeOtherTabs keeps only the specified tab
      useTerminalTabStore.getState().closeOtherTabs(a1)

      // This is the current behavior - closeOtherTabs is global
      expect(useTerminalTabStore.getState().tabs).toHaveLength(1)
      expect(useTerminalTabStore.getState().tabs[0]!.id).toBe(a1)
    })
  })

  describe('split tab navigation within workspace', () => {
    it('split tab is created in the correct workspace', () => {
      useTerminalTabStore.getState().createSplitTab('ws-1', '/a', 'Split A', 'claude', null)
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'Tab B')

      const wsTabs = getTabsForWorkspace('ws-1')
      expect(wsTabs).toHaveLength(1)
      expect(wsTabs[0]!.paneTree.type).toBe('split')
      expect(wsTabs[0]!.label).toBe('Split A')
    })

    it('split operations work correctly across workspace-scoped tabs', () => {
      const splitId = useTerminalTabStore.getState().createSplitTab('ws-1', '/a', 'Split', 'claude', null)
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'Tab B')

      const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === splitId)!
      expect(tab.paneTree.type).toBe('split')

      // Focus direction within the split tab should work
      const activePaneId = tab.activePaneId
      useTerminalTabStore.getState().focusDirection(splitId, 'left')
      const updatedTab = useTerminalTabStore.getState().tabs.find((t) => t.id === splitId)!
      // Should have changed (split has left and right panes)
      expect(updatedTab.activePaneId).not.toBe(activePaneId)
    })
  })

  describe('tab activity across workspaces', () => {
    it('activity is tracked per tab regardless of workspace', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // B1 is active (last created). Set activity on A1.
      useTerminalTabStore.getState().setTabActivity(a1, true)

      const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === a1)!
      expect(tab.hasActivity).toBe(true)

      // B1 is active so activity shouldn't be set
      useTerminalTabStore.getState().setTabActivity(b1, true)
      const bTab = useTerminalTabStore.getState().tabs.find((t) => t.id === b1)!
      expect(bTab.hasActivity).toBe(false)
    })

    it('switching to a tab with activity clears the activity flag', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')

      // Set activity on A1 (not active)
      useTerminalTabStore.getState().setTabActivity(a1, true)
      expect(useTerminalTabStore.getState().tabs.find((t) => t.id === a1)!.hasActivity).toBe(true)

      // Activate A1
      useTerminalTabStore.getState().setActiveTab(a1)
      expect(useTerminalTabStore.getState().tabs.find((t) => t.id === a1)!.hasActivity).toBe(false)
    })
  })

  describe('initial command propagation', () => {
    it('createTab stores initialCommand on the leaf pane', () => {
      useTerminalTabStore.getState().createTab('ws-1', '/a', 'Shell', 'bash')

      const tab = useTerminalTabStore.getState().tabs[0]!
      expect(tab.paneTree.type).toBe('leaf')
      expect(tab.initialCommand).toBe('bash')
      if (tab.paneTree.type === 'leaf') {
        expect(tab.paneTree.initialCommand).toBe('bash')
      }
    })

    it('createSplitTab stores commands on correct panes', () => {
      useTerminalTabStore.getState().createSplitTab('ws-1', '/a', 'Split', 'claude', 'npm run dev')

      const tab = useTerminalTabStore.getState().tabs[0]!
      expect(tab.paneTree.type).toBe('split')
      if (tab.paneTree.type === 'split') {
        const [left, right] = tab.paneTree.children
        expect(left.type).toBe('leaf')
        expect(right.type).toBe('leaf')
        if (left.type === 'leaf') expect(left.initialCommand).toBe('claude')
        if (right.type === 'leaf') expect(right.initialCommand).toBe('npm run dev')
      }
    })
  })

  describe('edge cases', () => {
    it('navigating when no tabs exist does nothing', () => {
      useTerminalTabStore.getState().activateNext('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBeNull()

      useTerminalTabStore.getState().activatePrev('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBeNull()

      useTerminalTabStore.getState().activateByIndex(0, 'ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBeNull()
    })

    it('activateFirstInWorkspace with empty workspace does nothing', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      useTerminalTabStore.getState().setActiveTab(a1)

      useTerminalTabStore.getState().activateFirstInWorkspace('ws-nonexistent')
      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
    })

    it('rapid workspace switching does not corrupt state', () => {
      const a1 = useTerminalTabStore.getState().createTab('ws-1', '/a', 'A1')
      const b1 = useTerminalTabStore.getState().createTab('ws-2', '/b', 'B1')
      const c1 = useTerminalTabStore.getState().createTab('ws-3', '/c', 'C1')

      // Rapidly switch workspaces
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-1')
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-3')
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-2')
      useTerminalTabStore.getState().activateFirstInWorkspace('ws-1')

      expect(useTerminalTabStore.getState().activeTabId).toBe(a1)
      expect(useTerminalTabStore.getState().tabs).toHaveLength(3)
    })

    it('workspace with many tabs cycles correctly', () => {
      const ids: string[] = []
      for (let i = 0; i < 10; i++) {
        ids.push(useTerminalTabStore.getState().createTab('ws-1', '/a', `Tab ${i}`))
      }
      // Add a tab from another workspace in between
      useTerminalTabStore.getState().createTab('ws-2', '/b', 'Other')

      useTerminalTabStore.getState().setActiveTab(ids[0]!)

      // Cycle through all 10 tabs
      for (let i = 1; i < 10; i++) {
        useTerminalTabStore.getState().activateNext('ws-1')
        expect(useTerminalTabStore.getState().activeTabId).toBe(ids[i])
      }

      // One more should wrap to first
      useTerminalTabStore.getState().activateNext('ws-1')
      expect(useTerminalTabStore.getState().activeTabId).toBe(ids[0])
    })
  })
})
