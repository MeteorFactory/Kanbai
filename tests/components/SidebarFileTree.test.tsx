import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FileEntry } from '../../src/shared/types'

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

// Mock viewStore
const mockOpenFile = vi.fn()
const mockToggleFileSelection = vi.fn()
const mockClearSelection = vi.fn()
const mockSetClipboard = vi.fn()
const mockClearClipboard = vi.fn()

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        selectedFiles: [],
        highlightedFilePath: null,
        clipboardPath: null,
        clipboardOperation: null,
        openFile: mockOpenFile,
        toggleFileSelection: mockToggleFileSelection,
        clearSelection: mockClearSelection,
        setClipboard: mockSetClipboard,
        clearClipboard: mockClearClipboard,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        selectedFiles: [],
        highlightedFilePath: null,
        clipboardPath: null,
        clipboardOperation: null,
        openFile: mockOpenFile,
        toggleFileSelection: mockToggleFileSelection,
        clearSelection: mockClearSelection,
        setClipboard: mockSetClipboard,
        clearClipboard: mockClearClipboard,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { SidebarFileTree } from '../../src/renderer/components/SidebarFileTree'

const mockFileEntries: FileEntry[] = [
  { name: 'src', path: '/project/src', isDirectory: true, isSymlink: false },
  { name: 'package.json', path: '/project/package.json', isDirectory: false, isSymlink: false },
  { name: 'README.md', path: '/project/README.md', isDirectory: false, isSymlink: false },
]

const mockChildEntries: FileEntry[] = [
  { name: 'index.ts', path: '/project/src/index.ts', isDirectory: false, isSymlink: false },
  { name: 'App.tsx', path: '/project/src/App.tsx', isDirectory: false, isSymlink: false },
]

describe('SidebarFileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    mirehub.fs.readDir.mockImplementation((dirPath: string) => {
      if (dirPath === '/project') return Promise.resolve(mockFileEntries)
      if (dirPath === '/project/src') return Promise.resolve(mockChildEntries)
      return Promise.resolve([])
    })
  })

  describe('rendu initial', () => {
    it('affiche les fichiers et dossiers du projet', async () => {
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
        expect(screen.getByText('package.json')).toBeInTheDocument()
        expect(screen.getByText('README.md')).toBeInTheDocument()
      })
    })

    it('appelle readDir avec le chemin du projet', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(mirehub.fs.readDir).toHaveBeenCalledWith('/project')
      })
    })

    it('ne charge rien si projectPath est vide', () => {
      render(<SidebarFileTree projectPath="" />)
      expect(screen.queryByText('Chargement...')).not.toBeInTheDocument()
    })
  })

  describe('navigation dans l arbre', () => {
    it('deplie un dossier au clic', async () => {
      const user = userEvent.setup()
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
      })

      await user.click(screen.getByText('src'))

      await waitFor(() => {
        expect(screen.getByText('index.ts')).toBeInTheDocument()
        expect(screen.getByText('App.tsx')).toBeInTheDocument()
      })
    })

    it('ouvre un fichier au clic (non-dossier)', async () => {
      const user = userEvent.setup()
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(screen.getByText('package.json')).toBeInTheDocument()
      })

      await user.click(screen.getByText('package.json'))

      expect(mockClearSelection).toHaveBeenCalled()
      expect(mockOpenFile).toHaveBeenCalledWith('/project/package.json')
    })
  })

  describe('menu contextuel', () => {
    it('affiche le menu contextuel au clic droit sur un fichier', async () => {
      const user = userEvent.setup()
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(screen.getByText('package.json')).toBeInTheDocument()
      })

      await user.pointer({ target: screen.getByText('package.json'), keys: '[MouseRight]' })

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument()
        expect(screen.getByText('Renommer')).toBeInTheDocument()
        expect(screen.getByText('Supprimer')).toBeInTheDocument()
      })
    })

    it('affiche des options supplementaires pour les dossiers', async () => {
      const user = userEvent.setup()
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
      })

      await user.pointer({ target: screen.getByText('src'), keys: '[MouseRight]' })

      await waitFor(() => {
        expect(screen.getByText('Nouveau fichier')).toBeInTheDocument()
        expect(screen.getByText('Nouveau dossier')).toBeInTheDocument()
      })
    })
  })

  describe('icones de fichiers', () => {
    it('affiche une icone de dossier pour les dossiers', async () => {
      render(<SidebarFileTree projectPath="/project" />)

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument()
      })

      const srcRow = screen.getByText('src').closest('.sidebar-ft-row')
      const iconSpan = srcRow?.querySelector('.sidebar-ft-icon')
      // The icon is now an SVG component, not an emoji
      expect(iconSpan).toBeInTheDocument()
      expect(iconSpan?.querySelector('svg') || iconSpan?.textContent?.length).toBeTruthy()
    })
  })
})
