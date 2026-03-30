import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KanbanTask } from '../../src/shared/types'

// ── Mocks de dependances cross-store ───────────────────────────────────────

const mockTerminalState = {
  killTabProcesses: vi.fn(),
  closeTab: vi.fn(),
  setTabColor: vi.fn(),
  setTabActivity: vi.fn(),
}

vi.mock('../../src/renderer/features/terminal', () => ({
  useTerminalTabStore: {
    getState: () => mockTerminalState,
  },
}))

vi.mock('../../src/renderer/lib/i18n', () => ({
  useI18n: {
    getState: () => ({ t: (k: string) => k }),
  },
}))

vi.mock('../../src/renderer/shared/stores/notification-store', () => ({
  pushNotification: vi.fn(),
}))

vi.mock('../../src/renderer/features/workspace/workspace-store', () => ({
  useWorkspaceStore: {
    getState: () => ({ workspaces: [], projects: [] }),
  },
}))

// ── Mock window.kanbai ─────────────────────────────────────────────────────

const mockKanbanApi = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockResolvedValue(null),
  prequalify: vi.fn(),
  cleanupPrompt: vi.fn().mockResolvedValue(undefined),
}

const mockGitApi = {
  worktreeUnlock: vi.fn().mockResolvedValue(undefined),
  worktreeMergeAndCleanup: vi.fn().mockResolvedValue({ success: true }),
  branchIsMerged: vi.fn().mockResolvedValue(false),
  worktreeRemove: vi.fn().mockResolvedValue(undefined),
  deleteBranch: vi.fn().mockResolvedValue(undefined),
}

vi.stubGlobal('window', {
  kanbai: {
    kanban: mockKanbanApi,
    git: mockGitApi,
    notify: vi.fn(),
    shell: { openExternal: vi.fn() },
    workspaceEnv: { delete: vi.fn().mockResolvedValue(undefined) },
  },
})

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-mock-1') })

// ── Imports dynamiques APRES les mocks ─────────────────────────────────────

const { useKanbanStore } = await import('../../src/renderer/features/kanban/kanban-store')
const {
  pickNextTask,
  formatTicketLabel,
  PRIORITY_ORDER,
  TYPE_PREFIX,
  repoPathFromWorktree,
  availableSlots,
  isChildOfCto,
  launchingTaskIds,
} = await import('../../src/renderer/features/kanban/kanban-store-utils')

// ── Helper ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'Description',
    status: 'TODO',
    priority: 'medium',
    type: 'feature',
    workspaceId: 'ws-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('useKanbanStore', () => {
  beforeEach(() => {
    useKanbanStore.setState({
      tasks: [],
      isLoading: false,
      draggedTaskId: null,
      currentWorkspaceId: null,
      startupDoneCleanupPerformed: false,
      kanbanTabIds: {},
      kanbanPromptCwds: {},
      backgroundTasks: {},
    })
    vi.clearAllMocks()
    launchingTaskIds.clear()
    // Restore default mock return values
    mockKanbanApi.list.mockResolvedValue([])
    mockKanbanApi.update.mockResolvedValue(undefined)
    mockKanbanApi.delete.mockResolvedValue(undefined)
    mockKanbanApi.getConfig.mockResolvedValue(null)
    mockGitApi.worktreeUnlock.mockResolvedValue(undefined)
    mockGitApi.branchIsMerged.mockResolvedValue(false)
  })

  // ─── Etat initial ──────────────────────────────────────────────────────

  describe('etat initial', () => {
    it('a un tableau de taches vide par defaut', () => {
      const state = useKanbanStore.getState()
      expect(state.tasks).toEqual([])
    })

    it('isLoading est false par defaut', () => {
      expect(useKanbanStore.getState().isLoading).toBe(false)
    })

    it('draggedTaskId est null par defaut', () => {
      expect(useKanbanStore.getState().draggedTaskId).toBeNull()
    })

    it('currentWorkspaceId est null par defaut', () => {
      expect(useKanbanStore.getState().currentWorkspaceId).toBeNull()
    })

    it('kanbanTabIds est un objet vide par defaut', () => {
      expect(useKanbanStore.getState().kanbanTabIds).toEqual({})
    })

    it('backgroundTasks est un objet vide par defaut', () => {
      expect(useKanbanStore.getState().backgroundTasks).toEqual({})
    })

    it('startupDoneCleanupPerformed est false par defaut', () => {
      expect(useKanbanStore.getState().startupDoneCleanupPerformed).toBe(false)
    })
  })

  // ─── setDragged ────────────────────────────────────────────────────────

  describe('setDragged', () => {
    it('definit le draggedTaskId', () => {
      useKanbanStore.getState().setDragged('task-42')
      expect(useKanbanStore.getState().draggedTaskId).toBe('task-42')
    })

    it('remet draggedTaskId a null', () => {
      useKanbanStore.getState().setDragged('task-42')
      useKanbanStore.getState().setDragged(null)
      expect(useKanbanStore.getState().draggedTaskId).toBeNull()
    })
  })

  // ─── getTasksByStatus ──────────────────────────────────────────────────

  describe('getTasksByStatus', () => {
    it('filtre les taches par status', () => {
      const todo = makeTask({ id: 't1', status: 'TODO' })
      const working = makeTask({ id: 't2', status: 'WORKING' })
      const done = makeTask({ id: 't3', status: 'DONE' })
      useKanbanStore.setState({ tasks: [todo, working, done] })

      const result = useKanbanStore.getState().getTasksByStatus('TODO')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('t1')
    })

    it('retourne un tableau vide si aucune tache ne correspond', () => {
      useKanbanStore.setState({ tasks: [makeTask({ status: 'TODO' })] })

      const result = useKanbanStore.getState().getTasksByStatus('FAILED')
      expect(result).toHaveLength(0)
    })

    it('retourne plusieurs taches du meme status', () => {
      const t1 = makeTask({ id: 't1', status: 'WORKING' })
      const t2 = makeTask({ id: 't2', status: 'WORKING' })
      useKanbanStore.setState({ tasks: [t1, t2] })

      const result = useKanbanStore.getState().getTasksByStatus('WORKING')
      expect(result).toHaveLength(2)
    })
  })

  // ─── createTask ────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('appelle kanban.create et ajoute la tache au store', async () => {
      const newTask = makeTask({ id: 'new-1' })
      mockKanbanApi.create.mockResolvedValue({ task: newTask, memoryRefactorTask: undefined })
      mockKanbanApi.getConfig.mockResolvedValue(null)

      await useKanbanStore.getState().createTask('ws-1', 'Titre', 'Desc', 'medium', 'feature')

      expect(mockKanbanApi.create).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        targetProjectId: undefined,
        title: 'Titre',
        description: 'Desc',
        status: 'TODO',
        priority: 'medium',
        type: 'feature',
        isCtoTicket: undefined,
        aiProvider: undefined,
      })
      expect(useKanbanStore.getState().tasks).toHaveLength(1)
      expect(useKanbanStore.getState().tasks[0]!.id).toBe('new-1')
    })

    it('utilise feature comme type par defaut si non specifie', async () => {
      const newTask = makeTask()
      mockKanbanApi.create.mockResolvedValue({ task: newTask, memoryRefactorTask: undefined })

      await useKanbanStore.getState().createTask('ws-1', 'T', 'D', 'low')

      expect(mockKanbanApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'feature' }),
      )
    })

    it('passe isCtoTicket et aiProvider a la creation', async () => {
      const newTask = makeTask()
      mockKanbanApi.create.mockResolvedValue({ task: newTask, memoryRefactorTask: undefined })

      await useKanbanStore.getState().createTask('ws-1', 'CTO', 'D', 'high', 'bug', 'proj-1', true, 'claude')

      expect(mockKanbanApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isCtoTicket: true,
          aiProvider: 'claude',
          targetProjectId: 'proj-1',
          type: 'bug',
        }),
      )
    })
  })

  // ─── updateTaskStatus ──────────────────────────────────────────────────

  describe('updateTaskStatus', () => {
    it('appelle kanban.update et met a jour le status dans le store', async () => {
      const task = makeTask({ id: 'task-1', status: 'TODO' })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: 'ws-1' })

      await useKanbanStore.getState().updateTaskStatus('task-1', 'WORKING')

      expect(mockKanbanApi.update).toHaveBeenCalledWith({
        id: 'task-1',
        status: 'WORKING',
        workspaceId: 'ws-1',
      })
      expect(useKanbanStore.getState().tasks[0]!.status).toBe('WORKING')
    })

    it('ne fait rien si currentWorkspaceId est null et tache sans workspaceId', async () => {
      const task = makeTask({ id: 'task-1', workspaceId: undefined as unknown as string })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: null })

      await useKanbanStore.getState().updateTaskStatus('task-1', 'DONE')

      expect(mockKanbanApi.update).not.toHaveBeenCalled()
    })

    it('utilise le workspaceId de la tache en priorite sur currentWorkspaceId', async () => {
      const task = makeTask({ id: 'task-1', workspaceId: 'ws-task' })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: 'ws-current' })

      await useKanbanStore.getState().updateTaskStatus('task-1', 'DONE')

      expect(mockKanbanApi.update).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-task' }),
      )
    })

    it('ne kill PAS le processus terminal quand le status passe a PENDING (asking)', async () => {
      const task = makeTask({ id: 'task-1' })
      useKanbanStore.setState({
        tasks: [task],
        currentWorkspaceId: 'ws-1',
        kanbanTabIds: { 'task-1': 'tab-1' },
      })

      await useKanbanStore.getState().updateTaskStatus('task-1', 'PENDING')

      expect(mockTerminalState.killTabProcesses).not.toHaveBeenCalled()
    })

    it('kill le processus terminal quand le status passe a FAILED', async () => {
      const task = makeTask({ id: 'task-1' })
      useKanbanStore.setState({
        tasks: [task],
        currentWorkspaceId: 'ws-1',
        kanbanTabIds: { 'task-1': 'tab-1' },
      })

      await useKanbanStore.getState().updateTaskStatus('task-1', 'FAILED')

      expect(mockTerminalState.killTabProcesses).toHaveBeenCalledWith('tab-1')
    })
  })

  // ─── updateTask ────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('appelle kanban.update et met a jour les donnees de la tache', async () => {
      const task = makeTask({ id: 'task-1', title: 'Old Title' })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: 'ws-1' })

      await useKanbanStore.getState().updateTask('task-1', { title: 'New Title' })

      expect(mockKanbanApi.update).toHaveBeenCalledWith({
        id: 'task-1',
        title: 'New Title',
        workspaceId: 'ws-1',
      })
      expect(useKanbanStore.getState().tasks[0]!.title).toBe('New Title')
    })

    it('ne fait rien si le workspace est null et la tache n a pas de workspaceId', async () => {
      const task = makeTask({ id: 'task-1', workspaceId: undefined as unknown as string })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: null })

      await useKanbanStore.getState().updateTask('task-1', { title: 'X' })

      expect(mockKanbanApi.update).not.toHaveBeenCalled()
    })

    it('met a jour updatedAt lors de la mise a jour', async () => {
      const now = Date.now()
      const task = makeTask({ id: 'task-1', updatedAt: now - 10000 })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: 'ws-1' })

      await useKanbanStore.getState().updateTask('task-1', { priority: 'high' })

      expect(useKanbanStore.getState().tasks[0]!.updatedAt).toBeGreaterThanOrEqual(now)
    })
  })

  // ─── deleteTask ────────────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('appelle kanban.delete et archive la tache dans le store', async () => {
      const task = makeTask({ id: 'task-1' })
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: 'ws-1' })

      await useKanbanStore.getState().deleteTask('task-1')

      expect(mockKanbanApi.delete).toHaveBeenCalledWith('task-1', 'ws-1')
      expect(useKanbanStore.getState().tasks).toHaveLength(1)
      expect(useKanbanStore.getState().tasks[0]!.archived).toBe(true)
    })

    it('ne fait rien si currentWorkspaceId est null', async () => {
      const task = makeTask()
      useKanbanStore.setState({ tasks: [task], currentWorkspaceId: null })

      await useKanbanStore.getState().deleteTask('task-1')

      expect(mockKanbanApi.delete).not.toHaveBeenCalled()
      expect(useKanbanStore.getState().tasks).toHaveLength(1)
    })

    it('archive uniquement la tache ciblee, pas les autres', async () => {
      const t1 = makeTask({ id: 't1' })
      const t2 = makeTask({ id: 't2' })
      useKanbanStore.setState({ tasks: [t1, t2], currentWorkspaceId: 'ws-1' })

      await useKanbanStore.getState().deleteTask('t1')

      expect(useKanbanStore.getState().tasks).toHaveLength(2)
      expect(useKanbanStore.getState().tasks.find((t) => t.id === 't1')!.archived).toBe(true)
      expect(useKanbanStore.getState().tasks.find((t) => t.id === 't2')!.archived).toBeUndefined()
    })
  })

  // ─── duplicateTask ─────────────────────────────────────────────────────

  describe('duplicateTask', () => {
    it('cree une copie avec le prefixe "Copy of"', async () => {
      const original = makeTask({ id: 'orig-1', title: 'Bug critique', priority: 'high', type: 'bug' })
      const duplicate = makeTask({ id: 'dup-1', title: 'Copy of Bug critique' })
      useKanbanStore.setState({ tasks: [original], currentWorkspaceId: 'ws-1' })
      mockKanbanApi.create.mockResolvedValue({ task: duplicate, memoryRefactorTask: undefined })

      await useKanbanStore.getState().duplicateTask(original)

      expect(mockKanbanApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Copy of Bug critique',
          status: 'TODO',
          priority: 'high',
          type: 'bug',
          workspaceId: 'ws-1',
        }),
      )
      expect(useKanbanStore.getState().tasks).toHaveLength(2)
    })

    it('ne duplique pas si currentWorkspaceId est null', async () => {
      const task = makeTask()
      useKanbanStore.setState({ currentWorkspaceId: null })

      await useKanbanStore.getState().duplicateTask(task)

      expect(mockKanbanApi.create).not.toHaveBeenCalled()
    })

    it('preserve la description et le type lors de la duplication', async () => {
      const original = makeTask({ description: 'Details importants', type: 'test', dueDate: 1234567890 })
      const dup = makeTask({ id: 'dup-2' })
      useKanbanStore.setState({ currentWorkspaceId: 'ws-1' })
      mockKanbanApi.create.mockResolvedValue({ task: dup, memoryRefactorTask: undefined })

      await useKanbanStore.getState().duplicateTask(original)

      expect(mockKanbanApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Details importants',
          type: 'test',
          dueDate: 1234567890,
        }),
      )
    })
  })

  // ─── loadTasks ─────────────────────────────────────────────────────────

  describe('loadTasks', () => {
    it('charge les taches et les met dans le store', async () => {
      const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })]
      mockKanbanApi.list.mockResolvedValue(tasks)

      await useKanbanStore.getState().loadTasks('ws-1')

      expect(mockKanbanApi.list).toHaveBeenCalledWith('ws-1')
      expect(useKanbanStore.getState().tasks).toHaveLength(2)
      expect(useKanbanStore.getState().currentWorkspaceId).toBe('ws-1')
    })

    it('met isLoading a false apres le chargement', async () => {
      mockKanbanApi.list.mockResolvedValue([])

      await useKanbanStore.getState().loadTasks('ws-1')

      expect(useKanbanStore.getState().isLoading).toBe(false)
    })

    it('sauvegarde les taches precedentes dans backgroundTasks lors du changement de workspace', async () => {
      const oldTasks = [makeTask({ id: 'old-1' })]
      useKanbanStore.setState({ tasks: oldTasks, currentWorkspaceId: 'ws-old' })
      mockKanbanApi.list.mockResolvedValue([makeTask({ id: 'new-1' })])

      await useKanbanStore.getState().loadTasks('ws-new')

      expect(useKanbanStore.getState().backgroundTasks['ws-old']).toHaveLength(1)
      expect(useKanbanStore.getState().backgroundTasks['ws-old']![0]!.id).toBe('old-1')
    })

    it('efface le flag isPrequalifying des taches chargees depuis le fichier', async () => {
      const task = makeTask({ id: 't1', isPrequalifying: true })
      mockKanbanApi.list.mockResolvedValue([task])

      await useKanbanStore.getState().loadTasks('ws-1')

      expect(useKanbanStore.getState().tasks[0]!.isPrequalifying).toBeUndefined()
    })

    it('ne sauvegarde pas dans backgroundTasks si meme workspace', async () => {
      const tasks = [makeTask({ id: 't1' })]
      useKanbanStore.setState({ tasks, currentWorkspaceId: 'ws-1' })
      mockKanbanApi.list.mockResolvedValue([makeTask({ id: 't2' })])

      await useKanbanStore.getState().loadTasks('ws-1')

      expect(useKanbanStore.getState().backgroundTasks).toEqual({})
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES PURES
// ═══════════════════════════════════════════════════════════════════════════

describe('PRIORITY_ORDER', () => {
  it('definit high=0, medium=1, low=2', () => {
    expect(PRIORITY_ORDER['high']).toBe(0)
    expect(PRIORITY_ORDER['medium']).toBe(1)
    expect(PRIORITY_ORDER['low']).toBe(2)
  })
})

describe('TYPE_PREFIX', () => {
  it('mappe chaque type a son prefixe correct', () => {
    expect(TYPE_PREFIX['bug']).toBe('B')
    expect(TYPE_PREFIX['feature']).toBe('F')
    expect(TYPE_PREFIX['test']).toBe('T')
    expect(TYPE_PREFIX['doc']).toBe('D')
    expect(TYPE_PREFIX['ia']).toBe('A')
    expect(TYPE_PREFIX['refactor']).toBe('R')
  })
})

describe('formatTicketLabel', () => {
  it('retourne TYPE_PREFIX-XX pour un ticket standard avec ticketNumber', () => {
    const task = makeTask({ ticketNumber: 5, type: 'feature' })

    expect(formatTicketLabel(task)).toBe('F-05')
  })

  it('retourne T-XX pour un ticket en prequalification', () => {
    const task = makeTask({ ticketNumber: 3, type: 'bug', isPrequalifying: true })

    expect(formatTicketLabel(task)).toBe('T-03')
  })

  it('retourne le titre si pas de ticketNumber', () => {
    const task = makeTask({ title: 'Mon Ticket', ticketNumber: undefined })

    expect(formatTicketLabel(task)).toBe('Mon Ticket')
  })

  it('pad le ticketNumber a 2 chiffres', () => {
    const task = makeTask({ ticketNumber: 1, type: 'bug' })

    expect(formatTicketLabel(task)).toBe('B-01')
  })

  it('gere les ticketNumber superieurs a 99', () => {
    const task = makeTask({ ticketNumber: 123, type: 'doc' })

    expect(formatTicketLabel(task)).toBe('D-123')
  })

  it('utilise F (feature) comme prefixe par defaut si type non specifie', () => {
    const task = makeTask({ ticketNumber: 7, type: undefined })

    expect(formatTicketLabel(task)).toBe('F-07')
  })

  it('genere le label correct pour un type refactor', () => {
    const task = makeTask({ ticketNumber: 42, type: 'refactor' })

    expect(formatTicketLabel(task)).toBe('R-42')
  })

  it('genere le label correct pour un type ia', () => {
    const task = makeTask({ ticketNumber: 10, type: 'ia' })

    expect(formatTicketLabel(task)).toBe('A-10')
  })
})

describe('repoPathFromWorktree', () => {
  it('retire le suffixe /.kanbai-worktrees/{id} du chemin', () => {
    const result = repoPathFromWorktree('/home/user/project/.kanbai-worktrees/abc123')

    expect(result).toBe('/home/user/project')
  })

  it('retourne le chemin original si pas de worktree', () => {
    const result = repoPathFromWorktree('/home/user/project')

    expect(result).toBe('/home/user/project')
  })

  it('gere les chemins avec plusieurs segments', () => {
    const result = repoPathFromWorktree('/Users/dev/repos/my-app/.kanbai-worktrees/f1a2b3c4')

    expect(result).toBe('/Users/dev/repos/my-app')
  })

  it('utilise le dernier segment /.kanbai-worktrees/ si plusieurs existent', () => {
    const result = repoPathFromWorktree('/repo/.kanbai-worktrees/first/.kanbai-worktrees/second')

    expect(result).toBe('/repo/.kanbai-worktrees/first')
  })
})

describe('pickNextTask', () => {
  it('retourne null si la liste est vide', () => {
    expect(pickNextTask([])).toBeNull()
  })

  it('retourne null si toutes les taches ne sont pas en TODO', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'WORKING' }),
      makeTask({ id: 't2', status: 'DONE' }),
    ]

    expect(pickNextTask(tasks)).toBeNull()
  })

  it('retourne la seule tache TODO disponible', () => {
    const task = makeTask({ id: 't1', status: 'TODO' })

    expect(pickNextTask([task])!.id).toBe('t1')
  })

  it('trie par priorite (high avant medium avant low)', () => {
    const low = makeTask({ id: 'low', status: 'TODO', priority: 'low', createdAt: 100 })
    const high = makeTask({ id: 'high', status: 'TODO', priority: 'high', createdAt: 200 })
    const medium = makeTask({ id: 'med', status: 'TODO', priority: 'medium', createdAt: 150 })

    const result = pickNextTask([low, high, medium])

    expect(result!.id).toBe('high')
  })

  it('trie par createdAt a priorite egale (plus ancien en premier)', () => {
    const older = makeTask({ id: 'old', status: 'TODO', priority: 'medium', createdAt: 100 })
    const newer = makeTask({ id: 'new', status: 'TODO', priority: 'medium', createdAt: 200 })

    const result = pickNextTask([newer, older])

    expect(result!.id).toBe('old')
  })

  it('exclut les taches desactivees (disabled)', () => {
    const disabled = makeTask({ id: 'dis', status: 'TODO', priority: 'high', disabled: true })
    const enabled = makeTask({ id: 'en', status: 'TODO', priority: 'low' })

    const result = pickNextTask([disabled, enabled])

    expect(result!.id).toBe('en')
  })

  it('exclut les taches en prequalification', () => {
    const preq = makeTask({ id: 'preq', status: 'TODO', priority: 'high', isPrequalifying: true })
    const normal = makeTask({ id: 'norm', status: 'TODO', priority: 'low' })

    const result = pickNextTask([preq, normal])

    expect(result!.id).toBe('norm')
  })

  it('exclut les taches dans launchingTaskIds', () => {
    const launching = makeTask({ id: 'launch-1', status: 'TODO', priority: 'high' })
    const available = makeTask({ id: 'avail-1', status: 'TODO', priority: 'low' })
    launchingTaskIds.add('launch-1')

    const result = pickNextTask([launching, available])

    expect(result!.id).toBe('avail-1')

    launchingTaskIds.clear()
  })

  it('met les tickets CTO en dernier', () => {
    const cto = makeTask({ id: 'cto', status: 'TODO', priority: 'high', isCtoTicket: true })
    const regular = makeTask({ id: 'reg', status: 'TODO', priority: 'low' })

    const result = pickNextTask([cto, regular])

    expect(result!.id).toBe('reg')
  })

  it('retourne un ticket CTO si c est le seul disponible', () => {
    const cto = makeTask({ id: 'cto', status: 'TODO', isCtoTicket: true })

    expect(pickNextTask([cto])!.id).toBe('cto')
  })

  it('trie entre CTO par priorite puis createdAt', () => {
    const cto1 = makeTask({ id: 'cto1', status: 'TODO', priority: 'low', isCtoTicket: true, createdAt: 100 })
    const cto2 = makeTask({ id: 'cto2', status: 'TODO', priority: 'high', isCtoTicket: true, createdAt: 200 })

    const result = pickNextTask([cto1, cto2])

    expect(result!.id).toBe('cto2')
  })

  it('retourne null si toutes les taches TODO sont desactivees', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'TODO', disabled: true }),
      makeTask({ id: 't2', status: 'TODO', disabled: true }),
    ]

    expect(pickNextTask(tasks)).toBeNull()
  })
})

describe('availableSlots', () => {
  it('retourne 1 slot par defaut si pas de config', async () => {
    mockKanbanApi.getConfig.mockResolvedValue(null)

    const result = await availableSlots([], 'ws-1')

    expect(result).toBe(1)
  })

  it('retourne 0 si le workspace est en pause', async () => {
    mockKanbanApi.getConfig.mockResolvedValue({ paused: true })

    const result = await availableSlots([], 'ws-1')

    expect(result).toBe(0)
  })

  it('utilise maxConcurrentWorktrees si worktrees actives', async () => {
    mockKanbanApi.getConfig.mockResolvedValue({
      useWorktrees: true,
      maxConcurrentWorktrees: 3,
    })

    const result = await availableSlots([], 'ws-1')

    expect(result).toBe(3)
  })

  it('soustrait les taches WORKING du nombre de slots', async () => {
    mockKanbanApi.getConfig.mockResolvedValue({
      useWorktrees: true,
      maxConcurrentWorktrees: 3,
    })
    const tasks = [
      makeTask({ id: 't1', status: 'WORKING' }),
      makeTask({ id: 't2', status: 'TODO' }),
    ]

    const result = await availableSlots(tasks, 'ws-1')

    expect(result).toBe(2)
  })

  it('soustrait aussi les taches en cours de lancement (launchingTaskIds)', async () => {
    mockKanbanApi.getConfig.mockResolvedValue({
      useWorktrees: true,
      maxConcurrentWorktrees: 2,
    })
    launchingTaskIds.add('launching-1')

    const result = await availableSlots([], 'ws-1')

    expect(result).toBe(1)

    launchingTaskIds.clear()
  })

  it('ne retourne jamais une valeur negative', async () => {
    mockKanbanApi.getConfig.mockResolvedValue(null)
    const tasks = [
      makeTask({ id: 't1', status: 'WORKING' }),
      makeTask({ id: 't2', status: 'WORKING' }),
    ]

    const result = await availableSlots(tasks, 'ws-1')

    expect(result).toBe(0)
  })

  it('retourne 1 si maxConcurrentWorktrees est 1 (worktrees non actives)', async () => {
    mockKanbanApi.getConfig.mockResolvedValue({
      useWorktrees: false,
      maxConcurrentWorktrees: 5,
    })

    const result = await availableSlots([], 'ws-1')

    expect(result).toBe(1)
  })

  it('default a 1 si getConfig rejette', async () => {
    mockKanbanApi.getConfig.mockRejectedValue(new Error('fail'))

    const result = await availableSlots([], 'ws-1')

    expect(result).toBe(1)
  })
})

describe('isChildOfCto', () => {
  it('retourne false si la tache n a pas de parentTicketId', () => {
    const task = makeTask({ parentTicketId: undefined })

    expect(isChildOfCto(task, [])).toBe(false)
  })

  it('retourne false si le parent n est pas un ticket CTO', () => {
    const parent = makeTask({ id: 'parent-1', isCtoTicket: false })
    const child = makeTask({ id: 'child-1', parentTicketId: 'parent-1' })

    expect(isChildOfCto(child, [parent, child])).toBe(false)
  })

  it('retourne true si le parent est un ticket CTO', () => {
    const parent = makeTask({ id: 'parent-1', isCtoTicket: true })
    const child = makeTask({ id: 'child-1', parentTicketId: 'parent-1' })

    expect(isChildOfCto(child, [parent, child])).toBe(true)
  })

  it('retourne false si le parent n existe pas dans la liste', () => {
    const child = makeTask({ id: 'child-1', parentTicketId: 'missing-parent' })

    expect(isChildOfCto(child, [child])).toBe(false)
  })
})
