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
  PipelineStatus,
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
}
