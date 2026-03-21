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
