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
    localeCode: 'fr-FR',
    setLocale: vi.fn(),
  }),
}))

// Mock updateStore (now at features/updates/update-store)
const mockCheckUpdates = vi.fn()
const mockInstallUpdate = vi.fn()
const mockUninstallUpdate = vi.fn()
const mockClearInstallStatus = vi.fn()

let updateStoreState = {
  updates: [] as Array<{
    tool: string
    scope: string
    currentVersion: string
    latestVersion: string
    updateAvailable: boolean
    installed: boolean
    projectId?: string
  }>,
  isChecking: false,
  lastChecked: null as number | null,
  installingTool: null as string | null,
  installStatus: null as { tool: string; success: boolean; error?: string } | null,
  checkUpdates: mockCheckUpdates,
  installUpdate: mockInstallUpdate,
  uninstallUpdate: mockUninstallUpdate,
  clearUpdates: vi.fn(),
  clearInstallStatus: mockClearInstallStatus,
}

vi.mock('../../src/renderer/features/updates/update-store', () => ({
  useUpdateStore: () => updateStoreState,
}))

// Mock appUpdateStore (now at features/updates/app-update-store)
const mockCheckForUpdate = vi.fn()
const mockDownloadUpdate = vi.fn()
const mockInstallAppUpdate = vi.fn()

let appUpdateStoreState = {
  status: 'idle' as string,
  version: null as string | null,
  downloadPercent: 0,
  checkForUpdate: mockCheckForUpdate,
  downloadUpdate: mockDownloadUpdate,
  installUpdate: mockInstallAppUpdate,
}

vi.mock('../../src/renderer/features/updates/app-update-store', () => ({
  useAppUpdateStore: () => appUpdateStoreState,
}))

import { UpdateCenter } from '../../src/renderer/components/UpdateCenter'

describe('UpdateCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset store states
    updateStoreState = {
      updates: [],
      isChecking: false,
      lastChecked: null,
      installingTool: null,
      installStatus: null,
      checkUpdates: mockCheckUpdates,
      installUpdate: mockInstallUpdate,
      uninstallUpdate: mockUninstallUpdate,
      clearUpdates: vi.fn(),
      clearInstallStatus: mockClearInstallStatus,
    }

    appUpdateStoreState = {
      status: 'idle',
      version: null,
      downloadPercent: 0,
      checkForUpdate: mockCheckForUpdate,
      downloadUpdate: mockDownloadUpdate,
      installUpdate: mockInstallAppUpdate,
    }

    // Ensure window.kanbai.app.version is available
    const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    kanbai.app.version = vi.fn().mockResolvedValue({ version: '1.0.0', name: 'Kanbai' })
    kanbai.settings = {
      ...kanbai.settings,
      get: vi.fn().mockResolvedValue({ toolAutoCheckEnabled: false }),
    }
  })

  describe('rendu initial', () => {
    it('affiche le bouton de notification', () => {
      render(<UpdateCenter />)
      expect(screen.getByTitle('updates.updateCenterTooltip')).toBeInTheDocument()
    })

    it('appelle checkUpdates au montage', () => {
      render(<UpdateCenter />)
      expect(mockCheckUpdates).toHaveBeenCalled()
    })

    it('charge la version de l app au montage', async () => {
      const kanbai = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<UpdateCenter />)
      await waitFor(() => {
        expect(kanbai.app.version).toHaveBeenCalled()
      })
    })
  })

  describe('affichage du badge', () => {
    it('n affiche pas de badge quand il n y a pas de mises a jour', () => {
      render(<UpdateCenter />)
      const badge = document.querySelector('.update-trigger-count')
      expect(badge).not.toBeInTheDocument()
    })

    it('affiche le badge avec le nombre de mises a jour', () => {
      updateStoreState.updates = [
        { tool: 'node', scope: 'global', currentVersion: '18.0.0', latestVersion: '20.0.0', updateAvailable: true, installed: true },
        { tool: 'npm', scope: 'global', currentVersion: '9.0.0', latestVersion: '10.0.0', updateAvailable: true, installed: true },
      ]
      render(<UpdateCenter />)
      const badge = document.querySelector('.update-trigger-count')
      expect(badge).toBeInTheDocument()
      expect(badge?.textContent).toBe('2')
    })

    it('inclut les mises a jour de l app dans le compteur du badge', () => {
      appUpdateStoreState.status = 'available'
      updateStoreState.updates = [
        { tool: 'node', scope: 'global', currentVersion: '18.0.0', latestVersion: '20.0.0', updateAvailable: true, installed: true },
      ]
      render(<UpdateCenter />)
      const badge = document.querySelector('.update-trigger-count')
      expect(badge?.textContent).toBe('2')
    })
  })

  describe('ouverture du panneau', () => {
    it('affiche le panneau au clic sur le bouton', async () => {
      const user = userEvent.setup()
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText('updates.title')).toBeInTheDocument()
    })

    it('affiche le dernier check dans le footer', async () => {
      const user = userEvent.setup()
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText(/updates\.lastCheck/)).toBeInTheDocument()
    })

    it('ferme le panneau au second clic', async () => {
      const user = userEvent.setup()
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))
      expect(screen.getByText('updates.title')).toBeInTheDocument()

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))
      expect(screen.queryByText('updates.title')).not.toBeInTheDocument()
    })
  })

  describe('affichage des mises a jour', () => {
    it('affiche les outils avec leurs versions', async () => {
      const user = userEvent.setup()
      updateStoreState.updates = [
        { tool: 'node', scope: 'global', currentVersion: '18.0.0', latestVersion: '20.0.0', updateAvailable: true, installed: true },
      ]
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText('node')).toBeInTheDocument()
      expect(screen.getByText('20.0.0')).toBeInTheDocument()
      const nodeItem = screen.getByText('node').closest('.notification-item')
      expect(nodeItem?.textContent).toContain('18.0.0')
    })

    it('affiche le bouton de mise a jour pour les outils avec update disponible', async () => {
      const user = userEvent.setup()
      updateStoreState.updates = [
        { tool: 'node', scope: 'global', currentVersion: '18.0.0', latestVersion: '20.0.0', updateAvailable: true, installed: true },
      ]
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText('updates.update')).toBeInTheDocument()
    })

    it('affiche l entree Kanbai dans le panneau', async () => {
      const user = userEvent.setup()
      appUpdateStoreState.status = 'available'
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText('Kanbai')).toBeInTheDocument()
    })

    it('affiche le message tout est a jour quand pas de mise a jour', async () => {
      const user = userEvent.setup()
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText('updates.allUpToDate')).toBeInTheDocument()
    })
  })

  describe('installation', () => {
    it('appelle installUpdate au clic sur le bouton mettre a jour', async () => {
      const user = userEvent.setup()
      updateStoreState.updates = [
        { tool: 'node', scope: 'global', currentVersion: '18.0.0', latestVersion: '20.0.0', updateAvailable: true, installed: true },
      ]
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))
      await user.click(screen.getByText('updates.update'))

      expect(mockInstallUpdate).toHaveBeenCalledWith('node', 'global')
    })

    it('affiche le statut de succes apres installation', async () => {
      const user = userEvent.setup()
      updateStoreState.installStatus = { tool: 'node', success: true }
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText(/updates\.updated/)).toBeInTheDocument()
    })

    it('affiche le statut d erreur apres echec d installation', async () => {
      const user = userEvent.setup()
      updateStoreState.installStatus = { tool: 'node', success: false, error: 'Install failed' }
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))

      expect(screen.getByText(/updates\.failedUpdate/)).toBeInTheDocument()
    })
  })

  describe('bouton refresh', () => {
    it('appelle checkUpdates et checkForUpdate au clic sur refresh', async () => {
      const user = userEvent.setup()
      render(<UpdateCenter />)

      await user.click(screen.getByTitle('updates.updateCenterTooltip'))
      await user.click(screen.getByTitle('updates.checkTooltip'))

      expect(mockCheckUpdates).toHaveBeenCalledTimes(2) // Once on mount + once on click
      expect(mockCheckForUpdate).toHaveBeenCalled()
    })
  })
})
