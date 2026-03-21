import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock i18n
vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}:${JSON.stringify(params)}`
      return key
    },
    locale: 'fr',
    setLocale: vi.fn(),
  }),
}))

// Mock MCP catalog — provide a minimal set of entries
vi.mock('../../src/shared/constants/mcpCatalog', () => ({
  MCP_CATALOG: [
    {
      id: 'filesystem',
      name: 'Filesystem',
      description: 'Secure file operations',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      category: 'filesystem',
      features: ['read_file', 'write_file', 'list_directory'],
      official: true,
    },
    {
      id: 'git',
      name: 'Git',
      description: 'Git operations',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git'],
      category: 'devtools',
      features: ['git_status', 'git_log'],
      official: true,
    },
    {
      id: 'postgres',
      name: 'PostgreSQL',
      description: 'PostgreSQL database access',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      category: 'database',
      features: ['query', 'schema'],
      official: false,
      envPlaceholders: { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' },
    },
  ],
  MCP_CATEGORIES: [
    { id: 'filesystem', labelKey: 'claude.mcpCatFilesystem' },
    { id: 'devtools', labelKey: 'claude.mcpCatDevtools' },
    { id: 'database', labelKey: 'claude.mcpCatDatabase' },
  ],
  MCP_CATEGORY_ICONS: {
    filesystem: '\uD83D\uDCC1',
    devtools: '\uD83D\uDEE0',
    database: '\uD83D\uDDC4',
  } as Record<string, string>,
}))

import { McpPanel } from '../../src/renderer/components/McpPanel'

describe('McpPanel', () => {
  const mockOnServersChange = vi.fn()
  const defaultProps = {
    mcpServers: {} as Record<string, { command: string; args?: string[] }>,
    settings: {} as Record<string, unknown>,
    projectPath: '/my-project',
    onServersChange: mockOnServersChange,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Ensure window.kanbai.project.writeClaudeSettings is available
    const mirehub = window.kanbai as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    if (!mirehub.project) mirehub.project = {} as Record<string, ReturnType<typeof vi.fn>>
    mirehub.project.writeClaudeSettings = vi.fn().mockResolvedValue(undefined)
  })

  describe('rendu initial avec catalogue vide de serveurs installes', () => {
    it('affiche les onglets catalogue et installe', () => {
      render(<McpPanel {...defaultProps} />)
      expect(screen.getByText('claude.mcpCatalog')).toBeInTheDocument()
      expect(screen.getByText(/claude\.mcpInstalled/)).toBeInTheDocument()
    })

    it('affiche le catalogue par defaut', () => {
      render(<McpPanel {...defaultProps} />)
      expect(screen.getByText('Filesystem')).toBeInTheDocument()
      expect(screen.getByText('Git')).toBeInTheDocument()
      expect(screen.getByText('PostgreSQL')).toBeInTheDocument()
    })

    it('affiche les badges MCP pour les serveurs officiels', () => {
      render(<McpPanel {...defaultProps} />)
      const officialBadges = screen.getAllByTitle('Official')
      expect(officialBadges.length).toBeGreaterThanOrEqual(2)
    })

    it('affiche les chips de categories', () => {
      render(<McpPanel {...defaultProps} />)
      expect(screen.getByText('claude.mcpCatAll')).toBeInTheDocument()
      // Category labels appear in both chips and group titles, so use getAllByText
      expect(screen.getAllByText('claude.mcpCatFilesystem').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('claude.mcpCatDevtools').length).toBeGreaterThanOrEqual(1)
    })

    it('affiche le compteur a zero dans l onglet installe', () => {
      render(<McpPanel {...defaultProps} />)
      expect(screen.getByText(/claude\.mcpInstalled.*\(0\)/)).toBeInTheDocument()
    })
  })

  describe('affichage des onglets', () => {
    it('bascule vers la vue installee au clic sur l onglet installe', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      await user.click(screen.getByText(/claude\.mcpInstalled/))

      expect(screen.getByText('claude.mcpServers')).toBeInTheDocument()
      expect(screen.getByText('claude.mcpNoServers')).toBeInTheDocument()
    })

    it('affiche les serveurs installes dans la vue installee', async () => {
      const user = userEvent.setup()
      const props = {
        ...defaultProps,
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
        },
      }
      render(<McpPanel {...props} />)

      await user.click(screen.getByText(/claude\.mcpInstalled/))

      expect(screen.getByText('filesystem')).toBeInTheDocument()
    })
  })

  describe('recherche de serveurs', () => {
    it('affiche le champ de recherche dans le catalogue', () => {
      render(<McpPanel {...defaultProps} />)
      expect(screen.getByPlaceholderText('claude.mcpSearchPlaceholder')).toBeInTheDocument()
    })

    it('filtre les serveurs par recherche textuelle', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('claude.mcpSearchPlaceholder')
      await user.type(searchInput, 'Git')

      expect(screen.getByText('Git')).toBeInTheDocument()
      expect(screen.queryByText('Filesystem')).not.toBeInTheDocument()
      expect(screen.queryByText('PostgreSQL')).not.toBeInTheDocument()
    })

    it('affiche un message vide quand aucun resultat de recherche', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('claude.mcpSearchPlaceholder')
      await user.type(searchInput, 'nonexistentserver')

      expect(screen.getByText('claude.mcpCatalogEmpty')).toBeInTheDocument()
    })
  })

  describe('basculement catalogue/installe', () => {
    it('affiche le bouton parcourir le catalogue quand aucun serveur installe', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      await user.click(screen.getByText(/claude\.mcpInstalled/))

      expect(screen.getByText('claude.mcpBrowseCatalog')).toBeInTheDocument()
    })

    it('marque les serveurs installes avec un badge dans le catalogue', () => {
      const props = {
        ...defaultProps,
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
        },
      }
      render(<McpPanel {...props} />)

      expect(screen.getByText('claude.mcpAlreadyInstalled')).toBeInTheDocument()
    })
  })

  describe('ajout manuel de serveur', () => {
    it('affiche le formulaire d ajout au clic sur le bouton ajouter', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      await user.click(screen.getByText(/claude\.mcpInstalled/))
      await user.click(screen.getByText('claude.mcpAddManual'))

      expect(screen.getByText('claude.mcpServerName')).toBeInTheDocument()
      expect(screen.getByText('claude.mcpTransport')).toBeInTheDocument()
    })

    it('permet de saisir un nom et une commande pour un serveur stdio', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      await user.click(screen.getByText(/claude\.mcpInstalled/))
      await user.click(screen.getByText('claude.mcpAddManual'))

      const nameInput = screen.getByPlaceholderText('filesystem')
      await user.type(nameInput, 'my-server')

      const commandInput = screen.getByPlaceholderText('npx')
      await user.type(commandInput, 'npx')

      expect(nameInput).toHaveValue('my-server')
      expect(commandInput).toHaveValue('npx')
    })

    it('permet d annuler l ajout de serveur', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      await user.click(screen.getByText(/claude\.mcpInstalled/))
      await user.click(screen.getByText('claude.mcpAddManual'))

      // Form should be visible
      expect(screen.getByText('claude.mcpServerName')).toBeInTheDocument()

      await user.click(screen.getByText('common.cancel'))

      // Form should be hidden, add button visible again
      expect(screen.getByText('claude.mcpAddManual')).toBeInTheDocument()
    })
  })

  describe('filtrage par categorie', () => {
    it('filtre les serveurs par categorie au clic', async () => {
      const user = userEvent.setup()
      render(<McpPanel {...defaultProps} />)

      // Find the category chip button (not the group title) — use getAllByText since it appears in both chip and group
      const databaseElements = screen.getAllByText('claude.mcpCatDatabase')
      // The chip button is the one inside .mcp-catalog-categories
      const chipButton = databaseElements.find((el) => el.closest('.mcp-cat-chip'))
      await user.click(chipButton!)

      // Only PostgreSQL should be visible
      await waitFor(() => {
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument()
        expect(screen.queryByText('Filesystem')).not.toBeInTheDocument()
      })
    })
  })
})
