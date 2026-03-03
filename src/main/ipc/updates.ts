import { IpcMain, BrowserWindow, app } from 'electron'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { IPC_CHANNELS, UpdateInfo } from '../../shared/types'
import { IS_WIN, getWhichCommand, getExtendedToolPaths, PATH_SEP, crossExecFile } from '../../shared/platform'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

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
      .replace(/^codex\s+/i, '')
      .replace(/^copilot\s+/i, '')
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
      15000,
    )
    const hash = stdout.trim().split('\t')[0]
    return hash?.substring(0, 7) || null
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
    } else if (tool.name === 'codex') {
      latestVersion = await getLatestNpmVersion('@openai/codex')
    } else if (tool.name === 'copilot') {
      latestVersion = await getLatestNpmVersion('@github/copilot')
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

  // pixel-agents — directory-based detection, compare git commits
  const pixelAgentsInstalled = await isPixelAgentsInstalled()
  let paCurrentVersion = ''
  let paLatestVersion = ''
  let paUpdateAvailable = false

  if (pixelAgentsInstalled) {
    paCurrentVersion = await getPixelAgentsVersion()
    const [localCommit, remoteCommit] = await Promise.all([
      getLocalPixelAgentsCommit(),
      getRemotePixelAgentsCommit(),
    ])

    if (localCommit && remoteCommit && localCommit !== remoteCommit) {
      paUpdateAvailable = true
      paLatestVersion = `${paCurrentVersion}+${remoteCommit}`
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
          case 'codex':
            command = 'npm'
            args = ['install', '-g', '@openai/codex@latest']
            break
          case 'copilot':
            command = 'npm'
            args = ['install', '-g', '@github/copilot@latest']
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
