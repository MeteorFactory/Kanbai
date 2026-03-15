import { IpcMain, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import { IPC_CHANNELS, Workspace, WorkspaceExportData } from '../../shared/types'
import { StorageService } from '../services/storage'
import { deleteWorkspaceEnv, renameWorkspaceEnv } from './workspaceEnv'
import { readDefaultKanbanConfig, writeKanbanConfig } from './kanban'

const storage = new StorageService()

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

      // Create workspace
      const workspace: Workspace = {
        id: uuid(),
        name: data.name,
        color: data.color,
        icon: data.icon,
        namespaceId: storage.getDefaultNamespace().id,
        projectIds: [],
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
      return { success: true, workspace }
    } catch {
      return { success: false, error: 'Invalid workspace file' }
    }
  })
}
