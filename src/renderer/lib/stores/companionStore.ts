import { create } from 'zustand'
import type { KanbanTask } from '../../../shared/types'

export type CompanionStatus = 'disconnected' | 'waiting' | 'connected' | 'lost' | 'maintenance'

interface CompanionState {
  status: CompanionStatus
  pairingCode: string | null
  syncing: boolean
}

interface CompanionActions {
  setStatus: (status: CompanionStatus) => void
  setPairingCode: (code: string | null) => void
  register: (workspaceId: string) => Promise<void>
  cancel: () => Promise<void>
  syncTickets: (workspaceId: string) => Promise<void>
}

type CompanionStore = CompanionState & CompanionActions

export const useCompanionStore = create<CompanionStore>((set) => ({
  status: 'disconnected',
  pairingCode: null,
  syncing: false,

  setStatus: (status) => set({ status }),
  setPairingCode: (code) => set({ pairingCode: code }),

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
    set({ pairingCode: null, status: 'disconnected' })
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
  const cleanupStatus = window.kanbai.companion.onStatusChanged((status: string) => {
    const validStatus = status as CompanionStatus
    useCompanionStore.getState().setStatus(validStatus)
    if (validStatus === 'disconnected') {
      useCompanionStore.getState().setPairingCode(null)
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
