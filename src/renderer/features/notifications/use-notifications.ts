import { useCallback } from 'react'
import { useNotificationStore, type NotificationType, type NotificationMeta } from './notification-store'

export function useNotifications() {
  const notifications = useNotificationStore((s) => s.notifications)
  const toasts = useNotificationStore((s) => s.toasts)
  const addNotification = useNotificationStore((s) => s.addNotification)
  const dismissToast = useNotificationStore((s) => s.dismissToast)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const removeByTabId = useNotificationStore((s) => s.removeByTabId)

  const unreadCount = notifications.filter((n) => !n.read).length

  const notify = useCallback(
    (type: NotificationType, title: string, body: string, meta?: NotificationMeta) => {
      addNotification(type, title, body, undefined, meta)
    },
    [addNotification],
  )

  return {
    notifications,
    toasts,
    unreadCount,
    notify,
    addNotification,
    dismissToast,
    markAllRead,
    clearAll,
    removeByTabId,
  }
}
