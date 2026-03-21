import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

// Mock terminalTabStore
vi.mock('../../src/renderer/lib/stores/terminalTabStore', () => ({
  useTerminalTabStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        tabs: [],
        activeTabId: null,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        tabs: [],
        activeTabId: null,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

// Mock viewStore
vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = { setViewMode: vi.fn() }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ setViewMode: vi.fn() }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

const mockTemplates = [
  { id: 'tpl-1', name: 'Code Review', content: 'Please review this code...', category: 'Quality', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'tpl-2', name: 'Write Tests', content: 'Write unit tests for...', category: 'Development', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'tpl-3', name: 'Generate Docs', content: 'Generate documentation...', category: 'Documentation', createdAt: Date.now(), updatedAt: Date.now() },
]

import { PromptTemplates } from '../../src/renderer/components/PromptTemplates'

describe('PromptTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup window.kanbai.prompts mock
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    mirehub.prompts.list = vi.fn().mockResolvedValue(mockTemplates)
    mirehub.prompts.create = vi.fn().mockResolvedValue({
      id: 'tpl-new',
      name: 'New Template',
      content: 'New content',
      category: 'General',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    mirehub.prompts.update = vi.fn().mockResolvedValue({
      id: 'tpl-1',
      name: 'Updated Name',
      content: 'Updated content',
      category: 'Quality',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    mirehub.prompts.delete = vi.fn().mockResolvedValue(undefined)
  })

  describe('rendu initial', () => {
    it('affiche le titre du panneau', async () => {
      render(<PromptTemplates />)
      expect(screen.getByText('prompts.title')).toBeInTheDocument()
    })

    it('affiche le champ de recherche', () => {
      render(<PromptTemplates />)
      expect(screen.getByPlaceholderText('common.search')).toBeInTheDocument()
    })

    it('affiche l etat vide avant le chargement', () => {
      render(<PromptTemplates />)
      expect(screen.getByText('prompts.emptyTitle')).toBeInTheDocument()
    })

    it('affiche le bouton d ajout de template', () => {
      render(<PromptTemplates />)
      const addBtn = screen.getByTitle('prompts.newTemplate')
      expect(addBtn).toBeInTheDocument()
    })

    it('affiche le bouton creer un premier template dans l etat vide', () => {
      render(<PromptTemplates />)
      expect(screen.getByText('prompts.createFirst')).toBeInTheDocument()
    })
  })

  describe('chargement des templates', () => {
    it('appelle prompts.list au montage', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(mirehub.prompts.list).toHaveBeenCalled()
      })
    })

    it('affiche les templates charges dans la liste', async () => {
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
        expect(screen.getByText('Write Tests')).toBeInTheDocument()
        expect(screen.getByText('Generate Docs')).toBeInTheDocument()
      })
    })

    it('affiche les categories derivees des templates', async () => {
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText(/prompts\.allCount/)).toBeInTheDocument()
      })
    })
  })

  describe('recherche', () => {
    it('filtre les templates par recherche textuelle', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('common.search')
      await user.type(searchInput, 'Review')

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
        expect(screen.queryByText('Write Tests')).not.toBeInTheDocument()
        expect(screen.queryByText('Generate Docs')).not.toBeInTheDocument()
      })
    })

    it('affiche un message vide quand aucun resultat de recherche', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('common.search')
      await user.type(searchInput, 'nonexistenttemplate')

      await waitFor(() => {
        expect(screen.getByText('prompts.noResults')).toBeInTheDocument()
      })
    })
  })

  describe('selection de template', () => {
    it('affiche le contenu du template selectionne', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Code Review'))

      await waitFor(() => {
        // The textarea should contain the template content
        const textarea = screen.getByPlaceholderText('prompts.contentPlaceholder')
        expect(textarea).toHaveValue('Please review this code...')
      })
    })

    it('affiche les boutons d action pour un template selectionne', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Code Review'))

      await waitFor(() => {
        expect(screen.getByText(/prompts.sendToAi/)).toBeInTheDocument()
        expect(screen.getByText('common.copy')).toBeInTheDocument()
        expect(screen.getByText('common.edit')).toBeInTheDocument()
        expect(screen.getByText('common.delete')).toBeInTheDocument()
      })
    })
  })

  describe('creation de template', () => {
    it('ouvre le formulaire de creation au clic sur le bouton ajouter', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await user.click(screen.getByTitle('prompts.newTemplate'))

      expect(screen.getByText('prompts.newTemplate')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('prompts.namePlaceholder')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('prompts.promptPlaceholder')).toBeInTheDocument()
    })

    it('permet d annuler la creation', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await user.click(screen.getByTitle('prompts.newTemplate'))

      expect(screen.getByPlaceholderText('prompts.namePlaceholder')).toBeInTheDocument()

      await user.click(screen.getByText('common.cancel'))

      // Form should be hidden, empty state should be back
      expect(screen.getByText('prompts.emptyTitle')).toBeInTheDocument()
    })

    it('desactive le bouton creer quand le nom est vide', async () => {
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await user.click(screen.getByTitle('prompts.newTemplate'))

      const createBtn = screen.getByText('common.create')
      expect(createBtn).toBeDisabled()
    })
  })

  describe('suppression de template', () => {
    it('supprime le template au clic sur supprimer', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      const user = userEvent.setup()
      render(<PromptTemplates />)

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Code Review'))

      await waitFor(() => {
        expect(screen.getByText('common.delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('common.delete'))

      expect(mirehub.prompts.delete).toHaveBeenCalledWith('tpl-1')
    })
  })
})
