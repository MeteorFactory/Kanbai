import { create } from 'zustand'
import type {
  DbConnection,
  DbConnectionStatus,
  DbFile,
  DbBackupLogEntry,
  DbNlMessage,
} from '../../../shared/types'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import { useDatabaseTabStore } from './databaseTabStore'

interface DatabaseState {
  /** Connections indexed by workspaceId */
  connectionsByWorkspace: Record<string, DbConnection[]>
  activeConnectionId: string | null
  connectionStatuses: Record<string, DbConnectionStatus>
  /** Track which workspaces have been loaded */
  loadedWorkspaces: Record<string, boolean>
  loading: boolean
  backupLogs: DbBackupLogEntry[]
  /** NL chat messages indexed by connectionId */
  nlMessages: Record<string, DbNlMessage[]>
  /** NL query loading state per connectionId */
  nlLoading: Record<string, boolean>
  nlAiProvider: AiProviderId
}

interface DatabaseActions {
  loadConnections: (workspaceId: string) => Promise<void>
  getConnectionsForWorkspace: (workspaceId: string) => DbConnection[]
  saveConnections: (workspaceId: string) => void
  addConnection: (conn: DbConnection) => void
  updateConnection: (conn: DbConnection) => void
  deleteConnection: (id: string) => void
  setActiveConnection: (id: string | null) => void
  setConnectionStatus: (id: string, status: DbConnectionStatus) => void
  connectDb: (id: string) => Promise<void>
  disconnectDb: (id: string) => Promise<void>
  reorderConnections: (workspaceId: string, fromIndex: number, toIndex: number) => void
  appendBackupLog: (entry: DbBackupLogEntry) => void
  clearBackupLogs: () => void
  addNlMessage: (connectionId: string, message: DbNlMessage) => void
  setNlLoading: (connectionId: string, loading: boolean) => void
  clearNlMessages: (connectionId: string) => void
  setNlAiProvider: (provider: AiProviderId) => void
}

type DatabaseStore = DatabaseState & DatabaseActions

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedSave(workspaceId: string, connections: DbConnection[]) {
  if (saveTimers[workspaceId]) clearTimeout(saveTimers[workspaceId])
  saveTimers[workspaceId] = setTimeout(() => {
    const data: DbFile = { version: 1, connections }
    window.kanbai.database.save(workspaceId, data)
    delete saveTimers[workspaceId]
  }, 500)
}

export const useDatabaseStore = create<DatabaseStore>((set, get) => ({
  connectionsByWorkspace: {},
  activeConnectionId: null,
  connectionStatuses: {},
  loadedWorkspaces: {},
  loading: false,
  backupLogs: [],
  nlMessages: {},
  nlLoading: {},
  nlAiProvider: 'claude',

  loadConnections: async (workspaceId: string) => {
    if (get().loadedWorkspaces[workspaceId]) return

    set({ loading: true })
    try {
      const loaded: DbFile = await window.kanbai.database.load(workspaceId)
      set((state) => ({
        connectionsByWorkspace: {
          ...state.connectionsByWorkspace,
          [workspaceId]: loaded.connections,
        },
        loadedWorkspaces: { ...state.loadedWorkspaces, [workspaceId]: true },
        loading: false,
      }))
    } catch {
      set((state) => ({
        connectionsByWorkspace: {
          ...state.connectionsByWorkspace,
          [workspaceId]: [],
        },
        loadedWorkspaces: { ...state.loadedWorkspaces, [workspaceId]: true },
        loading: false,
      }))
    }
  },

  getConnectionsForWorkspace: (workspaceId: string) => {
    return get().connectionsByWorkspace[workspaceId] ?? []
  },

  saveConnections: (workspaceId: string) => {
    const connections = get().connectionsByWorkspace[workspaceId] ?? []
    debouncedSave(workspaceId, connections)
  },

  addConnection: (conn: DbConnection) => {
    set((state) => {
      const existing = state.connectionsByWorkspace[conn.workspaceId] ?? []
      return {
        connectionsByWorkspace: {
          ...state.connectionsByWorkspace,
          [conn.workspaceId]: [...existing, conn],
        },
      }
    })
    get().saveConnections(conn.workspaceId)
  },

  updateConnection: (conn: DbConnection) => {
    set((state) => {
      const existing = state.connectionsByWorkspace[conn.workspaceId] ?? []
      return {
        connectionsByWorkspace: {
          ...state.connectionsByWorkspace,
          [conn.workspaceId]: existing.map((c) => (c.id === conn.id ? conn : c)),
        },
      }
    })
    get().saveConnections(conn.workspaceId)
  },

  deleteConnection: (id: string) => {
    const { connectionStatuses, activeConnectionId, connectionsByWorkspace } = get()
    const status = connectionStatuses[id]
    if (status === 'connected' || status === 'connecting') {
      window.kanbai.database.disconnect(id).catch(() => {})
    }

    // Find which workspace this connection belongs to
    let workspaceId: string | null = null
    for (const [wsId, conns] of Object.entries(connectionsByWorkspace)) {
      if (conns.some((c) => c.id === id)) {
        workspaceId = wsId
        break
      }
    }

    set((state) => {
      const { [id]: _, ...nextStatuses } = state.connectionStatuses

      const nextConns = { ...state.connectionsByWorkspace }
      if (workspaceId) {
        nextConns[workspaceId] = (nextConns[workspaceId] ?? []).filter((c) => c.id !== id)
      }

      // Clean up NL-related state for deleted connection
      const { [id]: _msgs, ...nextNlMessages } = state.nlMessages
      const { [id]: _loading, ...nextNlLoading } = state.nlLoading

      // Clean up query tabs for deleted connection
      useDatabaseTabStore.getState().clearTabsForConnection(id)

      return {
        connectionsByWorkspace: nextConns,
        connectionStatuses: nextStatuses,
        activeConnectionId: activeConnectionId === id ? null : activeConnectionId,
        nlMessages: nextNlMessages,
        nlLoading: nextNlLoading,
      }
    })

    if (workspaceId) {
      get().saveConnections(workspaceId)
    }
  },

  setActiveConnection: (id: string | null) => {
    set({ activeConnectionId: id })
  },

  setConnectionStatus: (id: string, status: DbConnectionStatus) => {
    set((state) => ({
      connectionStatuses: { ...state.connectionStatuses, [id]: status },
    }))
  },

  connectDb: async (id: string) => {
    // Find the connection across all workspaces
    let conn: DbConnection | undefined
    for (const conns of Object.values(get().connectionsByWorkspace)) {
      conn = conns.find((c) => c.id === id)
      if (conn) break
    }
    if (!conn) return

    get().setConnectionStatus(id, 'connecting')
    try {
      await window.kanbai.database.connect(id, conn.config)
      get().setConnectionStatus(id, 'connected')
      set({ activeConnectionId: id })
    } catch {
      get().setConnectionStatus(id, 'error')
    }
  },

  disconnectDb: async (id: string) => {
    try {
      await window.kanbai.database.disconnect(id)
    } catch {
      // Ignore disconnect errors
    }
    get().setConnectionStatus(id, 'disconnected')
  },

  reorderConnections: (workspaceId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      const existing = [...(state.connectionsByWorkspace[workspaceId] ?? [])]
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= existing.length || toIndex >= existing.length) return state
      const moved = existing.splice(fromIndex, 1)[0]
      if (!moved) return state
      existing.splice(toIndex, 0, moved)
      return {
        connectionsByWorkspace: {
          ...state.connectionsByWorkspace,
          [workspaceId]: existing,
        },
      }
    })
    get().saveConnections(workspaceId)
  },

  appendBackupLog: (entry: DbBackupLogEntry) => {
    set((state) => ({
      backupLogs: [...state.backupLogs.slice(-499), entry],
    }))
  },

  clearBackupLogs: () => {
    set({ backupLogs: [] })
  },

  addNlMessage: (connectionId: string, message: DbNlMessage) => {
    set((state) => ({
      nlMessages: {
        ...state.nlMessages,
        [connectionId]: [...(state.nlMessages[connectionId] ?? []), message],
      },
    }))
  },

  setNlLoading: (connectionId: string, loading: boolean) => {
    set((state) => ({
      nlLoading: { ...state.nlLoading, [connectionId]: loading },
    }))
  },

  clearNlMessages: (connectionId: string) => {
    set((state) => ({
      nlMessages: { ...state.nlMessages, [connectionId]: [] },
    }))
  },

  setNlAiProvider: (provider) => set({ nlAiProvider: provider }),
}))
