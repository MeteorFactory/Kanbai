/**
 * Live integration tests for DevOps pipeline IPC handlers.
 *
 * These tests call the real Azure DevOps API to validate that
 * the IPC handler layer correctly communicates with Azure and
 * maps responses to the application's domain types.
 *
 * Required env vars (set in .env.test or CI secrets):
 *   AZURE_DEVOPS_PAT          — Personal Access Token
 *   AZURE_DEVOPS_ORG_URL      — e.g. https://dev.azure.com/Mirehub
 *   AZURE_DEVOPS_PROJECT      — e.g. Avocachet
 *
 * Run:
 *   npx vitest run tests/integration/devops-live.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createMockIpcMain } from '../mocks/electron'
import { registerDevOpsHandlers } from '../../src/main/ipc/devops'
import type {
  DevOpsConnection,
  PipelineDefinition,
  PipelineRun,
  PipelineStage,
  PipelineApproval,
} from '../../src/shared/types'

const PAT = process.env.AZURE_DEVOPS_PAT ?? ''
const ORG_URL = process.env.AZURE_DEVOPS_ORG_URL ?? ''
const PROJECT = process.env.AZURE_DEVOPS_PROJECT ?? ''

const hasCredentials = PAT.length > 0 && ORG_URL.length > 0 && PROJECT.length > 0

const describeIf = hasCredentials ? describe : describe.skip

function createLiveConnection(): DevOpsConnection {
  return {
    id: 'live-conn',
    name: 'Live Test',
    organizationUrl: ORG_URL,
    projectName: PROJECT,
    auth: { method: 'pat' as const, token: PAT },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describeIf('DevOps IPC Handlers — Live API', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>
  let connection: DevOpsConnection

  // Cached results to avoid repeated API calls
  let pipelines: PipelineDefinition[]
  let firstPipelineRuns: PipelineRun[]
  let firstRunTimeline: PipelineStage[]
  let approvals: PipelineApproval[]

  beforeAll(() => {
    mockIpcMain = createMockIpcMain()
    registerDevOpsHandlers(mockIpcMain as never)
    connection = createLiveConnection()
  })

  // ── Connection ──────────────────────────────────────────────

  it('devops:testConnection valide la connexion avec l API reelle', async () => {
    const result = await mockIpcMain._invoke<{ success: boolean }>('devops:testConnection', {
      connection,
    })

    expect(result.success).toBe(true)
  })

  it('devops:testConnection echoue avec un token invalide', async () => {
    const badConnection = createLiveConnection()
    badConnection.auth = { method: 'pat', token: 'invalid-token' }

    const result = await mockIpcMain._invoke<{ success: boolean; error?: string }>(
      'devops:testConnection',
      { connection: badConnection },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── List Pipelines ──────────────────────────────────────────

  it('devops:listPipelines retourne les pipelines du projet', async () => {
    const result = await mockIpcMain._invoke<{
      success: boolean
      pipelines: PipelineDefinition[]
    }>('devops:listPipelines', { connection })

    expect(result.success).toBe(true)
    expect(result.pipelines.length).toBeGreaterThan(0)

    // Cache for subsequent tests
    pipelines = result.pipelines

    // Validate pipeline shape
    const pipeline = pipelines[0]
    expect(pipeline).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        folder: expect.any(String),
        revision: expect.any(Number),
      }),
    )

    // Log pipeline names for visibility
    console.log(
      '[LIVE] Pipelines:',
      pipelines.map((p) => `${p.id}:${p.name}`).join(', '),
    )
  })

  it('devops:listPipelines inclut le latestRun quand disponible', async () => {
    const withRun = pipelines.find((p) => p.latestRun !== null)
    if (!withRun) {
      console.log('[LIVE] Aucun pipeline avec latestRun — skip assertion')
      return
    }

    const run = withRun.latestRun!
    expect(run).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        status: expect.stringMatching(
          /^(succeeded|failed|canceled|running|notStarted|unknown)$/,
        ),
        sourceBranch: expect.any(String),
      }),
    )

    console.log(
      `[LIVE] Pipeline "${withRun.name}" latestRun: #${run.id} ${run.status} (${run.sourceBranch})`,
    )
  })

  // ── Pipeline Runs ───────────────────────────────────────────

  it('devops:getPipelineRuns retourne les runs d un pipeline', async () => {
    const targetPipeline = pipelines[0]

    const result = await mockIpcMain._invoke<{
      success: boolean
      runs: PipelineRun[]
    }>('devops:getPipelineRuns', {
      connection,
      pipelineId: targetPipeline.id,
      count: 5,
    })

    expect(result.success).toBe(true)
    expect(result.runs.length).toBeGreaterThan(0)

    firstPipelineRuns = result.runs

    const run = result.runs[0]
    expect(run).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        status: expect.stringMatching(
          /^(succeeded|failed|canceled|running|notStarted|unknown)$/,
        ),
        result: expect.any(String),
        sourceBranch: expect.any(String),
        sourceVersion: expect.any(String),
      }),
    )

    console.log(
      `[LIVE] Runs for "${targetPipeline.name}":`,
      result.runs.map((r) => `#${r.id} ${r.status}`).join(', '),
    )
  })

  it('devops:getPipelineRuns strip le prefixe refs/heads/ des branches', async () => {
    const branchRun = firstPipelineRuns.find((r) => r.sourceBranch.length > 0)
    if (!branchRun) return

    expect(branchRun.sourceBranch).not.toContain('refs/heads/')
    console.log(`[LIVE] Branch correctement mappee: "${branchRun.sourceBranch}"`)
  })

  it('devops:getPipelineRuns tronque le sourceVersion a 8 caracteres', async () => {
    const versionRun = firstPipelineRuns.find((r) => r.sourceVersion.length > 0)
    if (!versionRun) return

    expect(versionRun.sourceVersion.length).toBeLessThanOrEqual(8)
    console.log(`[LIVE] Version correctement tronquee: "${versionRun.sourceVersion}"`)
  })

  // ── Build Timeline ──────────────────────────────────────────

  it('devops:getBuildTimeline retourne les stages et jobs d un build', async () => {
    const targetRun = firstPipelineRuns[0]

    const result = await mockIpcMain._invoke<{
      success: boolean
      stages: PipelineStage[]
    }>('devops:getBuildTimeline', {
      connection,
      buildId: targetRun.id,
    })

    expect(result.success).toBe(true)
    expect(result.stages.length).toBeGreaterThan(0)

    firstRunTimeline = result.stages

    const stage = result.stages[0]
    expect(stage).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        order: expect.any(Number),
        status: expect.stringMatching(
          /^(succeeded|failed|canceled|running|notStarted|unknown)$/,
        ),
        errorCount: expect.any(Number),
        warningCount: expect.any(Number),
        jobs: expect.any(Array),
      }),
    )

    console.log(
      `[LIVE] Timeline for build #${targetRun.id}:`,
      result.stages.map((s) => `${s.name}(${s.status})`).join(' → '),
    )
  })

  it('devops:getBuildTimeline retourne les stages tries par order', async () => {
    for (let i = 1; i < firstRunTimeline.length; i++) {
      expect(firstRunTimeline[i].order).toBeGreaterThanOrEqual(
        firstRunTimeline[i - 1].order,
      )
    }
  })

  it('devops:getBuildTimeline inclut les jobs avec logId', async () => {
    const stageWithJobs = firstRunTimeline.find((s) => s.jobs.length > 0)
    if (!stageWithJobs) {
      console.log('[LIVE] Aucun stage avec jobs — skip')
      return
    }

    const job = stageWithJobs.jobs[0]
    expect(job).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        status: expect.stringMatching(
          /^(succeeded|failed|canceled|running|notStarted|unknown)$/,
        ),
        workerName: expect.any(String),
        errorCount: expect.any(Number),
        warningCount: expect.any(Number),
        issues: expect.any(Array),
      }),
    )

    console.log(
      `[LIVE] Job "${job.name}" — status: ${job.status}, logId: ${job.logId}, errors: ${job.errorCount}, warnings: ${job.warningCount}`,
    )
  })

  it('devops:getBuildTimeline agrege les erreurs/warnings des jobs dans les stages', async () => {
    for (const stage of firstRunTimeline) {
      const jobErrors = stage.jobs.reduce((sum, j) => sum + j.errorCount, 0)
      const jobWarnings = stage.jobs.reduce((sum, j) => sum + j.warningCount, 0)
      expect(stage.errorCount).toBe(jobErrors)
      expect(stage.warningCount).toBe(jobWarnings)
    }
  })

  // ── Build Logs ──────────────────────────────────────────────

  it('devops:getBuildLog retourne le contenu d un log de job', async () => {
    const jobWithLog = firstRunTimeline
      .flatMap((s) => s.jobs)
      .find((j) => j.logId !== null)

    if (!jobWithLog) {
      console.log('[LIVE] Aucun job avec logId — skip')
      return
    }

    const result = await mockIpcMain._invoke<{
      success: boolean
      content: string
    }>('devops:getBuildLog', {
      connection,
      buildId: firstPipelineRuns[0].id,
      logId: jobWithLog.logId,
    })

    expect(result.success).toBe(true)
    expect(result.content.length).toBeGreaterThan(0)

    const lines = result.content.split('\n')
    console.log(
      `[LIVE] Log for job "${jobWithLog.name}": ${lines.length} lines, ${result.content.length} bytes`,
    )
    console.log(`[LIVE] First line: ${lines[0]?.substring(0, 100)}`)
  })

  // ── Approvals ───────────────────────────────────────────────

  it('devops:getApprovals retourne les approbations pour des builds', async () => {
    const buildIds = firstPipelineRuns.slice(0, 3).map((r) => r.id)

    const result = await mockIpcMain._invoke<{
      success: boolean
      approvals: PipelineApproval[]
    }>('devops:getApprovals', {
      connection,
      buildIds,
    })

    expect(result.success).toBe(true)
    expect(result.approvals).toBeDefined()
    expect(Array.isArray(result.approvals)).toBe(true)

    approvals = result.approvals

    if (approvals.length > 0) {
      const approval = approvals[0]
      expect(approval).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          buildId: expect.any(Number),
          status: expect.stringMatching(
            /^(pending|approved|rejected|canceled|skipped|undefined)$/,
          ),
          createdOn: expect.any(String),
          minRequiredApprovers: expect.any(Number),
          steps: expect.any(Array),
        }),
      )
      console.log(
        `[LIVE] ${approvals.length} approbation(s) trouvee(s), premiere: ${approval.status} (build #${approval.buildId})`,
      )
    } else {
      console.log('[LIVE] Aucune approbation trouvee pour ces builds')
    }
  })

  it('devops:getApprovals filtre correctement par buildIds', async () => {
    // Each approval's buildId should be in the requested buildIds set
    const buildIds = firstPipelineRuns.slice(0, 3).map((r) => r.id)
    const buildIdSet = new Set(buildIds)

    for (const approval of approvals) {
      expect(buildIdSet.has(approval.buildId)).toBe(true)
    }

    console.log(
      `[LIVE] ${approvals.length} approval(s) toutes associees aux builds demandes: [${buildIds.join(',')}]`,
    )
  })

  it('devops:getApprovals retourne les approvals de chaque pipeline separement', async () => {
    const allApprovalsByPipeline: Record<string, number> = {}

    for (const pipeline of pipelines) {
      const runsResult = await mockIpcMain._invoke<{
        success: boolean
        runs: PipelineRun[]
      }>('devops:getPipelineRuns', {
        connection,
        pipelineId: pipeline.id,
        count: 3,
      })

      if (runsResult.runs.length === 0) continue

      const buildIds = runsResult.runs.map((r) => r.id)
      const result = await mockIpcMain._invoke<{
        success: boolean
        approvals: PipelineApproval[]
      }>('devops:getApprovals', {
        connection,
        buildIds,
      })

      expect(result.success).toBe(true)
      allApprovalsByPipeline[pipeline.name] = result.approvals.length

      // Verify each approval matches a requested build
      for (const approval of result.approvals) {
        expect(buildIds).toContain(approval.buildId)
      }
    }

    console.log('[LIVE] Approvals par pipeline:')
    for (const [name, count] of Object.entries(allApprovalsByPipeline)) {
      console.log(`  ${name}: ${count} approval(s)`)
    }
  })

  // ── Cross-pipeline coverage ─────────────────────────────────

  it('devops:getPipelineRuns fonctionne pour chaque pipeline du projet', async () => {
    const results = await Promise.all(
      pipelines.map((p) =>
        mockIpcMain._invoke<{ success: boolean; runs: PipelineRun[] }>(
          'devops:getPipelineRuns',
          { connection, pipelineId: p.id, count: 2 },
        ),
      ),
    )

    for (let i = 0; i < results.length; i++) {
      expect(results[i].success).toBe(true)
      console.log(
        `[LIVE] Pipeline "${pipelines[i].name}": ${results[i].runs.length} run(s)`,
      )
    }
  })

  it('devops:getBuildTimeline fonctionne pour les builds de differents pipelines', async () => {
    // Get one run from each pipeline that has runs
    const runsPerPipeline = await Promise.all(
      pipelines.map((p) =>
        mockIpcMain._invoke<{ success: boolean; runs: PipelineRun[] }>(
          'devops:getPipelineRuns',
          { connection, pipelineId: p.id, count: 1 },
        ),
      ),
    )

    const buildIds = runsPerPipeline
      .filter((r) => r.success && r.runs.length > 0)
      .map((r) => r.runs[0].id)

    const timelines = await Promise.all(
      buildIds.map((buildId) =>
        mockIpcMain._invoke<{ success: boolean; stages: PipelineStage[] }>(
          'devops:getBuildTimeline',
          { connection, buildId },
        ),
      ),
    )

    for (let i = 0; i < timelines.length; i++) {
      expect(timelines[i].success).toBe(true)
      console.log(
        `[LIVE] Build #${buildIds[i]}: ${timelines[i].stages.length} stage(s) — ${timelines[i].stages.map((s) => s.name).join(', ')}`,
      )
    }
  })
})
