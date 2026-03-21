import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.kanbai.companion API
const mockCompanionApi = {
  register: vi.fn(),
  cancel: vi.fn(),
  disconnect: vi.fn(),
  syncTickets: vi.fn(),
  onStatusChanged: vi.fn(),
  onTicketUpdated: vi.fn(),
}

vi.stubGlobal('window', {
  kanbai: {
    companion: mockCompanionApi,
  },
})

const { useCompanionStore, initCompanionListener, initCompanionTicketListener } = await import(
  '../../src/renderer/features/companion/companion-store'
)

describe('useCompanionStore', () => {
  beforeEach(() => {
    useCompanionStore.setState({
      status: 'disconnected',
      pairingCode: null,
      companionName: null,
      syncing: false,
    })
    vi.clearAllMocks()
  })

  describe('etat initial', () => {
    it('a un etat deconnecte par defaut', () => {
      const state = useCompanionStore.getState()
      expect(state.status).toBe('disconnected')
      expect(state.pairingCode).toBeNull()
      expect(state.companionName).toBeNull()
      expect(state.syncing).toBe(false)
    })
  })

  describe('setStatus', () => {
    it('met a jour le statut', () => {
      useCompanionStore.getState().setStatus('connected')
      expect(useCompanionStore.getState().status).toBe('connected')
    })

    it('accepte tous les statuts valides', () => {
      const statuses = ['disconnected', 'waiting', 'connected', 'lost', 'maintenance'] as const
      for (const status of statuses) {
        useCompanionStore.getState().setStatus(status)
        expect(useCompanionStore.getState().status).toBe(status)
      }
    })
  })

  describe('setPairingCode', () => {
    it('met a jour le code d appairage', () => {
      useCompanionStore.getState().setPairingCode('ABC123')
      expect(useCompanionStore.getState().pairingCode).toBe('ABC123')
    })

    it('accepte null pour reinitialiser', () => {
      useCompanionStore.getState().setPairingCode('ABC123')
      useCompanionStore.getState().setPairingCode(null)
      expect(useCompanionStore.getState().pairingCode).toBeNull()
    })
  })

  describe('setCompanionName', () => {
    it('met a jour le nom du companion', () => {
      useCompanionStore.getState().setCompanionName('iPhone de Mehdi')
      expect(useCompanionStore.getState().companionName).toBe('iPhone de Mehdi')
    })

    it('accepte null pour reinitialiser', () => {
      useCompanionStore.getState().setCompanionName('iPhone')
      useCompanionStore.getState().setCompanionName(null)
      expect(useCompanionStore.getState().companionName).toBeNull()
    })
  })

  describe('register', () => {
    it('definit le code et le statut waiting en cas de succes', async () => {
      mockCompanionApi.register.mockResolvedValue({ code: 'PAIR-456' })

      await useCompanionStore.getState().register('ws-1')

      const state = useCompanionStore.getState()
      expect(state.pairingCode).toBe('PAIR-456')
      expect(state.status).toBe('waiting')
      expect(mockCompanionApi.register).toHaveBeenCalledWith('ws-1')
    })

    it('definit le statut maintenance en cas d echec', async () => {
      mockCompanionApi.register.mockRejectedValue(new Error('Service indisponible'))

      await useCompanionStore.getState().register('ws-1')

      const state = useCompanionStore.getState()
      expect(state.pairingCode).toBeNull()
      expect(state.status).toBe('maintenance')
    })
  })

  describe('cancel', () => {
    it('appelle companion.cancel et reinitialise l etat', async () => {
      useCompanionStore.setState({
        status: 'waiting',
        pairingCode: 'CODE',
        companionName: 'Device',
      })
      mockCompanionApi.cancel.mockResolvedValue(undefined)

      await useCompanionStore.getState().cancel()

      const state = useCompanionStore.getState()
      expect(state.status).toBe('disconnected')
      expect(state.pairingCode).toBeNull()
      expect(state.companionName).toBeNull()
      expect(mockCompanionApi.cancel).toHaveBeenCalledOnce()
    })
  })

  describe('disconnect', () => {
    it('appelle companion.disconnect et reinitialise l etat', async () => {
      useCompanionStore.setState({
        status: 'connected',
        pairingCode: 'CODE',
        companionName: 'Device',
      })
      mockCompanionApi.disconnect.mockResolvedValue(undefined)

      await useCompanionStore.getState().disconnect()

      const state = useCompanionStore.getState()
      expect(state.status).toBe('disconnected')
      expect(state.pairingCode).toBeNull()
      expect(state.companionName).toBeNull()
      expect(mockCompanionApi.disconnect).toHaveBeenCalledOnce()
    })
  })

  describe('syncTickets', () => {
    it('definit syncing a true pendant la synchronisation', async () => {
      let resolveFn: () => void
      const pendingPromise = new Promise<void>((resolve) => { resolveFn = resolve })
      mockCompanionApi.syncTickets.mockReturnValue(pendingPromise)

      const syncPromise = useCompanionStore.getState().syncTickets('ws-1')
      expect(useCompanionStore.getState().syncing).toBe(true)

      resolveFn!()
      await syncPromise

      expect(useCompanionStore.getState().syncing).toBe(false)
    })

    it('appelle companion.syncTickets avec le workspaceId', async () => {
      mockCompanionApi.syncTickets.mockResolvedValue(undefined)

      await useCompanionStore.getState().syncTickets('ws-42')

      expect(mockCompanionApi.syncTickets).toHaveBeenCalledWith('ws-42')
    })

    it('remet syncing a false meme en cas d erreur', async () => {
      mockCompanionApi.syncTickets.mockRejectedValue(new Error('Erreur sync'))

      await useCompanionStore.getState().syncTickets('ws-1').catch(() => {})

      expect(useCompanionStore.getState().syncing).toBe(false)
    })
  })

  describe('initCompanionListener', () => {
    it('enregistre un listener via onStatusChanged', () => {
      const mockCleanup = vi.fn()
      mockCompanionApi.onStatusChanged.mockReturnValue(mockCleanup)

      const cleanup = initCompanionListener()

      expect(mockCompanionApi.onStatusChanged).toHaveBeenCalledOnce()
      expect(cleanup).toBe(mockCleanup)
    })

    it('met a jour le statut et le nom quand connected', () => {
      mockCompanionApi.onStatusChanged.mockImplementation((callback: (status: string, name?: string) => void) => {
        callback('connected', 'iPhone de Mehdi')
        return vi.fn()
      })

      initCompanionListener()

      const state = useCompanionStore.getState()
      expect(state.status).toBe('connected')
      expect(state.companionName).toBe('iPhone de Mehdi')
    })

    it('reinitialise le code et le nom quand disconnected', () => {
      useCompanionStore.setState({
        status: 'connected',
        pairingCode: 'CODE',
        companionName: 'Device',
      })

      mockCompanionApi.onStatusChanged.mockImplementation((callback: (status: string, name?: string) => void) => {
        callback('disconnected')
        return vi.fn()
      })

      initCompanionListener()

      const state = useCompanionStore.getState()
      expect(state.status).toBe('disconnected')
      expect(state.pairingCode).toBeNull()
      expect(state.companionName).toBeNull()
    })
  })

  describe('initCompanionTicketListener', () => {
    it('enregistre un listener via onTicketUpdated', () => {
      const mockCallback = vi.fn()
      const mockCleanup = vi.fn()
      mockCompanionApi.onTicketUpdated.mockReturnValue(mockCleanup)

      const cleanup = initCompanionTicketListener(mockCallback)

      expect(mockCompanionApi.onTicketUpdated).toHaveBeenCalledWith(mockCallback)
      expect(cleanup).toBe(mockCleanup)
    })
  })
})
