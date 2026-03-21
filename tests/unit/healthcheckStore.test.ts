import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.kanbai API
const mockHealthcheckApi = {
  load: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  execute: vi.fn(),
  startScheduler: vi.fn().mockResolvedValue(undefined),
  stopScheduler: vi.fn().mockResolvedValue(undefined),
  updateInterval: vi.fn().mockResolvedValue(undefined),
  getStatuses: vi.fn().mockResolvedValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
}

vi.stubGlobal('window', { kanbai: { healthcheck: mockHealthcheckApi } })

const { useHealthCheckStore } = await import('../../src/renderer/features/healthcheck/healthcheck-store')

function defaultData() {
  return { version: 1, checks: [], history: [], incidents: [] }
}

function makeCheck(overrides: Record<string, unknown> = {}) {
  return {
    id: 'check-1',
    name: 'Health Check 1',
    url: 'https://example.com/health',
    method: 'GET',
    expectedStatus: 200,
    headers: [],
    schedule: { enabled: false, interval: 30, unit: 'seconds' },
    notifyOnDown: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('useHealthCheckStore', () => {
  beforeEach(() => {
    useHealthCheckStore.setState({
      data: defaultData(),
      statuses: {},
      selectedCheckId: null,
      schedulerRunning: false,
      loading: false,
      currentProjectPath: null,
      dirty: false,
    })
    vi.clearAllMocks()
    mockHealthcheckApi.getStatuses.mockResolvedValue([])
    mockHealthcheckApi.save.mockResolvedValue(undefined)
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useHealthCheckStore.getState()
      expect(state.data).toEqual(defaultData())
      expect(state.statuses).toEqual({})
      expect(state.selectedCheckId).toBeNull()
      expect(state.schedulerRunning).toBe(false)
      expect(state.loading).toBe(false)
      expect(state.currentProjectPath).toBeNull()
      expect(state.dirty).toBe(false)
    })
  })

  describe('loadData', () => {
    it('charge les donnees depuis l API', async () => {
      const data = { ...defaultData(), checks: [makeCheck()] }
      mockHealthcheckApi.load.mockResolvedValue(data)
      mockHealthcheckApi.getStatuses.mockResolvedValue([])

      await useHealthCheckStore.getState().loadData('/project')

      const state = useHealthCheckStore.getState()
      expect(state.data.checks).toHaveLength(1)
      expect(state.loading).toBe(false)
      expect(state.currentProjectPath).toBe('/project')
      expect(state.dirty).toBe(false)
    })

    it('charge les statuses du scheduler', async () => {
      mockHealthcheckApi.load.mockResolvedValue(defaultData())
      mockHealthcheckApi.getStatuses.mockResolvedValue([
        { checkId: 'check-1', lastRun: Date.now(), isRunning: true },
      ])

      await useHealthCheckStore.getState().loadData('/project')

      const state = useHealthCheckStore.getState()
      expect(state.statuses['check-1']).toBeDefined()
      expect(state.schedulerRunning).toBe(true)
    })

    it('ne recharge pas si dirty pour le meme projet', async () => {
      useHealthCheckStore.setState({ currentProjectPath: '/project', dirty: true })

      await useHealthCheckStore.getState().loadData('/project')

      expect(mockHealthcheckApi.load).not.toHaveBeenCalled()
    })

    it('recharge si le projet change meme si dirty', async () => {
      useHealthCheckStore.setState({ currentProjectPath: '/old-project', dirty: true })
      mockHealthcheckApi.load.mockResolvedValue(defaultData())

      await useHealthCheckStore.getState().loadData('/new-project')

      expect(mockHealthcheckApi.load).toHaveBeenCalledWith('/new-project')
    })

    it('gere les erreurs de chargement', async () => {
      mockHealthcheckApi.load.mockRejectedValue(new Error('fail'))

      await useHealthCheckStore.getState().loadData('/project')

      const state = useHealthCheckStore.getState()
      expect(state.data).toEqual(defaultData())
      expect(state.loading).toBe(false)
      expect(state.currentProjectPath).toBe('/project')
    })
  })

  describe('importData', () => {
    it('importe les donnees et persiste', async () => {
      const data = { ...defaultData(), checks: [makeCheck()] }

      await useHealthCheckStore.getState().importData('/project', data as never)

      const state = useHealthCheckStore.getState()
      expect(state.data.checks).toHaveLength(1)
      expect(state.currentProjectPath).toBe('/project')
      expect(state.dirty).toBe(false)
      expect(mockHealthcheckApi.save).toHaveBeenCalledWith('/project', data)
    })
  })

  describe('saveData', () => {
    it('persiste les donnees courantes', async () => {
      const data = { ...defaultData(), checks: [makeCheck()] }
      useHealthCheckStore.setState({ data: data as never })

      await useHealthCheckStore.getState().saveData('/project')

      expect(mockHealthcheckApi.save).toHaveBeenCalledWith('/project', data)
      expect(useHealthCheckStore.getState().dirty).toBe(false)
    })
  })

  describe('addCheck', () => {
    it('ajoute un check avec les valeurs par defaut', async () => {
      await useHealthCheckStore.getState().addCheck('/project')

      const state = useHealthCheckStore.getState()
      expect(state.data.checks).toHaveLength(1)
      expect(state.data.checks[0]!.name).toBe('Health Check 1')
      expect(state.data.checks[0]!.url).toBe('')
      expect(state.data.checks[0]!.method).toBe('GET')
      expect(state.data.checks[0]!.expectedStatus).toBe(200)
      expect(state.selectedCheckId).toBe(state.data.checks[0]!.id)
      expect(mockHealthcheckApi.save).toHaveBeenCalled()
    })

    it('incremente le nom avec le nombre de checks', async () => {
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [makeCheck()] } as never,
      })

      await useHealthCheckStore.getState().addCheck('/project')

      const state = useHealthCheckStore.getState()
      expect(state.data.checks).toHaveLength(2)
      expect(state.data.checks[1]!.name).toBe('Health Check 2')
    })
  })

  describe('updateCheck', () => {
    it('met a jour un check existant', () => {
      const check = makeCheck()
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [check] } as never,
      })

      useHealthCheckStore.getState().updateCheck('/project', 'check-1', { name: 'Updated' })

      const state = useHealthCheckStore.getState()
      expect(state.data.checks[0]!.name).toBe('Updated')
      expect(state.dirty).toBe(true)
    })

    it('met a jour updatedAt', () => {
      const check = makeCheck({ updatedAt: 1000 })
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [check] } as never,
      })

      useHealthCheckStore.getState().updateCheck('/project', 'check-1', { url: 'https://new.com' })

      const state = useHealthCheckStore.getState()
      expect(state.data.checks[0]!.updatedAt).toBeGreaterThan(1000)
    })

    it('ne modifie pas les autres checks', () => {
      const check1 = makeCheck({ id: 'check-1', name: 'First' })
      const check2 = makeCheck({ id: 'check-2', name: 'Second' })
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [check1, check2] } as never,
      })

      useHealthCheckStore.getState().updateCheck('/project', 'check-1', { name: 'Updated' })

      const state = useHealthCheckStore.getState()
      expect(state.data.checks[1]!.name).toBe('Second')
    })
  })

  describe('deleteCheck', () => {
    it('supprime le check et ses donnees associees', async () => {
      const check = makeCheck()
      const history = [{ healthCheckId: 'check-1', timestamp: Date.now(), status: 200, duration: 100 }]
      const incidents = [{ healthCheckId: 'check-1', startedAt: Date.now() }]
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [check], history, incidents } as never,
      })

      await useHealthCheckStore.getState().deleteCheck('/project', 'check-1')

      const state = useHealthCheckStore.getState()
      expect(state.data.checks).toHaveLength(0)
      expect(state.data.history).toHaveLength(0)
      expect(state.data.incidents).toHaveLength(0)
      expect(mockHealthcheckApi.save).toHaveBeenCalled()
    })

    it('reset selectedCheckId si c etait le check selectionne', async () => {
      const check = makeCheck()
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [check] } as never,
        selectedCheckId: 'check-1',
      })

      await useHealthCheckStore.getState().deleteCheck('/project', 'check-1')

      expect(useHealthCheckStore.getState().selectedCheckId).toBeNull()
    })

    it('conserve selectedCheckId si c etait un autre check', async () => {
      const check1 = makeCheck({ id: 'check-1' })
      const check2 = makeCheck({ id: 'check-2' })
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [check1, check2] } as never,
        selectedCheckId: 'check-2',
      })

      await useHealthCheckStore.getState().deleteCheck('/project', 'check-1')

      expect(useHealthCheckStore.getState().selectedCheckId).toBe('check-2')
    })
  })

  describe('executeCheck', () => {
    it('execute un check et recharge les donnees', async () => {
      const check = makeCheck()
      const data = { ...defaultData(), checks: [check] }
      useHealthCheckStore.setState({ data: data as never })
      const logEntry = { healthCheckId: 'check-1', status: 200, duration: 50 }
      mockHealthcheckApi.execute.mockResolvedValue(logEntry)
      mockHealthcheckApi.load.mockResolvedValue(data)

      const result = await useHealthCheckStore.getState().executeCheck('/project', 'check-1')

      expect(result).toEqual(logEntry)
      expect(mockHealthcheckApi.execute).toHaveBeenCalledWith('/project', check, data)
      expect(mockHealthcheckApi.load).toHaveBeenCalledWith('/project')
    })

    it('retourne null si le check n existe pas', async () => {
      const result = await useHealthCheckStore.getState().executeCheck('/project', 'inexistant')

      expect(result).toBeNull()
      expect(mockHealthcheckApi.execute).not.toHaveBeenCalled()
    })
  })

  describe('startScheduler', () => {
    it('demarre le scheduler', async () => {
      const data = defaultData()
      useHealthCheckStore.setState({ data: data as never })

      await useHealthCheckStore.getState().startScheduler('/project')

      expect(mockHealthcheckApi.startScheduler).toHaveBeenCalledWith('/project', data)
      expect(useHealthCheckStore.getState().schedulerRunning).toBe(true)
    })
  })

  describe('stopScheduler', () => {
    it('arrete le scheduler et reset les statuses', async () => {
      useHealthCheckStore.setState({ schedulerRunning: true, statuses: { 'check-1': {} as never } })

      await useHealthCheckStore.getState().stopScheduler('/project')

      expect(mockHealthcheckApi.stopScheduler).toHaveBeenCalledWith('/project')
      expect(useHealthCheckStore.getState().schedulerRunning).toBe(false)
      expect(useHealthCheckStore.getState().statuses).toEqual({})
    })
  })

  describe('handleStatusUpdate', () => {
    it('met a jour les statuses', () => {
      const statuses = [
        { checkId: 'check-1', lastRun: Date.now(), isRunning: true },
        { checkId: 'check-2', lastRun: Date.now(), isRunning: false },
      ]

      useHealthCheckStore.getState().handleStatusUpdate('/project', statuses as never)

      const state = useHealthCheckStore.getState()
      expect(state.statuses['check-1']).toBeDefined()
      expect(state.statuses['check-2']).toBeDefined()
    })
  })

  describe('refreshData', () => {
    it('recharge les donnees depuis le fichier', async () => {
      const freshData = { ...defaultData(), checks: [makeCheck()] }
      mockHealthcheckApi.load.mockResolvedValue(freshData)

      await useHealthCheckStore.getState().refreshData('/project')

      expect(useHealthCheckStore.getState().data.checks).toHaveLength(1)
    })

    it('ne recharge pas si dirty', async () => {
      useHealthCheckStore.setState({ dirty: true })

      await useHealthCheckStore.getState().refreshData('/project')

      expect(mockHealthcheckApi.load).not.toHaveBeenCalled()
    })

    it('ignore les erreurs silencieusement', async () => {
      const originalData = { ...defaultData(), checks: [makeCheck()] }
      useHealthCheckStore.setState({ data: originalData as never })
      mockHealthcheckApi.load.mockRejectedValue(new Error('fail'))

      await useHealthCheckStore.getState().refreshData('/project')

      expect(useHealthCheckStore.getState().data.checks).toHaveLength(1)
    })
  })

  describe('clearHistory', () => {
    it('vide l historique', async () => {
      const data = {
        ...defaultData(),
        history: [{ healthCheckId: 'check-1', timestamp: Date.now() }],
      }
      useHealthCheckStore.setState({ data: data as never })

      await useHealthCheckStore.getState().clearHistory('/project')

      expect(useHealthCheckStore.getState().data.history).toHaveLength(0)
      expect(mockHealthcheckApi.clearHistory).toHaveBeenCalled()
    })
  })

  describe('selectCheck', () => {
    it('selectionne un check', () => {
      useHealthCheckStore.getState().selectCheck('check-1')
      expect(useHealthCheckStore.getState().selectedCheckId).toBe('check-1')
    })

    it('accepte null pour deselectionner', () => {
      useHealthCheckStore.setState({ selectedCheckId: 'check-1' })
      useHealthCheckStore.getState().selectCheck(null)
      expect(useHealthCheckStore.getState().selectedCheckId).toBeNull()
    })
  })

  describe('flushSave', () => {
    it('sauvegarde immediatement si dirty', async () => {
      const data = { ...defaultData(), checks: [makeCheck()] }
      useHealthCheckStore.setState({ data: data as never, dirty: true })

      await useHealthCheckStore.getState().flushSave('/project')

      expect(mockHealthcheckApi.save).toHaveBeenCalledWith('/project', data)
      expect(useHealthCheckStore.getState().dirty).toBe(false)
    })

    it('ne sauvegarde pas si pas dirty', async () => {
      useHealthCheckStore.setState({ dirty: false })

      await useHealthCheckStore.getState().flushSave('/project')

      expect(mockHealthcheckApi.save).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('remet tout a zero', () => {
      useHealthCheckStore.setState({
        data: { ...defaultData(), checks: [makeCheck()] } as never,
        statuses: { 'check-1': {} as never },
        selectedCheckId: 'check-1',
        schedulerRunning: true,
        loading: true,
        currentProjectPath: '/project',
        dirty: true,
      })

      useHealthCheckStore.getState().reset()

      const state = useHealthCheckStore.getState()
      expect(state.data).toEqual(defaultData())
      expect(state.statuses).toEqual({})
      expect(state.selectedCheckId).toBeNull()
      expect(state.schedulerRunning).toBe(false)
      expect(state.loading).toBe(false)
      expect(state.currentProjectPath).toBeNull()
      expect(state.dirty).toBe(false)
    })
  })
})
