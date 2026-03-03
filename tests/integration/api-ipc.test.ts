import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import http from 'http'
import { createMockIpcMain, createMockDialog } from '../mocks/electron'
import type { ApiTestFile, ApiResponse, ApiTestResult } from '../../src/shared/types'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-api-ipc-test-${process.pid}-${Date.now()}`)

const mockDialog = createMockDialog()

vi.mock('electron', () => ({
  dialog: mockDialog,
  IpcMain: vi.fn(),
}))

describe('API IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })

    // Re-import after module reset to get fresh handlers
    const { registerApiHandlers } = await import('../../src/main/ipc/api')

    mockIpcMain = createMockIpcMain()
    registerApiHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // ---------------------------------------------------------------------------
  // Handler registration
  // ---------------------------------------------------------------------------

  it('registers all 5 API handlers', () => {
    expect(mockIpcMain._handlers.has('api:execute')).toBe(true)
    expect(mockIpcMain._handlers.has('api:load')).toBe(true)
    expect(mockIpcMain._handlers.has('api:save')).toBe(true)
    expect(mockIpcMain._handlers.has('api:export')).toBe(true)
    expect(mockIpcMain._handlers.has('api:import')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // api:load — returns default structure when file does not exist
  // ---------------------------------------------------------------------------

  it('api:load returns default structure when file does not exist', async () => {
    const result = await mockIpcMain._invoke<ApiTestFile>('api:load', {
      projectPath: TEST_DIR,
    })

    expect(result).toEqual({
      version: 1,
      environments: [],
      collections: [],
      chains: [],
      healthChecks: [],
    })
  })

  it('api:load returns default structure when file contains invalid JSON', async () => {
    const kanbaiDir = path.join(TEST_DIR, '.kanbai')
    fs.mkdirSync(kanbaiDir, { recursive: true })
    fs.writeFileSync(path.join(kanbaiDir, 'api-tests.json'), 'not-json{{{', 'utf-8')

    const result = await mockIpcMain._invoke<ApiTestFile>('api:load', {
      projectPath: TEST_DIR,
    })

    expect(result).toEqual({
      version: 1,
      environments: [],
      collections: [],
      chains: [],
      healthChecks: [],
    })
  })

  // ---------------------------------------------------------------------------
  // api:save writes file and api:load reads it back
  // ---------------------------------------------------------------------------

  it('api:save writes file and api:load reads it back correctly', async () => {
    const testData: ApiTestFile = {
      version: 1,
      environments: [
        { id: 'env-1', name: 'Development', variables: { baseUrl: 'http://localhost:3000' } },
      ],
      collections: [
        {
          id: 'col-1',
          name: 'Users API',
          requests: [
            {
              id: 'req-1',
              name: 'Get users',
              method: 'GET',
              url: '{{baseUrl}}/users',
              headers: [],
              body: '',
              bodyType: 'none',
              tests: [{ type: 'status', expected: '200' }],
            },
          ],
        },
      ],
      chains: [],
      healthChecks: [],
    }

    const saveResult = await mockIpcMain._invoke<{ success: boolean }>('api:save', {
      projectPath: TEST_DIR,
      data: testData,
    })

    expect(saveResult.success).toBe(true)

    // Verify file exists on disk
    const filePath = path.join(TEST_DIR, '.kanbai', 'api-tests.json')
    expect(fs.existsSync(filePath)).toBe(true)

    // Load it back through the handler
    const loadedData = await mockIpcMain._invoke<ApiTestFile>('api:load', {
      projectPath: TEST_DIR,
    })

    expect(loadedData).toEqual(testData)
  })

  it('api:save creates .kanbai directory if it does not exist', async () => {
    const freshDir = path.join(TEST_DIR, 'fresh-project')
    fs.mkdirSync(freshDir, { recursive: true })

    const testData: ApiTestFile = {
      version: 1,
      environments: [],
      collections: [],
      chains: [],
      healthChecks: [],
    }

    await mockIpcMain._invoke('api:save', {
      projectPath: freshDir,
      data: testData,
    })

    const kanbaiDir = path.join(freshDir, '.kanbai')
    expect(fs.existsSync(kanbaiDir)).toBe(true)
    expect(fs.existsSync(path.join(kanbaiDir, 'api-tests.json'))).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // api:execute — error handling for invalid URLs
  // ---------------------------------------------------------------------------

  it('api:execute returns error response for invalid URL', async () => {
    const result = await mockIpcMain._invoke<{
      response: ApiResponse
      testResults: ApiTestResult[]
      error?: string
    }>('api:execute', {
      method: 'GET',
      url: 'not-a-valid-url',
      headers: [],
      body: '',
      bodyType: 'none',
      variables: {},
      tests: [],
    })

    expect(result.response.status).toBe(0)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('Invalid URL')
  })

  it('api:execute returns error response for unreachable host', async () => {
    const result = await mockIpcMain._invoke<{
      response: ApiResponse
      testResults: ApiTestResult[]
      error?: string
    }>('api:execute', {
      method: 'GET',
      url: 'http://0.0.0.0:1/unreachable',
      headers: [],
      body: '',
      bodyType: 'none',
      variables: {},
      tests: [],
    })

    expect(result.response.status).toBe(0)
    expect(result.error).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // api:execute — content-type header auto-addition
  // ---------------------------------------------------------------------------

  describe('content-type header auto-addition', () => {
    let server: http.Server
    let serverPort: number

    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        server = http.createServer((req, res) => {
          // Echo back received headers as JSON
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ receivedContentType: req.headers['content-type'] ?? null }))
        })
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address()
          if (addr && typeof addr !== 'string') {
            serverPort = addr.port
          }
          resolve()
        })
      })
    })

    afterEach(() => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    })

    it('adds application/json content-type for json bodyType', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'POST',
        url: `http://127.0.0.1:${serverPort}/echo`,
        headers: [],
        body: '{"key": "value"}',
        bodyType: 'json',
        variables: {},
        tests: [],
      })

      const body = JSON.parse(result.response.body)
      expect(body.receivedContentType).toBe('application/json')
    })

    it('adds form-urlencoded content-type for form bodyType', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'POST',
        url: `http://127.0.0.1:${serverPort}/echo`,
        headers: [],
        body: 'key=value',
        bodyType: 'form',
        variables: {},
        tests: [],
      })

      const body = JSON.parse(result.response.body)
      expect(body.receivedContentType).toBe('application/x-www-form-urlencoded')
    })

    it('adds text/plain content-type for text bodyType', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'POST',
        url: `http://127.0.0.1:${serverPort}/echo`,
        headers: [],
        body: 'plain text body',
        bodyType: 'text',
        variables: {},
        tests: [],
      })

      const body = JSON.parse(result.response.body)
      expect(body.receivedContentType).toBe('text/plain')
    })

    it('does not override existing content-type header', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'POST',
        url: `http://127.0.0.1:${serverPort}/echo`,
        headers: [{ key: 'Content-Type', value: 'application/xml', enabled: true }],
        body: '<root/>',
        bodyType: 'json',
        variables: {},
        tests: [],
      })

      const body = JSON.parse(result.response.body)
      expect(body.receivedContentType).toBe('application/xml')
    })

    it('does not add content-type when body is empty', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'POST',
        url: `http://127.0.0.1:${serverPort}/echo`,
        headers: [],
        body: '',
        bodyType: 'json',
        variables: {},
        tests: [],
      })

      const body = JSON.parse(result.response.body)
      expect(body.receivedContentType).toBeNull()
    })

    it('does not add content-type for none bodyType', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'POST',
        url: `http://127.0.0.1:${serverPort}/echo`,
        headers: [],
        body: 'some body',
        bodyType: 'none',
        variables: {},
        tests: [],
      })

      const body = JSON.parse(result.response.body)
      expect(body.receivedContentType).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // api:export — dialog cancellation
  // ---------------------------------------------------------------------------

  it('api:export respects dialog cancellation', async () => {
    mockDialog.showSaveDialog.mockResolvedValueOnce({
      canceled: true,
      filePath: undefined,
    })

    const result = await mockIpcMain._invoke<{ success: boolean }>('api:export', {
      data: {
        version: 1,
        environments: [],
        collections: [],
        chains: [],
        healthChecks: [],
      },
    })

    expect(result.success).toBe(false)
    expect(mockDialog.showSaveDialog).toHaveBeenCalledOnce()
  })

  it('api:export writes file when dialog is confirmed', async () => {
    const exportPath = path.join(TEST_DIR, 'exported-api-tests.json')
    mockDialog.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: exportPath,
    })

    const testData: ApiTestFile = {
      version: 1,
      environments: [{ id: 'env-1', name: 'Prod', variables: { host: 'prod.example.com' } }],
      collections: [],
      chains: [],
      healthChecks: [],
    }

    const result = await mockIpcMain._invoke<{ success: boolean }>('api:export', {
      data: testData,
    })

    expect(result.success).toBe(true)
    expect(fs.existsSync(exportPath)).toBe(true)

    const fileContent = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
    expect(fileContent).toEqual(testData)
  })

  // ---------------------------------------------------------------------------
  // api:import — dialog cancellation
  // ---------------------------------------------------------------------------

  it('api:import respects dialog cancellation', async () => {
    mockDialog.showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    })

    const result = await mockIpcMain._invoke<{
      success: boolean
      data: ApiTestFile | null
    }>('api:import')

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(mockDialog.showOpenDialog).toHaveBeenCalledOnce()
  })

  it('api:import reads file when dialog is confirmed', async () => {
    const importPath = path.join(TEST_DIR, 'import-api-tests.json')
    const importData: ApiTestFile = {
      version: 1,
      environments: [],
      collections: [{ id: 'col-1', name: 'Imported', requests: [] }],
      chains: [],
      healthChecks: [],
    }
    fs.writeFileSync(importPath, JSON.stringify(importData, null, 2), 'utf-8')

    mockDialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [importPath],
    })

    const result = await mockIpcMain._invoke<{
      success: boolean
      data: ApiTestFile | null
    }>('api:import')

    expect(result.success).toBe(true)
    expect(result.data).toEqual(importData)
  })

  it('api:import returns error when file contains invalid JSON', async () => {
    const importPath = path.join(TEST_DIR, 'bad-import.json')
    fs.writeFileSync(importPath, 'this is not json!!!', 'utf-8')

    mockDialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [importPath],
    })

    const result = await mockIpcMain._invoke<{
      success: boolean
      data: ApiTestFile | null
      error?: string
    }>('api:import')

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // api:execute — full round-trip with assertions
  // ---------------------------------------------------------------------------

  describe('full round-trip with local server', () => {
    let server: http.Server
    let serverPort: number

    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        server = http.createServer((_req, res) => {
          res.writeHead(201, {
            'Content-Type': 'application/json',
            'X-Request-Id': 'req-abc-123',
          })
          res.end(JSON.stringify({ id: 42, created: true }))
        })
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address()
          if (addr && typeof addr !== 'string') {
            serverPort = addr.port
          }
          resolve()
        })
      })
    })

    afterEach(() => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    })

    it('returns correct response shape with status, headers, body, time, size', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'GET',
        url: `http://127.0.0.1:${serverPort}/resource`,
        headers: [],
        body: '',
        bodyType: 'none',
        variables: {},
        tests: [],
      })

      expect(result.response.status).toBe(201)
      expect(result.response.statusText).toBe('Created')
      expect(result.response.headers['content-type']).toBe('application/json')
      expect(result.response.headers['x-request-id']).toBe('req-abc-123')
      expect(result.response.body).toContain('"id":42')
      expect(result.response.time).toBeGreaterThanOrEqual(0)
      expect(result.response.size).toBeGreaterThan(0)
    })

    it('executes request with variable substitution in URL and headers', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'GET',
        url: 'http://127.0.0.1:{{port}}/resource',
        headers: [
          { key: 'X-Api-Key', value: '{{apiKey}}', enabled: true },
        ],
        body: '',
        bodyType: 'none',
        variables: { port: String(serverPort), apiKey: 'secret-key-123' },
        tests: [{ type: 'status', expected: '201' }],
      })

      expect(result.response.status).toBe(201)
      expect(result.testResults).toHaveLength(1)
      expect(result.testResults[0]!.passed).toBe(true)
    })

    it('handles null/undefined tests array gracefully', async () => {
      const result = await mockIpcMain._invoke<{
        response: ApiResponse
        testResults: ApiTestResult[]
      }>('api:execute', {
        method: 'GET',
        url: `http://127.0.0.1:${serverPort}/resource`,
        headers: [],
        body: '',
        bodyType: 'none',
        variables: {},
        tests: undefined as unknown as [],
      })

      expect(result.response.status).toBe(201)
      expect(result.testResults).toHaveLength(0)
    })
  })
})
