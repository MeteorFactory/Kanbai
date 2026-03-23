import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = vi.hoisted(() => {
  const osMod = require('os')
  const pathMod = require('path')
  return pathMod.join(osMod.tmpdir(), `.kanbai-devops-ipc-test-${process.pid}-${Date.now()}`)
})

const mockFetch = vi.hoisted(() => vi.fn())

vi.stubGlobal('fetch', mockFetch)

import { registerDevOpsHandlers } from '../../src/main/ipc/devops'
import type { DevOpsConnection, DevOpsFile } from '../../src/shared/types'
import { DEFAULT_TEMPLATE_REPOSITORIES } from '../../src/shared/types'

function createTestConnection(overrides: Partial<DevOpsConnection> = {}): DevOpsConnection {
  return {
    id: 'conn-test',
    name: 'Test Azure',
    organizationUrl: 'https://dev.azure.com/testorg',
    projectName: 'TestProject',
    auth: { method: 'pat', token: 'test-pat-token' },
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}

function createFetchResponse(body: unknown, options: { ok?: boolean; status?: number; contentType?: string } = {}): Response {
  const { ok = true, status = 200, contentType = 'application/json' } = options
  const isJson = contentType === 'application/json'
  return {
    ok,
    status,
    headers: new Headers({ 'Content-Type': contentType }),
    text: () => Promise.resolve(isJson ? JSON.stringify(body) : String(body)),
    json: () => Promise.resolve(body),
  } as Response
}

describe('DevOps IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(() => {
    mockFetch.mockReset()

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(path.join(TEST_DIR, '.kanbai'), { recursive: true })

    mockIpcMain = createMockIpcMain()
    registerDevOpsHandlers(mockIpcMain as never)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // --- Handler Registration ---

  it('enregistre les 10 handlers devops', () => {
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(10)
    expect(mockIpcMain._handlers.has('devops:load')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:save')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:testConnection')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:listPipelines')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:getPipelineRuns')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:runPipeline')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:getBuildTimeline')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:getApprovals')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:approve')).toBe(true)
    expect(mockIpcMain._handlers.has('devops:getBuildLog')).toBe(true)
  })

  // --- DEVOPS_LOAD ---

  it('devops:load retourne le fichier par defaut quand aucun fichier n existe', async () => {
    const result = await mockIpcMain._invoke('devops:load', { projectPath: TEST_DIR })

    expect(result).toEqual({ version: 1, connections: [], templateRepositories: DEFAULT_TEMPLATE_REPOSITORIES })
  })

  it('devops:load lit les donnees sauvegardees depuis le disque', async () => {
    const testData: DevOpsFile = {
      version: 1,
      connections: [createTestConnection()],
    }
    const filePath = path.join(TEST_DIR, '.kanbai', 'devops.json')
    fs.writeFileSync(filePath, JSON.stringify(testData, null, 2), 'utf-8')

    const result = await mockIpcMain._invoke('devops:load', { projectPath: TEST_DIR })

    expect(result.version).toBe(1)
    expect(result.connections).toHaveLength(1)
    expect(result.connections[0].name).toBe('Test Azure')
  })

  it('devops:load retourne le fichier par defaut si le JSON est invalide', async () => {
    const filePath = path.join(TEST_DIR, '.kanbai', 'devops.json')
    fs.writeFileSync(filePath, '{invalid json!!!', 'utf-8')

    const result = await mockIpcMain._invoke('devops:load', { projectPath: TEST_DIR })

    expect(result).toEqual({ version: 1, connections: [], templateRepositories: DEFAULT_TEMPLATE_REPOSITORIES })
  })

  // --- DEVOPS_SAVE ---

  it('devops:save persiste les donnees sur le disque', async () => {
    const data: DevOpsFile = {
      version: 1,
      connections: [createTestConnection()],
    }

    const result = await mockIpcMain._invoke('devops:save', {
      projectPath: TEST_DIR,
      data,
    })

    expect(result.success).toBe(true)

    const filePath = path.join(TEST_DIR, '.kanbai', 'devops.json')
    expect(fs.existsSync(filePath)).toBe(true)

    const savedData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(savedData.version).toBe(1)
    expect(savedData.connections).toHaveLength(1)
    expect(savedData.connections[0].name).toBe('Test Azure')
  })

  it('devops:save cree le repertoire .kanbai s il n existe pas', async () => {
    const newDir = path.join(TEST_DIR, 'subproject')
    fs.mkdirSync(newDir, { recursive: true })

    const data: DevOpsFile = { version: 1, connections: [] }
    const result = await mockIpcMain._invoke('devops:save', {
      projectPath: newDir,
      data,
    })

    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(newDir, '.kanbai', 'devops.json'))).toBe(true)
  })

  // --- Persistance croisee (load apres save) ---

  it('devops:save puis devops:load retourne les memes donnees', async () => {
    const original: DevOpsFile = {
      version: 1,
      connections: [
        createTestConnection({ id: 'conn-1', name: 'Azure Prod' }),
        createTestConnection({ id: 'conn-2', name: 'Azure Dev' }),
      ],
      pipelineOrder: { 'conn-1': [1, 2, 3] },
    }

    await mockIpcMain._invoke('devops:save', { projectPath: TEST_DIR, data: original })
    const loaded = await mockIpcMain._invoke('devops:load', { projectPath: TEST_DIR })

    expect(loaded.version).toBe(1)
    expect(loaded.connections).toHaveLength(2)
    expect(loaded.connections[0].id).toBe('conn-1')
    expect(loaded.connections[1].id).toBe('conn-2')
    expect(loaded.pipelineOrder).toEqual({ 'conn-1': [1, 2, 3] })
  })

  // --- DEVOPS_TEST_CONNECTION ---

  it('devops:testConnection retourne success quand l API repond', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:testConnection', { connection })

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const callUrl = mockFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('dev.azure.com/testorg')
    expect(callUrl).toContain('TestProject')
    expect(callUrl).toContain('_apis/build/definitions')
  })

  it('devops:testConnection retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Unauthorized', { ok: false, status: 401 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:testConnection', { connection })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('devops:testConnection utilise l authentification PAT correctement', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    await mockIpcMain._invoke('devops:testConnection', { connection })

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    const expectedAuth = `Basic ${Buffer.from(':test-pat-token').toString('base64')}`
    expect(callOptions.headers).toEqual(
      expect.objectContaining({ Authorization: expectedAuth }),
    )
  })

  it('devops:testConnection retourne une erreur quand fetch echoue (reseau)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:testConnection', { connection })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Network error')
  })

  // --- DEVOPS_LIST_PIPELINES ---

  it('devops:listPipelines retourne la liste des pipelines', async () => {
    const azureResponse = {
      value: [
        {
          id: 42,
          name: 'Build-CI',
          path: '\\Production',
          revision: 5,
          _links: { web: { href: 'https://dev.azure.com/testorg/TestProject/_build?definitionId=42' } },
          latestBuild: {
            id: 100,
            buildNumber: '20240101.1',
            status: 'completed',
            result: 'succeeded',
            startTime: '2024-01-01T10:00:00Z',
            finishTime: '2024-01-01T10:15:00Z',
            sourceBranch: 'refs/heads/main',
            sourceVersion: 'abc12345def',
            requestedFor: { displayName: 'John Doe' },
            _links: { web: { href: 'https://dev.azure.com/testorg/TestProject/_build/results?buildId=100' } },
          },
        },
        {
          id: 43,
          name: 'Deploy-CD',
          path: '\\',
          revision: 2,
          latestBuild: null,
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:listPipelines', { connection })

    expect(result.success).toBe(true)
    expect(result.pipelines).toHaveLength(2)

    const pipeline1 = result.pipelines[0]
    expect(pipeline1.id).toBe(42)
    expect(pipeline1.name).toBe('Build-CI')
    expect(pipeline1.folder).toBe('\\Production')
    expect(pipeline1.revision).toBe(5)
    expect(pipeline1.latestRun).not.toBeNull()
    expect(pipeline1.latestRun.id).toBe(100)
    expect(pipeline1.latestRun.status).toBe('succeeded')
    expect(pipeline1.latestRun.sourceBranch).toBe('main')
    expect(pipeline1.latestRun.sourceVersion).toBe('abc12345')
    expect(pipeline1.latestRun.requestedBy).toBe('John Doe')

    const pipeline2 = result.pipelines[1]
    expect(pipeline2.id).toBe(43)
    expect(pipeline2.latestRun).toBeNull()
  })

  it('devops:listPipelines utilise latestCompletedBuild comme fallback quand latestBuild est absent', async () => {
    const azureResponse = {
      value: [
        {
          id: 50,
          name: 'Front-CI',
          path: '\\',
          revision: 1,
          latestBuild: null,
          latestCompletedBuild: {
            id: 300,
            buildNumber: '20240201.1',
            status: 'completed',
            result: 'succeeded',
            startTime: '2024-02-01T10:00:00Z',
            finishTime: '2024-02-01T10:10:00Z',
            sourceBranch: 'refs/heads/main',
            sourceVersion: 'aabbccdd',
            requestedFor: { displayName: 'Alice' },
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:listPipelines', { connection })

    expect(result.success).toBe(true)
    expect(result.pipelines[0].latestRun).not.toBeNull()
    expect(result.pipelines[0].latestRun.id).toBe(300)
    expect(result.pipelines[0].latestRun.status).toBe('succeeded')
  })

  it('devops:listPipelines mappe partiallySucceeded vers succeeded', async () => {
    const azureResponse = {
      value: [
        {
          id: 51,
          name: 'Back-CI',
          path: '\\',
          revision: 1,
          latestBuild: {
            id: 301,
            buildNumber: '20240201.2',
            status: 'completed',
            result: 'partiallySucceeded',
            startTime: '2024-02-01T11:00:00Z',
            finishTime: '2024-02-01T11:10:00Z',
            sourceBranch: 'refs/heads/develop',
            sourceVersion: 'eeff0011',
            requestedFor: { displayName: 'Bob' },
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:listPipelines', { connection })

    expect(result.success).toBe(true)
    expect(result.pipelines[0].latestRun.status).toBe('succeeded')
  })

  it('devops:listPipelines retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Server Error', { ok: false, status: 500 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:listPipelines', { connection })

    expect(result.success).toBe(false)
    expect(result.pipelines).toEqual([])
    expect(result.error).toBeDefined()
  })

  // --- DEVOPS_GET_PIPELINE_RUNS ---

  it('devops:getPipelineRuns retourne les runs d un pipeline', async () => {
    const azureResponse = {
      value: [
        {
          id: 200,
          buildNumber: '20240115.3',
          status: 'inProgress',
          result: '',
          startTime: '2024-01-15T14:00:00Z',
          finishTime: null,
          sourceBranch: 'refs/heads/feature/new-ui',
          sourceVersion: 'deadbeef1234',
          requestedFor: { displayName: 'Jane Smith' },
          _links: { web: { href: 'https://example.com/build/200' } },
        },
        {
          id: 199,
          buildNumber: '20240114.1',
          status: 'completed',
          result: 'failed',
          startTime: '2024-01-14T10:00:00Z',
          finishTime: '2024-01-14T10:30:00Z',
          sourceBranch: 'refs/heads/main',
          sourceVersion: 'cafebabe5678',
          requestedFor: { displayName: 'Bob Builder' },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getPipelineRuns', {
      connection,
      pipelineId: 42,
      count: 5,
    })

    expect(result.success).toBe(true)
    expect(result.runs).toHaveLength(2)

    expect(result.runs[0].id).toBe(200)
    expect(result.runs[0].status).toBe('running')
    expect(result.runs[0].sourceBranch).toBe('feature/new-ui')

    expect(result.runs[1].id).toBe(199)
    expect(result.runs[1].status).toBe('failed')
    expect(result.runs[1].sourceVersion).toBe('cafebabe')
  })

  it('devops:getPipelineRuns utilise le count par defaut de 20 et queryOrder queueTimeDescending', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    await mockIpcMain._invoke('devops:getPipelineRuns', {
      connection,
      pipelineId: 42,
    })

    const callUrl = mockFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('$top=20')
    expect(callUrl).toContain('queryOrder=queueTimeDescending')
  })

  it('devops:getPipelineRuns retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Not Found', { ok: false, status: 404 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getPipelineRuns', {
      connection,
      pipelineId: 999,
    })

    expect(result.success).toBe(false)
    expect(result.runs).toEqual([])
  })

  // --- DEVOPS_RUN_PIPELINE ---

  it('devops:runPipeline declenche un pipeline et retourne le run', async () => {
    const azureResponse = {
      id: 300,
      buildNumber: '20240120.1',
      status: 'notStarted',
      result: '',
      startTime: null,
      finishTime: null,
      sourceBranch: 'refs/heads/main',
      sourceVersion: 'aabbccdd',
      requestedFor: { displayName: 'CI Bot' },
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:runPipeline', {
      connection,
      pipelineId: 42,
      branch: 'develop',
    })

    expect(result.success).toBe(true)
    expect(result.run.id).toBe(300)
    expect(result.run.status).toBe('notStarted')

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    expect(callOptions.method).toBe('POST')
    const body = JSON.parse(callOptions.body as string)
    expect(body.definition.id).toBe(42)
    expect(body.sourceBranch).toBe('refs/heads/develop')
  })

  it('devops:runPipeline fonctionne sans branche specifiee', async () => {
    const azureResponse = {
      id: 301,
      buildNumber: '20240120.2',
      status: 'notStarted',
      result: '',
      startTime: null,
      finishTime: null,
      sourceBranch: 'refs/heads/main',
      sourceVersion: 'eeff0011',
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:runPipeline', {
      connection,
      pipelineId: 42,
    })

    expect(result.success).toBe(true)

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.sourceBranch).toBeUndefined()
  })

  it('devops:runPipeline retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Forbidden', { ok: false, status: 403 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:runPipeline', {
      connection,
      pipelineId: 42,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // --- DEVOPS_GET_BUILD_TIMELINE ---

  it('devops:getBuildTimeline retourne les stages et jobs d un build', async () => {
    // Azure DevOps timeline hierarchy: Stage → Phase → Job → Task
    const azureResponse = {
      records: [
        {
          id: 'stage-1',
          parentId: null,
          type: 'Stage',
          name: 'Build',
          order: 1,
          state: 'completed',
          result: 'succeeded',
          startTime: '2024-01-15T14:00:00Z',
          finishTime: '2024-01-15T14:05:00Z',
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'phase-1',
          parentId: 'stage-1',
          type: 'Phase',
          name: 'Build',
          order: 1,
          state: 'completed',
          result: 'succeeded',
          startTime: '2024-01-15T14:00:00Z',
          finishTime: '2024-01-15T14:05:00Z',
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'job-1',
          parentId: 'phase-1',
          type: 'Job',
          name: 'Build Job',
          order: 1,
          state: 'completed',
          result: 'succeeded',
          startTime: '2024-01-15T14:00:30Z',
          finishTime: '2024-01-15T14:04:30Z',
          workerName: 'agent-pool-1',
          errorCount: 0,
          warningCount: 1,
          issues: [{ type: 'warning', message: 'Deprecated API usage' }],
          log: { id: 10, url: 'https://example.com/logs/10' },
        },
        {
          id: 'task-1',
          parentId: 'job-1',
          type: 'Task',
          name: 'NuGet restore',
          order: 1,
          state: 'completed',
          result: 'succeeded',
          startTime: '2024-01-15T14:01:00Z',
          finishTime: '2024-01-15T14:02:00Z',
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'stage-2',
          parentId: null,
          type: 'Stage',
          name: 'Deploy',
          order: 2,
          state: 'inProgress',
          result: null,
          startTime: '2024-01-15T14:05:00Z',
          finishTime: null,
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'phase-2',
          parentId: 'stage-2',
          type: 'Phase',
          name: 'Deploy',
          order: 1,
          state: 'inProgress',
          result: null,
          startTime: '2024-01-15T14:05:00Z',
          finishTime: null,
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'job-2',
          parentId: 'phase-2',
          type: 'Job',
          name: 'Deploy Job',
          order: 1,
          state: 'inProgress',
          result: null,
          startTime: '2024-01-15T14:05:30Z',
          finishTime: null,
          workerName: 'agent-pool-2',
          errorCount: 2,
          warningCount: 0,
          issues: [
            { type: 'error', message: 'Connection timeout' },
            { type: 'error', message: 'Deployment failed' },
          ],
          log: { id: 20, url: 'https://example.com/logs/20' },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildTimeline', {
      connection,
      buildId: 100,
    })

    expect(result.success).toBe(true)
    expect(result.stages).toHaveLength(2)

    // Stage 1 - Build (completed/succeeded)
    const buildStage = result.stages[0]
    expect(buildStage.name).toBe('Build')
    expect(buildStage.order).toBe(1)
    expect(buildStage.status).toBe('succeeded')
    expect(buildStage.jobs).toHaveLength(1)

    const buildJob = buildStage.jobs[0]
    expect(buildJob.name).toBe('Build Job')
    expect(buildJob.status).toBe('succeeded')
    expect(buildJob.workerName).toBe('agent-pool-1')
    expect(buildJob.logId).toBe(10)
    expect(buildJob.warningCount).toBe(1)
    expect(buildJob.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'warning', message: 'Deprecated API usage' }),
      ]),
    )

    // Stage 2 - Deploy (running)
    const deployStage = result.stages[1]
    expect(deployStage.name).toBe('Deploy')
    expect(deployStage.status).toBe('running')
    expect(deployStage.errorCount).toBe(2)
    expect(deployStage.jobs).toHaveLength(1)

    const deployJob = deployStage.jobs[0]
    expect(deployJob.name).toBe('Deploy Job')
    expect(deployJob.status).toBe('running')
    expect(deployJob.errorCount).toBe(2)
    expect(deployJob.logId).toBe(20)
  })

  it('devops:getBuildTimeline collecte les issues des tasks enfants dans les jobs', async () => {
    const azureResponse = {
      records: [
        {
          id: 'stage-1',
          parentId: null,
          type: 'Stage',
          name: 'Test',
          order: 1,
          state: 'completed',
          result: 'failed',
          startTime: '2024-01-15T14:00:00Z',
          finishTime: '2024-01-15T14:10:00Z',
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'phase-1',
          parentId: 'stage-1',
          type: 'Phase',
          name: 'Test',
          order: 1,
          state: 'completed',
          result: 'failed',
          startTime: '2024-01-15T14:00:00Z',
          finishTime: '2024-01-15T14:10:00Z',
          workerName: null,
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: null,
        },
        {
          id: 'job-1',
          parentId: 'phase-1',
          type: 'Job',
          name: 'Unit Tests',
          order: 1,
          state: 'completed',
          result: 'failed',
          startTime: '2024-01-15T14:00:30Z',
          finishTime: '2024-01-15T14:09:30Z',
          workerName: 'agent-1',
          errorCount: 0,
          warningCount: 0,
          issues: null,
          log: { id: 30, url: 'https://example.com/logs/30' },
        },
        {
          id: 'task-run-tests',
          parentId: 'job-1',
          type: 'Task',
          name: 'Run Tests',
          order: 2,
          state: 'completed',
          result: 'failed',
          startTime: '2024-01-15T14:02:00Z',
          finishTime: '2024-01-15T14:09:00Z',
          workerName: null,
          errorCount: 1,
          warningCount: 1,
          issues: [
            { type: 'error', message: 'Test suite failed: 3 tests failed' },
            { type: 'warning', message: 'Slow test detected: testPerformance' },
          ],
          log: null,
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildTimeline', {
      connection,
      buildId: 200,
    })

    expect(result.success).toBe(true)
    const job = result.stages[0].jobs[0]
    expect(job.errorCount).toBe(1)
    expect(job.warningCount).toBe(1)
    expect(job.issues).toEqual([
      { type: 'error', message: 'Test suite failed: 3 tests failed' },
      { type: 'warning', message: 'Slow test detected: testPerformance' },
    ])
  })

  it('devops:getBuildTimeline gere un tableau de records vide', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ records: [] }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildTimeline', {
      connection,
      buildId: 999,
    })

    expect(result.success).toBe(true)
    expect(result.stages).toEqual([])
  })

  it('devops:getBuildTimeline retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Not Found', { ok: false, status: 404 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildTimeline', {
      connection,
      buildId: 999,
    })

    expect(result.success).toBe(false)
    expect(result.stages).toEqual([])
  })

  // --- DEVOPS_GET_APPROVALS ---

  it('devops:getApprovals retourne les approbations avec pipeline.owner.id', async () => {
    const azureResponse = {
      value: [
        {
          id: 'approval-1',
          status: 'pending',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: 'Please review before deploying to production',
          minRequiredApprovers: 1,
          steps: [
            {
              assignedApprover: { displayName: 'Team Lead' },
              status: 'pending',
              comment: '',
            },
          ],
          pipeline: {
            owner: { id: 100, name: '20240115.1' },
            id: '42',
            name: 'Build-CI',
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [100, 101],
    })

    expect(result.success).toBe(true)
    expect(result.approvals).toHaveLength(1)

    const approval = result.approvals[0]
    expect(approval.id).toBe('approval-1')
    expect(approval.buildId).toBe(100)
    expect(approval.status).toBe('pending')
    expect(approval.instructions).toBe('Please review before deploying to production')
    expect(approval.minRequiredApprovers).toBe(1)
    expect(approval.steps).toHaveLength(1)
    expect(approval.steps[0].assignedApprover).toBe('Team Lead')
    expect(approval.steps[0].status).toBe('pending')
  })

  it('devops:getApprovals filtre client-side par buildIds', async () => {
    const azureResponse = {
      value: [
        {
          id: 'approval-match',
          status: 'pending',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          pipeline: { owner: { id: 100, name: '1' }, id: '42', name: 'CI' },
        },
        {
          id: 'approval-no-match',
          status: 'pending',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          pipeline: { owner: { id: 999, name: '2' }, id: '42', name: 'CI' },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [100],
    })

    expect(result.approvals).toHaveLength(1)
    expect(result.approvals[0].id).toBe('approval-match')
    expect(result.approvals[0].buildId).toBe(100)
  })

  it('devops:getApprovals mappe timedOut vers canceled', async () => {
    const azureResponse = {
      value: [
        {
          id: 'approval-timeout',
          status: 'timedOut',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          pipeline: { owner: { id: 100, name: '1' }, id: '42', name: 'CI' },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [100],
    })

    expect(result.approvals[0].status).toBe('canceled')
  })

  it('devops:getApprovals fallback sur _links.build.href pour le buildId', async () => {
    const azureResponse = {
      value: [
        {
          id: 'approval-legacy',
          status: 'pending',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          _links: {
            build: { href: 'https://dev.azure.com/org/proj/_apis/build/builds/200' },
          },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [200],
    })

    expect(result.approvals).toHaveLength(1)
    expect(result.approvals[0].buildId).toBe(200)
  })

  it('devops:getApprovals gere les steps vides gracieusement', async () => {
    const azureResponse = {
      value: [
        {
          id: 'approval-no-steps',
          status: 'pending',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          pipeline: { owner: { id: 100, name: '1' }, id: '42', name: 'CI' },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [100],
    })

    expect(result.approvals[0].steps).toEqual([])
  })

  it('devops:getApprovals passe les buildIds en parametre de requete', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [100, 200, 300],
    })

    const callUrl = mockFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('buildIds=100,200,300')
  })

  it('devops:getApprovals retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Unauthorized', { ok: false, status: 401 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [100],
    })

    expect(result.success).toBe(false)
    expect(result.approvals).toEqual([])
  })

  // --- DEVOPS_APPROVE ---

  it('devops:approve envoie une approbation', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:approve', {
      connection,
      approvalId: 'approval-1',
      status: 'approved',
      comment: 'Looks good!',
    })

    expect(result.success).toBe(true)

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    expect(callOptions.method).toBe('PATCH')
    const body = JSON.parse(callOptions.body as string)
    expect(body).toEqual([
      { approvalId: 'approval-1', status: 'approved', comment: 'Looks good!' },
    ])
  })

  it('devops:approve envoie un rejet', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:approve', {
      connection,
      approvalId: 'approval-2',
      status: 'rejected',
      comment: 'Missing tests',
    })

    expect(result.success).toBe(true)

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body[0].status).toBe('rejected')
  })

  it('devops:approve utilise un commentaire vide par defaut', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection()
    await mockIpcMain._invoke('devops:approve', {
      connection,
      approvalId: 'approval-3',
      status: 'approved',
    })

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body[0].comment).toBe('')
  })

  it('devops:approve retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Conflict', { ok: false, status: 409 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:approve', {
      connection,
      approvalId: 'approval-1',
      status: 'approved',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // --- DEVOPS_GET_BUILD_LOG ---

  it('devops:getBuildLog retourne le contenu du log', async () => {
    const logContent = '2024-01-15T14:00:00Z Starting build...\n2024-01-15T14:01:00Z Build succeeded.\n'
    mockFetch.mockResolvedValueOnce(createFetchResponse(logContent, { contentType: 'text/plain' }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildLog', {
      connection,
      buildId: 100,
      logId: 10,
    })

    expect(result.success).toBe(true)
    expect(result.content).toContain('Starting build...')
    expect(result.content).toContain('Build succeeded.')
  })

  it('devops:getBuildLog construit l URL correctement', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('log content', { contentType: 'text/plain' }))

    const connection = createTestConnection()
    await mockIpcMain._invoke('devops:getBuildLog', {
      connection,
      buildId: 100,
      logId: 42,
    })

    const callUrl = mockFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('/builds/100/logs/42')
    expect(callUrl).toContain('api-version=7.1')

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    expect((callOptions.headers as Record<string, string>)['Accept']).toBe('text/plain')
  })

  it('devops:getBuildLog retourne une erreur quand l API echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Not Found', { ok: false, status: 404 }))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildLog', {
      connection,
      buildId: 100,
      logId: 999,
    })

    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.error).toBeDefined()
  })

  // --- OAuth2 Authentication ---

  it('devops:testConnection utilise OAuth2 quand configure', async () => {
    // First call: OAuth2 token request
    mockFetch.mockResolvedValueOnce(createFetchResponse({ access_token: 'oauth-token-123' }))
    // Second call: actual API request
    mockFetch.mockResolvedValueOnce(createFetchResponse({ value: [] }))

    const connection = createTestConnection({
      auth: {
        method: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tenantId: 'tenant-id',
      },
    })
    const result = await mockIpcMain._invoke('devops:testConnection', { connection })

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Verify OAuth2 token request
    const tokenCall = mockFetch.mock.calls[0]
    expect(tokenCall[0]).toContain('login.microsoftonline.com/tenant-id')
    expect(tokenCall[1].method).toBe('POST')
    expect(tokenCall[1].body).toContain('client_id=client-id')

    // Verify API request uses Bearer token
    const apiCallOptions = mockFetch.mock.calls[1][1] as RequestInit
    expect((apiCallOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer oauth-token-123')
  })

  it('devops:testConnection retourne une erreur si l OAuth2 echoue', async () => {
    mockFetch.mockResolvedValueOnce(createFetchResponse('Invalid client', { ok: false, status: 400 }))

    const connection = createTestConnection({
      auth: {
        method: 'oauth2',
        clientId: 'bad-client',
        clientSecret: 'bad-secret',
        tenantId: 'tenant-id',
      },
    })
    const result = await mockIpcMain._invoke('devops:testConnection', { connection })

    expect(result.success).toBe(false)
    expect(result.error).toContain('OAuth2 token request failed')
  })

  // --- Status Mapping ---

  it('devops:getPipelineRuns mappe correctement les differents statuts', async () => {
    const azureResponse = {
      value: [
        { id: 1, buildNumber: '1', status: 'inProgress', result: '', startTime: null, finishTime: null, sourceBranch: 'refs/heads/main', sourceVersion: 'aaaa' },
        { id: 2, buildNumber: '2', status: 'completed', result: 'succeeded', startTime: null, finishTime: null, sourceBranch: 'refs/heads/main', sourceVersion: 'bbbb' },
        { id: 3, buildNumber: '3', status: 'completed', result: 'failed', startTime: null, finishTime: null, sourceBranch: 'refs/heads/main', sourceVersion: 'cccc' },
        { id: 4, buildNumber: '4', status: 'completed', result: 'canceled', startTime: null, finishTime: null, sourceBranch: 'refs/heads/main', sourceVersion: 'dddd' },
        { id: 5, buildNumber: '5', status: 'notStarted', result: '', startTime: null, finishTime: null, sourceBranch: 'refs/heads/main', sourceVersion: 'eeee' },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getPipelineRuns', {
      connection,
      pipelineId: 42,
    })

    expect(result.runs[0].status).toBe('running')
    expect(result.runs[1].status).toBe('succeeded')
    expect(result.runs[2].status).toBe('failed')
    expect(result.runs[3].status).toBe('canceled')
    expect(result.runs[4].status).toBe('notStarted')
  })

  // --- Timeline Status Mapping ---

  it('devops:getBuildTimeline mappe correctement les statuts des stages', async () => {
    const azureResponse = {
      records: [
        { id: 's1', parentId: null, type: 'Stage', name: 'S1', order: 1, state: 'completed', result: 'succeeded', startTime: null, finishTime: null, workerName: null, errorCount: 0, warningCount: 0, issues: null, log: null },
        { id: 's2', parentId: null, type: 'Stage', name: 'S2', order: 2, state: 'completed', result: 'failed', startTime: null, finishTime: null, workerName: null, errorCount: 0, warningCount: 0, issues: null, log: null },
        { id: 's3', parentId: null, type: 'Stage', name: 'S3', order: 3, state: 'inProgress', result: null, startTime: null, finishTime: null, workerName: null, errorCount: 0, warningCount: 0, issues: null, log: null },
        { id: 's4', parentId: null, type: 'Stage', name: 'S4', order: 4, state: 'pending', result: null, startTime: null, finishTime: null, workerName: null, errorCount: 0, warningCount: 0, issues: null, log: null },
        { id: 's5', parentId: null, type: 'Stage', name: 'S5', order: 5, state: 'completed', result: 'canceled', startTime: null, finishTime: null, workerName: null, errorCount: 0, warningCount: 0, issues: null, log: null },
        { id: 's6', parentId: null, type: 'Stage', name: 'S6', order: 6, state: 'completed', result: 'skipped', startTime: null, finishTime: null, workerName: null, errorCount: 0, warningCount: 0, issues: null, log: null },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getBuildTimeline', {
      connection,
      buildId: 100,
    })

    expect(result.stages[0].status).toBe('succeeded')
    expect(result.stages[1].status).toBe('failed')
    expect(result.stages[2].status).toBe('running')
    expect(result.stages[3].status).toBe('notStarted')
    expect(result.stages[4].status).toBe('canceled')
    expect(result.stages[5].status).toBe('canceled')
  })

  // --- Build Run Mapping Edge Cases ---

  it('devops:getPipelineRuns gere les champs manquants gracieusement', async () => {
    const azureResponse = {
      value: [
        {
          id: 500,
          buildNumber: '500',
          status: 'completed',
          result: 'succeeded',
          startTime: null,
          finishTime: null,
          sourceBranch: '',
          sourceVersion: '',
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getPipelineRuns', {
      connection,
      pipelineId: 42,
    })

    expect(result.runs[0].sourceBranch).toBe('')
    expect(result.runs[0].sourceVersion).toBe('')
    expect(result.runs[0].requestedBy).toBe('')
    expect(result.runs[0].url).toBe('')
  })

  // --- Approval Extraction Edge Cases ---

  it('devops:getApprovals prefere pipeline.owner.id et filtre par buildIds', async () => {
    const azureResponse = {
      value: [
        {
          id: 'ap-owner',
          status: 'pending',
          createdOn: '2024-01-15T14:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          pipeline: { owner: { id: 42, name: '1' }, id: '10', name: 'CI' },
        },
        {
          id: 'ap-link',
          status: 'pending',
          createdOn: '2024-01-14T10:00:00Z',
          instructions: '',
          minRequiredApprovers: 1,
          steps: [],
          _links: { build: { href: 'https://dev.azure.com/org/proj/_apis/build/builds/42' } },
        },
        {
          id: 'ap-other',
          status: 'approved',
          createdOn: '2024-01-14T10:00:00Z',
          instructions: '',
          minRequiredApprovers: 2,
          steps: [],
          pipeline: { owner: { id: 999, name: '2' }, id: '10', name: 'CI' },
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(createFetchResponse(azureResponse))

    const connection = createTestConnection()
    const result = await mockIpcMain._invoke('devops:getApprovals', {
      connection,
      buildIds: [42],
    })

    // ap-owner and ap-link match buildId 42, ap-other (999) is filtered out
    expect(result.approvals).toHaveLength(2)
    expect(result.approvals[0].buildId).toBe(42)
    expect(result.approvals[1].buildId).toBe(42)
  })
})
