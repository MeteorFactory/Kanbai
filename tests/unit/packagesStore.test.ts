import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.kanbai.packages API
const mockPackagesApi = {
  detect: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}

vi.stubGlobal('window', {
  kanbai: {
    packages: mockPackagesApi,
  },
})

const { usePackagesStore } = await import(
  '../../src/renderer/features/packages/packages-store'
)

describe('usePackagesStore', () => {
  beforeEach(() => {
    usePackagesStore.setState({
      activeWorkspaceId: null,
      byWorkspace: {},
      managers: [],
      packages: {},
      loading: {},
      updatingPackages: {},
      updateAllLoading: {},
      selectedProjectId: null,
      selectedManager: null,
      nlMessages: [],
      nlLoading: false,
      nlAiProvider: 'claude',
      searchQuery: '',
    })
    vi.clearAllMocks()
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = usePackagesStore.getState()
      expect(state.activeWorkspaceId).toBeNull()
      expect(state.byWorkspace).toEqual({})
      expect(state.managers).toEqual([])
      expect(state.packages).toEqual({})
      expect(state.loading).toEqual({})
      expect(state.updatingPackages).toEqual({})
      expect(state.updateAllLoading).toEqual({})
      expect(state.selectedProjectId).toBeNull()
      expect(state.selectedManager).toBeNull()
      expect(state.nlMessages).toEqual([])
      expect(state.nlLoading).toBe(false)
      expect(state.nlAiProvider).toBe('claude')
      expect(state.searchQuery).toBe('')
    })
  })

  describe('switchWorkspace', () => {
    it('definit activeWorkspaceId', () => {
      usePackagesStore.getState().switchWorkspace('ws-1')
      expect(usePackagesStore.getState().activeWorkspaceId).toBe('ws-1')
    })

    it('ne fait rien si c est le meme workspace', () => {
      usePackagesStore.setState({
        activeWorkspaceId: 'ws-1',
        managers: [{ projectId: 'p-1', manager: 'npm', projectName: 'Test', projectPath: '/tmp' }],
      })

      usePackagesStore.getState().switchWorkspace('ws-1')

      // Les managers ne doivent pas etre reinitialises
      expect(usePackagesStore.getState().managers).toHaveLength(1)
    })

    it('archive l etat du workspace courant avant de basculer', () => {
      usePackagesStore.setState({
        activeWorkspaceId: 'ws-1',
        managers: [{ projectId: 'p-1', manager: 'npm', projectName: 'Test', projectPath: '/tmp' }],
        searchQuery: 'react',
      })

      usePackagesStore.getState().switchWorkspace('ws-2')

      // Le workspace 1 est archive
      const archived = usePackagesStore.getState().byWorkspace['ws-1']
      expect(archived).toBeDefined()
      expect(archived!.managers).toHaveLength(1)
      expect(archived!.searchQuery).toBe('react')
    })

    it('restaure l etat d un workspace deja visite', () => {
      // Configurer ws-1 avec des donnees
      usePackagesStore.setState({
        activeWorkspaceId: 'ws-1',
        managers: [{ projectId: 'p-1', manager: 'npm', projectName: 'Test', projectPath: '/tmp' }],
        searchQuery: 'zustand',
      })

      // Basculer vers ws-2
      usePackagesStore.getState().switchWorkspace('ws-2')
      expect(usePackagesStore.getState().managers).toEqual([])

      // Revenir a ws-1
      usePackagesStore.getState().switchWorkspace('ws-1')
      expect(usePackagesStore.getState().managers).toHaveLength(1)
      expect(usePackagesStore.getState().searchQuery).toBe('zustand')
    })

    it('initialise avec des valeurs vides pour un nouveau workspace', () => {
      usePackagesStore.setState({ activeWorkspaceId: 'ws-1' })

      usePackagesStore.getState().switchWorkspace('ws-new')

      const state = usePackagesStore.getState()
      expect(state.managers).toEqual([])
      expect(state.packages).toEqual({})
      expect(state.selectedProjectId).toBeNull()
      expect(state.nlMessages).toEqual([])
    })
  })

  describe('detectManagers', () => {
    it('appelle packages.detect et definit les managers', async () => {
      const detected = [
        { projectId: 'p-1', manager: 'npm', projectName: 'Frontend', projectPath: '/app' },
      ]
      mockPackagesApi.detect.mockResolvedValue(detected)

      await usePackagesStore.getState().detectManagers([
        { id: 'p-1', path: '/app', name: 'Frontend' },
      ])

      expect(usePackagesStore.getState().managers).toEqual(detected)
      expect(mockPackagesApi.detect).toHaveBeenCalledWith([
        { id: 'p-1', path: '/app', name: 'Frontend' },
      ])
    })

    it('definit managers a vide en cas d erreur', async () => {
      usePackagesStore.setState({
        managers: [{ projectId: 'p-1', manager: 'npm', projectName: 'Test', projectPath: '/tmp' }],
      })
      mockPackagesApi.detect.mockRejectedValue(new Error('Detection echouee'))

      await usePackagesStore.getState().detectManagers([])

      expect(usePackagesStore.getState().managers).toEqual([])
    })
  })

  describe('loadPackages', () => {
    it('definit loading a true puis charge les packages', async () => {
      const packages = [
        { name: 'react', current: '18.0.0', latest: '19.0.0', type: 'dependencies' as const },
      ]
      mockPackagesApi.list.mockResolvedValue({ packages })

      await usePackagesStore.getState().loadPackages('p-1', '/app', 'npm')

      const state = usePackagesStore.getState()
      expect(state.packages['p-1:npm']).toEqual(packages)
      expect(state.loading['p-1:npm']).toBe(false)
    })

    it('appelle packages.list avec les bons parametres', async () => {
      mockPackagesApi.list.mockResolvedValue({ packages: [] })

      await usePackagesStore.getState().loadPackages('p-2', '/backend', 'yarn')

      expect(mockPackagesApi.list).toHaveBeenCalledWith('/backend', 'yarn')
    })

    it('definit les packages a vide en cas d erreur', async () => {
      mockPackagesApi.list.mockRejectedValue(new Error('Echec liste'))

      await usePackagesStore.getState().loadPackages('p-1', '/app', 'npm')

      const state = usePackagesStore.getState()
      expect(state.packages['p-1:npm']).toEqual([])
      expect(state.loading['p-1:npm']).toBe(false)
    })
  })

  describe('setSelection', () => {
    it('definit selectedProjectId et selectedManager', () => {
      usePackagesStore.getState().setSelection('p-1', 'npm')

      const state = usePackagesStore.getState()
      expect(state.selectedProjectId).toBe('p-1')
      expect(state.selectedManager).toBe('npm')
    })

    it('accepte null pour reinitialiser la selection', () => {
      usePackagesStore.getState().setSelection('p-1', 'npm')
      usePackagesStore.getState().setSelection(null, null)

      const state = usePackagesStore.getState()
      expect(state.selectedProjectId).toBeNull()
      expect(state.selectedManager).toBeNull()
    })
  })

  describe('updatePackage', () => {
    it('appelle packages.update et retourne le resultat', async () => {
      mockPackagesApi.update.mockResolvedValue({ success: true })

      const result = await usePackagesStore.getState().updatePackage('/app', 'npm', 'react')

      expect(result).toEqual({ success: true })
      expect(mockPackagesApi.update).toHaveBeenCalledWith('/app', 'npm', 'react')
    })

    it('retourne un objet d erreur en cas d echec', async () => {
      mockPackagesApi.update.mockRejectedValue(new Error('Mise a jour echouee'))

      const result = await usePackagesStore.getState().updatePackage('/app', 'npm', 'react')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Mise a jour echouee')
    })

    it('gere les erreurs non-Error', async () => {
      mockPackagesApi.update.mockRejectedValue('erreur brute')

      const result = await usePackagesStore.getState().updatePackage('/app', 'npm')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error during update')
    })
  })

  describe('addUpdatingPackage / removeUpdatingPackage', () => {
    it('ajoute un package a la liste des mises a jour en cours', () => {
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'react')

      const state = usePackagesStore.getState()
      expect(state.updatingPackages['p-1:npm']).toEqual(['react'])
    })

    it('n ajoute pas de doublon', () => {
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'react')
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'react')

      expect(usePackagesStore.getState().updatingPackages['p-1:npm']).toEqual(['react'])
    })

    it('peut ajouter plusieurs packages differents', () => {
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'react')
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'zustand')

      expect(usePackagesStore.getState().updatingPackages['p-1:npm']).toEqual(['react', 'zustand'])
    })

    it('retire un package de la liste des mises a jour', () => {
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'react')
      usePackagesStore.getState().addUpdatingPackage('p-1:npm', 'zustand')

      usePackagesStore.getState().removeUpdatingPackage('p-1:npm', 'react')

      expect(usePackagesStore.getState().updatingPackages['p-1:npm']).toEqual(['zustand'])
    })

    it('gere la suppression d un package inexistant sans erreur', () => {
      usePackagesStore.getState().removeUpdatingPackage('p-1:npm', 'inexistant')

      expect(usePackagesStore.getState().updatingPackages['p-1:npm']).toEqual([])
    })
  })

  describe('setUpdateAllLoading', () => {
    it('definit le chargement global pour une cle', () => {
      usePackagesStore.getState().setUpdateAllLoading('p-1:npm', true)

      expect(usePackagesStore.getState().updateAllLoading['p-1:npm']).toBe(true)
    })

    it('desactive le chargement global', () => {
      usePackagesStore.getState().setUpdateAllLoading('p-1:npm', true)
      usePackagesStore.getState().setUpdateAllLoading('p-1:npm', false)

      expect(usePackagesStore.getState().updateAllLoading['p-1:npm']).toBe(false)
    })
  })

  describe('addNlMessage', () => {
    it('ajoute un message NL a la liste', () => {
      const message = { role: 'user' as const, content: 'Liste les packages obsoletes' }

      usePackagesStore.getState().addNlMessage(message)

      expect(usePackagesStore.getState().nlMessages).toHaveLength(1)
      expect(usePackagesStore.getState().nlMessages[0]).toEqual(message)
    })

    it('ajoute les messages dans l ordre', () => {
      usePackagesStore.getState().addNlMessage({ role: 'user' as const, content: 'Question 1' })
      usePackagesStore.getState().addNlMessage({ role: 'assistant' as const, content: 'Reponse 1' })

      const messages = usePackagesStore.getState().nlMessages
      expect(messages).toHaveLength(2)
      expect(messages[0]!.role).toBe('user')
      expect(messages[1]!.role).toBe('assistant')
    })
  })

  describe('setNlLoading', () => {
    it('definit nlLoading a true', () => {
      usePackagesStore.getState().setNlLoading(true)
      expect(usePackagesStore.getState().nlLoading).toBe(true)
    })

    it('definit nlLoading a false', () => {
      usePackagesStore.getState().setNlLoading(true)
      usePackagesStore.getState().setNlLoading(false)
      expect(usePackagesStore.getState().nlLoading).toBe(false)
    })
  })

  describe('clearNlMessages', () => {
    it('vide la liste des messages NL', () => {
      usePackagesStore.getState().addNlMessage({ role: 'user' as const, content: 'Test' })
      usePackagesStore.getState().addNlMessage({ role: 'assistant' as const, content: 'Reponse' })

      usePackagesStore.getState().clearNlMessages()

      expect(usePackagesStore.getState().nlMessages).toEqual([])
    })
  })

  describe('setNlAiProvider', () => {
    it('definit le provider AI pour le NL', () => {
      usePackagesStore.getState().setNlAiProvider('openai')

      expect(usePackagesStore.getState().nlAiProvider).toBe('openai')
    })
  })

  describe('setSearchQuery', () => {
    it('definit la requete de recherche', () => {
      usePackagesStore.getState().setSearchQuery('react')

      expect(usePackagesStore.getState().searchQuery).toBe('react')
    })

    it('accepte une chaine vide', () => {
      usePackagesStore.getState().setSearchQuery('react')
      usePackagesStore.getState().setSearchQuery('')

      expect(usePackagesStore.getState().searchQuery).toBe('')
    })
  })
})
