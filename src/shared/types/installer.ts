// Installer types — cascade prerequisite installation

export type PrerequisiteId = 'brew' | 'node' | 'npm' | 'claude'

export type PrerequisiteStatus = 'installed' | 'missing' | 'installing' | 'failed' | 'skipped'

export interface PrerequisiteInfo {
  id: PrerequisiteId
  version: string | null
  status: PrerequisiteStatus
  error?: string
}

export interface InstallerProgress {
  currentStep: PrerequisiteId
  status: PrerequisiteStatus
  progress: number
  message?: string
  error?: string
}

export interface InstallerResult {
  success: boolean
  results: PrerequisiteInfo[]
  error?: string
}
