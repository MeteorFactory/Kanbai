import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock CSS
vi.mock('../../src/renderer/features/code-analysis/analysis.css', () => ({}))

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

const mockDetectAllTools = vi.fn()
const mockRunAll = vi.fn()
const mockSetSeverityFilter = vi.fn()
const mockSetSelectedFinding = vi.fn()
const mockSetActiveReportId = vi.fn()
const mockSetSelectedProjectId = vi.fn()

const ALL_REPORTS_ID = '__all__'
const ALL_PROJECTS_ID = '__all_projects__'

const defaultHookState = {
  t: (key: string, params?: Record<string, string>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  workspaceProjects: [
    { id: 'proj-1', name: 'My Project', path: '/my-project', workspaceId: 'ws-1' },
  ],
  selectedProjectId: 'proj-1' as string | null,
  setSelectedProjectId: mockSetSelectedProjectId,
  collapsedProjects: new Set<string>(),
  toggleProjectCollapse: vi.fn(),
  relevantToolsByProject: new Map([
    ['proj-1', [
      { id: 'eslint', name: 'ESLint', languages: ['javascript', 'typescript'], installed: true, category: 'linter' },
    ]],
  ]),
  detectAllTools: mockDetectAllTools,
  detectingTools: false,
  installedCount: 1,
  reportsByProject: new Map<string, Array<{ id: string; toolId: string; summary: { total: number; critical: number; high: number; medium: number; low: number; info: number } }>>(),
  currentReports: [] as Array<{ id: string }>,
  allReportsFlat: [] as Array<{ id: string }>,
  aggregatedReport: null as { summary: { total: number; critical: number; high: number; medium: number; low: number; info: number } } | null,
  activeReport: null as { id: string; toolId: string; toolName: string; error?: string; duration: number; summary: { total: number; critical: number; high: number; medium: number; low: number; info: number } } | null,
  activeReportId: ALL_REPORTS_ID as string,
  setActiveReportId: mockSetActiveReportId,
  projectGrade: null as string | null,
  findingsCountByProject: new Map<string, number>(),
  totalFindingsAllProjects: 0,
  runningTools: new Set<string>(),
  isAnyRunning: false,
  runningToolName: null as string | null,
  isToolRunningForProject: vi.fn().mockReturnValue(false),
  runAll: mockRunAll,
  runAllForProject: vi.fn(),
  runToolForProject: vi.fn(),
  cancelTool: vi.fn(),
  deleteReport: vi.fn(),
  reanalyze: vi.fn(),
  installingTools: new Set<string>(),
  installOutput: {} as Record<string, string>,
  activeInstallTool: null as string | null,
  setActiveInstallTool: vi.fn(),
  copiedInstallOutput: false,
  installTool: vi.fn(),
  copyInstallOutput: vi.fn(),
  installBufferRef: { current: null },
  filteredFindings: [] as Array<{ id: string; message: string; severity: string; file: string; line: number; rule?: string }>,
  grouped: [] as Array<[string, Array<{ id: string; message: string; severity: string; file: string; line: number; rule?: string }>]>,
  severityFilter: 'all' as string,
  setSeverityFilter: mockSetSeverityFilter,
  selectedFindings: new Set<string>(),
  toggleFinding: vi.fn(),
  selectAll: vi.fn(),
  deselectAll: vi.fn(),
  collapsedGroups: new Set<string>(),
  toggleGroup: vi.fn(),
  selectedFinding: null as { id: string } | null,
  setSelectedFinding: mockSetSelectedFinding,
  handleClickFinding: vi.fn(),
  handleNavigateToFile: vi.fn(),
  copiedError: false,
  copyError: vi.fn(),
  showTicketModal: false,
  setShowTicketModal: vi.fn(),
  ticketGroupBy: 'individual' as string,
  setTicketGroupBy: vi.fn(),
  ticketPriority: 'medium' as string,
  setTicketPriority: vi.fn(),
  ticketPreviewCount: 0,
  handleCreateTickets: vi.fn(),
  toastMessage: null as string | null,
  ALL_REPORTS_ID,
  ALL_PROJECTS_ID,
  toolsByProject: new Map([
    ['proj-1', [
      { id: 'eslint', name: 'ESLint', languages: ['javascript', 'typescript'], installed: true, category: 'linter' },
    ]],
  ]),
}

let hookState = { ...defaultHookState }

vi.mock('../../src/renderer/features/code-analysis/use-code-analysis', () => ({
  useCodeAnalysis: () => hookState,
  SEVERITY_ORDER: ['critical', 'high', 'medium', 'low', 'info'],
  formatDuration: (ms: number) => (ms / 1000).toFixed(1),
}))

import { CodeAnalysisPanel } from '../../src/renderer/components/CodeAnalysisPanel'

describe('CodeAnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookState = { ...defaultHookState }
  })

  describe('rendu initial', () => {
    it('affiche le titre de l analyse', () => {
      render(<CodeAnalysisPanel />)
      expect(screen.getByText('analysis.title')).toBeInTheDocument()
    })

    it('affiche le bouton de rafraichissement des outils', () => {
      render(<CodeAnalysisPanel />)
      expect(screen.getByTitle('common.refresh')).toBeInTheDocument()
    })

    it('affiche le message quand aucun projet n est actif', () => {
      hookState = { ...defaultHookState, workspaceProjects: [] }
      render(<CodeAnalysisPanel />)
      expect(screen.getByText('analysis.noProject')).toBeInTheDocument()
    })
  })

  describe('affichage des outils', () => {
    it('affiche la sidebar avec les outils pertinents', () => {
      render(<CodeAnalysisPanel />)
      // The sidebar shows project names and tool names
      expect(screen.getByText('My Project')).toBeInTheDocument()
      expect(screen.getByText('ESLint')).toBeInTheDocument()
    })

    it('affiche l etat vide quand il n y a pas de rapports', () => {
      render(<CodeAnalysisPanel />)
      expect(screen.getByText('analysis.emptyTitle')).toBeInTheDocument()
      expect(screen.getByText('analysis.emptyHint')).toBeInTheDocument()
    })

    it('affiche le bouton lancer l analyse quand des outils sont installes', () => {
      render(<CodeAnalysisPanel />)
      expect(screen.getByText(/analysis.launchAnalysis/)).toBeInTheDocument()
    })
  })

  describe('rendu des findings', () => {
    it('affiche le nombre de findings dans le header quand un rapport est actif', () => {
      hookState = {
        ...defaultHookState,
        activeReport: {
          id: 'report-1',
          toolId: 'eslint',
          toolName: 'ESLint',
          duration: 0,
          summary: { total: 5, critical: 0, high: 2, medium: 3, low: 0, info: 0 },
        },
        currentReports: [{ id: 'report-1' }],
        allReportsFlat: [{ id: 'report-1' }],
        activeReportId: 'report-1',
      }
      render(<CodeAnalysisPanel />)
      // Header count is in a span with class "analysis-header-count"
      const headerCount = document.querySelector('.analysis-header-count')
      expect(headerCount).not.toBeNull()
      expect(headerCount!.textContent).toContain('5')
      expect(headerCount!.textContent).toContain('analysis.findings')
    })
  })

  describe('etat vide', () => {
    it('affiche l indicateur d execution quand un outil tourne', () => {
      hookState = {
        ...defaultHookState,
        isAnyRunning: true,
        runningToolName: 'ESLint',
      }
      render(<CodeAnalysisPanel />)
      expect(screen.getByText(/analysis.runningTool/)).toBeInTheDocument()
    })

    it('cache le bouton lancer quand aucun outil n est installe', () => {
      hookState = { ...defaultHookState, installedCount: 0 }
      render(<CodeAnalysisPanel />)
      expect(screen.queryByText(/analysis.launchAnalysis/)).not.toBeInTheDocument()
    })
  })

  describe('detection des outils', () => {
    it('appelle detectAllTools au clic sur le bouton refresh', async () => {
      const user = userEvent.setup()
      render(<CodeAnalysisPanel />)

      await user.click(screen.getByTitle('common.refresh'))

      expect(mockDetectAllTools).toHaveBeenCalled()
    })
  })

  describe('grade du projet', () => {
    it('affiche le badge de grade quand il est disponible', () => {
      hookState = { ...defaultHookState, projectGrade: 'A' }
      render(<CodeAnalysisPanel />)
      expect(screen.getByText('A')).toBeInTheDocument()
    })
  })
})
