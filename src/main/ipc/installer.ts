import { IpcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import type { PrerequisiteId, PrerequisiteInfo, InstallerProgress, InstallerResult } from '../../shared/types'
import { IS_WIN, IS_MAC, getExtendedToolPaths, PATH_SEP, crossExecFile } from '../../shared/platform'

// Ordered list of prerequisites — each depends on the previous ones
const PREREQUISITE_ORDER: PrerequisiteId[] = IS_MAC
  ? ['brew', 'node', 'npm', 'claude']
  : ['node', 'npm', 'claude']

function enrichedEnv(): NodeJS.ProcessEnv {
  const extraPaths = getExtendedToolPaths()
  return {
    ...process.env,
    PATH: `${process.env.PATH || ''}${PATH_SEP}${extraPaths.join(PATH_SEP)}`,
  }
}

function enrichedExecFile(
  command: string,
  args: string[],
  timeout = 10000,
): Promise<{ stdout: string; stderr: string }> {
  return crossExecFile(command, args, { timeout, env: enrichedEnv() })
}

function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const execError = error as Error & { stderr?: string; stdout?: string }
  const stderr = execError.stderr?.trim()
  const stdout = execError.stdout?.trim()
  if (stderr && stdout) return `${stderr}\n${stdout}`
  if (stderr) return stderr
  if (stdout) return stdout
  return error.message
}

async function getToolVersion(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await enrichedExecFile(command, args, 5000)
    const raw = (stdout || stderr).trim()
    if (!raw) return null
    return raw
      .replace(/^v/, '')
      .replace(/^Homebrew /, '')
      .replace(/^Claude Code /, '')
      .replace(/ \(.+\)$/, '')
  } catch {
    return null
  }
}

async function checkPrerequisite(id: PrerequisiteId): Promise<PrerequisiteInfo> {
  switch (id) {
    case 'brew': {
      if (!IS_MAC) return { id, version: null, status: 'skipped' }
      const version = await getToolVersion('brew', ['--version'])
      return { id, version, status: version ? 'installed' : 'missing' }
    }
    case 'node': {
      const version = await getToolVersion('node', ['--version'])
      return { id, version, status: version ? 'installed' : 'missing' }
    }
    case 'npm': {
      const version = await getToolVersion('npm', ['--version'])
      return { id, version, status: version ? 'installed' : 'missing' }
    }
    case 'claude': {
      const version = await getToolVersion('claude', ['--version'])
      return { id, version, status: version ? 'installed' : 'missing' }
    }
  }
}

async function checkAllPrerequisites(): Promise<PrerequisiteInfo[]> {
  const results = await Promise.all(PREREQUISITE_ORDER.map(checkPrerequisite))
  return results
}

function sendProgress(progress: InstallerProgress): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.INSTALLER_PROGRESS, progress)
      }
    } catch { /* frame disposed */ }
  }
}

async function installBrew(): Promise<void> {
  // Install Homebrew via the official install script
  // The script is non-interactive when NONINTERACTIVE=1
  await crossExecFile(
    '/bin/bash',
    ['-c', 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'],
    { timeout: 300000, env: { ...enrichedEnv(), NONINTERACTIVE: '1' } },
  )

  // After installation, add brew to the current process PATH
  const brewPaths = ['/opt/homebrew/bin', '/usr/local/bin']
  const currentPath = process.env.PATH || ''
  for (const p of brewPaths) {
    if (!currentPath.includes(p)) {
      process.env.PATH = `${p}:${currentPath}`
    }
  }
}

async function installNode(): Promise<void> {
  if (IS_WIN) {
    await crossExecFile(
      'winget',
      ['install', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-source-agreements', '--accept-package-agreements'],
      { timeout: 120000, env: enrichedEnv() },
    )
  } else {
    await enrichedExecFile('brew', ['install', 'node'], 120000)
  }
}

async function installNpm(): Promise<void> {
  // npm comes bundled with Node. If it's missing after Node install, try updating.
  const version = await getToolVersion('npm', ['--version'])
  if (version) return // Already available after Node install
  if (IS_WIN) {
    await crossExecFile(
      'winget',
      ['install', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-source-agreements', '--accept-package-agreements'],
      { timeout: 120000, env: enrichedEnv() },
    )
  } else {
    await enrichedExecFile('brew', ['install', 'node'], 120000)
  }
}

async function installClaude(): Promise<void> {
  await enrichedExecFile('npm', ['install', '-g', '@anthropic-ai/claude-code@latest'], 120000)
}

const INSTALL_FUNCTIONS: Record<PrerequisiteId, () => Promise<void>> = {
  brew: installBrew,
  node: installNode,
  npm: installNpm,
  claude: installClaude,
}

async function cascadeInstall(): Promise<InstallerResult> {
  const finalResults: PrerequisiteInfo[] = []
  let hasError = false

  for (let i = 0; i < PREREQUISITE_ORDER.length; i++) {
    const id = PREREQUISITE_ORDER[i]!
    const progressBase = Math.round((i / PREREQUISITE_ORDER.length) * 100)

    // Check current status
    const current = await checkPrerequisite(id)

    if (current.status === 'installed' || current.status === 'skipped') {
      finalResults.push(current)
      sendProgress({
        currentStep: id,
        status: current.status,
        progress: progressBase + Math.round(100 / PREREQUISITE_ORDER.length),
      })
      continue
    }

    // Install missing prerequisite
    sendProgress({
      currentStep: id,
      status: 'installing',
      progress: progressBase,
      message: `Installing ${id}...`,
    })

    try {
      await INSTALL_FUNCTIONS[id]()

      // Verify installation
      const verified = await checkPrerequisite(id)
      if (verified.status !== 'installed' && verified.status !== 'skipped') {
        throw new Error(`${id} was not detected after installation`)
      }

      finalResults.push(verified)
      sendProgress({
        currentStep: id,
        status: 'installed',
        progress: progressBase + Math.round(100 / PREREQUISITE_ORDER.length),
      })
    } catch (error) {
      const errorMessage = extractErrorMessage(error)
      const failedResult: PrerequisiteInfo = {
        id,
        version: null,
        status: 'failed',
        error: errorMessage,
      }
      finalResults.push(failedResult)
      hasError = true

      sendProgress({
        currentStep: id,
        status: 'failed',
        progress: progressBase,
        error: errorMessage,
      })

      // Stop cascade — subsequent deps likely depend on this one
      // Mark remaining as missing
      for (let j = i + 1; j < PREREQUISITE_ORDER.length; j++) {
        const remainingId = PREREQUISITE_ORDER[j]!
        finalResults.push({ id: remainingId, version: null, status: 'missing' })
      }
      break
    }
  }

  return {
    success: !hasError,
    results: finalResults,
    error: hasError ? `Installation stopped: ${finalResults.find((r) => r.status === 'failed')?.error}` : undefined,
  }
}

export function registerInstallerHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.INSTALLER_CHECK, async () => {
    return checkAllPrerequisites()
  })

  ipcMain.handle(IPC_CHANNELS.INSTALLER_CASCADE, async () => {
    return cascadeInstall()
  })
}
