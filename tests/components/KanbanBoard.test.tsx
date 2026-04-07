import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KanbanTask } from '../../src/shared/types'

// Mock CSS
vi.mock('../../src/renderer/features/kanban/kanban.css', () => ({}))

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

// Mock AI providers
vi.mock('../../src/shared/types/ai-provider', () => ({
  AI_PROVIDERS: {
    claude: { id: 'claude', displayName: 'Claude', detectionColor: '#7c3aed' },
    openai: { id: 'openai', displayName: 'OpenAI', detectionColor: '#10a37f' },
  },
}))

vi.mock('../../src/shared/utils/ai-provider-resolver', () => ({
  resolveFeatureProvider: () => 'claude',
}))

// Mock pdf-preview
vi.mock('../../src/renderer/features/kanban/pdf-preview', () => ({
  renderPdfFirstPage: vi.fn(),
}))

// Mock ContextMenu (new path)
vi.mock('../../src/renderer/shared/ui/context-menu', () => ({
  ContextMenu: ({ items, onClose }: { items: Array<{ label: string; action: () => void; separator?: boolean }>; onClose: () => void }) => (
    <div data-testid="context-menu">
      {items.filter((i) => !i.separator).map((item) => (
        <button key={item.label} onClick={() => { item.action(); onClose() }}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}))

// Mock data
const mockTasks: KanbanTask[] = [
  {
    id: 'task-1',
    workspaceId: 'ws-1',
    title: 'Implement login',
    description: 'Add login form',
    status: 'TODO',
    priority: 'high',
    ticketNumber: 1,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'task-2',
    workspaceId: 'ws-1',
    title: 'Fix header bug',
    description: 'Header overflows on mobile',
    status: 'WORKING',
    priority: 'critical',
    ticketNumber: 2,
    labels: ['bug'],
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
  },
  {
    id: 'task-3',
    workspaceId: 'ws-1',
    title: 'Write tests',
    description: 'Unit tests for store',
    status: 'DONE',
    priority: 'medium',
    ticketNumber: 3,
    labels: ['test'],
    createdAt: Date.now() - 10800000,
    updatedAt: Date.now() - 10800000,
  },
  {
    id: 'task-4',
    workspaceId: 'ws-1',
    title: 'Pending review',
    description: 'Waiting for feedback',
    status: 'PENDING',
    priority: 'low',
    ticketNumber: 4,
    question: 'Should we use option A or B?',
    createdAt: Date.now() - 14400000,
    updatedAt: Date.now() - 14400000,
  },
]

// Mock kanban store
const mockLoadTasks = vi.fn()
const mockCreateTask = vi.fn()
const mockUpdateTaskStatus = vi.fn()
const mockUpdateTask = vi.fn()
const mockDeleteTask = vi.fn()
const mockDuplicateTask = vi.fn()
const mockSetDragged = vi.fn()
const mockSendToClaude = vi.fn()
const mockAttachFiles = vi.fn()
const mockAttachFromClipboard = vi.fn()
const mockRemoveAttachment = vi.fn()
const mockSyncTasksFromFile = vi.fn()

vi.mock('../../src/renderer/features/kanban/kanban-store', () => ({
  useKanbanStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        tasks: mockTasks,
        loadTasks: mockLoadTasks,
        syncTasksFromFile: mockSyncTasksFromFile,
        createTask: mockCreateTask,
        updateTaskStatus: mockUpdateTaskStatus,
        updateTask: mockUpdateTask,
        deleteTask: mockDeleteTask,
        duplicateTask: mockDuplicateTask,
        draggedTaskId: null,
        setDragged: mockSetDragged,
        sendToClaude: mockSendToClaude,
        attachFiles: mockAttachFiles,
        attachFromClipboard: mockAttachFromClipboard,
        removeAttachment: mockRemoveAttachment,
        kanbanTabIds: {},
        agentProgress: {},
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        tasks: mockTasks,
        kanbanTabIds: {},
        agentProgress: {},
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

// Mock terminalTabStore (imported from features/terminal)
vi.mock('../../src/renderer/features/terminal', () => ({
  useTerminalTabStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        tabs: [],
        setActiveTab: vi.fn(),
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ tabs: [], setActiveTab: vi.fn() }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

// Mock viewStore
const mockSetViewMode = vi.fn()
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

// Mock workspaceStore
vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        activeWorkspaceId: 'ws-1',
        workspaces: [
          { id: 'ws-1', name: 'My Workspace' },
        ],
        projects: [
          { id: 'proj-1', name: 'Frontend', workspaceId: 'ws-1', path: '/frontend' },
          { id: 'proj-2', name: 'Backend', workspaceId: 'ws-1', path: '/backend' },
        ],
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        activeWorkspaceId: 'ws-1',
        workspaces: [
          { id: 'ws-1', name: 'My Workspace' },
        ],
        projects: [
          { id: 'proj-1', name: 'Frontend', workspaceId: 'ws-1', path: '/frontend' },
        ],
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

// window.kanbai is provided by tests/components/setup.ts

import { KanbanBoard } from '../../src/renderer/components/KanbanBoard'

describe('KanbanBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendu initial', () => {
    it('affiche le titre du kanban', () => {
      render(<KanbanBoard />)
      expect(screen.getByText('kanban.title')).toBeInTheDocument()
    })

    it('affiche les colonnes actives (TODO, WORKING, PENDING, DONE via archive)', () => {
      render(<KanbanBoard />)
      // Active columns appear in both column headers and task count tooltip
      expect(screen.getAllByText('kanban.todo').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('kanban.working').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('kanban.pending').length).toBeGreaterThanOrEqual(1)
    })

    it('affiche les taches dans les bonnes colonnes', () => {
      render(<KanbanBoard />)
      expect(screen.getByText('Implement login')).toBeInTheDocument()
      expect(screen.getByText('Fix header bug')).toBeInTheDocument()
      expect(screen.getByText('Pending review')).toBeInTheDocument()
    })

    it('affiche le nombre de taches filtrees', () => {
      render(<KanbanBoard />)
      // The task count wrapper contains "{count} {t('kanban.tasksLabel')}"
      const countEl = document.querySelector('.kanban-task-count')
      expect(countEl).toBeInTheDocument()
      expect(countEl?.textContent).toContain('kanban.tasksLabel')
    })

    it('charge les taches au montage', () => {
      render(<KanbanBoard />)
      expect(mockLoadTasks).toHaveBeenCalledWith('ws-1')
    })
  })

  describe('bouton de creation', () => {
    it('affiche le bouton de nouvelle tache', () => {
      render(<KanbanBoard />)
      // The button text is "+ kanban.newTask"
      expect(screen.getByText(/kanban\.newTask/)).toBeInTheDocument()
    })

    it('ouvre le formulaire de creation au clic', async () => {
      const user = userEvent.setup()
      render(<KanbanBoard />)

      await user.click(screen.getByText(/kanban\.newTask/))

      expect(screen.getByPlaceholderText('kanban.taskTitlePlaceholder')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('kanban.descriptionPlaceholder')).toBeInTheDocument()
    })
  })

  describe('recherche et filtres', () => {
    it('affiche le champ de recherche', () => {
      render(<KanbanBoard />)
      expect(screen.getByPlaceholderText('common.search')).toBeInTheDocument()
    })

    it('filtre les taches par recherche textuelle', async () => {
      const user = userEvent.setup()
      render(<KanbanBoard />)

      const searchInput = screen.getByPlaceholderText('common.search')
      await user.type(searchInput, 'login')

      // Only "Implement login" should match
      expect(screen.getByText('Implement login')).toBeInTheDocument()
      expect(screen.queryByText('Fix header bug')).not.toBeInTheDocument()
    })

    it('affiche le selecteur de priorite', () => {
      render(<KanbanBoard />)
      const select = screen.getAllByRole('combobox')[0]!
      expect(select).toBeInTheDocument()
    })

    it('affiche le selecteur de type comme filtre', () => {
      render(<KanbanBoard />)
      // The component now uses select elements for filtering, not label chips
      const selects = screen.getAllByRole('combobox')
      // There should be multiple filter selects (priority, type, scope)
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })

    it('filtre les taches par recherche textuelle et affiche correctement', async () => {
      const user = userEvent.setup()
      render(<KanbanBoard />)

      const searchInput = screen.getByPlaceholderText('common.search')
      await user.type(searchInput, 'header')

      await waitFor(() => {
        expect(screen.getByText('Fix header bug')).toBeInTheDocument()
        expect(screen.queryByText('Implement login')).not.toBeInTheDocument()
      })
    })

    it('affiche le bouton de suppression des filtres quand un filtre de recherche est actif', async () => {
      const user = userEvent.setup()
      render(<KanbanBoard />)

      // Type in search to activate filter
      const searchInput = screen.getByPlaceholderText('common.search')
      await user.type(searchInput, 'login')

      await waitFor(() => {
        expect(screen.getByText('kanban.clearFilters')).toBeInTheDocument()
      })
    })
  })

  describe('numeros de ticket', () => {
    it('affiche les numeros de ticket formates', () => {
      render(<KanbanBoard />)
      // Default type is 'feature' -> prefix 'F', so: F-01, F-02, etc.
      expect(screen.getByText(/F-01/)).toBeInTheDocument()
      expect(screen.getByText(/F-02/)).toBeInTheDocument()
    })
  })

  describe('labels', () => {
    it('affiche les taches avec leurs titres', () => {
      render(<KanbanBoard />)
      // Tasks are displayed in their respective columns
      expect(screen.getByText('Implement login')).toBeInTheDocument()
      expect(screen.getByText('Fix header bug')).toBeInTheDocument()
    })
  })
})
