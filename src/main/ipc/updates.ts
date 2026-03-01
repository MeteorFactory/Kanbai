import { IpcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, UpdateInfo } from '../../shared/types'
import { IS_WIN, getWhichCommand, getExtendedToolPaths, PATH_SEP, crossExecFile } from '../../shared/platform'

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

interface ToolCheck {
  name: string
  checkCommand: string
  checkArgs: string[]
  latestCommand?: string
  latestArgs?: string[]
}

const TOOLS_TO_CHECK: ToolCheck[] = [
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
    name: 'claude',
    checkCommand: 'claude',
    checkArgs: ['--version'],
  },
  {
    name: 'git',
    checkCommand: 'git',
    checkArgs: ['--version'],
  },
  // cargo & rtk — Windows only
  ...(IS_WIN
    ? [
        {
          name: 'cargo',
          checkCommand: 'cargo',
          checkArgs: ['--version'],
        },
        {
          name: 'rtk',
          checkCommand: 'rtk',
          checkArgs: ['--version'],
        },
      ]
    : []),
]

async function getVersion(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile(command, args, 10000)
    const version = stdout
      .trim()
      .replace(/^v/, '')
      .replace(/^git version /, '')
      .replace(/^Claude Code /, '')
      .replace(/^cargo /, '')
      .replace(/ \(.+\)$/, '')
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
  try {
    const { stdout } = await enrichedExecFile(getWhichCommand(), [command], 5000)
    const binPath = stdout.trim()
    return binPath.startsWith('/opt/homebrew/') || binPath.startsWith('/usr/local/Cellar/')
  } catch {
    return false
  }
}

async function getLatestNpmVersion(pkg: string): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile('npm', ['view', pkg, 'version'], 15000)
    return stdout.trim()
  } catch {
    return null
  }
}

async function getLatestBrewVersion(formula: string): Promise<string | null> {
  try {
    const { stdout } = await enrichedExecFile('brew', ['info', '--json=v2', formula], 15000)
    const data = JSON.parse(stdout)
    return data.formulae?.[0]?.versions?.stable || null
  } catch {
    return null
  }
}

async function checkToolUpdates(): Promise<UpdateInfo[]> {
  const results: UpdateInfo[] = []

  for (const tool of TOOLS_TO_CHECK) {
    const currentVersion = await getVersion(tool.checkCommand, tool.checkArgs)

    if (!currentVersion) {
      // Tool not installed
      results.push({
        tool: tool.name,
        currentVersion: '',
        latestVersion: '',
        updateAvailable: false,
        installed: false,
        scope: 'global',
      })
      continue
    }

    let latestVersion: string | null = null

    // Try to get latest version based on tool
    if (tool.name === 'node') {
      if (IS_WIN) {
        latestVersion = await getLatestNpmVersion('node')
      } else {
        latestVersion = await getLatestBrewVersion('node')
      }
    } else if (tool.name === 'npm') {
      if (await isBrewManaged('npm')) {
        // npm is bundled with Homebrew's node — don't check npm registry
        // The 'node' entry already handles brew updates; upgrading node updates npm too
        latestVersion = currentVersion
      } else {
        latestVersion = await getLatestNpmVersion('npm')
      }
    } else if (tool.name === 'claude') {
      latestVersion = await getLatestNpmVersion('@anthropic-ai/claude-code')
    } else if (tool.name === 'cargo') {
      // cargo version is managed by rustup — no easy remote version check
      latestVersion = null
    } else if (tool.name === 'rtk') {
      // rtk is a cargo crate — no easy remote version check, skip
      latestVersion = null
    }

    results.push({
      tool: tool.name,
      currentVersion: extractVersion(currentVersion),
      latestVersion: latestVersion ? extractVersion(latestVersion) : extractVersion(currentVersion),
      updateAvailable: latestVersion !== null && compareVersions(currentVersion, latestVersion),
      installed: true,
      scope: 'global',
    })
  }

  return results
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

        const npmIsBrewManaged = tool === 'npm' && (await isBrewManaged('npm'))

        switch (tool) {
          case 'node':
            if (IS_WIN) {
              command = 'winget'
              args = ['upgrade', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-source-agreements', '--accept-package-agreements']
            } else {
              command = 'brew'
              args = ['upgrade', 'node']
            }
            break
          case 'npm':
            if (IS_WIN) {
              command = 'npm'
              args = ['install', '-g', 'npm@latest']
            } else if (npmIsBrewManaged) {
              command = 'brew'
              args = ['upgrade', 'node']
            } else {
              command = 'npm'
              args = ['install', '-g', 'npm@latest']
            }
            break
          case 'claude':
            command = 'npm'
            args = ['install', '-g', '@anthropic-ai/claude-code@latest']
            break
          case 'git':
            if (IS_WIN) {
              command = 'winget'
              args = ['upgrade', '--id', 'Git.Git', '--silent', '--accept-source-agreements', '--accept-package-agreements']
            } else {
              throw new Error(`Cannot upgrade git automatically on macOS`)
            }
            break
          case 'cargo': {
            // Check if cargo is already installed — if so, update via rustup
            let cargoExists = false
            try {
              await enrichedExecFile(getWhichCommand(), ['cargo'], 5000)
              cargoExists = true
            } catch { /* not installed */ }
            if (cargoExists) {
              command = 'rustup'
              args = ['update']
            } else if (IS_WIN) {
              command = 'winget'
              args = ['install', '--id', 'Rustlang.Rustup', '--silent', '--accept-source-agreements', '--accept-package-agreements']
            } else {
              command = 'brew'
              args = ['install', 'rustup']
            }
            break
          }
          case 'rtk': {
            // Verify cargo is installed before attempting
            try {
              await enrichedExecFile(getWhichCommand(), ['cargo'], 5000)
            } catch {
              throw new Error('Cargo is not installed. Install Rust from https://rustup.rs first.')
            }
            command = 'cargo'
            args = ['install', '--git', 'https://github.com/rtk-ai/rtk']
            break
          }
          default:
            throw new Error(`Unknown tool: ${tool}`)
        }

        sendStatus('installing', 50)
        await enrichedExecFile(command, args, 120000)
        sendStatus('completed', 100)

        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
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
            try {
              await enrichedExecFile(getWhichCommand(), ['cargo'], 5000)
            } catch {
              throw new Error('Cargo is not installed. Install Rust from https://rustup.rs first.')
            }
            command = 'cargo'
            args = ['uninstall', 'rtk']
            break
          }
          default:
            throw new Error(`Cannot uninstall core tool: ${tool}`)
        }

        await enrichedExecFile(command, args, 120000)
        sendStatus('completed')

        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        sendStatus('failed')
        return { success: false, error: message }
      }
    },
  )
}
