import { create } from 'zustand'
import type { UpdateInfo } from '../../../shared/types/index'

interface InstallStatus {
  tool: string
  success: boolean
  error?: string
}

interface UpdateActionResult {
  success: boolean
  error?: string
}

function ensureSuccessfulUpdate(result: UpdateActionResult, fallback: string): void {
  if (result.success) return
  throw new Error(result.error || fallback)
}

function findToolUpdate(
  updates: UpdateInfo[],
  tool: string,
  scope: UpdateInfo['scope'],
  projectId?: string,
): UpdateInfo | undefined {
  return updates.find((u) => {
    if (u.tool !== tool || u.scope !== scope) return false
    if (scope !== 'project') return true
    return u.projectId === projectId
  })
}

interface UpdateState {
  updates: UpdateInfo[]
  isChecking: boolean
  lastChecked: number | null
  installingTool: string | null
  installStatus: InstallStatus | null
}

interface UpdateActions {
  checkUpdates: () => Promise<void>
  installUpdate: (tool: string, scope: UpdateInfo['scope'], projectId?: string) => Promise<void>
  uninstallUpdate: (tool: string) => Promise<void>
  clearUpdates: () => void
  clearInstallStatus: () => void
}

type UpdateStore = UpdateState & UpdateActions

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  updates: [],
  isChecking: false,
  lastChecked: null,
  installingTool: null,
  installStatus: null,

  checkUpdates: async () => {
    set({ isChecking: true })
    try {
      const updates: UpdateInfo[] = await window.kanbai.updates.check()
      set({ updates, lastChecked: Date.now() })
    } catch {
      // Silently fail — update check is not critical
    } finally {
      set({ isChecking: false })
    }
  },

  installUpdate: async (tool: string, scope: UpdateInfo['scope'], projectId?: string) => {
    set({ installingTool: tool, installStatus: null })
    try {
      const currentTool = findToolUpdate(get().updates, tool, scope, projectId)
      const result = await window.kanbai.updates.install(tool, scope, projectId, currentTool?.installSource)
      ensureSuccessfulUpdate(result, 'Unknown error during update')

      // Re-check immediately and verify that the tool is still installed.
      const refreshedUpdates: UpdateInfo[] = await window.kanbai.updates.check()
      set({ updates: refreshedUpdates, lastChecked: Date.now() })

      const updatedTool = findToolUpdate(refreshedUpdates, tool, scope, projectId)
      if (!updatedTool) {
        throw new Error(`Unable to verify ${tool} status after update`)
      }
      if (!updatedTool.installed) {
        throw new Error(`${tool} is no longer detected after update`)
      }

      set({ installStatus: { tool, success: true } })
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      set({ installStatus: { tool, success: false, error } })
    } finally {
      set({ installingTool: null })
    }
  },

  uninstallUpdate: async (tool: string) => {
    set({ installingTool: tool, installStatus: null })
    try {
      const result = await window.kanbai.updates.uninstall(tool)
      ensureSuccessfulUpdate(result, 'Unknown error during uninstall')

      // Re-check and verify uninstall really happened.
      const refreshedUpdates: UpdateInfo[] = await window.kanbai.updates.check()
      set({ updates: refreshedUpdates, lastChecked: Date.now() })

      const updatedTool = refreshedUpdates.find((u) => u.tool === tool)
      if (!updatedTool) {
        throw new Error(`Unable to verify ${tool} status after uninstall`)
      }
      if (updatedTool.installed) {
        throw new Error(`${tool} still appears installed after uninstall`)
      }

      set({ installStatus: { tool, success: true } })
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      set({ installStatus: { tool, success: false, error } })
    } finally {
      set({ installingTool: null })
    }
  },

  clearUpdates: () => set({ updates: [] }),
  clearInstallStatus: () => set({ installStatus: null }),
}))
