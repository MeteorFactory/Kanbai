import { create } from 'zustand'

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

interface AppUpdateState {
  status: AppUpdateStatus
  version: string | null
  releaseNotes: string | null
  downloadPercent: number
  showModal: boolean
  errorMessage: string | null
}

interface AppUpdateActions {
  checkForUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  dismissModal: () => void
  initListener: () => () => void
}

type AppUpdateStore = AppUpdateState & AppUpdateActions

export const useAppUpdateStore = create<AppUpdateStore>((set) => ({
  status: 'idle',
  version: null,
  releaseNotes: null,
  downloadPercent: 0,
  showModal: false,
  errorMessage: null,

  checkForUpdate: async () => {
    set({ status: 'checking', errorMessage: null, version: null })
    try {
      await window.kanbai.appUpdate.check()
    } catch {
      // Status will be updated via the listener
    }
  },

  downloadUpdate: async () => {
    set({ status: 'downloading', downloadPercent: 0, version: null })
    try {
      await window.kanbai.appUpdate.download()
    } catch {
      // Status will be updated via the listener
    }
  },

  installUpdate: () => {
    window.kanbai.appUpdate.install()
  },

  dismissModal: () => {
    set({
      showModal: false,
      status: 'idle',
      errorMessage: null,
    })
  },

  initListener: () => {
    return window.kanbai.appUpdate.onStatus((data) => {
      switch (data.status) {
        case 'checking':
          set({ status: 'checking' })
          break
        case 'available':
          set({
            status: 'available',
            version: data.version ?? null,
            releaseNotes: typeof data.releaseNotes === 'string' ? data.releaseNotes : null,
            showModal: true,
          })
          break
        case 'not-available':
          set({ status: 'not-available' })
          break
        case 'downloading':
          set({ status: 'downloading', downloadPercent: data.percent ?? 0, showModal: true })
          break
        case 'downloaded':
          set({ status: 'downloaded', downloadPercent: 100, version: data.version ?? null })
          break
        case 'error': {
          const current = useAppUpdateStore.getState()
          if (current.status === 'downloaded') break
          set({ status: 'error', errorMessage: data.message ?? null })
          break
        }
      }
    })
  },
}))
