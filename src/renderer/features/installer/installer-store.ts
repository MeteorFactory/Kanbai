import { create } from 'zustand'
import type { PrerequisiteInfo, InstallerProgress, InstallerResult } from '../../../shared/types'

interface InstallerState {
  prerequisites: PrerequisiteInfo[]
  isChecking: boolean
  isInstalling: boolean
  currentStep: InstallerProgress | null
  result: InstallerResult | null
  dismissed: boolean
}

interface InstallerActions {
  checkPrerequisites: () => Promise<void>
  startCascadeInstall: () => Promise<void>
  dismiss: () => void
  initProgressListener: () => () => void
}

type InstallerStore = InstallerState & InstallerActions

export const useInstallerStore = create<InstallerStore>((set, get) => ({
  prerequisites: [],
  isChecking: false,
  isInstalling: false,
  currentStep: null,
  result: null,
  dismissed: false,

  checkPrerequisites: async () => {
    set({ isChecking: true })
    try {
      const prerequisites = await window.kanbai.installer.check()
      set({ prerequisites })
    } catch {
      // Non-critical — silently fail
    } finally {
      set({ isChecking: false })
    }
  },

  startCascadeInstall: async () => {
    set({ isInstalling: true, result: null, currentStep: null })
    try {
      const result = await window.kanbai.installer.cascade()
      set({ result, prerequisites: result.results, isInstalling: false })
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      set({
        result: { success: false, results: get().prerequisites, error },
        isInstalling: false,
      })
    }
  },

  dismiss: () => set({ dismissed: true }),

  initProgressListener: () => {
    const cleanup = window.kanbai.installer.onProgress((progress: InstallerProgress) => {
      set({ currentStep: progress })
      // Update the matching prerequisite in real-time
      const { prerequisites } = get()
      const updated = prerequisites.map((p) =>
        p.id === progress.currentStep
          ? { ...p, status: progress.status, error: progress.error }
          : p,
      )
      set({ prerequisites: updated })
    })
    return cleanup
  },
}))
