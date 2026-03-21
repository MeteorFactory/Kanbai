import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FileEntry } from '../../src/shared/types'

// Mock CSS
vi.mock('../../src/renderer/styles/fileexplorer.css', () => ({}))

// Mock ContextMenu to avoid complex rendering
vi.mock('../../src/renderer/components/ContextMenu', () => ({
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

// Mock workspace store
let mockActiveProjectId: string | null = 'proj-1'
const mockProjects = [
  { id: 'proj-1', name: 'Frontend App', workspaceId: 'ws-1', path: '/projects/frontend' },
  { id: 'proj-2', name: 'Backend API', workspaceId: 'ws-1', path: '/projects/backend' },
]

vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        activeProjectId: mockActiveProjectId,
        projects: mockProjects,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        activeProjectId: mockActiveProjectId,
        projects: mockProjects,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { FileExplorer } from '../../src/renderer/components/FileExplorer'

const mockFileEntries: FileEntry[] = [
  { name: 'src', path: '/projects/frontend/src', isDirectory: true, isSymlink: false },
  { name: 'package.json', path: '/projects/frontend/package.json', isDirectory: false, isSymlink: false, size: 1536 },
  { name: 'README.md', path: '/projects/frontend/README.md', isDirectory: false, isSymlink: false, size: 4096 },
  { name: 'tsconfig.json', path: '/projects/frontend/tsconfig.json', isDirectory: false, isSymlink: false, size: 512 },
  { name: 'node_modules', path: '/projects/frontend/node_modules', isDirectory: true, isSymlink: false },
]

describe('FileExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    mirehub.fs.readDir.mockResolvedValue(mockFileEntries)

    // Add openInFinder mock if not present
    if (!mirehub.fs.openInFinder) {
      mirehub.fs.openInFinder = vi.fn().mockResolvedValue(undefined)
    }
  })

  describe('rendu initial', () => {
    it('affiche le message quand pas de projet actif', () => {
      mockActiveProjectId = null

      render(<FileExplorer />)
      expect(screen.getByText(/Sélectionnez un projet/)).toBeInTheDocument()

      mockActiveProjectId = 'proj-1'
    })

    it('affiche le chargement initial', () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      // Never-resolving promise to keep loading state
      mirehub.fs.readDir.mockReturnValue(new Promise(() => {}))

      render(<FileExplorer />)
      expect(screen.getByText('Chargement...')).toBeInTheDocument()
    })

    it('affiche le nom du projet et le chemin', async () => {
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('Frontend App')).toBeInTheDocument()
        expect(screen.getByText('/projects/frontend')).toBeInTheDocument()
      })
    })

    it('affiche les fichiers apres chargement', async () => {
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
        expect(screen.getByText('package.json')).toBeInTheDocument()
        expect(screen.getByText('README.md')).toBeInTheDocument()
        expect(screen.getByText('tsconfig.json')).toBeInTheDocument()
        expect(screen.getByText('node_modules')).toBeInTheDocument()
      })
    })
  })

  describe('tri', () => {
    it('affiche les dossiers avant les fichiers', async () => {
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
      })

      // Get all file-tree-name elements to check ordering
      const names = screen.getAllByText(/(src|node_modules|package\.json|README\.md|tsconfig\.json)/)
      const nameTexts = names
        .filter((el) => el.classList.contains('file-tree-name'))
        .map((el) => el.textContent)

      // Directories (src, node_modules) should come before files
      const srcIdx = nameTexts.indexOf('src')
      const nodeModulesIdx = nameTexts.indexOf('node_modules')
      const packageIdx = nameTexts.indexOf('package.json')
      const readmeIdx = nameTexts.indexOf('README.md')

      // Both directories should appear before any file
      expect(srcIdx).toBeLessThan(packageIdx)
      expect(nodeModulesIdx).toBeLessThan(readmeIdx)
    })

    it('change le tri via le selecteur', async () => {
      const user = userEvent.setup()
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
      })

      const sortSelect = screen.getByRole('combobox')
      expect(sortSelect).toBeInTheDocument()

      // Change sort to Size
      await user.selectOptions(sortSelect, 'size')
      expect(sortSelect).toHaveValue('size')

      // Change sort to Date
      await user.selectOptions(sortSelect, 'date')
      expect(sortSelect).toHaveValue('date')
    })
  })

  describe('tailles de fichiers', () => {
    it('affiche les tailles de fichiers formatees', async () => {
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('package.json')).toBeInTheDocument()
      })

      // package.json is 1536 bytes = 1.5 KB
      expect(screen.getByText('1.5 KB')).toBeInTheDocument()
      // README.md is 4096 bytes = 4.0 KB
      expect(screen.getByText('4.0 KB')).toBeInTheDocument()
      // tsconfig.json is 512 bytes = 512 B
      expect(screen.getByText('512 B')).toBeInTheDocument()
    })
  })

  describe('appels IPC', () => {
    it('appelle readDir avec le chemin du projet actif', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<FileExplorer />)

      await waitFor(() => {
        expect(mirehub.fs.readDir).toHaveBeenCalledWith('/projects/frontend')
      })
    })
  })
})
