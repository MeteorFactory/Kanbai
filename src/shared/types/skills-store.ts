// Skills store types

export interface SkillStoreRepo {
  id: string
  owner: string
  repo: string
  displayName: string
  description: string
  url: string
}

export interface SkillStoreEntry {
  id: string
  repoId: string
  name: string
  filename: string
  description: string
  content: string
  path: string
  repoUrl: string
  author: string
  authorUrl: string
}
