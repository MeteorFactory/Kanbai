import { IpcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import { openExternalWindow, closeExternalWindow, isExternalWindowOpen } from '../services/external-window'
import { StorageService } from '../services/storage'

export function registerExternalWindowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.EXTERNAL_WINDOW_OPEN, (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string') {
      throw new Error('Invalid workspaceId')
    }
    const storage = new StorageService()
    const workspace = storage.getWorkspaces().find((w) => w.id === workspaceId)
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
    openExternalWindow(workspaceId, workspace.name)
  })

  ipcMain.handle(IPC_CHANNELS.EXTERNAL_WINDOW_CLOSE, (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string') {
      throw new Error('Invalid workspaceId')
    }
    closeExternalWindow(workspaceId)
  })

  ipcMain.handle(IPC_CHANNELS.EXTERNAL_WINDOW_IS_OPEN, (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string') {
      throw new Error('Invalid workspaceId')
    }
    return isExternalWindowOpen(workspaceId)
  })
}
