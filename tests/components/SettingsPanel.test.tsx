import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock i18n
const mockSetLocale = vi.fn()
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: mockSetLocale,
  }),
}))

// Mock appUpdateStore
vi.mock('../../src/renderer/lib/stores/appUpdateStore', () => ({
  useAppUpdateStore: () => ({
    status: 'idle',
    checkForUpdate: vi.fn(),
  }),
}))

import { SettingsPanel } from '../../src/renderer/components/SettingsPanel'

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mocks on window.kanbai for this test suite
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    mirehub.settings.get.mockResolvedValue({
      theme: 'dark',
      locale: 'fr',
      defaultShell: '/bin/zsh',
      fontSize: 13,
      fontFamily: 'Menlo',
      scrollbackLines: 5000,
      claudeDetectionColor: '#7c3aed',
      autoClauderEnabled: false,
      notificationSound: true,
      notificationBadge: true,
      checkUpdatesOnLaunch: true,
      autoCloseCompletedTerminals: false,
      autoCloseCtoTerminals: true,
      autoApprove: true,
      tutorialCompleted: false,
      tutorialSeenSections: [],
    })
    mirehub.settings.set.mockResolvedValue(undefined)
    mirehub.app.version.mockResolvedValue({ version: '0.1.0', name: 'Mirehub' })
    mirehub.ssh.listKeys.mockResolvedValue({ success: true, keys: [] })
    mirehub.namespace.list.mockResolvedValue([
      { id: 'ns-1', name: 'Default', isDefault: true },
    ])
    mirehub.gitConfig.get.mockResolvedValue({ userName: 'John', userEmail: 'john@test.com', isCustom: false })
  })

  describe('rendu initial', () => {
    it('affiche le chargement pendant le fetch des settings', () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      mirehub.settings.get.mockReturnValue(new Promise(() => {}))
      render(<SettingsPanel />)
      expect(screen.getByText('common.loading')).toBeInTheDocument()
    })

    it('affiche le panneau apres chargement', async () => {
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(screen.getByText('settings.title')).toBeInTheDocument()
      })
    })

    it('affiche toutes les sections de navigation', async () => {
      render(<SettingsPanel />)

      await waitFor(() => {
        // "general" appears in nav + content header, so use getAllByText
        expect(screen.getAllByText('settings.general').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.appearance').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.tabs').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.terminal').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.kanban').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.git').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.ssh').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.ai').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.tools').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.notifications').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('settings.about').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('charge les settings depuis l API au montage', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(mirehub.settings.get).toHaveBeenCalled()
      })
    })

    it('charge la version de l app au montage', async () => {
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(mirehub.app.version).toHaveBeenCalled()
      })
    })
  })

  describe('navigation entre sections', () => {
    it('affiche la section generale par defaut', async () => {
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(screen.getByText('settings.language')).toBeInTheDocument()
      })
    })

    it('change de section au clic sur un item de nav', async () => {
      const user = userEvent.setup()
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(screen.getByText('settings.title')).toBeInTheDocument()
      })

      // Click on "appearance" nav item
      const appearanceButtons = screen.getAllByText('settings.appearance')
      await user.click(appearanceButtons[0]!)

      await waitFor(() => {
        expect(screen.getByText('settings.theme')).toBeInTheDocument()
      })
    })

    it('met en surbrillance la section active', async () => {
      const user = userEvent.setup()
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(screen.getByText('settings.title')).toBeInTheDocument()
      })

      const terminalButtons = screen.getAllByText('settings.terminal')
      await user.click(terminalButtons[0]!)

      await waitFor(() => {
        const activeItem = document.querySelector('.settings-nav-item--active')
        expect(activeItem?.textContent).toContain('settings.terminal')
      })
    })
  })

  describe('chargement des donnees', () => {
    it('charge les namespaces pour la section git', async () => {
      const user = userEvent.setup()
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(screen.getByText('settings.title')).toBeInTheDocument()
      })

      // Navigate to git section to trigger namespace loading
      const gitButtons = screen.getAllByText('settings.git')
      await user.click(gitButtons[0]!)

      await waitFor(() => {
        expect(mirehub.namespace.list).toHaveBeenCalled()
      })
    })

    it('charge les cles SSH quand la section SSH est active', async () => {
      const user = userEvent.setup()
      const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
      render(<SettingsPanel />)

      await waitFor(() => {
        expect(screen.getByText('settings.title')).toBeInTheDocument()
      })

      // Navigate to SSH section to trigger key loading
      const sshButtons = screen.getAllByText('settings.ssh')
      await user.click(sshButtons[0]!)

      await waitFor(() => {
        expect(mirehub.ssh.listKeys).toHaveBeenCalled()
      })
    })
  })
})
