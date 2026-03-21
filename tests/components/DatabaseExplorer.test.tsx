import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DbConnection, DbConnectionStatus } from '../../src/shared/types'

// Mock i18n
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: vi.fn(),
  }),
}))

// Mock sub-components (updated paths)
vi.mock('../../src/renderer/features/database/features/connection/sidebar', () => ({
  DatabaseSidebar: (props: any) => (
    <div data-testid="database-sidebar">
      <button data-testid="sidebar-add" onClick={props.onAddConnection}>
        Add
      </button>
      {props.connections.map((c: DbConnection) => (
        <div
          key={c.id}
          data-testid={`sidebar-conn-${c.id}`}
          onClick={() => props.onSelectConnection(c.id)}
        >
          {c.name}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../../src/renderer/features/database/features/query/query-area', () => ({
  DatabaseQueryArea: (props: any) => (
    <div data-testid="database-query-area">
      {props.connection ? props.connection.name : 'no-connection'}
    </div>
  ),
}))

vi.mock('../../src/renderer/features/database/features/connection/connection-modal', () => ({
  DatabaseConnectionModal: (props: any) => (
    <div data-testid="connection-modal">
      <button data-testid="modal-save" onClick={() => props.onSave({
        id: 'new-conn',
        name: 'New DB',
        engine: 'postgresql',
        environmentTag: 'local',
        config: { engine: 'postgresql' },
        workspaceId: props.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })}>
        Save
      </button>
      <button data-testid="modal-close" onClick={props.onClose}>
        Close
      </button>
    </div>
  ),
}))

// Mock stores
const mockLoadConnections = vi.fn()
const mockAddConnection = vi.fn()
const mockUpdateConnection = vi.fn()
const mockDeleteConnection = vi.fn()
const mockSetActiveConnection = vi.fn()
const mockConnectDb = vi.fn()
const mockDisconnectDb = vi.fn()
const mockReorderConnections = vi.fn()
const mockAppendBackupLog = vi.fn()
const mockClearBackupLogs = vi.fn()

const mockConnections: DbConnection[] = [
  {
    id: 'conn-1',
    name: 'Dev PostgreSQL',
    engine: 'postgresql',
    environmentTag: 'dev',
    config: { engine: 'postgresql', host: 'localhost', port: 5432 },
    workspaceId: 'ws-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const mockConnectionStatuses: Record<string, DbConnectionStatus> = {
  'conn-1': 'connected',
}

vi.mock('../../src/renderer/features/database/database-store', () => ({
  useDatabaseStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        connectionsByWorkspace: { 'ws-1': mockConnections },
        activeConnectionId: 'conn-1',
        connectionStatuses: mockConnectionStatuses,
        loading: false,
        loadConnections: mockLoadConnections,
        addConnection: mockAddConnection,
        updateConnection: mockUpdateConnection,
        deleteConnection: mockDeleteConnection,
        setActiveConnection: mockSetActiveConnection,
        connectDb: mockConnectDb,
        disconnectDb: mockDisconnectDb,
        reorderConnections: mockReorderConnections,
        backupLogs: [],
        appendBackupLog: mockAppendBackupLog,
        clearBackupLogs: mockClearBackupLogs,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        connectionsByWorkspace: { 'ws-1': mockConnections },
        activeConnectionId: 'conn-1',
        connectionStatuses: mockConnectionStatuses,
        loading: false,
        backupLogs: [],
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

const mockSetPendingDbProjectPath = vi.fn()

vi.mock('../../src/renderer/lib/stores/viewStore', () => ({
  useViewStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        pendingDbProjectPath: null,
        setPendingDbProjectPath: mockSetPendingDbProjectPath,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        pendingDbProjectPath: null,
        setPendingDbProjectPath: mockSetPendingDbProjectPath,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

vi.mock('../../src/renderer/lib/stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        activeWorkspaceId: 'ws-1',
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ activeWorkspaceId: 'ws-1' }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

// Ensure window.kanbai.database and notify mocks exist
const mirehub = window.kanbai as any
if (!mirehub.database) {
  mirehub.database = {
    testConnection: vi.fn().mockResolvedValue({ success: true }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listDatabases: vi.fn().mockResolvedValue([]),
    listSchemas: vi.fn().mockResolvedValue([]),
    listTables: vi.fn().mockResolvedValue([]),
    executeQuery: vi.fn().mockResolvedValue({ columns: [], rows: [] }),
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn(),
    backup: vi.fn(),
    backupList: vi.fn().mockResolvedValue({ success: true, entries: [] }),
    backupDelete: vi.fn(),
    restore: vi.fn(),
    onBackupLog: vi.fn().mockReturnValue(() => {}),
    cancelQuery: vi.fn(),
  }
}
if (!mirehub.notify) {
  mirehub.notify = vi.fn()
}

import { DatabaseExplorer } from '../../src/renderer/components/DatabaseExplorer'

describe('DatabaseExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mirehub.database.onBackupLog.mockReturnValue(() => {})
  })

  describe('rendu de base', () => {
    it('rend le composant sans erreur', () => {
      render(<DatabaseExplorer />)
      expect(screen.getByTestId('database-sidebar')).toBeInTheDocument()
      expect(screen.getByTestId('database-query-area')).toBeInTheDocument()
    })
  })

  describe('affiche le sidebar et la zone de requete', () => {
    it('rend le sidebar de base de donnees', () => {
      render(<DatabaseExplorer />)
      expect(screen.getByTestId('database-sidebar')).toBeInTheDocument()
    })

    it('rend la zone de requete', () => {
      render(<DatabaseExplorer />)
      expect(screen.getByTestId('database-query-area')).toBeInTheDocument()
    })

    it('passe les connexions au sidebar', () => {
      render(<DatabaseExplorer />)
      expect(screen.getByTestId('sidebar-conn-conn-1')).toHaveTextContent('Dev PostgreSQL')
    })

    it('affiche le toggle de logs', () => {
      render(<DatabaseExplorer />)
      expect(screen.getByText('db.logs')).toBeInTheDocument()
    })
  })

  describe('ouvre le modal de creation de connexion', () => {
    it('affiche le modal au clic sur ajouter', async () => {
      const user = userEvent.setup()
      render(<DatabaseExplorer />)

      await user.click(screen.getByTestId('sidebar-add'))

      await waitFor(() => {
        expect(screen.getByTestId('connection-modal')).toBeInTheDocument()
      })
    })

    it('ferme le modal au clic sur fermer', async () => {
      const user = userEvent.setup()
      render(<DatabaseExplorer />)

      await user.click(screen.getByTestId('sidebar-add'))
      await waitFor(() => {
        expect(screen.getByTestId('connection-modal')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('modal-close'))
      await waitFor(() => {
        expect(screen.queryByTestId('connection-modal')).not.toBeInTheDocument()
      })
    })
  })

  describe('gere la selection de connexion', () => {
    it('appelle setActiveConnection au clic sur une connexion du sidebar', async () => {
      const user = userEvent.setup()
      render(<DatabaseExplorer />)

      await user.click(screen.getByTestId('sidebar-conn-conn-1'))

      expect(mockSetActiveConnection).toHaveBeenCalledWith('conn-1')
    })
  })

  describe('charge les connexions au montage', () => {
    it('appelle loadConnections avec le workspace actif', () => {
      render(<DatabaseExplorer />)
      expect(mockLoadConnections).toHaveBeenCalledWith('ws-1')
    })
  })

  describe('sauvegarde d une connexion', () => {
    it('appelle addConnection lors de la sauvegarde d une nouvelle connexion', async () => {
      const user = userEvent.setup()
      render(<DatabaseExplorer />)

      await user.click(screen.getByTestId('sidebar-add'))
      await waitFor(() => {
        expect(screen.getByTestId('connection-modal')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('modal-save'))

      expect(mockAddConnection).toHaveBeenCalledTimes(1)
    })
  })
})
