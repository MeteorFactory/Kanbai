import { useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '../../../shared/types'

/**
 * Convenience hook for loading and saving app settings.
 * Returns the current settings, a loading flag, and a save function.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.kanbai.settings
      .get()
      .then((s: AppSettings) => setSettings(s))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!settings) return
      const merged = { ...settings, ...patch }
      setSettings(merged)
      await window.kanbai.settings.set(merged)
    },
    [settings],
  )

  return { settings, loading, saveSettings }
}
