import { IpcMain } from 'electron'
import fsSync from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, ClaudePlugin } from '../../shared/types'
import { crossExecFile, getExtendedToolPaths, PATH_SEP } from '../../shared/platform'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins')
const INSTALLED_PLUGINS_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const MARKETPLACES_DIR = path.join(PLUGINS_DIR, 'marketplaces')

interface InstalledPluginsData {
  version: number
  plugins: Record<string, Array<{
    scope: string
    installPath: string
    version: string
    installedAt: string
    lastUpdated: string
    gitCommitSha: string
  }>>
}

interface ClaudeSettings {
  enabledPlugins?: Record<string, boolean>
  [key: string]: unknown
}

function resolveNvmBinPaths(): string[] {
  const home = os.homedir()
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

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const content = fsSync.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

function getReadmeDescription(pluginDir: string): string {
  try {
    const readmePath = path.join(pluginDir, 'README.md')
    const content = fsSync.readFileSync(readmePath, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim())
    // Skip the title line (starts with #), take the next non-empty line
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#') && !lines[i].startsWith('---')) {
        return lines[i].trim().slice(0, 200)
      }
    }
    return ''
  } catch {
    return ''
  }
}

async function listPlugins(): Promise<ClaudePlugin[]> {
  const installed = readJsonSafe<InstalledPluginsData>(INSTALLED_PLUGINS_FILE)
  const settings = readJsonSafe<ClaudeSettings>(SETTINGS_FILE)
  const enabledPlugins = settings?.enabledPlugins ?? {}

  const plugins: ClaudePlugin[] = []
  const seenPlugins = new Set<string>()

  // Scan all marketplaces
  let marketplaces: string[]
  try {
    marketplaces = fsSync.readdirSync(MARKETPLACES_DIR)
      .filter((d) => {
        try {
          return fsSync.statSync(path.join(MARKETPLACES_DIR, d)).isDirectory()
        } catch { return false }
      })
  } catch {
    return []
  }

  for (const marketplace of marketplaces) {
    const marketplaceDir = path.join(MARKETPLACES_DIR, marketplace)

    // Scan official plugins
    const officialDir = path.join(marketplaceDir, 'plugins')
    try {
      const officialPlugins = fsSync.readdirSync(officialDir)
        .filter((d) => {
          try {
            return fsSync.statSync(path.join(officialDir, d)).isDirectory()
          } catch { return false }
        })

      for (const pluginName of officialPlugins) {
        const key = `${pluginName}@${marketplace}`
        if (seenPlugins.has(key)) continue
        seenPlugins.add(key)

        const installedEntries = installed?.plugins?.[key]
        const isInstalled = Array.isArray(installedEntries) && installedEntries.length > 0
        const isEnabled = enabledPlugins[key] === true

        plugins.push({
          name: pluginName,
          marketplace,
          description: getReadmeDescription(path.join(officialDir, pluginName)),
          installed: isInstalled,
          enabled: isEnabled,
          version: isInstalled ? installedEntries[0].version : undefined,
          installedAt: isInstalled ? installedEntries[0].installedAt : undefined,
          type: 'official',
        })
      }
    } catch { /* no official plugins dir */ }

    // Scan external plugins
    const externalDir = path.join(marketplaceDir, 'external_plugins')
    try {
      const externalPlugins = fsSync.readdirSync(externalDir)
        .filter((d) => {
          try {
            return fsSync.statSync(path.join(externalDir, d)).isDirectory()
          } catch { return false }
        })

      for (const pluginName of externalPlugins) {
        const key = `${pluginName}@${marketplace}`
        if (seenPlugins.has(key)) continue
        seenPlugins.add(key)

        const installedEntries = installed?.plugins?.[key]
        const isInstalled = Array.isArray(installedEntries) && installedEntries.length > 0
        const isEnabled = enabledPlugins[key] === true

        plugins.push({
          name: pluginName,
          marketplace,
          description: getReadmeDescription(path.join(externalDir, pluginName)),
          installed: isInstalled,
          enabled: isEnabled,
          version: isInstalled ? installedEntries[0].version : undefined,
          installedAt: isInstalled ? installedEntries[0].installedAt : undefined,
          type: 'external',
        })
      }
    } catch { /* no external plugins dir */ }
  }

  // Sort: installed first, then alphabetical
  plugins.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return plugins
}

async function installPlugin(pluginName: string): Promise<{ success: boolean; error?: string }> {
  try {
    await crossExecFile('claude', ['plugin', 'install', pluginName], {
      timeout: 60000,
      env: enrichedEnv(),
    })
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error }
  }
}

async function uninstallPlugin(pluginName: string): Promise<{ success: boolean; error?: string }> {
  try {
    await crossExecFile('claude', ['plugin', 'uninstall', pluginName], {
      timeout: 30000,
      env: enrichedEnv(),
    })
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error }
  }
}

export function registerClaudePluginsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_LIST, async () => {
    return listPlugins()
  })

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL, async (_event, { pluginName }: { pluginName: string }) => {
    if (typeof pluginName !== 'string' || !pluginName.trim()) {
      return { success: false, error: 'Invalid plugin name' }
    }
    return installPlugin(pluginName.trim())
  })

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_UNINSTALL, async (_event, { pluginName }: { pluginName: string }) => {
    if (typeof pluginName !== 'string' || !pluginName.trim()) {
      return { success: false, error: 'Invalid plugin name' }
    }
    return uninstallPlugin(pluginName.trim())
  })
}
