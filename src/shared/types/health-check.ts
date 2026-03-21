// Health Check Panel types (standalone tab)

import type { ApiHeader } from './api-tester'

export type HealthCheckIntervalUnit = 'seconds' | 'minutes' | 'hours'

export interface HealthCheckSchedule {
  enabled: boolean
  interval: number
  unit: HealthCheckIntervalUnit
  downInterval?: number
  downUnit?: HealthCheckIntervalUnit
}

export interface HealthCheckConfig {
  id: string
  name: string
  url: string
  method: 'GET' | 'HEAD'
  expectedStatus: number
  headers: ApiHeader[]
  schedule: HealthCheckSchedule
  notifyOnDown: boolean
  createdAt: number
  updatedAt: number
}

export interface HealthCheckLogEntry {
  id: string
  healthCheckId: string
  status: number
  responseTime: number
  success: boolean
  timestamp: number
  error?: string
}

export interface HealthCheckIncident {
  id: string
  healthCheckId: string
  healthCheckName: string
  startedAt: number
  endedAt: number | null
  failureCount: number
  lastError?: string
}

export type HealthCheckStatus = 'unknown' | 'up' | 'down' | 'checking'

export interface HealthCheckFile {
  version: 1
  checks: HealthCheckConfig[]
  history: HealthCheckLogEntry[]
  incidents: HealthCheckIncident[]
}

export interface HealthCheckSchedulerStatus {
  checkId: string
  status: HealthCheckStatus
  lastCheck: number | null
  nextCheck: number | null
}
