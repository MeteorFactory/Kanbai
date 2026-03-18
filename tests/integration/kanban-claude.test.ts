import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IS_WIN } from '../helpers/platform'

// Mock the window.kanbai API
const mockKanbanUpdate = vi.fn()
const mockKanbanList = vi.fn()
const mockKanbanCreate = vi.fn()
const mockKanbanDelete = vi.fn()
const mockKanbanWritePrompt = vi.fn()
const mockKanbanCleanupPrompt = vi.fn()
const mockKanbanGetPath = vi.fn()
const mockKanbanSelectFiles = vi.fn()
const mockKanbanAttachFile = vi.fn()
const mockKanbanRemoveAttachment = vi.fn()
const mockKanbanLinkConversation = vi.fn()
const mockKanbanGetConfig = vi.fn()
const mockTerminalWrite = vi.fn()
const mockWorkspaceEnvSetup = vi.fn()

vi.stubGlobal('window', {
  kanbai: {
    terminal: {
      write: mockTerminalWrite,
    },
    kanban: {
      list: mockKanbanList,
      create: mockKanbanCreate,
      update: mockKanbanUpdate,
      delete: mockKanbanDelete,
      writePrompt: mockKanbanWritePrompt,
      cleanupPrompt: mockKanbanCleanupPrompt,
      getPath: mockKanbanGetPath,
      selectFiles: mockKanbanSelectFiles,
      attachFile: mockKanbanAttachFile,
      removeAttachment: mockKanbanRemoveAttachment,
      linkConversation: mockKanbanLinkConversation,
      getConfig: mockKanbanGetConfig,
    },
    workspaceEnv: {
      setup: mockWorkspaceEnvSetup,
    },
    settings: {
      get: vi.fn().mockResolvedValue({ kanbanSettings: { autoPrequalifyTickets: false, autoPrioritizeBugs: true } }),
    },
  },
})

// Import real stores — zustand stores have no side effects on import
const { useKanbanStore } = await import('../../src/renderer/lib/stores/kanbanStore')
const { useTerminalTabStore } = await import('../../src/renderer/features/terminal')
const { useViewStore } = await import('../../src/renderer/lib/stores/viewStore')

// Spy targets: create mock functions to inject into stores via setState
const mockCreateTab = vi.fn().mockReturnValue('tab-new-1')
const mockSetTabColor = vi.fn()
const mockSetActiveTab = vi.fn()
const mockSetTabActivity = vi.fn()
const mockCloseTab = vi.fn()
const mockSetViewMode = vi.fn()

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    workspaceId: 'ws-1',
    title: 'Fix bug in auth',
    description: 'The login form crashes on submit',
    status: 'TODO' as const,
    priority: 'high' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('Kanban → Claude Integration (PTY interactif)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockCreateTab.mockReturnValue('tab-new-1')
    mockWorkspaceEnvSetup.mockResolvedValue({ success: true, envPath: '/tmp/workspace-env' })
    mockKanbanGetPath.mockResolvedValue('/Users/test/.kanbai/kanban/ws-1.json')
    mockKanbanCleanupPrompt.mockResolvedValue(undefined)
    mockKanbanGetConfig.mockResolvedValue({
      autoCloseCompletedTerminals: true,
      autoCloseCtoTerminals: true,
    })

    useKanbanStore.setState({
      tasks: [],
      isLoading: false,
      draggedTaskId: null,
      currentWorkspaceId: 'ws-1',
      startupDoneCleanupPerformed: false,
      kanbanTabIds: {},
      kanbanPromptCwds: {},
    })

    // Inject mock functions into the real terminal tab store
    useTerminalTabStore.setState({
      tabs: [],
      activeTabId: null,
      createTab: mockCreateTab as ReturnType<typeof useTerminalTabStore.getState>['createTab'],
      setTabColor: mockSetTabColor,
      setActiveTab: mockSetActiveTab as ReturnType<typeof useTerminalTabStore.getState>['setActiveTab'],
      setTabActivity: mockSetTabActivity,
      closeTab: mockCloseTab as ReturnType<typeof useTerminalTabStore.getState>['closeTab'],
    })

    // Inject mock setViewMode into viewStore
    useViewStore.setState({
      setViewMode: mockSetViewMode,
    })
  })

  describe('sendToAi (kanban → AI terminal)', () => {
    it('lance Claude en mode interactif (sans -p)', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      // Prompt file was written
      expect(mockKanbanWritePrompt).toHaveBeenCalledWith('/tmp/workspace-env', 'task-1', expect.stringContaining('Fix bug in auth'))

      // Interactive tab was created — command launches Claude WITHOUT -p
      expect(mockCreateTab).toHaveBeenCalledWith(
        'ws-1',
        '/tmp/workspace-env',
        '[Claude] Fix bug in auth',
        expect.stringContaining('claude --dangerously-skip-permissions'),
        true,
      )

      // Verify the command includes Claude with the prompt as a CLI argument (not -p flag)
      const initialCommand = mockCreateTab.mock.calls[0]![3] as string
      expect(initialCommand).toContain('claude --dangerously-skip-permissions')
      expect(initialCommand).toContain('.kanban-prompt-task-1.md')
      expect(initialCommand).not.toMatch(/\s-p\s/)

      // Tab color set to provider detection color (Claude = #D4A574)
      expect(mockSetTabColor).toHaveBeenCalledWith('tab-new-1', '#D4A574')
    })

    it('utilise le chemin du projet cible si targetProjectId est defini', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1', 'proj-2'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [
          { id: 'proj-1', name: 'Frontend', path: '/tmp/frontend', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() },
          { id: 'proj-2', name: 'Backend', path: '/tmp/backend', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() },
        ],
      })

      const task = makeTask({ targetProjectId: 'proj-2' })
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/backend/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      // Should use the target project path, NOT workspace env
      expect(mockKanbanWritePrompt).toHaveBeenCalledWith('/tmp/backend', 'task-1', expect.any(String))
      expect(mockCreateTab).toHaveBeenCalledWith(
        'ws-1',
        '/tmp/backend',
        '[Claude] Fix bug in auth',
        expect.any(String),
        true,
      )
      // workspaceEnv.setup should NOT have been called since we have a target project
      expect(mockWorkspaceEnvSetup).not.toHaveBeenCalled()
    })

    it('utilise le workspace env si pas de targetProjectId', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask() // no targetProjectId
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      // Should call workspaceEnv.setup for workspace-level cwd
      expect(mockWorkspaceEnvSetup).toHaveBeenCalledWith('Test WS', ['/tmp/project'], 'ws-1')
      expect(mockCreateTab).toHaveBeenCalledWith(
        'ws-1',
        '/tmp/workspace-env',
        expect.any(String),
        expect.any(String),
        true,
      )
    })

    it('passe le prompt comme initialCommand au terminal (delegation au composant Terminal)', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      // The initialCommand is passed to createTab — Terminal component handles PTY writing
      const initialCommand = mockCreateTab.mock.calls[0]![3] as string
      expect(initialCommand).toContain('.kanban-prompt-task-1.md')
      expect(initialCommand).toContain('claude --dangerously-skip-permissions')
      // The store does NOT write directly to the PTY — Terminal handles that
      expect(mockTerminalWrite).not.toHaveBeenCalled()
    })

    it('initialCommand contient la commande complete avec env vars et prompt path', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      const initialCommand = mockCreateTab.mock.calls[0]![3] as string

      // Command must unset Claude env vars to avoid nested session errors
      if (IS_WIN) {
        expect(initialCommand).toContain('Remove-Item Env:CLAUDECODE')
        expect(initialCommand).toContain('Remove-Item Env:CLAUDE_CODE_ENTRYPOINT')
      } else {
        expect(initialCommand).toContain('unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT')
      }

      // Command must set kanban env vars for the hook
      expect(initialCommand).toContain('KANBAI_KANBAN_TASK_ID="task-1"')
      expect(initialCommand).toContain('KANBAI_KANBAN_FILE=')

      // Command must launch Claude with the prompt file reference
      expect(initialCommand).toContain('claude --dangerously-skip-permissions')
      expect(initialCommand).toContain('.kanban-prompt-task-1.md')

      // The prompt is passed as a CLI argument, not via -p
      expect(initialCommand).not.toMatch(/\s-p\s/)
    })

    it('met la tache en WORKING', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      const updatedTask = useKanbanStore.getState().tasks.find((t) => t.id === 'task-1')
      expect(updatedTask?.status).toBe('WORKING')

      expect(mockKanbanUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-1',
          status: 'WORKING',
          workspaceId: 'ws-1',
        }),
      )
    })

    it('stocke le kanbanTabId', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      expect(useKanbanStore.getState().kanbanTabIds['task-1']).toBe('tab-new-1')
    })

    it('active le tab existant au lieu de creer un nouveau (double-send)', async () => {
      const task = makeTask()

      // Simulate an existing tab for this task
      useTerminalTabStore.setState({
        tabs: [{ id: 'tab-existing', label: '[IA] Fix bug', color: '#F5A623', hasActivity: false, paneTree: { type: 'leaf', id: 'p1', sessionId: 'pty-1', initialCommand: null, externalSessionId: null }, activePaneId: 'p1', zoomedPaneId: null, workspaceId: 'ws-1', cwd: '/tmp/workspace-env', initialCommand: null }],
        setActiveTab: mockSetActiveTab as ReturnType<typeof useTerminalTabStore.getState>['setActiveTab'],
        createTab: mockCreateTab as ReturnType<typeof useTerminalTabStore.getState>['createTab'],
        setTabColor: mockSetTabColor,
        setTabActivity: mockSetTabActivity,
      })

      useKanbanStore.setState({
        tasks: [task],
        kanbanTabIds: { 'task-1': 'tab-existing' },
      })

      await useKanbanStore.getState().sendToAi(task)

      // Should activate existing tab, not create new one
      expect(mockSetActiveTab).toHaveBeenCalledWith('tab-existing')
      expect(mockCreateTab).not.toHaveBeenCalled()
      expect(mockKanbanWritePrompt).not.toHaveBeenCalled()
    })

    it('ne fait rien sans workspaceId', async () => {
      useKanbanStore.setState({ currentWorkspaceId: null, tasks: [makeTask()] })

      // Task must also lack a workspaceId — otherwise task.workspaceId is used as fallback
      await useKanbanStore.getState().sendToAi(makeTask({ workspaceId: '' }))

      expect(mockKanbanWritePrompt).not.toHaveBeenCalled()
      expect(mockCreateTab).not.toHaveBeenCalled()
    })

    it('inclut les instructions PENDING dans le prompt', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      const writtenPrompt = mockKanbanWritePrompt.mock.calls[0]![2] as string
      expect(writtenPrompt).toContain('PENDING')
      expect(writtenPrompt).toContain('question')
    })

    it('set les variables d\'env KANBAI_KANBAN dans la commande', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      const initialCommand = mockCreateTab.mock.calls[0]![3] as string
      expect(initialCommand).toContain('KANBAI_KANBAN_TASK_ID="task-1"')
      expect(initialCommand).toContain('KANBAI_KANBAN_FILE=')
      expect(initialCommand).toContain('.kanbai/kanban/ws-1.json')
    })

    it('reste sur la vue courante (pas de navigation vers terminal)', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      // Should NOT switch view — user stays on kanban to keep writing tickets
      expect(mockSetViewMode).not.toHaveBeenCalled()
    })
  })

  describe('syncTasksFromFile transitions', () => {
    it('colore le tab en vert quand WORKING → DONE', async () => {
      useKanbanStore.setState({
        tasks: [makeTask({ status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([makeTask({ status: 'DONE' })])

      await useKanbanStore.getState().syncTasksFromFile()

      expect(mockSetTabColor).toHaveBeenCalledWith('tab-abc', '#20D4A0')
    })

    it('ne ferme pas le terminal quand WORKING → DONE', async () => {
      useKanbanStore.setState({
        tasks: [makeTask({ status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([makeTask({ status: 'DONE' })])

      await useKanbanStore.getState().syncTasksFromFile()

      expect(mockCloseTab).not.toHaveBeenCalled()
    })

    it('colore le tab en rouge quand WORKING → FAILED', async () => {
      useKanbanStore.setState({
        tasks: [makeTask({ status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([makeTask({ status: 'FAILED' })])

      await useKanbanStore.getState().syncTasksFromFile()

      expect(mockSetTabColor).toHaveBeenCalledWith('tab-abc', '#F4585B')
    })

    it('ne ferme pas le terminal quand WORKING → FAILED', async () => {
      useKanbanStore.setState({
        tasks: [makeTask({ status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([makeTask({ status: 'FAILED' })])

      await useKanbanStore.getState().syncTasksFromFile()

      expect(mockCloseTab).not.toHaveBeenCalled()
    })

    it('colore le tab en jaune et active l\'activite quand WORKING → PENDING', async () => {
      useKanbanStore.setState({
        tasks: [makeTask({ status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([makeTask({ status: 'PENDING' })])

      await useKanbanStore.getState().syncTasksFromFile()

      expect(mockSetTabColor).toHaveBeenCalledWith('tab-abc', '#fbbf24')
      expect(mockSetTabActivity).toHaveBeenCalledWith('tab-abc', true)
    })

    it('ne change rien si le status n\'a pas change', async () => {
      useKanbanStore.setState({
        tasks: [makeTask({ status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([makeTask({ status: 'WORKING' })])

      await useKanbanStore.getState().syncTasksFromFile()

      expect(mockSetTabColor).not.toHaveBeenCalled()
    })
  })

  describe('startup terminal cleanup', () => {
    it('loadTasks ferme uniquement les tabs DONE au demarrage, une seule fois', async () => {
      useKanbanStore.setState({
        startupDoneCleanupPerformed: false,
        kanbanTabIds: {
          'task-done': 'tab-done',
          'task-failed': 'tab-failed',
        },
      })

      mockKanbanList.mockResolvedValue([
        makeTask({ id: 'task-done', status: 'DONE' }),
        makeTask({ id: 'task-failed', status: 'FAILED' }),
      ])

      await useKanbanStore.getState().loadTasks('ws-1')
      // Startup cleanup is async (fetches kanbanConfig), flush microtasks
      await vi.waitFor(() => expect(mockCloseTab).toHaveBeenCalledTimes(1))
      expect(mockCloseTab).toHaveBeenCalledWith('tab-done')

      mockCloseTab.mockClear()
      await useKanbanStore.getState().loadTasks('ws-1')
      expect(mockCloseTab).not.toHaveBeenCalled()
    })
  })

  describe('scheduling un-par-un', () => {
    it('loadTasks ne lance qu\'un seul ticket TODO', async () => {
      vi.useFakeTimers()
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const tasks = [
        makeTask({ id: 'task-1', status: 'TODO', priority: 'high', createdAt: 1000 }),
        makeTask({ id: 'task-2', status: 'TODO', priority: 'medium', createdAt: 2000 }),
        makeTask({ id: 'task-3', status: 'TODO', priority: 'low', createdAt: 3000 }),
      ]
      mockKanbanList.mockResolvedValue(tasks)
      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().loadTasks('ws-1')

      // Advance past the setTimeout(500)
      await vi.advanceTimersByTimeAsync(600)

      // Only one sendToAi call (writePrompt is called once per sendToAi)
      expect(mockKanbanWritePrompt).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })

    it('loadTasks reprend un WORKING avant de lancer un TODO', async () => {
      vi.useFakeTimers()
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const tasks = [
        makeTask({ id: 'task-1', status: 'WORKING', priority: 'low', createdAt: 1000 }),
        makeTask({ id: 'task-2', status: 'TODO', priority: 'high', createdAt: 2000 }),
      ]
      mockKanbanList.mockResolvedValue(tasks)
      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().loadTasks('ws-1')

      await vi.advanceTimersByTimeAsync(600)

      // Should resume WORKING task, not the critical TODO
      expect(mockKanbanWritePrompt).toHaveBeenCalledTimes(1)
      expect(mockKanbanWritePrompt).toHaveBeenCalledWith(expect.any(String), 'task-1', expect.any(String))

      vi.useRealTimers()
    })

    it('createTask ne lance pas si un WORKING existe', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      // Existing WORKING task
      useKanbanStore.setState({
        currentWorkspaceId: 'ws-1',
        tasks: [makeTask({ id: 'task-existing', status: 'WORKING' })],
      })

      const newTask = makeTask({ id: 'task-new', status: 'TODO' })
      mockKanbanCreate.mockResolvedValue(newTask)
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().createTask('ws-1', 'New task', 'desc', 'critical')

      // Should NOT send to AI because a WORKING task exists
      expect(mockKanbanWritePrompt).not.toHaveBeenCalled()
      expect(mockCreateTab).not.toHaveBeenCalled()
    })

    it('syncTasksFromFile lance le prochain apres DONE', async () => {
      vi.useFakeTimers()

      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      useKanbanStore.setState({
        tasks: [
          makeTask({ id: 'task-1', status: 'WORKING' }),
          makeTask({ id: 'task-2', status: 'TODO', priority: 'high', createdAt: 2000 }),
        ],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      // Simulate task-1 finishing: WORKING → DONE
      mockKanbanList.mockResolvedValue([
        makeTask({ id: 'task-1', status: 'DONE' }),
        makeTask({ id: 'task-2', status: 'TODO', priority: 'high', createdAt: 2000 }),
      ])
      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-2.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().syncTasksFromFile()

      // Advance past the 1s delay
      await vi.advanceTimersByTimeAsync(1500)

      // Should have triggered next task
      expect(mockKanbanWritePrompt).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('syncTasksFromFile lance le prochain apres FAILED', async () => {
      vi.useFakeTimers()

      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      useKanbanStore.setState({
        tasks: [
          makeTask({ id: 'task-1', status: 'WORKING' }),
          makeTask({ id: 'task-2', status: 'TODO', priority: 'medium', createdAt: 2000 }),
        ],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([
        makeTask({ id: 'task-1', status: 'FAILED' }),
        makeTask({ id: 'task-2', status: 'TODO', priority: 'medium', createdAt: 2000 }),
      ])
      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-2.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().syncTasksFromFile()

      await vi.advanceTimersByTimeAsync(1500)

      expect(mockKanbanWritePrompt).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('syncTasksFromFile ne lance rien apres PENDING', async () => {
      vi.useFakeTimers()

      useKanbanStore.setState({
        tasks: [
          makeTask({ id: 'task-1', status: 'WORKING' }),
          makeTask({ id: 'task-2', status: 'TODO', priority: 'high', createdAt: 2000 }),
        ],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      mockKanbanList.mockResolvedValue([
        makeTask({ id: 'task-1', status: 'PENDING' }),
        makeTask({ id: 'task-2', status: 'TODO', priority: 'high', createdAt: 2000 }),
      ])

      await useKanbanStore.getState().syncTasksFromFile()

      // Advance well past the delay
      await vi.advanceTimersByTimeAsync(2000)

      // PENDING should NOT trigger next task
      expect(mockKanbanWritePrompt).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('priorites', () => {
    it('critical > high > medium > low', async () => {
      vi.useFakeTimers()
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const tasks = [
        makeTask({ id: 'task-low', status: 'TODO', priority: 'low', createdAt: 1000 }),
        makeTask({ id: 'task-med', status: 'TODO', priority: 'medium', createdAt: 2000 }),
        makeTask({ id: 'task-high', status: 'TODO', priority: 'high', createdAt: 3000 }),
      ]
      mockKanbanList.mockResolvedValue(tasks)
      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-high.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().loadTasks('ws-1')

      await vi.advanceTimersByTimeAsync(600)

      // Should pick the high priority task
      expect(mockKanbanWritePrompt).toHaveBeenCalledWith(expect.any(String), 'task-high', expect.any(String))

      vi.useRealTimers()
    })

    it('a priorite egale, le plus ancien gagne', async () => {
      vi.useFakeTimers()
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const tasks = [
        makeTask({ id: 'task-new', status: 'TODO', priority: 'high', createdAt: 5000 }),
        makeTask({ id: 'task-old', status: 'TODO', priority: 'high', createdAt: 1000 }),
      ]
      mockKanbanList.mockResolvedValue(tasks)
      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-old.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().loadTasks('ws-1')

      await vi.advanceTimersByTimeAsync(600)

      // Should pick the older task
      expect(mockKanbanWritePrompt).toHaveBeenCalledWith(expect.any(String), 'task-old', expect.any(String))

      vi.useRealTimers()
    })
  })

  describe('pieces jointes', () => {
    it('attachFiles met a jour le state', async () => {
      const attachment = {
        id: 'att-1',
        filename: 'screenshot.png',
        storedPath: '/tmp/attachments/att-1-screenshot.png',
        mimeType: 'image/png',
        size: 1024,
        addedAt: Date.now(),
      }
      mockKanbanSelectFiles.mockResolvedValue(['/Users/test/screenshot.png'])
      mockKanbanAttachFile.mockResolvedValue(attachment)

      useKanbanStore.setState({
        currentWorkspaceId: 'ws-1',
        tasks: [makeTask({ id: 'task-1' })],
      })

      await useKanbanStore.getState().attachFiles('task-1')

      const task = useKanbanStore.getState().tasks.find((t) => t.id === 'task-1')
      expect(task?.attachments).toHaveLength(1)
      expect(task?.attachments?.[0]?.filename).toBe('screenshot.png')
    })

    it('removeAttachment supprime du state', async () => {
      const attachment = {
        id: 'att-1',
        filename: 'doc.pdf',
        storedPath: '/tmp/attachments/att-1-doc.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        addedAt: Date.now(),
      }
      mockKanbanRemoveAttachment.mockResolvedValue(undefined)

      useKanbanStore.setState({
        currentWorkspaceId: 'ws-1',
        tasks: [makeTask({ id: 'task-1', attachments: [attachment] })],
      })

      await useKanbanStore.getState().removeAttachment('task-1', 'att-1')

      const task = useKanbanStore.getState().tasks.find((t) => t.id === 'task-1')
      expect(task?.attachments).toHaveLength(0)
    })

    it('le prompt inclut les chemins des fichiers joints', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask({
        attachments: [
          { id: 'att-1', filename: 'spec.pdf', storedPath: '/tmp/attachments/att-1-spec.pdf', mimeType: 'application/pdf', size: 4096, addedAt: Date.now() },
          { id: 'att-2', filename: 'mockup.png', storedPath: '/tmp/attachments/att-2-mockup.png', mimeType: 'image/png', size: 2048, addedAt: Date.now() },
        ],
      })
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      const writtenPrompt = mockKanbanWritePrompt.mock.calls[0]![2] as string
      expect(writtenPrompt).toContain('Fichiers joints')
      expect(writtenPrompt).toContain('spec.pdf')
      expect(writtenPrompt).toContain('/tmp/attachments/att-1-spec.pdf')
      expect(writtenPrompt).toContain('mockup.png')
      expect(writtenPrompt).toContain('/tmp/attachments/att-2-mockup.png')
    })

    it('le prompt n\'a pas de section fichiers joints sans attachments', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask() // no attachments
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      const writtenPrompt = mockKanbanWritePrompt.mock.calls[0]![2] as string
      expect(writtenPrompt).not.toContain('Fichiers joints')
    })
  })

  describe('navigation sidebar', () => {
    it('clic workspace ne change pas la vue (pas de setViewMode)', async () => {
      const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')
      useWorkspaceStore.setState({
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Test WS', color: '#9747FF', projectIds: ['proj-1'], createdAt: Date.now(), updatedAt: Date.now() }],
        projects: [{ id: 'proj-1', name: 'Project 1', path: '/tmp/project', hasClaude: true, workspaceId: 'ws-1', createdAt: Date.now() }],
      })

      const task = makeTask()
      useKanbanStore.setState({ tasks: [task] })

      mockKanbanWritePrompt.mockResolvedValue('/tmp/workspace-env/.workspaces/.kanban-prompt-task-1.md')
      mockKanbanUpdate.mockResolvedValue(undefined)

      await useKanbanStore.getState().sendToAi(task)

      expect(mockSetViewMode).not.toHaveBeenCalled()
    })
  })

  describe('reactivateIfDone (user message submission on DONE terminal)', () => {
    it('remet un ticket DONE en WORKING quand l\'utilisateur soumet un message (Enter)', () => {
      useKanbanStore.setState({
        tasks: [makeTask({ id: 'task-1', status: 'DONE', updatedAt: Date.now() - 60_000 })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      useKanbanStore.getState().reactivateIfDone('tab-abc')

      const task = useKanbanStore.getState().tasks.find((t) => t.id === 'task-1')
      expect(task?.status).toBe('WORKING')
      expect(mockKanbanUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-1',
          status: 'WORKING',
          workspaceId: 'ws-1',
        }),
      )
    })

    it('restaure la couleur du provider apres reactivation', () => {
      useKanbanStore.setState({
        tasks: [makeTask({ id: 'task-1', status: 'DONE', aiProvider: 'claude', updatedAt: Date.now() - 60_000 })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      useKanbanStore.getState().reactivateIfDone('tab-abc')

      expect(mockSetTabColor).toHaveBeenCalledWith('tab-abc', '#D4A574')
    })

    it('ne fait rien si le ticket n\'est pas DONE', () => {
      useKanbanStore.setState({
        tasks: [makeTask({ id: 'task-1', status: 'WORKING' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      useKanbanStore.getState().reactivateIfDone('tab-abc')

      expect(mockKanbanUpdate).not.toHaveBeenCalled()
    })

    it('ne fait rien si le tabId n\'est pas lie a un ticket', () => {
      useKanbanStore.setState({
        tasks: [makeTask({ id: 'task-1', status: 'DONE' })],
        kanbanTabIds: {},
      })

      useKanbanStore.getState().reactivateIfDone('tab-unknown')

      expect(mockKanbanUpdate).not.toHaveBeenCalled()
    })

    it('ne fait rien sans workspaceId', () => {
      useKanbanStore.setState({
        currentWorkspaceId: null,
        tasks: [makeTask({ id: 'task-1', status: 'DONE' })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      useKanbanStore.getState().reactivateIfDone('tab-abc')

      expect(mockKanbanUpdate).not.toHaveBeenCalled()
    })

    it('utilise la couleur Claude par defaut si pas de aiProvider', () => {
      useKanbanStore.setState({
        tasks: [makeTask({ id: 'task-1', status: 'DONE', updatedAt: Date.now() - 60_000 })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      useKanbanStore.getState().reactivateIfDone('tab-abc')

      // Default to Claude color (#D4A574) when no aiProvider set
      expect(mockSetTabColor).toHaveBeenCalledWith('tab-abc', '#D4A574')
    })

    it('ne fait pas de double reactivation sur des appels rapides', () => {
      mockKanbanUpdate.mockReturnValue(new Promise(() => { /* never resolves */ }))

      useKanbanStore.setState({
        tasks: [makeTask({ id: 'task-1', status: 'DONE', updatedAt: Date.now() - 60_000 })],
        kanbanTabIds: { 'task-1': 'tab-abc' },
      })

      useKanbanStore.getState().reactivateIfDone('tab-abc')
      useKanbanStore.getState().reactivateIfDone('tab-abc')

      // Only one update call despite two invocations
      expect(mockKanbanUpdate).toHaveBeenCalledTimes(1)
    })
  })
})
