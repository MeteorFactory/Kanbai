import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { IPC_CHANNELS, McpServerConfig, McpHelpResult } from '../../shared/types'

// Allowlist of binary names permitted for MCP server execution.
// Only base binary names are checked (not full paths).
export const ALLOWED_MCP_COMMANDS = new Set([
  'npx',
  'node',
  'uvx',
  'uv',
  'python',
  'python3',
  'docker',
  'bunx',
  'bun',
  'deno',
])

// Allowlist of environment variable names that MCP configs may set.
// Variables not in this list are silently dropped to prevent
// overriding critical process variables (PATH, NODE_OPTIONS, etc.).
export const ALLOWED_MCP_ENV_VARS = new Set([
  'ANTHROPIC_API_KEY',
  'BRAVE_API_KEY',
  'DATABASE_URL',
  'POSTGRES_CONNECTION_STRING',
  'REDIS_URL',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'GITLAB_PERSONAL_ACCESS_TOKEN',
  'GITLAB_API_URL',
  'SENTRY_AUTH_TOKEN',
  'GOOGLE_MAPS_API_KEY',
  'SLACK_BOT_TOKEN',
  'SLACK_TEAM_ID',
  'OPENAI_API_KEY',
  'CLAUDE_API_KEY',
  'API_KEY',
  'NODE_ENV',
])

function extractBinaryName(command: string): string {
  // Extract the base binary name from a potentially full path
  // e.g. "/usr/local/bin/npx" -> "npx"
  const parts = command.split('/')
  return parts[parts.length - 1]
}

function filterAllowedEnv(env: Record<string, string> | undefined): Record<string, string> {
  if (!env) return {}
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (ALLOWED_MCP_ENV_VARS.has(key)) {
      filtered[key] = value
    }
  }
  return filtered
}

export function registerMcpHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.MCP_GET_HELP,
    async (_event, { name, config }: { name: string; config: McpServerConfig }): Promise<McpHelpResult> => {
      const binaryName = extractBinaryName(config.command)

      if (!ALLOWED_MCP_COMMANDS.has(binaryName)) {
        return {
          success: false,
          output: '',
          error: `Command "${binaryName}" is not in the allowed MCP commands list`,
        }
      }

      const safeEnv = filterAllowedEnv(config.env)

      return new Promise((resolve) => {
        const args = [...(config.args ?? []), '--help']

        execFile(config.command, args, { timeout: 10_000, env: { ...process.env, ...safeEnv } }, (err, stdout, stderr) => {
          if (err && !stdout && !stderr) {
            resolve({ success: false, output: '', error: err.message })
            return
          }
          // Many CLI tools write help to stderr
          const output = (stdout || '') + (stderr || '')
          resolve({ success: true, output: output || `No help output for "${name}"` })
        })
      })
    },
  )
}
