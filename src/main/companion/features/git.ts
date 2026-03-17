import { execFileSync } from 'child_process'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

function execGit(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

export const gitFeature: CompanionFeature = {
  id: 'git',
  name: 'Git',
  workspaceScoped: false,
  projectScoped: true,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    if (!ctx.projectPath) return { success: false, error: 'Project path required' }
    try {
      const branch = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], ctx.projectPath)
      const statusRaw = execGit(['status', '--porcelain'], ctx.projectPath)
      const changedFiles = statusRaw ? statusRaw.split('\n').length : 0
      const hasUncommittedChanges = changedFiles > 0

      return {
        success: true,
        data: { branch, changedFiles, hasUncommittedChanges },
      }
    } catch (err) {
      return { success: false, error: `Git error: ${err instanceof Error ? err.message : String(err)}` }
    }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'status',
        description: 'Get detailed git status',
        params: {},
      },
      {
        name: 'branches',
        description: 'List branches',
        params: {},
      },
      {
        name: 'log',
        description: 'Get recent commit log',
        params: {
          limit: { type: 'number', required: false, description: 'Number of commits (default 20)' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, ctx: CompanionContext): Promise<CompanionResult> {
    if (!ctx.projectPath) return { success: false, error: 'Project path required' }

    try {
      if (command === 'status') {
        const statusRaw = execGit(['status', '--porcelain'], ctx.projectPath)
        const lines = statusRaw ? statusRaw.split('\n') : []
        const files = lines.map((line) => ({
          status: line.slice(0, 2).trim(),
          path: line.slice(3),
        }))
        return { success: true, data: { files } }
      }

      if (command === 'branches') {
        const current = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], ctx.projectPath)
        const branchesRaw = execGit(['branch', '--format=%(refname:short)'], ctx.projectPath)
        const branches = branchesRaw ? branchesRaw.split('\n').filter(Boolean) : []
        return { success: true, data: { current, branches } }
      }

      if (command === 'log') {
        const limit = Math.min(Number(params.limit) || 20, 100)
        const logRaw = execGit(
          ['log', `--max-count=${limit}`, '--format=%H|%an|%ae|%at|%s'],
          ctx.projectPath,
        )
        const entries = logRaw
          ? logRaw.split('\n').filter(Boolean).map((line) => {
              const [hash, author, email, timestamp, ...messageParts] = line.split('|')
              return {
                hash,
                author,
                email,
                date: new Date(Number(timestamp) * 1000).toISOString(),
                message: messageParts.join('|'),
              }
            })
          : []
        return { success: true, data: entries }
      }

      return { success: false, error: `Unknown command: ${command}` }
    } catch (err) {
      return { success: false, error: `Git error: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
