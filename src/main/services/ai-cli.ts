import { type ChildProcess } from 'child_process'
import type { AiProviderId } from '../../shared/types/ai-provider'
import { AI_PROVIDERS } from '../../shared/types/ai-provider'
import { crossSpawn } from '../../shared/platform'

/**
 * Call an AI CLI provider with a prompt and return the output.
 * For Claude: uses `-p --model claude-haiku-4-5-20251001 --output-format json`
 * For Codex: uses `exec --full-auto --json` with prompt on stdin
 * Pipes prompt via stdin to avoid CLI argument length limits.
 */
export function callAiCli(
  provider: AiProviderId,
  prompt: string,
  processKey: string,
  activeProcesses: Map<string, ChildProcess>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Cancel any existing query for this key
    const existing = activeProcesses.get(processKey)
    if (existing) {
      existing.kill('SIGTERM')
      activeProcesses.delete(processKey)
    }

    const config = AI_PROVIDERS[provider]
    const env = { ...process.env }

    // Strip env vars that could interfere
    for (const envVar of config.envVarsToUnset) {
      delete env[envVar]
    }
    env.KANBAI_NL_QUERY = '1'

    const proc = crossSpawn(config.cliCommand, config.nlQueryArgs, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    activeProcesses.set(processKey, proc)

    proc.stdin?.write(prompt)
    proc.stdin?.end()

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      activeProcesses.delete(processKey)
      reject(new Error(`Failed to spawn ${config.displayName} CLI: ${err.message}`))
    })

    proc.on('exit', (code, signal) => {
      activeProcesses.delete(processKey)
      if (signal === 'SIGTERM') {
        reject(new Error('cancelled'))
      } else if (code === 0) {
        // Parse output - Claude wraps in { result: "..." }, Codex returns directly
        if (provider === 'claude') {
          try {
            const wrapper = JSON.parse(stdout)
            resolve(typeof wrapper.result === 'string' ? wrapper.result.trim() : stdout.trim())
          } catch {
            resolve(stdout.trim())
          }
        } else if (provider === 'codex') {
          // Codex returns JSONL events — extract the agent_message text
          const lines = stdout.trim().split('\n')
          let agentMessage = ''
          for (const line of lines) {
            try {
              const event = JSON.parse(line)
              if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
                agentMessage = event.item.text
              }
            } catch {
              // Skip non-JSON lines
            }
          }
          resolve(agentMessage || stdout.trim())
        } else if (provider === 'copilot') {
          // Copilot returns JSON output — extract the result
          try {
            const parsed = JSON.parse(stdout)
            resolve(typeof parsed.result === 'string' ? parsed.result.trim() : stdout.trim())
          } catch {
            resolve(stdout.trim())
          }
        } else {
          resolve(stdout.trim())
        }
      } else {
        reject(new Error(stderr.trim() || `${config.displayName} CLI exited with code ${code}`))
      }
    })

    setTimeout(() => {
      if (activeProcesses.has(processKey)) {
        proc.kill('SIGTERM')
        activeProcesses.delete(processKey)
        reject(new Error(`${config.displayName} CLI timed out after 120s`))
      }
    }, 120000)
  })
}
