import { IpcMain, dialog } from 'electron'
import http from 'http'
import https from 'https'
import { URL } from 'url'
import fs from 'fs'
import path from 'path'
import {
  IPC_CHANNELS,
  ApiResponse,
  ApiTestResult,
  ApiTestAssertion,
  ApiTestFile,
  HttpMethod,
  ApiHeader,
} from '../../shared/types'

/**
 * Substitute {{variable}} patterns in text with values from the variables map.
 */
function substituteVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}

/**
 * Run test assertions against a response.
 */
function runAssertions(
  assertions: ApiTestAssertion[],
  response: ApiResponse,
): ApiTestResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'status': {
        const expectedStatus = parseInt(assertion.expected, 10)
        return {
          assertion,
          passed: response.status === expectedStatus,
          actual: String(response.status),
        }
      }
      case 'body_contains': {
        const contains = response.body.includes(assertion.expected)
        return {
          assertion,
          passed: contains,
          actual: contains ? 'Found' : 'Not found',
        }
      }
      case 'header_contains': {
        const headerValues = Object.values(response.headers)
        const found = headerValues.some((v) => v.includes(assertion.expected))
        return {
          assertion,
          passed: found,
          actual: found ? 'Found' : 'Not found in headers',
        }
      }
      case 'json_path': {
        try {
          const parts = assertion.expected.split('=')
          const jsonPath = parts[0]!.trim()
          const expectedValue = parts.length > 1 ? parts.slice(1).join('=').trim() : undefined
          const parsed = JSON.parse(response.body)
          const segments = jsonPath.split('.')
          let current: unknown = parsed
          for (const seg of segments) {
            if (current == null || typeof current !== 'object') {
              current = undefined
              break
            }
            current = (current as Record<string, unknown>)[seg]
          }
          const actualStr = current === undefined ? 'undefined' : JSON.stringify(current)
          if (expectedValue !== undefined) {
            const passed = actualStr === expectedValue || String(current) === expectedValue
            return { assertion, passed, actual: actualStr }
          }
          return {
            assertion,
            passed: current !== undefined,
            actual: actualStr,
          }
        } catch {
          return { assertion, passed: false, actual: 'Invalid JSON or path' }
        }
      }
      case 'response_time': {
        const maxTime = parseInt(assertion.expected, 10)
        return {
          assertion,
          passed: response.time < maxTime,
          actual: `${response.time}ms`,
        }
      }
      default:
        return { assertion, passed: false, actual: 'Unknown assertion type' }
    }
  })
}

/**
 * Execute an HTTP request using Node's built-in http/https modules.
 */
function executeRequest(
  method: HttpMethod,
  url: string,
  headers: ApiHeader[],
  body: string,
  variables: Record<string, string>,
): Promise<{ response: ApiResponse; testResults: ApiTestResult[] }> {
  const resolvedUrl = substituteVariables(url, variables)
  const resolvedBody = substituteVariables(body, variables)
  const resolvedHeaders: Record<string, string> = {}
  for (const h of headers) {
    if (h.enabled) {
      resolvedHeaders[substituteVariables(h.key, variables)] =
        substituteVariables(h.value, variables)
    }
  }

  return new Promise((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(resolvedUrl)
    } catch {
      reject(new Error(`Invalid URL: ${resolvedUrl}`))
      return
    }

    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? https : http

    const options: http.RequestOptions = {
      method,
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
        const endTime = Date.now()
        const bodyBuffer = Buffer.concat(chunks)
        const bodyStr = bodyBuffer.toString('utf-8')
        const responseHeaders: Record<string, string> = {}
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) {
            responseHeaders[key] = Array.isArray(val) ? val.join(', ') : val
          }
        }

        const response: ApiResponse = {
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          headers: responseHeaders,
          body: bodyStr,
          time: endTime - startTime,
          size: bodyBuffer.length,
        }

        resolve({ response, testResults: [] })
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })

    if (body && method !== 'GET' && method !== 'HEAD') {
      req.write(resolvedBody)
    }

    req.end()
  })
}

/**
 * Get the default empty API test file structure.
 */
function defaultApiTestFile(): ApiTestFile {
  return {
    version: 1,
    environments: [],
    collections: [],
    chains: [],
    healthChecks: [],
  }
}

/**
 * Get the path to the API tests file for a project.
 */
function getApiTestsPath(projectPath: string): string {
  return path.join(projectPath, '.kanbai', 'api-tests.json')
}

export function registerApiHandlers(ipcMain: IpcMain): void {
  // Execute an API request
  ipcMain.handle(
    IPC_CHANNELS.API_EXECUTE,
    async (
      _event,
      {
        method,
        url,
        headers,
        body,
        bodyType,
        variables,
        tests,
      }: {
        method: HttpMethod
        url: string
        headers: ApiHeader[]
        body: string
        bodyType: string
        variables: Record<string, string>
        tests: ApiTestAssertion[]
      },
    ) => {
      try {
        // Add content-type header if not present and body type warrants it
        const hasContentType = headers.some(
          (h) => h.enabled && h.key.toLowerCase() === 'content-type',
        )
        const effectiveHeaders = [...headers]
        if (!hasContentType && bodyType === 'json' && body) {
          effectiveHeaders.push({ key: 'Content-Type', value: 'application/json', enabled: true })
        } else if (!hasContentType && bodyType === 'form' && body) {
          effectiveHeaders.push({
            key: 'Content-Type',
            value: 'application/x-www-form-urlencoded',
            enabled: true,
          })
        } else if (!hasContentType && bodyType === 'text' && body) {
          effectiveHeaders.push({ key: 'Content-Type', value: 'text/plain', enabled: true })
        }

        const { response } = await executeRequest(method, url, effectiveHeaders, body, variables)
        const testResults = runAssertions(tests || [], response)
        return { response, testResults }
      } catch (err) {
        return {
          response: {
            status: 0,
            statusText: String(err),
            headers: {},
            body: String(err),
            time: 0,
            size: 0,
          } as ApiResponse,
          testResults: [],
          error: String(err),
        }
      }
    },
  )

  // Load API tests from project
  ipcMain.handle(
    IPC_CHANNELS.API_LOAD,
    async (_event, { projectPath }: { projectPath: string }) => {
      const filePath = getApiTestsPath(projectPath)
      if (!fs.existsSync(filePath)) {
        return defaultApiTestFile()
      }
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw) as ApiTestFile
      } catch {
        return defaultApiTestFile()
      }
    },
  )

  // Save API tests to project
  ipcMain.handle(
    IPC_CHANNELS.API_SAVE,
    async (_event, { projectPath, data }: { projectPath: string; data: ApiTestFile }) => {
      const dirPath = path.join(projectPath, '.kanbai')
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
      const filePath = getApiTestsPath(projectPath)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Export API tests via save dialog
  ipcMain.handle(
    IPC_CHANNELS.API_EXPORT,
    async (_event, { data }: { data: ApiTestFile }) => {
      const result = await dialog.showSaveDialog({
        title: 'Export API Tests',
        defaultPath: 'api-tests.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) {
        return { success: false }
      }
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Import API tests via open dialog
  ipcMain.handle(IPC_CHANNELS.API_IMPORT, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import API Tests',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, data: null }
    }
    try {
      const raw = fs.readFileSync(result.filePaths[0]!, 'utf-8')
      const data = JSON.parse(raw) as ApiTestFile
      return { success: true, data }
    } catch (err) {
      return { success: false, data: null, error: String(err) }
    }
  })
}
