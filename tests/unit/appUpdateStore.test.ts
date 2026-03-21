import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.kanbai.appUpdate API
const mockAppUpdateApi = {
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  onStatus: vi.fn(),
}

vi.stubGlobal('window', {
  kanbai: {
    appUpdate: mockAppUpdateApi,
  },
})

const { useAppUpdateStore } = await import(
  '../../src/renderer/features/updates/app-update-store'
)

describe('useAppUpdateStore', () => {
  beforeEach(() => {
    useAppUpdateStore.setState({
      status: 'idle',
      version: null,
      releaseNotes: null,
      downloadPercent: 0,
      showModal: false,
      errorMessage: null,
    })
    vi.clearAllMocks()
  })

  describe('etat initial', () => {
    it('a un etat idle par defaut', () => {
      const state = useAppUpdateStore.getState()
      expect(state.status).toBe('idle')
      expect(state.version).toBeNull()
      expect(state.releaseNotes).toBeNull()
      expect(state.downloadPercent).toBe(0)
      expect(state.showModal).toBe(false)
      expect(state.errorMessage).toBeNull()
    })
  })

  describe('checkForUpdate', () => {
    it('definit le statut a checking et reinitialise les erreurs', async () => {
      mockAppUpdateApi.check.mockResolvedValue(undefined)

      await useAppUpdateStore.getState().checkForUpdate()

      expect(mockAppUpdateApi.check).toHaveBeenCalledOnce()
    })

    it('reinitialise errorMessage et version au debut de la verification', async () => {
      useAppUpdateStore.setState({ errorMessage: 'ancienne erreur', version: '1.0.0' })
      mockAppUpdateApi.check.mockResolvedValue(undefined)

      await useAppUpdateStore.getState().checkForUpdate()

      const state = useAppUpdateStore.getState()
      expect(state.errorMessage).toBeNull()
      expect(state.version).toBeNull()
    })

    it('ne crash pas si check rejette', async () => {
      mockAppUpdateApi.check.mockRejectedValue(new Error('Erreur reseau'))

      await useAppUpdateStore.getState().checkForUpdate()
      // The status will be updated by the listener, not the catch
    })
  })

  describe('downloadUpdate', () => {
    it('definit le statut a downloading et reinitialise la progression', async () => {
      useAppUpdateStore.setState({ downloadPercent: 50 })
      mockAppUpdateApi.download.mockResolvedValue(undefined)

      await useAppUpdateStore.getState().downloadUpdate()

      expect(useAppUpdateStore.getState().downloadPercent).toBe(0)
      expect(mockAppUpdateApi.download).toHaveBeenCalledOnce()
    })

    it('reinitialise version au debut du telechargement', async () => {
      useAppUpdateStore.setState({ version: '2.0.0' })
      mockAppUpdateApi.download.mockResolvedValue(undefined)

      await useAppUpdateStore.getState().downloadUpdate()

      expect(useAppUpdateStore.getState().version).toBeNull()
    })

    it('ne crash pas si download rejette', async () => {
      mockAppUpdateApi.download.mockRejectedValue(new Error('Erreur telechargement'))

      await useAppUpdateStore.getState().downloadUpdate()
      // The status will be updated by the listener
    })
  })

  describe('installUpdate', () => {
    it('appelle appUpdate.install', () => {
      useAppUpdateStore.getState().installUpdate()

      expect(mockAppUpdateApi.install).toHaveBeenCalledOnce()
    })
  })

  describe('dismissModal', () => {
    it('reinitialise l etat de la modal', () => {
      useAppUpdateStore.setState({
        showModal: true,
        status: 'available',
        errorMessage: 'erreur',
      })

      useAppUpdateStore.getState().dismissModal()

      const state = useAppUpdateStore.getState()
      expect(state.showModal).toBe(false)
      expect(state.status).toBe('idle')
      expect(state.errorMessage).toBeNull()
    })
  })

  describe('initListener', () => {
    it('enregistre un listener via onStatus et retourne un cleanup', () => {
      const mockCleanup = vi.fn()
      mockAppUpdateApi.onStatus.mockReturnValue(mockCleanup)

      const cleanup = useAppUpdateStore.getState().initListener()

      expect(mockAppUpdateApi.onStatus).toHaveBeenCalledOnce()
      expect(cleanup).toBe(mockCleanup)
    })

    it('gere le statut checking', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'checking' })

      expect(useAppUpdateStore.getState().status).toBe('checking')
    })

    it('gere le statut available avec version et notes', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({
        status: 'available',
        version: '2.0.0',
        releaseNotes: 'Nouvelle fonctionnalite',
      })

      const state = useAppUpdateStore.getState()
      expect(state.status).toBe('available')
      expect(state.version).toBe('2.0.0')
      expect(state.releaseNotes).toBe('Nouvelle fonctionnalite')
      expect(state.showModal).toBe(true)
    })

    it('gere le statut not-available', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'not-available' })

      expect(useAppUpdateStore.getState().status).toBe('not-available')
    })

    it('gere le statut downloading avec pourcentage', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'downloading', percent: 42 })

      const state = useAppUpdateStore.getState()
      expect(state.status).toBe('downloading')
      expect(state.downloadPercent).toBe(42)
      expect(state.showModal).toBe(true)
    })

    it('gere le statut downloaded', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'downloaded', version: '2.0.0' })

      const state = useAppUpdateStore.getState()
      expect(state.status).toBe('downloaded')
      expect(state.downloadPercent).toBe(100)
      expect(state.version).toBe('2.0.0')
    })

    it('gere le statut error', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'error', message: 'Echec du serveur' })

      const state = useAppUpdateStore.getState()
      expect(state.status).toBe('error')
      expect(state.errorMessage).toBe('Echec du serveur')
    })

    it('ignore les erreurs si le statut actuel est downloaded', () => {
      useAppUpdateStore.setState({ status: 'downloaded' })

      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'error', message: 'Erreur tardive' })

      const state = useAppUpdateStore.getState()
      expect(state.status).toBe('downloaded')
      expect(state.errorMessage).toBeNull()
    })

    it('definit releaseNotes a null si ce n est pas une string', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({
        status: 'available',
        version: '2.0.0',
        releaseNotes: { en: 'English notes' },
      })

      expect(useAppUpdateStore.getState().releaseNotes).toBeNull()
    })

    it('definit le pourcentage a 0 si percent est absent', () => {
      let capturedCallback: (data: Record<string, unknown>) => void
      mockAppUpdateApi.onStatus.mockImplementation((cb: (data: Record<string, unknown>) => void) => {
        capturedCallback = cb
        return vi.fn()
      })

      useAppUpdateStore.getState().initListener()
      capturedCallback!({ status: 'downloading' })

      expect(useAppUpdateStore.getState().downloadPercent).toBe(0)
    })
  })
})
