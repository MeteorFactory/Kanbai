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

const mockChecks = [
  {
    id: 'hc-1',
    name: 'API Production',
    url: 'https://api.example.com/health',
    method: 'GET' as const,
    expectedStatus: 200,
    notifyOnDown: true,
    headers: [] as Array<{ key: string; value: string; enabled: boolean }>,
    schedule: { enabled: true, interval: 30, unit: 'seconds' as const },
  },
  {
    id: 'hc-2',
    name: 'Staging Server',
    url: 'https://staging.example.com',
    method: 'HEAD' as const,
    expectedStatus: 200,
    notifyOnDown: false,
    headers: [{ key: 'Authorization', value: 'Bearer token', enabled: true }],
    schedule: { enabled: false, interval: 5, unit: 'minutes' as const },
  },
]

const mockHandleAddCheck = vi.fn()
const mockHandleDeleteCheck = vi.fn()
const mockHandleUpdateCheck = vi.fn()
const mockHandleRunSingleCheck = vi.fn()
const mockHandleRunAllChecks = vi.fn()
const mockHandleStartScheduler = vi.fn()
const mockHandleStopScheduler = vi.fn()
const mockHandleUpdateInterval = vi.fn()
const mockHandleClearHistory = vi.fn()
const mockHandleExport = vi.fn()
const mockHandleImport = vi.fn()
const mockSelectCheck = vi.fn()

let hookState = {
  activeWorkspace: { id: 'ws-1', name: 'My Workspace' } as { id: string; name: string } | undefined,
  loading: false,
  data: { version: 1, checks: mockChecks, history: [] as Array<unknown>, incidents: [] as Array<unknown> },
  statuses: {} as Record<string, { status: string; lastCheck?: number; nextCheck?: number }>,
  selectedCheckId: null as string | null,
  selectedCheck: null as typeof mockChecks[0] | null,
  selectedStatus: undefined as { status: string; lastCheck?: number; nextCheck?: number } | undefined,
  schedulerRunning: false,
  executingIds: new Set<string>(),
  checkHistory: [] as Array<unknown>,
  checkIncidents: [] as Array<unknown>,
  paginatedHistory: [] as Array<unknown>,
  historyPage: 0,
  historyPageCount: 0,
  selectCheck: mockSelectCheck,
  setHistoryPage: vi.fn(),
  handleAddCheck: mockHandleAddCheck,
  handleUpdateCheck: mockHandleUpdateCheck,
  handleDeleteCheck: mockHandleDeleteCheck,
  handleRunSingleCheck: mockHandleRunSingleCheck,
  handleRunAllChecks: mockHandleRunAllChecks,
  handleStartScheduler: mockHandleStartScheduler,
  handleStopScheduler: mockHandleStopScheduler,
  handleUpdateInterval: mockHandleUpdateInterval,
  handleQuickCheck: vi.fn(),
  handleClearHistory: mockHandleClearHistory,
  handleExport: mockHandleExport,
  handleImport: mockHandleImport,
  handleAddHeader: vi.fn(),
  handleUpdateHeader: vi.fn(),
  handleRemoveHeader: vi.fn(),
}

const defaultHookState = { ...hookState }

vi.mock('../../src/renderer/features/healthcheck/use-healthcheck', () => ({
  useHealthcheck: () => hookState,
}))

import { HealthCheckPanel } from '../../src/renderer/components/HealthCheckPanel'

describe('HealthCheckPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookState = {
      ...defaultHookState,
      data: { version: 1, checks: [...mockChecks], history: [], incidents: [] },
      executingIds: new Set<string>(),
    }
  })

  describe('rendu initial', () => {
    it('affiche le titre du panneau healthcheck', () => {
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.title')).toBeInTheDocument()
    })

    it('affiche le badge du scheduler a l etat arrete', () => {
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.schedulerStopped')).toBeInTheDocument()
    })

    it('affiche la liste des checks existants', () => {
      render(<HealthCheckPanel />)
      expect(screen.getByText('API Production')).toBeInTheDocument()
      expect(screen.getByText('Staging Server')).toBeInTheDocument()
    })

    it('affiche le message de selection quand aucun check n est selectionne', () => {
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.selectCheck')).toBeInTheDocument()
    })
  })

  describe('ajout de check', () => {
    it('affiche le bouton d ajout de check', () => {
      render(<HealthCheckPanel />)
      const addBtn = screen.getByTitle('healthcheck.addCheck')
      expect(addBtn).toBeInTheDocument()
    })

    it('appelle handleAddCheck au clic sur le bouton d ajout', async () => {
      const user = userEvent.setup()
      render(<HealthCheckPanel />)

      await user.click(screen.getByTitle('healthcheck.addCheck'))

      expect(mockHandleAddCheck).toHaveBeenCalled()
    })
  })

  describe('affichage de la liste des checks', () => {
    it('affiche les informations de methode pour chaque check', () => {
      render(<HealthCheckPanel />)
      // Each check shows its method in meta text
      expect(screen.getByText(/GET/)).toBeInTheDocument()
    })

    it('affiche un message vide quand il n y a pas de checks', () => {
      hookState = { ...defaultHookState, data: { version: 1, checks: [], history: [], incidents: [] }, executingIds: new Set<string>() }
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.empty')).toBeInTheDocument()
    })
  })

  describe('execution d un check', () => {
    it('affiche le bouton play pour chaque check', () => {
      render(<HealthCheckPanel />)
      const playButtons = screen.getAllByTitle('healthcheck.executeNow')
      expect(playButtons.length).toBe(2)
    })

    it('appelle handleRunSingleCheck au clic sur le bouton play', async () => {
      const user = userEvent.setup()
      render(<HealthCheckPanel />)

      const playButtons = screen.getAllByTitle('healthcheck.executeNow')
      await user.click(playButtons[0]!)

      expect(mockHandleRunSingleCheck).toHaveBeenCalledWith('hc-1')
    })
  })

  describe('gestion du scheduler', () => {
    it('affiche le bouton de demarrage du scheduler', () => {
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.startScheduler')).toBeInTheDocument()
    })

    it('affiche le bouton d arret quand le scheduler tourne', () => {
      hookState = { ...defaultHookState, schedulerRunning: true, data: { version: 1, checks: [...mockChecks], history: [], incidents: [] }, executingIds: new Set<string>() }
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.stopScheduler')).toBeInTheDocument()
      expect(screen.getByText('healthcheck.schedulerActive')).toBeInTheDocument()
    })

    it('appelle handleStartScheduler au clic sur le bouton demarrer', async () => {
      const user = userEvent.setup()
      render(<HealthCheckPanel />)

      await user.click(screen.getByText('healthcheck.startScheduler'))

      expect(mockHandleStartScheduler).toHaveBeenCalled()
    })

    it('appelle handleStopScheduler au clic sur le bouton arreter', async () => {
      hookState = { ...defaultHookState, schedulerRunning: true, data: { version: 1, checks: [...mockChecks], history: [], incidents: [] }, executingIds: new Set<string>() }
      const user = userEvent.setup()
      render(<HealthCheckPanel />)

      await user.click(screen.getByText('healthcheck.stopScheduler'))

      expect(mockHandleStopScheduler).toHaveBeenCalled()
    })
  })

  describe('detail d un check selectionne', () => {
    it('affiche le formulaire de configuration quand un check est selectionne', () => {
      hookState = {
        ...defaultHookState,
        selectedCheckId: 'hc-1',
        selectedCheck: mockChecks[0]!,
        selectedStatus: { status: 'unknown' },
        data: { version: 1, checks: [...mockChecks], history: [], incidents: [] },
        executingIds: new Set<string>(),
      }
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.config')).toBeInTheDocument()
      expect(screen.getByText('healthcheck.schedule')).toBeInTheDocument()
    })

    it('affiche l etat vide de l historique pour un check sans historique', () => {
      hookState = {
        ...defaultHookState,
        selectedCheckId: 'hc-1',
        selectedCheck: mockChecks[0]!,
        selectedStatus: { status: 'unknown' },
        checkHistory: [],
        checkIncidents: [],
        data: { version: 1, checks: [...mockChecks], history: [], incidents: [] },
        executingIds: new Set<string>(),
      }
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.historyEmpty')).toBeInTheDocument()
    })
  })

  describe('etat de chargement', () => {
    it('affiche le message de chargement quand loading est true', () => {
      hookState = { ...defaultHookState, loading: true, executingIds: new Set<string>() }
      render(<HealthCheckPanel />)
      expect(screen.getByText('common.loading')).toBeInTheDocument()
    })
  })

  describe('import et export', () => {
    it('affiche les boutons import et export', () => {
      render(<HealthCheckPanel />)
      expect(screen.getByText('healthcheck.importChecks')).toBeInTheDocument()
      expect(screen.getByText('healthcheck.exportChecks')).toBeInTheDocument()
    })
  })
})
