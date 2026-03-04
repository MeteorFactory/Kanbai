import { IpcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS } from '../../shared/types'
import { IS_WIN } from '../../shared/platform'
import { installActivityHooks } from '../services/activityHooks'

const ENVS_DIR = path.join(os.homedir(), '.kanbai', 'envs')

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
 * AI provider config directory names and memory files.
 * Used to preserve them during env cleanup and copy them from projects.
 */
const AI_CONFIG_DIRS = ['.claude', '.codex', '.copilot', '.gemini'] as const
const AI_MEMORY_FILES: Record<string, string> = {
  '.claude': 'CLAUDE.md',
  '.gemini': 'GEMINI.md',
}

/**
 * Required sections that must always be present in CLAUDE.md.
 * These are injected automatically when missing, even after AI memory refactors.
 */
const REQUIRED_CLAUDE_MD_SECTIONS: Array<{ heading: string; content: string }> = [
  {
    heading: '## Execution Rules',
    content: `## Execution Rules

When executing kanban tickets or task files, start implementation immediately after reading the ticket. Limit exploration to 2-3 minutes max. Do NOT spend entire sessions planning — produce code changes early and iterate.`,
  },
  {
    heading: '## Testing',
    content: `## Testing

After implementing any feature, always run the existing test suite before reporting completion. Fix any failing tests before marking work as done.`,
  },
  {
    heading: '## Code Patterns / Gotchas',
    content: `## Code Patterns / Gotchas

When generating shell scripts or wrapper scripts, never use heredoc syntax inside template literals. Write files using direct fs.writeFileSync or equivalent with properly escaped content.`,
  },
]

/**
 * Ensure CLAUDE.md contains all required sections.
 * If the file does not exist, create it with the required sections.
 * If it exists but is missing sections, append them at the top (after the first line).
 */
function ensureRequiredClaudeMdSections(envDir: string): void {
  const claudeMdPath = path.join(envDir, 'CLAUDE.md')

  if (!fs.existsSync(claudeMdPath)) {
    // No CLAUDE.md exists — create a default one
    const content = REQUIRED_CLAUDE_MD_SECTIONS.map((s) => s.content).join('\n\n')
    fs.writeFileSync(claudeMdPath, content + '\n', 'utf-8')
    return
  }

  const existing = fs.readFileSync(claudeMdPath, 'utf-8')
  const missingSections: string[] = []

  for (const section of REQUIRED_CLAUDE_MD_SECTIONS) {
    if (!existing.includes(section.heading)) {
      missingSections.push(section.content)
    }
  }

  if (missingSections.length === 0) return

  // Append missing sections at the end of the file
  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  const updated = existing + separator + missingSections.join('\n\n') + '\n'
  fs.writeFileSync(claudeMdPath, updated, 'utf-8')
}

/**
 * Copy AI config directories and memory files from the first project
 * that has them into the workspace env root directory.
 * Handles all AI providers: Claude, Codex, Copilot, Gemini.
 */
function applyAiRulesToEnv(envDir: string, projectPaths: string[]): void {
  for (const configDir of AI_CONFIG_DIRS) {
    const envConfigDir = path.join(envDir, configDir)
    const memoryFile = AI_MEMORY_FILES[configDir]
    const envMemoryFile = memoryFile ? path.join(envDir, memoryFile) : null

    // Remove existing copies (not symlinks)
    if (fs.existsSync(envConfigDir) && !fs.lstatSync(envConfigDir).isSymbolicLink()) {
      fs.rmSync(envConfigDir, { recursive: true, force: true })
    }
    if (envMemoryFile && fs.existsSync(envMemoryFile) && !fs.lstatSync(envMemoryFile).isSymbolicLink()) {
      fs.unlinkSync(envMemoryFile)
    }

    // Find the first project with this AI's config
    for (const projectPath of projectPaths) {
      const projConfigDir = path.join(projectPath, configDir)
      const projMemoryFile = memoryFile ? path.join(projectPath, memoryFile) : null
      const hasConfigDir = fs.existsSync(projConfigDir)
      const hasMemoryFile = projMemoryFile ? fs.existsSync(projMemoryFile) : false

      if (hasConfigDir || hasMemoryFile) {
        if (hasConfigDir) {
          fs.cpSync(projConfigDir, envConfigDir, { recursive: true })
        }
        if (hasMemoryFile && projMemoryFile) {
          fs.copyFileSync(projMemoryFile, envMemoryFile!)
        }
        break // Only use the first project's rules per AI
      }
    }
  }

  // Always ensure CLAUDE.md has required sections (even after copy or fresh creation)
  ensureRequiredClaudeMdSections(envDir)
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
    KANBAI_WORKSPACE_ID: workspaceId,
    KANBAI_WORKSPACE_NAME: workspaceName,
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
 * Register the Kanbai MCP server in Claude's settings.local.json
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
  servers['kanbai'] = config

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
        // Preserve AI config dirs and memory files which are managed by applyAiRulesToEnv.
        const PRESERVED = new Set([
          ...AI_CONFIG_DIRS,
          ...Object.values(AI_MEMORY_FILES),
        ])
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

        // Auto-apply AI config rules from the first project that has them
        applyAiRulesToEnv(envDir, projectPaths)

        // Install activity hooks for all AI providers in the env directory
        await installActivityHooks(envDir, workspaceName, 'claude')
        await installActivityHooks(envDir, workspaceName, 'codex')
        await installActivityHooks(envDir, workspaceName, 'copilot')
        await installActivityHooks(envDir, workspaceName, 'gemini')

        // Also install hooks in each project for the AI providers they have configured
        for (const projectPath of projectPaths) {
          if (fs.existsSync(path.join(projectPath, '.claude'))) {
            await installActivityHooks(projectPath, workspaceName, 'claude')
          }
          if (fs.existsSync(path.join(projectPath, '.codex'))) {
            await installActivityHooks(projectPath, workspaceName, 'codex')
          }
          if (fs.existsSync(path.join(projectPath, '.copilot'))) {
            await installActivityHooks(projectPath, workspaceName, 'copilot')
          }
          if (fs.existsSync(path.join(projectPath, '.gemini'))) {
            await installActivityHooks(projectPath, workspaceName, 'gemini')
          }
        }

        // Register the Kanbai MCP server so Claude gets kanban/analysis/project tools
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
