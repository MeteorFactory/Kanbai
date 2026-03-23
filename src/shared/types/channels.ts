// IPC Channel types

export const IPC_CHANNELS = {
  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_CHECK_BUSY: 'terminal:checkBusy',
  TERMINAL_UPDATE_LABEL: 'terminal:updateLabel',
  TERMINAL_SET_TASK_INFO: 'terminal:setTaskInfo',
  TERMINAL_GET_OUTPUT: 'terminal:getOutput',
  TERMINAL_SYNC_TABS: 'terminal:syncTabs',
  TERMINAL_COMPANION_CREATE: 'terminal:companionCreate',

  // Workspace
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_PERMANENT_DELETE: 'workspace:permanentDelete',
  WORKSPACE_CHECK_DELETED: 'workspace:checkDeleted',
  WORKSPACE_RESTORE: 'workspace:restore',

  // Project
  PROJECT_LIST: 'project:list',
  PROJECT_ADD: 'project:add',
  PROJECT_REMOVE: 'project:remove',
  PROJECT_SCAN_CLAUDE: 'project:scanClaude',
  PROJECT_SELECT_DIR: 'project:selectDir',

  // Claude
  CLAUDE_START: 'claude:start',
  CLAUDE_STOP: 'claude:stop',
  CLAUDE_STATUS: 'claude:status',
  CLAUDE_SESSION_END: 'claude:sessionEnd',

  // Kanban
  KANBAN_LIST: 'kanban:list',
  KANBAN_CREATE: 'kanban:create',
  KANBAN_UPDATE: 'kanban:update',
  KANBAN_DELETE: 'kanban:delete',
  KANBAN_WRITE_PROMPT: 'kanban:writePrompt',
  KANBAN_CLEANUP_PROMPT: 'kanban:cleanupPrompt',
  KANBAN_GET_PATH: 'kanban:getPath',
  KANBAN_SELECT_FILES: 'kanban:selectFiles',
  KANBAN_ATTACH_FILE: 'kanban:attachFile',
  KANBAN_ATTACH_FROM_CLIPBOARD: 'kanban:attachFromClipboard',
  KANBAN_REMOVE_ATTACHMENT: 'kanban:removeAttachment',
  KANBAN_READ_ATTACHMENT: 'kanban:readAttachment',
  KANBAN_GET_WORKING_TICKET: 'kanban:getWorkingTicket',
  KANBAN_GET_WORKING_TICKETS: 'kanban:getWorkingTickets',
  KANBAN_WATCH: 'kanban:watch',
  KANBAN_UNWATCH: 'kanban:unwatch',
  KANBAN_WATCH_ADD: 'kanban:watchAdd',
  KANBAN_WATCH_REMOVE: 'kanban:watchRemove',
  KANBAN_FILE_CHANGED: 'kanban:fileChanged',
  KANBAN_LINK_CONVERSATION: 'kanban:linkConversation',
  KANBAN_PREQUALIFY: 'kanban:prequalify',
  KANBAN_GET_CONFIG: 'kanban:getConfig',
  KANBAN_SET_CONFIG: 'kanban:setConfig',
  KANBAN_GET_DEFAULT_CONFIG: 'kanban:getDefaultConfig',
  KANBAN_SET_DEFAULT_CONFIG: 'kanban:setDefaultConfig',

  // Updates
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
  UPDATE_UNINSTALL: 'update:uninstall',
  UPDATE_STATUS: 'update:status',

  // Claude Plugins
  CLAUDE_PLUGINS_LIST: 'claudePlugins:list',
  CLAUDE_PLUGINS_INSTALL: 'claudePlugins:install',
  CLAUDE_PLUGINS_UNINSTALL: 'claudePlugins:uninstall',

  // Auto-Clauder
  AUTOCLAUDE_APPLY: 'autoclaude:apply',
  AUTOCLAUDE_TEMPLATES: 'autoclaude:templates',

  // Project info
  PROJECT_SCAN_INFO: 'project:scanInfo',
  PROJECT_DEPLOY_CLAUDE: 'project:deployClaude',
  PROJECT_CHECK_CLAUDE: 'project:checkClaude',
  PROJECT_CHECK_PACKAGES: 'project:checkPackages',
  PROJECT_UPDATE_PACKAGE: 'project:updatePackage',

  // File system
  FS_READ_DIR: 'fs:readDir',
  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_RENAME: 'fs:rename',
  FS_DELETE: 'fs:delete',
  FS_COPY: 'fs:copy',
  FS_MKDIR: 'fs:mkdir',
  FS_EXISTS: 'fs:exists',
  FS_READ_BASE64: 'fs:readBase64',
  FS_OPEN_IN_FINDER: 'fs:openInFinder',
  FS_SEARCH: 'fs:search',
  FS_FILE_INFO: 'fs:fileInfo',
  FS_READ_FILE_CHUNKED: 'fs:readFileChunked',

  // Git
  GIT_INIT: 'git:init',
  GIT_STATUS: 'git:status',
  GIT_LOG: 'git:log',
  GIT_BRANCHES: 'git:branches',
  GIT_CHECKOUT: 'git:checkout',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_COMMIT: 'git:commit',
  GIT_DIFF: 'git:diff',
  GIT_STASH: 'git:stash',
  GIT_STASH_POP: 'git:stashPop',
  GIT_CREATE_BRANCH: 'git:createBranch',
  GIT_DELETE_BRANCH: 'git:deleteBranch',
  GIT_MERGE: 'git:merge',
  GIT_FETCH: 'git:fetch',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_DISCARD: 'git:discard',
  GIT_SHOW: 'git:show',
  GIT_STASH_LIST: 'git:stashList',
  GIT_RENAME_BRANCH: 'git:renameBranch',
  GIT_TAGS: 'git:tags',
  GIT_CREATE_TAG: 'git:createTag',
  GIT_DELETE_TAG: 'git:deleteTag',
  GIT_CHERRY_PICK: 'git:cherryPick',
  GIT_DIFF_BRANCHES: 'git:diffBranches',
  GIT_BLAME: 'git:blame',
  GIT_REMOTES: 'git:remotes',
  GIT_ADD_REMOTE: 'git:addRemote',
  GIT_REMOVE_REMOTE: 'git:removeRemote',
  GIT_RESET_SOFT: 'git:resetSoft',
  GIT_WORKTREE_ADD: 'git:worktreeAdd',
  GIT_WORKTREE_REMOVE: 'git:worktreeRemove',
  GIT_WORKTREE_LIST: 'git:worktreeList',
  GIT_WORKTREE_FINALIZE: 'git:worktreeFinalize',
  GIT_WORKTREE_MERGE_AND_CLEANUP: 'git:worktreeMergeAndCleanup',
  GIT_WORKTREE_LOCK: 'git:worktreeLock',
  GIT_WORKTREE_UNLOCK: 'git:worktreeUnlock',
  GIT_WORKTREE_IS_LOCKED: 'git:worktreeIsLocked',
  GIT_BRANCH_IS_MERGED: 'git:branchIsMerged',

  // Workspace storage (.workspaces dir)
  WORKSPACE_INIT_DIR: 'workspace:initDir',

  // Session
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_CLEAR: 'session:clear',

  // Workspace env (virtual env with symlinks)
  WORKSPACE_ENV_SETUP: 'workspace:envSetup',
  WORKSPACE_ENV_PATH: 'workspace:envPath',
  WORKSPACE_ENV_DELETE: 'workspace:envDelete',

  // Project Claude write
  PROJECT_WRITE_CLAUDE_SETTINGS: 'project:writeClaudeSettings',
  PROJECT_WRITE_CLAUDE_MD: 'project:writeClaudeMd',

  // Project scanning (TODO scanner, stats)
  PROJECT_SCAN_TODOS: 'project:scanTodos',
  PROJECT_LOAD_IGNORED_TODOS: 'project:loadIgnoredTodos',
  PROJECT_SAVE_IGNORED_TODOS: 'project:saveIgnoredTodos',
  PROJECT_STATS: 'project:stats',

  // Project notes (legacy per-project)
  PROJECT_GET_NOTES: 'project:getNotes',
  PROJECT_SAVE_NOTES: 'project:saveNotes',

  // Notes (workspace-level)
  NOTES_LIST: 'notes:list',
  NOTES_CREATE: 'notes:create',
  NOTES_UPDATE: 'notes:update',
  NOTES_DELETE: 'notes:delete',
  NOTES_SAVE_IMAGE: 'notes:save-image',
  NOTES_LOAD_IMAGE: 'notes:load-image',
  NOTES_DELETE_IMAGE: 'notes:delete-image',

  // Namespace
  NAMESPACE_LIST: 'namespace:list',
  NAMESPACE_CREATE: 'namespace:create',
  NAMESPACE_UPDATE: 'namespace:update',
  NAMESPACE_DELETE: 'namespace:delete',
  NAMESPACE_ENSURE_DEFAULT: 'namespace:ensureDefault',

  // Git Config (per-namespace profiles)
  GIT_CONFIG_GET: 'gitConfig:get',
  GIT_CONFIG_SET: 'gitConfig:set',
  GIT_CONFIG_DELETE: 'gitConfig:delete',

  // Workspace export/import
  WORKSPACE_EXPORT: 'workspace:export',
  WORKSPACE_IMPORT: 'workspace:import',

  // Prompt templates
  PROMPTS_LIST: 'prompts:list',
  PROMPTS_CREATE: 'prompts:create',
  PROMPTS_UPDATE: 'prompts:update',
  PROMPTS_DELETE: 'prompts:delete',

  // Claude agents & skills
  CLAUDE_LIST_AGENTS: 'claude:listAgents',
  CLAUDE_READ_AGENT: 'claude:readAgent',
  CLAUDE_WRITE_AGENT: 'claude:writeAgent',
  CLAUDE_DELETE_AGENT: 'claude:deleteAgent',
  CLAUDE_LIST_SKILLS: 'claude:listSkills',
  CLAUDE_READ_SKILL: 'claude:readSkill',
  CLAUDE_WRITE_SKILL: 'claude:writeSkill',
  CLAUDE_DELETE_SKILL: 'claude:deleteSkill',
  CLAUDE_RENAME_AGENT: 'claude:renameAgent',
  CLAUDE_RENAME_SKILL: 'claude:renameSkill',

  // Claude defaults library
  CLAUDE_DEFAULTS_PROFILES: 'claude:defaultsProfiles',
  CLAUDE_DEFAULTS_SKILLS: 'claude:defaultsSkills',
  CLAUDE_DEPLOY_PROFILE: 'claude:deployProfile',
  CLAUDE_DEPLOY_SKILL: 'claude:deploySkill',
  CLAUDE_CHECK_DEPLOYED: 'claude:checkDeployed',

  // Claude activity hooks
  CLAUDE_ACTIVITY: 'claude:activity',
  CLAUDE_INSTALL_HOOKS: 'claude:installHooks',
  CLAUDE_CHECK_HOOKS: 'claude:checkHooks',
  CLAUDE_VALIDATE_SETTINGS: 'claude:validateSettings',
  CLAUDE_FIX_SETTINGS: 'claude:fixSettings',
  CLAUDE_REMOVE_HOOKS: 'claude:removeHooks',
  CLAUDE_CHECK_HOOKS_STATUS: 'claude:checkHooksStatus',
  CLAUDE_EXPORT_CONFIG: 'claude:exportConfig',
  CLAUDE_IMPORT_CONFIG: 'claude:importConfig',
  CLAUDE_MEMORY_READ_AUTO: 'claude:memoryReadAuto',
  CLAUDE_MEMORY_TOGGLE_AUTO: 'claude:memoryToggleAuto',
  CLAUDE_MEMORY_LIST_RULES: 'claude:memoryListRules',
  CLAUDE_MEMORY_READ_RULE: 'claude:memoryReadRule',
  CLAUDE_MEMORY_WRITE_RULE: 'claude:memoryWriteRule',
  CLAUDE_MEMORY_DELETE_RULE: 'claude:memoryDeleteRule',
  CLAUDE_MEMORY_READ_FILE: 'claude:memoryReadFile',
  CLAUDE_MEMORY_WRITE_FILE: 'claude:memoryWriteFile',
  CLAUDE_MEMORY_READ_MANAGED: 'claude:memoryReadManaged',
  CLAUDE_MEMORY_INIT: 'claude:memoryInit',
  CLAUDE_MEMORY_EXPORT_RULES: 'claude:memoryExportRules',
  CLAUDE_MEMORY_IMPORT_RULES: 'claude:memoryImportRules',
  CLAUDE_MEMORY_LIST_SHARED_RULES: 'claude:memoryListSharedRules',
  CLAUDE_MEMORY_WRITE_SHARED_RULE: 'claude:memoryWriteSharedRule',
  CLAUDE_MEMORY_DELETE_SHARED_RULE: 'claude:memoryDeleteSharedRule',
  CLAUDE_MEMORY_LINK_SHARED_RULE: 'claude:memoryLinkSharedRule',
  CLAUDE_MEMORY_UNLINK_SHARED_RULE: 'claude:memoryUnlinkSharedRule',
  CLAUDE_MEMORY_INIT_DEFAULT_RULES: 'claude:memoryInitDefaultRules',

  // Claude rules tree management
  CLAUDE_MEMORY_MOVE_RULE: 'claude:memoryMoveRule',
  CLAUDE_MEMORY_CREATE_RULE_DIR: 'claude:memoryCreateRuleDir',
  CLAUDE_MEMORY_RENAME_RULE_DIR: 'claude:memoryRenameRuleDir',
  CLAUDE_MEMORY_DELETE_RULE_DIR: 'claude:memoryDeleteRuleDir',
  CLAUDE_MEMORY_LIST_TEMPLATES: 'claude:memoryListTemplates',
  CLAUDE_MEMORY_READ_TEMPLATE: 'claude:memoryReadTemplate',
  CLAUDE_MEMORY_IMPORT_TEMPLATES: 'claude:memoryImportTemplates',
  CLAUDE_MEMORY_SYNC_AI_RULES: 'claude:memorySyncAiRules',
  CLAUDE_MEMORY_CHECK_AI_RULES: 'claude:memoryCheckAiRules',

  // Claude settings hierarchy
  PROJECT_READ_CLAUDE_LOCAL_SETTINGS: 'project:readClaudeLocalSettings',
  PROJECT_WRITE_CLAUDE_LOCAL_SETTINGS: 'project:writeClaudeLocalSettings',
  PROJECT_READ_USER_CLAUDE_SETTINGS: 'project:readUserClaudeSettings',
  PROJECT_WRITE_USER_CLAUDE_SETTINGS: 'project:writeUserClaudeSettings',
  PROJECT_READ_MANAGED_SETTINGS: 'project:readManagedSettings',

  // MCP
  MCP_GET_HELP: 'mcp:getHelp',
  MCP_WORKSPACE_READ: 'mcp:workspaceRead',
  MCP_WORKSPACE_WRITE: 'mcp:workspaceWrite',

  // API Tester
  API_EXECUTE: 'api:execute',
  API_LOAD: 'api:load',
  API_SAVE: 'api:save',
  API_EXPORT: 'api:export',
  API_IMPORT: 'api:import',

  // Health Check
  HEALTHCHECK_LOAD: 'healthcheck:load',
  HEALTHCHECK_SAVE: 'healthcheck:save',
  HEALTHCHECK_EXECUTE: 'healthcheck:execute',
  HEALTHCHECK_START_SCHEDULER: 'healthcheck:startScheduler',
  HEALTHCHECK_STOP_SCHEDULER: 'healthcheck:stopScheduler',
  HEALTHCHECK_UPDATE_INTERVAL: 'healthcheck:updateInterval',
  HEALTHCHECK_STATUS: 'healthcheck:status',
  HEALTHCHECK_STATUS_UPDATE: 'healthcheck:statusUpdate',
  HEALTHCHECK_EXPORT: 'healthcheck:export',
  HEALTHCHECK_IMPORT: 'healthcheck:import',
  HEALTHCHECK_CLEAR_HISTORY: 'healthcheck:clearHistory',

  // Database Explorer
  DB_CONNECT: 'db:connect',
  DB_DISCONNECT: 'db:disconnect',
  DB_TEST_CONNECTION: 'db:testConnection',
  DB_LIST_DATABASES: 'db:listDatabases',
  DB_LIST_SCHEMAS: 'db:listSchemas',
  DB_LIST_TABLES: 'db:listTables',
  DB_TABLE_INFO: 'db:tableInfo',
  DB_EXECUTE_QUERY: 'db:executeQuery',
  DB_CANCEL_QUERY: 'db:cancelQuery',
  DB_LOAD: 'db:load',
  DB_SAVE: 'db:save',
  DB_EXPORT: 'db:export',
  DB_IMPORT: 'db:import',
  DB_BACKUP: 'db:backup',
  DB_BACKUP_LIST: 'db:backupList',
  DB_BACKUP_DELETE: 'db:backupDelete',
  DB_RESTORE: 'db:restore',
  DB_TRANSFER: 'db:transfer',
  DB_QUERY_PROGRESS: 'db:queryProgress',
  DB_BACKUP_LOG: 'db:backupLog',
  DB_NL_QUERY: 'db:nlQuery',
  DB_NL_GENERATE_SQL: 'db:nlGenerateSql',
  DB_NL_INTERPRET: 'db:nlInterpret',
  DB_NL_CANCEL: 'db:nlCancel',
  DB_GET_SCHEMA_CONTEXT: 'db:getSchemaContext',

  // Skills Store
  SKILLS_STORE_FETCH: 'skillsStore:fetch',
  SKILLS_STORE_INSTALL: 'skillsStore:install',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',

  // App
  APP_SETTINGS_GET: 'app:settingsGet',
  APP_SETTINGS_SET: 'app:settingsSet',
  APP_NOTIFICATION: 'app:notification',
  APP_VERSION: 'app:version',
  APP_PLATFORM_INFO: 'app:platformInfo',

  // App Update (electron-updater)
  APP_UPDATE_CHECK: 'appUpdate:check',
  APP_UPDATE_DOWNLOAD: 'appUpdate:download',
  APP_UPDATE_INSTALL: 'appUpdate:install',
  APP_UPDATE_STATUS: 'appUpdate:status',

  // Menu
  MENU_ACTION: 'menu:action',

  // SSH Keys
  SSH_LIST_KEYS: 'ssh:listKeys',
  SSH_GENERATE_KEY: 'ssh:generateKey',
  SSH_READ_PUBLIC_KEY: 'ssh:readPublicKey',
  SSH_IMPORT_KEY: 'ssh:importKey',
  SSH_DELETE_KEY: 'ssh:deleteKey',
  SSH_OPEN_DIRECTORY: 'ssh:openDirectory',
  SSH_SELECT_KEY_FILE: 'ssh:selectKeyFile',

  // Packages (multi-technology)
  PACKAGES_DETECT: 'packages:detect',
  PACKAGES_LIST: 'packages:list',
  PACKAGES_UPDATE: 'packages:update',
  PACKAGES_SEARCH: 'packages:search',
  PACKAGES_NL_ASK: 'packages:nlAsk',
  PACKAGES_NL_CANCEL: 'packages:nlCancel',

  // Codex config
  CODEX_READ_CONFIG: 'codex:readConfig',
  CODEX_WRITE_CONFIG: 'codex:writeConfig',
  CODEX_CHECK_CONFIG: 'codex:checkConfig',
  CODEX_READ_GLOBAL_CONFIG: 'codex:readGlobalConfig',
  CODEX_WRITE_GLOBAL_CONFIG: 'codex:writeGlobalConfig',
  CODEX_CHECK_GLOBAL_CONFIG: 'codex:checkGlobalConfig',

  // Codex rules
  CODEX_LIST_RULES: 'codex:listRules',
  CODEX_READ_RULE: 'codex:readRule',
  CODEX_WRITE_RULE: 'codex:writeRule',
  CODEX_DELETE_RULE: 'codex:deleteRule',

  // Codex AGENTS.md (memory)
  CODEX_READ_AGENTS_MD: 'codex:readAgentsMd',
  CODEX_WRITE_AGENTS_MD: 'codex:writeAgentsMd',
  CODEX_READ_GLOBAL_AGENTS_MD: 'codex:readGlobalAgentsMd',
  CODEX_WRITE_GLOBAL_AGENTS_MD: 'codex:writeGlobalAgentsMd',

  // Codex skills
  CODEX_LIST_SKILLS: 'codex:listSkills',
  CODEX_READ_SKILL: 'codex:readSkill',
  CODEX_WRITE_SKILL: 'codex:writeSkill',
  CODEX_DELETE_SKILL: 'codex:deleteSkill',

  // Copilot config
  COPILOT_READ_CONFIG: 'copilot:readConfig',
  COPILOT_WRITE_CONFIG: 'copilot:writeConfig',
  COPILOT_CHECK_CONFIG: 'copilot:checkConfig',

  // Copilot instructions (memory)
  COPILOT_READ_INSTRUCTIONS: 'copilot:readInstructions',
  COPILOT_WRITE_INSTRUCTIONS: 'copilot:writeInstructions',
  COPILOT_READ_GLOBAL_INSTRUCTIONS: 'copilot:readGlobalInstructions',
  COPILOT_WRITE_GLOBAL_INSTRUCTIONS: 'copilot:writeGlobalInstructions',

  // Copilot skills (.agents/skills)
  COPILOT_LIST_SKILLS: 'copilot:listSkills',
  COPILOT_READ_SKILL: 'copilot:readSkill',
  COPILOT_WRITE_SKILL: 'copilot:writeSkill',
  COPILOT_DELETE_SKILL: 'copilot:deleteSkill',

  // Gemini config
  GEMINI_READ_CONFIG: 'gemini:readConfig',
  GEMINI_WRITE_CONFIG: 'gemini:writeConfig',
  GEMINI_CHECK_CONFIG: 'gemini:checkConfig',

  // Gemini memory (GEMINI.md)
  GEMINI_READ_MEMORY: 'gemini:readMemory',
  GEMINI_WRITE_MEMORY: 'gemini:writeMemory',
  GEMINI_READ_GLOBAL_MEMORY: 'gemini:readGlobalMemory',
  GEMINI_WRITE_GLOBAL_MEMORY: 'gemini:writeGlobalMemory',

  // Gemini skills
  GEMINI_LIST_SKILLS: 'gemini:listSkills',
  GEMINI_READ_SKILL: 'gemini:readSkill',
  GEMINI_WRITE_SKILL: 'gemini:writeSkill',
  GEMINI_DELETE_SKILL: 'gemini:deleteSkill',

  // AI Provider
  AI_PROVIDER_SET: 'ai:providerSet',
  AI_PROVIDER_CHECK_INSTALLED: 'ai:providerCheckInstalled',
  AI_DEFAULTS_SET: 'ai:defaultsSet',
  AI_DEFAULTS_GET: 'ai:defaultsGet',
  AI_DEFAULTS_GET_GLOBAL: 'ai:defaultsGetGlobal',
  AI_DEFAULTS_SET_GLOBAL: 'ai:defaultsSetGlobal',
  AI_DEFAULTS_GET_WORKSPACE: 'ai:defaultsGetWorkspace',
  AI_DEFAULTS_SET_WORKSPACE: 'ai:defaultsSetWorkspace',
  AI_CHECK_MULTI_AGENT: 'ai:checkMultiAgent',
  AI_WORKSPACE_PROVIDER_SET: 'ai:workspaceProviderSet',
  AI_WORKSPACE_DEFAULTS_SET: 'ai:workspaceDefaultsSet',
  AI_WORKSPACE_DEFAULTS_GET: 'ai:workspaceDefaultsGet',
  AI_WORKSPACE_PROPAGATE: 'ai:workspacePropagate',

  // Code Analysis
  ANALYSIS_DETECT_TOOLS: 'analysis:detectTools',
  ANALYSIS_RUN: 'analysis:run',
  ANALYSIS_CANCEL: 'analysis:cancel',
  ANALYSIS_PROGRESS: 'analysis:progress',
  ANALYSIS_LOAD_REPORTS: 'analysis:loadReports',
  ANALYSIS_DELETE_REPORT: 'analysis:deleteReport',
  ANALYSIS_CREATE_TICKETS: 'analysis:createTickets',
  ANALYSIS_INSTALL_TOOL: 'analysis:installTool',
  ANALYSIS_INSTALL_PROGRESS: 'analysis:installProgress',

  // Pixel Agents
  PIXEL_AGENTS_START: 'pixel-agents:start',
  PIXEL_AGENTS_STOP: 'pixel-agents:stop',
  PIXEL_AGENTS_EVENT: 'pixel-agents:event',
  PIXEL_AGENTS_WEBVIEW_READY: 'pixel-agents:webviewReady',
  PIXEL_AGENTS_SAVE_LAYOUT: 'pixel-agents:saveLayout',

  // DevOps
  DEVOPS_LOAD: 'devops:load',
  DEVOPS_SAVE: 'devops:save',
  DEVOPS_TEST_CONNECTION: 'devops:testConnection',
  DEVOPS_LIST_PIPELINES: 'devops:listPipelines',
  DEVOPS_GET_PIPELINE_RUNS: 'devops:getPipelineRuns',
  DEVOPS_RUN_PIPELINE: 'devops:runPipeline',
  DEVOPS_GET_BUILD_TIMELINE: 'devops:getBuildTimeline',
  DEVOPS_GET_APPROVALS: 'devops:getApprovals',
  DEVOPS_APPROVE: 'devops:approve',
  DEVOPS_GET_BUILD_LOG: 'devops:getBuildLog',

  // Companion
  COMPANION_REGISTER: 'companion:register',
  COMPANION_CANCEL: 'companion:cancel',
  COMPANION_DISCONNECT: 'companion:disconnect',
  COMPANION_STATUS_CHANGED: 'companion:statusChanged',
  COMPANION_DATA_INFO: 'companion:dataInfo',
  COMPANION_SYNC_TICKETS: 'companion:syncTickets',
  COMPANION_TICKET_UPDATED: 'companion:ticketUpdated',
} as const
