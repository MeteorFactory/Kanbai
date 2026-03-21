import { IpcMain } from 'electron'

import { registerProjectCoreHandlers } from './project-handler'
import { registerProjectScanningHandlers } from './project-scanning-handler'
import { registerClaudeConfigHandlers } from './claude-config-handler'
import { registerClaudeAssetsHandlers } from './claude-assets-handler'
import { registerClaudeHooksHandlers } from './claude-hooks-handler'
import { registerPromptsHandlers } from './prompts-handler'

export function registerProjectHandlers(ipcMain: IpcMain): void {
  registerProjectCoreHandlers(ipcMain)
  registerProjectScanningHandlers(ipcMain)
  registerClaudeConfigHandlers(ipcMain)
  registerClaudeAssetsHandlers(ipcMain)
  registerClaudeHooksHandlers(ipcMain)
  registerPromptsHandlers(ipcMain)
}
