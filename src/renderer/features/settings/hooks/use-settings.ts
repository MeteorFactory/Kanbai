import { useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { useI18n } from '../../../lib/i18n'

const IS_WIN_RENDERER = navigator.platform.startsWith('Win')

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  locale: 'fr',
  defaultShell: IS_WIN_RENDERER ? 'powershell.exe' : '/bin/zsh',
  fontSize: 13,
  fontFamily: 'SF Mono',
  scrollbackLines: 5000,
  claudeDetectionColor: '#D4A574',
  codexDetectionColor: '#10a37f',
  copilotDetectionColor: '#e2538a',
  geminiDetectionColor: '#4285F4',
  defaultAiProvider: 'claude',
  autoClauderEnabled: false,
  notificationSound: true,
  notificationBadge: true,
  checkUpdatesOnLaunch: true,
  toolAutoCheckEnabled: true,
  autoCloseCompletedTerminals: false,
  autoCloseCtoTerminals: true,
  autoApprove: true,
  tutorialCompleted: false,
  tutorialSeenSections: [],
  autoCreateAiMemoryRefactorTickets: true,
}

interface UseSettingsReturn {
  settings: AppSettings
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  loading: boolean
  appVersion: { version: string; name: string; isElevated?: boolean } | null
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  handleLocaleChange: (newLocale: 'fr' | 'en') => void
}

export function useSettings(): UseSettingsReturn {
  const { setLocale } = useI18n()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [appVersion, setAppVersion] = useState<{ version: string; name: string; isElevated?: boolean } | null>(null)

  useEffect(() => {
    setLoading(true)
    window.kanbai.settings.get().then((s: AppSettings) => {
      setSettings({ ...DEFAULT_SETTINGS, ...s })
      if (s.locale) {
        setLocale(s.locale)
      }
      setLoading(false)
    })
    window.kanbai.app.version().then(setAppVersion)
  }, [setLocale])

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    window.kanbai.settings.set({ [key]: value })

    if (key === 'theme') {
      const theme = value as string
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', theme)
      }
    }
  }, [])

  const handleLocaleChange = useCallback((newLocale: 'fr' | 'en') => {
    setLocale(newLocale)
    setSettings((prev) => ({ ...prev, locale: newLocale }))
    window.kanbai.settings.set({ locale: newLocale })
  }, [setLocale])

  return {
    settings,
    setSettings,
    loading,
    appVersion,
    updateSetting,
    handleLocaleChange,
  }
}
