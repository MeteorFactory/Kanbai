import { create } from 'zustand'
import { fr } from './fr'
import { en } from './en'
import type { Locale } from '../../../shared/types'

const translations = { fr, en } as const

type TranslationKeys = keyof typeof fr

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKeys | string, params?: Record<string, string | number>) => string
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: 'fr',
  setLocale: (locale) => {
    set({ locale })
    window.kanbai.settings.set({ locale })
  },
  t: (key, params?) => {
    const dict = translations[get().locale]
    let text = (dict as Record<string, string>)[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return text
  },
}))

export type { TranslationKeys }
