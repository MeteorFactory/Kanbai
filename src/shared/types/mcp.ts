// MCP Server types

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpHelpResult {
  success: boolean
  output: string
  error?: string
}

export type McpCategory = 'filesystem' | 'database' | 'web' | 'ai' | 'devtools' | 'cloud' | 'communication' | 'utilities' | 'design'

export interface McpCatalogEntry {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  env?: Record<string, string>
  envPlaceholders?: Record<string, string>
  argsPlaceholders?: Record<string, string>
  category: McpCategory
  features: string[]
  official: boolean
}
