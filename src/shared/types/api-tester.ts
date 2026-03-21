// API Tester types

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export interface ApiEnvironment {
  id: string
  name: string
  variables: Record<string, string>
  isActive?: boolean
}

export interface ApiHeader {
  key: string
  value: string
  enabled: boolean
}

export interface ApiTestAssertion {
  type: 'status' | 'body_contains' | 'header_contains' | 'json_path' | 'response_time'
  expected: string
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: ApiHeader[]
  body: string
  bodyType: 'json' | 'form' | 'text' | 'none'
  tests: ApiTestAssertion[]
}

export interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  time: number
  size: number
}

export interface ApiTestResult {
  assertion: ApiTestAssertion
  passed: boolean
  actual: string
}

export interface ApiCollection {
  id: string
  name: string
  requests: ApiRequest[]
}

export interface ApiChainStep {
  requestId: string
  extractVariables: Array<{ name: string; from: 'body' | 'header'; path: string }>
  delay?: number
}

export interface ApiChain {
  id: string
  name: string
  steps: ApiChainStep[]
}

export interface ApiTestFile {
  version: 1
  environments: ApiEnvironment[]
  collections: ApiCollection[]
  chains: ApiChain[]
  healthChecks: HealthCheck[]
}

export interface HealthCheck {
  id: string
  name: string
  url: string
  method: 'GET' | 'HEAD'
  expectedStatus: number
  headers: ApiHeader[]
  lastResult?: HealthCheckResult
}

export interface HealthCheckResult {
  status: number
  responseTime: number
  success: boolean
  timestamp: number
  error?: string
}
