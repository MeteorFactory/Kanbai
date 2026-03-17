import { IpcMain, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, Workspace, WorkspaceExportData, WorkspaceExportRule } from '../../shared/types'
import { StorageService } from '../services/storage'
import { deleteWorkspaceEnv, renameWorkspaceEnv } from './workspaceEnv'
import { readDefaultKanbanConfig, writeKanbanConfig } from './kanban'

const storage = new StorageService()

const ENVS_DIR = path.join(os.homedir(), '.kanbai', 'envs')

function getEnvDir(workspaceName: string): string {
  return path.join(ENVS_DIR, workspaceName.replace(/[/\\:*?"<>|]/g, '_'))
}

/**
 * Collect all .md rule files from the workspace env's .claude/rules/ directory.
 * Returns an array of { relativePath, content } entries for export.
 */
function collectWorkspaceRules(workspaceName: string): WorkspaceExportRule[] {
  const rulesDir = path.join(getEnvDir(workspaceName), '.claude', 'rules')
  if (!fs.existsSync(rulesDir)) return []

  const rules: WorkspaceExportRule[] = []
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.md')) {
        const stat = fs.lstatSync(fullPath)
        if (stat.isSymbolicLink()) continue // skip symlinks — they point to shared rules
        const relativePath = path.relative(rulesDir, fullPath).split(path.sep).join('/')
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          rules.push({ relativePath, content })
        } catch { /* skip unreadable files */ }
      }
    }
  }
  walk(rulesDir)
  return rules
}

/**
 * Restore exported rules into a workspace env's .claude/rules/ directory.
 */
function restoreWorkspaceRules(workspaceName: string, rules: WorkspaceExportRule[]): void {
  if (!rules || rules.length === 0) return
  const rulesDir = path.join(getEnvDir(workspaceName), '.claude', 'rules')
  if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true })

  for (const rule of rules) {
    const filePath = path.join(rulesDir, rule.relativePath)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, rule.content, 'utf-8')
  }
}

export function registerWorkspaceHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, async () => {
    return storage.getWorkspaces()
  })

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_CREATE,
    async (_event, data: { name: string; color?: string; namespaceId?: string }) => {
      const workspace: Workspace = {
        id: uuid(),
        name: data.name,
        color: data.color || '#3b82f6',
        namespaceId: data.namespaceId || storage.getDefaultNamespace().id,
        projectIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      storage.addWorkspace(workspace)

      // Initialize kanban config with defaults for the new workspace
      const defaultConfig = readDefaultKanbanConfig()
      writeKanbanConfig(workspace.id, defaultConfig)

      return workspace
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_UPDATE,
    async (_event, data: { id: string } & Partial<Workspace>) => {
      const workspace = storage.getWorkspace(data.id)
      if (!workspace) throw new Error(`Workspace ${data.id} not found`)
      const oldName = workspace.name
      const updated = { ...workspace, ...data, updatedAt: Date.now() }
      storage.updateWorkspace(updated)

      // If name changed, rename the env directory on disk
      if (data.name && data.name !== oldName) {
        renameWorkspaceEnv(oldName, data.name)
      }

      return updated
    },
  )

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_DELETE, async (_event, { id }: { id: string }) => {
    // Soft-delete: mark workspace as deleted but keep data (env dir, kanban, projects)
    storage.softDeleteWorkspace(id)
  })

  // Permanently delete a workspace and its env directory (used for "start fresh")
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_PERMANENT_DELETE,
    async (_event, { id }: { id: string }) => {
      const workspace = storage.getWorkspace(id)
      storage.permanentDeleteWorkspace(id)
      if (workspace) {
        deleteWorkspaceEnv(workspace.name)
      }
    },
  )

  // Check if a soft-deleted workspace exists with the given name
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_CHECK_DELETED,
    async (_event, { name }: { name: string }) => {
      return storage.getDeletedWorkspaceByName(name) ?? null
    },
  )

  // Restore a soft-deleted workspace
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_RESTORE,
    async (_event, { id }: { id: string }) => {
      return storage.restoreWorkspace(id) ?? null
    },
  )

  // Workspace export
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_EXPORT,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      const workspace = storage.getWorkspace(workspaceId)
      if (!workspace) return { success: false, error: 'Workspace not found' }

      const projects = storage.getProjects(workspaceId)
      const exportData: WorkspaceExportData = {
        name: workspace.name,
        color: workspace.color,
        icon: workspace.icon,
        projectPaths: projects.map((p) => p.path),
        aiRules: collectWorkspaceRules(workspace.name),
        aiProvider: workspace.aiProvider,
        aiDefaults: workspace.aiDefaults,
        exportedAt: Date.now(),
      }

      const result = await dialog.showSaveDialog({
        title: 'Exporter le workspace',
        defaultPath: `${workspace.name}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })

      if (result.canceled || !result.filePath) return { success: false, error: 'cancelled' }

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Workspace import
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_IMPORT, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importer un workspace',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }

    try {
      const raw = fs.readFileSync(result.filePaths[0]!, 'utf-8')
      const data: WorkspaceExportData = JSON.parse(raw)

      // Create workspace with imported AI profile
      const workspace: Workspace = {
        id: uuid(),
        name: data.name,
        color: data.color,
        icon: data.icon,
        namespaceId: storage.getDefaultNamespace().id,
        projectIds: [],
        aiProvider: data.aiProvider,
        aiDefaults: data.aiDefaults,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      storage.addWorkspace(workspace)

      // Initialize kanban config with defaults for the imported workspace
      const defaultConfig = readDefaultKanbanConfig()
      writeKanbanConfig(workspace.id, defaultConfig)

      // Add projects that exist on disk
      for (const projectPath of data.projectPaths) {
        if (fs.existsSync(projectPath)) {
          const project = {
            id: uuid(),
            name: path.basename(projectPath),
            path: projectPath,
            hasClaude: fs.existsSync(path.join(projectPath, '.claude')),
            hasGit: fs.existsSync(path.join(projectPath, '.git')),
            workspaceId: workspace.id,
            createdAt: Date.now(),
          }
          storage.addProject(project)
          workspace.projectIds.push(project.id)
        }
      }

      storage.updateWorkspace(workspace)

      // Restore workspace-level AI rules if present in the export
      if (data.aiRules && data.aiRules.length > 0) {
        restoreWorkspaceRules(workspace.name, data.aiRules)
      }

      return { success: true, workspace }
    } catch {
      return { success: false, error: 'Invalid workspace file' }
    }
  })
}
