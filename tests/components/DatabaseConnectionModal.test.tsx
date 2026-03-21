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

// Mock CopyableError (new path: shared/ui/copyable-error)
vi.mock('../../src/renderer/shared/ui/copyable-error', () => ({
  CopyableError: ({ error }: { error: string }) => <div data-testid="copyable-error">{error}</div>,
}))

import { DatabaseConnectionModal } from '../../src/renderer/components/DatabaseConnectionModal'
import type { DbConnection } from '../../src/shared/types'

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
    backupList: vi.fn().mockResolvedValue([]),
    backupDelete: vi.fn(),
    restore: vi.fn(),
    onBackupLog: vi.fn().mockReturnValue(() => {}),
    cancelQuery: vi.fn(),
  }
}

const mockOnSave = vi.fn()
const mockOnClose = vi.fn()

const existingConnection: DbConnection = {
  id: 'conn-1',
  name: 'Production DB',
  engine: 'postgresql',
  environmentTag: 'prd',
  config: {
    engine: 'postgresql',
    host: 'db.example.com',
    port: 5432,
    username: 'admin',
    password: 'secret',
    database: 'mydb',
    ssl: true,
  },
  workspaceId: 'ws-1',
  nlPermissions: { canRead: true, canUpdate: false, canDelete: false },
  createdAt: Date.now() - 100000,
  updatedAt: Date.now() - 100000,
}

describe('DatabaseConnectionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mirehub.database.testConnection.mockResolvedValue({ success: true })
  })

  describe('rendu initial du modal en mode creation', () => {
    it('affiche le titre de nouvelle connexion', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      expect(screen.getByText('db.newConnection')).toBeInTheDocument()
    })

    it('affiche les champs du formulaire vides', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      const nameInput = screen.getByPlaceholderText('db.connectionNamePlaceholder')
      expect(nameInput).toHaveValue('')
    })

    it('affiche les boutons de test, annuler et sauvegarder', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      expect(screen.getByText('db.testConnection')).toBeInTheDocument()
      expect(screen.getByText('common.cancel')).toBeInTheDocument()
      expect(screen.getByText('common.save')).toBeInTheDocument()
    })

    it('affiche PostgreSQL comme moteur par defaut', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      const select = screen.getByDisplayValue('PostgreSQL')
      expect(select).toBeInTheDocument()
    })

    it('affiche les options d environnement', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      expect(screen.getByText('db.envLocal')).toBeInTheDocument()
      expect(screen.getByText('db.envDev')).toBeInTheDocument()
      expect(screen.getByText('db.envPrd')).toBeInTheDocument()
    })
  })

  describe('rendu initial en mode edition avec connexion existante', () => {
    it('affiche le titre d edition', () => {
      render(
        <DatabaseConnectionModal
          connection={existingConnection}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      expect(screen.getByText('db.editConnection')).toBeInTheDocument()
    })

    it('pre-remplit le nom de la connexion', () => {
      render(
        <DatabaseConnectionModal
          connection={existingConnection}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      const nameInput = screen.getByPlaceholderText('db.connectionNamePlaceholder')
      expect(nameInput).toHaveValue('Production DB')
    })

    it('pre-remplit le moteur de la connexion', () => {
      render(
        <DatabaseConnectionModal
          connection={existingConnection}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      const select = screen.getByDisplayValue('PostgreSQL')
      expect(select).toBeInTheDocument()
    })

    it('pre-remplit le host et port', () => {
      render(
        <DatabaseConnectionModal
          connection={existingConnection}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      const hostInput = screen.getByDisplayValue('db.example.com')
      expect(hostInput).toBeInTheDocument()
    })
  })

  describe('changement de moteur de base de donnees', () => {
    it('change le moteur via le selecteur', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      const select = screen.getByDisplayValue('PostgreSQL')
      await user.selectOptions(select, 'mysql')

      expect(screen.getByDisplayValue('MySQL')).toBeInTheDocument()
    })

    it('affiche le champ fichier pour SQLite', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      const select = screen.getByDisplayValue('PostgreSQL')
      await user.selectOptions(select, 'sqlite')

      expect(screen.getByText('db.filePath')).toBeInTheDocument()
      expect(screen.getByText('db.browse')).toBeInTheDocument()
    })
  })

  describe('toggle entre mode URI et parametres', () => {
    it('affiche le mode parametres par defaut', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      expect(screen.getByText('db.host')).toBeInTheDocument()
      expect(screen.getByText('db.port')).toBeInTheDocument()
    })

    it('bascule vers le mode URI au clic', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      await user.click(screen.getByText('URI'))

      expect(screen.getByText('db.connectionString')).toBeInTheDocument()
    })

    it('bascule de URI vers parametres', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      await user.click(screen.getByText('URI'))
      expect(screen.getByText('db.connectionString')).toBeInTheDocument()

      await user.click(screen.getByText('db.parameters'))
      expect(screen.getByText('db.host')).toBeInTheDocument()
    })
  })

  describe('test de connexion avec bouton', () => {
    it('appelle testConnection au clic sur le bouton test', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      // Fill required fields
      const nameInput = screen.getByPlaceholderText('db.connectionNamePlaceholder')
      await user.type(nameInput, 'Test DB')

      await user.click(screen.getByText('db.testConnection'))

      await waitFor(() => {
        expect(mirehub.database.testConnection).toHaveBeenCalled()
      })
    })

    it('affiche le resultat de succes du test', async () => {
      const user = userEvent.setup()
      mirehub.database.testConnection.mockResolvedValue({ success: true })
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      const nameInput = screen.getByPlaceholderText('db.connectionNamePlaceholder')
      await user.type(nameInput, 'Test DB')

      await user.click(screen.getByText('db.testConnection'))

      await waitFor(() => {
        expect(screen.getByText('db.testSuccess')).toBeInTheDocument()
      })
    })

    it('affiche le resultat d erreur du test', async () => {
      const user = userEvent.setup()
      mirehub.database.testConnection.mockResolvedValue({
        success: false,
        error: 'Connection refused',
      })
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      const nameInput = screen.getByPlaceholderText('db.connectionNamePlaceholder')
      await user.type(nameInput, 'Test DB')

      await user.click(screen.getByText('db.testConnection'))

      await waitFor(() => {
        expect(screen.getByTestId('copyable-error')).toBeInTheDocument()
      })
    })
  })

  describe('sauvegarde de la connexion', () => {
    it('appelle onSave avec les donnees du formulaire', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      const nameInput = screen.getByPlaceholderText('db.connectionNamePlaceholder')
      await user.type(nameInput, 'New Connection')

      await user.click(screen.getByText('common.save'))

      expect(mockOnSave).toHaveBeenCalledTimes(1)
      const savedConn = mockOnSave.mock.calls[0][0]
      expect(savedConn.name).toBe('New Connection')
      expect(savedConn.engine).toBe('postgresql')
      expect(savedConn.workspaceId).toBe('ws-1')
    })

    it('appelle onClose au clic sur annuler', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      await user.click(screen.getByText('common.cancel'))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('conserve l id existant en mode edition', async () => {
      const user = userEvent.setup()
      render(
        <DatabaseConnectionModal
          connection={existingConnection}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )

      await user.click(screen.getByText('common.save'))

      expect(mockOnSave).toHaveBeenCalledTimes(1)
      const savedConn = mockOnSave.mock.calls[0][0]
      expect(savedConn.id).toBe('conn-1')
    })
  })

  describe('permissions NL', () => {
    it('affiche les checkboxes de permissions NL', () => {
      render(
        <DatabaseConnectionModal
          connection={null}
          workspaceId="ws-1"
          onSave={mockOnSave}
          onClose={mockOnClose}
        />,
      )
      expect(screen.getByText('db.nlPermRead')).toBeInTheDocument()
      expect(screen.getByText('db.nlPermUpdate')).toBeInTheDocument()
      expect(screen.getByText('db.nlPermDelete')).toBeInTheDocument()
    })
  })
})
