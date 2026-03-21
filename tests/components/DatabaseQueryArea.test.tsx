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

// Mock Monaco editor
vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => (
    <textarea
      data-testid="monaco-editor"
      value={props.value}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}))

// Mock sub-components (updated paths for feature module structure)
vi.mock('../../src/renderer/features/database/features/query/results-table', () => ({
  DatabaseResultsTable: (props: any) => (
    <div data-testid="results-table">
      <span>{props.result.columns.length} columns</span>
      <span>{props.result.rows.length} rows</span>
    </div>
  ),
}))

vi.mock('../../src/renderer/features/database/features/nl-chat/nl-chat', () => ({
  DatabaseNLChat: () => <div data-testid="nl-chat">NL Chat</div>,
}))

vi.mock('../../src/renderer/shared/layout/resize-divider', () => ({
  ResizeDivider: () => <div data-testid="resize-divider" />,
}))

vi.mock('../../src/renderer/features/database/features/query/tab-bar', () => ({
  DatabaseTabBar: () => <div data-testid="tab-bar">Tab Bar</div>,
}))

vi.mock('../../src/renderer/shared/ui/copyable-error', () => ({
  CopyableError: ({ error }: { error: string }) => <div data-testid="copyable-error">{error}</div>,
}))

// Mock databaseTabStore
const mockEnsureTab = vi.fn().mockReturnValue('tab-1')
const mockCreateTab = vi.fn().mockReturnValue('tab-2')
const mockUpdateTabQuery = vi.fn()
const mockUpdateTabResults = vi.fn()
const mockUpdateTabExecuting = vi.fn()
const mockUpdateTabLimit = vi.fn()
const mockUpdateTabPage = vi.fn()

vi.mock('../../src/renderer/features/database/database-tab-store', () => ({
  useDatabaseTabStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        tabsByConnection: {
          'conn-1': [
            {
              id: 'tab-1',
              connectionId: 'conn-1',
              label: 'New Query',
              query: 'SELECT * FROM users',
              results: null,
              executing: false,
              limit: 100,
              page: 0,
            },
          ],
        },
        activeTabByConnection: { 'conn-1': 'tab-1' },
        ensureTab: mockEnsureTab,
        createTab: mockCreateTab,
        updateTabQuery: mockUpdateTabQuery,
        updateTabResults: mockUpdateTabResults,
        updateTabExecuting: mockUpdateTabExecuting,
        updateTabLimit: mockUpdateTabLimit,
        updateTabPage: mockUpdateTabPage,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        tabsByConnection: {},
        activeTabByConnection: {},
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}))

// Ensure window.kanbai.database mock exists
const mirehub = window.kanbai as any
if (!mirehub.database) {
  mirehub.database = {
    testConnection: vi.fn().mockResolvedValue({ success: true }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listDatabases: vi.fn().mockResolvedValue([]),
    listSchemas: vi.fn().mockResolvedValue([]),
    listTables: vi.fn().mockResolvedValue([]),
    executeQuery: vi.fn().mockResolvedValue({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1,
      executionTime: 42,
    }),
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

import { DatabaseQueryArea } from '../../src/renderer/components/DatabaseQueryArea'

const mockConnection: DbConnection = {
  id: 'conn-1',
  name: 'Dev PostgreSQL',
  engine: 'postgresql',
  environmentTag: 'dev',
  config: { engine: 'postgresql', host: 'localhost', port: 5432, database: 'devdb' },
  workspaceId: 'ws-1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const mockOnPendingQueryConsumed = vi.fn()

describe('DatabaseQueryArea', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendu sans connexion active', () => {
    it('affiche un message de selection de connexion', () => {
      render(
        <DatabaseQueryArea
          connection={null}
          connectionStatus="disconnected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.selectConnection')).toBeInTheDocument()
    })

    it('ne rend pas l editeur sans connexion', () => {
      render(
        <DatabaseQueryArea
          connection={null}
          connectionStatus="disconnected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
    })
  })

  describe('affiche l editeur de requete', () => {
    it('rend l editeur Monaco quand une connexion est active', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })

    it('affiche le nom de la connexion dans la toolbar', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('Dev PostgreSQL')).toBeInTheDocument()
    })

    it('affiche le bouton d execution', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.execute')).toBeInTheDocument()
    })

    it('affiche le selecteur de limite', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByDisplayValue('LIMIT 100')).toBeInTheDocument()
    })

    it('rend la barre d onglets', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('rend le chat NL', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByTestId('nl-chat')).toBeInTheDocument()
    })
  })

  describe('gere le statut de connexion', () => {
    it('affiche le statut connecte', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.statusConnected')).toBeInTheDocument()
    })

    it('affiche le statut deconnecte', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="disconnected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.statusDisconnected')).toBeInTheDocument()
    })

    it('affiche le statut erreur', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="error"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.connectionError')).toBeInTheDocument()
    })

    it('affiche le statut en cours de connexion', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connecting"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.connecting')).toBeInTheDocument()
    })

    it('desactive le bouton d execution quand deconnecte', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="disconnected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      const executeBtn = screen.getByText('db.execute')
      expect(executeBtn).toBeDisabled()
    })
  })

  describe('placeholder de resultats', () => {
    it('affiche le placeholder de requete quand connecte sans resultats', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.writeQuery')).toBeInTheDocument()
    })

    it('affiche le message connecter d abord quand deconnecte', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="disconnected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('db.connectFirst')).toBeInTheDocument()
    })
  })

  describe('tag d environnement', () => {
    it('affiche le badge d environnement de la connexion', () => {
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )
      expect(screen.getByText('dev')).toBeInTheDocument()
    })
  })

  describe('execution de requete', () => {
    it('appelle executeQuery au clic sur le bouton execute', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseQueryArea
          connection={mockConnection}
          connectionStatus="connected"
          pendingQuery={null}
          onPendingQueryConsumed={mockOnPendingQueryConsumed}
        />,
      )

      await user.click(screen.getByText('db.execute'))

      await waitFor(() => {
        expect(mirehub.database.executeQuery).toHaveBeenCalledWith(
          'conn-1',
          'SELECT * FROM users',
          100,
          0,
        )
      })
    })
  })
})
