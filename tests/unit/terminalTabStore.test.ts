import { describe, it, expect, beforeEach } from 'vitest'
import { useTerminalTabStore, countLeaves, collectLeafIds } from '../../src/renderer/features/terminal'
import type { PaneLeaf, PaneSplit } from '../../src/renderer/features/terminal'

describe('useTerminalTabStore', () => {
  beforeEach(() => {
    useTerminalTabStore.setState({
      tabs: [],
      activeTabId: null,
    })
  })

  describe('createTab', () => {
    it('cree un tab avec un pane leaf', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      const state = useTerminalTabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe(tabId)

      const tab = state.tabs[0]!
      expect(tab.id).toBe(tabId)
      expect(tab.label).toMatch(/^Terminal \d+$/)
      expect(tab.color).toBeNull()
      expect(tab.hasActivity).toBe(false)
      expect(tab.paneTree.type).toBe('leaf')
      expect(tab.activePaneId).toBe(tab.paneTree.id)
      expect(tab.zoomedPaneId).toBeNull()
    })

    it('cree plusieurs tabs', () => {
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const secondId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      const state = useTerminalTabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe(secondId)
    })
  })

  describe('closeTab', () => {
    it('ferme un tab et active le suivant', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id2 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setActiveTab(id1)

      useTerminalTabStore.getState().closeTab(id1)

      const state = useTerminalTabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe(id2)
    })

    it('active le dernier si on ferme le dernier tab actif', () => {
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id2 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id3 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setActiveTab(id3)

      useTerminalTabStore.getState().closeTab(id3)

      expect(useTerminalTabStore.getState().activeTabId).toBe(id2)
    })

    it('met activeTabId a null si c etait le seul tab', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().closeTab(id)

      expect(useTerminalTabStore.getState().activeTabId).toBeNull()
      expect(useTerminalTabStore.getState().tabs).toHaveLength(0)
    })

    it('ne fait rien si le tab n existe pas', () => {
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().closeTab('inexistant')

      expect(useTerminalTabStore.getState().tabs).toHaveLength(1)
    })
  })

  describe('setActiveTab', () => {
    it('change le tab actif et reset hasActivity', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      // Simulate activity on tab 1
      useTerminalTabStore.getState().setTabActivity(id1, true)
      expect(useTerminalTabStore.getState().tabs.find((t) => t.id === id1)!.hasActivity).toBe(true)

      // Switch to tab 1
      useTerminalTabStore.getState().setActiveTab(id1)

      const state = useTerminalTabStore.getState()
      expect(state.activeTabId).toBe(id1)
      expect(state.tabs.find((t) => t.id === id1)!.hasActivity).toBe(false)
    })
  })

  describe('renameTab', () => {
    it('renomme un tab', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().renameTab(id, 'Mon Terminal')

      expect(useTerminalTabStore.getState().tabs[0]!.label).toBe('Mon Terminal')
    })
  })

  describe('setTabColor', () => {
    it('change la couleur d un tab', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setTabColor(id, '#ff0000')

      expect(useTerminalTabStore.getState().tabs[0]!.color).toBe('#ff0000')
    })

    it('supprime la couleur avec null', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setTabColor(id, '#ff0000')
      useTerminalTabStore.getState().setTabColor(id, null)

      expect(useTerminalTabStore.getState().tabs[0]!.color).toBeNull()
    })
  })

  describe('setTabActivity', () => {
    it('ne marque pas l activite sur le tab actif', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setTabActivity(id, true)

      // Tab is active, so hasActivity should remain false
      expect(useTerminalTabStore.getState().tabs[0]!.hasActivity).toBe(false)
    })

    it('marque l activite sur un tab non actif', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      useTerminalTabStore.getState().setTabActivity(id1, true)

      expect(useTerminalTabStore.getState().tabs.find((t) => t.id === id1)!.hasActivity).toBe(true)
    })
  })

  describe('reorderTabs', () => {
    it('reordonne les tabs', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id2 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id3 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      useTerminalTabStore.getState().reorderTabs(2, 0)

      const tabs = useTerminalTabStore.getState().tabs
      expect(tabs[0]!.id).toBe(id3)
      expect(tabs[1]!.id).toBe(id1)
      expect(tabs[2]!.id).toBe(id2)
    })
  })

  describe('activateNext / activatePrev', () => {
    it('active le tab suivant circulairement', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id2 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setActiveTab(id1)

      useTerminalTabStore.getState().activateNext()
      expect(useTerminalTabStore.getState().activeTabId).toBe(id2)

      useTerminalTabStore.getState().activateNext()
      expect(useTerminalTabStore.getState().activeTabId).toBe(id1)
    })

    it('active le tab precedent circulairement', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id2 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().setActiveTab(id1)

      useTerminalTabStore.getState().activatePrev()
      expect(useTerminalTabStore.getState().activeTabId).toBe(id2)
    })

    it('ne fait rien avec un seul tab', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().activateNext()
      expect(useTerminalTabStore.getState().activeTabId).toBe(id)
    })
  })

  describe('activateByIndex', () => {
    it('active un tab par index', () => {
      const id1 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      useTerminalTabStore.getState().activateByIndex(0)
      expect(useTerminalTabStore.getState().activeTabId).toBe(id1)
    })

    it('ne fait rien avec un index invalide', () => {
      const id = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().activateByIndex(99)
      expect(useTerminalTabStore.getState().activeTabId).toBe(id)
    })
  })

  describe('closeOtherTabs', () => {
    it('ferme tous les tabs sauf celui specifie', () => {
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const id2 = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')

      useTerminalTabStore.getState().closeOtherTabs(id2)

      expect(useTerminalTabStore.getState().tabs).toHaveLength(1)
      expect(useTerminalTabStore.getState().tabs[0]!.id).toBe(id2)
      expect(useTerminalTabStore.getState().activeTabId).toBe(id2)
    })
  })

  describe('splitPane', () => {
    it('split un pane horizontalement', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const tab = useTerminalTabStore.getState().tabs[0]!
      const paneId = tab.activePaneId

      const newPaneId = useTerminalTabStore.getState().splitPane(tabId, paneId, 'horizontal')

      expect(newPaneId).not.toBeNull()

      const updatedTab = useTerminalTabStore.getState().tabs[0]!
      expect(updatedTab.paneTree.type).toBe('split')
      const split = updatedTab.paneTree as PaneSplit
      expect(split.direction).toBe('horizontal')
      expect(split.ratio).toBe(0.5)
      expect(split.children).toHaveLength(2)
      expect(updatedTab.activePaneId).toBe(newPaneId)
    })

    it('split un pane verticalement', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const tab = useTerminalTabStore.getState().tabs[0]!

      useTerminalTabStore.getState().splitPane(tabId, tab.activePaneId, 'vertical')

      const split = useTerminalTabStore.getState().tabs[0]!.paneTree as PaneSplit
      expect(split.direction).toBe('vertical')
    })

    it('ne depasse pas 4 panes', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const tab = useTerminalTabStore.getState().tabs[0]!

      // Split 1 -> 2
      const p2 = useTerminalTabStore.getState().splitPane(tabId, tab.activePaneId, 'horizontal')
      expect(p2).not.toBeNull()

      // Split 2 -> 3
      const p3 = useTerminalTabStore.getState().splitPane(tabId, p2!, 'vertical')
      expect(p3).not.toBeNull()

      // Split 3 -> 4
      const p4 = useTerminalTabStore.getState().splitPane(tabId, p3!, 'horizontal')
      expect(p4).not.toBeNull()

      // Split 4 -> should fail (max 4)
      const p5 = useTerminalTabStore.getState().splitPane(tabId, p4!, 'vertical')
      expect(p5).toBeNull()
    })

    it('retourne null pour un tab inexistant', () => {
      const result = useTerminalTabStore.getState().splitPane('inexistant', 'pane', 'horizontal')
      expect(result).toBeNull()
    })

    it('reset le zoomedPaneId apres un split', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const tab = useTerminalTabStore.getState().tabs[0]!

      useTerminalTabStore.getState().toggleZoomPane(tabId, tab.activePaneId)
      expect(useTerminalTabStore.getState().tabs[0]!.zoomedPaneId).not.toBeNull()

      useTerminalTabStore.getState().splitPane(tabId, tab.activePaneId, 'horizontal')
      expect(useTerminalTabStore.getState().tabs[0]!.zoomedPaneId).toBeNull()
    })
  })

  describe('closePane', () => {
    it('ferme le tab si c est le seul pane', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const paneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      useTerminalTabStore.getState().closePane(tabId, paneId)

      expect(useTerminalTabStore.getState().tabs).toHaveLength(0)
    })

    it('ferme un pane dans un split', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const originalPaneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      const newPaneId = useTerminalTabStore.getState().splitPane(tabId, originalPaneId, 'horizontal')
      expect(newPaneId).not.toBeNull()

      useTerminalTabStore.getState().closePane(tabId, newPaneId!)

      const tab = useTerminalTabStore.getState().tabs[0]!
      expect(tab.paneTree.type).toBe('leaf')
    })

    it('selectionne un autre pane si on ferme le pane actif', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const originalPaneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      const newPaneId = useTerminalTabStore.getState().splitPane(tabId, originalPaneId, 'horizontal')

      // Active pane is the new one, close it
      useTerminalTabStore.getState().closePane(tabId, newPaneId!)

      expect(useTerminalTabStore.getState().tabs[0]!.activePaneId).toBe(originalPaneId)
    })
  })

  describe('setPaneSessionId', () => {
    it('associe un sessionId a un pane', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const paneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      useTerminalTabStore.getState().setPaneSessionId(tabId, paneId, 'session-123')

      const leaf = useTerminalTabStore.getState().tabs[0]!.paneTree as PaneLeaf
      expect(leaf.sessionId).toBe('session-123')
    })
  })

  describe('resizePane', () => {
    it('change le ratio d un split', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const paneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      useTerminalTabStore.getState().splitPane(tabId, paneId, 'horizontal')

      const splitId = useTerminalTabStore.getState().tabs[0]!.paneTree.id

      useTerminalTabStore.getState().resizePane(tabId, splitId, 0.7)

      const split = useTerminalTabStore.getState().tabs[0]!.paneTree as PaneSplit
      expect(split.ratio).toBe(0.7)
    })

    it('clamp le ratio entre 0.1 et 0.9', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const paneId = useTerminalTabStore.getState().tabs[0]!.activePaneId
      useTerminalTabStore.getState().splitPane(tabId, paneId, 'horizontal')
      const splitId = useTerminalTabStore.getState().tabs[0]!.paneTree.id

      useTerminalTabStore.getState().resizePane(tabId, splitId, 0.0)
      expect((useTerminalTabStore.getState().tabs[0]!.paneTree as PaneSplit).ratio).toBe(0.1)

      useTerminalTabStore.getState().resizePane(tabId, splitId, 1.0)
      expect((useTerminalTabStore.getState().tabs[0]!.paneTree as PaneSplit).ratio).toBe(0.9)
    })
  })

  describe('toggleZoomPane', () => {
    it('zoom et dezoom un pane', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const paneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      useTerminalTabStore.getState().toggleZoomPane(tabId, paneId)
      expect(useTerminalTabStore.getState().tabs[0]!.zoomedPaneId).toBe(paneId)

      useTerminalTabStore.getState().toggleZoomPane(tabId, paneId)
      expect(useTerminalTabStore.getState().tabs[0]!.zoomedPaneId).toBeNull()
    })
  })

  describe('focusDirection', () => {
    it('focus le pane a droite', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const leftPaneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      const rightPaneId = useTerminalTabStore.getState().splitPane(tabId, leftPaneId, 'horizontal')
      useTerminalTabStore.getState().setActivePane(tabId, leftPaneId)

      useTerminalTabStore.getState().focusDirection(tabId, 'right')
      expect(useTerminalTabStore.getState().tabs[0]!.activePaneId).toBe(rightPaneId)
    })

    it('focus le pane a gauche', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const leftPaneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      useTerminalTabStore.getState().splitPane(tabId, leftPaneId, 'horizontal')

      // Active pane is the right one (last split target)
      useTerminalTabStore.getState().focusDirection(tabId, 'left')
      expect(useTerminalTabStore.getState().tabs[0]!.activePaneId).toBe(leftPaneId)
    })

    it('ne fait rien si pas de pane dans la direction', () => {
      const tabId = useTerminalTabStore.getState().createTab('ws-test', '/tmp/test')
      const paneId = useTerminalTabStore.getState().tabs[0]!.activePaneId

      useTerminalTabStore.getState().focusDirection(tabId, 'left')
      expect(useTerminalTabStore.getState().tabs[0]!.activePaneId).toBe(paneId)
    })
  })
})

describe('utility functions', () => {
  it('countLeaves compte les feuilles', () => {
    const leaf: PaneLeaf = { type: 'leaf', id: 'p1', sessionId: null, initialCommand: null, externalSessionId: null }
    expect(countLeaves(leaf)).toBe(1)

    const split: PaneSplit = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      children: [
        { type: 'leaf', id: 'p1', sessionId: null, initialCommand: null, externalSessionId: null },
        { type: 'leaf', id: 'p2', sessionId: null, initialCommand: null, externalSessionId: null },
      ],
      ratio: 0.5,
    }
    expect(countLeaves(split)).toBe(2)
  })

  it('collectLeafIds collecte les ids des feuilles', () => {
    const split: PaneSplit = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      children: [
        { type: 'leaf', id: 'p1', sessionId: null, initialCommand: null, externalSessionId: null },
        { type: 'leaf', id: 'p2', sessionId: null, initialCommand: null, externalSessionId: null },
      ],
      ratio: 0.5,
    }
    expect(collectLeafIds(split)).toEqual(['p1', 'p2'])
  })
})
