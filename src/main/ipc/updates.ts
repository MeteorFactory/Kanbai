import { IpcMain, BrowserWindow, app } from 'electron'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { IPC_CHANNELS, UpdateInfo } from '../../shared/types'
import { IS_WIN, getWhichCommand, getExtendedToolPaths, PATH_SEP, crossExecFile, refreshWindowsPath, addToWindowsUserPath } from '../../shared/platform'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function resolveNvmBinPaths(): string[] {
  const home = process.env.HOME || ''
  const nvmDir = path.join(home, '.nvm', 'versions', 'node')
  try {
    const versions = fsSync.readdirSync(nvmDir)
      .filter((d) => d.startsWith('v'))
      .sort()
      .reverse()
    return versions.slice(0, 2).map((v) => path.join(nvmDir, v, 'bin'))
  } catch {
    return []
  }
}

function enrichedEnv(): NodeJS.ProcessEnv {
  const extraPaths = [...getExtendedToolPaths(), ...resolveNvmBinPaths()]
  return {
    ...process.env,
    PATH: `${process.env.PATH || ''}${PATH_SEP}${extraPaths.join(PATH_SEP)}`,
  }
}

/**
 * Extract a meaningful error message from exec failures.
 * child_process errors include stderr in a separate property that
 * error.message doesn't surface — append it for better diagnostics.
 */
function extractExecErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const execError = error as Error & { stderr?: string; stdout?: string; code?: number | string }
  const stderr = execError.stderr?.trim()
  const stdout = execError.stdout?.trim()

  // error.message is typically "Command failed: <cmd>" — not informative
  // Prefer stderr (actual error output), fall back to stdout, then message.
  // Combine stderr + stdout when both present for tools like winget that mix output streams.
  if (stderr && stdout) return `${stderr}\n${stdout}`
  if (stderr) return stderr
  if (stdout) return stdout
  return error.message
}

/**
 * Winget-specific exit codes that indicate non-error conditions.
 * @see https://github.com/microsoft/winget-cli/blob/master/doc/windows/package-manager/winget/returnCodes.md
 */
const WINGET_EXIT_NO_UPDATE = -1978335189       // 0x8A15002B — No applicable update found
const WINGET_EXIT_ALREADY_INSTALLED = -1978335210 // 0x8A150016 — Package already installed
const WINGET_EXIT_NO_UPDATE_ALT = 0x8A150056    // No newer package version found

/**
 * Execute a winget command with better error handling:
 * - Treats "already installed" and "no update available" as success
 * - Detects admin privilege errors and provides an actionable message
 * - Captures full winget output (stdout + stderr) for diagnostics
 */
async function wingetExec(
  args: string[],
  timeout = 120000,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await enrichedExecFile('winget', args, timeout)
  } catch (error) {
    const execError = error as Error & { stderr?: string; stdout?: string; code?: number | string }
    const exitCode = typeof execError.code === 'number' ? execError.code : null
    const output = [execError.stderr, execError.stdout].filter(Boolean).join('\n').toLowerCase()

    // Treat "already installed" / "no update available" as success
    if (
      exitCode === WINGET_EXIT_NO_UPDATE ||
      exitCode === WINGET_EXIT_ALREADY_INSTALLED ||
      exitCode === WINGET_EXIT_NO_UPDATE_ALT ||
      output.includes('no applicable update') ||
      output.includes('no available upgrade') ||
      output.includes('already installed') ||
      output.includes('no newer package version')
    ) {
      return { stdout: execError.stdout ?? '', stderr: '' }
    }

    // Detect admin privilege errors and provide actionable message
    if (
      output.includes('administrator') ||
      output.includes('elevated') ||
      output.includes('access is denied') ||
      output.includes('0x80070005') ||
      output.includes('requires elevation')
    ) {
      throw new Error(
        'winget requires administrator privileges for this installation. '
        + 'Please open a terminal as administrator and run:\n'
        + `winget ${args.join(' ')}`,
      )
    }

    // Re-throw with better message including full output
    const fullOutput = [execError.stderr?.trim(), execError.stdout?.trim()]
      .filter(Boolean)
      .join('\n')
    if (fullOutput) {
      throw new Error(fullOutput)
    }

    // Last resort: provide the raw command for manual execution
    throw new Error(
      `winget command failed (exit code: ${exitCode ?? 'unknown'}). `
      + 'Try running manually in an administrator terminal:\n'
      + `winget ${args.join(' ')}`,
    )
  }
}

function enrichedExecFile(
  command: string,
  args: string[],
  timeout = 10000,
): Promise<{ stdout: string; stderr: string }> {
  return crossExecFile(command, args, { timeout, env: enrichedEnv() })
}

interface ToolCheck {
  name: string
  checkCommand: string
  checkArgs: string[]
}

const TOOLS_TO_CHECK: ToolCheck[] = [
  // Homebrew — macOS only, prerequisite for many other tools
  ...(!IS_WIN
    ? [
        {
          name: 'brew',
          checkCommand: 'brew',
          checkArgs: ['--version'],
        },
      ]
    : []),
  {
    name: 'node',
    checkCommand: 'node',
    checkArgs: ['--version'],
  },
  {
    name: 'npm',
    checkCommand: 'npm',
    checkArgs: ['--version'],
  },
  {
    name: 'pnpm',
    checkCommand: 'pnpm',
    checkArgs: ['--version'],
  },
  {
    name: 'yarn',
    checkCommand: 'yarn',
    checkArgs: ['--version'],
  },
  {
    name: 'claude',
    checkCommand: 'claude',
    checkArgs: ['--version'],
  },
  {
    name: 'git',
    checkCommand: 'git',
    checkArgs: ['--version'],
  },
  {
    name: 'codex',
    checkCommand: 'codex',
    checkArgs: ['--version'],
  },
  {
    name: 'copilot',
    checkCommand: 'copilot',
    checkArgs: ['--version'],
  },
  {
    name: 'go',
    checkCommand: 'go',
    checkArgs: ['version'],
  },
  {
    name: 'python',
    checkCommand: IS_WIN ? 'python' : 'python3',
    checkArgs: ['--version'],
  },
  {
    name: 'pip',
    checkCommand: IS_WIN ? 'pip' : 'pip3',
    checkArgs: ['--version'],
  },
  {
    name: 'make',
    checkCommand: 'make',
    checkArgs: ['--version'],
  },
  // cargo — Windows only
  ...(IS_WIN
    ? [
        {
          name: 'cargo',
          checkCommand: 'cargo',
          checkArgs: ['--version'],
        },
      ]
    : []),
]

type ToolInstallSource =
  | 'brew-formula'
  | 'brew-cask'
  | 'npm-global'
  | 'winget'
  | 'rustup'
  | 'cargo'
  | 'internal'
  | 'system'
  | 'unknown'

interface ToolMetadata {
  npmPackage?: string
  brewCandidates?: string[]
  canUninstall?: boolean
}

interface BrewPackageMatch extends BrewPackageInfo {
  name: string
}

interface ToolInstallResolution {
  source: ToolInstallSource
  npmPackage?: string
  brew?: BrewPackageMatch
}

const TOOL_METADATA: Record<string, ToolMetadata> = {
  brew: {},
  node: {
    brewCandidates: ['node'],
  },
  npm: {
    npmPackage: 'npm',
    brewCandidates: ['node'],
  },
  pnpm: {
    npmPackage: 'pnpm',
    brewCandidates: ['pnpm'],
  },
  yarn: {
    npmPackage: 'yarn',
    brewCandidates: ['yarn'],
  },
  claude: {
    npmPackage: '@anthropic-ai/claude-code',
    brewCandidates: ['claude-code', 'claude'],
  },
  codex: {
    npmPackage: '@openai/codex',
    brewCandidates: ['codex'],
  },
  copilot: {
    npmPackage: '@github/copilot',
    brewCandidates: ['github-copilot', 'copilot'],
  },
  git: {
    brewCandidates: ['git'],
  },
  go: {
    brewCandidates: ['go'],
  },
  python: {
    brewCandidates: ['python@3.13', 'python@3.12', 'python@3.11', 'python'],
  },
  pip: {
    brewCandidates: ['python@3.13', 'python@3.12', 'python@3.11', 'python'],
  },
  cargo: {
    brewCandidates: ['rustup'],
  },
  make: {
    brewCandidates: ['make'],
  },
  rtk: {
    brewCandidates: ['rtk'],
    canUninstall: true,
  },
  'pixel-agents': {
    canUninstall: true,
  },
}

async function getVersion(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await enrichedExecFile(command, args, 5000)
    const version = (stdout || stderr)
      .trim()
      .replace(/^v/, '')
      .replace(/^git version /, '')
      .replace(/^go version go/, '')
      .replace(/^Python /, '')
      .replace(/^Claude Code /, '')
      .replace(/^Homebrew /, '')
      .replace(/^cargo /, '')
      .replace(/^codex\s+/i, '')
      .replace(/^copilot\s+/i, '')
      .replace(/^GNU Make /, '')
      .replace(/ \(.+\)$/, '')
    if (!version) return null
    return version
  } catch {
    return null
  }
}

function extractVersion(v: string): string {
  const match = v.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1]! : v
}

function compareVersions(current: string, latest: string): boolean {
  const c = extractVersion(current)
  const l = extractVersion(latest)
  if (c === l) return false
  const cParts = c.split('.').map(Number)
  const lParts = l.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((lParts[i] ?? 0) > (cParts[i] ?? 0)) return true
    if ((lParts[i] ?? 0) < (cParts[i] ?? 0)) return false
  }
  return false
}

async function isBrewManaged(command: string): Promise<boolean> {
  if (IS_WIN) return false
  const commandPath = await getCommandPath(command)
  if (!commandPath) return false
  return isBrewBinPath(commandPath)
}

async function getLatestNpmVersion(pkg: string): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile('npm', ['view', pkg, 'version'], 5000)
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Get the latest version of a package available via winget.
 * Used on Windows to ensure version checks match the actual install source.
 * Falls back to null if winget is unavailable or the package is not found.
 */
async function getLatestWingetVersion(packageId: string): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile(
      'winget',
      ['show', '--id', packageId, '--exact', '--disable-interactivity', '--accept-source-agreements'],
      15000,
    )
    // The "Version" label is similar across locales (Version, Versión, Versione…)
    const match = stdout.match(/[Vv]ersion\s*[:\s]\s*(\d+\.\d+[\d.]*)/m)
    return match ? match[1] ?? null : null
  } catch {
    return null
  }
}

interface BrewPackageInfo {
  kind: 'formula' | 'cask'
  latestVersion: string | null
  installed: boolean
}

async function getBrewPackageInfo(name: string): Promise<BrewPackageInfo | null> {
  try {
    const { stdout } = await enrichedExecFile('brew', ['info', '--json=v2', name], 8000)
    const data = JSON.parse(stdout) as {
      formulae?: Array<{ versions?: { stable?: string }; installed?: unknown[] }>
      casks?: Array<{ version?: string; installed?: string }>
    }

    const formula = data.formulae?.[0]
    if (formula) {
      return {
        kind: 'formula',
        latestVersion: formula.versions?.stable ?? null,
        installed: Array.isArray(formula.installed) && formula.installed.length > 0,
      }
    }

    const cask = data.casks?.[0]
    if (cask) {
      return {
        kind: 'cask',
        latestVersion: cask.version ?? null,
        installed: Boolean(cask.installed),
      }
    }
  } catch {
    // Ignore and fallback to non-brew strategies.
  }

  return null
}

async function getLatestBrewVersion(name: string): Promise<string | null> {
  const info = await getBrewPackageInfo(name)
  return info?.latestVersion ?? null
}

function isBrewBinPath(binPath: string): boolean {
  const normalize = (value: string): string => value.trim().replace(/\\/g, '/')
  const isBrewInstallPath = (value: string): boolean => {
    const normalized = normalize(value)
    return normalized.startsWith('/opt/homebrew/Cellar/')
      || normalized.startsWith('/opt/homebrew/Caskroom/')
      || normalized.startsWith('/opt/homebrew/opt/')
      || normalized.startsWith('/usr/local/Cellar/')
      || normalized.startsWith('/usr/local/Caskroom/')
      || normalized.startsWith('/usr/local/opt/')
      || normalized.includes('/Homebrew/Cellar/')
      || normalized.includes('/Homebrew/Caskroom/')
  }

  if (isBrewInstallPath(binPath)) return true

  try {
    const resolvedPath = fsSync.realpathSync(binPath)
    return isBrewInstallPath(resolvedPath)
  } catch {
    return false
  }
}

async function getCommandPath(command: string): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile(getWhichCommand(), [command], 5000)
    const firstLine = stdout.split(/\r?\n/).find((line) => line.trim())
    return firstLine?.trim() || null
  } catch {
    return null
  }
}

async function findInstalledBrewPackage(candidates: string[] | undefined): Promise<BrewPackageMatch | null> {
  if (IS_WIN || !candidates || candidates.length === 0) return null
  for (const candidate of candidates) {
    const info = await getBrewPackageInfo(candidate)
    if (info?.installed) {
      return { ...info, name: candidate }
    }
  }
  return null
}

async function isNpmAvailable(): Promise<boolean> {
  try {
    await enrichedExecFile('npm', ['--version'], 5000)
    return true
  } catch {
    return false
  }
}

/**
 * On Windows, npm-dependent tools (claude, codex, copilot, pnpm, yarn) need npm to be installed.
 * If npm is missing, we auto-install Node.js LTS via winget (which bundles npm).
 * Throws on macOS/Linux if npm is missing (user should install Node.js via brew or system package manager).
 */
async function ensureNpmForInstall(
  sendStatus: (status: string, progress?: number) => void,
): Promise<void> {
  if (await isNpmAvailable()) return

  if (IS_WIN) {
    sendStatus('installing_prerequisite', 10)
    await wingetExec(
      [
        'install', '--id', 'OpenJS.NodeJS.LTS', '--silent',
        '--accept-source-agreements', '--accept-package-agreements',
      ],
      120000,
    )
    sendStatus('prerequisite_installed', 30)

    // Refresh PATH from registry so the just-installed Node.js/npm is found
    await refreshWindowsPath()

    // Verify npm is now available after Node.js installation
    const npmAvailable = await isNpmAvailable()
    if (!npmAvailable) {
      throw new Error(
        'Node.js was installed via winget but npm is not yet available. '
        + 'Please restart Kanbai so the updated PATH takes effect, then retry.',
      )
    }
  } else {
    throw new Error(
      'npm is not installed. Please install Node.js first '
      + '(click "Install" on the Node.js row in the updates panel) and retry.',
    )
  }
}


async function resolveToolInstallSource(tool: string): Promise<ToolInstallResolution> {
  const meta = TOOL_METADATA[tool] ?? {}

  if (tool === 'brew') {
    return { source: 'system' }
  }
  if (tool === 'pixel-agents') {
    return { source: 'internal' }
  }
  if (tool === 'cargo') {
    if (IS_WIN) return { source: 'winget' }
    // Use cached brew info instead of sequential checks
    const brew = await findInstalledBrewPackage(meta.brewCandidates)
    if (brew) return { source: brew.kind === 'cask' ? 'brew-cask' : 'brew-formula', brew }
    return { source: 'rustup' }
  }

  // Optimize RTK check - no need for multiple sequential brew calls
  if (tool === 'rtk') {
    if (!IS_WIN) {
      const commandPath = await getCommandPath(tool)
      const rtkBrew = await findInstalledBrewPackage(['rtk'])
      if (rtkBrew && (!commandPath || isBrewBinPath(commandPath))) {
        return { source: 'brew-formula', brew: rtkBrew }
      }
    }
    return await getCommandPath(tool) !== null ? { source: 'system' } : { source: 'unknown' }
  }

  if (tool === 'node') {
    // Optimize node check - try brew first since it's common on macOS
    if (!IS_WIN) {
      const commandPath = await getCommandPath(tool)
      const nodeBrew = await findInstalledBrewPackage(['node'])
      if (nodeBrew && (!commandPath || isBrewBinPath(commandPath))) {
        return { source: 'brew-formula', brew: nodeBrew, npmPackage: meta.npmPackage }
      }
    }
    return { source: IS_WIN ? 'winget' : 'system' }
  }
  if (tool === 'go' || tool === 'python' || tool === 'pip' || tool === 'git' || tool === 'make') {
    if (!IS_WIN) {
      const brew = await findInstalledBrewPackage(meta.brewCandidates)
      if (brew) {
        return { source: brew.kind === 'cask' ? 'brew-cask' : 'brew-formula', brew }
      }
    }
    return { source: IS_WIN ? 'winget' : 'system' }
  }
  if (tool === 'npm') {
    if (!IS_WIN && await isBrewManaged('npm')) {
      const brewInfo = await getBrewPackageInfo('node')
      return {
        source: 'brew-formula',
        brew: {
          kind: 'formula',
          latestVersion: brewInfo?.latestVersion ?? null,
          installed: true,
          name: 'node',
        },
      }
    }
    return { source: 'npm-global', npmPackage: 'npm' }
  }
  if (tool === 'pnpm' || tool === 'yarn' || tool === 'claude' || tool === 'codex' || tool === 'copilot') {
    if (!IS_WIN) {
      const brew = await findInstalledBrewPackage(meta.brewCandidates)
      if (brew) {
        return { source: brew.kind === 'cask' ? 'brew-cask' : 'brew-formula', brew, npmPackage: meta.npmPackage }
      }
    }
    return { source: 'npm-global', npmPackage: meta.npmPackage }
  }

  return { source: 'unknown' }
}

async function getLatestVersionForTool(
  tool: string,
  currentVersion: string,
  resolution: ToolInstallResolution,
): Promise<string | null> {
  // brew — self-updates via `brew update`, no "latest version" API to check
  if (tool === 'brew') {
    return null
  }

  // cargo does not expose reliable "latest" through a simple command.
  if (tool === 'cargo') {
    return null
  }

  if (tool === 'rtk') {
    if (IS_WIN) return getLatestNpmVersion('rtk')
    if (resolution.brew?.name) return getLatestBrewVersion(resolution.brew.name)
    return null
  }

  if (tool === 'node') {
    // On Windows, Node is installed/upgraded via winget LTS — check winget for
    // the actual available version instead of npm registry (which may advertise
    // a non-LTS or not-yet-published-to-winget version).
    if (IS_WIN) return await getLatestWingetVersion('OpenJS.NodeJS.LTS') ?? await getLatestNpmVersion('node')
    if (resolution.brew?.name) return getLatestBrewVersion(resolution.brew.name)
    return null
  }

  if (tool === 'npm') {
    if (resolution.source.startsWith('brew')) {
      // npm is bundled with brew's node formula. Check if brew has a newer
      // node version available — upgrading node also upgrades npm.
      const latestBrewNode = await getLatestBrewVersion(resolution.brew?.name || 'node')
      if (latestBrewNode) {
        const currentNode = await getVersion('node', ['--version'])
        if (currentNode && compareVersions(currentNode, latestBrewNode)) {
          // Brew has a newer node → npm will be updated along with it
          return await getLatestNpmVersion('npm') ?? currentVersion
        }
      }
      return currentVersion
    }
    // On Windows, npm is updated independently via `npm install -g npm@latest`,
    // so checking the npm registry is the correct source.
    return getLatestNpmVersion('npm')
  }

  if (tool === 'claude' || tool === 'codex' || tool === 'copilot') {
    if (resolution.brew?.name) {
      return getLatestBrewVersion(resolution.brew.name)
    }
    if (resolution.npmPackage) {
      return getLatestNpmVersion(resolution.npmPackage)
    }
    return null
  }

  if (tool === 'pnpm' || tool === 'yarn') {
    if (resolution.brew?.name) {
      return getLatestBrewVersion(resolution.brew.name)
    }
    if (resolution.npmPackage) {
      return getLatestNpmVersion(resolution.npmPackage)
    }
    return null
  }

  if (tool === 'go' || tool === 'python' || tool === 'make') {
    if (resolution.brew?.name) {
      return getLatestBrewVersion(resolution.brew.name)
    }
    return null
  }

  if (tool === 'pip') {
    if (resolution.source.startsWith('brew')) {
      return currentVersion
    }
    return null
  }

  if (tool === 'git') {
    if (resolution.brew?.name) {
      return getLatestBrewVersion(resolution.brew.name)
    }
    return null
  }

  return null
}

function canInstallTool(tool: string): boolean {
  return [
    'brew',
    'node',
    'npm',
    'pnpm',
    'yarn',
    'claude',
    'codex',
    'copilot',
    'go',
    'python',
    'pip',
    'git',
    'make',
    'cargo',
    'rtk',
    'pixel-agents',
  ].includes(tool)
}

/** In dev, pixel-agents source lives under vendor/. In release, under userData/. */
function getPixelAgentsSourcePath(): string {
  if (VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '../../vendor/pixel-agents')
  }
  return path.join(app.getPath('userData'), 'vendor', 'pixel-agents')
}

/** Resolve the directory serving the pixel-agents webview. */
function getPixelAgentsDistPath(): string {
  if (VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '../../vendor/pixel-agents/dist/webview')
  }
  // Runtime install goes to userData; bundled resources is the fallback
  const userDataDist = path.join(app.getPath('userData'), 'pixel-agents')
  if (fsSync.existsSync(path.join(userDataDist, 'index.html'))) {
    return userDataDist
  }
  return path.join(process.resourcesPath, 'pixel-agents')
}

async function isPixelAgentsInstalled(): Promise<boolean> {
  try {
    await fs.access(path.join(getPixelAgentsDistPath(), 'index.html'))
    return true
  } catch {
    return false
  }
}

async function getPixelAgentsVersion(): Promise<string> {
  try {
    const pkgPath = path.join(getPixelAgentsSourcePath(), 'package.json')
    const content = await fs.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(content) as { version?: string }
    return pkg.version || 'installed'
  } catch {
    return 'installed'
  }
}

async function getLocalPixelAgentsCommit(): Promise<string | null> {
  try {
    const repoPath = getPixelAgentsSourcePath()
    const { stdout } = await enrichedExecFile(
      'git', ['-C', repoPath, 'rev-parse', '--short=7', 'HEAD'], 5000,
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function getRemotePixelAgentsCommit(): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile(
      'git', ['ls-remote', 'https://github.com/pablodelucca/pixel-agents.git', 'HEAD'],
      8000,
    )
    const hash = stdout.trim().split('\t')[0]
    return hash?.substring(0, 7) || null
  } catch {
    return null
  }
}

async function isRtkInstalled(): Promise<boolean> {
  return (await getCommandPath('rtk')) !== null
}

async function getRtkVersion(): Promise<string> {
  const binaryVersion = await getVersion('rtk', ['--version'])
  return binaryVersion || 'installed'
}

/**
 * Detect how RTK was installed and return the package manager name.
 * Checks: brew > ~/.local/bin (curl install) > ~/.cargo/bin (cargo) > system
 */
async function resolveRtkPackageManager(): Promise<{ packageManager: string; binaryPath: string | null }> {
  const commandPath = await getCommandPath('rtk')
  if (!commandPath) return { packageManager: 'unknown', binaryPath: null }

  const home = process.env.HOME || process.env.USERPROFILE || ''

  // Check brew first (macOS)
  if (!IS_WIN) {
    const rtkBrew = await findInstalledBrewPackage(['rtk'])
    if (rtkBrew && isBrewBinPath(commandPath)) {
      return { packageManager: 'brew', binaryPath: commandPath }
    }
  }

  // Check if installed via curl (to ~/.local/bin)
  if (commandPath.startsWith(path.join(home, '.local', 'bin'))) {
    return { packageManager: 'curl', binaryPath: commandPath }
  }

  // Check if installed via cargo
  if (commandPath.startsWith(path.join(home, '.cargo', 'bin'))) {
    return { packageManager: 'cargo', binaryPath: commandPath }
  }

  return { packageManager: 'system', binaryPath: commandPath }
}

async function checkToolUpdates(): Promise<UpdateInfo[]> {
  const results: UpdateInfo[] = []

  // Check all tool versions in parallel
  const versionChecks = TOOLS_TO_CHECK.map(async (tool) => {
    const currentVersion = await getVersion(tool.checkCommand, tool.checkArgs)
    return { name: tool.name, version: currentVersion }
  })

  const versionResults = await Promise.all(versionChecks)

  // Resolve install sources and latest versions in parallel for all installed tools
  const resolvedTools = await Promise.all(
    versionResults.map(async (result) => {
      const canUninstall = Boolean(TOOL_METADATA[result.name]?.canUninstall)

      if (!result.version) {
        const fallbackSource: ToolInstallSource =
          result.name === 'brew' ? 'system'
            : result.name === 'cargo' ? (IS_WIN ? 'winget' : 'rustup')
            : result.name === 'pixel-agents' ? 'internal'
              : (result.name === 'node'
                  || result.name === 'git'
                  || result.name === 'go'
                  || result.name === 'python'
                  || result.name === 'pip'
                  || result.name === 'make') ? (IS_WIN ? 'winget' : 'system')
                  : result.name === 'npm' ? (IS_WIN ? 'winget' : 'npm-global')
                    : 'npm-global'
        return {
          tool: result.name,
          currentVersion: '',
          latestVersion: '',
          updateAvailable: false,
          installed: false,
          scope: 'global' as const,
          installSource: fallbackSource,
          canInstall: canInstallTool(result.name),
          canUninstall,
        }
      }

      const installResolution = await resolveToolInstallSource(result.name)
      const latestVersion = await getLatestVersionForTool(result.name, result.version, installResolution)

      return {
        tool: result.name,
        currentVersion: extractVersion(result.version),
        latestVersion: latestVersion ? extractVersion(latestVersion) : extractVersion(result.version),
        updateAvailable: latestVersion !== null && compareVersions(result.version, latestVersion),
        installed: true,
        scope: 'global' as const,
        installSource: installResolution.source,
        canInstall: canInstallTool(result.name),
        canUninstall,
      }
    }),
  )

  results.push(...resolvedTools)

  // pixel-agents — directory-based detection, compare git commits
  const pixelAgentsInstalled = await isPixelAgentsInstalled()

  let paCurrentVersion = ''
  let paLatestVersion = ''
  let paUpdateAvailable = false

  if (pixelAgentsInstalled) {
    const baseVersion = await getPixelAgentsVersion()
    const [localCommit, remoteCommit] = await Promise.all([
      getLocalPixelAgentsCommit(),
      getRemotePixelAgentsCommit(),
    ])

    // Show version with commit hash for clarity (e.g. "1.2.0 (abc1234)")
    paCurrentVersion = localCommit ? `${baseVersion} (${localCommit})` : baseVersion

    if (localCommit && remoteCommit && localCommit !== remoteCommit) {
      paUpdateAvailable = true
      paLatestVersion = `${baseVersion} (${remoteCommit})`
    } else {
      paLatestVersion = paCurrentVersion
    }
  }

  results.push({
    tool: 'pixel-agents',
    currentVersion: paCurrentVersion,
    latestVersion: paLatestVersion,
    updateAvailable: paUpdateAvailable,
    installed: pixelAgentsInstalled,
    scope: 'global',
    installSource: 'internal',
    canInstall: true,
    canUninstall: true,
  })

  // rtk — binary-based detection with package manager tracking
  const rtkInstalled = await isRtkInstalled()
  const rtkPkgInfo = await resolveRtkPackageManager()

  let rtkCurrentVersion = ''
  let rtkLatestVersion = ''
  let rtkUpdateAvailable = false
  let rtkInstallSource: ToolInstallSource = 'unknown'

  if (rtkInstalled) {
    rtkCurrentVersion = await getRtkVersion()
    rtkLatestVersion = rtkCurrentVersion

    // Determine install source from package manager
    if (rtkPkgInfo.packageManager === 'brew') {
      rtkInstallSource = 'brew-formula'
      const latestBrew = await getLatestBrewVersion('rtk')
      if (latestBrew && latestBrew !== rtkCurrentVersion) {
        rtkUpdateAvailable = true
        rtkLatestVersion = latestBrew
      }
    } else if (rtkPkgInfo.packageManager === 'cargo') {
      rtkInstallSource = 'cargo'
    } else {
      rtkInstallSource = 'system'
    }
  }

  results.push({
    tool: 'rtk',
    currentVersion: rtkCurrentVersion,
    latestVersion: rtkLatestVersion,
    updateAvailable: rtkUpdateAvailable,
    installed: rtkInstalled,
    scope: 'global',
    installSource: rtkInstallSource,
    packageManager: rtkPkgInfo.packageManager,
    binaryPath: rtkPkgInfo.binaryPath ?? undefined,
    canInstall: true,
    canUninstall: true,
  })

  return results
}

/** Recursively copy a directory. */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

const PIXEL_AGENTS_SHIM = `<!-- pixel-agents-shim-start -->
<script>
window.acquireVsCodeApi = function() {
  return {
    postMessage: function(msg) {
      window.parent.postMessage({ source: 'pixel-agents-webview', payload: msg }, '*');
    },
    getState: function() { return window.__paState || {}; },
    setState: function(s) { window.__paState = s; }
  };
};
new MutationObserver(function(_, obs) {
  document.querySelectorAll('button').forEach(function(btn) {
    if (btn.textContent && btn.textContent.trim() === '+ Agent' && btn.parentElement) {
      btn.parentElement.style.display = 'none';
      obs.disconnect();
    }
  });
}).observe(document.body, { childList: true, subtree: true });
</script>
<!-- pixel-agents-shim-end -->`

/** Inject the acquireVsCodeApi shim into the pixel-agents index.html. */
async function patchPixelAgentsHtml(htmlPath: string): Promise<void> {
  let html = await fs.readFile(htmlPath, 'utf-8')
  // Remove any previously injected shim (idempotent)
  html = html.replace(
    /<!-- pixel-agents-shim-start -->[\s\S]*?<!-- pixel-agents-shim-end -->/,
    '',
  )
  html = html.replace('</head>', `${PIXEL_AGENTS_SHIM}\n</head>`)
  await fs.writeFile(htmlPath, html, 'utf-8')
}

export function registerUpdateHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    return checkToolUpdates()
  })

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_INSTALL,
    async (
      _event,
      { tool, scope }: { tool: string; scope: string; projectId?: string },
    ) => {
      const windows = BrowserWindow.getAllWindows()

      const sendStatus = (status: string, progress?: number) => {
        for (const win of windows) {
          try {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.UPDATE_STATUS, { tool, scope, status, progress })
            }
          } catch { /* render frame disposed */ }
        }
      }

      sendStatus('starting')

      try {
        let command: string
        let args: string[]
        const toolCheck = TOOLS_TO_CHECK.find((entry) => entry.name === tool)
        let isInstalled = tool === 'pixel-agents'
          ? await isPixelAgentsInstalled()
          : Boolean(toolCheck && await getVersion(toolCheck.checkCommand, toolCheck.checkArgs)) ||
            (tool === 'rtk' && await isRtkInstalled())
        const installResolution = await resolveToolInstallSource(tool)
        if (!isInstalled && installResolution.brew?.installed) {
          isInstalled = true
        }

        switch (tool) {
          case 'brew': {
            if (IS_WIN) {
              throw new Error('Homebrew is only available on macOS')
            }
            if (isInstalled) {
              // Run `brew update` to self-update Homebrew
              command = 'brew'
              args = ['update']
            } else {
              // Install Homebrew via the official install script
              sendStatus('installing', 20)
              await crossExecFile(
                '/bin/bash',
                ['-c', 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'],
                { timeout: 300000, env: { ...enrichedEnv(), NONINTERACTIVE: '1' } },
              )
              // Add brew to current process PATH
              const brewPaths = ['/opt/homebrew/bin', '/usr/local/bin']
              const currentPath = process.env.PATH || ''
              for (const p of brewPaths) {
                if (!currentPath.includes(p)) {
                  process.env.PATH = `${p}:${currentPath}`
                }
              }
              sendStatus('completed', 100)
              return { success: true }
            }
            break
          }
          case 'node':
            if (IS_WIN) {
              command = 'winget'
              args = [
                isInstalled ? 'upgrade' : 'install',
                '--id', 'OpenJS.NodeJS.LTS', '--silent',
                '--accept-source-agreements', '--accept-package-agreements',
              ]
            } else if (installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = [isInstalled ? 'upgrade' : 'install', installResolution.brew?.name || 'node']
            } else if (!isInstalled) {
              command = 'brew'
              args = ['install', 'node']
            } else {
              throw new Error('Cannot upgrade node automatically for non-Homebrew install on macOS')
            }
            break
          case 'npm':
            if (!isInstalled) {
              if (IS_WIN) {
                command = 'winget'
                args = [
                  'install', '--id', 'OpenJS.NodeJS.LTS', '--silent',
                  '--accept-source-agreements', '--accept-package-agreements',
                ]
              } else {
                command = 'brew'
                args = ['install', 'node']
              }
            } else if (IS_WIN) {
              // Update npm independently — winget upgrades Node, not npm directly
              command = 'npm'
              args = ['install', '-g', 'npm@latest']
            } else if (installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = ['upgrade', installResolution.brew?.name || 'node']
            } else {
              command = 'npm'
              args = ['install', '-g', 'npm@latest']
            }
            break
          case 'pnpm':
            if (installResolution.source.startsWith('brew') && installResolution.brew?.name) {
              command = 'brew'
              args = installResolution.brew.kind === 'cask'
                ? [isInstalled ? 'upgrade' : 'install', '--cask', installResolution.brew.name]
                : [isInstalled ? 'upgrade' : 'install', installResolution.brew.name]
            } else {
              await ensureNpmForInstall(sendStatus)
              command = 'npm'
              args = ['install', '-g', 'pnpm@latest']
            }
            break
          case 'yarn':
            if (installResolution.source.startsWith('brew') && installResolution.brew?.name) {
              command = 'brew'
              args = installResolution.brew.kind === 'cask'
                ? [isInstalled ? 'upgrade' : 'install', '--cask', installResolution.brew.name]
                : [isInstalled ? 'upgrade' : 'install', installResolution.brew.name]
            } else {
              await ensureNpmForInstall(sendStatus)
              command = 'npm'
              args = ['install', '-g', 'yarn@latest']
            }
            break
          case 'claude':
            if (installResolution.source.startsWith('brew') && installResolution.brew?.name) {
              command = 'brew'
              args = installResolution.brew.kind === 'cask'
                ? [isInstalled ? 'upgrade' : 'install', '--cask', installResolution.brew.name]
                : [isInstalled ? 'upgrade' : 'install', installResolution.brew.name]
            } else {
              await ensureNpmForInstall(sendStatus)
              command = 'npm'
              args = ['install', '-g', '@anthropic-ai/claude-code@latest']
            }
            break
          case 'codex':
            if (installResolution.source.startsWith('brew') && installResolution.brew?.name) {
              command = 'brew'
              args = installResolution.brew.kind === 'cask'
                ? [isInstalled ? 'upgrade' : 'install', '--cask', installResolution.brew.name]
                : [isInstalled ? 'upgrade' : 'install', installResolution.brew.name]
            } else {
              await ensureNpmForInstall(sendStatus)
              command = 'npm'
              args = ['install', '-g', '@openai/codex@latest']
            }
            break
          case 'copilot':
            if (installResolution.source.startsWith('brew') && installResolution.brew?.name) {
              command = 'brew'
              args = installResolution.brew.kind === 'cask'
                ? [isInstalled ? 'upgrade' : 'install', '--cask', installResolution.brew.name]
                : [isInstalled ? 'upgrade' : 'install', installResolution.brew.name]
            } else {
              await ensureNpmForInstall(sendStatus)
              command = 'npm'
              args = ['install', '-g', '@github/copilot@latest']
            }
            break
          case 'git':
            if (IS_WIN) {
              command = 'winget'
              args = [
                isInstalled ? 'upgrade' : 'install',
                '--id', 'Git.Git', '--silent',
                '--accept-source-agreements', '--accept-package-agreements',
              ]
            } else if (installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = [isInstalled ? 'upgrade' : 'install', installResolution.brew?.name || 'git']
            } else if (!isInstalled) {
              command = 'brew'
              args = ['install', 'git']
            } else {
              throw new Error(`Cannot upgrade git automatically on macOS`)
            }
            break
          case 'go':
            if (IS_WIN) {
              command = 'winget'
              args = [
                isInstalled ? 'upgrade' : 'install',
                '--id', 'GoLang.Go', '--silent',
                '--accept-source-agreements', '--accept-package-agreements',
              ]
            } else if (installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = [isInstalled ? 'upgrade' : 'install', installResolution.brew?.name || 'go']
            } else if (!isInstalled) {
              command = 'brew'
              args = ['install', 'go']
            } else {
              throw new Error('Cannot upgrade go automatically for non-Homebrew install on macOS')
            }
            break
          case 'python':
            if (IS_WIN) {
              command = 'winget'
              args = [
                isInstalled ? 'upgrade' : 'install',
                '--id', 'Python.Python.3.13', '--silent',
                '--accept-source-agreements', '--accept-package-agreements',
              ]
            } else if (installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = [isInstalled ? 'upgrade' : 'install', installResolution.brew?.name || 'python']
            } else if (!isInstalled) {
              command = 'brew'
              args = ['install', 'python']
            } else {
              throw new Error('Cannot upgrade python automatically for non-Homebrew install on macOS')
            }
            break
          case 'pip':
            if (!IS_WIN && installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = ['upgrade', installResolution.brew?.name || 'python']
            } else {
              command = IS_WIN ? 'python' : 'python3'
              args = ['-m', 'pip', 'install', '--upgrade', 'pip']
            }
            break
          case 'make':
            if (IS_WIN) {
              command = 'winget'
              args = [
                isInstalled ? 'upgrade' : 'install',
                '--id', 'GnuWin32.Make', '--silent',
                '--accept-source-agreements', '--accept-package-agreements',
              ]
            } else if (installResolution.source.startsWith('brew')) {
              command = 'brew'
              args = [isInstalled ? 'upgrade' : 'install', installResolution.brew?.name || 'make']
            } else if (!isInstalled) {
              command = 'brew'
              args = ['install', 'make']
            } else {
              throw new Error('Cannot upgrade make automatically for non-Homebrew install on macOS')
            }
            break
          case 'cargo': {
            if (IS_WIN && !isInstalled) {
              command = 'winget'
              args = ['install', '--id', 'Rustlang.Rustup', '--silent', '--accept-source-agreements', '--accept-package-agreements']
            } else if (!IS_WIN && !isInstalled) {
              command = 'brew'
              args = ['install', installResolution.brew?.name || 'rustup']
            } else if (installResolution.source.startsWith('brew') && installResolution.brew?.name) {
              command = 'brew'
              args = ['upgrade', installResolution.brew.name]
            } else {
              command = 'rustup'
              args = ['update']
            }
            break
          }
          case 'rtk': {
            sendStatus('installing', 10)

            // Check if RTK is installed via brew
            const isRtkViaBrewInstalled = installResolution.source.startsWith('brew')
            
            if (isRtkViaBrewInstalled) {
              // Use brew for installation/upgrade
              if (IS_WIN) {
                command = 'winget'
                args = [isInstalled ? 'upgrade' : 'install', '--id', 'rtk', '--silent', '--accept-source-agreements', '--accept-package-agreements']
              } else {
                command = 'brew'
                args = [isInstalled ? 'upgrade' : 'install', 'rtk']
              }
            } else {
              // Install via brew (preferred) or curl fallback
              if (!IS_WIN) {
                // Check if brew is available
                const hasBrew = await getCommandPath('brew') !== null
                if (hasBrew) {
                  command = 'brew'
                  args = [isInstalled ? 'upgrade' : 'install', 'rtk']
                } else {
                  // Use curl quick install script
                  sendStatus('installing', 20)
                  await crossExecFile(
                    'sh',
                    ['-c', 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh'],
                    { timeout: 120000, env: enrichedEnv() },
                  )
                  sendStatus('completed', 100)
                  return { success: true }
                }
              } else {
                // Windows: use cargo install
                command = 'cargo'
                args = ['install', '--git', 'https://github.com/rtk-ai/rtk']
              }
            }
            break
          }
          case 'pixel-agents': {
            sendStatus('installing', 10)

            if (VITE_DEV_SERVER_URL) {
              // Dev mode: run the setup script from the project tree
              const projectRoot = path.join(__dirname, '../..')
              await crossExecFile(
                'bash',
                [path.join(projectRoot, 'scripts/setup-pixel-agents.sh')],
                { timeout: 300000, env: enrichedEnv(), maxBuffer: 50 * 1024 * 1024 },
              )
            } else {
              // Release mode: clone, build and deploy to userData
              const sourcePath = getPixelAgentsSourcePath()
              const targetDir = path.join(app.getPath('userData'), 'pixel-agents')

              // Clone or pull
              sendStatus('installing', 20)
              const parentDir = path.dirname(sourcePath)
              await fs.mkdir(parentDir, { recursive: true })
              if (fsSync.existsSync(path.join(sourcePath, '.git'))) {
                // Reset local modifications (e.g. webview-ui/package-lock.json) before pulling
                await crossExecFile('git', ['reset', '--hard', 'HEAD'], { cwd: sourcePath, timeout: 10000, env: enrichedEnv() })
                await crossExecFile('git', ['clean', '-fd'], { cwd: sourcePath, timeout: 10000, env: enrichedEnv() })
                await crossExecFile('git', ['pull'], { cwd: sourcePath, timeout: 60000, env: enrichedEnv() })
              } else {
                await fs.rm(sourcePath, { recursive: true, force: true }).catch(() => {})
                await crossExecFile(
                  'git', ['clone', '--depth=1', 'https://github.com/pablodelucca/pixel-agents.git', sourcePath],
                  { timeout: 60000, env: enrichedEnv() },
                )
              }

              // Install webview-ui deps
              sendStatus('installing', 40)
              await crossExecFile(
                'npm', ['install'],
                { cwd: path.join(sourcePath, 'webview-ui'), timeout: 120000, env: enrichedEnv() },
              )

              // Build webview-ui
              sendStatus('installing', 60)
              await crossExecFile(
                'npm', ['run', 'build'],
                { cwd: path.join(sourcePath, 'webview-ui'), timeout: 120000, env: enrichedEnv() },
              )

              // Copy dist/webview to target
              sendStatus('installing', 80)
              await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
              await copyDir(path.join(sourcePath, 'dist', 'webview'), targetDir)

              // Patch index.html with acquireVsCodeApi shim
              await patchPixelAgentsHtml(path.join(targetDir, 'index.html'))
            }

            sendStatus('completed', 100)
            return { success: true }
          }
          default:
            throw new Error(`Unknown tool: ${tool}`)
        }

        sendStatus('installing', 50)
        if (command === 'winget') {
          await wingetExec(args, 120000)
          // GnuWin32.Make does not add its bin dir to the system PATH
          if (tool === 'make') {
            await addToWindowsUserPath('C:\\Program Files (x86)\\GnuWin32\\bin')
          }
          // Refresh PATH from registry so the just-installed tool is detected
          await refreshWindowsPath()
        } else {
          await enrichedExecFile(command, args, 120000)
        }
        sendStatus('completed', 100)

        return { success: true }
      } catch (error) {
        const message = extractExecErrorMessage(error)
        sendStatus('failed')
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_UNINSTALL,
    async (_event, { tool }: { tool: string }) => {
      const windows = BrowserWindow.getAllWindows()

      const sendStatus = (status: string) => {
        for (const win of windows) {
          try {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.UPDATE_STATUS, { tool, scope: 'global', status })
            }
          } catch { /* render frame disposed */ }
        }
      }

      sendStatus('uninstalling')

      try {
        let command: string
        let args: string[]

        switch (tool) {
        case 'rtk': {
            // Check if RTK was installed via brew (need to resolve first)
            const installResolution = await resolveToolInstallSource(tool)
            const isRtkViaBrewInstalled = installResolution.source.startsWith('brew')
            
            if (isRtkViaBrewInstalled) {
              // Use brew for uninstall
              if (IS_WIN) {
                command = 'winget'
                args = ['uninstall', '--id', 'rtk', '--silent']
              } else {
                command = 'brew'
                args = ['uninstall', 'rtk']
              }
            } else {
              // Remove binary directly based on detected path
              const rtkPath = await getCommandPath('rtk')
              if (rtkPath) {
                const home = process.env.HOME || process.env.USERPROFILE || ''
                // Only remove if in user-controlled locations (~/.local/bin or ~/.cargo/bin)
                if (rtkPath.startsWith(path.join(home, '.local', 'bin')) || rtkPath.startsWith(path.join(home, '.cargo', 'bin'))) {
                  await fs.rm(rtkPath, { force: true })
                  sendStatus('completed')
                  return { success: true }
                }
                // If installed via cargo, use cargo uninstall
                if (rtkPath.startsWith(path.join(home, '.cargo', 'bin'))) {
                  command = 'cargo'
                  args = ['uninstall', 'rtk']
                } else {
                  throw new Error(`Cannot uninstall RTK from ${rtkPath} — uninstall manually`)
                }
              } else {
                sendStatus('completed')
                return { success: true }
              }
            }
            break
          }
          case 'pixel-agents': {
            if (VITE_DEV_SERVER_URL) {
              // Dev mode: remove from vendor/
              const vendorPath = path.join(__dirname, '../../vendor/pixel-agents')
              await fs.rm(vendorPath, { recursive: true, force: true })
            } else {
              // Release mode: remove source clone and deployed dist
              await fs.rm(getPixelAgentsSourcePath(), { recursive: true, force: true }).catch(() => {})
              await fs.rm(path.join(app.getPath('userData'), 'pixel-agents'), { recursive: true, force: true }).catch(() => {})
            }
            sendStatus('completed')
            return { success: true }
          }
          default:
            throw new Error(`Cannot uninstall core tool: ${tool}`)
        }

        if (command === 'winget') {
          await wingetExec(args, 120000)
        } else {
          await enrichedExecFile(command, args, 120000)
        }
        sendStatus('completed')

        return { success: true }
      } catch (error) {
        const message = extractExecErrorMessage(error)
        sendStatus('failed')
        return { success: false, error: message }
      }
    },
  )
}
