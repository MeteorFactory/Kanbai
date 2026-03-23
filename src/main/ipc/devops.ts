import { IpcMain } from 'electron'
import crypto from 'crypto'
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
  PipelineTask,
  PipelineStatus,
  PipelineApproval,
  ApprovalStatus,
  DEFAULT_TEMPLATE_REPOSITORIES,
} from '../../shared/types'

function defaultDevOpsFile(): DevOpsFile {
  return { version: 1, connections: [], templateRepositories: DEFAULT_TEMPLATE_REPOSITORIES }
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

export async function getAuthHeader(auth: DevOpsAuth): Promise<string> {
  if (auth.method === 'pat') {
    const encoded = Buffer.from(`:${auth.token}`).toString('base64')
    return `Basic ${encoded}`
  }

  if (auth.method !== 'oauth2') {
    throw new Error(`Unsupported Azure auth method: ${auth.method}`)
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

export async function azureDevOpsRequest<T>(
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

export async function azureDevOpsPatch<T>(
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

export function mapApprovalStatus(status: string): ApprovalStatus {
  const mapping: Record<string, ApprovalStatus> = {
    pending: 'pending',
    approved: 'approved',
    rejected: 'rejected',
    canceled: 'canceled',
    timedOut: 'canceled',
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
  pipeline?: {
    owner?: {
      id: number
      name: string
    }
    id: string
    name: string
  }
  _links?: {
    build?: { href?: string }
  }
}

export function mapPipelineStatus(status: string, result: string): PipelineStatus {
  if (status === 'inProgress' || status === 'cancelling') return 'running'
  if (status === 'notStarted' || status === 'postponed') return 'notStarted'
  if (result === 'succeeded' || result === 'partiallySucceeded') return 'succeeded'
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
  latestCompletedBuild?: AzureBuildRun
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
  templateParameters?: Record<string, string>
  parameters?: string
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
  if (state === 'completed' || result) {
    if (result === 'succeeded' || result === 'partiallySucceeded') return 'succeeded'
    if (result === 'failed') return 'failed'
    if (result === 'canceled' || result === 'cancelled') return 'canceled'
    if (result === 'skipped') return 'canceled'
  }
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

export function mapTimelineToStages(records: AzureTimelineRecord[]): PipelineStage[] {
  const stages = records.filter((r) => r.type === 'Stage')
  const phases = records.filter((r) => r.type === 'Phase')
  const jobs = records.filter((r) => r.type === 'Job')

  // Build a set of Phase IDs that belong to each Stage (Stage → Phase → Job)
  const phaseIdsByStage = new Map<string, Set<string>>()
  for (const stage of stages) {
    const stagePhaseIds = new Set(
      phases.filter((p) => p.parentId === stage.id).map((p) => p.id),
    )
    phaseIdsByStage.set(stage.id, stagePhaseIds)
  }

  return stages
    .sort((a, b) => a.order - b.order)
    .map((stage): PipelineStage => {
      const stagePhaseIds = phaseIdsByStage.get(stage.id) ?? new Set<string>()
      const stageJobs: PipelineJob[] = jobs
        .filter((j) => j.parentId === stage.id || stagePhaseIds.has(j.parentId ?? ''))
        .sort((a, b) => a.order - b.order)
        .map((job): PipelineJob => {
          const jobIssues = [
            ...mapIssues(job.issues),
            ...collectJobIssues(job.id, records),
          ]
          const errorCount = jobIssues.filter((i) => i.type === 'error').length
          const warningCount = jobIssues.filter((i) => i.type === 'warning').length

          // Build task list for this job
          const jobTasks: PipelineTask[] = records
            .filter((r) => r.parentId === job.id && r.type === 'Task')
            .sort((a, b) => a.order - b.order)
            .map((task): PipelineTask => {
              const taskIssues = mapIssues(task.issues)
              return {
                id: task.id,
                name: task.name,
                status: mapTimelineStatus(task.state, task.result),
                startTime: task.startTime ?? null,
                finishTime: task.finishTime ?? null,
                result: task.result || '',
                order: task.order,
                errorCount: taskIssues.filter((i) => i.type === 'error').length,
                warningCount: taskIssues.filter((i) => i.type === 'warning').length,
                issues: taskIssues,
                logId: task.log?.id ?? null,
              }
            })

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
            tasks: jobTasks,
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

function extractAzureParameters(run: AzureBuildRun): Record<string, string> {
  const params: Record<string, string> = {}
  if (run.templateParameters) {
    for (const [key, value] of Object.entries(run.templateParameters)) {
      params[key] = String(value)
    }
  }
  if (run.parameters) {
    try {
      const parsed = JSON.parse(run.parameters) as Record<string, string>
      for (const [key, value] of Object.entries(parsed)) {
        params[key] = String(value)
      }
    } catch {
      // Ignore invalid JSON in parameters
    }
  }
  return params
}

export function mapBuildRun(run: AzureBuildRun): PipelineRun {
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
    parameters: extractAzureParameters(run),
  }
}

// =============================================
// GitHub Actions API
// =============================================

function generateGitHubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iat: now - 30,
    exp: now + 5 * 60,
    iss: parseInt(appId, 10),
  })).toString('base64url')

  const signature = crypto.sign('SHA256', Buffer.from(`${header}.${payload}`), privateKey)
  return `${header}.${payload}.${signature.toString('base64url')}`
}

async function getGitHubAuthHeader(auth: DevOpsAuth): Promise<string> {
  if (auth.method === 'github-pat') {
    return `Bearer ${auth.token}`
  }

  if (auth.method === 'github-app') {
    const jwt = generateGitHubAppJwt(auth.appId, auth.privateKey)
    const response = await fetch(
      `https://api.github.com/app/installations/${auth.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitHub App token request failed: ${response.status} - ${errorText}`)
    }

    const tokenData = await response.json() as { token: string }
    return `Bearer ${tokenData.token}`
  }

  throw new Error(`Unsupported GitHub auth method: ${(auth as { method: string }).method}`)
}

async function gitHubRequest<T>(auth: DevOpsAuth, url: string): Promise<T> {
  const authHeader = await getGitHubAuthHeader(auth)
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub API error: ${response.status} - ${errorText}`)
  }

  return response.json() as Promise<T>
}

async function gitHubPost<T>(auth: DevOpsAuth, url: string, body: unknown): Promise<T> {
  const authHeader = await getGitHubAuthHeader(auth)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub API error: ${response.status} - ${errorText}`)
  }

  return response.json() as Promise<T>
}

interface GitHubWorkflow {
  id: number
  name: string
  path: string
  state: string
  html_url: string
}

interface GitHubWorkflowRun {
  id: number
  name: string
  run_number: number
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  run_started_at: string | null
  html_url: string
  head_branch: string
  head_sha: string
  actor: { login: string } | null
}

interface GitHubJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  html_url: string
  runner_name: string | null
  steps: GitHubStep[] | null
}

interface GitHubStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  started_at: string | null
  completed_at: string | null
}

interface GitHubPendingDeployment {
  environment: { id: number; name: string }
  wait_timer: number
  wait_timer_started_at: string | null
  current_user_can_approve: boolean
  reviewers: Array<{ type: string; reviewer: { login: string } }>
}

function mapGitHubStatus(status: string, conclusion: string | null): PipelineStatus {
  if (status === 'in_progress') return 'running'
  if (status === 'queued' || status === 'waiting' || status === 'pending' || status === 'requested') return 'notStarted'
  if (status === 'completed') {
    if (conclusion === 'success') return 'succeeded'
    if (conclusion === 'failure') return 'failed'
    if (conclusion === 'cancelled') return 'canceled'
    if (conclusion === 'skipped') return 'canceled'
    return 'unknown'
  }
  return 'unknown'
}

function mapGitHubWorkflowRun(run: GitHubWorkflowRun): PipelineRun {
  return {
    id: run.id,
    name: `${run.run_number}`,
    status: mapGitHubStatus(run.status, run.conclusion),
    result: run.conclusion ?? run.status,
    startTime: run.run_started_at ?? run.created_at,
    finishTime: run.status === 'completed' ? run.updated_at : null,
    url: run.html_url,
    sourceBranch: run.head_branch ?? '',
    sourceVersion: (run.head_sha ?? '').substring(0, 8),
    requestedBy: run.actor?.login ?? '',
    parameters: {},
  }
}

function mapGitHubJobsToStages(jobs: GitHubJob[]): PipelineStage[] {
  return jobs.map((job, index): PipelineStage => {
    const tasks: PipelineTask[] = (job.steps ?? []).map((step): PipelineTask => ({
      id: `${job.id}-step-${step.number}`,
      name: step.name,
      status: mapGitHubStatus(step.status, step.conclusion),
      startTime: step.started_at ?? null,
      finishTime: step.completed_at ?? null,
      result: step.conclusion ?? step.status,
      order: step.number,
      errorCount: step.conclusion === 'failure' ? 1 : 0,
      warningCount: 0,
      issues: step.conclusion === 'failure'
        ? [{ type: 'error' as const, message: `Step "${step.name}" failed` }]
        : [],
      logId: step.conclusion ? step.number : null,
    }))

    const errorCount = tasks.reduce((sum, t) => sum + t.errorCount, 0)
    const warningCount = tasks.reduce((sum, t) => sum + t.warningCount, 0)

    return {
      id: String(job.id),
      name: job.name,
      order: index,
      status: mapGitHubStatus(job.status, job.conclusion),
      startTime: job.started_at ?? null,
      finishTime: job.completed_at ?? null,
      result: job.conclusion ?? job.status,
      errorCount,
      warningCount,
      jobs: [{
        id: String(job.id),
        name: job.name,
        status: mapGitHubStatus(job.status, job.conclusion),
        startTime: job.started_at ?? null,
        finishTime: job.completed_at ?? null,
        result: job.conclusion ?? job.status,
        workerName: job.runner_name ?? '',
        errorCount,
        warningCount,
        issues: [],
        logId: job.id,
        tasks,
      }],
    }
  })
}

export function getGitHubApiBase(connection: DevOpsConnection): string {
  // organizationUrl stores the owner, projectName stores the repo
  return `https://api.github.com/repos/${connection.organizationUrl}/${connection.projectName}`
}

export function isGitHub(connection: DevOpsConnection): boolean {
  return connection.provider === 'github'
}

// --- GitHub handler implementations ---

async function gitHubTestConnection(connection: DevOpsConnection): Promise<{ success: boolean; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    await gitHubRequest(connection.auth, `${base}/actions/workflows?per_page=1`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function gitHubListPipelines(connection: DevOpsConnection): Promise<{ success: boolean; pipelines: PipelineDefinition[]; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    const result = await gitHubRequest<{ workflows: GitHubWorkflow[] }>(
      connection.auth,
      `${base}/actions/workflows?per_page=100`,
    )

    // Fetch latest run for each active workflow in parallel
    const activeWorkflows = result.workflows.filter((w) => w.state === 'active')
    const pipelinesWithRuns = await Promise.all(
      activeWorkflows.map(async (workflow): Promise<PipelineDefinition> => {
        let latestRun: PipelineRun | null = null
        try {
          const runsResult = await gitHubRequest<{ workflow_runs: GitHubWorkflowRun[] }>(
            connection.auth,
            `${base}/actions/workflows/${workflow.id}/runs?per_page=1`,
          )
          if (runsResult.workflow_runs.length > 0) {
            latestRun = mapGitHubWorkflowRun(runsResult.workflow_runs[0]!)
          }
        } catch {
          // Ignore errors fetching latest run — workflow still shows
        }
        return {
          id: workflow.id,
          name: workflow.name,
          folder: workflow.path.replace(/^\.github\/workflows\//, ''),
          revision: 0,
          url: workflow.html_url,
          latestRun,
        }
      }),
    )

    return { success: true, pipelines: pipelinesWithRuns }
  } catch (err) {
    return { success: false, pipelines: [], error: String(err) }
  }
}

export async function gitHubGetPipelineRuns(
  connection: DevOpsConnection,
  workflowId: number,
  count: number,
): Promise<{ success: boolean; runs: PipelineRun[]; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    const result = await gitHubRequest<{ workflow_runs: GitHubWorkflowRun[] }>(
      connection.auth,
      `${base}/actions/workflows/${workflowId}/runs?per_page=${count}`,
    )
    const runs = result.workflow_runs.map(mapGitHubWorkflowRun)
    return { success: true, runs }
  } catch (err) {
    return { success: false, runs: [], error: String(err) }
  }
}

export async function gitHubRunPipeline(
  connection: DevOpsConnection,
  workflowId: number,
  branch?: string,
  parameters?: Record<string, string>,
): Promise<{ success: boolean; run?: PipelineRun; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)

    // Get default branch if not specified
    let ref = branch
    if (!ref) {
      const repo = await gitHubRequest<{ default_branch: string }>(connection.auth, `https://api.github.com/repos/${connection.organizationUrl}/${connection.projectName}`)
      ref = repo.default_branch
    }

    const dispatchBody: Record<string, unknown> = { ref }
    if (parameters && Object.keys(parameters).length > 0) {
      dispatchBody.inputs = parameters
    }

    const authHeader = await getGitHubAuthHeader(connection.auth)
    const response = await fetch(`${base}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dispatchBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to dispatch workflow: ${response.status} - ${errorText}`)
    }

    // workflow_dispatch returns 204 No Content — no run object to return
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function gitHubGetBuildTimeline(
  connection: DevOpsConnection,
  runId: number,
): Promise<{ success: boolean; stages: PipelineStage[]; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    const result = await gitHubRequest<{ jobs: GitHubJob[] }>(
      connection.auth,
      `${base}/actions/runs/${runId}/jobs?per_page=100`,
    )
    const stages = mapGitHubJobsToStages(result.jobs)
    return { success: true, stages }
  } catch (err) {
    return { success: false, stages: [], error: String(err) }
  }
}

export async function gitHubGetApprovals(
  connection: DevOpsConnection,
  buildIds: number[],
): Promise<{ success: boolean; approvals: PipelineApproval[]; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    const allApprovals: PipelineApproval[] = []

    // Fetch pending deployments for each run in parallel
    const results = await Promise.all(
      buildIds.map(async (runId) => {
        try {
          const deployments = await gitHubRequest<GitHubPendingDeployment[]>(
            connection.auth,
            `${base}/actions/runs/${runId}/pending_deployments`,
          )
          return deployments.map((d): PipelineApproval => ({
            id: `${runId}-env-${d.environment.id}`,
            buildId: runId,
            status: 'pending',
            createdOn: d.wait_timer_started_at ?? new Date().toISOString(),
            instructions: `Deploy to ${d.environment.name}`,
            minRequiredApprovers: d.reviewers.length,
            steps: d.reviewers.map((r) => ({
              assignedApprover: r.reviewer.login,
              status: 'pending' as ApprovalStatus,
              comment: '',
            })),
          }))
        } catch {
          return []
        }
      }),
    )

    for (const approvals of results) {
      allApprovals.push(...approvals)
    }

    return { success: true, approvals: allApprovals }
  } catch (err) {
    return { success: false, approvals: [], error: String(err) }
  }
}

export async function gitHubApprove(
  connection: DevOpsConnection,
  approvalId: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    // approvalId format: "{runId}-env-{envId}"
    const parts = approvalId.split('-env-')
    const runId = parts[0]
    const envId = parseInt(parts[1] ?? '0', 10)

    await gitHubPost(
      connection.auth,
      `${base}/actions/runs/${runId}/pending_deployments`,
      {
        environment_ids: [envId],
        state: status === 'approved' ? 'approved' : 'rejected',
        comment: comment ?? '',
      },
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function gitHubGetBuildLog(
  connection: DevOpsConnection,
  _buildId: number,
  logId: number,
): Promise<{ success: boolean; content: string; error?: string }> {
  try {
    const base = getGitHubApiBase(connection)
    // logId is the job ID for GitHub
    const authHeader = await getGitHubAuthHeader(connection.auth)
    const response = await fetch(`${base}/actions/jobs/${logId}/logs`, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`)
    }

    const content = await response.text()
    return { success: true, content }
  } catch (err) {
    return { success: false, content: '', error: String(err) }
  }
}

// =============================================
// Exported business logic functions
// =============================================

export async function devopsListPipelines(connection: DevOpsConnection): Promise<{ success: boolean; pipelines: PipelineDefinition[]; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubListPipelines(connection)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/definitions?api-version=7.1&includeLatestBuilds=true`
    const result = await azureDevOpsRequest<{ value: AzureBuildDef[] }>(connection.auth, url)
    const pipelines: PipelineDefinition[] = (result.value ?? []).map((def) => {
      const latestBuild = def.latestBuild ?? def.latestCompletedBuild ?? null
      return {
        id: def.id,
        name: def.name,
        folder: def.path || '\\',
        revision: def.revision,
        url: def._links?.web?.href ?? '',
        latestRun: latestBuild ? mapBuildRun(latestBuild) : null,
      }
    })
    return { success: true, pipelines }
  } catch (err) {
    return { success: false, pipelines: [], error: String(err) }
  }
}

export async function devopsGetPipelineRuns(connection: DevOpsConnection, pipelineId: number, count?: number): Promise<{ success: boolean; runs: PipelineRun[]; error?: string }> {
  const top = count || 20
  try {
    if (isGitHub(connection)) {
      return gitHubGetPipelineRuns(connection, pipelineId, top)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds?api-version=7.1&definitions=${pipelineId}&$top=${top}&queryOrder=queueTimeDescending`
    const result = await azureDevOpsRequest<{ value: AzureBuildRun[] }>(connection.auth, url)
    const runs: PipelineRun[] = (result.value ?? []).map(mapBuildRun)
    return { success: true, runs }
  } catch (err) {
    return { success: false, runs: [], error: String(err) }
  }
}

export async function devopsRunPipeline(connection: DevOpsConnection, pipelineId: number, branch?: string, parameters?: Record<string, string>): Promise<{ success: boolean; run?: PipelineRun; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubRunPipeline(connection, pipelineId, branch, parameters)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds?api-version=7.1`
    const authHeader = await getAuthHeader(connection.auth)
    const body: Record<string, unknown> = { definition: { id: pipelineId } }
    if (branch) body.sourceBranch = `refs/heads/${branch}`
    if (parameters && Object.keys(parameters).length > 0) body.templateParameters = parameters
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
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
}

export async function devopsGetBuildTimeline(connection: DevOpsConnection, buildId: number): Promise<{ success: boolean; stages: PipelineStage[]; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubGetBuildTimeline(connection, buildId)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds/${buildId}/timeline?api-version=7.1`
    const result = await azureDevOpsRequest<{ records: AzureTimelineRecord[] }>(connection.auth, url)
    const stages = mapTimelineToStages(result.records || [])
    return { success: true, stages }
  } catch (err) {
    return { success: false, stages: [], error: String(err) }
  }
}

export async function devopsGetApprovals(connection: DevOpsConnection, buildIds: number[]): Promise<{ success: boolean; approvals: PipelineApproval[]; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubGetApprovals(connection, buildIds)
    }
    const idsParam = buildIds.join(',')
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/pipelines/approvals?api-version=7.1-preview.1&buildIds=${idsParam}`
    const result = await azureDevOpsRequest<{ value: AzureApproval[] }>(connection.auth, url)
    const buildIdSet = new Set(buildIds)
    const allApprovals: PipelineApproval[] = (result.value ?? []).map((a) => ({
      id: a.id,
      buildId: extractBuildIdFromApproval(a),
      status: mapApprovalStatus(a.status),
      createdOn: a.createdOn,
      instructions: a.instructions || '',
      minRequiredApprovers: a.minRequiredApprovers,
      steps: (a.steps || []).map((s) => ({
        assignedApprover: s.assignedApprover?.displayName ?? '',
        status: mapApprovalStatus(s.status),
        comment: s.comment || '',
      })),
    }))
    const approvals = allApprovals.filter((a) => buildIdSet.has(a.buildId))
    return { success: true, approvals }
  } catch (err) {
    return { success: false, approvals: [], error: String(err) }
  }
}

export async function devopsApprove(connection: DevOpsConnection, approvalId: string, status: 'approved' | 'rejected', comment?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubApprove(connection, approvalId, status, comment)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/pipelines/approvals?api-version=7.1-preview.1`
    const body = [{ approvalId, status, comment: comment || '' }]
    await azureDevOpsPatch(connection.auth, url, body)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function devopsGetBuildLog(connection: DevOpsConnection, buildId: number, logId: number): Promise<{ success: boolean; content: string; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubGetBuildLog(connection, buildId, logId)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/builds/${buildId}/logs/${logId}?api-version=7.1`
    const authHeader = await getAuthHeader(connection.auth)
    const response = await fetch(url, {
      headers: { Authorization: authHeader, Accept: 'text/plain' },
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
}

export async function devopsTestConnection(connection: DevOpsConnection): Promise<{ success: boolean; error?: string }> {
  try {
    if (isGitHub(connection)) {
      return gitHubTestConnection(connection)
    }
    const url = `${connection.organizationUrl}/${encodeURIComponent(connection.projectName)}/_apis/build/definitions?api-version=7.1&$top=1`
    await azureDevOpsRequest(connection.auth, url)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
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
      return devopsTestConnection(connection)
    },
  )

  // List pipelines
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_LIST_PIPELINES,
    async (_event, { connection }: { connection: DevOpsConnection }) => {
      return devopsListPipelines(connection)
    },
  )

  // Get pipeline runs
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_PIPELINE_RUNS,
    async (_event, { connection, pipelineId, count }: { connection: DevOpsConnection; pipelineId: number; count?: number }) => {
      return devopsGetPipelineRuns(connection, pipelineId, count)
    },
  )

  // Run pipeline
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_RUN_PIPELINE,
    async (_event, { connection, pipelineId, branch, parameters }: { connection: DevOpsConnection; pipelineId: number; branch?: string; parameters?: Record<string, string> }) => {
      return devopsRunPipeline(connection, pipelineId, branch, parameters)
    },
  )

  // Get build timeline (stages & jobs)
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_BUILD_TIMELINE,
    async (_event, { connection, buildId }: { connection: DevOpsConnection; buildId: number }) => {
      return devopsGetBuildTimeline(connection, buildId)
    },
  )

  // Get pending approvals for builds
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_APPROVALS,
    async (_event, { connection, buildIds }: { connection: DevOpsConnection; buildIds: number[] }) => {
      return devopsGetApprovals(connection, buildIds)
    },
  )

  // Approve or reject
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_APPROVE,
    async (_event, { connection, approvalId, status, comment }: { connection: DevOpsConnection; approvalId: string; status: 'approved' | 'rejected'; comment?: string }) => {
      return devopsApprove(connection, approvalId, status, comment)
    },
  )

  // Get build log content
  ipcMain.handle(
    IPC_CHANNELS.DEVOPS_GET_BUILD_LOG,
    async (_event, { connection, buildId, logId }: { connection: DevOpsConnection; buildId: number; logId: number }) => {
      return devopsGetBuildLog(connection, buildId, logId)
    },
  )
}

export function extractBuildIdFromApproval(approval: AzureApproval): number {
  // Primary: pipeline.owner.id contains the build ID directly
  if (approval.pipeline?.owner?.id) {
    return approval.pipeline.owner.id
  }
  // Fallback: parse from _links.build.href
  const buildHref = approval._links?.build?.href ?? ''
  const match = buildHref.match(/builds\/(\d+)/)
  return match ? parseInt(match[1]!, 10) : 0
}
