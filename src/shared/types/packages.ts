// Package manager types (multi-technology)

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
