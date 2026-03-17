import fs from 'fs'
import path from 'path'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

interface DetectedManager {
  manager: string
  packageCount: number
}

function detectManagers(projectPath: string): DetectedManager[] {
  const results: DetectedManager[] = []
  if (!fs.existsSync(projectPath)) return results

  // npm — package.json
  const packageJsonPath = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const depCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length
      results.push({ manager: 'npm', packageCount: depCount })
    } catch { /* skip */ }
  }

  // pip — requirements.txt
  const requirementsPath = path.join(projectPath, 'requirements.txt')
  if (fs.existsSync(requirementsPath)) {
    try {
      const lines = fs.readFileSync(requirementsPath, 'utf-8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      results.push({ manager: 'pip', packageCount: lines.length })
    } catch { /* skip */ }
  }

  // cargo — Cargo.toml
  const cargoPath = path.join(projectPath, 'Cargo.toml')
  if (fs.existsSync(cargoPath)) {
    results.push({ manager: 'cargo', packageCount: 0 })
  }

  // nuget — *.csproj
  const csprojFiles = fs.readdirSync(projectPath).filter((f) => f.endsWith('.csproj'))
  if (csprojFiles.length > 0) {
    results.push({ manager: 'nuget', packageCount: 0 })
  }

  return results
}

export const packagesFeature: CompanionFeature = {
  id: 'packages',
  name: 'Packages',
  workspaceScoped: false,
  projectScoped: true,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    if (!ctx.projectPath) return { success: false, error: 'Project path required' }
    const managers = detectManagers(ctx.projectPath)
    return { success: true, data: managers }
  },

  getCommands(): CompanionCommandDef[] {
    return []
  },

  async execute(command: string, _params: Record<string, unknown>, _ctx: CompanionContext): Promise<CompanionResult> {
    return { success: false, error: `Unknown command: ${command}` }
  },
}
