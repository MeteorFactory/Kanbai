import { create } from 'zustand'

export type CompanionStatus = 'disconnected' | 'waiting' | 'connected' | 'lost'

interface CompanionState {
  status: CompanionStatus
  pairingCode: string | null
}

interface CompanionActions {
  setStatus: (status: CompanionStatus) => void
  setPairingCode: (code: string | null) => void
  register: (workspaceId: string) => Promise<void>
  cancel: () => Promise<void>
}

type CompanionStore = CompanionState & CompanionActions

export const useCompanionStore = create<CompanionStore>((set) => ({
  status: 'disconnected',
  pairingCode: null,

  setStatus: (status) => set({ status }),
  setPairingCode: (code) => set({ pairingCode: code }),

  register: async (workspaceId: string) => {
    const result = await window.kanbai.companion.register(workspaceId)
    set({ pairingCode: result.code, status: 'waiting' })
  },

  cancel: async () => {
    await window.kanbai.companion.cancel()
    set({ pairingCode: null, status: 'disconnected' })
  },
}))

export function initCompanionListener(): () => void {
  return window.kanbai.companion.onStatusChanged((status: string) => {
    const validStatus = status as CompanionStatus
    useCompanionStore.getState().setStatus(validStatus)
    if (validStatus === 'disconnected') {
      useCompanionStore.getState().setPairingCode(null)
    }
  })
}
