import { create } from 'zustand'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  createdAt: number
  read: boolean
  autoDismissMs: number
  workspaceId?: string
  tabId?: string
}

interface NotificationState {
  notifications: AppNotification[]
  toasts: AppNotification[]
}

interface NotificationMeta {
  workspaceId?: string
  tabId?: string
}

interface NotificationActions {
  addNotification: (type: NotificationType, title: string, body: string, autoDismissMs?: number, meta?: NotificationMeta) => void
  dismissToast: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
  removeByTabId: (tabId: string) => void
}

type NotificationStore = NotificationState & NotificationActions

const MAX_NOTIFICATIONS = 50
const MAX_TOASTS = 3
const DEFAULT_DISMISS_MS = 5000

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  toasts: [],

  addNotification: (type, title, body, autoDismissMs = DEFAULT_DISMISS_MS, meta?) => {
    const id = crypto.randomUUID()
    const notification: AppNotification = {
      id,
      type,
      title,
      body,
      createdAt: Date.now(),
      read: false,
      autoDismissMs,
      workspaceId: meta?.workspaceId,
      tabId: meta?.tabId,
    }

    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
      toasts: [notification, ...state.toasts].slice(0, MAX_TOASTS),
    }))

    // Auto-dismiss toast
    setTimeout(() => {
      get().dismissToast(id)
    }, autoDismissMs)
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }))
  },

  clearAll: () => {
    set({ notifications: [], toasts: [] })
  },

  removeByTabId: (tabId: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.tabId !== tabId),
      toasts: state.toasts.filter((n) => n.tabId !== tabId),
    }))
  },
}))

/** Standalone helper — callable from other stores without circular deps */
export function pushNotification(type: NotificationType, title: string, body: string, meta?: NotificationMeta) {
  useNotificationStore.getState().addNotification(type, title, body, undefined, meta)
}
