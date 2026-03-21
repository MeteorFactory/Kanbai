import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.stubGlobal('window', { kanbai: {} })

const { useDatabaseTabStore } = await import(
  '../../src/renderer/features/database/database-tab-store'
)

describe('useDatabaseTabStore', () => {
  beforeEach(() => {
    useDatabaseTabStore.setState({
      tabsByConnection: {},
      activeTabByConnection: {},
    })
    vi.clearAllMocks()
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useDatabaseTabStore.getState()
      expect(state.tabsByConnection).toEqual({})
      expect(state.activeTabByConnection).toEqual({})
    })
  })

  describe('createTab', () => {
    it('cree un tab avec les valeurs par defaut et retourne l id', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      expect(tabId).toMatch(/^dbtab-/)
      const tabs = useDatabaseTabStore.getState().tabsByConnection['conn-1']
      expect(tabs).toHaveLength(1)
      expect(tabs![0]).toEqual(
        expect.objectContaining({
          id: tabId,
          connectionId: 'conn-1',
          label: 'New Query',
          query: '',
          results: null,
          executing: false,
          limit: 100,
          page: 0,
        }),
      )
    })

    it('definit le nouveau tab comme actif', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(tabId)
    })

    it('cree plusieurs tabs pour la meme connexion', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      const id2 = useDatabaseTabStore.getState().createTab('conn-1')

      expect(id1).not.toBe(id2)
      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(2)
      // Last created tab becomes active
      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id2)
    })

    it('cree des tabs pour des connexions differentes', () => {
      useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().createTab('conn-2')

      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(1)
      expect(useDatabaseTabStore.getState().tabsByConnection['conn-2']).toHaveLength(1)
    })
  })

  describe('closeTab', () => {
    it('supprime le tab de la liste', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().closeTab('conn-1', tabId)

      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(0)
    })

    it('selectionne le tab suivant quand le tab actif est ferme', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      const id2 = useDatabaseTabStore.getState().createTab('conn-1')
      const id3 = useDatabaseTabStore.getState().createTab('conn-1')
      // Set first tab as active
      useDatabaseTabStore.getState().setActiveTab('conn-1', id1)

      useDatabaseTabStore.getState().closeTab('conn-1', id1)

      // Should select the tab at the same index (which is id2)
      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id2)
      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(2)
      // id3 is still there
      const ids = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.map((t) => t.id)
      expect(ids).toContain(id2)
      expect(ids).toContain(id3)
    })

    it('selectionne le tab precedent quand le dernier tab actif est ferme', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      const id2 = useDatabaseTabStore.getState().createTab('conn-1')
      // id2 is the active tab (last created)
      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id2)

      useDatabaseTabStore.getState().closeTab('conn-1', id2)

      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id1)
    })

    it('met activeTab vide quand le dernier tab est ferme', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().closeTab('conn-1', tabId)

      // When no tabs left, activeTab becomes empty string
      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe('')
    })

    it('ne modifie pas activeTab quand un tab non actif est ferme', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      const id2 = useDatabaseTabStore.getState().createTab('conn-1')
      // id2 is active
      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id2)

      useDatabaseTabStore.getState().closeTab('conn-1', id1)

      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id2)
      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(1)
    })

    it('ne fait rien si le tab n existe pas', () => {
      useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().closeTab('conn-1', 'tab-inexistant')

      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(1)
    })
  })

  describe('setActiveTab', () => {
    it('met a jour le tab actif pour une connexion', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().setActiveTab('conn-1', id1)

      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(id1)
    })
  })

  describe('updateTabQuery', () => {
    it('met a jour la requete et derive le label', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().updateTabQuery('conn-1', tabId, 'SELECT * FROM users')

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.query).toBe('SELECT * FROM users')
      expect(tab.label).toBe('SELECT * FROM users')
    })

    it('tronque le label a 30 caracteres avec des points de suspension', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')
      const longQuery =
        'SELECT id, name, email, created_at FROM users WHERE active = true'

      useDatabaseTabStore.getState().updateTabQuery('conn-1', tabId, longQuery)

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.label).toBe('SELECT id, name, email, create...')
      expect(tab.label.length).toBe(33) // 30 chars + '...'
    })

    it('utilise New Query comme label si la requete est vide', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().updateTabQuery('conn-1', tabId, 'SELECT 1')
      useDatabaseTabStore.getState().updateTabQuery('conn-1', tabId, '')

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.label).toBe('New Query')
    })

    it('utilise New Query comme label si la requete ne contient que des espaces', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().updateTabQuery('conn-1', tabId, '   ')

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.label).toBe('New Query')
    })
  })

  describe('updateTabResults', () => {
    it('met a jour les resultats du tab', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')
      const results = {
        columns: ['id', 'name'],
        rows: [{ id: 1, name: 'Alice' }],
        rowCount: 1,
        executionTime: 42,
      }

      useDatabaseTabStore.getState().updateTabResults('conn-1', tabId, results)

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.results).toEqual(results)
    })

    it('met les resultats a null', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().updateTabResults('conn-1', tabId, {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: 0,
      })

      useDatabaseTabStore.getState().updateTabResults('conn-1', tabId, null)

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.results).toBeNull()
    })
  })

  describe('updateTabExecuting', () => {
    it('met a jour le flag executing', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().updateTabExecuting('conn-1', tabId, true)

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.executing).toBe(true)

      useDatabaseTabStore.getState().updateTabExecuting('conn-1', tabId, false)

      const updated = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(updated.executing).toBe(false)
    })
  })

  describe('updateTabLimit', () => {
    it('met a jour la limite du tab', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().updateTabLimit('conn-1', tabId, 50)

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.limit).toBe(50)
    })
  })

  describe('updateTabPage', () => {
    it('met a jour la page du tab', () => {
      const tabId = useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().updateTabPage('conn-1', tabId, 3)

      const tab = useDatabaseTabStore
        .getState()
        .tabsByConnection['conn-1']!.find((t) => t.id === tabId)!
      expect(tab.page).toBe(3)
    })
  })

  describe('clearTabsForConnection', () => {
    it('supprime tous les tabs et le tab actif pour une connexion', () => {
      useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().createTab('conn-2')

      useDatabaseTabStore.getState().clearTabsForConnection('conn-1')

      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toBeUndefined()
      expect(
        useDatabaseTabStore.getState().activeTabByConnection['conn-1'],
      ).toBeUndefined()
      // conn-2 is untouched
      expect(useDatabaseTabStore.getState().tabsByConnection['conn-2']).toHaveLength(1)
    })

    it('ne fait rien si la connexion n a pas de tabs', () => {
      useDatabaseTabStore.getState().createTab('conn-1')

      useDatabaseTabStore.getState().clearTabsForConnection('conn-inexistant')

      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(1)
    })
  })

  describe('ensureTab', () => {
    it('retourne le tab actif existant', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.getState().setActiveTab('conn-1', id1)

      const result = useDatabaseTabStore.getState().ensureTab('conn-1')

      expect(result).toBe(id1)
    })

    it('retourne le premier tab si le tab actif est invalide', () => {
      const id1 = useDatabaseTabStore.getState().createTab('conn-1')
      useDatabaseTabStore.setState((state) => ({
        activeTabByConnection: {
          ...state.activeTabByConnection,
          'conn-1': 'tab-invalide',
        },
      }))

      const result = useDatabaseTabStore.getState().ensureTab('conn-1')

      expect(result).toBe(id1)
    })

    it('cree un nouveau tab si aucun n existe', () => {
      const result = useDatabaseTabStore.getState().ensureTab('conn-1')

      expect(result).toMatch(/^dbtab-/)
      expect(useDatabaseTabStore.getState().tabsByConnection['conn-1']).toHaveLength(1)
    })

    it('definit le tab cree comme actif', () => {
      const result = useDatabaseTabStore.getState().ensureTab('conn-1')

      expect(useDatabaseTabStore.getState().activeTabByConnection['conn-1']).toBe(result)
    })
  })
})
