import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

// Mock AI provider utilities
vi.mock('../../src/shared/types/ai-provider', () => ({
  AI_PROVIDERS: {
    claude: { id: 'claude', displayName: 'Claude', detectionColor: '#7c3aed' },
    openai: { id: 'openai', displayName: 'OpenAI', detectionColor: '#10a37f' },
  },
}))

vi.mock('../../src/shared/utils/ai-provider-resolver', () => ({
  resolveFeatureProvider: () => 'claude',
}))

// Mock packagesStore
const mockAddNlMessage = vi.fn()
const mockSetNlLoading = vi.fn()
const mockClearNlMessages = vi.fn()
const mockUpdatePackage = vi.fn().mockResolvedValue({ success: true })
const mockLoadPackages = vi.fn()

let packagesStoreState = {
  nlMessages: [] as Array<{ id: string; role: string; content: string; timestamp: number }>,
  nlLoading: false,
  addNlMessage: mockAddNlMessage,
  setNlLoading: mockSetNlLoading,
  clearNlMessages: mockClearNlMessages,
  updatePackage: mockUpdatePackage,
  loadPackages: mockLoadPackages,
  selectedProjectId: 'proj-1',
}

vi.mock('../../src/renderer/features/packages/packages-store', () => ({
  usePackagesStore: () => packagesStoreState,
}))

// Mock workspaceStore
vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    () => ({
      activeProjectId: 'proj-1',
      activeWorkspaceId: 'ws-1',
      projects: [{ id: 'proj-1', name: 'My Project', workspaceId: 'ws-1', path: '/my-project' }],
      workspaces: [{ id: 'ws-1', name: 'My Workspace' }],
    }),
    {
      getState: () => ({
        activeProjectId: 'proj-1',
        activeWorkspaceId: 'ws-1',
        projects: [{ id: 'proj-1', name: 'My Project', workspaceId: 'ws-1', path: '/my-project' }],
        workspaces: [{ id: 'ws-1', name: 'My Workspace' }],
      }),
    },
  ),
}))

import { PackagesChat } from '../../src/renderer/components/PackagesChat'

describe('PackagesChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    packagesStoreState = {
      nlMessages: [],
      nlLoading: false,
      addNlMessage: mockAddNlMessage,
      setNlLoading: mockSetNlLoading,
      clearNlMessages: mockClearNlMessages,
      updatePackage: mockUpdatePackage,
      loadPackages: mockLoadPackages,
      selectedProjectId: 'proj-1',
    }

    // Setup window.kanbai.packages mock
    const kanbai = window.kanbai as Record<string, unknown>
    ;(kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>).packages = {
      nlAsk: vi.fn().mockResolvedValue({ answer: 'Here is the answer', action: null }),
      nlCancel: vi.fn().mockResolvedValue(undefined),
    }
  })

  describe('rendu initial', () => {
    it('affiche le message vide quand il n y a pas de messages', () => {
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('packages.chatEmpty')).toBeInTheDocument()
    })

    it('affiche le champ de saisie', () => {
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByPlaceholderText('packages.chatPlaceholder')).toBeInTheDocument()
    })

    it('affiche le bouton envoyer', () => {
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('packages.chatSend')).toBeInTheDocument()
    })

    it('desactive le bouton envoyer quand le champ est vide', () => {
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      const sendBtn = screen.getByText('packages.chatSend')
      expect(sendBtn).toBeDisabled()
    })

    it('n affiche pas le bouton clear quand il n y a pas de messages', () => {
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.queryByTitle('Clear')).not.toBeInTheDocument()
    })
  })

  describe('envoi de message', () => {
    it('active le bouton envoyer quand du texte est saisi', async () => {
      const user = userEvent.setup()
      render(<PackagesChat projectPath="/my-project" manager="npm" />)

      const input = screen.getByPlaceholderText('packages.chatPlaceholder')
      await user.type(input, 'How to update react?')

      const sendBtn = screen.getByText('packages.chatSend')
      expect(sendBtn).not.toBeDisabled()
    })

    it('appelle nlAsk au clic sur le bouton envoyer', async () => {
      const user = userEvent.setup()
      render(<PackagesChat projectPath="/my-project" manager="npm" />)

      const input = screen.getByPlaceholderText('packages.chatPlaceholder')
      await user.type(input, 'How to update react?')
      await user.click(screen.getByText('packages.chatSend'))

      expect(mockAddNlMessage).toHaveBeenCalled()
      expect(mockSetNlLoading).toHaveBeenCalledWith(true)
    })

    it('envoie le message avec Enter', async () => {
      const user = userEvent.setup()
      render(<PackagesChat projectPath="/my-project" manager="npm" />)

      const input = screen.getByPlaceholderText('packages.chatPlaceholder')
      await user.type(input, 'Test question{Enter}')

      expect(mockAddNlMessage).toHaveBeenCalled()
    })

    it('vide le champ de saisie apres envoi', async () => {
      const user = userEvent.setup()
      render(<PackagesChat projectPath="/my-project" manager="npm" />)

      const input = screen.getByPlaceholderText('packages.chatPlaceholder')
      await user.type(input, 'Question{Enter}')

      expect(input).toHaveValue('')
    })
  })

  describe('affichage des messages', () => {
    it('affiche les messages de l utilisateur', () => {
      packagesStoreState.nlMessages = [
        { id: 'msg-1', role: 'user', content: 'How to install lodash?', timestamp: Date.now() },
      ]
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('How to install lodash?')).toBeInTheDocument()
      expect(screen.getByText('You')).toBeInTheDocument()
    })

    it('affiche les messages de l assistant', () => {
      packagesStoreState.nlMessages = [
        { id: 'msg-1', role: 'user', content: 'Question', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Answer from Claude', timestamp: Date.now() },
      ]
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('Answer from Claude')).toBeInTheDocument()
      // The component now uses providerConfig.displayName which is 'Claude' from the mock
      expect(screen.getByText('Claude')).toBeInTheDocument()
    })

    it('affiche les messages d erreur', () => {
      packagesStoreState.nlMessages = [
        { id: 'msg-1', role: 'error', content: 'Something went wrong', timestamp: Date.now() },
      ]
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('affiche le bouton clear quand il y a des messages', () => {
      packagesStoreState.nlMessages = [
        { id: 'msg-1', role: 'user', content: 'Test', timestamp: Date.now() },
      ]
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByTitle('Clear')).toBeInTheDocument()
    })

    it('affiche le bouton copier pour chaque message', () => {
      packagesStoreState.nlMessages = [
        { id: 'msg-1', role: 'user', content: 'Test', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Answer', timestamp: Date.now() },
      ]
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      const copyButtons = screen.getAllByTitle('common.copy')
      expect(copyButtons.length).toBe(2)
    })
  })

  describe('annulation', () => {
    it('affiche le bouton annuler pendant le chargement', () => {
      packagesStoreState.nlLoading = true
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('packages.chatCancel')).toBeInTheDocument()
    })

    it('appelle nlCancel au clic sur le bouton annuler', async () => {
      const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      packagesStoreState.nlLoading = true
      const user = userEvent.setup()
      render(<PackagesChat projectPath="/my-project" manager="npm" />)

      await user.click(screen.getByText('packages.chatCancel'))

      expect(kanbai.packages.nlCancel).toHaveBeenCalled()
      expect(mockSetNlLoading).toHaveBeenCalledWith(false)
    })

    it('desactive le champ de saisie pendant le chargement', () => {
      packagesStoreState.nlLoading = true
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      const input = screen.getByPlaceholderText('packages.chatPlaceholder')
      expect(input).toBeDisabled()
    })
  })

  describe('chargement', () => {
    it('affiche l indicateur de chargement', () => {
      packagesStoreState.nlLoading = true
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.getByText('packages.chatThinking')).toBeInTheDocument()
    })

    it('cache le message vide pendant le chargement', () => {
      packagesStoreState.nlLoading = true
      render(<PackagesChat projectPath="/my-project" manager="npm" />)
      expect(screen.queryByText('packages.chatEmpty')).not.toBeInTheDocument()
    })
  })

  describe('nettoyage des messages', () => {
    it('appelle clearNlMessages au clic sur le bouton clear', async () => {
      packagesStoreState.nlMessages = [
        { id: 'msg-1', role: 'user', content: 'Test', timestamp: Date.now() },
      ]
      const user = userEvent.setup()
      render(<PackagesChat projectPath="/my-project" manager="npm" />)

      await user.click(screen.getByTitle('Clear'))

      expect(mockClearNlMessages).toHaveBeenCalled()
    })
  })
})
