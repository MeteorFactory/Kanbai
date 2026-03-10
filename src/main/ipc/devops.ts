import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  IPC_CHANNELS,
  DevOpsFile,
  DevOpsAuth,
  DevOpsConnection,
  PipelineDefinition,
  PipelineRun,
  PipelineStage,
  PipelineJob,
  PipelineStatus,
  PipelineApproval,
  ApprovalStatus,
} from '../../shared/types'

function defaultDevOpsFile(): DevOpsFile {
  return { version: 1, connections: [] }
}

function getDevOpsPath(projectPath: string): string {
  return path.join(projectPath, '.kanbai', 'devops.json')
}

function ensureKanbaiDir(projectPath: string): void {
  const dirPath = path.join(projectPath, '.kanbai')
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function saveDevOpsFile(projectPath: string, data: DevOpsFile): void {
  if (!projectPath) {
    console.error('[DevOps] saveDevOpsFile called with empty projectPath')
    return
  }
  ensureKanbaiDir(projectPath)
  const filePath = getDevOpsPath(projectPath)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function getAuthHeader(auth: DevOpsAuth): Promise<string> {
  if (auth.method === 'pat') {
    const encoded = Buffer.from(`:${auth.token}`).toString('base64')
    return `Basic ${encoded}`
  }

  // OAuth2 client credentials flow
  const tokenUrl = `https://login.microsoftonline.com/${auth.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    scope: '499b84ac-1321-427f-aa17-267ca6975798/.default',
    grant_type: 'client_credentials',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OAuth2 token request failed: ${response.status} - ${errorText}`)
  }

  const tokenData = await response.json() as { access_token: string }
  return `Bearer ${tokenData.access_token}`
}

async function azureDevOpsRequest<T>(
  auth: DevOpsAuth,
  url: string,
): Promise<T> {
  const authHeader = await getAuthHeader(auth)
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Azure DevOps API error: ${response.status} - ${errorText}`)
  }

  return response.json() as Promise<T>
}

async function azureDevOpsPatch<T>(
  auth: DevOpsAuth,
  url: string,
  body: unknown,
): Promise<T> {
  const authHeader = await getAuthHeader(auth)
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Azure DevOps API error: ${response.status} - ${errorText}`)
  }

  return response.json() as Promise<T>
}

function mapApprovalStatus(status: string): ApprovalStatus {
  const mapping: Record<string, ApprovalStatus> = {
    pending: 'pending',
    approved: 'approved',
    rejected: 'rejected',
    canceled: 'canceled',
    skipped: 'skipped',
    undefined: 'undefined',
  }
  return mapping[status] ?? 'pending'
}

interface AzureApproval {
  id: string
  status: string
  createdOn: string
  instructions: string
  minRequiredApprovers: number
  steps: Array<{
    assignedApprover: { displayName: string }
    status: string
    comment: string
  }>
  _links?: {
    build?: { href?: string }
  }
}

function mapPipelineStatus(status: string, result: string): PipelineStatus {
  if (status === 'inProgress') return 'running'
  if (status === 'notStarted') return 'notStarted'
  if (result === 'succeeded') return 'succeeded'
  if (result === 'failed') return 'failed'
  if (result === 'canceled') return 'canceled'
  return 'unknown'
}

interface AzureBuildDef {
  id: number
  name: string
  path: string
  revision: number
  _links?: { web?: { href?: string } }
  latestBuild?: AzureBuildRun
}

interface AzureBuildRun {
  id: number
  buildNumber: string
  status: string
  result: string
  startTime: string | null
  finishTime: string | null
  sourceBranch: string
  sourceVersion: string
  requestedFor?: { displayName: string }
  _links?: { web?: { href?: string } }
}

interface AzureTimelineIssue {
  type: string
  message: string
}

interface AzureTimelineRecord {
  id: string
  parentId: string | null
  type: string
  name: string
  order: number
  state: string
  result: string | null
  startTime: string | null
  finishTime: string | null
  workerName: string | null
  errorCount: number | null
  warningCount: number | null
  issues: AzureTimelineIssue[] | null
  log: { id: number; url: string } | null
}

function mapTimelineStatus(state: string, result: string | null): PipelineStatus {
  if (state === 'inProgress') return 'running'
  if (state === 'pending') return 'notStarted'
  if (result === 'succeeded') return 'succeeded'
  if (result === 'failed') return 'failed'
  if (result === 'canceled' || result === 'cancelled') return 'canceled'
  if (result === 'skipped') return 'canceled'
  return 'unknown'
}

function mapIssues(issues: AzureTimelineIssue[] | null): { type: 'error' | 'warning'; message: string }[] {
  if (!issues || issues.length === 0) return []
  return issues.map((issue) => ({
    type: issue.type === 'error' ? 'error' as const : 'warning' as const,
    message: issue.message || '',
  }))
}

function collectJobIssues(
  jobId: string,
  records: AzureTimelineRecord[],
): { type: 'error' | 'warning'; message: string }[] {
  // Collect issues from ALL child records (Tasks, Checkpoints, etc.)
  const children = records.filter((r) => r.parentId === jobId)
  const issues: { type: 'error' | 'warning'; message: string }[] = []
  for (const child of children) {
    issues.push(...mapIssues(child.issues))
  }
  return issues
}

function findJobLogId(
  jobId: string,
  jobLog: { id: number; url: string } | null,
  records: AzureTimelineRecord[],
): number | null {
  // Use the job-level log if available
  if (jobLog?.id) return jobLog.id
  // Fallback: find the highest logId from child task records
  const children = records.filter((r) => r.parentId === jobId && r.log?.id)
  if (children.length === 0) return null
  // Return the last task's logId (typically the most comprehensive)
  const sorted = children.sort((a, b) => a.order - b.order)
  return sorted[sorted.length - 1]!.log!.id
}

function mapTimelineToStages(records: AzureTimelineRecord[]): PipelineStage[] {
  const stages = records.filter((r) => r.type === 'Stage')
  const jobs = records.filter((r) => r.type === 'Job')

  return stages
    .sort((a, b) => a.order - b.order)
    .map((stage): PipelineStage => {
      const stageJobs: PipelineJob[] = jobs
        .filter((j) => j.parentId === stage.id)
        .sort((a, b) => a.order - b.order)
        .map((job): PipelineJob => {
          const jobIssues = [
            ...mapIssues(job.issues),
            ...collectJobIssues(job.id, records),
          ]
          const errorCount = jobIssues.filter((i) => i.type === 'error').length
          const warningCount = jobIssues.filter((i) => i.type === 'warning').length

          return {
            id: job.id,
            name: job.name,
            status: mapTimelineStatus(job.state, job.result),
            startTime: job.startTime ?? null,
            finishTime: job.finishTime ?? null,
            result: job.result || '',
            workerName: job.workerName || '',
            errorCount,
            warningCount,
            issues: jobIssues,
            logId: findJobLogId(job.id, job.log, records),
          }
        })

      const stageErrorCount = stageJobs.reduce((sum, j) => sum + j.errorCount, 0)
      const stageWarningCount = stageJobs.reduce((sum, j) => sum + j.warningCount, 0)

      return {
        id: stage.id,
        name: stage.name,
        order: stage.order,
        status: mapTimelineStatus(stage.state, stage.result),
        startTime: stage.startTime ?? null,
        finishTime: stage.finishTime ?? null,
        result: stage.result || '',
        errorCount: stageErrorCount,
        warningCount: stageWarningCount,
        jobs: stageJobs,
      }
    })
}

function mapBuildRun(run: AzureBuildRun): PipelineRun {
  return {
    id: run.id,
    name: run.buildNumber,
    status: mapPipelineStatus(run.status, run.result),
    result: run.result || '',
    startTime: run.startTime ?? null,
    finishTime: run.finishTime ?? null,
    url: run._links?.web?.href ?? '',
    sourceBranch: (run.sourceBranch || '').replace('refs/heads/', ''),
    sourceVersion: (run.sourceVersion || '').substring(0, 8),
    requestedBy: run.requestedFor?.displayName ?? '',
  }
}

export function registerDevOpsHandlers(ipcMain: IpcMain): void {
  // Load devops config
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_LOAD,
    async (_event, { projectPath }: { projectPath: string }) => {
      const filePath = getDevOpsPath(projectPath)
      if (!fs.existsSync(filePath)) {
        return defaultDevOpsFile()
      }
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw) as DevOpsFile
      } catch (err) {
        console.error('[DevOps] failed to read file:', err)
        return defaultDevOpsFile()
      }
    },
  )

  // Save devops config
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_SAVE,
    async (_event, { projectPath, data }: { projectPath: string; data: DevOpsFile }) => {
      saveDevOpsFile(projectPath, data)
      return { success: true }
    },
  )

  // Test connection
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_TEST_CONNECTION,
    async (_event, { connection }: { connection: DevOpsConnection }) => {
      try {
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/definitions?api-version=7.1&$top=1`
        await azureDevOpsRequest(connection.auth, url)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // List pipelines
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_LIST_PIPELINES,
    async (_event, { connection }: { connection: DevOpsConnection }) => {
      try {
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/definitions?api-version=7.1&includeLatestBuilds=true`
        const result = await azureDevOpsRequest<{ value: AzureBuildDef[] }>(connection.auth, url)

        const pipelines: PipelineDefinition[] = result.value.map((def) => ({
          id: def.id,
          name: def.name,
          folder: def.path || '\\',
          revision: def.revision,
          url: def._links?.web?.href ?? '',
          latestRun: def.latestBuild ? mapBuildRun(def.latestBuild) : null,
        }))

        return { success: true, pipelines }
      } catch (err) {
        return { success: false, pipelines: [], error: String(err) }
      }
    },
  )

  // Get pipeline runs
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_PIPELINE_RUNS,
    async (_event, { connection, pipelineId, count }: { connection: DevOpsConnection; pipelineId: number; count?: number }) => {
      try {
        const top = count || 10
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds?api-version=7.1&definitions=${pipelineId}&$top=${top}`
        const result = await azureDevOpsRequest<{ value: AzureBuildRun[] }>(connection.auth, url)

        const runs: PipelineRun[] = result.value.map(mapBuildRun)
        return { success: true, runs }
      } catch (err) {
        return { success: false, runs: [], error: String(err) }
      }
    },
  )

  // Run pipeline
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_RUN_PIPELINE,
    async (_event, { connection, pipelineId, branch }: { connection: DevOpsConnection; pipelineId: number; branch?: string }) => {
      try {
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds?api-version=7.1`
        const authHeader = await getAuthHeader(connection.auth)

        const body: Record<string, unknown> = { definition: { id: pipelineId } }
        if (branch) {
          body.sourceBranch = `refs/heads/${branch}`
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to run pipeline: ${response.status} - ${errorText}`)
        }

        const run = await response.json() as AzureBuildRun
        return { success: true, run: mapBuildRun(run) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Get build timeline (stages & jobs)
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_BUILD_TIMELINE,
    async (_event, { connection, buildId }: { connection: DevOpsConnection; buildId: number }) => {
      try {
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds/${buildId}/timeline?api-version=7.1`
        const result = await azureDevOpsRequest<{ records: AzureTimelineRecord[] }>(connection.auth, url)

        const stages = mapTimelineToStages(result.records || [])
        return { success: true, stages }
      } catch (err) {
        return { success: false, stages: [], error: String(err) }
      }
    },
  )

  // Get pending approvals for a build
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_APPROVALS,
    async (_event, { connection, buildIds }: { connection: DevOpsConnection; buildIds: number[] }) => {
      try {
        const idsParam = buildIds.join(',')
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/pipelines/approvals?api-version=7.1-preview.1&buildIds=${idsParam}`
        const result = await azureDevOpsRequest<{ value: AzureApproval[] }>(connection.auth, url)

        const approvals: PipelineApproval[] = result.value.map((a) => ({
          id: a.id,
          buildId: extractBuildIdFromApproval(a),
          status: mapApprovalStatus(a.status),
          createdOn: a.createdOn,
          instructions: a.instructions || '',
          minRequiredApprovers: a.minRequiredApprovers,
          steps: a.steps.map((s) => ({
            assignedApprover: s.assignedApprover.displayName,
            status: mapApprovalStatus(s.status),
            comment: s.comment || '',
          })),
        }))

        return { success: true, approvals }
      } catch (err) {
        return { success: false, approvals: [], error: String(err) }
      }
    },
  )

  // Approve or reject
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_APPROVE,
    async (_event, { connection, approvalId, status, comment }: { connection: DevOpsConnection; approvalId: string; status: 'approved' | 'rejected'; comment?: string }) => {
      try {
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/pipelines/approvals?api-version=7.1-preview.1`
        const body = [{ approvalId, status, comment: comment || '' }]
        await azureDevOpsPatch(connection.auth, url, body)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Get build log content
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_BUILD_LOG,
    async (_event, { connection, buildId, logId }: { connection: DevOpsConnection; buildId: number; logId: number }) => {
      try {
        const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds/${buildId}/logs/${logId}?api-version=7.1`
        const authHeader = await getAuthHeader(connection.auth)
        const response = await fetch(url, {
          headers: {
            Authorization: authHeader,
            Accept: 'text/plain',
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Azure DevOps API error: ${response.status} - ${errorText}`)
        }

        const content = await response.text()
        return { success: true, content }
      } catch (err) {
        return { success: false, content: '', error: String(err) }
      }
    },
  )
}

function extractBuildIdFromApproval(approval: AzureApproval): number {
  const buildHref = approval._links?.build?.href ?? ''
  const match = buildHref.match(/builds\/(\d+)/)
  return match ? parseInt(match[1]!, 10) : 0
}
