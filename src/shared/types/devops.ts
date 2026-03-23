// DevOps types

export type DevOpsProvider = 'azure-devops' | 'github'

export type DevOpsAuthMethod = 'pat' | 'oauth2' | 'github-pat' | 'github-app'

export interface DevOpsAuthPat {
  method: 'pat'
  token: string
}

export interface DevOpsAuthOAuth2 {
  method: 'oauth2'
  clientId: string
  clientSecret: string
  tenantId: string
}

export interface GitHubAuthPat {
  method: 'github-pat'
  token: string
}

export interface GitHubAuthApp {
  method: 'github-app'
  appId: string
  installationId: string
  privateKey: string
}

export type DevOpsAuth = DevOpsAuthPat | DevOpsAuthOAuth2 | GitHubAuthPat | GitHubAuthApp

export interface DevOpsConnection {
  id: string
  name: string
  provider?: DevOpsProvider
  organizationUrl: string
  projectName: string
  auth: DevOpsAuth
  createdAt: number
  updatedAt: number
}

export type PipelineStatus = 'succeeded' | 'failed' | 'canceled' | 'running' | 'notStarted' | 'unknown'

export interface PipelineRun {
  id: number
  name: string
  status: PipelineStatus
  result: string
  startTime: string | null
  finishTime: string | null
  url: string
  sourceBranch: string
  sourceVersion: string
  requestedBy: string
  parameters: Record<string, string>
}

export interface PipelineDefinition {
  id: number
  name: string
  folder: string
  revision: number
  url: string
  latestRun: PipelineRun | null
}

export type StageStatus = 'succeeded' | 'failed' | 'canceled' | 'running' | 'notStarted' | 'pending' | 'unknown'

export interface TimelineIssue {
  type: 'error' | 'warning'
  message: string
}

export interface PipelineStage {
  id: string
  name: string
  order: number
  status: PipelineStatus
  startTime: string | null
  finishTime: string | null
  result: string
  errorCount: number
  warningCount: number
  jobs: PipelineJob[]
}

export interface PipelineTask {
  id: string
  name: string
  status: PipelineStatus
  startTime: string | null
  finishTime: string | null
  result: string
  order: number
  errorCount: number
  warningCount: number
  issues: TimelineIssue[]
  logId: number | null
}

export interface PipelineJob {
  id: string
  name: string
  status: PipelineStatus
  startTime: string | null
  finishTime: string | null
  result: string
  workerName: string
  errorCount: number
  warningCount: number
  issues: TimelineIssue[]
  logId: number | null
  tasks: PipelineTask[]
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'canceled' | 'skipped' | 'undefined'

export interface PipelineApproval {
  id: string
  buildId: number
  status: ApprovalStatus
  createdOn: string
  instructions: string
  minRequiredApprovers: number
  steps: PipelineApprovalStep[]
}

export interface PipelineApprovalStep {
  assignedApprover: string
  status: ApprovalStatus
  comment: string
}

export interface TemplateRepository {
  id: string
  name: string
  url: string
  description: string
  provider: 'github' | 'azure-devops'
}

export const DEFAULT_TEMPLATE_REPOSITORIES: TemplateRepository[] = [
  {
    id: 'meteorfactory-pipelines',
    name: 'Pipelines',
    url: 'https://github.com/MeteorFactory/Pipelines',
    description: 'MeteorFactory reusable workflow templates with Azure Key Vault integration',
    provider: 'github',
  },
]

export interface DevOpsFile {
  version: 1
  connections: DevOpsConnection[]
  pipelineOrder?: Record<string, number[]>
  templateRepositories?: TemplateRepository[]
}
