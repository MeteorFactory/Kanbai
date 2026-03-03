#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolveWorkspaceContext } from './lib/context.js'
import { registerKanbanTools } from './tools/kanban.js'
import { registerAnalysisTools } from './tools/analysis.js'
import { registerProjectTools } from './tools/project.js'

const ctx = resolveWorkspaceContext()

const server = new McpServer({
  name: 'kanbai',
  version: '1.0.0',
})

registerKanbanTools(server, ctx)
registerAnalysisTools(server, ctx)
registerProjectTools(server, ctx)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err}\n`)
  process.exit(1)
})
