import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock i18n
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}:${JSON.stringify(params)}`
      return key
    },
    locale: 'fr',
    setLocale: vi.fn(),
  }),
}))

// Mock workspace store used by useApiTester
vi.mock('../../src/renderer/features/workspace/workspace-store', () => ({
  useWorkspaceStore: () => ({
    activeProjectId: hookState.activeProject?.id ?? null,
    projects: hookState.activeProject ? [hookState.activeProject] : [],
  }),
}))

// Mock the useApiTester hook
vi.mock('../../src/renderer/features/api-tester/use-api-tester', () => ({
  useApiTester: () => hookState,
}))

const defaultHookState = {
  activeProject: { id: 'proj-1', name: 'My Project', path: '/my-project', workspaceId: 'ws-1' } as { id: string; name: string; path: string; workspaceId: string } | null,
  data: {
    version: 1,
    collections: [
      {
        id: 'col-1',
        name: 'Users API',
        requests: [
          { id: 'req-1', name: 'Get Users', method: 'GET', url: 'https://api.example.com/users', headers: [], queryParams: [], body: '', bodyType: 'none' as const, tests: [] },
          { id: 'req-2', name: 'Create User', method: 'POST', url: 'https://api.example.com/users', headers: [], queryParams: [], body: '{}', bodyType: 'json' as const, tests: [] },
        ],
      },
    ],
    environments: [] as Array<{ id: string; name: string; variables: Record<string, string> }>,
    chains: [],
    healthChecks: [],
  },
  loading: false,
  selection: null as { type: string; collectionId: string; requestId: string } | null,
  expandedCollections: new Set<string>(['col-1']),
  requestTab: 'headers' as const,
  setRequestTab: vi.fn(),
  responseTab: 'body' as const,
  setResponseTab: vi.fn(),
  response: null as { status: number; statusText: string; time: number; size: number; body: string; headers: Record<string, string> } | null,
  testResults: [] as Array<{ passed: boolean; assertion: { type: string; expected: string }; actual: string }>,
  sending: false,
  selectedRequest: null as { request: { id: string; method: string; url: string; name: string; headers: Array<{ key: string; value: string; enabled: boolean }>; body: string; bodyType: string; tests: Array<{ type: string; expected: string }> }; collectionId: string } | null,
  showEnvModal: false,
  setShowEnvModal: vi.fn(),
  showDoc: false,
  setShowDoc: vi.fn(),
  activeEnv: null as { id: string; name: string; variables: Record<string, string> } | null,
  handleSend: vi.fn(),
  handleUrlKeyDown: vi.fn(),
  updateRequest: vi.fn(),
  addCollection: vi.fn(),
  deleteCollection: vi.fn(),
  addRequest: vi.fn(),
  deleteRequest: vi.fn(),
  duplicateRequest: vi.fn(),
  toggleCollection: vi.fn(),
  selectRequest: vi.fn(),
  addEnvironment: vi.fn(),
  deleteEnvironment: vi.fn(),
  setActiveEnvironment: vi.fn(),
  updateEnvironment: vi.fn(),
  handleExport: vi.fn(),
  handleImport: vi.fn(),
}

let hookState = { ...defaultHookState }

import { ApiTesterPanel } from '../../src/renderer/components/ApiTesterPanel'

describe('ApiTesterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookState = { ...defaultHookState, expandedCollections: new Set<string>(['col-1']) }
  })

  describe('rendu initial', () => {
    it('affiche la sidebar avec les collections', () => {
      render(<ApiTesterPanel />)
      // The component renders collections inline in a .api-sidebar
      expect(screen.getByText('Users API')).toBeInTheDocument()
    })

    it('affiche le message vide quand aucune requete n est selectionnee', () => {
      hookState = { ...defaultHookState, selection: null, expandedCollections: new Set<string>(['col-1']) }
      render(<ApiTesterPanel />)
      // When no selection, the main area shows api.noCollections
      expect(screen.getByText('api.noCollections')).toBeInTheDocument()
    })

    it('affiche le message quand aucun projet n est actif', () => {
      hookState = { ...defaultHookState, activeProject: null }
      render(<ApiTesterPanel />)
      expect(screen.getByText('api.selectProject')).toBeInTheDocument()
    })

    it('affiche le chargement', () => {
      hookState = { ...defaultHookState, loading: true }
      render(<ApiTesterPanel />)
      expect(screen.getByText('common.loading')).toBeInTheDocument()
    })
  })

  describe('affichage des collections', () => {
    it('affiche le nom de la collection et ses requetes quand la collection est expandue', () => {
      render(<ApiTesterPanel />)
      expect(screen.getByText('Users API')).toBeInTheDocument()
      // Requests are shown because expandedCollections has 'col-1'
      expect(screen.getByText('GET')).toBeInTheDocument()
      expect(screen.getByText('Get Users')).toBeInTheDocument()
    })

    it('affiche le bouton d ajout de collection', () => {
      render(<ApiTesterPanel />)
      // The add collection button displays '+'
      const addBtn = screen.getByTitle('api.newCollection')
      expect(addBtn).toBeInTheDocument()
    })
  })

  describe('selection de requete', () => {
    it('affiche l editeur de requete quand une requete est selectionnee', () => {
      hookState = {
        ...defaultHookState,
        expandedCollections: new Set<string>(['col-1']),
        selection: { type: 'request', collectionId: 'col-1', requestId: 'req-1' },
        selectedRequest: {
          request: { id: 'req-1', method: 'GET', url: 'https://api.example.com/users', name: 'Get Users', headers: [], body: '', bodyType: 'none', tests: [] },
          collectionId: 'col-1',
        },
      }
      render(<ApiTesterPanel />)
      // The URL input should have the url value
      const urlInput = screen.getByPlaceholderText('api.urlPlaceholder')
      expect(urlInput).toHaveValue('https://api.example.com/users')
    })

    it('affiche le viewer de reponse quand une requete est selectionnee', () => {
      hookState = {
        ...defaultHookState,
        expandedCollections: new Set<string>(['col-1']),
        selection: { type: 'request', collectionId: 'col-1', requestId: 'req-1' },
        selectedRequest: {
          request: { id: 'req-1', method: 'GET', url: 'https://api.example.com/users', name: 'Get Users', headers: [], body: '', bodyType: 'none', tests: [] },
          collectionId: 'col-1',
        },
      }
      render(<ApiTesterPanel />)
      // When no response yet, shows "no response" message
      expect(screen.getByText('api.noResponse')).toBeInTheDocument()
    })
  })

  describe('envoi de requete', () => {
    it('affiche le bouton send actif quand pas en cours d envoi', () => {
      hookState = {
        ...defaultHookState,
        expandedCollections: new Set<string>(['col-1']),
        selection: { type: 'request', collectionId: 'col-1', requestId: 'req-1' },
        selectedRequest: {
          request: { id: 'req-1', method: 'GET', url: 'https://api.example.com/users', name: 'Get Users', headers: [], body: '', bodyType: 'none', tests: [] },
          collectionId: 'col-1',
        },
        sending: false,
      }
      render(<ApiTesterPanel />)
      const sendBtn = screen.getByText('api.send')
      expect(sendBtn).not.toBeDisabled()
    })

    it('desactive le bouton send pendant l envoi', () => {
      hookState = {
        ...defaultHookState,
        expandedCollections: new Set<string>(['col-1']),
        selection: { type: 'request', collectionId: 'col-1', requestId: 'req-1' },
        selectedRequest: {
          request: { id: 'req-1', method: 'GET', url: 'https://api.example.com/users', name: 'Get Users', headers: [], body: '', bodyType: 'none', tests: [] },
          collectionId: 'col-1',
        },
        sending: true,
      }
      render(<ApiTesterPanel />)
      const sendBtn = screen.getByText('api.sending')
      expect(sendBtn).toBeDisabled()
    })
  })

  describe('etat vide', () => {
    it('affiche le message vide quand il n y a pas de collections', () => {
      hookState = {
        ...defaultHookState,
        data: { version: 1, collections: [], environments: [], chains: [], healthChecks: [] },
      }
      render(<ApiTesterPanel />)
      // Text appears in both sidebar empty state and main area empty state
      const elements = screen.getAllByText('api.noCollections')
      expect(elements.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('banniere de documentation', () => {
    it('affiche la banniere de doc quand showDoc est true', () => {
      hookState = { ...defaultHookState, showDoc: true, expandedCollections: new Set<string>(['col-1']) }
      render(<ApiTesterPanel />)
      expect(screen.getByText('api.docTitle')).toBeInTheDocument()
    })
  })
})
