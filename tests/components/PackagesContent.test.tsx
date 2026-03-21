import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Mock PackagesChat (imported by component from ./packages-chat)
vi.mock('../../src/renderer/features/packages/packages-chat', () => ({
  PackagesChat: ({ projectPath, manager }: { projectPath: string; manager: string }) => (
    <div data-testid="packages-chat">chat: {projectPath} {manager}</div>
  ),
}))

// Mock ResizeDivider (imported from ../../shared/layout/resize-divider)
vi.mock('../../src/renderer/shared/layout/resize-divider', () => ({
  ResizeDivider: () => <div data-testid="resize-divider" />,
}))

// Mock database module (clampPanelHeight)
vi.mock('../../src/renderer/features/database', () => ({
  clampPanelHeight: (current: number, delta: number) => Math.max(100, current + delta),
}))

// Mock packagesStore
const mockLoadPackages = vi.fn()
const mockUpdatePackage = vi.fn().mockResolvedValue({ success: true })
const mockSetSearchQuery = vi.fn()

const mockPackagesList = [
  { name: 'react', currentVersion: '18.2.0', latestVersion: '19.0.0', type: 'dependency', updateAvailable: true, isDeprecated: false },
  { name: 'typescript', currentVersion: '5.3.0', latestVersion: '5.4.0', type: 'devDependency', updateAvailable: true, isDeprecated: false },
  { name: 'lodash', currentVersion: '4.17.21', latestVersion: '4.17.21', type: 'dependency', updateAvailable: false, isDeprecated: false },
  { name: 'old-package', currentVersion: '1.0.0', latestVersion: '1.0.0', type: 'dependency', updateAvailable: false, isDeprecated: true, deprecationMessage: 'Use new-package instead' },
]

let packagesStoreState = {
  selectedProjectId: 'proj-1' as string | null,
  selectedManager: 'npm' as string | null,
  packages: { 'proj-1:npm': mockPackagesList } as Record<string, typeof mockPackagesList>,
  loading: {} as Record<string, boolean>,
  managers: [
    { projectId: 'proj-1', manager: 'npm', projectPath: '/my-project', projectName: 'My Project' },
  ],
  loadPackages: mockLoadPackages,
  updatePackage: mockUpdatePackage,
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  updatingPackages: {} as Record<string, string[]>,
  updateAllLoading: {} as Record<string, boolean>,
  addUpdatingPackage: vi.fn(),
  removeUpdatingPackage: vi.fn(),
  setUpdateAllLoading: vi.fn(),
}

vi.mock('../../src/renderer/features/packages/packages-store', () => ({
  usePackagesStore: () => packagesStoreState,
}))

import { PackagesContent } from '../../src/renderer/components/PackagesContent'

describe('PackagesContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    packagesStoreState = {
      selectedProjectId: 'proj-1',
      selectedManager: 'npm',
      packages: { 'proj-1:npm': mockPackagesList },
      loading: {},
      managers: [
        { projectId: 'proj-1', manager: 'npm', projectPath: '/my-project', projectName: 'My Project' },
      ],
      loadPackages: mockLoadPackages,
      updatePackage: mockUpdatePackage,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      updatingPackages: {},
      updateAllLoading: {},
      addUpdatingPackage: vi.fn(),
      removeUpdatingPackage: vi.fn(),
      setUpdateAllLoading: vi.fn(),
    }
  })

  describe('rendu initial', () => {
    it('affiche le header avec le nom du projet et le manager', () => {
      render(<PackagesContent />)
      // The h3 contains "My Project — npm"
      const heading = document.querySelector('h3')
      expect(heading).not.toBeNull()
      expect(heading!.textContent).toContain('My Project')
      expect(heading!.textContent).toContain('npm')
    })

    it('affiche le compteur de packages', () => {
      render(<PackagesContent />)
      expect(screen.getByText(/packages\.packageCount/)).toBeInTheDocument()
    })

    it('affiche la liste des packages', () => {
      render(<PackagesContent />)
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('typescript')).toBeInTheDocument()
      expect(screen.getByText('lodash')).toBeInTheDocument()
    })

    it('affiche le message quand aucun manager n est selectionne', () => {
      packagesStoreState.selectedProjectId = null
      packagesStoreState.selectedManager = null
      render(<PackagesContent />)
      expect(screen.getByText('packages.selectManager')).toBeInTheDocument()
    })

    it('affiche le bouton refresh', () => {
      render(<PackagesContent />)
      expect(screen.getByTitle('common.refresh')).toBeInTheDocument()
    })
  })

  describe('filtrage par type', () => {
    it('affiche les boutons de filtre', () => {
      render(<PackagesContent />)
      expect(screen.getByText(/packages\.allCount/)).toBeInTheDocument()
      expect(screen.getByText(/packages\.depsCount/)).toBeInTheDocument()
      expect(screen.getByText(/packages\.devDepsCount/)).toBeInTheDocument()
    })

    it('affiche le filtre updates quand des mises a jour existent', () => {
      render(<PackagesContent />)
      expect(screen.getByText(/packages\.updatesCount/)).toBeInTheDocument()
    })

    it('affiche le filtre deprecated quand des packages deprecies existent', () => {
      render(<PackagesContent />)
      expect(screen.getByText(/packages\.deprecatedCount/)).toBeInTheDocument()
    })

    it('filtre par dependencies au clic sur le bouton deps', async () => {
      const user = userEvent.setup()
      render(<PackagesContent />)

      await user.click(screen.getByText(/packages\.depsCount/))

      // react, lodash and old-package are dependencies
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('typescript')).not.toBeInTheDocument()
    })

    it('filtre par devDependencies au clic sur le bouton devDeps', async () => {
      const user = userEvent.setup()
      render(<PackagesContent />)

      await user.click(screen.getByText(/packages\.devDepsCount/))

      expect(screen.getByText('typescript')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()
    })
  })

  describe('recherche de packages', () => {
    it('affiche le champ de recherche', () => {
      render(<PackagesContent />)
      expect(screen.getByPlaceholderText('packages.searchPlaceholder')).toBeInTheDocument()
    })

    it('appelle setSearchQuery au changement de texte', async () => {
      const user = userEvent.setup()
      render(<PackagesContent />)

      const searchInput = screen.getByPlaceholderText('packages.searchPlaceholder')
      await user.type(searchInput, 'react')

      expect(mockSetSearchQuery).toHaveBeenCalled()
    })
  })

  describe('affichage des mises a jour', () => {
    it('affiche les versions actuelles et disponibles pour les packages avec mise a jour', () => {
      render(<PackagesContent />)
      expect(screen.getByText('18.2.0')).toBeInTheDocument()
      expect(screen.getByText('19.0.0')).toBeInTheDocument()
    })

    it('affiche le bouton de mise a jour pour les packages avec update', () => {
      render(<PackagesContent />)
      const updateBtns = screen.getAllByTitle(/packages\.updatePackage/)
      expect(updateBtns.length).toBe(2) // react and typescript
    })

    it('affiche le bouton mettre tout a jour', () => {
      render(<PackagesContent />)
      expect(screen.getByText(/packages\.updateAllCount/)).toBeInTheDocument()
    })
  })

  describe('mise a jour d un package', () => {
    it('appelle updatePackage au clic sur le bouton de mise a jour', async () => {
      const user = userEvent.setup()
      render(<PackagesContent />)

      const updateBtns = screen.getAllByTitle(/packages\.updatePackage/)
      await user.click(updateBtns[0]!)

      expect(mockUpdatePackage).toHaveBeenCalledWith('/my-project', 'npm', 'react')
    })
  })

  describe('etat de chargement', () => {
    it('affiche le message de chargement', () => {
      packagesStoreState.loading = { 'proj-1:npm': true }
      render(<PackagesContent />)
      expect(screen.getByText('packages.analyzing')).toBeInTheDocument()
    })

    it('affiche le message vide quand aucun package', () => {
      packagesStoreState.packages = { 'proj-1:npm': [] }
      render(<PackagesContent />)
      expect(screen.getByText('packages.noPackages')).toBeInTheDocument()
    })
  })

  describe('chat integre', () => {
    it('affiche le composant PackagesChat', () => {
      render(<PackagesContent />)
      expect(screen.getByTestId('packages-chat')).toBeInTheDocument()
    })
  })
})
