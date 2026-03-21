// Git types

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
