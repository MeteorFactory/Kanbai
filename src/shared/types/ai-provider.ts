export type AiProviderId = 'claude' | 'codex' | 'copilot' | 'gemini'

export interface AiProviderConfig {
  id: AiProviderId
  displayName: string
  cliCommand: string
  npmPackage: string
  configDir: string
  detectionColor: string
  interactiveArgs: string[]
  nonInteractiveArgs: string[]
  nlQueryArgs: string[]
  envVarsToUnset: string[]
  versionStripPattern: RegExp
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderConfig> = {
  claude: {
    id: 'claude',
    displayName: 'Claude',
    cliCommand: 'claude',
    npmPackage: '@anthropic-ai/claude-code',
    configDir: '.claude',
    detectionColor: '#D4A574',
    interactiveArgs: ['--dangerously-skip-permissions'],
    nonInteractiveArgs: ['--dangerously-skip-permissions', '--print'],
    nlQueryArgs: ['-p', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'json'],
    envVarsToUnset: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'],
    versionStripPattern: /^Claude Code /,
  },
  codex: {
    id: 'codex',
    displayName: 'Codex',
    cliCommand: 'codex',
    npmPackage: '@openai/codex',
    configDir: '.codex',
    detectionColor: '#10a37f',
    interactiveArgs: ['--full-auto'],
    nonInteractiveArgs: ['exec', '--full-auto'],
    nlQueryArgs: ['exec', '--full-auto', '--json'],
    envVarsToUnset: [],
    versionStripPattern: /^codex\s+/i,
  },
  copilot: {
    id: 'copilot',
    displayName: 'Copilot',
    cliCommand: 'copilot',
    npmPackage: '@github/copilot',
    configDir: '.copilot',
    detectionColor: '#e2538a',
    interactiveArgs: ['-i'],
    nonInteractiveArgs: ['-p'],
    nlQueryArgs: ['-p', '--output-format', 'json'],
    envVarsToUnset: [],
    versionStripPattern: /^copilot\s+/i,
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini',
    cliCommand: 'gemini',
    npmPackage: '@google/gemini-cli',
    configDir: '.gemini',
    detectionColor: '#4285F4',
    interactiveArgs: ['--yolo'],
    nonInteractiveArgs: ['--yolo'],
    nlQueryArgs: ['--output-format', 'json'],
    envVarsToUnset: ['GEMINI_CLI'],
    versionStripPattern: /^Gemini CLI\s+/i,
  },
}

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[]
