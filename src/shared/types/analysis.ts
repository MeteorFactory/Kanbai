// Code Analysis types

export type AnalysisSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AnalysisToolCategory = 'security' | 'quality' | 'dependencies' | 'infrastructure'

export interface AnalysisToolDef {
  id: string
  name: string
  command: string
  category: AnalysisToolCategory
  description: string
  languages: string[]
  installed: boolean
  jsonFlag: string
}

export interface AnalysisFinding {
  id: string
  tool: string
  file: string
  line: number
  column?: number
  endLine?: number
  endColumn?: number
  severity: AnalysisSeverity
  message: string
  rule?: string
  ruleUrl?: string
  snippet?: string
  cwe?: string
}

export interface AnalysisReport {
  id: string
  projectPath: string
  toolId: string
  toolName: string
  timestamp: number
  duration: number
  findings: AnalysisFinding[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
  }
  error?: string
}

export interface AnalysisRunOptions {
  projectPath: string
  toolId: string
  extraArgs?: string[]
}

export interface AnalysisTicketRequest {
  findingIds: string[]
  reportId: string
  workspaceId: string
  targetProjectId?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  groupBy: 'individual' | 'file' | 'rule' | 'severity'
}

export interface AnalysisProgress {
  toolId: string
  status: 'running' | 'done' | 'error'
  message?: string
}
