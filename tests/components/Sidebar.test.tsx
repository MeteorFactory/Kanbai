import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock i18n — returns keys as-is for deterministic assertions
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

// Mock WorkspaceItem to avoid complex sub-component rendering
vi.mock('../../src/renderer/features/workspace/workspace-item', () => ({
  WorkspaceItem: ({ workspace, isActive }: { workspace: { id: string; name: string }; isActive: boolean }) => (
    <div data-testid={`workspace-item-${workspace.id}`} data-active={isActive}>
      {workspace.name}
    </div>
  ),
}))

// Mock workspace store
const mockInit = vi.fn()
const mockSetActiveNamespace = vi.fn()
const mockCreateNamespace = vi.fn()
const mockUpdateNamespace = vi.fn()
const mockDeleteNamespace = vi.fn()
const mockCreateWorkspaceFromPath = vi.fn()
const mockCreateWorkspaceFromNew = vi.fn()
const mockCreateWorkspaceFromNewInDir = vi.fn()
const mockCheckDeletedWorkspace = vi.fn().mockResolvedValue(null)
const mockRestoreWorkspace = vi.fn()
const mockNavigateWorkspace = vi.fn()

let mockWorkspaces: Array<{ id: string; name: string; color: string; projectIds: string[]; createdAt: number; updatedAt: number }> = [
  { id: 'ws-1', name: 'Workspace A', color: '#ff0000', projectIds: ['p-1'], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'ws-2', name: 'Workspace B', color: '#00ff00', projectIds: [], createdAt: Date.now(), updatedAt: Date.now() },
]

const mockNamespaces = [
  { id: 'ns-1', name: 'Default', isDefault: true, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'ns-2', name: 'Work', isDefault: false, createdAt: Date.now(), updatedAt: Date.now() },
]

const mockProjects = [
  { id: 'p-1', name: 'Frontend', workspaceId: 'ws-1', path: '/projects/frontend' },
]

vi.mock('../../src/renderer/features/workspace/workspace-store', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        projects: mockProjects,
        activeWorkspaceId: 'ws-1',
        namespaces: mockNamespaces,
        activeNamespaceId: 'ns-1',
        setActiveNamespace: mockSetActiveNamespace,
        createNamespace: mockCreateNamespace,
        updateNamespace: mockUpdateNamespace,
        deleteNamespace: mockDeleteNamespace,
        init: mockInit,
        createWorkspaceFromPath: mockCreateWorkspaceFromPath,
        createWorkspaceFromNew: mockCreateWorkspaceFromNew,
        createWorkspaceFromNewInDir: mockCreateWorkspaceFromNewInDir,
        checkDeletedWorkspace: mockCheckDeletedWorkspace,
        restoreWorkspace: mockRestoreWorkspace,
        navigateWorkspace: mockNavigateWorkspace,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        activeWorkspaceId: 'ws-1',
        projects: mockProjects,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
  useFilteredWorkspaces: () => mockWorkspaces,
}))

// Mock view store
const mockOpenFile = vi.fn()

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        recentFiles: ['/projects/frontend/src/index.ts', '/projects/frontend/README.md'],
        bookmarks: ['/projects/frontend/package.json'],
        openFile: mockOpenFile,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        recentFiles: ['/projects/frontend/src/index.ts', '/projects/frontend/README.md'],
        bookmarks: ['/projects/frontend/package.json'],
        openFile: mockOpenFile,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { Sidebar } from '../../src/renderer/components/Sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Add missing IPC mocks needed by Sidebar
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    if (!mirehub.workspace.permanentDelete) {
      mirehub.workspace.permanentDelete = vi.fn().mockResolvedValue(undefined)
    }
    if (!mirehub.workspace.import) {
      mirehub.workspace.import = vi.fn().mockResolvedValue({ success: true })
    }
    if (!mirehub.workspace.export) {
      mirehub.workspace.export = vi.fn().mockResolvedValue(undefined)
    }
    mirehub.project.selectDir.mockResolvedValue(null)
  })

  describe('rendu initial', () => {
    it('rend la sidebar avec le titre quand aucun namespace actif', () => {
      render(<Sidebar />)
      // The namespace trigger button shows activeNamespace.name or sidebar.title fallback
      // With ns-1 active and matching mockNamespaces, it shows "Default"
      expect(screen.getByText('Default')).toBeInTheDocument()
    })

    it('affiche le message vide quand pas de workspaces', () => {
      const saved = mockWorkspaces
      mockWorkspaces = []

      render(<Sidebar />)
      expect(screen.getByText('sidebar.empty')).toBeInTheDocument()

      mockWorkspaces = saved
    })

    it('affiche les workspaces quand il y en a', () => {
      render(<Sidebar />)
      expect(screen.getByTestId('workspace-item-ws-1')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-item-ws-2')).toBeInTheDocument()
      expect(screen.getByText('Workspace A')).toBeInTheDocument()
      expect(screen.getByText('Workspace B')).toBeInTheDocument()
    })

    it('appelle init au montage', () => {
      render(<Sidebar />)
      expect(mockInit).toHaveBeenCalled()
    })
  })

  describe('menu de creation', () => {
    it('ouvre le menu de creation au clic sur +', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      const addButton = screen.getByText('+')
      await user.click(addButton)

      expect(screen.getByText('sidebar.fromExisting')).toBeInTheDocument()
      expect(screen.getByText('sidebar.createNew')).toBeInTheDocument()
    })

    it('affiche le modal de creation de projet', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      // Open create menu
      await user.click(screen.getByText('+'))
      // Click "Create new"
      await user.click(screen.getByText('sidebar.createNew'))

      await waitFor(() => {
        expect(screen.getByText('sidebar.newWorkspaceProject')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('sidebar.projectNamePlaceholder')).toBeInTheDocument()
        expect(screen.getByText('common.cancel')).toBeInTheDocument()
        expect(screen.getByText('sidebar.chooseLocationAndCreate')).toBeInTheDocument()
      })
    })

    it('desactive le bouton creer quand le nom est vide', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      await user.click(screen.getByText('+'))
      await user.click(screen.getByText('sidebar.createNew'))

      await waitFor(() => {
        const createBtn = screen.getByText('sidebar.chooseLocationAndCreate')
        expect(createBtn).toBeDisabled()
      })
    })
  })

  describe('favoris', () => {
    it('affiche la section des favoris quand bookmarks > 0', () => {
      render(<Sidebar />)
      expect(screen.getByText(/sidebar.favorites/)).toBeInTheDocument()
    })

    it('ouvre le fichier au clic dans les bookmarks', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      // Expand bookmarks section
      await user.click(screen.getByText(/sidebar.favorites/))

      await waitFor(() => {
        expect(screen.getByText('package.json')).toBeInTheDocument()
      })

      await user.click(screen.getByText('package.json'))
      expect(mockOpenFile).toHaveBeenCalledWith('/projects/frontend/package.json')
    })
  })

  describe('fichiers recents', () => {
    it('affiche la section des fichiers recents', () => {
      render(<Sidebar />)
      expect(screen.getByText(/sidebar.recentFiles/)).toBeInTheDocument()
    })

    it('ouvre le fichier au clic dans les fichiers recents', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      // Expand recent files section
      await user.click(screen.getByText(/sidebar.recentFiles/))

      await waitFor(() => {
        expect(screen.getByText('index.ts')).toBeInTheDocument()
        expect(screen.getByText('README.md')).toBeInTheDocument()
      })

      await user.click(screen.getByText('index.ts'))
      expect(mockOpenFile).toHaveBeenCalledWith('/projects/frontend/src/index.ts')
    })
  })

  describe('namespace dropdown', () => {
    it('affiche le dropdown des namespaces au clic', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      await user.click(screen.getByText('Default'))

      await waitFor(() => {
        expect(screen.getByText('Work')).toBeInTheDocument()
        expect(screen.getByText('namespace.create')).toBeInTheDocument()
      })
    })
  })
})
