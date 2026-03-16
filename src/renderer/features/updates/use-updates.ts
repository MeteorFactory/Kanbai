import { useUpdateStore } from './update-store'
import { useAppUpdateStore } from './app-update-store'

/**
 * Convenience hook for updates feature.
 * Combines tool updates and app updates state and actions.
 */
export function useUpdates() {
  const {
    updates,
    isChecking,
    lastChecked,
    installingTool,
    installStatus,
    checkUpdates,
    installUpdate,
    uninstallUpdate,
    clearUpdates,
    clearInstallStatus,
  } = useUpdateStore()

  const {
    status: appUpdateStatus,
    version: appUpdateVersion,
    releaseNotes: appReleaseNotes,
    downloadPercent,
    showModal,
    errorMessage,
    checkForUpdate,
    downloadUpdate,
    installUpdate: installAppUpdate,
    dismissModal,
    initListener,
  } = useAppUpdateStore()

  return {
    // Tool updates state
    updates,
    isChecking,
    lastChecked,
    installingTool,
    installStatus,

    // Tool updates actions
    checkUpdates,
    installUpdate,
    uninstallUpdate,
    clearUpdates,
    clearInstallStatus,

    // App update state
    appUpdateStatus,
    appUpdateVersion,
    appReleaseNotes,
    downloadPercent,
    showModal,
    errorMessage,

    // App update actions
    checkForUpdate,
    downloadUpdate,
    installAppUpdate,
    dismissModal,
    initListener,
  }
}
