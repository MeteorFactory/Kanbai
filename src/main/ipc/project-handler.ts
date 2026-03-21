import { IpcMain, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
import { IPC_CHANNELS, Project, NpmPackageInfo } from '../../shared/types/index'
import { StorageService } from '../services/storage'

const storage = new StorageService()

export function registerProjectCoreHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async () => {
    return storage.getProjects()
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_SELECT_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Sélectionner un dossier projet',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_ADD,
    async (_event, data: { workspaceId: string; path: string }) => {
      const hasClaude = fs.existsSync(path.join(data.path, '.claude'))
      const hasGit = fs.existsSync(path.join(data.path, '.git'))

      // Inherit AI profile from workspace if available
      const workspace = storage.getWorkspace(data.workspaceId)
      const inheritedProvider = workspace?.aiProvider ?? undefined
      const inheritedDefaults = workspace?.aiDefaults ?? undefined

      const project: Project = {
        id: uuid(),
        name: path.basename(data.path),
        path: data.path,
        hasClaude: inheritedProvider ? inheritedProvider === 'claude' : hasClaude,
        hasGit,
        aiProvider: inheritedProvider,
        aiDefaults: inheritedDefaults,
        workspaceId: data.workspaceId,
        createdAt: Date.now(),
      }
      storage.addProject(project)
      return project
    },
  )

  ipcMain.handle(IPC_CHANNELS.PROJECT_REMOVE, async (_event, { id }: { id: string }) => {
    storage.deleteProject(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_SCAN_CLAUDE, async (_event, { path: projectPath }: { path: string }) => {
    const claudeDir = path.join(projectPath, '.claude')
    const hasClaude = fs.existsSync(claudeDir)
    let claudeMd: string | null = null
    let settings: Record<string, unknown> | null = null
    let localSettings: Record<string, unknown> | null = null
    let userSettings: Record<string, unknown> | null = null

    if (hasClaude) {
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
      if (fs.existsSync(claudeMdPath)) {
        claudeMd = fs.readFileSync(claudeMdPath, 'utf-8')
      }
      const settingsPath = path.join(claudeDir, 'settings.json')
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      }
      const localSettingsPath = path.join(claudeDir, 'settings.local.json')
      if (fs.existsSync(localSettingsPath)) {
        localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
      }
    }

    // Read user-level settings
    const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
    if (fs.existsSync(userSettingsPath)) {
      try {
        userSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf-8'))
      } catch { /* ignore parse errors */ }
    }

    return { hasClaude, claudeMd, settings, localSettings, userSettings }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_SCAN_INFO, async (_event, { path: projectPath }: { path: string }) => {
    // Detect Makefile
    const makefilePath = path.join(projectPath, 'Makefile')
    const hasMakefile = fs.existsSync(makefilePath)
    let makeTargets: string[] = []

    if (hasMakefile) {
      try {
        const content = fs.readFileSync(makefilePath, 'utf-8')

        // Extract .PHONY targets — these are the "command" targets (not file targets like node_modules)
        const phonyRegex = /^\.PHONY\s*:\s*(.+)$/gm
        const phonyTargets = new Set<string>()
        let phonyMatch: RegExpExecArray | null
        while ((phonyMatch = phonyRegex.exec(content)) !== null) {
          for (const t of phonyMatch[1]!.trim().split(/\s+/)) {
            phonyTargets.add(t)
          }
        }

        if (phonyTargets.size > 0) {
          // If .PHONY is declared, only show those targets (in declaration order)
          makeTargets = [...phonyTargets]
        } else {
          // Fallback: extract all target names
          const targetRegex = /^([a-zA-Z_][\w-]*)\s*:/gm
          let match: RegExpExecArray | null
          while ((match = targetRegex.exec(content)) !== null) {
            makeTargets.push(match[1]!)
          }
        }
      } catch {
        // Read failure is non-blocking
      }
    }

    // Detect Git
    const gitDir = path.join(projectPath, '.git')
    const hasGit = fs.existsSync(gitDir)
    let gitBranch: string | null = null

    if (hasGit) {
      try {
        gitBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim()
      } catch {
        // HEAD resolution failed — repo exists but may have no commits
        try {
          execFileSync('git', ['rev-parse', '--git-dir'], {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 5000,
          })
          gitBranch = '(aucun commit)'
        } catch {
          // Not a valid git repo after all
        }
      }
    }

    return { hasMakefile, makeTargets, hasGit, gitBranch }
  })

  // Check NPM packages for updates and deprecations
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CHECK_PACKAGES,
    async (_event, { path: projectPath }: { path: string }) => {
      const pkgPath = path.join(projectPath, 'package.json')
      if (!fs.existsSync(pkgPath)) {
        return { packages: [] }
      }

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        const allDeps: Record<string, string> = { ...pkg.dependencies }
        const allDevDeps: Record<string, string> = { ...pkg.devDependencies }

        // Use npm outdated --json (single call, much faster than per-package npm view)
        let outdatedData: Record<string, { current: string; wanted: string; latest: string; deprecated?: string }> = {}
        try {
          const { stdout } = await execFileAsync('npm', ['outdated', '--json'], { cwd: projectPath, timeout: 30000 })
          outdatedData = JSON.parse(stdout || '{}')
        } catch (err: unknown) {
          // npm outdated returns exit code 1 when there are outdated packages, that's normal
          const execErr = err as { stdout?: string }
          if (execErr.stdout) {
            outdatedData = JSON.parse(execErr.stdout || '{}')
          }
        }

        const packages: NpmPackageInfo[] = []
        const addPackages = (deps: Record<string, string>, type: 'dependency' | 'devDependency') => {
          for (const [name, version] of Object.entries(deps)) {
            const outdated = outdatedData[name]
            const info: NpmPackageInfo = {
              name,
              currentVersion: outdated?.current || version.replace(/^[\^~]/, ''),
              latestVersion: outdated?.latest || null,
              isDeprecated: !!outdated?.deprecated,
              updateAvailable: !!outdated?.latest && outdated.current !== outdated.latest,
              type,
            }
            if (outdated?.deprecated) {
              info.deprecationMessage = outdated.deprecated
            }
            packages.push(info)
          }
        }
        addPackages(allDeps, 'dependency')
        addPackages(allDevDeps, 'devDependency')

        return { packages }
      } catch {
        return { packages: [] }
      }
    },
  )

  // Update NPM packages
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_PACKAGE,
    async (_event, { projectPath, packageName }: { projectPath: string; packageName?: string }) => {
      try {
        // Use npm install <pkg>@latest for single packages (crosses major versions)
        // Use npm update for all packages (within semver range)
        const args = packageName ? ['install', `${packageName}@latest`] : ['update']

        try {
          const { stdout } = await execFileAsync('npm', args, { cwd: projectPath, timeout: 120000 })
          return { success: true, output: stdout }
        } catch (installErr: unknown) {
          // Fallback: retry with --legacy-peer-deps for dependency conflicts
          const errMsg = String((installErr as { stderr?: string }).stderr ?? '')
          if (errMsg.includes('ERESOLVE') || errMsg.includes('peer dep') || errMsg.includes('Could not resolve dependency')) {
            const { stdout } = await execFileAsync('npm', [...args, '--legacy-peer-deps'], { cwd: projectPath, timeout: 120000 })
            return { success: true, output: stdout }
          }
          throw installErr
        }
      } catch (err: unknown) {
        const execErr = err as { stderr?: string; message?: string }
        return { success: false, error: execErr.stderr || execErr.message || 'npm update failed' }
      }
    },
  )
}
