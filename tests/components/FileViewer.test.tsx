import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock i18n — returns keys as-is for deterministic assertions
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: vi.fn(),
  }),
}))

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => <div data-testid="monaco-editor" data-value={props.value} />,
  __esModule: true,
}))

// Mock CopyableError (new path: shared/ui/copyable-error)
vi.mock('../../src/renderer/shared/ui/copyable-error', () => ({
  CopyableError: ({ error }: { error: string }) => <div data-testid="copyable-error">{error}</div>,
}))

// Mock markdownToHtml
vi.mock('../../src/renderer/lib/markdown-to-html', () => ({
  markdownToHtml: (md: string) => '<p>' + md + '</p>',
}))

// Mock viewStore
const mockSetViewMode = vi.fn()
const mockSetEditorDirty = vi.fn()
const mockToggleBookmark = vi.fn()

let mockViewState: Record<string, unknown> = {}

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = mockViewState
      return selector ? selector(state) : state
    },
    {
      getState: () => mockViewState,
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { FileViewer } from '../../src/renderer/components/FileViewer'

describe('FileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset viewStore mock state
    mockViewState = {
      selectedFilePath: null,
      setViewMode: mockSetViewMode,
      isEditorDirty: false,
      setEditorDirty: mockSetEditorDirty,
      bookmarks: [],
      toggleBookmark: mockToggleBookmark,
      pendingLineNumber: null,
    }

    // Add fs methods not present in the global setup
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    mirehub.fs.readFile = vi.fn()
    mirehub.fs.readBase64 = vi.fn()
    mirehub.fs.writeFile = vi.fn()
  })

  describe('rendu', () => {
    it('affiche le message vide quand aucun fichier selectionne', () => {
      render(<FileViewer />)
      expect(screen.getByText('file.noFileSelected')).toBeInTheDocument()
    })

    it('affiche le chargement pendant la lecture du fichier', () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockReturnValue(new Promise(() => {}))

      mockViewState = { ...mockViewState, selectedFilePath: '/project/src/index.ts' }

      render(<FileViewer />)
      expect(screen.getByText('common.loading')).toBeInTheDocument()
    })

    it('affiche le contenu du fichier texte apres chargement', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: 'const x = 42', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/src/index.ts' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      })
    })

    it('affiche une image pour les fichiers image', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readBase64.mockResolvedValue({ data: 'data:image/png;base64,abc', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/logo.png' }

      render(<FileViewer />)

      await waitFor(() => {
        const container = document.querySelector('.file-viewer-image')
        expect(container).toBeInTheDocument()
        const img = container?.querySelector('img')
        expect(img).toBeInTheDocument()
        expect(img?.getAttribute('src')).toBe('data:image/png;base64,abc')
      })
    })

    it('affiche le bouton de sauvegarde pour les fichiers texte', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: 'hello world', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/src/index.ts' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByTitle('file.save')).toBeInTheDocument()
      })
    })

    it('affiche l erreur quand la lecture echoue', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: null, error: 'Permission denied' })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/secret.txt' }

      render(<FileViewer />)

      await waitFor(() => {
        const errorContainer = document.querySelector('.file-viewer-error')
        expect(errorContainer).toBeInTheDocument()
        expect(screen.getByTestId('copyable-error')).toHaveTextContent('Permission denied')
      })
    })

    it('affiche le nom du fichier dans le header', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: '', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/src/index.ts' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByText('index.ts')).toBeInTheDocument()
      })
    })
  })

  describe('interactions', () => {
    it('toggle le bookmark au clic sur le bouton favori', async () => {
      const user = userEvent.setup()
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: 'content', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/src/index.ts' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByTitle('file.addBookmark')).toBeInTheDocument()
      })

      await user.click(screen.getByTitle('file.addBookmark'))

      expect(mockToggleBookmark).toHaveBeenCalledWith('/project/src/index.ts')
    })

    it('ferme le viewer au clic sur le bouton close', async () => {
      const user = userEvent.setup()
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: 'content', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/src/index.ts' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByTitle('common.close')).toBeInTheDocument()
      })

      await user.click(screen.getByTitle('common.close'))

      expect(mockSetViewMode).toHaveBeenCalledWith('terminal')
    })

    it('affiche le bouton preview pour les fichiers markdown', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: '# Hello', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/README.md' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument()
      })
    })

    it('affiche les boutons Format et Minify pour les fichiers JSON', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.fs.readFile.mockResolvedValue({ content: '{"key":"value"}', error: null })

      mockViewState = { ...mockViewState, selectedFilePath: '/project/config.json' }

      render(<FileViewer />)

      await waitFor(() => {
        expect(screen.getByText('Format')).toBeInTheDocument()
        expect(screen.getByText('Minify')).toBeInTheDocument()
      })
    })
  })
})
