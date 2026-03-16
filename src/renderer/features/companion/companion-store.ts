import { create } from 'zustand'
import type { KanbanTask } from '../../../shared/types'

export type CompanionStatus = 'disconnected' | 'waiting' | 'connected' | 'lost' | 'maintenance'

interface CompanionState {
  status: CompanionStatus
  pairingCode: string | null
  companionName: string | null
  syncing: boolean
}

interface CompanionActions {
  setStatus: (status: CompanionStatus) => void
  setPairingCode: (code: string | null) => void
  setCompanionName: (name: string | null) => void
  register: (workspaceId: string) => Promise<void>
  cancel: () => Promise<void>
  disconnect: () => Promise<void>
  syncTickets: (workspaceId: string) => Promise<void>
}

type CompanionStore = CompanionState & CompanionActions

export const useCompanionStore = create<CompanionStore>((set) => ({
  status: 'disconnected',
  pairingCode: null,
  companionName: null,
  syncing: false,

  setStatus: (status) => set({ status }),
  setPairingCode: (code) => set({ pairingCode: code }),
  setCompanionName: (name) => set({ companionName: name }),

  register: async (workspaceId: string) => {
    try {
      const result = await window.kanbai.companion.register(workspaceId)
      set({ pairingCode: result.code, status: 'waiting' })
    } catch {
      set({ pairingCode: null, status: 'maintenance' })
    }
  },

  cancel: async () => {
    await window.kanbai.companion.cancel()
    set({ pairingCode: null, status: 'disconnected', companionName: null })
  },

  disconnect: async () => {
    await window.kanbai.companion.disconnect()
    set({ pairingCode: null, status: 'disconnected', companionName: null })
  },

  syncTickets: async (workspaceId: string) => {
    set({ syncing: true })
    try {
      await window.kanbai.companion.syncTickets(workspaceId)
    } finally {
      set({ syncing: false })
    }
  },
}))

export function initCompanionListener(): () => void {
  const cleanupStatus = window.kanbai.companion.onStatusChanged((status: string, companionName?: string) => {
    const validStatus = status as CompanionStatus
    const store = useCompanionStore.getState()
    store.setStatus(validStatus)
    if (validStatus === 'connected' && companionName) {
      store.setCompanionName(companionName)
    }
    if (validStatus === 'disconnected') {
      store.setPairingCode(null)
      store.setCompanionName(null)
    }
  })

  return cleanupStatus
}

/** Listen for ticket updates coming from the companion app */
export function initCompanionTicketListener(
  onTicketUpdated: (task: KanbanTask) => void,
): () => void {
  return window.kanbai.companion.onTicketUpdated(onTicketUpdated)
}
