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

// Mock ContextMenu (new path: shared/ui/context-menu)
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

// Mock ClaudeInfoPanel (new path: features/claude)
vi.mock('../../src/renderer/features/claude', () => ({
  ClaudeInfoPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="claude-info-panel">
      <button onClick={onClose}>close-claude-info</button>
    </div>
  ),
}))

// Mock ConfirmModal (new path: shared/ui/confirm-modal)
vi.mock('../../src/renderer/shared/ui/confirm-modal', () => ({
  ConfirmModal: ({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-modal">
      <span>{title}</span>
      <button onClick={onConfirm}>confirm</button>
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}))

// Mock SidebarFileTree (new path: features/files)
vi.mock('../../src/renderer/features/files', () => ({
  SidebarFileTree: ({ projectPath }: { projectPath: string }) => (
    <div data-testid="sidebar-file-tree">{projectPath}</div>
  ),
}))

// Mock stores
const mockSetActiveProject = vi.fn()
const mockRemoveProject = vi.fn()
const mockRescanClaude = vi.fn()
const mockClearPendingClaudeImport = vi.fn()
const mockSetViewMode = vi.fn()

// workspaceStore (used from ../../workspace-store relative to component)
vi.mock('../../src/renderer/features/workspace/workspace-store', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        setActiveProject: mockSetActiveProject,
        removeProject: mockRemoveProject,
        rescanClaude: mockRescanClaude,
        clearPendingClaudeImport: mockClearPendingClaudeImport,
        pendingClaudeImport: null,
        activeWorkspaceId: 'ws-1',
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        setActiveProject: mockSetActiveProject,
        removeProject: mockRemoveProject,
        rescanClaude: mockRescanClaude,
        clearPendingClaudeImport: mockClearPendingClaudeImport,
        pendingClaudeImport: null,
        activeWorkspaceId: 'ws-1',
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

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
        createTab: vi.fn().mockReturnValue('tab-1'),
        setTabColor: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = { setViewMode: mockSetViewMode }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        setViewMode: mockSetViewMode,
        setPendingDbProjectPath: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { ProjectItem } from '../../src/renderer/components/ProjectItem'

const mockProject = {
  id: 'proj-1',
  name: 'My Project',
  path: '/Users/dev/my-project',
  workspaceId: 'ws-1',
  hasClaude: false,
  hasGit: true,
}

const mockProjectWithClaude = {
  ...mockProject,
  hasClaude: true,
}

describe('ProjectItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup window.kanbai.project mocks
    const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    kanbai.project.checkClaude = vi.fn().mockResolvedValue(false)
    kanbai.project.deployClaude = vi.fn().mockResolvedValue({ success: true })
    kanbai.project.getNotes = vi.fn().mockResolvedValue('')
    kanbai.project.saveNotes = vi.fn().mockResolvedValue(undefined)
  })

  describe('rendu du projet actif', () => {
    it('affiche le nom du dossier du projet', () => {
      render(<ProjectItem project={mockProject} isActive={true} />)
      expect(screen.getByText('my-project')).toBeInTheDocument()
    })

    it('applique la classe active', () => {
      const { container } = render(<ProjectItem project={mockProject} isActive={true} />)
      const item = container.querySelector('.project-item--active')
      expect(item).toBeInTheDocument()
    })

    it('affiche l arborescence quand le projet actif est deplie par defaut', () => {
      render(<ProjectItem project={mockProject} isActive={true} />)
      expect(screen.getByTestId('sidebar-file-tree')).toBeInTheDocument()
    })

    it('affiche le bouton deploy claude pour un projet sans claude', () => {
      render(<ProjectItem project={mockProject} isActive={true} />)
      expect(screen.getByTitle('project.deployClaudeOnProject')).toBeInTheDocument()
    })

    it('n affiche pas le bouton deploy pour un projet avec claude', () => {
      render(<ProjectItem project={mockProjectWithClaude} isActive={true} />)
      expect(screen.queryByTitle('project.deployClaudeOnProject')).not.toBeInTheDocument()
    })
  })

  describe('rendu du projet inactif', () => {
    it('n applique pas la classe active', () => {
      const { container } = render(<ProjectItem project={mockProject} isActive={false} />)
      const item = container.querySelector('.project-item--active')
      expect(item).not.toBeInTheDocument()
    })

    it('n affiche pas l arborescence pour un projet inactif', () => {
      render(<ProjectItem project={mockProject} isActive={false} />)
      expect(screen.queryByTestId('sidebar-file-tree')).not.toBeInTheDocument()
    })
  })

  describe('clic pour activer', () => {
    it('appelle setActiveProject au clic sur un projet inactif', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={false} />)

      await user.click(screen.getByText('my-project'))

      expect(mockSetActiveProject).toHaveBeenCalledWith('proj-1')
    })

    it('bascule la vue en kanban au clic sur un projet inactif', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={false} />)

      await user.click(screen.getByText('my-project'))

      expect(mockSetViewMode).toHaveBeenCalledWith('kanban')
    })

    it('ne change pas de projet actif au clic sur un projet deja actif', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={true} />)

      await user.click(screen.getByText('my-project'))

      expect(mockSetActiveProject).not.toHaveBeenCalled()
    })
  })

  describe('affichage de l arborescence', () => {
    it('l arborescence est visible par defaut pour un projet actif', () => {
      render(<ProjectItem project={mockProject} isActive={true} />)
      expect(screen.getByTestId('sidebar-file-tree')).toBeInTheDocument()
    })

    it('replie l arborescence au clic sur un projet actif deplie', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={true} />)

      expect(screen.getByTestId('sidebar-file-tree')).toBeInTheDocument()

      await user.click(screen.getByText('my-project'))
      expect(screen.queryByTestId('sidebar-file-tree')).not.toBeInTheDocument()
    })

    it('deplie l arborescence au second clic apres avoir replie', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={true} />)

      await user.click(screen.getByText('my-project'))
      expect(screen.queryByTestId('sidebar-file-tree')).not.toBeInTheDocument()

      await user.click(screen.getByText('my-project'))
      expect(screen.getByTestId('sidebar-file-tree')).toBeInTheDocument()
    })
  })

  describe('menu contextuel', () => {
    it('affiche le menu contextuel au clic droit', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={true} />)

      await user.pointer({ target: screen.getByText('my-project'), keys: '[MouseRight]' })

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument()
        expect(screen.getByText('project.deployClaude')).toBeInTheDocument()
        expect(screen.getByText('project.removeFromWorkspace')).toBeInTheDocument()
      })
    })

    it('affiche l option config claude pour un projet avec claude', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProjectWithClaude} isActive={true} />)

      await user.pointer({ target: screen.getByText('my-project'), keys: '[MouseRight]' })

      await waitFor(() => {
        expect(screen.getByText('project.showClaudeConfig')).toBeInTheDocument()
      })
    })

    it('appelle removeProject via le menu contextuel', async () => {
      const user = userEvent.setup()
      render(<ProjectItem project={mockProject} isActive={true} />)

      await user.pointer({ target: screen.getByText('my-project'), keys: '[MouseRight]' })

      await waitFor(() => {
        expect(screen.getByText('project.removeFromWorkspace')).toBeInTheDocument()
      })

      await user.click(screen.getByText('project.removeFromWorkspace'))

      expect(mockRemoveProject).toHaveBeenCalledWith('proj-1')
    })
  })

  describe('classes conditionnelles', () => {
    it('applique la classe git pour un projet avec git', () => {
      const { container } = render(<ProjectItem project={mockProject} isActive={false} />)
      expect(container.querySelector('.project-item--git')).toBeInTheDocument()
    })

    it('applique la classe claude pour un projet avec claude', () => {
      const { container } = render(<ProjectItem project={mockProjectWithClaude} isActive={false} />)
      expect(container.querySelector('.project-item--claude')).toBeInTheDocument()
    })
  })
})
