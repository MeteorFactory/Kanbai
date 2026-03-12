/**
 * Cross-platform utility module.
 * Centralizes all platform-specific logic (shell, sound, paths, commands).
 */

import type { ChildProcess, SpawnOptions } from 'child_process'

export const IS_MAC = process.platform === 'darwin'
export const IS_WIN = process.platform === 'win32'
export const PATH_SEP = IS_WIN ? ';' : ':'

/** Default shell for the current platform */
export function getDefaultShell(): string {
  if (IS_WIN) {
    // Default to PowerShell, not COMSPEC (which is cmd.exe on most systems)
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

/** Shell arguments for the default shell */
export function getDefaultShellArgs(shell: string): string[] {
  if (IS_WIN) {
    const lower = shell.toLowerCase()
    // PowerShell: -NoLogo for a cleaner startup
    if (lower.includes('powershell') || lower.includes('pwsh')) {
      return ['-NoLogo']
    }
    // Git Bash: --login for PATH setup
    if (lower.includes('bash')) {
      return ['--login']
    }
    return []
  }
  // Keep -l for bash where it's needed for PATH setup
  if (shell.endsWith('/bash')) {
    return ['-l']
  }
  return []
}

/** Command to play a WAV sound file */
export function getPlaySoundCommand(wavPath: string): string {
  if (IS_WIN) {
    return `powershell -c "(New-Object Media.SoundPlayer '${wavPath.replace(/'/g, "''")}').PlaySync()"`
  }
  return `afplay "${wavPath}"`
}

/** Extended tool paths for the current platform (Homebrew / Chocolatey / standard) */
export function getExtendedToolPaths(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (IS_WIN) {
    return [
      'C:\\ProgramData\\chocolatey\\bin',
      `${process.env.APPDATA || ''}\\npm`,
      `${home}\\.cargo\\bin`,
      'C:\\Program Files\\PostgreSQL\\17\\bin',
      'C:\\Program Files\\PostgreSQL\\16\\bin',
      'C:\\Program Files\\PostgreSQL\\15\\bin',
      'C:\\Program Files\\PostgreSQL\\14\\bin',
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
      'C:\\Program Files\\Git\\bin',
    ]
  }
  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${home}/.nvm/versions/node`,
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
    `${home}/go/bin`,
  ]
}

/** Database CLI tool paths for the current platform */
export function getDbToolPaths(): string[] {
  if (IS_WIN) {
    return [
      'C:\\Program Files\\PostgreSQL\\17\\bin',
      'C:\\Program Files\\PostgreSQL\\16\\bin',
      'C:\\Program Files\\PostgreSQL\\15\\bin',
      'C:\\Program Files\\PostgreSQL\\14\\bin',
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
      'C:\\ProgramData\\chocolatey\\bin',
      'C:\\Program Files\\Git\\bin',
    ]
  }
  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/postgresql@17/bin',
    '/opt/homebrew/opt/postgresql@16/bin',
    '/opt/homebrew/opt/postgresql@15/bin',
    '/opt/homebrew/opt/postgresql@14/bin',
    '/opt/homebrew/opt/libpq/bin',
    '/opt/homebrew/opt/mysql/bin',
    '/opt/homebrew/opt/mysql-client/bin',
    '/opt/homebrew/opt/mongodb-database-tools/bin',
    '/opt/homebrew/opt/sqlite/bin',
    '/usr/local/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/usr/local/opt/postgresql@15/bin',
    '/usr/local/opt/postgresql@14/bin',
    '/usr/local/opt/libpq/bin',
    '/usr/local/opt/mysql/bin',
    '/usr/local/opt/mysql-client/bin',
    '/usr/bin',
  ]
}

/** Analysis tool extra paths for the current platform */
export function getAnalysisToolPaths(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (IS_WIN) {
    return [
      'C:\\ProgramData\\chocolatey\\bin',
      `${process.env.APPDATA || ''}\\Python\\Python311\\Scripts`,
      `${process.env.APPDATA || ''}\\Python\\Python312\\Scripts`,
      `${process.env.APPDATA || ''}\\Python\\Python313\\Scripts`,
      `${home}\\.local\\bin`,
    ]
  }
  return [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    `${home}/.local/bin`,
    `${home}/Library/Python/3.11/bin`,
    `${home}/Library/Python/3.12/bin`,
    `${home}/Library/Python/3.13/bin`,
    `${home}/.graudit`,
  ]
}

/** Command to check if a binary exists ('which' on macOS, 'where' on Windows) */
export function getWhichCommand(): string {
  return IS_WIN ? 'where' : 'which'
}

/** Install commands per analysis tool, platform-specific */
export function getInstallCommands(): Record<string, string> {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (IS_WIN) {
    return {
      semgrep: 'pip install semgrep',
      bandit: 'pip install bandit',
      bearer: 'choco install bearer',
      trivy: 'choco install trivy',
      'osv-scanner': 'choco install osv-scanner',
      eslint: 'npm install -g eslint',
      graudit: `git clone https://github.com/wireghoul/graudit.git "${home}\\.graudit" 2>nul || git -C "${home}\\.graudit" pull`,
      checkov: 'pip install checkov',
      pylint: 'pip install pylint',
      cppcheck: 'choco install cppcheck',
      megalinter: 'npm install -g mega-linter-runner',
    }
  }
  return {
    semgrep: 'brew install semgrep',
    bandit: '(command -v pipx >/dev/null 2>&1 || brew install pipx) && pipx install bandit',
    bearer: 'brew install bearer/tap/bearer',
    trivy: 'brew install trivy',
    'osv-scanner': 'brew install osv-scanner',
    eslint: 'npm install -g eslint',
    graudit: 'git clone https://github.com/wireghoul/graudit.git "$HOME/.graudit" 2>/dev/null || git -C "$HOME/.graudit" pull && chmod +x "$HOME/.graudit/graudit"',
    checkov: '(command -v pipx >/dev/null 2>&1 || brew install pipx) && pipx install checkov',
    pylint: '(command -v pipx >/dev/null 2>&1 || brew install pipx) && pipx install pylint',
    cppcheck: 'brew install cppcheck',
    megalinter: 'npm install -g mega-linter-runner',
  }
}

/** Shell and args for executing install commands */
export function getInstallShell(): { command: string; buildArgs: (cmd: string) => string[] } {
  if (IS_WIN) {
    return {
      command: 'cmd',
      buildArgs: (cmd: string) => ['/c', cmd],
    }
  }
  return {
    command: 'sh',
    buildArgs: (cmd: string) => ['-c', cmd],
  }
}

/** Shell-escape a string for the current platform */
export function shellEscape(val: string): string {
  if (IS_WIN) {
    // Windows: wrap in double quotes, escape inner double quotes
    return `"${val.replace(/"/g, '\\"')}"`
  }
  return `'${val.replace(/'/g, "'\\''")}'`
}

/** Kill a child process safely across platforms */
export function killProcess(pid: number, signal?: string): void {
  try {
    if (IS_WIN) {
      // Windows does not support POSIX signals; just kill the process
      process.kill(pid)
    } else {
      process.kill(pid, (signal as NodeJS.Signals) || 'SIGKILL')
    }
  } catch {
    // Process already exited
  }
}

/** Kill a ChildProcess safely across platforms */
export function killChildProcess(child: { kill: (signal?: NodeJS.Signals) => boolean }, signal?: NodeJS.Signals): void {
  try {
    if (IS_WIN) {
      child.kill()
    } else {
      child.kill(signal || 'SIGTERM')
    }
  } catch {
    // Process already exited
  }
}

/** Update commands per tool for the update manager */
export function getUpdateCommands(): Record<string, { command: string; args: string[] }> {
  if (IS_WIN) {
    return {
      node: { command: 'winget', args: ['upgrade', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-source-agreements', '--accept-package-agreements'] },
      npm: { command: 'winget', args: ['upgrade', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-source-agreements', '--accept-package-agreements'] },
      claude: { command: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code@latest'] },
      git: { command: 'winget', args: ['upgrade', '--id', 'Git.Git', '--silent', '--accept-source-agreements', '--accept-package-agreements'] },
      cargo: { command: 'winget', args: ['install', '--id', 'Rustlang.Rustup', '--silent', '--accept-source-agreements', '--accept-package-agreements'] },
      rtk: { command: 'cargo', args: ['install', '--git', 'https://github.com/rtk-ai/rtk'] },
    }
  }
  return {
    node: { command: 'brew', args: ['upgrade', 'node'] },
    npm_brew: { command: 'brew', args: ['upgrade', 'node'] },
    npm: { command: 'npm', args: ['install', '-g', 'npm@latest'] },
    claude: { command: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code@latest'] },
  }
}

/**
 * Check whether a shell path is valid on the current platform.
 *
 * On Windows, bare names like `powershell.exe` or `cmd.exe` are resolved
 * through PATH by the OS but `fs.existsSync` fails on them. We handle
 * this by recognising known Windows shell bare names as always valid,
 * and falling back to `fs.existsSync` for absolute paths.
 */
export function isShellValid(shell: string): boolean {
  if (!shell) return false
  if (IS_WIN) {
    const lower = shell.toLowerCase()
    const knownBareShells = ['powershell.exe', 'cmd.exe', 'pwsh.exe']
    if (knownBareShells.includes(lower)) return true
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require to keep shared module safe for bundlers
  const fs = require('fs') as typeof import('fs')
  return fs.existsSync(shell)
}

/** Available shell options for the current platform */
export interface ShellOption {
  value: string
  label: string
}

export function getAvailableShells(): ShellOption[] {
  if (IS_WIN) {
    return [
      { value: 'powershell.exe', label: 'PowerShell' },
      { value: 'cmd.exe', label: 'Command Prompt' },
      { value: 'C:\\Program Files\\Git\\bin\\bash.exe', label: 'Git Bash' },
      { value: 'pwsh.exe', label: 'PowerShell 7' },
    ]
  }
  return [
    { value: '/bin/zsh', label: 'zsh' },
    { value: '/bin/bash', label: 'bash' },
    { value: '/usr/local/bin/fish', label: 'fish' },
  ]
}

/** Check if the current process is running with elevated privileges (Windows only) */
export function isElevated(): boolean {
  if (!IS_WIN) return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchronous function cannot use dynamic import()
    require('child_process').execFileSync('net', ['session'], {
      stdio: 'ignore',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

/** Options for execWithPath on the current platform */
export function getExecOptions(): { shell: boolean } {
  if (IS_WIN) {
    // Windows needs shell: true for redirections (<, >, |) to work
    return { shell: true }
  }
  return { shell: false }
}

/**
 * Quote a Windows command argument if it contains spaces.
 */
function winQuoteArg(arg: string): string {
  if (/[\s&|<>^]/.test(arg)) return `"${arg}"`
  return arg
}

/**
 * Cross-platform execFile that handles .cmd scripts on Windows.
 *
 * On Windows, tools like npm, claude, pip, etc. are .cmd batch scripts.
 * execFile cannot run them without shell: true. However, Node.js 22+
 * (DEP0190) deprecates passing args separately with shell: true because
 * args are concatenated without escaping — a security risk.
 *
 * This helper solves both issues: on Windows it joins command + args into
 * a single command string and passes no separate args, avoiding DEP0190
 * while still using a shell to resolve .cmd scripts.
 *
 * Uses lazy require() to avoid interfering with vi.mock('child_process') in tests.
 */
export function crossExecFile(
  command: string,
  args: string[],
  options?: { timeout?: number; cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require to avoid interfering with vi.mock('child_process') in tests
  const { execFile } = require('child_process') as typeof import('child_process')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require to avoid interfering with vi.mock('util') in tests
  const { promisify } = require('util') as typeof import('util')
  const execFileAsync = promisify(execFile)

  if (IS_WIN) {
    const fullCommand = [command, ...args.map(winQuoteArg)].join(' ')
    return execFileAsync(fullCommand, [], { ...options, shell: true }) as Promise<{ stdout: string; stderr: string }>
  }
  return execFileAsync(command, args, options) as Promise<{ stdout: string; stderr: string }>
}

/**
 * Cross-platform spawn that handles .cmd scripts on Windows.
 * Same DEP0190 workaround as crossExecFile but for spawn (streaming output).
 *
 * Uses lazy require() to avoid interfering with vi.mock('child_process') in tests.
 */
export function crossSpawn(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawn } = require('child_process') as typeof import('child_process')

  if (IS_WIN) {
    const fullCommand = [command, ...args.map(winQuoteArg)].join(' ')
    return spawn(fullCommand, [], { ...options, shell: true })
  }
  return spawn(command, args, options)
}
