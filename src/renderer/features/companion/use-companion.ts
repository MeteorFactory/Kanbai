import { useCompanionStore } from './companion-store'

/**
 * Convenience hook for companion feature.
 * Returns commonly used companion state and actions.
 */
export function useCompanion() {
  const {
    status,
    pairingCode,
    companionName,
    syncing,
    register,
    cancel,
    disconnect,
    syncTickets,
  } = useCompanionStore()

  return {
    // State
    status,
    pairingCode,
    companionName,
    syncing,

    // Actions
    register,
    cancel,
    disconnect,
    syncTickets,
  }
}
