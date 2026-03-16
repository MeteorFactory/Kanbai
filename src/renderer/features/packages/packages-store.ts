import { create } from 'zustand'
import type {
  PackageInfo,
  PackageManagerType,
  ProjectPackageManager,
  PkgNlMessage,
} from '../../../shared/types'
import type { AiProviderId } from '../../../shared/types/ai-provider'

interface WorkspacePackagesData {
  managers: ProjectPackageManager[]
  packages: Record<string, PackageInfo[]>
  loading: Record<string, boolean>
  /** Packages currently being updated, keyed by "projectId:manager" */
  updatingPackages: Record<string, string[]>
  /** Whether "update all" is running, keyed by "projectId:manager" */
  updateAllLoading: Record<string, boolean>
  selectedProjectId: string | null
  selectedManager: PackageManagerType | null
  nlMessages: PkgNlMessage[]
  nlLoading: boolean
  nlAiProvider: AiProviderId
  searchQuery: string
}

const EMPTY_WORKSPACE_DATA: WorkspacePackagesData = {
  managers: [],
  packages: {},
  loading: {},
  updatingPackages: {},
  updateAllLoading: {},
  selectedProjectId: null,
  selectedManager: null,
  nlMessages: [],
  nlLoading: false,
  nlAiProvider: 'claude',
  searchQuery: '',
}

function snapshotWorkspaceData(state: PackagesState): WorkspacePackagesData {
  return {
    managers: state.managers,
    packages: state.packages,
    loading: state.loading,
    updatingPackages: state.updatingPackages,
    updateAllLoading: state.updateAllLoading,
    selectedProjectId: state.selectedProjectId,
    selectedManager: state.selectedManager,
    nlMessages: state.nlMessages,
    nlLoading: state.nlLoading,
    nlAiProvider: state.nlAiProvider,
    searchQuery: state.searchQuery,
  }
}

interface PackagesState {
  activeWorkspaceId: string | null
  /** Archived per-workspace state, saved on workspace switch */
  byWorkspace: Record<string, WorkspacePackagesData>
  /** Active workspace data (flat for direct consumption by components) */
  managers: ProjectPackageManager[]
  /** Packages indexed by "projectId:manager" composite key */
  packages: Record<string, PackageInfo[]>
  loading: Record<string, boolean>
  /** Packages currently being updated, keyed by "projectId:manager" */
  updatingPackages: Record<string, string[]>
  /** Whether "update all" is running, keyed by "projectId:manager" */
  updateAllLoading: Record<string, boolean>
  selectedProjectId: string | null
  selectedManager: PackageManagerType | null
  nlMessages: PkgNlMessage[]
  nlLoading: boolean
  nlAiProvider: AiProviderId
  searchQuery: string
}

interface PackagesActions {
  switchWorkspace: (workspaceId: string) => void
  detectManagers: (
    projects: Array<{ id: string; path: string; name: string }>,
  ) => Promise<void>
  loadPackages: (
    projectId: string,
    projectPath: string,
    manager: PackageManagerType,
  ) => Promise<void>
  setSelection: (
    projectId: string | null,
    manager: PackageManagerType | null,
  ) => void
  updatePackage: (
    projectPath: string,
    manager: PackageManagerType,
    packageName?: string,
  ) => Promise<{ success: boolean; error?: string }>
  addUpdatingPackage: (key: string, packageName: string) => void
  removeUpdatingPackage: (key: string, packageName: string) => void
  setUpdateAllLoading: (key: string, loading: boolean) => void
  addNlMessage: (message: PkgNlMessage) => void
  setNlLoading: (loading: boolean) => void
  clearNlMessages: () => void
  setNlAiProvider: (provider: AiProviderId) => void
  setSearchQuery: (query: string) => void
}

type PackagesStore = PackagesState & PackagesActions

export const usePackagesStore = create<PackagesStore>((set, get) => ({
  activeWorkspaceId: null,
  byWorkspace: {},
  managers: [],
  packages: {},
  loading: {},
  updatingPackages: {},
  updateAllLoading: {},
  selectedProjectId: null,
  selectedManager: null,
  nlMessages: [],
  nlLoading: false,
  nlAiProvider: 'claude',
  searchQuery: '',

  switchWorkspace: (workspaceId) => {
    const state = get()
    if (state.activeWorkspaceId === workspaceId) return

    // Archive current workspace state before switching
    const nextByWorkspace = { ...state.byWorkspace }
    if (state.activeWorkspaceId) {
      nextByWorkspace[state.activeWorkspaceId] = snapshotWorkspaceData(state)
    }

    // Restore target workspace state (or initialize with empty defaults)
    const restored = nextByWorkspace[workspaceId] ?? EMPTY_WORKSPACE_DATA

    set({
      activeWorkspaceId: workspaceId,
      byWorkspace: nextByWorkspace,
      ...restored,
    })
  },

  detectManagers: async (projects) => {
    try {
      const detected = await window.kanbai.packages.detect(projects)
      set({ managers: detected })
    } catch {
      set({ managers: [] })
    }
  },

  loadPackages: async (projectId, projectPath, manager) => {
    const key = `${projectId}:${manager}`
    set((state) => ({
      loading: { ...state.loading, [key]: true },
    }))
    try {
      const result = await window.kanbai.packages.list(projectPath, manager)
      set((state) => ({
        packages: { ...state.packages, [key]: result.packages },
        loading: { ...state.loading, [key]: false },
      }))
    } catch {
      set((state) => ({
        packages: { ...state.packages, [key]: [] },
        loading: { ...state.loading, [key]: false },
      }))
    }
  },

  setSelection: (projectId, manager) => {
    set({ selectedProjectId: projectId, selectedManager: manager })
  },

  updatePackage: async (projectPath, manager, packageName) => {
    try {
      const result = await window.kanbai.packages.update(
        projectPath,
        manager,
        packageName,
      )
      return result
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during update'
      return { success: false, error: message }
    }
  },

  addUpdatingPackage: (key, packageName) => {
    set((state) => {
      const current = state.updatingPackages[key] ?? []
      if (current.includes(packageName)) return state
      return {
        updatingPackages: {
          ...state.updatingPackages,
          [key]: [...current, packageName],
        },
      }
    })
  },

  removeUpdatingPackage: (key, packageName) => {
    set((state) => {
      const current = state.updatingPackages[key] ?? []
      return {
        updatingPackages: {
          ...state.updatingPackages,
          [key]: current.filter((name) => name !== packageName),
        },
      }
    })
  },

  setUpdateAllLoading: (key, loading) => {
    set((state) => ({
      updateAllLoading: { ...state.updateAllLoading, [key]: loading },
    }))
  },

  addNlMessage: (message) => {
    set((state) => ({
      nlMessages: [...state.nlMessages, message],
    }))
  },

  setNlLoading: (loading) => {
    set({ nlLoading: loading })
  },

  clearNlMessages: () => {
    set({ nlMessages: [] })
  },

  setNlAiProvider: (provider) => set({ nlAiProvider: provider }),

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },
}))
