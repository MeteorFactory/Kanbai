import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock crypto.randomUUID
let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    uuidCounter += 1
    return `test-uuid-${uuidCounter}`
  }),
})

// Mock window.kanbai (notification store does not use it, but keep consistent pattern)
vi.stubGlobal('window', { kanbai: {} })

const { useNotificationStore, pushNotification } = await import(
  '../../src/renderer/features/notifications/notification-store'
)

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      toasts: [],
    })
    vi.clearAllMocks()
    vi.useFakeTimers()
    uuidCounter = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useNotificationStore.getState()
      expect(state.notifications).toEqual([])
      expect(state.toasts).toEqual([])
    })
  })

  describe('addNotification', () => {
    it('cree une notification avec les champs corrects', () => {
      useNotificationStore.getState().addNotification('info', 'Titre', 'Corps du message')

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(1)
      expect(state.notifications[0]).toMatchObject({
        id: 'test-uuid-1',
        type: 'info',
        title: 'Titre',
        body: 'Corps du message',
        read: false,
        autoDismissMs: 5000,
      })
    })

    it('ajoute la notification aux toasts egalement', () => {
      useNotificationStore.getState().addNotification('success', 'OK', 'Tout va bien')

      const state = useNotificationStore.getState()
      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0]!.id).toBe('test-uuid-1')
    })

    it('utilise le autoDismissMs personnalise', () => {
      useNotificationStore.getState().addNotification('warning', 'Attention', 'Message', 10000)

      const state = useNotificationStore.getState()
      expect(state.notifications[0]!.autoDismissMs).toBe(10000)
    })

    it('inclut les metadonnees workspaceId et tabId', () => {
      useNotificationStore
        .getState()
        .addNotification('error', 'Erreur', 'Echec', undefined, {
          workspaceId: 'ws-1',
          tabId: 'tab-1',
        })

      const notification = useNotificationStore.getState().notifications[0]!
      expect(notification.workspaceId).toBe('ws-1')
      expect(notification.tabId).toBe('tab-1')
    })

    it('limite les notifications a MAX 50', () => {
      for (let i = 0; i < 55; i++) {
        useNotificationStore.getState().addNotification('info', `N-${i}`, `Body ${i}`)
      }

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(50)
    })

    it('limite les toasts a MAX 3', () => {
      for (let i = 0; i < 5; i++) {
        useNotificationStore.getState().addNotification('info', `T-${i}`, `Body ${i}`)
      }

      const state = useNotificationStore.getState()
      expect(state.toasts).toHaveLength(3)
    })

    it('ajoute les nouvelles notifications en premier (plus recentes en tete)', () => {
      useNotificationStore.getState().addNotification('info', 'Premier', 'Body 1')
      useNotificationStore.getState().addNotification('info', 'Deuxieme', 'Body 2')

      const state = useNotificationStore.getState()
      expect(state.notifications[0]!.title).toBe('Deuxieme')
      expect(state.notifications[1]!.title).toBe('Premier')
    })

    it('auto-dismiss le toast apres le delai', () => {
      useNotificationStore.getState().addNotification('info', 'Auto', 'Body', 3000)

      expect(useNotificationStore.getState().toasts).toHaveLength(1)

      vi.advanceTimersByTime(3000)

      expect(useNotificationStore.getState().toasts).toHaveLength(0)
      // La notification reste dans la liste des notifications
      expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })
  })

  describe('dismissToast', () => {
    it('supprime le toast mais pas la notification', () => {
      useNotificationStore.getState().addNotification('info', 'Test', 'Body')
      const id = useNotificationStore.getState().toasts[0]!.id

      useNotificationStore.getState().dismissToast(id)

      expect(useNotificationStore.getState().toasts).toHaveLength(0)
      expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    it('ne fait rien si l id n existe pas', () => {
      useNotificationStore.getState().addNotification('info', 'Test', 'Body')

      useNotificationStore.getState().dismissToast('id-inexistant')

      expect(useNotificationStore.getState().toasts).toHaveLength(1)
    })
  })

  describe('markAllRead', () => {
    it('marque toutes les notifications comme lues', () => {
      useNotificationStore.getState().addNotification('info', 'N1', 'Body')
      useNotificationStore.getState().addNotification('info', 'N2', 'Body')

      useNotificationStore.getState().markAllRead()

      const state = useNotificationStore.getState()
      expect(state.notifications.every((n) => n.read === true)).toBe(true)
    })

    it('ne crash pas si aucune notification', () => {
      useNotificationStore.getState().markAllRead()

      expect(useNotificationStore.getState().notifications).toEqual([])
    })
  })

  describe('clearAll', () => {
    it('vide les notifications et les toasts', () => {
      useNotificationStore.getState().addNotification('info', 'N1', 'Body')
      useNotificationStore.getState().addNotification('error', 'N2', 'Body')

      useNotificationStore.getState().clearAll()

      const state = useNotificationStore.getState()
      expect(state.notifications).toEqual([])
      expect(state.toasts).toEqual([])
    })
  })

  describe('removeByTabId', () => {
    it('supprime les notifications avec le tabId correspondant', () => {
      useNotificationStore
        .getState()
        .addNotification('info', 'Tab1', 'Body', undefined, { tabId: 'tab-1' })
      useNotificationStore
        .getState()
        .addNotification('info', 'Tab2', 'Body', undefined, { tabId: 'tab-2' })

      useNotificationStore.getState().removeByTabId('tab-1')

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(1)
      expect(state.notifications[0]!.tabId).toBe('tab-2')
    })

    it('supprime aussi les toasts avec le tabId correspondant', () => {
      useNotificationStore
        .getState()
        .addNotification('info', 'Tab1', 'Body', undefined, { tabId: 'tab-1' })

      useNotificationStore.getState().removeByTabId('tab-1')

      expect(useNotificationStore.getState().toasts).toHaveLength(0)
    })

    it('ne supprime pas les notifications sans tabId', () => {
      useNotificationStore.getState().addNotification('info', 'Sans tab', 'Body')
      useNotificationStore
        .getState()
        .addNotification('info', 'Avec tab', 'Body', undefined, { tabId: 'tab-1' })

      useNotificationStore.getState().removeByTabId('tab-1')

      expect(useNotificationStore.getState().notifications).toHaveLength(1)
      expect(useNotificationStore.getState().notifications[0]!.title).toBe('Sans tab')
    })
  })

  describe('pushNotification', () => {
    it('ajoute une notification via le helper standalone', () => {
      pushNotification('success', 'Helper', 'Via pushNotification')

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(1)
      expect(state.notifications[0]!.type).toBe('success')
      expect(state.notifications[0]!.title).toBe('Helper')
    })

    it('accepte des metadonnees optionnelles', () => {
      pushNotification('error', 'Erreur', 'Message', { workspaceId: 'ws-2' })

      const notification = useNotificationStore.getState().notifications[0]!
      expect(notification.workspaceId).toBe('ws-2')
    })
  })
})
