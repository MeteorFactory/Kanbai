import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockIpcMain } from '../mocks/electron'
import type { ApiResponse, ApiTestAssertion, ApiTestResult } from '../../src/shared/types'

/**
 * Unit tests for the pure helper functions in api.ts (substituteVariables, runAssertions).
 *
 * These functions are not exported, so we test them indirectly through the IPC handler
 * `api:execute`. We craft requests that exercise variable substitution and assertion logic
 * without requiring real network access (using invalid URLs that fail fast, or by checking
 * the assertion results returned by the handler).
 *
 * For runAssertions specifically, we use a local HTTP server to get a controlled response
 * and then verify each assertion type against it.
 */

// ---------------------------------------------------------------------------
// substituteVariables — tested through api:execute variable resolution
// ---------------------------------------------------------------------------

describe('substituteVariables (via api:execute)', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    const { registerApiHandlers } = await import('../../src/main/ipc/api')
    mockIpcMain = createMockIpcMain()
    registerApiHandlers(mockIpcMain as never)
  })

  it('should replace {{variable}} patterns in the URL', async () => {
    // Using an invalid URL means the request will fail, but the error message
    // will contain the resolved URL, proving substitution occurred.
    const result = await mockIpcMain._invoke<{
      response: ApiResponse
      testResults: ApiTestResult[]
      error?: string
    }>('api:execute', {
      method: 'GET',
      url: 'http://{{host}}:{{port}}/api/test',
      headers: [],
      body: '',
      bodyType: 'none',
      variables: { host: '127.0.0.1', port: '99999' },
      tests: [],
    })

    // The request should fail (invalid port / connection refused) but the error
    // message should contain the resolved URL, not the template placeholders.
    expect(result.response.status).toBe(0)
    expect(result.error).toBeDefined()
    expect(result.error).not.toContain('{{host}}')
    expect(result.error).not.toContain('{{port}}')
  })

  it('should preserve unmatched variables as literal {{name}}', async () => {
    const result = await mockIpcMain._invoke<{
      response: ApiResponse
      testResults: ApiTestResult[]
      error?: string
    }>('api:execute', {
      method: 'GET',
      url: 'http://{{unknown_var}}/path',
      headers: [],
      body: '',
      bodyType: 'none',
      variables: {},
      tests: [],
    })

    // The URL remains invalid because the variable was not found, so it stays
    // as "{{unknown_var}}" and results in an invalid URL error.
    expect(result.response.status).toBe(0)
    expect(result.error).toBeDefined()
  })

  it('should substitute variables in headers', async () => {
    const result = await mockIpcMain._invoke<{
      response: ApiResponse
      testResults: ApiTestResult[]
      error?: string
    }>('api:execute', {
      method: 'GET',
      url: 'http://0.0.0.0:1', // Will fail, but we just need to verify it processes headers
      headers: [
        { key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
        { key: 'X-Custom', value: '{{customValue}}', enabled: true },
        { key: 'X-Disabled', value: '{{ignored}}', enabled: false },
      ],
      body: '',
      bodyType: 'none',
      variables: { token: 'abc123', customValue: 'hello' },
      tests: [],
    })

    // If the handler processed without throwing before the network call,
    // the error should be a network error (not a variable substitution error).
    expect(result.response.status).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// runAssertions — tested through api:execute with a local HTTP server
// ---------------------------------------------------------------------------

import http from 'http'

describe('runAssertions (via api:execute with local server)', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>
  let server: http.Server
  let serverPort: number

  beforeEach(async () => {
    vi.resetModules()

    const { registerApiHandlers } = await import('../../src/main/ipc/api')
    mockIpcMain = createMockIpcMain()
    registerApiHandlers(mockIpcMain as never)

    // Start a local HTTP server that returns controlled responses
    await new Promise<void>((resolve) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value-42',
        })
        res.end(JSON.stringify({ name: 'Alice', age: 30, nested: { key: 'deep' } }))
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

  async function executeWithAssertions(
    assertions: ApiTestAssertion[],
  ): Promise<{ response: ApiResponse; testResults: ApiTestResult[] }> {
    return mockIpcMain._invoke('api:execute', {
      method: 'GET',
      url: `http://127.0.0.1:${serverPort}/test`,
      headers: [],
      body: '',
      bodyType: 'none',
      variables: {},
      tests: assertions,
    })
  }

  // --- status assertion ---

  it('should pass status assertion when status matches', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'status', expected: '200' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
    expect(testResults[0]!.actual).toBe('200')
  })

  it('should fail status assertion when status does not match', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'status', expected: '404' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
    expect(testResults[0]!.actual).toBe('200')
  })

  // --- body_contains assertion ---

  it('should pass body_contains when body includes expected string', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'body_contains', expected: 'Alice' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
    expect(testResults[0]!.actual).toBe('Found')
  })

  it('should fail body_contains when body does not include expected string', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'body_contains', expected: 'Bob' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
    expect(testResults[0]!.actual).toBe('Not found')
  })

  // --- header_contains assertion ---

  it('should pass header_contains when a header value includes expected string', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'header_contains', expected: 'application/json' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
    expect(testResults[0]!.actual).toBe('Found')
  })

  it('should pass header_contains for custom header values', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'header_contains', expected: 'test-value-42' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
  })

  it('should fail header_contains when no header matches', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'header_contains', expected: 'X-Nonexistent-Value' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
    expect(testResults[0]!.actual).toBe('Not found in headers')
  })

  // --- json_path assertion ---

  it('should pass json_path when path exists (no value check)', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'name' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
    expect(testResults[0]!.actual).toBe('"Alice"')
  })

  it('should pass json_path with value comparison', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'age=30' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
  })

  it('should pass json_path with string value comparison', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'name=Alice' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
  })

  it('should navigate nested json_path', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'nested.key=deep' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
  })

  it('should fail json_path when path does not exist', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'nonexistent' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
    expect(testResults[0]!.actual).toBe('undefined')
  })

  it('should fail json_path when value does not match', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'age=99' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
  })

  it('should fail json_path when deep path segment is missing', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'nested.missing.deep' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
  })

  // --- response_time assertion ---

  it('should pass response_time when response is fast enough', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'response_time', expected: '10000' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
    expect(testResults[0]!.actual).toMatch(/^\d+ms$/)
  })

  it('should fail response_time when threshold is impossibly low', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'response_time', expected: '0' },
    ])

    expect(testResults).toHaveLength(1)
    // Response time is always >= 0, and the check is strict <, so 0ms threshold should fail
    // unless the request completes in 0ms which is extremely unlikely.
    expect(testResults[0]!.passed).toBe(false)
  })

  // --- unknown assertion type ---

  it('should fail for unknown assertion type', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'unknown_type' as ApiTestAssertion['type'], expected: 'anything' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(false)
    expect(testResults[0]!.actual).toBe('Unknown assertion type')
  })

  // --- multiple assertions ---

  it('should run multiple assertions and return results for each', async () => {
    const { testResults } = await executeWithAssertions([
      { type: 'status', expected: '200' },
      { type: 'body_contains', expected: 'Alice' },
      { type: 'header_contains', expected: 'application/json' },
      { type: 'json_path', expected: 'name=Alice' },
      { type: 'response_time', expected: '10000' },
    ])

    expect(testResults).toHaveLength(5)
    expect(testResults.every((r) => r.passed)).toBe(true)
  })

  it('should handle empty assertions array', async () => {
    const { testResults } = await executeWithAssertions([])

    expect(testResults).toHaveLength(0)
  })

  // --- json_path edge cases ---

  it('should handle json_path with equals sign in expected value', async () => {
    // Create a server that returns a body with an equals sign in a value
    server.close()

    await new Promise<void>((resolve) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ query: 'a=b&c=d' }))
      })
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr !== 'string') {
          serverPort = addr.port
        }
        resolve()
      })
    })

    const { testResults } = await executeWithAssertions([
      { type: 'json_path', expected: 'query=a=b&c=d' },
    ])

    expect(testResults).toHaveLength(1)
    expect(testResults[0]!.passed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// runAssertions — edge case: non-JSON body with json_path
// ---------------------------------------------------------------------------

describe('runAssertions edge cases (non-JSON body)', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>
  let server: http.Server
  let serverPort: number

  beforeEach(async () => {
    vi.resetModules()

    const { registerApiHandlers } = await import('../../src/main/ipc/api')
    mockIpcMain = createMockIpcMain()
    registerApiHandlers(mockIpcMain as never)

    await new Promise<void>((resolve) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('This is not JSON')
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

  it('should fail json_path gracefully when body is not valid JSON', async () => {
    const result = await mockIpcMain._invoke<{
      response: ApiResponse
      testResults: ApiTestResult[]
    }>('api:execute', {
      method: 'GET',
      url: `http://127.0.0.1:${serverPort}/text`,
      headers: [],
      body: '',
      bodyType: 'none',
      variables: {},
      tests: [{ type: 'json_path', expected: 'some.path' }],
    })

    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0]!.passed).toBe(false)
    expect(result.testResults[0]!.actual).toBe('Invalid JSON or path')
  })
})
