import fs from 'fs'
import path from 'path'
import os from 'os'
import type { DbFile } from '../../../shared/types'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

const DB_DIR = path.join(os.homedir(), '.kanbai', 'databases')

function loadDbFile(workspaceId: string): DbFile {
  const filePath = path.join(DB_DIR, `${workspaceId}.json`)
  if (!fs.existsSync(filePath)) return { version: 1, connections: [] }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DbFile
  } catch {
    return { version: 1, connections: [] }
  }
}

export const databaseFeature: CompanionFeature = {
  id: 'database',
  name: 'Database Explorer',
  workspaceScoped: true,
  projectScoped: false,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    const dbFile = loadDbFile(ctx.workspaceId)
    return {
      success: true,
      data: dbFile.connections.map((c) => ({
        id: c.id,
        name: c.name,
        engine: c.engine,
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
