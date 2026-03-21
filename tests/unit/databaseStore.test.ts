import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type {
  DbConnection,
  DbBackupLogEntry,
  DbNlMessage,
} from '../../src/shared/types'

// Mock useDatabaseTabStore (used by deleteConnection)
const mockClearTabsForConnection = vi.fn()
vi.mock('../../src/renderer/features/database/database-tab-store', () => ({
  useDatabaseTabStore: {
    getState: () => ({ clearTabsForConnection: mockClearTabsForConnection }),
  },
}))

// Mock window.kanbai API
const mockDatabaseApi = {
  load: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}

vi.stubGlobal('window', { kanbai: { database: mockDatabaseApi } })

const { useDatabaseStore } = await import(
  '../../src/renderer/features/database/database-store'
)

function makeConnection(overrides: Partial<DbConnection> = {}): DbConnection {
  return {
    id: 'conn-1',
    name: 'Test DB',
    engine: 'sqlite',
    environmentTag: 'local',
    config: { engine: 'sqlite', filePath: '/tmp/test.db' },
    workspaceId: 'ws-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeBackupLogEntry(
  overrides: Partial<DbBackupLogEntry> = {},
): DbBackupLogEntry {
  return {
    timestamp: Date.now(),
    type: 'info',
    message: 'test log',
    operation: 'backup',
    ...overrides,
  }
}

function makeNlMessage(overrides: Partial<DbNlMessage> = {}): DbNlMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Show all tables',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('useDatabaseStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useDatabaseStore.setState({
      connectionsByWorkspace: {},
      activeConnectionId: null,
      connectionStatuses: {},
      loadedWorkspaces: {},
      loading: false,
      backupLogs: [],
      nlMessages: {},
      nlLoading: {},
      nlAiProvider: 'claude',
    })
    vi.clearAllMocks()
    // Restore default mock return values cleared by clearAllMocks
    mockDatabaseApi.save.mockResolvedValue(undefined)
    mockDatabaseApi.connect.mockResolvedValue(undefined)
    mockDatabaseApi.disconnect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useDatabaseStore.getState()
      expect(state.connectionsByWorkspace).toEqual({})
      expect(state.activeConnectionId).toBeNull()
      expect(state.connectionStatuses).toEqual({})
      expect(state.loadedWorkspaces).toEqual({})
      expect(state.loading).toBe(false)
      expect(state.backupLogs).toEqual([])
      expect(state.nlMessages).toEqual({})
      expect(state.nlLoading).toEqual({})
      expect(state.nlAiProvider).toBe('claude')
    })
  })

  describe('loadConnections', () => {
    it('charge les connexions depuis l api et marque le workspace comme charge', async () => {
      const conn = makeConnection()
      mockDatabaseApi.load.mockResolvedValue({ version: 1, connections: [conn] })

      await useDatabaseStore.getState().loadConnections('ws-1')

      const state = useDatabaseStore.getState()
      expect(state.connectionsByWorkspace['ws-1']).toHaveLength(1)
      expect(state.connectionsByWorkspace['ws-1']![0]!.id).toBe('conn-1')
      expect(state.loadedWorkspaces['ws-1']).toBe(true)
      expect(state.loading).toBe(false)
      expect(mockDatabaseApi.load).toHaveBeenCalledWith('ws-1')
    })

    it('ne recharge pas si le workspace est deja charge', async () => {
      const conn = makeConnection()
      mockDatabaseApi.load.mockResolvedValue({ version: 1, connections: [conn] })

      await useDatabaseStore.getState().loadConnections('ws-1')
      await useDatabaseStore.getState().loadConnections('ws-1')

      expect(mockDatabaseApi.load).toHaveBeenCalledOnce()
    })

    it('met un tableau vide en cas d erreur et marque quand meme comme charge', async () => {
      mockDatabaseApi.load.mockRejectedValue(new Error('File not found'))

      await useDatabaseStore.getState().loadConnections('ws-1')

      const state = useDatabaseStore.getState()
      expect(state.connectionsByWorkspace['ws-1']).toEqual([])
      expect(state.loadedWorkspaces['ws-1']).toBe(true)
      expect(state.loading).toBe(false)
    })
  })

  describe('getConnectionsForWorkspace', () => {
    it('retourne les connexions pour un workspace existant', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      const result = useDatabaseStore.getState().getConnectionsForWorkspace('ws-1')

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('conn-1')
    })

    it('retourne un tableau vide pour un workspace inconnu', () => {
      const result = useDatabaseStore
        .getState()
        .getConnectionsForWorkspace('ws-inexistant')

      expect(result).toEqual([])
    })
  })

  describe('addConnection', () => {
    it('ajoute une connexion au workspace et declenche la sauvegarde', () => {
      const conn = makeConnection()

      useDatabaseStore.getState().addConnection(conn)

      const state = useDatabaseStore.getState()
      expect(state.connectionsByWorkspace['ws-1']).toHaveLength(1)
      expect(state.connectionsByWorkspace['ws-1']![0]!.id).toBe('conn-1')

      // Debounced save should fire after 500ms
      vi.advanceTimersByTime(500)
      expect(mockDatabaseApi.save).toHaveBeenCalledWith('ws-1', {
        version: 1,
        connections: [conn],
      })
    })

    it('ajoute plusieurs connexions au meme workspace', () => {
      const conn1 = makeConnection({ id: 'conn-1' })
      const conn2 = makeConnection({ id: 'conn-2', name: 'Other DB' })

      useDatabaseStore.getState().addConnection(conn1)
      useDatabaseStore.getState().addConnection(conn2)

      expect(useDatabaseStore.getState().connectionsByWorkspace['ws-1']).toHaveLength(2)
    })
  })

  describe('updateConnection', () => {
    it('met a jour la connexion correspondante et declenche la sauvegarde', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })
      const updated = { ...conn, name: 'Updated DB' }

      useDatabaseStore.getState().updateConnection(updated)

      const state = useDatabaseStore.getState()
      expect(state.connectionsByWorkspace['ws-1']![0]!.name).toBe('Updated DB')

      vi.advanceTimersByTime(500)
      expect(mockDatabaseApi.save).toHaveBeenCalledOnce()
    })

    it('ne modifie pas les autres connexions', () => {
      const conn1 = makeConnection({ id: 'conn-1', name: 'First' })
      const conn2 = makeConnection({ id: 'conn-2', name: 'Second' })
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn1, conn2] },
      })

      useDatabaseStore
        .getState()
        .updateConnection({ ...conn1, name: 'Updated First' })

      const conns = useDatabaseStore.getState().connectionsByWorkspace['ws-1']!
      expect(conns[0]!.name).toBe('Updated First')
      expect(conns[1]!.name).toBe('Second')
    })
  })

  describe('deleteConnection', () => {
    it('supprime la connexion du workspace', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(useDatabaseStore.getState().connectionsByWorkspace['ws-1']).toHaveLength(0)
    })

    it('deconnecte si la connexion est connectee', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        connectionStatuses: { 'conn-1': 'connected' },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(mockDatabaseApi.disconnect).toHaveBeenCalledWith('conn-1')
    })

    it('deconnecte si la connexion est en cours de connexion', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        connectionStatuses: { 'conn-1': 'connecting' },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(mockDatabaseApi.disconnect).toHaveBeenCalledWith('conn-1')
    })

    it('ne deconnecte pas si la connexion est deja deconnectee', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        connectionStatuses: { 'conn-1': 'disconnected' },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(mockDatabaseApi.disconnect).not.toHaveBeenCalled()
    })

    it('reset activeConnectionId si c etait la connexion active', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        activeConnectionId: 'conn-1',
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(useDatabaseStore.getState().activeConnectionId).toBeNull()
    })

    it('ne modifie pas activeConnectionId si c est une autre connexion', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        activeConnectionId: 'conn-other',
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(useDatabaseStore.getState().activeConnectionId).toBe('conn-other')
    })

    it('nettoie les messages NL de la connexion supprimee', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        nlMessages: { 'conn-1': [makeNlMessage()], 'conn-2': [makeNlMessage()] },
        nlLoading: { 'conn-1': true, 'conn-2': false },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      const state = useDatabaseStore.getState()
      expect(state.nlMessages['conn-1']).toBeUndefined()
      expect(state.nlMessages['conn-2']).toHaveLength(1)
      expect(state.nlLoading['conn-1']).toBeUndefined()
      expect(state.nlLoading['conn-2']).toBe(false)
    })

    it('nettoie les tabs de la connexion supprimee', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      expect(mockClearTabsForConnection).toHaveBeenCalledWith('conn-1')
    })

    it('declenche la sauvegarde apres suppression', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')
      vi.advanceTimersByTime(500)

      expect(mockDatabaseApi.save).toHaveBeenCalledOnce()
    })

    it('supprime aussi le statut de connexion', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
        connectionStatuses: { 'conn-1': 'connected', 'conn-2': 'disconnected' },
      })

      useDatabaseStore.getState().deleteConnection('conn-1')

      const statuses = useDatabaseStore.getState().connectionStatuses
      expect(statuses['conn-1']).toBeUndefined()
      expect(statuses['conn-2']).toBe('disconnected')
    })
  })

  describe('setActiveConnection', () => {
    it('met a jour activeConnectionId', () => {
      useDatabaseStore.getState().setActiveConnection('conn-1')
      expect(useDatabaseStore.getState().activeConnectionId).toBe('conn-1')
    })

    it('accepte null pour desactiver', () => {
      useDatabaseStore.getState().setActiveConnection('conn-1')
      useDatabaseStore.getState().setActiveConnection(null)
      expect(useDatabaseStore.getState().activeConnectionId).toBeNull()
    })
  })

  describe('setConnectionStatus', () => {
    it('met a jour le statut d une connexion', () => {
      useDatabaseStore.getState().setConnectionStatus('conn-1', 'connected')
      expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe('connected')
    })

    it('ecrase le statut precedent', () => {
      useDatabaseStore.getState().setConnectionStatus('conn-1', 'connecting')
      useDatabaseStore.getState().setConnectionStatus('conn-1', 'error')
      expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe('error')
    })
  })

  describe('connectDb', () => {
    it('met le statut en connecting puis connected apres succes', async () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      await useDatabaseStore.getState().connectDb('conn-1')

      const state = useDatabaseStore.getState()
      expect(state.connectionStatuses['conn-1']).toBe('connected')
      expect(state.activeConnectionId).toBe('conn-1')
      expect(mockDatabaseApi.connect).toHaveBeenCalledWith('conn-1', conn.config)
    })

    it('met le statut en error si la connexion echoue', async () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })
      mockDatabaseApi.connect.mockRejectedValueOnce(new Error('Connection refused'))

      await useDatabaseStore.getState().connectDb('conn-1')

      expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe('error')
    })

    it('ne fait rien si la connexion n existe pas', async () => {
      await useDatabaseStore.getState().connectDb('conn-inexistant')

      expect(mockDatabaseApi.connect).not.toHaveBeenCalled()
    })

    it('trouve la connexion dans n importe quel workspace', async () => {
      const conn = makeConnection({ workspaceId: 'ws-2' })
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [], 'ws-2': [conn] },
      })

      await useDatabaseStore.getState().connectDb('conn-1')

      expect(mockDatabaseApi.connect).toHaveBeenCalledWith('conn-1', conn.config)
    })
  })

  describe('disconnectDb', () => {
    it('appelle disconnect et met le statut en disconnected', async () => {
      useDatabaseStore.setState({
        connectionStatuses: { 'conn-1': 'connected' },
      })

      await useDatabaseStore.getState().disconnectDb('conn-1')

      expect(mockDatabaseApi.disconnect).toHaveBeenCalledWith('conn-1')
      expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe(
        'disconnected',
      )
    })

    it('met le statut en disconnected meme si disconnect echoue', async () => {
      mockDatabaseApi.disconnect.mockRejectedValueOnce(new Error('fail'))

      await useDatabaseStore.getState().disconnectDb('conn-1')

      expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe(
        'disconnected',
      )
    })
  })

  describe('reorderConnections', () => {
    it('deplace une connexion d un index a un autre', () => {
      const conn1 = makeConnection({ id: 'conn-1' })
      const conn2 = makeConnection({ id: 'conn-2' })
      const conn3 = makeConnection({ id: 'conn-3' })
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn1, conn2, conn3] },
      })

      useDatabaseStore.getState().reorderConnections('ws-1', 0, 2)

      const ids = useDatabaseStore
        .getState()
        .connectionsByWorkspace['ws-1']!.map((c) => c.id)
      expect(ids).toEqual(['conn-2', 'conn-3', 'conn-1'])
    })

    it('ne fait rien si fromIndex est hors limites', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().reorderConnections('ws-1', -1, 0)

      expect(useDatabaseStore.getState().connectionsByWorkspace['ws-1']).toHaveLength(1)
    })

    it('ne fait rien si toIndex est hors limites', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().reorderConnections('ws-1', 0, 5)

      expect(useDatabaseStore.getState().connectionsByWorkspace['ws-1']).toHaveLength(1)
    })

    it('declenche la sauvegarde apres reordonancement', () => {
      const conn1 = makeConnection({ id: 'conn-1' })
      const conn2 = makeConnection({ id: 'conn-2' })
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn1, conn2] },
      })

      useDatabaseStore.getState().reorderConnections('ws-1', 0, 1)
      vi.advanceTimersByTime(500)

      expect(mockDatabaseApi.save).toHaveBeenCalledOnce()
    })
  })

  describe('appendBackupLog', () => {
    it('ajoute une entree au journal de backup', () => {
      const entry = makeBackupLogEntry()

      useDatabaseStore.getState().appendBackupLog(entry)

      expect(useDatabaseStore.getState().backupLogs).toHaveLength(1)
      expect(useDatabaseStore.getState().backupLogs[0]).toEqual(entry)
    })

    it('limite le journal a 500 entrees', () => {
      const entries = Array.from({ length: 500 }, (_, i) =>
        makeBackupLogEntry({ message: `log-${i}` }),
      )
      useDatabaseStore.setState({ backupLogs: entries })

      const newEntry = makeBackupLogEntry({ message: 'log-500' })
      useDatabaseStore.getState().appendBackupLog(newEntry)

      const logs = useDatabaseStore.getState().backupLogs
      expect(logs).toHaveLength(500)
      expect(logs[logs.length - 1]!.message).toBe('log-500')
      expect(logs[0]!.message).toBe('log-1')
    })
  })

  describe('clearBackupLogs', () => {
    it('vide le journal de backup', () => {
      useDatabaseStore.setState({
        backupLogs: [makeBackupLogEntry(), makeBackupLogEntry()],
      })

      useDatabaseStore.getState().clearBackupLogs()

      expect(useDatabaseStore.getState().backupLogs).toEqual([])
    })
  })

  describe('addNlMessage', () => {
    it('ajoute un message NL pour une connexion', () => {
      const msg = makeNlMessage()

      useDatabaseStore.getState().addNlMessage('conn-1', msg)

      const messages = useDatabaseStore.getState().nlMessages['conn-1']
      expect(messages).toHaveLength(1)
      expect(messages![0]!.content).toBe('Show all tables')
    })

    it('ajoute a la suite des messages existants', () => {
      const msg1 = makeNlMessage({ id: 'msg-1', content: 'First' })
      const msg2 = makeNlMessage({ id: 'msg-2', content: 'Second' })

      useDatabaseStore.getState().addNlMessage('conn-1', msg1)
      useDatabaseStore.getState().addNlMessage('conn-1', msg2)

      const messages = useDatabaseStore.getState().nlMessages['conn-1']
      expect(messages).toHaveLength(2)
      expect(messages![1]!.content).toBe('Second')
    })

    it('separe les messages par connexion', () => {
      const msg1 = makeNlMessage({ id: 'msg-1' })
      const msg2 = makeNlMessage({ id: 'msg-2' })

      useDatabaseStore.getState().addNlMessage('conn-1', msg1)
      useDatabaseStore.getState().addNlMessage('conn-2', msg2)

      expect(useDatabaseStore.getState().nlMessages['conn-1']).toHaveLength(1)
      expect(useDatabaseStore.getState().nlMessages['conn-2']).toHaveLength(1)
    })
  })

  describe('setNlLoading', () => {
    it('met a jour l etat de chargement NL pour une connexion', () => {
      useDatabaseStore.getState().setNlLoading('conn-1', true)
      expect(useDatabaseStore.getState().nlLoading['conn-1']).toBe(true)

      useDatabaseStore.getState().setNlLoading('conn-1', false)
      expect(useDatabaseStore.getState().nlLoading['conn-1']).toBe(false)
    })
  })

  describe('clearNlMessages', () => {
    it('vide les messages NL pour une connexion', () => {
      useDatabaseStore.setState({
        nlMessages: {
          'conn-1': [makeNlMessage()],
          'conn-2': [makeNlMessage()],
        },
      })

      useDatabaseStore.getState().clearNlMessages('conn-1')

      expect(useDatabaseStore.getState().nlMessages['conn-1']).toEqual([])
      expect(useDatabaseStore.getState().nlMessages['conn-2']).toHaveLength(1)
    })
  })

  describe('setNlAiProvider', () => {
    it('change le provider AI pour les requetes NL', () => {
      useDatabaseStore.getState().setNlAiProvider('gemini')
      expect(useDatabaseStore.getState().nlAiProvider).toBe('gemini')
    })
  })

  describe('saveConnections (debounce)', () => {
    it('sauvegarde apres le delai de debounce de 500ms', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().saveConnections('ws-1')

      expect(mockDatabaseApi.save).not.toHaveBeenCalled()
      vi.advanceTimersByTime(500)
      expect(mockDatabaseApi.save).toHaveBeenCalledWith('ws-1', {
        version: 1,
        connections: [conn],
      })
    })

    it('regroupe les appels multiples dans le delai de debounce', () => {
      const conn = makeConnection()
      useDatabaseStore.setState({
        connectionsByWorkspace: { 'ws-1': [conn] },
      })

      useDatabaseStore.getState().saveConnections('ws-1')
      vi.advanceTimersByTime(200)
      useDatabaseStore.getState().saveConnections('ws-1')
      vi.advanceTimersByTime(200)
      useDatabaseStore.getState().saveConnections('ws-1')
      vi.advanceTimersByTime(500)

      expect(mockDatabaseApi.save).toHaveBeenCalledOnce()
    })
  })
})
