import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import { Workspace, Project, AppSettings, KanbanTask, AutoClauderTemplate, SessionData, Namespace, GitProfile } from '../../shared/types'
import { createDefaultSettings } from '../../shared/constants/defaults'
import { getDefaultShell } from '../../shared/platform'

const DATA_DIR = path.join(os.homedir(), '.mirehub')

interface AppData {
  workspaces: Workspace[]
  projects: Project[]
  namespaces: Namespace[]
  gitProfiles: GitProfile[]
  settings: AppSettings
  kanbanTasks: KanbanTask[]
  autoClauderTemplates: AutoClauderTemplate[]
}

let _instance: StorageService | null = null

export function _resetForTesting(): void {
  _instance = null
}

export class StorageService {
  private dataPath!: string
  private data!: AppData

  constructor() {
    // Enforce singleton: all handlers must share the same in-memory data
    if (_instance) return _instance
    // Auto-migrate from old data directories
    const OLD_DIRS = [
      path.join(os.homedir(), '.tasks'),
      path.join(os.homedir(), '.theone'),
    ]
    if (!fs.existsSync(DATA_DIR)) {
      for (const oldDir of OLD_DIRS) {
        if (fs.existsSync(oldDir)) {
          fs.renameSync(oldDir, DATA_DIR)
          break
        }
      }
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    this.dataPath = path.join(DATA_DIR, 'data.json')
    this.data = this.load()
    _instance = this // eslint-disable-line @typescript-eslint/no-this-alias
  }

  private load(): AppData {
    if (fs.existsSync(this.dataPath)) {
      const raw = fs.readFileSync(this.dataPath, 'utf-8')
      const data = JSON.parse(raw) as AppData
      let needsSave = false
      // Migration: ensure gitProfiles array exists
      if (!data.gitProfiles) {
        data.gitProfiles = []
      }
      // Migration: reset defaultShell if it doesn't exist on the current platform
      // (handles cross-platform scenarios, e.g. /bin/zsh saved on macOS used on Windows)
      // Call getDefaultShell() directly — DEFAULT_SETTINGS.defaultShell may be
      // incorrectly inlined by rollup (picking the wrong platform branch).
      if (data.settings?.defaultShell && !fs.existsSync(data.settings.defaultShell)) {
        data.settings.defaultShell = getDefaultShell()
        needsSave = true
      }
      // Migration: ensure namespaces array exists and assign Default namespace
      if (!data.namespaces || data.namespaces.length === 0) {
        const defaultNs: Namespace = {
          id: uuid(),
          name: 'Default',
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        data.namespaces = [defaultNs]
        // Assign all existing workspaces to the default namespace
        for (const ws of data.workspaces) {
          if (!ws.namespaceId) {
            ws.namespaceId = defaultNs.id
          }
        }
        needsSave = true
      }
      if (needsSave) {
        fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf-8')
      }
      return data
    }
    const defaultNs: Namespace = {
      id: uuid(),
      name: 'Default',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const freshData: AppData = {
      workspaces: [],
      projects: [],
      namespaces: [defaultNs],
      gitProfiles: [],
      settings: createDefaultSettings(),
      kanbanTasks: [],
      autoClauderTemplates: [],
    }
    // Persist immediately so the Default namespace survives restarts
    fs.writeFileSync(this.dataPath, JSON.stringify(freshData, null, 2), 'utf-8')
    return freshData
  }

  private save(): void {
    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  // Workspaces
  getWorkspaces(): Workspace[] {
    return this.data.workspaces.filter((w) => !w.deletedAt)
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.data.workspaces.find((w) => w.id === id)
  }

  getDeletedWorkspaceByName(name: string): Workspace | undefined {
    return this.data.workspaces.find(
      (w) => w.deletedAt && w.name.toLowerCase() === name.toLowerCase(),
    )
  }

  addWorkspace(workspace: Workspace): void {
    this.data.workspaces.push(workspace)
    this.save()
  }

  updateWorkspace(workspace: Workspace): void {
    const idx = this.data.workspaces.findIndex((w) => w.id === workspace.id)
    if (idx >= 0) {
      this.data.workspaces[idx] = workspace
      this.save()
    }
  }

  softDeleteWorkspace(id: string): void {
    const idx = this.data.workspaces.findIndex((w) => w.id === id)
    if (idx >= 0) {
      this.data.workspaces[idx]!.deletedAt = Date.now()
      this.data.workspaces[idx]!.updatedAt = Date.now()
      this.save()
    }
  }

  restoreWorkspace(id: string): Workspace | undefined {
    const idx = this.data.workspaces.findIndex((w) => w.id === id)
    if (idx >= 0) {
      delete this.data.workspaces[idx]!.deletedAt
      this.data.workspaces[idx]!.updatedAt = Date.now()
      this.save()
      return this.data.workspaces[idx]
    }
    return undefined
  }

  permanentDeleteWorkspace(id: string): void {
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id)
    this.data.projects = this.data.projects.filter((p) => p.workspaceId !== id)
    this.save()
  }

  deleteWorkspace(id: string): void {
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id)
    this.data.projects = this.data.projects.filter((p) => p.workspaceId !== id)
    this.save()
  }

  // Projects
  getProjects(workspaceId?: string): Project[] {
    if (workspaceId) {
      return this.data.projects.filter((p) => p.workspaceId === workspaceId)
    }
    // Exclude projects from soft-deleted workspaces
    const deletedIds = new Set(
      this.data.workspaces.filter((w) => w.deletedAt).map((w) => w.id),
    )
    return this.data.projects.filter((p) => !deletedIds.has(p.workspaceId))
  }

  addProject(project: Project): void {
    this.data.projects.push(project)
    this.save()
  }

  deleteProject(id: string): void {
    this.data.projects = this.data.projects.filter((p) => p.id !== id)
    this.save()
  }

  // Settings
  getSettings(): AppSettings {
    return this.data.settings
  }

  updateSettings(partial: Partial<AppSettings>): void {
    this.data.settings = { ...this.data.settings, ...partial }
    this.save()
  }

  // Kanban
  getKanbanTasks(workspaceId?: string): KanbanTask[] {
    if (workspaceId) {
      return this.data.kanbanTasks.filter((t) => t.workspaceId === workspaceId)
    }
    return this.data.kanbanTasks
  }

  addKanbanTask(task: KanbanTask): void {
    this.data.kanbanTasks.push(task)
    this.save()
  }

  updateKanbanTask(task: KanbanTask): void {
    const idx = this.data.kanbanTasks.findIndex((t) => t.id === task.id)
    if (idx >= 0) {
      this.data.kanbanTasks[idx] = task
      this.save()
    }
  }

  deleteKanbanTask(id: string): void {
    this.data.kanbanTasks = this.data.kanbanTasks.filter((t) => t.id !== id)
    this.save()
  }

  // Auto-Clauder Templates
  getTemplates(): AutoClauderTemplate[] {
    return this.data.autoClauderTemplates
  }

  addTemplate(template: AutoClauderTemplate): void {
    this.data.autoClauderTemplates.push(template)
    this.save()
  }

  deleteTemplate(id: string): void {
    this.data.autoClauderTemplates = this.data.autoClauderTemplates.filter((t) => t.id !== id)
    this.save()
  }

  // Namespaces
  getNamespaces(): Namespace[] {
    return this.data.namespaces
  }

  getNamespace(id: string): Namespace | undefined {
    return this.data.namespaces.find((n) => n.id === id)
  }

  getDefaultNamespace(): Namespace {
    return this.data.namespaces.find((n) => n.isDefault)!
  }

  ensureDefaultNamespace(): Namespace {
    let defaultNs = this.data.namespaces.find((n) => n.isDefault)
    if (defaultNs) return defaultNs
    // No default namespace — create one
    defaultNs = {
      id: uuid(),
      name: 'Default',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.data.namespaces.push(defaultNs)
    // Assign orphaned workspaces to the new default namespace
    for (const ws of this.data.workspaces) {
      if (!ws.namespaceId) {
        ws.namespaceId = defaultNs.id
      }
    }
    this.save()
    return defaultNs
  }

  addNamespace(namespace: Namespace): void {
    this.data.namespaces.push(namespace)
    this.save()
  }

  updateNamespace(namespace: Namespace): void {
    const idx = this.data.namespaces.findIndex((n) => n.id === namespace.id)
    if (idx >= 0) {
      this.data.namespaces[idx] = namespace
      this.save()
    }
  }

  deleteNamespace(id: string): void {
    const ns = this.data.namespaces.find((n) => n.id === id)
    if (!ns || ns.isDefault) return // Cannot delete default namespace
    this.data.namespaces = this.data.namespaces.filter((n) => n.id !== id)
    // Also remove the git profile associated with this namespace
    this.data.gitProfiles = this.data.gitProfiles.filter((p) => p.namespaceId !== id)
    this.save()
  }

  // Git Profiles
  getGitProfile(namespaceId: string): GitProfile | undefined {
    return this.data.gitProfiles.find((p) => p.namespaceId === namespaceId)
  }

  setGitProfile(profile: GitProfile): void {
    const idx = this.data.gitProfiles.findIndex((p) => p.namespaceId === profile.namespaceId)
    if (idx >= 0) {
      this.data.gitProfiles[idx] = profile
    } else {
      this.data.gitProfiles.push(profile)
    }
    this.save()
  }

  deleteGitProfile(namespaceId: string): void {
    this.data.gitProfiles = this.data.gitProfiles.filter((p) => p.namespaceId !== namespaceId)
    this.save()
  }

  // Session
  getSession(): SessionData | null {
    const sessionPath = path.join(DATA_DIR, 'session.json')
    if (fs.existsSync(sessionPath)) {
      try {
        const raw = fs.readFileSync(sessionPath, 'utf-8')
        return JSON.parse(raw) as SessionData
      } catch {
        return null
      }
    }
    return null
  }

  saveSession(session: SessionData): void {
    const sessionPath = path.join(DATA_DIR, 'session.json')
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8')
  }

  clearSession(): void {
    const sessionPath = path.join(DATA_DIR, 'session.json')
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
    }
  }
}
