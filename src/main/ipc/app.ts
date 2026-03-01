import { IpcMain, app } from 'electron'
import { IPC_CHANNELS, AppSettings } from '../../shared/types'
import { StorageService } from '../services/storage'
import { sendNotification } from '../services/notificationService'
import { ensureAutoApproveScript } from '../services/activityHooks'
import { isElevated } from '../../shared/platform'

const storage = new StorageService()

export function registerAppHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.APP_SETTINGS_GET, async () => {
    return storage.getSettings()
  })

  ipcMain.handle(
    IPC_CHANNELS.APP_SETTINGS_SET,
    async (_event, settings: Partial<AppSettings>) => {
      storage.updateSettings(settings)
      if ('autoApprove' in settings) {
        ensureAutoApproveScript(storage.getSettings().autoApprove)
      }
      return storage.getSettings()
    },
  )

  ipcMain.on(
    IPC_CHANNELS.APP_NOTIFICATION,
    (_event, data: { title: string; body: string }) => {
      sendNotification(data.title, data.body)
    },
  )

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return { version: app.getVersion(), name: app.getName(), isElevated: isElevated() }
  })
}
