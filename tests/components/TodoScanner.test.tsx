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

// Mock stores
const mockOpenFile = vi.fn()
const mockCreateTask = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        activeProjectId: 'proj-1',
        activeWorkspaceId: 'ws-1',
        projects: [
          { id: 'proj-1', name: 'My Project', workspaceId: 'ws-1', path: '/my-project' },
        ],
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        activeProjectId: 'proj-1',
        activeWorkspaceId: 'ws-1',
        projects: [
          { id: 'proj-1', name: 'My Project', workspaceId: 'ws-1', path: '/my-project' },
        ],
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = { openFile: mockOpenFile }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ openFile: mockOpenFile }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

vi.mock('../../src/renderer/lib/stores/kanbanStore', () => ({
  useKanbanStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        createTask: mockCreateTask,
        updateTask: mockUpdateTask,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        tasks: [],
        createTask: mockCreateTask,
        updateTask: mockUpdateTask,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

const mockTodoEntries = [
  { file: 'src/index.ts', line: 10, type: 'TODO', text: 'Implement login logic', codeLine: '// TODO: Implement login logic' },
  { file: 'src/index.ts', line: 25, type: 'FIXME', text: 'Fix null check', codeLine: '// FIXME: Fix null check' },
  { file: 'src/utils.ts', line: 5, type: 'HACK', text: 'Temporary workaround', codeLine: '// HACK: Temporary workaround' },
  { file: 'src/utils.ts', line: 15, type: 'NOTE', text: 'This is intentional', codeLine: '// NOTE: This is intentional' },
  { file: 'src/app.tsx', line: 3, type: 'TODO', text: 'Add error boundary', codeLine: '// TODO: Add error boundary' },
]

import { TodoScanner } from '../../src/renderer/components/TodoScanner'

describe('TodoScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup window.kanbai.project mock
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    mirehub.project.scanTodos = vi.fn().mockResolvedValue(mockTodoEntries)
    mirehub.project.loadIgnoredTodos = vi.fn().mockResolvedValue([])
    mirehub.project.saveIgnoredTodos = vi.fn().mockResolvedValue(undefined)
  })

  describe('rendu initial', () => {
    it('affiche le titre du scanner', async () => {
      render(<TodoScanner />)
      expect(screen.getByText('todos.title')).toBeInTheDocument()
    })

    it('affiche le compteur d items', async () => {
      render(<TodoScanner />)
      await waitFor(() => {
        expect(screen.getByText(/todos\.itemCount/)).toBeInTheDocument()
      })
    })

    it('affiche le bouton de rafraichissement', () => {
      render(<TodoScanner />)
      expect(screen.getByTitle('common.refresh')).toBeInTheDocument()
    })
  })

  describe('scan des todos', () => {
    it('appelle scanTodos au montage', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<TodoScanner />)

      await waitFor(() => {
        expect(mirehub.project.scanTodos).toHaveBeenCalledWith('/my-project')
      })
    })

    it('affiche les resultats groupes par fichier', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('src/index.ts')).toBeInTheDocument()
        expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
        expect(screen.getByText('src/app.tsx')).toBeInTheDocument()
      })
    })

    it('affiche les entrees TODO dans les groupes', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('Implement login logic')).toBeInTheDocument()
        expect(screen.getByText('Fix null check')).toBeInTheDocument()
        expect(screen.getByText('Temporary workaround')).toBeInTheDocument()
      })
    })

    it('relance le scan au clic sur le bouton refresh', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      const user = userEvent.setup()
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('src/index.ts')).toBeInTheDocument()
      })

      const callsBefore = mirehub.project.scanTodos.mock.calls.length
      await user.click(screen.getByTitle('common.refresh'))

      await waitFor(() => {
        expect(mirehub.project.scanTodos.mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })
  })

  describe('filtrage par type', () => {
    it('affiche les boutons de filtre par type', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText(/todos\.allCount/)).toBeInTheDocument()
        expect(screen.getByText(/todos\.typeCount.*TODO/)).toBeInTheDocument()
        expect(screen.getByText(/todos\.typeCount.*FIXME/)).toBeInTheDocument()
        expect(screen.getByText(/todos\.typeCount.*HACK/)).toBeInTheDocument()
        expect(screen.getByText(/todos\.typeCount.*NOTE/)).toBeInTheDocument()
      })
    })

    it('filtre par type au clic sur un bouton de type', async () => {
      const user = userEvent.setup()
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('Implement login logic')).toBeInTheDocument()
      })

      // Click FIXME filter
      const fixmeButton = screen.getByText(/todos\.typeCount.*FIXME/)
      await user.click(fixmeButton)

      await waitFor(() => {
        expect(screen.getByText('Fix null check')).toBeInTheDocument()
        expect(screen.queryByText('Implement login logic')).not.toBeInTheDocument()
        expect(screen.queryByText('Temporary workaround')).not.toBeInTheDocument()
      })
    })
  })

  describe('affichage des resultats', () => {
    it('affiche le badge de type pour chaque entree', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        const todoBadges = screen.getAllByText('TODO')
        expect(todoBadges.length).toBeGreaterThanOrEqual(2)
      })
    })

    it('affiche le numero de ligne pour chaque entree', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText(':10')).toBeInTheDocument()
        expect(screen.getByText(':25')).toBeInTheDocument()
      })
    })

    it('affiche le code source pour chaque entree', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('// TODO: Implement login logic')).toBeInTheDocument()
        expect(screen.getByText('// FIXME: Fix null check')).toBeInTheDocument()
      })
    })

    it('affiche un message vide quand aucun resultat', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.project.scanTodos.mockResolvedValue([])
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText(/todos\.noComments/)).toBeInTheDocument()
      })
    })
  })

  describe('ouverture de fichier', () => {
    it('ouvre le fichier au clic sur une entree', async () => {
      const user = userEvent.setup()
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('Implement login logic')).toBeInTheDocument()
      })

      // Click on the entry content button
      await user.click(screen.getByText('Implement login logic'))

      expect(mockOpenFile).toHaveBeenCalledWith('/my-project/src/index.ts', 10)
    })
  })

  describe('selection d entrees', () => {
    it('affiche les checkboxes pour chaque entree', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox')
        expect(checkboxes.length).toBe(mockTodoEntries.length)
      })
    })

    it('affiche le bouton select all', async () => {
      render(<TodoScanner />)

      await waitFor(() => {
        expect(screen.getByText('todos.selectAll')).toBeInTheDocument()
      })
    })
  })
})
