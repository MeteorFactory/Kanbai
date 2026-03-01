import { IpcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS } from '../../shared/types'
import { IS_WIN } from '../../shared/platform'
import { installActivityHooks } from '../services/activityHooks'

const ENVS_DIR = path.join(os.homedir(), '.mirehub', 'envs')

function ensureEnvsDir(): void {
  if (!fs.existsSync(ENVS_DIR)) {
    fs.mkdirSync(ENVS_DIR, { recursive: true })
  }
}

function sanitizeDirName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_')
}

function getEnvDir(workspaceName: string): string {
  return path.join(ENVS_DIR, sanitizeDirName(workspaceName))
}

export function deleteWorkspaceEnv(workspaceName: string): void {
  const envDir = getEnvDir(workspaceName)
  if (fs.existsSync(envDir)) {
    fs.rmSync(envDir, { recursive: true, force: true })
  }
}

export function renameWorkspaceEnv(oldName: string, newName: string): void {
  const oldDir = getEnvDir(oldName)
  const newDir = getEnvDir(newName)
  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    fs.renameSync(oldDir, newDir)
  }
}

/**
 * Copy .claude/ and CLAUDE.md from the first project that has Claude rules
 * into the workspace env root directory. This ensures Claude picks up
 * the project's rules when running from the env directory.
 */
function applyCludeRulesToEnv(envDir: string, projectPaths: string[]): void {
  // Remove existing Claude rules in env root (they are copies, not symlinks)
  const envClaudeDir = path.join(envDir, '.claude')
  const envClaudeMd = path.join(envDir, 'CLAUDE.md')
  if (fs.existsSync(envClaudeDir) && !fs.lstatSync(envClaudeDir).isSymbolicLink()) {
    fs.rmSync(envClaudeDir, { recursive: true, force: true })
  }
  if (fs.existsSync(envClaudeMd) && !fs.lstatSync(envClaudeMd).isSymbolicLink()) {
    fs.unlinkSync(envClaudeMd)
  }

  // Find the first project with .claude rules
  for (const projectPath of projectPaths) {
    const claudeDir = path.join(projectPath, '.claude')
    const claudeMd = path.join(projectPath, 'CLAUDE.md')
    const hasClaudeDir = fs.existsSync(claudeDir)
    const hasClaudeMd = fs.existsSync(claudeMd)

    if (hasClaudeDir || hasClaudeMd) {
      if (hasClaudeDir) {
        fs.cpSync(claudeDir, envClaudeDir, { recursive: true })
      }
      if (hasClaudeMd) {
        fs.copyFileSync(claudeMd, envClaudeMd)
      }
      break // Only use the first project's rules
    }
  }
}

/**
 * Resolve the path to the compiled MCP server entry point.
 * In development (vite), use tsx to run the source directly.
 * In production (packaged), use the unpacked dist.
 */
function getMcpServerConfig(workspaceId: string, workspaceName: string): {
  command: string
  args: string[]
  env: Record<string, string>
} {
  const env = {
    MIREHUB_WORKSPACE_ID: workspaceId,
    MIREHUB_WORKSPACE_NAME: workspaceName,
  }

  if (!app.isPackaged) {
    // Development: run from source via tsx
    const projectRoot = path.resolve(__dirname, '..', '..', '..')
    const entryPoint = path.join(projectRoot, 'src', 'mcp-server', 'index.ts')
    return {
      command: 'npx',
      args: ['tsx', entryPoint],
      env,
    }
  }

  // Production: compiled JS in unpacked asar
  const appPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
  const entryPoint = path.join(appPath, 'dist', 'mcp-server', 'index.js')
  return {
    command: 'node',
    args: [entryPoint],
    env,
  }
}

/**
 * Register the Mirehub MCP server in Claude's settings.local.json
 * so Claude automatically has access to kanban, analysis, and project tools.
 */
function installMcpServer(
  envDir: string,
  workspaceId: string,
  workspaceName: string,
): void {
  const claudeDir = path.join(envDir, '.claude')
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true })
  }

  const settingsPath = path.join(claudeDir, 'settings.local.json')
  let settings: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch { /* ignore corrupt file */ }
  }

  if (!settings.mcpServers) {
    settings.mcpServers = {}
  }
  const servers = settings.mcpServers as Record<string, unknown>

  const config = getMcpServerConfig(workspaceId, workspaceName)
  servers['mirehub'] = config

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function registerWorkspaceEnvHandlers(ipcMain: IpcMain): void {
  // Setup workspace env: create symlinks to all project paths
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_ENV_SETUP,
    async (
      _event,
      { workspaceName, workspaceId, projectPaths }: { workspaceName: string; workspaceId?: string; projectPaths: string[] },
    ) => {
      try {
        ensureEnvsDir()
        const envDir = getEnvDir(workspaceName)

        // Clean existing env dir: remove old symlinks/junctions AND leftover
        // copied directories (from a previous fs.cpSync fallback).
        // Preserve .claude/ and CLAUDE.md which are managed by applyCludeRulesToEnv.
        const PRESERVED = new Set(['.claude', 'CLAUDE.md'])
        if (fs.existsSync(envDir)) {
          const existing = fs.readdirSync(envDir)
          for (const entry of existing) {
            if (PRESERVED.has(entry)) continue
            const entryPath = path.join(envDir, entry)
            const stat = fs.lstatSync(entryPath)
            if (stat.isSymbolicLink()) {
              fs.unlinkSync(entryPath)
            } else if (stat.isDirectory()) {
              fs.rmSync(entryPath, { recursive: true, force: true })
            }
          }
        } else {
          fs.mkdirSync(envDir, { recursive: true })
        }

        // Create symlinks for each project
        for (const projectPath of projectPaths) {
          const folderName = path.basename(projectPath)
          const linkPath = path.join(envDir, folderName)

          // Handle duplicate folder names by appending a suffix
          let finalLink = linkPath
          let suffix = 2
          while (fs.existsSync(finalLink)) {
            finalLink = `${linkPath}-${suffix++}`
          }

          try {
            // On Windows, use 'junction' — junctions do NOT require admin
            // privileges or Developer Mode (unlike 'dir' symlinks).
            fs.symlinkSync(projectPath, finalLink, IS_WIN ? 'junction' : 'dir')
          } catch {
            throw new Error(`Failed to create symlink: ${projectPath} -> ${finalLink}`)
          }
        }

        // Auto-apply Claude rules from the first project that has them
        applyCludeRulesToEnv(envDir, projectPaths)

        // Install activity hooks in the env directory for Claude status detection
        installActivityHooks(envDir)

        // Also install hooks in each project that has .claude/
        for (const projectPath of projectPaths) {
          if (fs.existsSync(path.join(projectPath, '.claude'))) {
            installActivityHooks(projectPath)
          }
        }

        // Register the Mirehub MCP server so Claude gets kanban/analysis/project tools
        if (workspaceId) {
          try {
            installMcpServer(envDir, workspaceId, workspaceName)
          } catch { /* non-critical: MCP registration failure should not block env setup */ }
        }

        return { success: true, envPath: envDir }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Get the env path for a workspace
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_ENV_PATH,
    async (_event, { workspaceName }: { workspaceName: string }) => {
      const envDir = getEnvDir(workspaceName)
      if (fs.existsSync(envDir)) {
        return envDir
      }
      return null
    },
  )

  // Delete workspace env directory
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_ENV_DELETE,
    async (_event, { workspaceName }: { workspaceName: string }) => {
      try {
        deleteWorkspaceEnv(workspaceName)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )
}
