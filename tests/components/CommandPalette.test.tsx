import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock i18n — returns keys as-is for deterministic assertions
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: vi.fn(),
  }),
}))

// Mock stores
const mockSetViewMode = vi.fn()
const mockSetActiveProject = vi.fn()
const mockSetActiveWorkspace = vi.fn()

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = { setViewMode: mockSetViewMode }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ setViewMode: mockSetViewMode }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        projects: [
          { id: 'p1', name: 'Project Alpha', workspaceId: 'w1', path: '/alpha' },
          { id: 'p2', name: 'Project Beta', workspaceId: 'w1', path: '/beta' },
        ],
        workspaces: [{ id: 'w1', name: 'Workspace 1' }],
        setActiveProject: mockSetActiveProject,
        setActiveWorkspace: mockSetActiveWorkspace,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        projects: [
          { id: 'p1', name: 'Project Alpha', workspaceId: 'w1', path: '/alpha' },
          { id: 'p2', name: 'Project Beta', workspaceId: 'w1', path: '/beta' },
        ],
        workspaces: [{ id: 'w1', name: 'Workspace 1' }],
        setActiveProject: mockSetActiveProject,
        setActiveWorkspace: mockSetActiveWorkspace,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { CommandPalette } from '../../src/renderer/components/CommandPalette'

describe('CommandPalette', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendu', () => {
    it('ne rend rien quand open est false', () => {
      const { container } = render(<CommandPalette open={false} onClose={mockOnClose} />)
      expect(container.innerHTML).toBe('')
    })

    it('rend la palette quand open est true', () => {
      render(<CommandPalette open={true} onClose={mockOnClose} />)
      expect(screen.getByPlaceholderText('command.placeholder')).toBeInTheDocument()
    })

    it('affiche les actions de vue', () => {
      render(<CommandPalette open={true} onClose={mockOnClose} />)
      expect(screen.getByText('command.showTerminal')).toBeInTheDocument()
      expect(screen.getByText('command.showGit')).toBeInTheDocument()
      expect(screen.getByText('command.showKanban')).toBeInTheDocument()
    })

    it('affiche les actions git', () => {
      render(<CommandPalette open={true} onClose={mockOnClose} />)
      expect(screen.getByText('Git: Commit')).toBeInTheDocument()
      expect(screen.getByText('Git: Push')).toBeInTheDocument()
      expect(screen.getByText('Git: Pull')).toBeInTheDocument()
    })

    it('affiche les projets pour le changement de projet', () => {
      render(<CommandPalette open={true} onClose={mockOnClose} />)
      expect(screen.getByText('Switch to: Project Alpha')).toBeInTheDocument()
      expect(screen.getByText('Switch to: Project Beta')).toBeInTheDocument()
    })
  })

  describe('recherche', () => {
    it('filtre les resultats par recherche fuzzy', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      await user.type(input, 'termi')

      expect(screen.getByText('command.showTerminal')).toBeInTheDocument()
      expect(screen.queryByText('Git: Commit')).not.toBeInTheDocument()
    })

    it('affiche un message vide quand aucun resultat', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      await user.type(input, 'xyznonexistent')

      expect(screen.getByText('command.noResults')).toBeInTheDocument()
    })

    it('filtre par categorie', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      await user.type(input, 'Git')

      expect(screen.getByText('Git: Commit')).toBeInTheDocument()
      expect(screen.getByText('Git: Push')).toBeInTheDocument()
    })
  })

  describe('navigation clavier', () => {
    it('ferme la palette avec Escape', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      await user.type(input, '{Escape}')

      expect(mockOnClose).toHaveBeenCalledOnce()
    })

    it('execute l action selectionnee avec Enter', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      await user.type(input, '{Enter}')

      // First item is "command.showTerminal" which sets view to 'terminal'
      expect(mockSetViewMode).toHaveBeenCalledWith('terminal')
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('navigue vers le bas avec ArrowDown', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      await user.type(input, '{ArrowDown}{Enter}')

      // Second item is "command.showGit" which sets view to 'git'
      expect(mockSetViewMode).toHaveBeenCalledWith('git')
    })

    it('navigue vers le haut avec ArrowUp (wrap)', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      const input = screen.getByPlaceholderText('command.placeholder')
      // ArrowUp from index 0 wraps to last item
      await user.type(input, '{ArrowUp}{Enter}')

      // Last items are projects — "Switch to: Project Beta" switches workspace
      expect(mockSetActiveWorkspace).toHaveBeenCalled()
    })
  })

  describe('interactions souris', () => {
    it('execute l action au clic sur un element', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      await user.click(screen.getByText('command.showGit'))

      expect(mockSetViewMode).toHaveBeenCalledWith('git')
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('ferme la palette au clic sur l overlay', async () => {
      const user = userEvent.setup()
      const { container } = render(<CommandPalette open={true} onClose={mockOnClose} />)

      const overlay = container.querySelector('.command-palette-overlay')!
      await user.click(overlay)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('ne ferme pas au clic sur la palette elle-meme', async () => {
      const user = userEvent.setup()
      const { container } = render(<CommandPalette open={true} onClose={mockOnClose} />)

      const palette = container.querySelector('.command-palette')!
      await user.click(palette)

      // onClose should only be called from overlay click, not palette body
      // (stopPropagation prevents it)
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('change de projet au clic', async () => {
      const user = userEvent.setup()
      render(<CommandPalette open={true} onClose={mockOnClose} />)

      await user.click(screen.getByText('Switch to: Project Alpha'))

      expect(mockSetActiveWorkspace).toHaveBeenCalledWith('w1')
      expect(mockSetActiveProject).toHaveBeenCalledWith('p1')
      expect(mockOnClose).toHaveBeenCalled()
    })
  })
})
