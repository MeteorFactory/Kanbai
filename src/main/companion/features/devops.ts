import fs from 'fs'
import path from 'path'
import type { DevOpsFile } from '../../../shared/types'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

function loadDevOpsFile(projectPath: string): DevOpsFile {
  const filePath = path.join(projectPath, '.kanbai', 'devops.json')
  if (!fs.existsSync(filePath)) return { version: 1, connections: [] }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DevOpsFile
  } catch {
    return { version: 1, connections: [] }
  }
}

export const devopsFeature: CompanionFeature = {
  id: 'devops',
  name: 'DevOps',
  workspaceScoped: false,
  projectScoped: true,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    if (!ctx.projectPath) return { success: false, error: 'Project path required' }
    const data = loadDevOpsFile(ctx.projectPath)
    return {
      success: true,
      data: data.connections.map((c) => ({
        id: c.id,
        name: c.name,
        organizationUrl: c.organizationUrl,
        projectName: c.projectName,
      })),
    }
  },

  getCommands(): CompanionCommandDef[] {
    return []
  },

  async execute(command: string, _params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    return { success: false, error: `Unknown command: ${command}` }
  },
}
