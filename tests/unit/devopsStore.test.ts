import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type {
  DevOpsFile,
  DevOpsConnection,
  PipelineDefinition,
  PipelineRun,
  PipelineStatus,
} from '../../src/shared/types'

// Mock notificationStore (used by detectAndNotifyChanges)
vi.mock('../../src/renderer/lib/stores/notificationStore', () => ({
  pushNotification: vi.fn(),
}))

// Mock window.kanbai API
const mockDevOpsApi = {
  load: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  testConnection: vi.fn(),
  listPipelines: vi.fn(),
  getPipelineRuns: vi.fn(),
  getBuildTimeline: vi.fn(),
  runPipeline: vi.fn(),
  getApprovals: vi.fn(),
  approve: vi.fn(),
  getBuildLog: vi.fn(),
}

vi.stubGlobal('window', {
  kanbai: { devops: mockDevOpsApi, notify: vi.fn() },
})

const { useDevOpsStore, selectGlobalPipelineStatus } = await import(
  '../../src/renderer/features/devops/devops-store'
)

function makeConnection(overrides: Partial<DevOpsConnection> = {}): DevOpsConnection {
  return {
    id: 'conn-1',
    name: 'Test Connection',
    provider: 'azure-devops',
    organizationUrl: 'https://dev.azure.com/myorg',
    projectName: 'MyProject',
    auth: { method: 'pat', token: 'test-token' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeDevOpsFile(overrides: Partial<DevOpsFile> = {}): DevOpsFile {
  return {
    version: 1,
    connections: [],
    ...overrides,
  }
}

function makePipelineRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: 100,
    name: 'Run #100',
    status: 'succeeded',
    result: 'succeeded',
    startTime: '2025-06-01T10:00:00Z',
    finishTime: '2025-06-01T10:05:00Z',
    url: 'https://dev.azure.com/run/100',
    sourceBranch: 'refs/heads/main',
    sourceVersion: 'abc123',
    requestedBy: 'user@test.com',
    parameters: {},
    ...overrides,
  }
}

function makePipeline(overrides: Partial<PipelineDefinition> = {}): PipelineDefinition {
  return {
    id: 1,
    name: 'Build Pipeline',
    folder: '\\',
    revision: 1,
    url: 'https://dev.azure.com/pipeline/1',
    latestRun: null,
    ...overrides,
  }
}

const initialState = {
  data: null,
  loading: false,
  activeConnectionId: null,
  pipelines: [],
  pipelinesLoading: false,
  pipelinesError: null,
  selectedPipelineId: null,
  pipelineRuns: [],
  runsLoading: false,
  monitoringActive: false,
  selectedRunId: null,
  expandedRunId: null,
  runStages: [],
  stagesLoading: false,
  runApprovals: [],
  approvalsLoading: false,
  approving: null,
  allRunApprovals: [],
  allApprovalsLoading: false,
  jobLogs: {},
  jobLogsLoading: {},
  jobLogsError: {},
}

describe('useDevOpsStore', () => {
  beforeEach(() => {
    useDevOpsStore.setState(initialState)
    vi.clearAllMocks()
    mockDevOpsApi.save.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Ensure monitoring is stopped to avoid leaking timers
    useDevOpsStore.getState().stopMonitoring()
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useDevOpsStore.getState()

      expect(state.data).toBeNull()
      expect(state.loading).toBe(false)
      expect(state.activeConnectionId).toBeNull()
      expect(state.pipelines).toEqual([])
      expect(state.pipelinesLoading).toBe(false)
      expect(state.pipelinesError).toBeNull()
      expect(state.selectedPipelineId).toBeNull()
      expect(state.pipelineRuns).toEqual([])
      expect(state.runsLoading).toBe(false)
      expect(state.monitoringActive).toBe(false)
      expect(state.selectedRunId).toBeNull()
      expect(state.expandedRunId).toBeNull()
      expect(state.runStages).toEqual([])
      expect(state.stagesLoading).toBe(false)
      expect(state.runApprovals).toEqual([])
      expect(state.approvalsLoading).toBe(false)
      expect(state.approving).toBeNull()
      expect(state.jobLogs).toEqual({})
      expect(state.jobLogsLoading).toEqual({})
      expect(state.jobLogsError).toEqual({})
    })
  })

  describe('loadData', () => {
    it('charge les donnees et desactive loading', async () => {
      const file = makeDevOpsFile({ connections: [makeConnection()] })
      mockDevOpsApi.load.mockResolvedValue(file)

      await useDevOpsStore.getState().loadData('/project/path')

      const state = useDevOpsStore.getState()
      expect(state.data).toEqual(file)
      expect(state.loading).toBe(false)
      expect(mockDevOpsApi.load).toHaveBeenCalledWith('/project/path')
    })

    it('auto-selectionne la premiere connexion si aucune active', async () => {
      const conn = makeConnection({ id: 'auto-conn' })
      const file = makeDevOpsFile({ connections: [conn] })
      mockDevOpsApi.load.mockResolvedValue(file)

      await useDevOpsStore.getState().loadData('/project/path')

      expect(useDevOpsStore.getState().activeConnectionId).toBe('auto-conn')
    })

    it('ne change pas la connexion active si deja definie', async () => {
      useDevOpsStore.setState({ activeConnectionId: 'existing-conn' })
      const conn = makeConnection({ id: 'new-conn' })
      const file = makeDevOpsFile({ connections: [conn] })
      mockDevOpsApi.load.mockResolvedValue(file)

      await useDevOpsStore.getState().loadData('/project/path')

      expect(useDevOpsStore.getState().activeConnectionId).toBe('existing-conn')
    })

    it('gere les erreurs et desactive loading', async () => {
      mockDevOpsApi.load.mockRejectedValue(new Error('Network error'))

      await useDevOpsStore.getState().loadData('/project/path')

      const state = useDevOpsStore.getState()
      expect(state.loading).toBe(false)
      expect(state.data).toBeNull()
    })
  })

  describe('saveData', () => {
    it('sauvegarde les donnees via l api', async () => {
      const file = makeDevOpsFile({ connections: [makeConnection()] })
      useDevOpsStore.setState({ data: file })

      await useDevOpsStore.getState().saveData('/project/path')

      expect(mockDevOpsApi.save).toHaveBeenCalledWith('/project/path', file)
    })

    it('ne fait rien si data est null', async () => {
      useDevOpsStore.setState({ data: null })

      await useDevOpsStore.getState().saveData('/project/path')

      expect(mockDevOpsApi.save).not.toHaveBeenCalled()
    })
  })

  describe('addConnection', () => {
    it('ajoute une connexion avec un id genere et sauvegarde', async () => {
      const file = makeDevOpsFile()
      useDevOpsStore.setState({ data: file })

      const connectionData = {
        name: 'New Connection',
        organizationUrl: 'https://dev.azure.com/org',
        projectName: 'Project',
        auth: { method: 'pat' as const, token: 'tok' },
      }

      await useDevOpsStore.getState().addConnection('/project/path', connectionData)

      const state = useDevOpsStore.getState()
      expect(state.data!.connections).toHaveLength(1)
      expect(state.data!.connections[0]!.name).toBe('New Connection')
      expect(state.data!.connections[0]!.id).toBeTruthy()
      expect(state.data!.connections[0]!.createdAt).toBeTypeOf('number')
      expect(state.data!.connections[0]!.updatedAt).toBeTypeOf('number')
      expect(state.activeConnectionId).toBe(state.data!.connections[0]!.id)
      expect(mockDevOpsApi.save).toHaveBeenCalledOnce()
    })

    it('ne fait rien si data est null', async () => {
      useDevOpsStore.setState({ data: null })

      await useDevOpsStore.getState().addConnection('/project/path', {
        name: 'x',
        organizationUrl: 'x',
        projectName: 'x',
        auth: { method: 'pat' as const, token: 'x' },
      })

      expect(mockDevOpsApi.save).not.toHaveBeenCalled()
    })
  })

  describe('updateConnection', () => {
    it('met a jour la connexion et sauvegarde', async () => {
      const conn = makeConnection({ id: 'conn-1', name: 'Old Name' })
      const file = makeDevOpsFile({ connections: [conn] })
      useDevOpsStore.setState({ data: file })

      await useDevOpsStore.getState().updateConnection('/project/path', 'conn-1', { name: 'New Name' })

      const state = useDevOpsStore.getState()
      expect(state.data!.connections[0]!.name).toBe('New Name')
      expect(state.data!.connections[0]!.updatedAt).toBeGreaterThanOrEqual(conn.updatedAt)
      expect(mockDevOpsApi.save).toHaveBeenCalledOnce()
    })

    it('ne fait rien si data est null', async () => {
      useDevOpsStore.setState({ data: null })

      await useDevOpsStore.getState().updateConnection('/project/path', 'conn-1', { name: 'x' })

      expect(mockDevOpsApi.save).not.toHaveBeenCalled()
    })
  })

  describe('deleteConnection', () => {
    it('supprime la connexion et sauvegarde', async () => {
      const conn = makeConnection({ id: 'conn-1' })
      const file = makeDevOpsFile({ connections: [conn] })
      useDevOpsStore.setState({ data: file, activeConnectionId: 'conn-1' })

      await useDevOpsStore.getState().deleteConnection('/project/path', 'conn-1')

      const state = useDevOpsStore.getState()
      expect(state.data!.connections).toHaveLength(0)
      expect(state.activeConnectionId).toBeNull()
      expect(state.pipelines).toEqual([])
      expect(state.selectedPipelineId).toBeNull()
      expect(state.pipelineRuns).toEqual([])
      expect(mockDevOpsApi.save).toHaveBeenCalledOnce()
    })

    it('selectionne la premiere connexion restante si la connexion active est supprimee', async () => {
      const conn1 = makeConnection({ id: 'conn-1' })
      const conn2 = makeConnection({ id: 'conn-2', name: 'Second' })
      const file = makeDevOpsFile({ connections: [conn1, conn2] })
      useDevOpsStore.setState({ data: file, activeConnectionId: 'conn-1' })

      await useDevOpsStore.getState().deleteConnection('/project/path', 'conn-1')

      expect(useDevOpsStore.getState().activeConnectionId).toBe('conn-2')
    })

    it('ne change pas la connexion active si une autre est supprimee', async () => {
      const conn1 = makeConnection({ id: 'conn-1' })
      const conn2 = makeConnection({ id: 'conn-2' })
      const file = makeDevOpsFile({ connections: [conn1, conn2] })
      useDevOpsStore.setState({ data: file, activeConnectionId: 'conn-1' })

      await useDevOpsStore.getState().deleteConnection('/project/path', 'conn-2')

      expect(useDevOpsStore.getState().activeConnectionId).toBe('conn-1')
    })
  })

  describe('setActiveConnection', () => {
    it('reinitialise les pipelines et l etat associe', () => {
      useDevOpsStore.setState({
        pipelines: [makePipeline()],
        selectedPipelineId: 1,
        pipelineRuns: [makePipelineRun()],
        pipelinesError: 'old error',
        selectedRunId: 42,
        runStages: [{ id: 's1', name: 'Stage', order: 1, status: 'succeeded', startTime: null, finishTime: null, result: 'succeeded', errorCount: 0, warningCount: 0, jobs: [] }],
      })

      useDevOpsStore.getState().setActiveConnection('conn-2')

      const state = useDevOpsStore.getState()
      expect(state.activeConnectionId).toBe('conn-2')
      expect(state.pipelines).toEqual([])
      expect(state.selectedPipelineId).toBeNull()
      expect(state.pipelineRuns).toEqual([])
      expect(state.pipelinesError).toBeNull()
      expect(state.selectedRunId).toBeNull()
      expect(state.runStages).toEqual([])
    })

    it('accepte null pour desactiver', () => {
      useDevOpsStore.setState({ activeConnectionId: 'conn-1' })

      useDevOpsStore.getState().setActiveConnection(null)

      expect(useDevOpsStore.getState().activeConnectionId).toBeNull()
    })
  })

  describe('testConnection', () => {
    it('delegue l appel a l api', async () => {
      const conn = makeConnection()
      mockDevOpsApi.testConnection.mockResolvedValue({ success: true })

      const result = await useDevOpsStore.getState().testConnection(conn)

      expect(result).toEqual({ success: true })
      expect(mockDevOpsApi.testConnection).toHaveBeenCalledWith(conn)
    })
  })

  describe('selectPipeline', () => {
    it('reinitialise les runs et les stages', () => {
      useDevOpsStore.setState({
        pipelineRuns: [makePipelineRun()],
        selectedRunId: 100,
        runStages: [{ id: 's1', name: 'Stage', order: 1, status: 'succeeded', startTime: null, finishTime: null, result: 'succeeded', errorCount: 0, warningCount: 0, jobs: [] }],
      })

      useDevOpsStore.getState().selectPipeline(5)

      const state = useDevOpsStore.getState()
      expect(state.selectedPipelineId).toBe(5)
      expect(state.pipelineRuns).toEqual([])
      expect(state.selectedRunId).toBeNull()
      expect(state.runStages).toEqual([])
    })

    it('accepte null pour deselectionner', () => {
      useDevOpsStore.setState({ selectedPipelineId: 5 })

      useDevOpsStore.getState().selectPipeline(null)

      expect(useDevOpsStore.getState().selectedPipelineId).toBeNull()
    })
  })

  describe('selectRun', () => {
    it('reinitialise les stages', () => {
      useDevOpsStore.setState({
        runStages: [{ id: 's1', name: 'Stage', order: 1, status: 'succeeded', startTime: null, finishTime: null, result: 'succeeded', errorCount: 0, warningCount: 0, jobs: [] }],
      })

      useDevOpsStore.getState().selectRun(200)

      const state = useDevOpsStore.getState()
      expect(state.selectedRunId).toBe(200)
      expect(state.runStages).toEqual([])
    })
  })

  describe('loadPipelines', () => {
    it('charge les pipelines avec succes', async () => {
      const conn = makeConnection()
      const pipeline = makePipeline({ id: 1, name: 'CI' })
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [pipeline] })

      await useDevOpsStore.getState().loadPipelines(conn)

      const state = useDevOpsStore.getState()
      expect(state.pipelines).toHaveLength(1)
      expect(state.pipelines[0]!.name).toBe('CI')
      expect(state.pipelinesLoading).toBe(false)
      expect(state.pipelinesError).toBeNull()
    })

    it('applique l ordre sauvegarde', async () => {
      const conn = makeConnection({ id: 'conn-1' })
      const p1 = makePipeline({ id: 1, name: 'First' })
      const p2 = makePipeline({ id: 2, name: 'Second' })
      const p3 = makePipeline({ id: 3, name: 'Third' })
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [p1, p2, p3] })
      const file = makeDevOpsFile({
        connections: [conn],
        pipelineOrder: { 'conn-1': [3, 1, 2] },
      })
      useDevOpsStore.setState({ data: file, activeConnectionId: 'conn-1' })

      await useDevOpsStore.getState().loadPipelines(conn)

      const state = useDevOpsStore.getState()
      expect(state.pipelines.map((p) => p.id)).toEqual([3, 1, 2])
    })

    it('ajoute les nouveaux pipelines a la fin si non dans l ordre sauvegarde', async () => {
      const conn = makeConnection({ id: 'conn-1' })
      const p1 = makePipeline({ id: 1, name: 'First' })
      const p2 = makePipeline({ id: 2, name: 'Second' })
      const p3 = makePipeline({ id: 3, name: 'NewPipeline' })
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [p1, p2, p3] })
      const file = makeDevOpsFile({
        connections: [conn],
        pipelineOrder: { 'conn-1': [2, 1] },
      })
      useDevOpsStore.setState({ data: file, activeConnectionId: 'conn-1' })

      await useDevOpsStore.getState().loadPipelines(conn)

      const state = useDevOpsStore.getState()
      expect(state.pipelines.map((p) => p.id)).toEqual([2, 1, 3])
    })

    it('gere l erreur de l api', async () => {
      const conn = makeConnection()
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: false, error: 'Unauthorized' })

      await useDevOpsStore.getState().loadPipelines(conn)

      const state = useDevOpsStore.getState()
      expect(state.pipelines).toEqual([])
      expect(state.pipelinesLoading).toBe(false)
      expect(state.pipelinesError).toBe('Unauthorized')
    })

    it('gere les exceptions et met a jour pipelinesError', async () => {
      const conn = makeConnection()
      mockDevOpsApi.listPipelines.mockRejectedValue(new Error('Network error'))

      await useDevOpsStore.getState().loadPipelines(conn)

      const state = useDevOpsStore.getState()
      expect(state.pipelines).toEqual([])
      expect(state.pipelinesLoading).toBe(false)
      expect(state.pipelinesError).toBe('Error: Network error')
    })
  })

  describe('loadPipelineRuns', () => {
    it('charge les runs et les trie par date descendante', async () => {
      const conn = makeConnection()
      const oldRun = makePipelineRun({ id: 1, startTime: '2025-01-01T10:00:00Z' })
      const newRun = makePipelineRun({ id: 2, startTime: '2025-06-01T10:00:00Z' })
      mockDevOpsApi.getPipelineRuns.mockResolvedValue({ success: true, runs: [oldRun, newRun] })
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals: [] })

      await useDevOpsStore.getState().loadPipelineRuns(conn, 1)

      const state = useDevOpsStore.getState()
      expect(state.pipelineRuns[0]!.id).toBe(2)
      expect(state.pipelineRuns[1]!.id).toBe(1)
      expect(state.runsLoading).toBe(false)
    })

    it('place les runs sans startTime en premier (les plus recents)', async () => {
      const conn = makeConnection()
      const startedRun = makePipelineRun({ id: 1, startTime: '2025-06-01T10:00:00Z' })
      const queuedRun = makePipelineRun({ id: 2, startTime: null, status: 'notStarted' })
      mockDevOpsApi.getPipelineRuns.mockResolvedValue({ success: true, runs: [startedRun, queuedRun] })
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals: [] })

      await useDevOpsStore.getState().loadPipelineRuns(conn, 1)

      const state = useDevOpsStore.getState()
      expect(state.pipelineRuns[0]!.id).toBe(2)
    })

    it('gere l echec de l api', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getPipelineRuns.mockResolvedValue({ success: false })

      await useDevOpsStore.getState().loadPipelineRuns(conn, 1)

      const state = useDevOpsStore.getState()
      expect(state.pipelineRuns).toEqual([])
      expect(state.runsLoading).toBe(false)
      expect(state.allRunApprovals).toEqual([])
      expect(state.allApprovalsLoading).toBe(false)
    })

    it('gere les exceptions', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getPipelineRuns.mockRejectedValue(new Error('Timeout'))

      await useDevOpsStore.getState().loadPipelineRuns(conn, 1)

      const state = useDevOpsStore.getState()
      expect(state.pipelineRuns).toEqual([])
      expect(state.runsLoading).toBe(false)
    })
  })

  describe('loadRunStages', () => {
    it('charge les stages avec succes', async () => {
      const conn = makeConnection()
      const stages = [{ id: 's1', name: 'Build', order: 1, status: 'succeeded' as PipelineStatus, startTime: null, finishTime: null, result: 'succeeded', errorCount: 0, warningCount: 0, jobs: [] }]
      mockDevOpsApi.getBuildTimeline.mockResolvedValue({ success: true, stages })

      await useDevOpsStore.getState().loadRunStages(conn, 100)

      const state = useDevOpsStore.getState()
      expect(state.runStages).toEqual(stages)
      expect(state.stagesLoading).toBe(false)
    })

    it('retourne un tableau vide en cas d echec', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getBuildTimeline.mockResolvedValue({ success: false })

      await useDevOpsStore.getState().loadRunStages(conn, 100)

      const state = useDevOpsStore.getState()
      expect(state.runStages).toEqual([])
      expect(state.stagesLoading).toBe(false)
    })
  })

  describe('runPipeline', () => {
    it('lance un pipeline et rafraichit les runs en cas de succes', async () => {
      const conn = makeConnection()
      mockDevOpsApi.runPipeline.mockResolvedValue({ success: true })
      mockDevOpsApi.getPipelineRuns.mockResolvedValue({ success: true, runs: [] })
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals: [] })

      const result = await useDevOpsStore.getState().runPipeline(conn, 1, 'main', { env: 'prod' })

      expect(result).toEqual({ success: true, error: undefined })
      expect(mockDevOpsApi.runPipeline).toHaveBeenCalledWith(conn, 1, 'main', { env: 'prod' })
      expect(mockDevOpsApi.getPipelineRuns).toHaveBeenCalledWith(conn, 1)
    })

    it('retourne l erreur en cas d echec sans rafraichir les runs', async () => {
      const conn = makeConnection()
      mockDevOpsApi.runPipeline.mockResolvedValue({ success: false, error: 'Permission denied' })

      const result = await useDevOpsStore.getState().runPipeline(conn, 1)

      expect(result).toEqual({ success: false, error: 'Permission denied' })
      expect(mockDevOpsApi.getPipelineRuns).not.toHaveBeenCalled()
    })
  })

  describe('startMonitoring / stopMonitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('active le monitoring et appelle loadPipelines a intervalle', async () => {
      const conn = makeConnection()
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [] })

      useDevOpsStore.getState().startMonitoring(conn)

      expect(useDevOpsStore.getState().monitoringActive).toBe(true)

      await vi.advanceTimersByTimeAsync(30_000)

      expect(mockDevOpsApi.listPipelines).toHaveBeenCalledTimes(1)

      useDevOpsStore.getState().stopMonitoring()
    })

    it('rafraichit aussi les runs du pipeline selectionne', async () => {
      const conn = makeConnection()
      useDevOpsStore.setState({ selectedPipelineId: 5 })
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [] })
      mockDevOpsApi.getPipelineRuns.mockResolvedValue({ success: true, runs: [] })
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals: [] })

      useDevOpsStore.getState().startMonitoring(conn)

      await vi.advanceTimersByTimeAsync(30_000)

      expect(mockDevOpsApi.getPipelineRuns).toHaveBeenCalledWith(conn, 5)

      useDevOpsStore.getState().stopMonitoring()
    })

    it('arrete le monitoring correctement', () => {
      const conn = makeConnection()
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [] })

      useDevOpsStore.getState().startMonitoring(conn)
      useDevOpsStore.getState().stopMonitoring()

      expect(useDevOpsStore.getState().monitoringActive).toBe(false)
    })

    it('arrete le monitoring precedent avant d en demarrer un nouveau', async () => {
      const conn1 = makeConnection({ id: 'conn-1' })
      const conn2 = makeConnection({ id: 'conn-2' })
      mockDevOpsApi.listPipelines.mockResolvedValue({ success: true, pipelines: [] })

      useDevOpsStore.getState().startMonitoring(conn1)
      useDevOpsStore.getState().startMonitoring(conn2)

      await vi.advanceTimersByTimeAsync(30_000)

      // Only 1 call (from the second monitoring) instead of 2
      expect(mockDevOpsApi.listPipelines).toHaveBeenCalledTimes(1)

      useDevOpsStore.getState().stopMonitoring()
    })
  })

  describe('expandRun', () => {
    it('charge les stages et les approvals en parallele', async () => {
      const conn = makeConnection()
      const stages = [{ id: 's1', name: 'Build', order: 1, status: 'succeeded' as PipelineStatus, startTime: null, finishTime: null, result: 'succeeded', errorCount: 0, warningCount: 0, jobs: [] }]
      const approvals = [{ id: 'a1', buildId: 100, status: 'pending' as const, createdOn: '2025-01-01', instructions: '', minRequiredApprovers: 1, steps: [] }]
      mockDevOpsApi.getBuildTimeline.mockResolvedValue({ success: true, stages })
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals })

      await useDevOpsStore.getState().expandRun(conn, 100)

      const state = useDevOpsStore.getState()
      expect(state.expandedRunId).toBe(100)
      expect(state.runStages).toEqual(stages)
      expect(state.stagesLoading).toBe(false)
      expect(state.runApprovals).toEqual(approvals)
      expect(state.approvalsLoading).toBe(false)
    })

    it('gere les erreurs et reinitialise l etat', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getBuildTimeline.mockRejectedValue(new Error('Timeout'))
      mockDevOpsApi.getApprovals.mockRejectedValue(new Error('Timeout'))

      await useDevOpsStore.getState().expandRun(conn, 100)

      const state = useDevOpsStore.getState()
      expect(state.runStages).toEqual([])
      expect(state.stagesLoading).toBe(false)
      expect(state.runApprovals).toEqual([])
      expect(state.approvalsLoading).toBe(false)
    })
  })

  describe('collapseRun', () => {
    it('reinitialise l etat du run etendu', () => {
      useDevOpsStore.setState({
        expandedRunId: 100,
        runStages: [{ id: 's1', name: 'Stage', order: 1, status: 'succeeded' as PipelineStatus, startTime: null, finishTime: null, result: 'succeeded', errorCount: 0, warningCount: 0, jobs: [] }],
        runApprovals: [{ id: 'a1', buildId: 100, status: 'pending' as const, createdOn: '', instructions: '', minRequiredApprovers: 1, steps: [] }],
        jobLogs: { 'job-1': 'log content' },
        jobLogsLoading: { 'job-1': false },
        jobLogsError: { 'job-1': false },
      })

      useDevOpsStore.getState().collapseRun()

      const state = useDevOpsStore.getState()
      expect(state.expandedRunId).toBeNull()
      expect(state.runStages).toEqual([])
      expect(state.runApprovals).toEqual([])
      expect(state.jobLogs).toEqual({})
      expect(state.jobLogsLoading).toEqual({})
      expect(state.jobLogsError).toEqual({})
    })
  })

  describe('reorderPipelines', () => {
    it('deplace un pipeline et sauvegarde le nouvel ordre', async () => {
      const conn = makeConnection({ id: 'conn-1' })
      const p1 = makePipeline({ id: 1, name: 'First' })
      const p2 = makePipeline({ id: 2, name: 'Second' })
      const p3 = makePipeline({ id: 3, name: 'Third' })
      const file = makeDevOpsFile({ connections: [conn] })
      useDevOpsStore.setState({ data: file, activeConnectionId: 'conn-1', pipelines: [p1, p2, p3] })

      await useDevOpsStore.getState().reorderPipelines('/project/path', 0, 2)

      const state = useDevOpsStore.getState()
      expect(state.pipelines.map((p) => p.id)).toEqual([2, 3, 1])
      expect(state.data!.pipelineOrder!['conn-1']).toEqual([2, 3, 1])
      expect(mockDevOpsApi.save).toHaveBeenCalledOnce()
    })

    it('ne fait rien si data est null', async () => {
      useDevOpsStore.setState({ data: null, activeConnectionId: 'conn-1', pipelines: [makePipeline()] })

      await useDevOpsStore.getState().reorderPipelines('/project/path', 0, 1)

      expect(mockDevOpsApi.save).not.toHaveBeenCalled()
    })

    it('ne fait rien si activeConnectionId est null', async () => {
      const file = makeDevOpsFile()
      useDevOpsStore.setState({ data: file, activeConnectionId: null, pipelines: [makePipeline()] })

      await useDevOpsStore.getState().reorderPipelines('/project/path', 0, 1)

      expect(mockDevOpsApi.save).not.toHaveBeenCalled()
    })
  })

  describe('loadJobLog', () => {
    it('charge le log d un job avec succes', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getBuildLog.mockResolvedValue({ success: true, content: 'Build output...' })

      await useDevOpsStore.getState().loadJobLog(conn, 100, 'job-1', 42)

      const state = useDevOpsStore.getState()
      expect(state.jobLogs['job-1']).toBe('Build output...')
      expect(state.jobLogsLoading['job-1']).toBe(false)
      expect(state.jobLogsError['job-1']).toBe(false)
    })

    it('saute le chargement si le log est deja charge sans erreur', async () => {
      useDevOpsStore.setState({
        jobLogs: { 'job-1': 'Already loaded' },
        jobLogsLoading: {},
        jobLogsError: {},
      })
      const conn = makeConnection()

      await useDevOpsStore.getState().loadJobLog(conn, 100, 'job-1', 42)

      expect(mockDevOpsApi.getBuildLog).not.toHaveBeenCalled()
    })

    it('recharge si le log precedent etait en erreur', async () => {
      useDevOpsStore.setState({
        jobLogs: { 'job-1': 'Error: old error' },
        jobLogsLoading: {},
        jobLogsError: { 'job-1': true },
      })
      const conn = makeConnection()
      mockDevOpsApi.getBuildLog.mockResolvedValue({ success: true, content: 'Retry content' })

      await useDevOpsStore.getState().loadJobLog(conn, 100, 'job-1', 42)

      expect(mockDevOpsApi.getBuildLog).toHaveBeenCalledOnce()
      expect(useDevOpsStore.getState().jobLogs['job-1']).toBe('Retry content')
    })

    it('saute le chargement si deja en cours', async () => {
      useDevOpsStore.setState({
        jobLogs: {},
        jobLogsLoading: { 'job-1': true },
        jobLogsError: {},
      })
      const conn = makeConnection()

      await useDevOpsStore.getState().loadJobLog(conn, 100, 'job-1', 42)

      expect(mockDevOpsApi.getBuildLog).not.toHaveBeenCalled()
    })

    it('stocke l erreur en cas d echec', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getBuildLog.mockResolvedValue({ success: false, error: 'Not found' })

      await useDevOpsStore.getState().loadJobLog(conn, 100, 'job-1', 42)

      const state = useDevOpsStore.getState()
      expect(state.jobLogs['job-1']).toBe('Error: Not found')
      expect(state.jobLogsError['job-1']).toBe(true)
      expect(state.jobLogsLoading['job-1']).toBe(false)
    })
  })

  describe('approveRun', () => {
    it('approuve et rafraichit les approvals', async () => {
      const conn = makeConnection()
      useDevOpsStore.setState({ pipelineRuns: [makePipelineRun({ id: 100 })] })
      mockDevOpsApi.approve.mockResolvedValue({ success: true })
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals: [] })

      const result = await useDevOpsStore.getState().approveRun(conn, 'approval-1', 'approved', 'LGTM')

      expect(result).toEqual({ success: true, error: undefined })
      expect(mockDevOpsApi.approve).toHaveBeenCalledWith(conn, 'approval-1', 'approved', 'LGTM')
      expect(useDevOpsStore.getState().approving).toBeNull()
    })

    it('gere les erreurs et reinitialise approving', async () => {
      const conn = makeConnection()
      mockDevOpsApi.approve.mockRejectedValue(new Error('Server error'))

      const result = await useDevOpsStore.getState().approveRun(conn, 'approval-1', 'rejected')

      expect(result).toEqual({ success: false, error: 'Error: Server error' })
      expect(useDevOpsStore.getState().approving).toBeNull()
    })
  })

  describe('loadApprovalsForRuns', () => {
    it('charge les approvals pour plusieurs builds', async () => {
      const conn = makeConnection()
      const approvals = [
        { id: 'a1', buildId: 100, status: 'pending' as const, createdOn: '', instructions: '', minRequiredApprovers: 1, steps: [] },
      ]
      mockDevOpsApi.getApprovals.mockResolvedValue({ success: true, approvals })

      await useDevOpsStore.getState().loadApprovalsForRuns(conn, [100, 200])

      const state = useDevOpsStore.getState()
      expect(state.allRunApprovals).toEqual(approvals)
      expect(state.allApprovalsLoading).toBe(false)
      expect(mockDevOpsApi.getApprovals).toHaveBeenCalledWith(conn, [100, 200])
    })

    it('gere les erreurs', async () => {
      const conn = makeConnection()
      mockDevOpsApi.getApprovals.mockRejectedValue(new Error('Timeout'))

      await useDevOpsStore.getState().loadApprovalsForRuns(conn, [100])

      const state = useDevOpsStore.getState()
      expect(state.allRunApprovals).toEqual([])
      expect(state.allApprovalsLoading).toBe(false)
    })
  })

  describe('selectGlobalPipelineStatus', () => {
    it('retourne null si aucun pipeline', () => {
      const result = selectGlobalPipelineStatus({ pipelines: [] } as ReturnType<typeof useDevOpsStore.getState>)

      expect(result).toBeNull()
    })

    it('retourne null si aucun pipeline n a de latestRun', () => {
      const pipelines = [makePipeline({ latestRun: null }), makePipeline({ id: 2, latestRun: null })]

      const result = selectGlobalPipelineStatus({ pipelines } as ReturnType<typeof useDevOpsStore.getState>)

      expect(result).toBeNull()
    })

    it('retourne le statut du pipeline avec le run le plus recent par finishTime', () => {
      const oldRun = makePipelineRun({ id: 1, status: 'succeeded', finishTime: '2025-01-01T10:00:00Z', startTime: '2025-01-01T09:00:00Z' })
      const newRun = makePipelineRun({ id: 2, status: 'failed', finishTime: '2025-06-01T10:00:00Z', startTime: '2025-06-01T09:00:00Z' })
      const pipelines = [
        makePipeline({ id: 1, name: 'Old CI', latestRun: oldRun }),
        makePipeline({ id: 2, name: 'New CD', latestRun: newRun }),
      ]

      const result = selectGlobalPipelineStatus({ pipelines } as ReturnType<typeof useDevOpsStore.getState>)

      expect(result).toEqual({ status: 'failed', pipelineName: 'New CD' })
    })

    it('utilise startTime si finishTime est absent', () => {
      const runningRun = makePipelineRun({ id: 1, status: 'running', finishTime: null, startTime: '2025-06-15T10:00:00Z' })
      const finishedRun = makePipelineRun({ id: 2, status: 'succeeded', finishTime: '2025-06-01T10:00:00Z', startTime: '2025-06-01T09:00:00Z' })
      const pipelines = [
        makePipeline({ id: 1, name: 'Running', latestRun: runningRun }),
        makePipeline({ id: 2, name: 'Finished', latestRun: finishedRun }),
      ]

      const result = selectGlobalPipelineStatus({ pipelines } as ReturnType<typeof useDevOpsStore.getState>)

      expect(result).toEqual({ status: 'running', pipelineName: 'Running' })
    })

    it('retourne null si les runs n ont ni finishTime ni startTime', () => {
      const run = makePipelineRun({ id: 1, status: 'notStarted', finishTime: null, startTime: null })
      const pipelines = [makePipeline({ id: 1, name: 'Queued', latestRun: run })]

      const result = selectGlobalPipelineStatus({ pipelines } as ReturnType<typeof useDevOpsStore.getState>)

      expect(result).toBeNull()
    })

    it('ignore les pipelines sans latestRun dans la comparaison', () => {
      const run = makePipelineRun({ id: 1, status: 'succeeded', finishTime: '2025-06-01T10:00:00Z' })
      const pipelines = [
        makePipeline({ id: 1, name: 'No Run', latestRun: null }),
        makePipeline({ id: 2, name: 'Has Run', latestRun: run }),
      ]

      const result = selectGlobalPipelineStatus({ pipelines } as ReturnType<typeof useDevOpsStore.getState>)

      expect(result).toEqual({ status: 'succeeded', pipelineName: 'Has Run' })
    })
  })
})
