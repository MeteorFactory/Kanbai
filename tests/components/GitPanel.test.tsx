import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock CSS
vi.mock('../../src/renderer/features/git/git.css', () => ({}))

// Mock i18n
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}:${JSON.stringify(params)}`
      return key
    },
    locale: 'fr',
    localeCode: 'fr-FR',
    setLocale: vi.fn(),
  }),
}))

// Mock ContextMenu
vi.mock('../../src/renderer/shared/ui/context-menu', () => ({
  ContextMenu: () => <div data-testid="context-menu" />,
}))

// Mock stores
let mockActiveWorkspaceId: string | null = 'ws-1'
let mockProjects: Array<{ id: string; name: string; path: string; workspaceId: string }> = []

vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        activeWorkspaceId: mockActiveWorkspaceId,
        projects: mockProjects,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        activeWorkspaceId: mockActiveWorkspaceId,
        projects: mockProjects,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = { setViewMode: vi.fn(), setHighlightedFilePath: vi.fn() }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ setViewMode: vi.fn(), setHighlightedFilePath: vi.fn() }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

import { GitPanel } from '../../src/renderer/components/GitPanel'

describe('GitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveWorkspaceId = 'ws-1'
    mockProjects = []

    // Setup git mocks
    const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    kanbai.git = {
      status: vi.fn().mockRejectedValue(new Error('not a git repo')),
      log: vi.fn().mockResolvedValue([]),
      branches: vi.fn().mockResolvedValue([]),
      diff: vi.fn().mockResolvedValue(''),
      commit: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      stage: vi.fn().mockResolvedValue(undefined),
      unstage: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn().mockResolvedValue(undefined),
      stash: vi.fn().mockResolvedValue(undefined),
      stashPop: vi.fn().mockResolvedValue(undefined),
      createBranch: vi.fn().mockResolvedValue(undefined),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      merge: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
      init: vi.fn().mockResolvedValue(undefined),
      stashList: vi.fn().mockResolvedValue([]),
      tags: vi.fn().mockResolvedValue([]),
      remotes: vi.fn().mockResolvedValue([]),
      commitDiff: vi.fn().mockResolvedValue({ files: [], diff: '' }),
      blame: vi.fn().mockResolvedValue([]),
      createTag: vi.fn().mockResolvedValue(undefined),
      deleteTag: vi.fn().mockResolvedValue(undefined),
      cherryPick: vi.fn().mockResolvedValue(undefined),
      addRemote: vi.fn().mockResolvedValue(undefined),
      removeRemote: vi.fn().mockResolvedValue(undefined),
      renameBranch: vi.fn().mockResolvedValue(undefined),
    }
  })

  describe('guard: pas de projet', () => {
    it('affiche le message de selection de projet quand pas de projet dans le workspace', () => {
      mockProjects = []
      render(<GitPanel />)

      expect(screen.getByText('git.selectProject')).toBeInTheDocument()
      expect(document.querySelector('.git-empty')).toBeInTheDocument()
    })
  })

  describe('guard: pas de repo git', () => {
    it('affiche le dashboard avec bouton init quand le projet n est pas un repo git', async () => {
      const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      kanbai.git.status = vi.fn().mockRejectedValue(new Error('not a git repo'))

      mockProjects = [{ id: 'p1', name: 'Test', path: '/test', workspaceId: 'ws-1' }]

      render(<GitPanel />)

      // The component auto-loads data and shows the dashboard view
      await waitFor(() => {
        expect(screen.getByText('git.notGitRepo')).toBeInTheDocument()
        expect(screen.getByText('git.initGit')).toBeInTheDocument()
      })
    })

    it('appelle git.init au clic sur le bouton init', async () => {
      const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      kanbai.git.status = vi.fn().mockRejectedValue(new Error('not a git repo'))

      mockProjects = [{ id: 'p1', name: 'Test', path: '/test', workspaceId: 'ws-1' }]
      const user = userEvent.setup()

      render(<GitPanel />)

      await waitFor(() => {
        expect(screen.getByText('git.initGit')).toBeInTheDocument()
      })

      await user.click(screen.getByText('git.initGit'))

      expect(kanbai.git.init).toHaveBeenCalledWith('/test')
    })
  })

  describe('panneau git avec status', () => {
    const mockStatus = {
      branch: 'main',
      staged: [{ path: 'file1.ts', status: 'A' }],
      modified: [{ path: 'file2.ts', status: 'M' }],
      untracked: [{ path: 'file3.ts', status: '?' }],
      ahead: 0,
      behind: 0,
    }

    it('affiche le panneau git complet avec status', async () => {
      const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      kanbai.git.status = vi.fn().mockResolvedValue(mockStatus)

      mockProjects = [{ id: 'p1', name: 'Test', path: '/test', workspaceId: 'ws-1' }]

      render(<GitPanel />)

      await waitFor(() => {
        expect(document.querySelector('.git-panel')).toBeInTheDocument()
      })
    })

    it('affiche le nom de la branche', async () => {
      const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      kanbai.git.status = vi.fn().mockResolvedValue(mockStatus)

      mockProjects = [{ id: 'p1', name: 'Test', path: '/test', workspaceId: 'ws-1' }]

      render(<GitPanel />)

      // Dashboard view shows project cards with branch info (may appear in multiple places)
      await waitFor(() => {
        const elements = screen.getAllByText('main')
        expect(elements.length).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
