import { IpcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  IPC_CHANNELS,
  HealthCheckFile,
  HealthCheckConfig,
  ApiTestFile,
} from '../../shared/types'
import { healthCheckScheduler } from '../services/healthCheckScheduler'

function defaultHealthCheckFile(): HealthCheckFile {
  return {
    version: 1,
    checks: [],
    history: [],
    incidents: [],
  }
}

function getHealthChecksPath(projectPath: string): string {
  return path.join(projectPath, '.kanbai', 'health-checks.json')
}

function getApiTestsPath(projectPath: string): string {
  return path.join(projectPath, '.kanbai', 'api-tests.json')
}

function ensureKanbaiDir(projectPath: string): void {
  const dirPath = path.join(projectPath, '.kanbai')
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function saveHealthCheckFile(projectPath: string, data: HealthCheckFile): void {
  ensureKanbaiDir(projectPath)
  fs.writeFileSync(getHealthChecksPath(projectPath), JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Migrate health checks from api-tests.json to health-checks.json on first load.
 */
function migrateFromApiTests(projectPath: string): HealthCheckFile | null {
  const apiTestsPath = getApiTestsPath(projectPath)
  if (!fs.existsSync(apiTestsPath)) return null

  try {
    const raw = fs.readFileSync(apiTestsPath, 'utf-8')
    const apiData = JSON.parse(raw) as ApiTestFile

    if (!apiData.healthChecks || apiData.healthChecks.length === 0) return null

    const now = Date.now()
    const migrated: HealthCheckFile = {
      version: 1,
      checks: apiData.healthChecks.map((hc) => ({
        id: hc.id,
        name: hc.name,
        url: hc.url,
        method: hc.method,
        expectedStatus: hc.expectedStatus,
        headers: hc.headers,
        schedule: { enabled: false, interval: 30, unit: 'seconds' as const },
        notifyOnDown: true,
        createdAt: now,
        updatedAt: now,
      })),
      history: [],
      incidents: [],
    }

    // Remove health checks from api-tests.json
    apiData.healthChecks = []
    fs.writeFileSync(apiTestsPath, JSON.stringify(apiData, null, 2), 'utf-8')

    return migrated
  } catch {
    return null
  }
}

export function registerHealthCheckHandlers(ipcMain: IpcMain): void {
  // Load health checks
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_LOAD,
    async (_event, { projectPath }: { projectPath: string }) => {
      const filePath = getHealthChecksPath(projectPath)

      if (!fs.existsSync(filePath)) {
        // Try migration from api-tests.json
        const migrated = migrateFromApiTests(projectPath)
        if (migrated) {
          saveHealthCheckFile(projectPath, migrated)
          return migrated
        }
        return defaultHealthCheckFile()
      }

      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw) as HealthCheckFile
      } catch {
        return defaultHealthCheckFile()
      }
    },
  )

  // Save health checks
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_SAVE,
    async (_event, { projectPath, data }: { projectPath: string; data: HealthCheckFile }) => {
      saveHealthCheckFile(projectPath, data)
      return { success: true }
    },
  )

  // Execute a single health check
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_EXECUTE,
    async (_event, { projectPath, check, data }: { projectPath: string; check: HealthCheckConfig; data: HealthCheckFile }) => {
      const onDataChanged = (updated: HealthCheckFile) => {
        saveHealthCheckFile(projectPath, updated)
      }
      const logEntry = await healthCheckScheduler.executeOne(projectPath, check, data, onDataChanged)
      return logEntry
    },
  )

  // Start scheduler for a project
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_START_SCHEDULER,
    async (_event, { projectPath, data }: { projectPath: string; data: HealthCheckFile }) => {
      const onDataChanged = (updated: HealthCheckFile) => {
        saveHealthCheckFile(projectPath, updated)
      }
      await healthCheckScheduler.startScheduler(projectPath, data, onDataChanged)
      return { success: true }
    },
  )

  // Stop scheduler for a project
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_STOP_SCHEDULER,
    async (_event, { projectPath }: { projectPath: string }) => {
      healthCheckScheduler.stopScheduler(projectPath)
      return { success: true }
    },
  )

  // Update interval for a check
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_UPDATE_INTERVAL,
    async (_event, { projectPath, checkId, data }: { projectPath: string; checkId: string; data: HealthCheckFile }) => {
      const onDataChanged = (updated: HealthCheckFile) => {
        saveHealthCheckFile(projectPath, updated)
      }
      healthCheckScheduler.updateInterval(projectPath, checkId, data, onDataChanged)
      return { success: true }
    },
  )

  // Get scheduler statuses
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_STATUS,
    async (_event, { projectPath }: { projectPath: string }) => {
      return healthCheckScheduler.getStatuses(projectPath)
    },
  )

  // Export health checks via save dialog
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_EXPORT,
    async (_event, { data }: { data: HealthCheckFile }) => {
      const result = await dialog.showSaveDialog({
        title: 'Export Health Checks',
        defaultPath: 'health-checks.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) {
        return { success: false }
      }
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Import health checks via open dialog
  ipcMain.handle(IPC_CHANNELS.HEALTHCHECK_IMPORT, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Health Checks',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, data: null }
    }
    try {
      const raw = fs.readFileSync(result.filePaths[0]!, 'utf-8')
      const data = JSON.parse(raw) as HealthCheckFile
      return { success: true, data }
    } catch (err) {
      return { success: false, data: null, error: String(err) }
    }
  })

  // Clear history
  ipcMain.handle(
    IPC_CHANNELS.HEALTHCHECK_CLEAR_HISTORY,
    async (_event, { projectPath, data }: { projectPath: string; data: HealthCheckFile }) => {
      data.history = []
      saveHealthCheckFile(projectPath, data)
      return { success: true }
    },
  )
}
