// Workspace and project types

export interface Namespace {
  id: string
  name: string
  color?: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface AiDefaults {
  kanban?: import('./ai-provider').AiProviderId
  packages?: import('./ai-provider').AiProviderId
  packagesModel?: string
  database?: import('./ai-provider').AiProviderId
  databaseModel?: string
}

export interface Workspace {
  id: string
  name: string
  icon?: string
  color: string
  namespaceId?: string
  projectIds: string[]
  visibleTabs?: string[]
  aiProvider?: import('./ai-provider').AiProviderId | null
  aiDefaults?: AiDefaults
  createdAt: number
  updatedAt: number
  deletedAt?: number
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

export interface WorkspaceExportRule {
  relativePath: string
  content: string
}

export interface WorkspaceExportData {
  name: string
  color: string
  icon?: string
  projectPaths: string[]
  aiRules?: WorkspaceExportRule[]
  aiProvider?: import('./ai-provider').AiProviderId | null
  aiDefaults?: AiDefaults
  exportedAt: number
}
