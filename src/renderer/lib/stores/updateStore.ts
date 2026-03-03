import { create } from 'zustand'
import type { UpdateInfo } from '../../../shared/types/index'

interface InstallStatus {
  tool: string
  success: boolean
  error?: string
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
  installUpdate: (tool: string, scope: string, projectId?: string) => Promise<void>
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

  installUpdate: async (tool: string, scope: string, projectId?: string) => {
    set({ installingTool: tool, installStatus: null })
    try {
      await window.kanbai.updates.install(tool, scope, projectId)
      set({ installStatus: { tool, success: true } })
      // Re-check after install
      await get().checkUpdates()
    } catch (err) {
      set({ installStatus: { tool, success: false, error: String(err) } })
    } finally {
      set({ installingTool: null })
    }
  },

  uninstallUpdate: async (tool: string) => {
    set({ installingTool: tool, installStatus: null })
    try {
      await window.kanbai.updates.uninstall(tool)
      set({ installStatus: { tool, success: true } })
      await get().checkUpdates()
    } catch (err) {
      set({ installStatus: { tool, success: false, error: String(err) } })
    } finally {
      set({ installingTool: null })
    }
  },

  clearUpdates: () => set({ updates: [] }),
  clearInstallStatus: () => set({ installStatus: null }),
}))
