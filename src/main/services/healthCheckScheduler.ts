import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
import { BrowserWindow } from 'electron'
import { sendNotification } from './notificationService'
import { IPC_CHANNELS } from '../../shared/types'
import type {
  HealthCheckConfig,
  HealthCheckLogEntry,
  HealthCheckIncident,
  HealthCheckFile,
  HealthCheckStatus,
  HealthCheckSchedulerStatus,
  HealthCheckIntervalUnit,
} from '../../shared/types'

interface SchedulerEntry {
  timer: ReturnType<typeof setTimeout> | null
  status: HealthCheckStatus
  lastCheck: number | null
  nextCheck: number | null
}

function intervalToMs(interval: number, unit: HealthCheckIntervalUnit): number {
  switch (unit) {
    case 'seconds': return interval * 1000
    case 'minutes': return interval * 60 * 1000
    case 'hours': return interval * 3600 * 1000
  }
}

function getEffectiveInterval(check: HealthCheckConfig, isDown: boolean): number {
  if (isDown && check.schedule.downInterval && check.schedule.downUnit) {
    return intervalToMs(check.schedule.downInterval, check.schedule.downUnit)
  }
  return intervalToMs(check.schedule.interval, check.schedule.unit)
}

function executeHealthCheck(
  config: HealthCheckConfig,
): Promise<{ status: number; responseTime: number; error?: string }> {
  return new Promise((resolve) => {
    let parsed: URL
    try {
      parsed = new URL(config.url)
    } catch {
      resolve({ status: 0, responseTime: 0, error: `Invalid URL: ${config.url}` })
      return
    }

    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? https : http

    const resolvedHeaders: Record<string, string> = {}
    for (const h of config.headers) {
      if (h.enabled) {
        resolvedHeaders[h.key] = h.value
      }
    }

    const options: http.RequestOptions = {
      method: config.method,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: resolvedHeaders,
      timeout: 30000,
    }

    const startTime = Date.now()

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          responseTime: Date.now() - startTime,
        })
      })
    })

    req.on('error', (err) => {
      resolve({ status: 0, responseTime: Date.now() - startTime, error: String(err) })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({ status: 0, responseTime: Date.now() - startTime, error: 'Request timed out' })
    })

    req.end()
  })
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

class HealthCheckScheduler {
  private schedulers: Map<string, Map<string, SchedulerEntry>> = new Map()
  private dataCache: Map<string, HealthCheckFile> = new Map()

  getStatuses(projectPath: string): HealthCheckSchedulerStatus[] {
    const entries = this.schedulers.get(projectPath)
    if (!entries) return []
    const result: HealthCheckSchedulerStatus[] = []
    for (const [checkId, entry] of entries) {
      result.push({
        checkId,
        status: entry.status,
        lastCheck: entry.lastCheck,
        nextCheck: entry.nextCheck,
      })
    }
    return result
  }

  async startScheduler(
    projectPath: string,
    data: HealthCheckFile,
    onDataChanged: (data: HealthCheckFile) => void,
  ): Promise<void> {
    this.stopScheduler(projectPath)
    this.dataCache.set(projectPath, data)
    const entries = new Map<string, SchedulerEntry>()
    this.schedulers.set(projectPath, entries)

    for (const check of data.checks) {
      if (check.schedule.enabled) {
        this.scheduleCheck(projectPath, check, entries, onDataChanged)
      } else {
        entries.set(check.id, { timer: null, status: 'unknown', lastCheck: null, nextCheck: null })
      }
    }
  }

  stopScheduler(projectPath: string): void {
    const entries = this.schedulers.get(projectPath)
    if (!entries) return
    for (const entry of entries.values()) {
      if (entry.timer) clearTimeout(entry.timer)
    }
    this.schedulers.delete(projectPath)
    this.dataCache.delete(projectPath)
  }

  stopAll(): void {
    for (const projectPath of this.schedulers.keys()) {
      this.stopScheduler(projectPath)
    }
  }

  updateInterval(
    projectPath: string,
    checkId: string,
    data: HealthCheckFile,
    onDataChanged: (data: HealthCheckFile) => void,
  ): void {
    const entries = this.schedulers.get(projectPath)
    if (!entries) return

    const existing = entries.get(checkId)
    if (existing?.timer) {
      clearTimeout(existing.timer)
    }

    this.dataCache.set(projectPath, data)
    const check = data.checks.find((c) => c.id === checkId)
    if (!check) {
      entries.delete(checkId)
      return
    }

    if (check.schedule.enabled) {
      this.scheduleCheck(projectPath, check, entries, onDataChanged)
    } else {
      entries.set(checkId, {
        timer: null,
        status: existing?.status ?? 'unknown',
        lastCheck: existing?.lastCheck ?? null,
        nextCheck: null,
      })
    }
  }

  async executeOne(
    projectPath: string,
    check: HealthCheckConfig,
    data: HealthCheckFile,
    onDataChanged: (data: HealthCheckFile) => void,
  ): Promise<HealthCheckLogEntry> {
    this.dataCache.set(projectPath, data)
    const entries = this.schedulers.get(projectPath) ?? new Map()
    if (!this.schedulers.has(projectPath)) {
      this.schedulers.set(projectPath, entries)
    }

    return this.runCheck(projectPath, check, entries, onDataChanged)
  }

  isRunning(projectPath: string): boolean {
    return this.schedulers.has(projectPath)
  }

  /**
   * Auto-start schedulers for all projects that have health checks with enabled schedules.
   * Called once at app startup so checks run in the background without requiring the UI tab.
   */
  autoStartAll(projectPaths: string[]): void {
    for (const projectPath of projectPaths) {
      const filePath = path.join(projectPath, '.kanbai', 'health-checks.json')
      if (!fs.existsSync(filePath)) continue

      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const data = JSON.parse(raw) as HealthCheckFile
        const hasEnabledChecks = data.checks.some((c) => c.schedule.enabled)
        if (!hasEnabledChecks) continue

        const onDataChanged = (updated: HealthCheckFile): void => {
          try {
            fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
          } catch (err) {
            console.error(`[HealthCheck] Failed to save ${filePath}:`, err)
          }
        }

        this.startScheduler(projectPath, data, onDataChanged)
        console.log(`[HealthCheck] Auto-started scheduler for ${projectPath}`)
      } catch (err) {
        console.error(`[HealthCheck] Failed to auto-start for ${projectPath}:`, err)
      }
    }
  }

  private scheduleCheck(
    projectPath: string,
    check: HealthCheckConfig,
    entries: Map<string, SchedulerEntry>,
    onDataChanged: (data: HealthCheckFile) => void,
  ): void {
    const ms = getEffectiveInterval(check, false)
    const now = Date.now()

    const entry: SchedulerEntry = {
      timer: null,
      status: 'unknown',
      lastCheck: null,
      nextCheck: now + ms,
    }

    entries.set(check.id, entry)

    // Run immediately on start, then schedule next via setTimeout chain
    this.runAndReschedule(projectPath, check, entries, onDataChanged)
  }

  private async runAndReschedule(
    projectPath: string,
    check: HealthCheckConfig,
    entries: Map<string, SchedulerEntry>,
    onDataChanged: (data: HealthCheckFile) => void,
  ): Promise<void> {
    await this.runCheck(projectPath, check, entries, onDataChanged)

    // After the check completes, schedule the next one
    const entry = entries.get(check.id)
    if (!entry) return // scheduler was stopped or check removed

    // Check if scheduler is still active for this project
    if (!this.schedulers.has(projectPath)) return

    const isDown = entry.status === 'down'
    const ms = getEffectiveInterval(check, isDown)

    entry.nextCheck = Date.now() + ms
    entry.timer = setTimeout(() => {
      this.runAndReschedule(projectPath, check, entries, onDataChanged)
    }, ms)
  }

  private async runCheck(
    projectPath: string,
    check: HealthCheckConfig,
    entries: Map<string, SchedulerEntry>,
    onDataChanged: (data: HealthCheckFile) => void,
  ): Promise<HealthCheckLogEntry> {
    const entry = entries.get(check.id) ?? {
      timer: null,
      status: 'unknown' as HealthCheckStatus,
      lastCheck: null,
      nextCheck: null,
    }
    const previousStatus = entry.status
    entry.status = 'checking'
    entries.set(check.id, entry)
    this.pushStatusUpdate(projectPath)

    const result = await executeHealthCheck(check)
    const success = result.status === check.expectedStatus
    const now = Date.now()

    const logEntry: HealthCheckLogEntry = {
      id: generateId(),
      healthCheckId: check.id,
      status: result.status,
      responseTime: result.responseTime,
      success,
      timestamp: now,
      error: result.error,
    }

    const newStatus: HealthCheckStatus = success ? 'up' : 'down'
    entry.status = newStatus
    entry.lastCheck = now

    // Update data cache
    const data = this.dataCache.get(projectPath)
    if (data) {
      data.history.push(logEntry)
      // Cap history at 1000 entries
      if (data.history.length > 1000) {
        data.history = data.history.slice(-1000)
      }

      // Incident detection
      if (previousStatus !== 'checking' && previousStatus !== 'unknown') {
        if (previousStatus === 'up' && newStatus === 'down') {
          // New incident
          const incident: HealthCheckIncident = {
            id: generateId(),
            healthCheckId: check.id,
            healthCheckName: check.name,
            startedAt: now,
            endedAt: null,
            failureCount: 1,
            lastError: result.error,
          }
          data.incidents.push(incident)

          if (check.notifyOnDown) {
            sendNotification(
              `${check.name} is DOWN`,
              `Status: ${result.status || 'unreachable'} — Expected: ${check.expectedStatus}`,
            )
          }
        } else if (previousStatus === 'down' && newStatus === 'up') {
          // Recovery — close open incident
          const openIncident = data.incidents
            .filter((i) => i.healthCheckId === check.id && i.endedAt === null)
            .pop()
          if (openIncident) {
            openIncident.endedAt = now
          }

          if (check.notifyOnDown) {
            sendNotification(
              `${check.name} is BACK UP`,
              `Recovered after downtime`,
            )
          }
        } else if (previousStatus === 'down' && newStatus === 'down') {
          // Ongoing incident — increment failure count
          const openIncident = data.incidents
            .filter((i) => i.healthCheckId === check.id && i.endedAt === null)
            .pop()
          if (openIncident) {
            openIncident.failureCount++
            openIncident.lastError = result.error
          }
        }
      } else if (newStatus === 'down') {
        // First check ever is down — create incident
        const incident: HealthCheckIncident = {
          id: generateId(),
          healthCheckId: check.id,
          healthCheckName: check.name,
          startedAt: now,
          endedAt: null,
          failureCount: 1,
          lastError: result.error,
        }
        data.incidents.push(incident)

        if (check.notifyOnDown) {
          sendNotification(
            `${check.name} is DOWN`,
            `Status: ${result.status || 'unreachable'} — Expected: ${check.expectedStatus}`,
          )
        }
      }

      onDataChanged(data)
    }

    this.pushStatusUpdate(projectPath)
    return logEntry
  }

  private pushStatusUpdate(projectPath: string): void {
    const statuses = this.getStatuses(projectPath)
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.HEALTHCHECK_STATUS_UPDATE, { projectPath, statuses })
      }
    }
  }
}

export const healthCheckScheduler = new HealthCheckScheduler()
