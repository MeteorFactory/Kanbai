// Project info and file system types

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
