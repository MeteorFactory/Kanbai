import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock i18n
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: vi.fn(),
  }),
}))

// Mock ContextMenu
vi.mock('../../src/renderer/components/ContextMenu', () => ({
  ContextMenu: ({ items, onClose }: { items: Array<{ label: string; action: () => void; separator?: boolean }>; onClose: () => void }) => (
    <div data-testid="context-menu">
      {items.filter((i) => !i.separator).map((item) => (
        <button key={item.label} onClick={() => { item.action(); onClose() }}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}))

import { DatabaseSidebar } from '../../src/renderer/components/DatabaseSidebar'
import type { DbConnection, DbConnectionStatus } from '../../src/shared/types'

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

const mockConnections: DbConnection[] = [
  {
    id: 'conn-1',
    name: 'Local PostgreSQL',
    engine: 'postgresql',
    environmentTag: 'local',
    config: { engine: 'postgresql', host: 'localhost', port: 5432, database: 'devdb' },
    workspaceId: 'ws-1',
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 100000,
  },
  {
    id: 'conn-2',
    name: 'Production MySQL',
    engine: 'mysql',
    environmentTag: 'prd',
    config: { engine: 'mysql', host: 'db.prod.com', port: 3306, database: 'proddb' },
    workspaceId: 'ws-1',
    createdAt: Date.now() - 200000,
    updatedAt: Date.now() - 200000,
  },
  {
    id: 'conn-3',
    name: 'Dev MongoDB',
    engine: 'mongodb',
    environmentTag: 'dev',
    config: { engine: 'mongodb', host: 'localhost', port: 27017, database: 'devmongo' },
    workspaceId: 'ws-1',
    createdAt: Date.now() - 300000,
    updatedAt: Date.now() - 300000,
  },
]

const defaultProps = {
  connections: mockConnections,
  activeConnectionId: null as string | null,
  connectionStatuses: {} as Record<string, DbConnectionStatus>,
  onSelectConnection: vi.fn(),
  onAddConnection: vi.fn(),
  onEditConnection: vi.fn(),
  onDeleteConnection: vi.fn(),
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onSelectTable: vi.fn(),
  onBackup: vi.fn().mockResolvedValue(undefined),
  onDeleteBackup: vi.fn(),
  onRestoreBackup: vi.fn().mockResolvedValue(undefined),
  onReorder: vi.fn(),
}

describe('DatabaseSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendu de la liste de connexions', () => {
    it('affiche le titre de la sidebar', () => {
      render(<DatabaseSidebar {...defaultProps} />)
      expect(screen.getByText('db.title')).toBeInTheDocument()
    })

    it('rend toutes les connexions', () => {
      render(<DatabaseSidebar {...defaultProps} />)
      expect(screen.getByText('Local PostgreSQL')).toBeInTheDocument()
      expect(screen.getByText('Production MySQL')).toBeInTheDocument()
      expect(screen.getByText('Dev MongoDB')).toBeInTheDocument()
    })

    it('affiche un message quand il n y a pas de connexions', () => {
      render(<DatabaseSidebar {...defaultProps} connections={[]} />)
      expect(screen.getByText('db.noConnections')).toBeInTheDocument()
    })

    it('affiche les badges de moteur', () => {
      render(<DatabaseSidebar {...defaultProps} />)
      expect(screen.getByText('PG')).toBeInTheDocument()
      expect(screen.getByText('MY')).toBeInTheDocument()
      expect(screen.getByText('MG')).toBeInTheDocument()
    })
  })

  describe('statut de connexion', () => {
    it('affiche le dot de statut connecte', () => {
      const statuses: Record<string, DbConnectionStatus> = {
        'conn-1': 'connected',
      }
      const { container } = render(
        <DatabaseSidebar {...defaultProps} connectionStatuses={statuses} />,
      )
      const connectedDot = container.querySelector('.db-status-dot--connected')
      expect(connectedDot).toBeInTheDocument()
    })

    it('affiche le dot de statut erreur', () => {
      const statuses: Record<string, DbConnectionStatus> = {
        'conn-2': 'error',
      }
      const { container } = render(
        <DatabaseSidebar {...defaultProps} connectionStatuses={statuses} />,
      )
      const errorDot = container.querySelector('.db-status-dot--error')
      expect(errorDot).toBeInTheDocument()
    })

    it('affiche le dot de statut en cours de connexion', () => {
      const statuses: Record<string, DbConnectionStatus> = {
        'conn-1': 'connecting',
      }
      const { container } = render(
        <DatabaseSidebar {...defaultProps} connectionStatuses={statuses} />,
      )
      const connectingDot = container.querySelector('.db-status-dot--connecting')
      expect(connectingDot).toBeInTheDocument()
    })
  })

  describe('interactions utilisateur', () => {
    it('appelle onAddConnection au clic sur le bouton ajouter', async () => {
      const user = userEvent.setup()
      render(<DatabaseSidebar {...defaultProps} />)

      const addBtn = screen.getByTitle('db.addConnection')
      await user.click(addBtn)

      expect(defaultProps.onAddConnection).toHaveBeenCalledTimes(1)
    })

    it('appelle onSelectConnection au clic sur une connexion', async () => {
      const user = userEvent.setup()
      render(<DatabaseSidebar {...defaultProps} />)

      await user.click(screen.getByText('Local PostgreSQL'))

      expect(defaultProps.onSelectConnection).toHaveBeenCalledWith('conn-1')
    })

    it('appelle onConnect au double-clic sur une connexion deconnectee', async () => {
      const user = userEvent.setup()
      render(<DatabaseSidebar {...defaultProps} />)

      const connHeader = screen.getByText('Local PostgreSQL').closest('.db-connection-header')!
      await user.dblClick(connHeader)

      expect(defaultProps.onConnect).toHaveBeenCalledWith('conn-1')
    })

    it('ne connecte pas au double-clic si deja connecte', async () => {
      const user = userEvent.setup()
      const statuses: Record<string, DbConnectionStatus> = {
        'conn-1': 'connected',
      }
      render(<DatabaseSidebar {...defaultProps} connectionStatuses={statuses} />)

      const connHeader = screen.getByText('Local PostgreSQL').closest('.db-connection-header')!
      await user.dblClick(connHeader)

      expect(defaultProps.onConnect).not.toHaveBeenCalled()
    })
  })

  describe('tags d environnement', () => {
    it('affiche les tags d environnement pour chaque connexion', () => {
      render(<DatabaseSidebar {...defaultProps} />)
      expect(screen.getByText('local')).toBeInTheDocument()
      expect(screen.getByText('prd')).toBeInTheDocument()
      expect(screen.getByText('dev')).toBeInTheDocument()
    })

    it('affiche le nom de tag personnalise pour le type custom', () => {
      const connections: DbConnection[] = [
        {
          id: 'conn-custom',
          name: 'Custom DB',
          engine: 'postgresql',
          environmentTag: 'custom',
          customTagName: 'staging',
          config: { engine: 'postgresql', host: 'localhost', port: 5432 },
          workspaceId: 'ws-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]
      render(<DatabaseSidebar {...defaultProps} connections={connections} />)
      expect(screen.getByText('staging')).toBeInTheDocument()
    })
  })

  describe('connexion active', () => {
    it('met en surbrillance la connexion active', () => {
      const { container } = render(
        <DatabaseSidebar {...defaultProps} activeConnectionId="conn-1" />,
      )
      const activeHeader = container.querySelector('.db-connection-header--active')
      expect(activeHeader).toBeInTheDocument()
      expect(activeHeader?.textContent).toContain('Local PostgreSQL')
    })
  })

  describe('arbre de tables pour connexion etendue', () => {
    it('affiche le message non connecte quand la connexion est etendue mais pas connectee', async () => {
      const user = userEvent.setup()
      render(<DatabaseSidebar {...defaultProps} />)

      await user.click(screen.getByText('Local PostgreSQL'))

      await waitFor(() => {
        expect(screen.getByText('db.notConnected')).toBeInTheDocument()
      })
    })
  })
})
