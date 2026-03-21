import type { GitLogEntry } from '../../../shared/types'

export interface StashEntry {
  ref: string
  message: string
  date: string
}

export interface CommitFileInfo {
  status: string
  file: string
}

export interface BranchInfo {
  name: string
  hash: string
  upstream: string
}

export interface GraphLane {
  color: string
}

export interface GraphCommitInfo {
  entry: GitLogEntry
  lanes: (GraphLane | null)[]
  dotLane: number
  connections: Array<{
    fromLane: number
    toLane: number
    color: string
    type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right'
  }>
}

export const ALL_PROJECTS_ID = '__all_projects__'
