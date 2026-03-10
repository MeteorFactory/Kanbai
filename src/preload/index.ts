import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS, AppSettings, Workspace, Namespace, KanbanTask, KanbanAttachment, FileEntry, SessionData, NpmPackageInfo, TodoEntry, ProjectStatsData, SearchResult, PromptTemplate, HttpMethod, ApiHeader, ApiTestAssertion, ApiTestFile, ApiResponse, ApiTestResult, DbConnectionConfig, DbFile, DbTable, DbTableInfo, DbQueryResult, DbBackupResult, DbBackupEntry, DbRestoreResult, DbEnvironmentTag, DbBackupLogEntry, DbNlPermissions, DbNlQueryResponse, DbNlGenerateResponse, DbNlHistoryEntry, DbNlInterpretRequest, DbNlInterpretResponse, McpServerConfig, McpHelpResult, SshKeyInfo, SshKeyType, AnalysisToolDef, AnalysisRunOptions, AnalysisReport, AnalysisProgress, AnalysisTicketRequest, RuleEntry, TemplateRuleEntry, PackageManagerType, PackageInfo, ProjectPackageManager, PkgNlMessage, HealthCheckConfig, HealthCheckFile, HealthCheckLogEntry, HealthCheckSchedulerStatus, DevOpsFile, DevOpsConnection, PipelineDefinition, PipelineRun, PipelineStage, PipelineApproval } from '../shared/types'

// Increase max listeners to accommodate multiple terminal tabs and event streams.
// Each terminal registers onData + onClose listeners on the shared ipcRenderer,
// so the default limit of 10 is easily exceeded.
ipcRenderer.setMaxListeners(50)

const api = {
  // Terminal
  terminal: {
    create: (options: { cwd?: string; shell?: string; workspaceId?: string; tabId?: string; provider?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),
    write: (id: string, data: string) =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_INPUT, { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, { id, cols, rows }),
    close: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CLOSE, { id }),
    onData: (callback: (data: { id: string; data: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, listener)
    },
    onClose: (callback: (data: { id: string; exitCode: number; signal: number }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; exitCode: number; signal: number },
      ) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_CLOSE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_CLOSE, listener)
    },
  },

  // Workspace
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (data: { name: string; color?: string; namespaceId?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, data),
    update: (data: { id: string } & Partial<Workspace>) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, data),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, { id }),
    permanentDelete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_PERMANENT_DELETE, { id }),
    checkDeleted: (name: string): Promise<Workspace | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CHECK_DELETED, { name }),
    restore: (id: string): Promise<Workspace | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RESTORE, { id }),
    export: (workspaceId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_EXPORT, { workspaceId }),
    import: (): Promise<{ success: boolean; error?: string; workspace?: Workspace }> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_IMPORT),
  },

  // Namespace
  namespace: {
    list: (): Promise<Namespace[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.NAMESPACE_LIST),
    create: (data: { name: string; color?: string }): Promise<Namespace> =>
      ipcRenderer.invoke(IPC_CHANNELS.NAMESPACE_CREATE, data),
    update: (data: { id: string } & Partial<Namespace>): Promise<Namespace> =>
      ipcRenderer.invoke(IPC_CHANNELS.NAMESPACE_UPDATE, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NAMESPACE_DELETE, { id }),
    ensureDefault: (): Promise<Namespace> =>
      ipcRenderer.invoke(IPC_CHANNELS.NAMESPACE_ENSURE_DEFAULT),
  },

  // Project
  project: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    selectDir: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SELECT_DIR),
    add: (data: { workspaceId: string; path: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ADD, data),
    remove: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REMOVE, { id }),
    scanClaude: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SCAN_CLAUDE, { path }),
    scanInfo: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SCAN_INFO, { path }),
    checkClaude: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CHECK_CLAUDE, { path }),
    deployClaude: (targetPath: string, force: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DEPLOY_CLAUDE, { targetPath, force }),
    checkPackages: (projectPath: string): Promise<{ packages: NpmPackageInfo[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CHECK_PACKAGES, { path: projectPath }),
    updatePackage: (projectPath: string, packageName?: string): Promise<{ success: boolean; error?: string; output?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE_PACKAGE, { projectPath, packageName }),
    writeClaudeSettings: (projectPath: string, settings: Record<string, unknown>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_WRITE_CLAUDE_SETTINGS, { projectPath, settings }),
    writeClaudeMd: (projectPath: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_WRITE_CLAUDE_MD, { projectPath, content }),
    readClaudeLocalSettings: (projectPath: string): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_READ_CLAUDE_LOCAL_SETTINGS, { projectPath }),
    writeClaudeLocalSettings: (projectPath: string, settings: Record<string, unknown>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_WRITE_CLAUDE_LOCAL_SETTINGS, { projectPath, settings }),
    readUserClaudeSettings: (): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_READ_USER_CLAUDE_SETTINGS),
    writeUserClaudeSettings: (settings: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_WRITE_USER_CLAUDE_SETTINGS, settings),
    readManagedSettings: (): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_READ_MANAGED_SETTINGS),
    scanTodos: (projectPath: string): Promise<TodoEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SCAN_TODOS, { path: projectPath }),
    loadIgnoredTodos: (projectPath: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LOAD_IGNORED_TODOS, { path: projectPath }),
    saveIgnoredTodos: (projectPath: string, ignoredKeys: string[]): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE_IGNORED_TODOS, { path: projectPath, ignoredKeys }),
    stats: (projectPath: string): Promise<ProjectStatsData> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_STATS, { path: projectPath }),
    getNotes: (projectId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET_NOTES, { projectId }),
    saveNotes: (projectId: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE_NOTES, { projectId, content }),
    exportClaudeConfig: (projectPath: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_EXPORT_CONFIG, { projectPath }),
    importClaudeConfig: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_IMPORT_CONFIG, { projectPath }),
  },

  // File system
  fs: {
    readDir: (dirPath: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_READ_DIR, { path: dirPath }),
    readFile: (filePath: string): Promise<{ content: string | null; error: string | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, { path: filePath }),
    writeFile: (filePath: string, content: string): Promise<{ success: boolean; error: string | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, { path: filePath, content }),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_RENAME, { oldPath, newPath }),
    delete: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE, { path: filePath }),
    copy: (src: string, dest: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_COPY, { src, dest }),
    mkdir: (dirPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_MKDIR, { path: dirPath }),
    exists: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_EXISTS, { path: filePath }),
    readBase64: (filePath: string): Promise<{ data: string | null; error: string | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_READ_BASE64, { path: filePath }),
    openInFinder: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_OPEN_IN_FINDER, { path: filePath }),
    search: (cwd: string, query: string, fileTypes?: string[], caseSensitive?: boolean): Promise<SearchResult[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_SEARCH, { cwd, query, fileTypes, caseSensitive }),
  },

  // Git
  git: {
    init: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT, { cwd }),
    status: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, { cwd }),
    log: (cwd: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, { cwd, limit }),
    branches: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCHES, { cwd }),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CHECKOUT, { cwd, branch }),
    push: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, { cwd }),
    pull: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, { cwd }),
    commit: (cwd: string, message: string, files: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, { cwd, message, files }),
    diff: (cwd: string, file?: string, staged?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, { cwd, file, staged }),
    stash: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH, { cwd }),
    stashPop: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH_POP, { cwd }),
    createBranch: (cwd: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_BRANCH, { cwd, name }),
    deleteBranch: (cwd: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DELETE_BRANCH, { cwd, name }),
    merge: (cwd: string, branch: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MERGE, { cwd, branch }),
    fetch: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FETCH, { cwd }),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, { cwd, files }),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, { cwd, files }),
    discard: (cwd: string, files: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD, { cwd, files }),
    show: (cwd: string, hash: string): Promise<{ files: Array<{ status: string; file: string }>; diff: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SHOW, { cwd, hash }),
    stashList: (cwd: string): Promise<Array<{ ref: string; message: string; date: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH_LIST, { cwd }),
    renameBranch: (cwd: string, oldName: string, newName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_RENAME_BRANCH, { cwd, oldName, newName }),
    tags: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_TAGS, { cwd }),
    createTag: (cwd: string, name: string, message?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_TAG, { cwd, name, message }),
    deleteTag: (cwd: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DELETE_TAG, { cwd, name }),
    cherryPick: (cwd: string, hash: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CHERRY_PICK, { cwd, hash }),
    diffBranches: (cwd: string, branch1: string, branch2: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF_BRANCHES, { cwd, branch1, branch2 }),
    blame: (cwd: string, file: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BLAME, { cwd, file }),
    remotes: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOTES, { cwd }),
    addRemote: (cwd: string, name: string, url: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_ADD_REMOTE, { cwd, name, url }),
    removeRemote: (cwd: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOVE_REMOTE, { cwd, name }),
    resetSoft: (cwd: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_RESET_SOFT, { cwd }),
    worktreeAdd: (cwd: string, worktreePath: string, branch: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_ADD, { cwd, worktreePath, branch }),
    worktreeRemove: (cwd: string, worktreePath: string, force?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_REMOVE, { cwd, worktreePath, force }),
    worktreeList: (cwd: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_LIST, { cwd }),
    worktreeFinalize: (worktreePath: string, ticketLabel: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_FINALIZE, { worktreePath, ticketLabel }),
    worktreeMergeAndCleanup: (repoPath: string, worktreePath: string, worktreeBranch: string, ticketLabel: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_MERGE_AND_CLEANUP, { repoPath, worktreePath, worktreeBranch, ticketLabel }),
    branchIsMerged: (cwd: string, branch: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_IS_MERGED, { cwd, branch }),
  },

  // Claude
  claude: {
    start: (data: {
      projectId: string
      projectPath: string
      terminalId: string
      prompt?: string
      loopMode?: boolean
      loopDelay?: number
    }) => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_START, data),
    stop: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_STOP, { id: sessionId }),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_STATUS),
    onSessionEnd: (callback: (data: { id: string; status: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; status: string },
      ) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_SESSION_END, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_SESSION_END, listener)
    },
    onActivity: (callback: (data: { path: string; status: string; timestamp: number }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { path: string; status: string; timestamp: number },
      ) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_ACTIVITY, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_ACTIVITY, listener)
    },
    installHooks: (projectPath: string, workspaceName?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_INSTALL_HOOKS, { projectPath, workspaceName }),
    checkHooks: (projectPath: string, workspaceName?: string): Promise<{ installed: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CHECK_HOOKS, { projectPath, workspaceName }),
    validateSettings: (projectPath: string, workspaceName?: string): Promise<{ valid: boolean; errors: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_VALIDATE_SETTINGS, { projectPath, workspaceName }),
    fixSettings: (projectPath: string, workspaceName?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_FIX_SETTINGS, { projectPath, workspaceName }),
    removeHooks: (projectPath: string, workspaceName?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_REMOVE_HOOKS, { projectPath, workspaceName }),
    checkHooksStatus: (projectPath: string, workspaceName?: string): Promise<{ installed: boolean; upToDate: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CHECK_HOOKS_STATUS, { projectPath, workspaceName }),
  },

  // Claude Memory
  claudeMemory: {
    readAuto: (projectPath: string): Promise<{ content: string; topicFiles: { name: string; path: string }[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_READ_AUTO, { projectPath }),
    toggleAuto: (projectPath: string, enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_TOGGLE_AUTO, { projectPath, enabled }),
    listRules: (projectPath: string): Promise<{ rules: RuleEntry[]; directories: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_LIST_RULES, { projectPath }),
    readRule: (projectPath: string, filename: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_READ_RULE, { projectPath, filename }),
    writeRule: (projectPath: string, filename: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_WRITE_RULE, { projectPath, filename, content }),
    deleteRule: (projectPath: string, filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_DELETE_RULE, { projectPath, filename }),
    readFile: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_READ_FILE, { filePath }),
    writeFile: (filePath: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_WRITE_FILE, { filePath, content }),
    readManaged: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_READ_MANAGED),
    init: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_INIT, { projectPath }),
    exportRules: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_EXPORT_RULES, { projectPath }),
    importRules: (projectPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_IMPORT_RULES, { projectPath }),
    listSharedRules: (): Promise<Array<{ filename: string; fullPath: string; content: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_LIST_SHARED_RULES),
    writeSharedRule: (filename: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_WRITE_SHARED_RULE, { filename, content }),
    deleteSharedRule: (filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_DELETE_SHARED_RULE, { filename }),
    linkSharedRule: (projectPath: string, filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_LINK_SHARED_RULE, { projectPath, filename }),
    unlinkSharedRule: (projectPath: string, filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_UNLINK_SHARED_RULE, { projectPath, filename }),
    initDefaultRules: (projectPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_INIT_DEFAULT_RULES, { projectPath }),
    moveRule: (projectPath: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_MOVE_RULE, { projectPath, oldPath, newPath }),
    createRuleDir: (projectPath: string, dirPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_CREATE_RULE_DIR, { projectPath, dirPath }),
    renameRuleDir: (projectPath: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_RENAME_RULE_DIR, { projectPath, oldPath, newPath }),
    deleteRuleDir: (projectPath: string, dirPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_DELETE_RULE_DIR, { projectPath, dirPath }),
    listTemplates: (): Promise<TemplateRuleEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_LIST_TEMPLATES),
    readTemplate: (relativePath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_READ_TEMPLATE, { relativePath }),
    importTemplates: (projectPath: string, relativePaths: string[]): Promise<{ success: boolean; imported: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_IMPORT_TEMPLATES, { projectPath, relativePaths }),
    syncAiRules: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_SYNC_AI_RULES, { projectPath }),
    checkAiRules: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MEMORY_CHECK_AI_RULES, { projectPath }),
  },

  // Kanban
  kanban: {
    list: (workspaceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_LIST, { workspaceId }),
    create: (task: Omit<KanbanTask, 'id' | 'createdAt' | 'updatedAt'> & { workspaceId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_CREATE, task),
    update: (task: Partial<KanbanTask> & { id: string; workspaceId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_UPDATE, task),
    delete: (id: string, workspaceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_DELETE, { id, workspaceId }),
    writePrompt: (projectPath: string, taskId: string, prompt: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_WRITE_PROMPT, { projectPath, taskId, prompt }),
    cleanupPrompt: (projectPath: string, taskId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_CLEANUP_PROMPT, { projectPath, taskId }),
    getPath: (workspaceId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_GET_PATH, { workspaceId }),
    selectFiles: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_SELECT_FILES),
    attachFile: (taskId: string, workspaceId: string, filePath: string): Promise<KanbanAttachment> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_ATTACH_FILE, { taskId, workspaceId, filePath }),
    attachFromClipboard: (taskId: string, workspaceId: string, dataBase64: string, filename: string, mimeType: string): Promise<KanbanAttachment> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_ATTACH_FROM_CLIPBOARD, { taskId, workspaceId, dataBase64, filename, mimeType }),
    removeAttachment: (taskId: string, workspaceId: string, attachmentId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_REMOVE_ATTACHMENT, { taskId, workspaceId, attachmentId }),
    getWorkingTicket: (workspaceId: string): Promise<{ ticketNumber: number | null; isCtoTicket: boolean; type?: string } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_GET_WORKING_TICKET, { workspaceId }),
    watch: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_WATCH, { workspaceId }),
    unwatch: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_UNWATCH),
    watchAdd: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_WATCH_ADD, { workspaceId }),
    watchRemove: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_WATCH_REMOVE, { workspaceId }),
    linkConversation: (cwd: string, taskId: string, workspaceId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_LINK_CONVERSATION, { cwd, taskId, workspaceId }),
    prequalify: (data: { title: string; description: string }): Promise<{ suggestedType: string; suggestedPriority: string; clarifiedDescription: string; isVague: boolean; splitSuggestions?: Array<{ title: string; description: string; type: string; priority: string }> } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_PREQUALIFY, data),
    getConfig: (workspaceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_GET_CONFIG, { workspaceId }),
    setConfig: (workspaceId: string, config: Record<string, boolean | number>) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_SET_CONFIG, { workspaceId, config }),
    getDefaultConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_GET_DEFAULT_CONFIG),
    setDefaultConfig: (config: Record<string, boolean | number>) =>
      ipcRenderer.invoke(IPC_CHANNELS.KANBAN_SET_DEFAULT_CONFIG, { config }),
    onFileChanged: (callback: (data: { workspaceId: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { workspaceId: string }) =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.KANBAN_FILE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.KANBAN_FILE_CHANGED, listener)
    },
  },

  // Workspace storage
  workspaceDir: {
    init: (projectPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_INIT_DIR, { projectPath }),
  },

  // Workspace env (virtual env with symlinks)
  workspaceEnv: {
    setup: (workspaceName: string, projectPaths: string[], workspaceId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_ENV_SETUP, { workspaceName, workspaceId, projectPaths }),
    getPath: (workspaceName: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_ENV_PATH, { workspaceName }),
    delete: (workspaceName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_ENV_DELETE, { workspaceName }),
  },

  // Updates
  updates: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    install: (
      tool: string,
      scope: string,
      projectId?: string,
      installSource?: string,
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL, { tool, scope, projectId, installSource }),
    uninstall: (tool: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_UNINSTALL, { tool }),
    onStatus: (callback: (data: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, listener)
    },
  },

  // Git Config (per-namespace profiles)
  gitConfig: {
    get: (namespaceId: string): Promise<{ userName: string; userEmail: string; isCustom: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CONFIG_GET, { namespaceId }),
    set: (namespaceId: string, userName: string, userEmail: string): Promise<{ success: boolean; isCustom: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CONFIG_SET, { namespaceId, userName, userEmail }),
    delete: (namespaceId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CONFIG_DELETE, { namespaceId }),
  },

  // Shell
  shell: {
    openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, { url }),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.APP_SETTINGS_GET),
    set: (settings: Partial<AppSettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SETTINGS_SET, settings),
  },

  // Session
  session: {
    save: (session: SessionData) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_SAVE, session),
    load: (): Promise<SessionData | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_LOAD),
    clear: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_CLEAR),
  },

  // Prompt templates
  prompts: {
    list: (): Promise<PromptTemplate[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_LIST),
    create: (data: Omit<PromptTemplate, 'id' | 'createdAt'>): Promise<PromptTemplate> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_CREATE, data),
    update: (data: Partial<PromptTemplate> & { id: string }): Promise<PromptTemplate | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_UPDATE, data),
    delete: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_DELETE, { id }),
  },

  // Claude agents & skills
  claudeAgents: {
    list: (projectPath: string): Promise<Array<{ name: string; filename: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_LIST_AGENTS, { projectPath }),
    read: (projectPath: string, filename: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_READ_AGENT, { projectPath, filename }),
    write: (projectPath: string, filename: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_WRITE_AGENT, { projectPath, filename, content }),
    delete: (projectPath: string, filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DELETE_AGENT, { projectPath, filename }),
    rename: (projectPath: string, oldFilename: string, newFilename: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_RENAME_AGENT, { projectPath, oldFilename, newFilename }),
  },

  claudeSkills: {
    list: (projectPath: string): Promise<Array<{ name: string; filename: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_LIST_SKILLS, { projectPath }),
    read: (projectPath: string, filename: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_READ_SKILL, { projectPath, filename }),
    write: (projectPath: string, filename: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_WRITE_SKILL, { projectPath, filename, content }),
    delete: (projectPath: string, filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DELETE_SKILL, { projectPath, filename }),
    rename: (projectPath: string, oldFilename: string, newFilename: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_RENAME_SKILL, { projectPath, oldFilename, newFilename }),
  },

  // MCP servers
  mcp: {
    getHelp: (name: string, config: McpServerConfig): Promise<McpHelpResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_HELP, { name, config }),
    workspaceRead: (workspaceName: string): Promise<{ mcpServers: Record<string, McpServerConfig> }> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_WORKSPACE_READ, { workspaceName }),
    workspaceWrite: (workspaceName: string, mcpServers: Record<string, McpServerConfig>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_WORKSPACE_WRITE, { workspaceName, mcpServers }),
  },

  // Claude defaults library
  claudeDefaults: {
    profiles: (): Promise<Array<{ id: string; name: string; description: string; category: string; content: string; filename: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DEFAULTS_PROFILES),
    skills: (): Promise<Array<{ id: string; name: string; description: string; category: string; content: string; filename: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DEFAULTS_SKILLS),
    deployProfile: (projectPath: string, profileId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DEPLOY_PROFILE, { projectPath, profileId }),
    deploySkill: (projectPath: string, skillId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DEPLOY_SKILL, { projectPath, skillId }),
    checkDeployed: (projectPath: string): Promise<{ deployedProfiles: string[]; deployedSkills: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CHECK_DEPLOYED, { projectPath }),
  },

  // API Tester
  api: {
    execute: (
      request: { method: HttpMethod; url: string; headers: ApiHeader[]; body: string; bodyType: string; tests: ApiTestAssertion[] },
      variables: Record<string, string>,
    ): Promise<{ response: ApiResponse; testResults: ApiTestResult[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_EXECUTE, { ...request, variables }),
    load: (projectPath: string): Promise<ApiTestFile> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_LOAD, { projectPath }),
    save: (projectPath: string, data: ApiTestFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_SAVE, { projectPath, data }),
    export: (data: ApiTestFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_EXPORT, { data }),
    import: (): Promise<{ success: boolean; data: ApiTestFile | null; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_IMPORT),
  },

  // Health Check
  healthcheck: {
    load: (projectPath: string): Promise<HealthCheckFile> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_LOAD, { projectPath }),
    save: (projectPath: string, data: HealthCheckFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_SAVE, { projectPath, data }),
    execute: (projectPath: string, check: HealthCheckConfig, data: HealthCheckFile): Promise<HealthCheckLogEntry> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_EXECUTE, { projectPath, check, data }),
    startScheduler: (projectPath: string, data: HealthCheckFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_START_SCHEDULER, { projectPath, data }),
    stopScheduler: (projectPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_STOP_SCHEDULER, { projectPath }),
    updateInterval: (projectPath: string, checkId: string, data: HealthCheckFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_UPDATE_INTERVAL, { projectPath, checkId, data }),
    getStatuses: (projectPath: string): Promise<HealthCheckSchedulerStatus[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_STATUS, { projectPath }),
    export: (data: HealthCheckFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_EXPORT, { data }),
    import: (): Promise<{ success: boolean; data: HealthCheckFile | null; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_IMPORT),
    clearHistory: (projectPath: string, data: HealthCheckFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTHCHECK_CLEAR_HISTORY, { projectPath, data }),
    onStatusUpdate: (callback: (data: { projectPath: string; statuses: HealthCheckSchedulerStatus[] }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { projectPath: string; statuses: HealthCheckSchedulerStatus[] }) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.HEALTHCHECK_STATUS_UPDATE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.HEALTHCHECK_STATUS_UPDATE, listener)
    },
  },

  // Database Explorer
  database: {
    connect: async (connectionId: string, config: DbConnectionConfig): Promise<void> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_CONNECT, { connectionId, config })
      if (!r.success) throw new Error(r.error || 'Connection failed')
    },
    disconnect: async (connectionId: string): Promise<void> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_DISCONNECT, { connectionId })
      if (!r.success) throw new Error(r.error || 'Disconnect failed')
    },
    testConnection: (config: DbConnectionConfig): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_TEST_CONNECTION, { config }),
    listDatabases: async (connectionId: string): Promise<string[]> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_DATABASES, { connectionId })
      if (!r.success) throw new Error(r.error || 'Failed to list databases')
      return r.databases
    },
    listSchemas: async (connectionId: string): Promise<string[]> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_SCHEMAS, { connectionId })
      if (!r.success) throw new Error(r.error || 'Failed to list schemas')
      return r.schemas
    },
    listTables: async (connectionId: string, schema?: string): Promise<DbTable[]> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_TABLES, { connectionId, schema })
      if (!r.success) throw new Error(r.error || 'Failed to list tables')
      return r.tables
    },
    tableInfo: async (connectionId: string, table: string, schema?: string): Promise<DbTableInfo> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_TABLE_INFO, { connectionId, table, schema })
      if (!r.success) throw new Error(r.error || 'Failed to get table info')
      return r.info
    },
    executeQuery: async (connectionId: string, sql: string, limit?: number, offset?: number): Promise<DbQueryResult> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_EXECUTE_QUERY, { connectionId, sql, limit, offset })
      return r.result
    },
    cancelQuery: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_CANCEL_QUERY, { connectionId }),
    load: (workspaceId: string): Promise<DbFile> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_LOAD, { workspaceId }),
    save: (workspaceId: string, data: DbFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_SAVE, { workspaceId, data }),
    export: (data: DbFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_EXPORT, { data }),
    import: (): Promise<{ success: boolean; data: DbFile | null; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_IMPORT),
    backup: (connectionId: string, connectionName: string, config: DbConnectionConfig, options?: { dataOnly?: boolean; schemaOnly?: boolean; tables?: string[] }, environmentTag?: DbEnvironmentTag): Promise<DbBackupResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP, { connectionId, connectionName, config, options, environmentTag }),
    onBackupLog: (callback: (entry: DbBackupLogEntry) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DbBackupLogEntry) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.DB_BACKUP_LOG, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.DB_BACKUP_LOG, listener)
    },
    backupList: (connectionId: string): Promise<{ success: boolean; entries: DbBackupEntry[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_LIST, { connectionId }),
    backupDelete: (connectionId: string, backupId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_DELETE, { connectionId, backupId }),
    restore: (entry: DbBackupEntry, targetConfig: DbConnectionConfig): Promise<DbRestoreResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_RESTORE, { entry, targetConfig }),
    transfer: (sourceId: string, targetId: string, tables: string[]): Promise<{ success: boolean; errors: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_TRANSFER, { sourceId, targetId, tables }),
    nlQuery: (connectionId: string, prompt: string, permissions: DbNlPermissions, provider?: string): Promise<DbNlQueryResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_NL_QUERY, { connectionId, prompt, permissions, provider }),
    nlGenerateSql: (connectionId: string, prompt: string, permissions: DbNlPermissions, history?: DbNlHistoryEntry[], provider?: string): Promise<DbNlGenerateResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_NL_GENERATE_SQL, { connectionId, prompt, permissions, history, provider }),
    nlInterpret: (req: DbNlInterpretRequest): Promise<DbNlInterpretResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_NL_INTERPRET, req),
    nlCancel: (connectionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_NL_CANCEL, { connectionId }),
    getSchemaContext: async (connectionId: string): Promise<string> => {
      const r = await ipcRenderer.invoke(IPC_CHANNELS.DB_GET_SCHEMA_CONTEXT, { connectionId })
      if (!r.success) throw new Error(r.error || 'Failed to get schema context')
      return r.schema
    },
  },

  // Codex config
  codexConfig: {
    read: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_READ_CONFIG, { projectPath }),
    write: (projectPath: string, config: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_WRITE_CONFIG, { projectPath, config }),
    check: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_CHECK_CONFIG, { projectPath }),
  },

  // Codex rules
  codexRules: {
    list: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_LIST_RULES, { projectPath }),
    read: (projectPath: string, filename: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_READ_RULE, { projectPath, filename }),
    write: (projectPath: string, filename: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_WRITE_RULE, { projectPath, filename, content }),
    delete: (projectPath: string, filename: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_DELETE_RULE, { projectPath, filename }),
  },

  // Codex memory (AGENTS.md)
  codexMemory: {
    readAgentsMd: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_READ_AGENTS_MD, { projectPath }),
    writeAgentsMd: (projectPath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_WRITE_AGENTS_MD, { projectPath, content }),
    readGlobalAgentsMd: () => ipcRenderer.invoke(IPC_CHANNELS.CODEX_READ_GLOBAL_AGENTS_MD),
    writeGlobalAgentsMd: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_WRITE_GLOBAL_AGENTS_MD, { content }),
  },

  // Codex skills
  codexSkills: {
    list: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_LIST_SKILLS, { projectPath }),
    read: (projectPath: string, dirname: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_READ_SKILL, { projectPath, dirname }),
    write: (projectPath: string, dirname: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_WRITE_SKILL, { projectPath, dirname, content }),
    delete: (projectPath: string, dirname: string) => ipcRenderer.invoke(IPC_CHANNELS.CODEX_DELETE_SKILL, { projectPath, dirname }),
  },

  // Copilot config
  copilotConfig: {
    read: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_READ_CONFIG, { projectPath }),
    write: (projectPath: string, config: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_WRITE_CONFIG, { projectPath, config }),
    check: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_CHECK_CONFIG, { projectPath }),
  },

  // Copilot instructions (memory)
  copilotMemory: {
    readInstructions: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_READ_INSTRUCTIONS, { projectPath }),
    writeInstructions: (projectPath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_WRITE_INSTRUCTIONS, { projectPath, content }),
    readGlobalInstructions: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_READ_GLOBAL_INSTRUCTIONS),
    writeGlobalInstructions: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_WRITE_GLOBAL_INSTRUCTIONS, { content }),
  },

  // Copilot skills
  copilotSkills: {
    list: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_LIST_SKILLS, { projectPath }),
    read: (projectPath: string, dirname: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_READ_SKILL, { projectPath, dirname }),
    write: (projectPath: string, dirname: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_WRITE_SKILL, { projectPath, dirname, content }),
    delete: (projectPath: string, dirname: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_DELETE_SKILL, { projectPath, dirname }),
  },

  // Gemini config
  geminiConfig: {
    read: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_READ_CONFIG, { projectPath }),
    write: (projectPath: string, config: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_WRITE_CONFIG, { projectPath, config }),
    check: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_CHECK_CONFIG, { projectPath }),
  },

  // Gemini memory (GEMINI.md)
  geminiMemory: {
    readMemory: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_READ_MEMORY, { projectPath }),
    writeMemory: (projectPath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_WRITE_MEMORY, { projectPath, content }),
    readGlobalMemory: () => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_READ_GLOBAL_MEMORY),
    writeGlobalMemory: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_WRITE_GLOBAL_MEMORY, { content }),
  },

  // Gemini skills
  geminiSkills: {
    list: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_LIST_SKILLS, { projectPath }),
    read: (projectPath: string, dirname: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_READ_SKILL, { projectPath, dirname }),
    write: (projectPath: string, dirname: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_WRITE_SKILL, { projectPath, dirname, content }),
    delete: (projectPath: string, dirname: string) => ipcRenderer.invoke(IPC_CHANNELS.GEMINI_DELETE_SKILL, { projectPath, dirname }),
  },

  // AI provider
  aiProvider: {
    set: (projectId: string, provider: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROVIDER_SET, { projectId, provider }),
  },

  // AI defaults per project (kanban, packages, database)
  aiDefaults: {
    get: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_DEFAULTS_GET, { projectId }),
    set: (projectId: string, defaults: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_DEFAULTS_SET, { projectId, defaults }),
  },

  // App info
  app: {
    version: (): Promise<{ version: string; name: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  },

  // App Update (electron-updater)
  appUpdate: {
    check: (): Promise<{ success: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_CHECK),
    download: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_DOWNLOAD),
    install: () =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_INSTALL),
    onStatus: (callback: (data: { status: string; version?: string; releaseNotes?: string; percent?: number; message?: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { status: string; version?: string; releaseNotes?: string; percent?: number; message?: string }) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.APP_UPDATE_STATUS, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.APP_UPDATE_STATUS, listener) }
    },
  },

  // SSH Keys
  ssh: {
    listKeys: (): Promise<{ success: boolean; keys: SshKeyInfo[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_LIST_KEYS),
    generateKey: (name: string, type: SshKeyType, comment: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_GENERATE_KEY, { name, type, comment }),
    readPublicKey: (keyPath: string): Promise<{ success: boolean; content: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_READ_PUBLIC_KEY, { keyPath }),
    importKey: (name: string, privateKey: string, publicKey?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_IMPORT_KEY, { name, privateKey, publicKey }),
    deleteKey: (name: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_DELETE_KEY, { name }),
    openDirectory: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_OPEN_DIRECTORY),
    selectKeyFile: (): Promise<{ success: boolean; canceled?: boolean; filePath?: string; fileName?: string; content?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_SELECT_KEY_FILE),
  },

  // Code Analysis
  analysis: {
    detectTools: (projectPath: string): Promise<AnalysisToolDef[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_DETECT_TOOLS, { projectPath }),
    run: (options: AnalysisRunOptions): Promise<AnalysisReport> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_RUN, options),
    cancel: (toolId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_CANCEL, { toolId }),
    loadReports: (projectPath: string): Promise<AnalysisReport[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_LOAD_REPORTS, { projectPath }),
    deleteReport: (projectPath: string, reportId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_DELETE_REPORT, { projectPath, reportId }),
    createTickets: (request: AnalysisTicketRequest): Promise<{ success: boolean; ticketCount: number; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_CREATE_TICKETS, request),
    onProgress: (callback: (data: AnalysisProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AnalysisProgress) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.ANALYSIS_PROGRESS, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.ANALYSIS_PROGRESS, listener) }
    },
    installTool: (toolId: string): Promise<{ success: boolean; installed: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_INSTALL_TOOL, { toolId }),
    onInstallProgress: (callback: (data: { toolId: string; output: string; status: 'running' | 'done' | 'error' }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { toolId: string; output: string; status: 'running' | 'done' | 'error' }) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.ANALYSIS_INSTALL_PROGRESS, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.ANALYSIS_INSTALL_PROGRESS, handler) }
    },
  },

  // Packages (multi-technology)
  packages: {
    detect: (projects: Array<{ id: string; path: string; name: string }>): Promise<ProjectPackageManager[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_DETECT, { paths: projects }),
    list: (projectPath: string, manager: PackageManagerType): Promise<{ packages: PackageInfo[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_LIST, { projectPath, manager }),
    update: (projectPath: string, manager: PackageManagerType, packageName?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_UPDATE, { projectPath, manager, packageName }),
    search: (manager: PackageManagerType, query: string): Promise<{ results: PackageInfo[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_SEARCH, { manager, query }),
    nlAsk: (projectPath: string, manager: PackageManagerType, question: string, history: PkgNlMessage[], provider?: string): Promise<{ answer: string; action?: unknown }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_NL_ASK, { projectPath, manager, question, history, provider }),
    nlCancel: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PACKAGES_NL_CANCEL),
  },

  // Pixel Agents
  pixelAgents: {
    start: () => ipcRenderer.invoke(IPC_CHANNELS.PIXEL_AGENTS_START),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.PIXEL_AGENTS_STOP),
    webviewReady: () => ipcRenderer.invoke(IPC_CHANNELS.PIXEL_AGENTS_WEBVIEW_READY),
    saveLayout: (layout: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PIXEL_AGENTS_SAVE_LAYOUT, layout),
    onEvent: (callback: (event: { type: string; [key: string]: unknown }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { type: string }) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.PIXEL_AGENTS_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PIXEL_AGENTS_EVENT, listener)
    },
  },

  // DevOps
  devops: {
    load: (projectPath: string): Promise<DevOpsFile> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_LOAD, { projectPath }),
    save: (projectPath: string, data: DevOpsFile): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_SAVE, { projectPath, data }),
    testConnection: (connection: DevOpsConnection): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_TEST_CONNECTION, { connection }),
    listPipelines: (connection: DevOpsConnection): Promise<{ success: boolean; pipelines: PipelineDefinition[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_LIST_PIPELINES, { connection }),
    getPipelineRuns: (connection: DevOpsConnection, pipelineId: number, count?: number): Promise<{ success: boolean; runs: PipelineRun[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_GET_PIPELINE_RUNS, { connection, pipelineId, count }),
    runPipeline: (connection: DevOpsConnection, pipelineId: number, branch?: string): Promise<{ success: boolean; run?: PipelineRun; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_RUN_PIPELINE, { connection, pipelineId, branch }),
    getBuildTimeline: (connection: DevOpsConnection, buildId: number): Promise<{ success: boolean; stages: PipelineStage[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_GET_BUILD_TIMELINE, { connection, buildId }),
    getApprovals: (connection: DevOpsConnection, buildIds: number[]): Promise<{ success: boolean; approvals: PipelineApproval[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_GET_APPROVALS, { connection, buildIds }),
    approve: (connection: DevOpsConnection, approvalId: string, status: 'approved' | 'rejected', comment?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_APPROVE, { connection, approvalId, status, comment }),
    getBuildLog: (connection: DevOpsConnection, buildId: number, logId: number): Promise<{ success: boolean; content: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVOPS_GET_BUILD_LOG, { connection, buildId, logId }),
  },

  // Notifications
  notify: (title: string, body: string) =>
    ipcRenderer.send(IPC_CHANNELS.APP_NOTIFICATION, { title, body }),

  // Menu actions (from main process)
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on(IPC_CHANNELS.MENU_ACTION, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.MENU_ACTION, listener) }
  },

  // Utility — resolve file path from drag & drop (required for sandbox mode)
  getFilePathFromDrop: (file: File): string => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('kanbai', api)

export type KanbaiAPI = typeof api
