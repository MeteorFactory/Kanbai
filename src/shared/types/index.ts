// Types partagés entre main et renderer
export type { AiProviderId, AiProviderConfig } from './ai-provider'
export { AI_PROVIDERS, AI_PROVIDER_IDS } from './ai-provider'

// --- Rules tree types ---

export interface RuleEntry {
  relativePath: string    // "conventions/core.md"
  filename: string        // "core.md"
  fullPath: string
  paths: string[]         // depuis frontmatter YAML
  content: string
  isSymlink: boolean
  symlinkTarget: string
  author?: string
  authorUrl?: string
  coAuthors?: string[]
}

export interface RuleTreeNode {
  name: string
  relativePath: string    // "lang/typescript"
  type: 'file' | 'directory'
  children?: RuleTreeNode[]
  rule?: RuleEntry
}

export interface TemplateRuleEntry {
  relativePath: string    // "react/rules/components.md"
  filename: string
  framework: string       // "_shared", "react", "nextjs"...
  content: string
  author: string
  authorUrl: string
}

// --- End rules tree types ---

export interface Namespace {
  id: string
  name: string
  color?: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface Workspace {
  id: string
  name: string
  icon?: string
  color: string
  namespaceId?: string
  projectIds: string[]
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface AiDefaults {
  kanban?: import('./ai-provider').AiProviderId
  packages?: import('./ai-provider').AiProviderId
  packagesModel?: string
  database?: import('./ai-provider').AiProviderId
  databaseModel?: string
}

export interface Project {
  id: string
  name: string
  path: string
  hasClaude: boolean
  hasGit?: boolean
  aiProvider?: import('./ai-provider').AiProviderId | null
  aiDefaults?: AiDefaults
  workspaceId: string
  createdAt: number
}

export interface TerminalSession {
  id: string
  projectId?: string
  title: string
  cwd: string
  shell: string
  pid?: number
  isActive: boolean
}

export interface TerminalTab {
  id: string
  label: string
  color?: string
  panes: TerminalPane[]
  activePane: string
}

export interface TerminalPane {
  id: string
  sessionId: string
  splitDirection?: 'horizontal' | 'vertical'
  size: number // percentage
}

export interface ClaudeSession {
  id: string
  projectId: string
  terminalId: string
  provider: import('./ai-provider').AiProviderId
  status: 'running' | 'completed' | 'failed' | 'paused'
  startedAt: number
  endedAt?: number
  prompt?: string
  loopMode: boolean
  loopCount: number
  loopDelay: number // ms
}

export interface KanbanAttachment {
  id: string
  filename: string
  storedPath: string
  mimeType: string
  size: number
  addedAt: number
}

export type KanbanCommentType = 'user' | 'resolution-done' | 'resolution-failed'

export interface KanbanComment {
  id: string
  text: string
  type?: KanbanCommentType
  createdAt: number
}

export type KanbanTaskType = 'bug' | 'feature' | 'test' | 'doc' | 'ia' | 'refactor'

export interface KanbanSplitSuggestion {
  title: string
  description: string
  type: KanbanTaskType
  priority: 'low' | 'medium' | 'high'
}

export interface KanbanTask {
  id: string
  workspaceId: string
  targetProjectId?: string
  ticketNumber?: number
  title: string
  description: string
  status: KanbanStatus
  priority: 'low' | 'medium' | 'high'
  type?: KanbanTaskType
  agentId?: string
  question?: string
  result?: string
  error?: string
  attachments?: KanbanAttachment[]
  comments?: KanbanComment[]
  dueDate?: number
  archived?: boolean
  disabled?: boolean
  isCtoTicket?: boolean
  parentTicketId?: string
  childTicketIds?: string[]
  conversationHistoryPath?: string
  aiProvider?: import('./ai-provider').AiProviderId
  isPrequalifying?: boolean
  splitSuggestions?: KanbanSplitSuggestion[]
  worktreePath?: string
  worktreeBranch?: string
  createdAt: number
  updatedAt: number
}

export type KanbanStatus = 'TODO' | 'WORKING' | 'PENDING' | 'DONE' | 'FAILED'

export interface KanbanConfig {
  autoCloseCompletedTerminals: boolean
  autoCloseCtoTerminals: boolean
  autoCreateAiMemoryRefactorTickets: boolean
  autoPrequalifyTickets: boolean
  autoPrioritizeBugs: boolean
  useWorktrees: boolean
  autoMergeWorktrees: boolean
  maxConcurrentWorktrees: number
  paused: boolean
}

export interface UpdateInfo {
  tool: string
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  installed: boolean
  scope: 'global' | 'project' | 'unit'
  projectId?: string
  installSource?: string
  canInstall?: boolean
  canUninstall?: boolean
}

export interface AutoClauderTemplate {
  id: string
  name: string
  description: string
  claudeMd: string
  settings: Record<string, unknown>
  createdAt: number
}

export interface SessionTab {
  workspaceId: string
  cwd: string
  label: string
  isSplit: boolean
  leftCommand: string | null
  rightCommand: string | null
}

export interface SessionData {
  activeWorkspaceId: string | null
  activeProjectId: string | null
  activeNamespaceId: string | null
  tabs: SessionTab[]
  savedAt: number
}

export type Locale = 'fr' | 'en'

export type ThemeName = 'dark' | 'light' | 'terracotta' | 'system'

export interface AppSettings {
  theme: ThemeName
  locale: Locale
  defaultShell: string
  fontSize: number
  fontFamily: string
  scrollbackLines: number
  claudeDetectionColor: string
  codexDetectionColor: string
  copilotDetectionColor: string
  geminiDetectionColor: string
  defaultAiProvider: import('./ai-provider').AiProviderId
  autoClauderEnabled: boolean
  defaultAutoClauderTemplateId?: string
  notificationSound: boolean
  notificationBadge: boolean
  checkUpdatesOnLaunch: boolean
  toolAutoCheckEnabled: boolean
  autoCloseCompletedTerminals: boolean
  autoCloseCtoTerminals: boolean
  autoApprove: boolean
  autoCreateAiMemoryRefactorTickets: boolean
  kanbanSettings?: {
    autoPrequalifyTickets: boolean
    autoPrioritizeBugs: boolean
  }
  tutorialCompleted: boolean
  tutorialSeenSections: string[]
}

export interface ProjectInfo {
  hasMakefile: boolean
  makeTargets: string[]
  hasGit: boolean
  gitBranch: string | null
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size?: number
  modifiedAt?: number
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: string
  message: string
  parents: string[]
  refs: string[]
  cherryPickOf?: string
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
}

export interface GitTag {
  name: string
  hash: string
  message: string
  date: string
  isAnnotated: boolean
}

export interface GitBlameLine {
  hash: string
  author: string
  date: string
  lineNumber: number
  content: string
}

export interface GitRemote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitWorktree {
  path: string
  branch: string
  head: string
  isBare: boolean
}

export interface GitProfile {
  id: string
  namespaceId: string
  userName: string
  userEmail: string
  createdAt: number
  updatedAt: number
}

export interface TodoEntry {
  file: string
  line: number
  type: 'TODO' | 'FIXME' | 'HACK' | 'NOTE' | 'XXX'
  text: string
  codeLine: string
}

export interface ProjectStatsData {
  totalFiles: number
  totalLines: number
  totalSize: number
  totalDirs: number
  avgFileSize: number
  maxDepth: number
  binaryFiles: number
  emptyFiles: number
  fileTypeBreakdown: { ext: string; count: number; lines: number }[]
  largestFiles: { path: string; size: number; lines: number }[]
  recentFiles: { path: string; modifiedAt: number }[]
  biggestDirs: { path: string; fileCount: number; totalSize: number }[]
}

export interface NpmPackageInfo {
  name: string
  currentVersion: string
  latestVersion: string | null
  isDeprecated: boolean
  deprecationMessage?: string
  updateAvailable: boolean
  type: 'dependency' | 'devDependency'
}

// Package Manager types (multi-technology)
export type PackageManagerType = 'npm' | 'go' | 'pip' | 'cargo' | 'nuget' | 'composer' | 'bower'

export interface PackageInfo {
  name: string
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  isDeprecated: boolean
  deprecationMessage?: string
  type: 'dependency' | 'devDependency' | 'peer' | 'optional' | 'module'
}

export interface ProjectPackageManager {
  projectId: string
  projectName: string
  projectPath: string
  manager: PackageManagerType
  packageCount: number
}

// AI Chat types for packages
export type PkgNlMessageRole = 'user' | 'assistant' | 'error'

export interface PkgNlMessage {
  id: string
  role: PkgNlMessageRole
  content: string
  timestamp: number
}

export interface SearchResult {
  file: string
  line: number
  text: string
  column: number
}

export interface PromptTemplate {
  id: string
  name: string
  content: string
  category: string
  createdAt: number
}

export interface WorkspaceExportData {
  name: string
  color: string
  icon?: string
  projectPaths: string[]
  exportedAt: number
}

// API Tester types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export interface ApiEnvironment {
  id: string
  name: string
  variables: Record<string, string>
  isActive?: boolean
}

export interface ApiHeader {
  key: string
  value: string
  enabled: boolean
}

export interface ApiTestAssertion {
  type: 'status' | 'body_contains' | 'header_contains' | 'json_path' | 'response_time'
  expected: string
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: ApiHeader[]
  body: string
  bodyType: 'json' | 'form' | 'text' | 'none'
  tests: ApiTestAssertion[]
}

export interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  time: number
  size: number
}

export interface ApiTestResult {
  assertion: ApiTestAssertion
  passed: boolean
  actual: string
}

export interface ApiCollection {
  id: string
  name: string
  requests: ApiRequest[]
}

export interface ApiChainStep {
  requestId: string
  extractVariables: Array<{ name: string; from: 'body' | 'header'; path: string }>
  delay?: number
}

export interface ApiChain {
  id: string
  name: string
  steps: ApiChainStep[]
}

export interface HealthCheck {
  id: string
  name: string
  url: string
  method: 'GET' | 'HEAD'
  expectedStatus: number
  headers: ApiHeader[]
  lastResult?: HealthCheckResult
}

export interface HealthCheckResult {
  status: number
  responseTime: number
  success: boolean
  timestamp: number
  error?: string
}

export interface ApiTestFile {
  version: 1
  environments: ApiEnvironment[]
  collections: ApiCollection[]
  chains: ApiChain[]
  healthChecks: HealthCheck[]
}

// Health Check Panel types (standalone tab)
export type HealthCheckIntervalUnit = 'seconds' | 'minutes' | 'hours'

export interface HealthCheckSchedule {
  enabled: boolean
  interval: number
  unit: HealthCheckIntervalUnit
  downInterval?: number
  downUnit?: HealthCheckIntervalUnit
}

export interface HealthCheckConfig {
  id: string
  name: string
  url: string
  method: 'GET' | 'HEAD'
  expectedStatus: number
  headers: ApiHeader[]
  schedule: HealthCheckSchedule
  notifyOnDown: boolean
  createdAt: number
  updatedAt: number
}

export interface HealthCheckLogEntry {
  id: string
  healthCheckId: string
  status: number
  responseTime: number
  success: boolean
  timestamp: number
  error?: string
}

export interface HealthCheckIncident {
  id: string
  healthCheckId: string
  healthCheckName: string
  startedAt: number
  endedAt: number | null
  failureCount: number
  lastError?: string
}

export type HealthCheckStatus = 'unknown' | 'up' | 'down' | 'checking'

export interface HealthCheckFile {
  version: 1
  checks: HealthCheckConfig[]
  history: HealthCheckLogEntry[]
  incidents: HealthCheckIncident[]
}

export interface HealthCheckSchedulerStatus {
  checkId: string
  status: HealthCheckStatus
  lastCheck: number | null
  nextCheck: number | null
}

// Database Explorer types
export type DbEngine = 'postgresql' | 'mysql' | 'mssql' | 'mongodb' | 'sqlite'
export type DbEnvironmentTag = 'local' | 'dev' | 'int' | 'qua' | 'prd' | 'custom'
export type DbConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface DbConnectionConfig {
  engine: DbEngine
  connectionString?: string
  host?: string
  port?: number
  username?: string
  password?: string
  database?: string
  filePath?: string
  ssl?: boolean
}

export interface DbConnection {
  id: string
  name: string
  engine: DbEngine
  environmentTag: DbEnvironmentTag
  customTagName?: string
  config: DbConnectionConfig
  workspaceId: string
  nlPermissions?: DbNlPermissions
  createdAt: number
  updatedAt: number
}

export interface DbTable {
  name: string
  schema?: string
  type: 'table' | 'view' | 'collection'
  rowCount?: number
}

export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
  defaultValue?: string
}

export interface DbIndex {
  name: string
  columns: string[]
  unique: boolean
  type: string
}

export interface DbTableInfo {
  columns: DbColumn[]
  indexes: DbIndex[]
  rowCount: number
}

export interface DbQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  totalRows?: number
  executionTime: number
  error?: string
}

export interface DbBackupResult {
  success: boolean
  filePath?: string
  size?: number
  error?: string
}

export interface DbBackupEntry {
  id: string
  connectionId: string
  connectionName: string
  engine: DbEngine
  database: string
  timestamp: number
  filePath: string
  size: number
  dataOnly?: boolean
  schemaOnly?: boolean
  tables?: string[]
  environmentTag?: DbEnvironmentTag
}

export interface DbBackupLogEntry {
  timestamp: number
  type: 'info' | 'command' | 'stdout' | 'stderr' | 'success' | 'error'
  message: string
  connectionName?: string
  operation: 'backup' | 'restore'
}

export interface DbBackupManifest {
  version: 1
  entries: DbBackupEntry[]
}

export interface DbRestoreResult {
  success: boolean
  error?: string
  warnings?: number
}

export interface DbTransferResult {
  success: boolean
  tablesTransferred: number
  rowsTransferred: number
  errors: string[]
}

export interface DbFile {
  version: 1
  connections: DbConnection[]
}

// Natural Language Query types
export interface DbNlPermissions {
  canRead: boolean
  canUpdate: boolean
  canDelete: boolean
}

export type DbNlMessageRole = 'user' | 'assistant' | 'error'

export interface DbNlMessage {
  id: string
  role: DbNlMessageRole
  content: string
  sql?: string
  result?: DbQueryResult
  timestamp: number
}

export interface DbNlQueryRequest {
  connectionId: string
  prompt: string
  permissions: DbNlPermissions
}

export interface DbNlQueryResponse {
  success: boolean
  sql?: string
  result?: DbQueryResult
  explanation?: string
  error?: string
}

export interface DbNlGenerateResponse {
  success: boolean
  sql?: string
  explanation?: string
  error?: string
}

export interface DbNlHistoryEntry {
  role: 'user' | 'assistant'
  content: string
  sql?: string
}

export interface DbNlInterpretRequest {
  connectionId: string
  question: string
  sql: string
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  history?: DbNlHistoryEntry[]
  provider?: string
}

export interface DbNlInterpretResponse {
  success: boolean
  answer?: string
  refinedSql?: string
  error?: string
}

// MCP Server types
export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpHelpResult {
  success: boolean
  output: string
  error?: string
}

export type McpCategory = 'filesystem' | 'database' | 'web' | 'ai' | 'devtools' | 'cloud' | 'communication' | 'utilities' | 'design'

export interface McpCatalogEntry {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  env?: Record<string, string>
  envPlaceholders?: Record<string, string>
  argsPlaceholders?: Record<string, string>
  category: McpCategory
  features: string[]
  official: boolean
}

// Code Analysis types
export type AnalysisSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AnalysisToolCategory = 'security' | 'quality' | 'dependencies' | 'infrastructure'

export interface AnalysisToolDef {
  id: string
  name: string
  command: string
  category: AnalysisToolCategory
  description: string
  languages: string[]
  installed: boolean
  jsonFlag: string
}

export interface AnalysisFinding {
  id: string
  tool: string
  file: string
  line: number
  column?: number
  endLine?: number
  endColumn?: number
  severity: AnalysisSeverity
  message: string
  rule?: string
  ruleUrl?: string
  snippet?: string
  cwe?: string
}

export interface AnalysisReport {
  id: string
  projectPath: string
  toolId: string
  toolName: string
  timestamp: number
  duration: number
  findings: AnalysisFinding[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
  }
  error?: string
}

export interface AnalysisRunOptions {
  projectPath: string
  toolId: string
  extraArgs?: string[]
}

export interface AnalysisTicketRequest {
  findingIds: string[]
  reportId: string
  workspaceId: string
  targetProjectId?: string
  priority: 'low' | 'medium' | 'high'
  groupBy: 'individual' | 'file' | 'rule' | 'severity'
}

export interface AnalysisProgress {
  toolId: string
  status: 'running' | 'done' | 'error'
  message?: string
}

// SSH Key types
export type SshKeyType = 'ed25519' | 'rsa'

export interface SshKeyInfo {
  id: string
  name: string
  type: SshKeyType
  fingerprint: string
  publicKeyPath: string
  privateKeyPath: string
  comment: string
  createdAt: number
  isDefault: boolean
}

// --- DevOps types ---

export type DevOpsAuthMethod = 'pat' | 'oauth2'

export interface DevOpsAuthPat {
  method: 'pat'
  token: string
}

export interface DevOpsAuthOAuth2 {
  method: 'oauth2'
  clientId: string
  clientSecret: string
  tenantId: string
}

export type DevOpsAuth = DevOpsAuthPat | DevOpsAuthOAuth2

export interface DevOpsConnection {
  id: string
  name: string
  organizationUrl: string
  projectName: string
  auth: DevOpsAuth
  createdAt: number
  updatedAt: number
}

export type PipelineStatus = 'succeeded' | 'failed' | 'canceled' | 'running' | 'notStarted' | 'unknown'

export interface PipelineRun {
  id: number
  name: string
  status: PipelineStatus
  result: string
  startTime: string | null
  finishTime: string | null
  url: string
  sourceBranch: string
  sourceVersion: string
  requestedBy: string
}

export interface PipelineDefinition {
  id: number
  name: string
  folder: string
  revision: number
  url: string
  latestRun: PipelineRun | null
}

export type StageStatus = 'succeeded' | 'failed' | 'canceled' | 'running' | 'notStarted' | 'pending' | 'unknown'

export interface TimelineIssue {
  type: 'error' | 'warning'
  message: string
}

export interface PipelineStage {
  id: string
  name: string
  order: number
  status: PipelineStatus
  startTime: string | null
  finishTime: string | null
  result: string
  errorCount: number
  warningCount: number
  jobs: PipelineJob[]
}

export interface PipelineJob {
  id: string
  name: string
  status: PipelineStatus
  startTime: string | null
  finishTime: string | null
  result: string
  workerName: string
  errorCount: number
  warningCount: number
  issues: TimelineIssue[]
  logId: number | null
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'canceled' | 'skipped' | 'undefined'

export interface PipelineApproval {
  id: string
  buildId: number
  status: ApprovalStatus
  createdOn: string
  instructions: string
  minRequiredApprovers: number
  steps: PipelineApprovalStep[]
}

export interface PipelineApprovalStep {
  assignedApprover: string
  status: ApprovalStatus
  comment: string
}

export interface DevOpsFile {
  version: 1
  connections: DevOpsConnection[]
  pipelineOrder?: Record<string, number[]>
}

// IPC Channel types
export const IPC_CHANNELS = {
  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_INPUT: 'terminal:input',

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
  KANBAN_GET_WORKING_TICKET: 'kanban:getWorkingTicket',
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

  // Project notes
  PROJECT_GET_NOTES: 'project:getNotes',
  PROJECT_SAVE_NOTES: 'project:saveNotes',

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

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',

  // App
  APP_SETTINGS_GET: 'app:settingsGet',
  APP_SETTINGS_SET: 'app:settingsSet',
  APP_NOTIFICATION: 'app:notification',
  APP_VERSION: 'app:version',

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
  AI_DEFAULTS_SET: 'ai:defaultsSet',
  AI_DEFAULTS_GET: 'ai:defaultsGet',

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
} as const
