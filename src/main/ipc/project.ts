import { IpcMain, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync, execFile } from 'child_process'
import { promisify } from 'util'
import ignore from 'ignore'

const execFileAsync = promisify(execFile)
import { IPC_CHANNELS, Project, NpmPackageInfo, TodoEntry, ProjectStatsData, PromptTemplate, Locale } from '../../shared/types/index'
import { StorageService } from '../services/storage'
import { installActivityHooks } from '../services/activityHooks'

const storage = new StorageService()

export function registerProjectHandlers(ipcMain: IpcMain): void {
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
        gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim()
      } catch {
        // HEAD resolution failed — repo exists but may have no commits
        try {
          execSync('git rev-parse --git-dir', {
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

  // Check if a project already has a .claude folder
  ipcMain.handle(IPC_CHANNELS.PROJECT_CHECK_CLAUDE, async (_event, { path: projectPath }: { path: string }) => {
    const claudeDir = path.join(projectPath, '.claude')
    return fs.existsSync(claudeDir)
  })

  // Write Claude settings.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_CLAUDE_SETTINGS,
    async (_event, { projectPath, settings }: { projectPath: string; settings: Record<string, unknown> }) => {
      const claudeDir = path.join(projectPath, '.claude')
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true })
      }
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Write CLAUDE.md
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_CLAUDE_MD,
    async (_event, { projectPath, content }: { projectPath: string; content: string }) => {
      fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), content, 'utf-8')
      return { success: true }
    },
  )

  // Read .claude/settings.local.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_READ_CLAUDE_LOCAL_SETTINGS,
    async (_event, { projectPath }: { projectPath: string }) => {
      const localSettingsPath = path.join(projectPath, '.claude', 'settings.local.json')
      if (fs.existsSync(localSettingsPath)) {
        try {
          return JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
        } catch { return null }
      }
      return null
    },
  )

  // Write .claude/settings.local.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_CLAUDE_LOCAL_SETTINGS,
    async (_event, { projectPath, settings }: { projectPath: string; settings: Record<string, unknown> }) => {
      const claudeDir = path.join(projectPath, '.claude')
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true })
      }
      fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Read ~/.claude/settings.json (user-level, read-only)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_READ_USER_CLAUDE_SETTINGS,
    async () => {
      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
      if (fs.existsSync(userSettingsPath)) {
        try {
          return JSON.parse(fs.readFileSync(userSettingsPath, 'utf-8'))
        } catch { return null }
      }
      return null
    },
  )

  // Write user Claude settings (~/.claude/settings.json)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_WRITE_USER_CLAUDE_SETTINGS,
    async (_event, settings: Record<string, unknown>) => {
      try {
        const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
        const dir = path.dirname(userSettingsPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(userSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },
  )

  // Read managed settings (/Library/Application Support/ClaudeCode/managed-settings.json)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_READ_MANAGED_SETTINGS,
    async () => {
      try {
        const managedPath = '/Library/Application Support/ClaudeCode/managed-settings.json'
        const content = fs.readFileSync(managedPath, 'utf-8')
        return JSON.parse(content) as Record<string, unknown>
      } catch {
        return null
      }
    },
  )

  // Deploy a fresh .claude config tailored to the target project
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DEPLOY_CLAUDE,
    async (_event, { targetPath, force }: { targetPath: string; force: boolean }) => {
      const targetClaudeDir = path.join(targetPath, '.claude')
      const targetCLAUDEMD = path.join(targetPath, 'CLAUDE.md')

      // If target already has .claude, backup or bail
      if (fs.existsSync(targetClaudeDir)) {
        if (!force) {
          return { success: false, error: 'exists', hasExisting: true }
        }
        const backupDir = path.join(targetPath, '.claude-backup')
        if (fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true })
        }
        fs.renameSync(targetClaudeDir, backupDir)
        if (fs.existsSync(targetCLAUDEMD)) {
          fs.renameSync(targetCLAUDEMD, path.join(targetPath, 'CLAUDE-backup.md'))
        }
      }

      // Create fresh .claude directory
      fs.mkdirSync(targetClaudeDir, { recursive: true })

      // Default project settings (permissive for development)
      const defaultSettings = {
        permissions: {
          allow: [
            'Bash(npm run *)',
            'Bash(npx *)',
            'Bash(make *)',
            'Bash(git *)',
          ],
        },
      }
      fs.writeFileSync(
        path.join(targetClaudeDir, 'settings.json'),
        JSON.stringify(defaultSettings, null, 2),
        'utf-8',
      )

      // Import user's global commands/skills into the project if they exist
      const globalCommandsDir = path.join(os.homedir(), '.claude', 'commands')
      const projectCommandsDir = path.join(targetClaudeDir, 'commands')
      if (fs.existsSync(globalCommandsDir)) {
        fs.cpSync(globalCommandsDir, projectCommandsDir, { recursive: true })
      }

      // Write a prompt file that Claude will use to generate the CLAUDE.md
      const projectName = path.basename(targetPath)
      const initPrompt = [
        `Analyse ce projet "${projectName}" et genere un fichier CLAUDE.md a la racine.`,
        ``,
        `Le CLAUDE.md doit contenir :`,
        `1. **Nom et description** du projet (deduit du code, package.json, README, etc.)`,
        `2. **Stack technique** (langages, frameworks, outils de build)`,
        `3. **Structure du projet** (dossiers principaux et leur role)`,
        `4. **Commandes utiles** (build, test, lint, dev, etc.)`,
        `5. **Conventions de code** (si detectables : style, naming, patterns)`,
        `6. **Instructions specifiques** pour un agent IA travaillant sur ce projet`,
        ``,
        `Sois concis et pragmatique. Le CLAUDE.md est lu par Claude Code a chaque session.`,
        `Ne mets que des informations utiles pour un developpeur/agent IA.`,
        `Ecris le fichier directement avec le Write tool.`,
      ].join('\n')

      const promptPath = path.join(targetClaudeDir, '.init-prompt.md')
      fs.writeFileSync(promptPath, initPrompt, 'utf-8')

      // Install activity hooks for Claude status detection
      installActivityHooks(targetPath)

      return { success: true, initPromptPath: promptPath }
    },
  )

  // Scan project files for TODO/FIXME/HACK/NOTE/XXX comments
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SCAN_TODOS,
    async (_event, { path: projectPath }: { path: string }) => {
      const SCAN_EXTENSIONS = new Set([
        '.ts', '.tsx', '.js', '.jsx', '.css', '.md', '.py', '.go', '.rs', '.java',
      ])
      const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache'])
      const TODO_REGEX = /\b(TODO|FIXME|HACK|NOTE|XXX)\b[:\s]*(.*)/g

      const results: TodoEntry[] = []

      function scanDir(dirPath: string): void {
        let entries: fs.Dirent[]
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true })
        } catch {
          return
        }

        for (const entry of entries) {
          if (SKIP_DIRS.has(entry.name)) continue

          const fullPath = path.join(dirPath, entry.name)

          if (entry.isDirectory()) {
            scanDir(fullPath)
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()
            if (!SCAN_EXTENSIONS.has(ext)) continue

            try {
              const content = fs.readFileSync(fullPath, 'utf-8')
              const lines = content.split('\n')
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]!
                let match: RegExpExecArray | null
                TODO_REGEX.lastIndex = 0
                while ((match = TODO_REGEX.exec(line)) !== null) {
                  results.push({
                    file: path.relative(projectPath, fullPath),
                    line: i + 1,
                    type: match[1] as TodoEntry['type'],
                    text: match[2]?.trim() || '',
                    codeLine: line.trimEnd(),
                  })
                }
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }

      scanDir(projectPath)
      return results
    },
  )

  // Load ignored TODOs list from .kanbai/ignored-todos.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LOAD_IGNORED_TODOS,
    async (_event, { path: projectPath }: { path: string }) => {
      const filePath = path.join(projectPath, '.kanbai', 'ignored-todos.json')
      if (!fs.existsSync(filePath)) return []
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      } catch {
        return []
      }
    },
  )

  // Save ignored TODOs list to .kanbai/ignored-todos.json
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SAVE_IGNORED_TODOS,
    async (_event, { path: projectPath, ignoredKeys }: { path: string; ignoredKeys: string[] }) => {
      const dir = path.join(projectPath, '.kanbai')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(path.join(dir, 'ignored-todos.json'), JSON.stringify(ignoredKeys, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Get project statistics (file counts, LOC, type breakdown, largest files)
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_STATS,
    async (_event, { path: projectPath }: { path: string }) => {
      // Load .gitignore patterns
      const ig = ignore()
      ig.add(['.git'])
      const gitignorePath = path.join(projectPath, '.gitignore')
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
        ig.add(gitignoreContent)
      } catch {
        // No .gitignore — fall back to basic exclusions
        ig.add(['node_modules', 'dist', 'build', '.next', '.cache'])
      }

      const extCounts: Record<string, { count: number; lines: number }> = {}
      const allFiles: { path: string; size: number; lines: number; modifiedAt: number }[] = []
      const dirStats: Record<string, { fileCount: number; totalSize: number }> = {}
      let totalFiles = 0
      let totalLines = 0
      let totalSize = 0
      let totalDirs = 0
      let maxDepth = 0
      let binaryFiles = 0
      let emptyFiles = 0

      function scanDir(dirPath: string, depth = 0): void {
        if (depth > maxDepth) maxDepth = depth
        let entries: fs.Dirent[]
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true })
        } catch {
          return
        }

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name)
          const relativePath = path.relative(projectPath, fullPath)

          // Use ignore to check if path should be excluded
          if (ig.ignores(relativePath + (entry.isDirectory() ? '/' : ''))) continue

          if (entry.isDirectory()) {
            totalDirs++
            scanDir(fullPath, depth + 1)
          } else if (entry.isFile()) {
            totalFiles++
            const ext = path.extname(entry.name).toLowerCase() || '(no ext)'

            try {
              const stat = fs.statSync(fullPath)
              totalSize += stat.size
              const content = fs.readFileSync(fullPath, 'utf-8')
              const lineCount = content.split('\n').length

              if (stat.size === 0) emptyFiles++
              totalLines += lineCount

              // Track per-directory stats
              const dirKey = path.relative(projectPath, dirPath) || '.'
              if (!dirStats[dirKey]) dirStats[dirKey] = { fileCount: 0, totalSize: 0 }
              dirStats[dirKey]!.fileCount++
              dirStats[dirKey]!.totalSize += stat.size

              if (!extCounts[ext]) {
                extCounts[ext] = { count: 0, lines: 0 }
              }
              extCounts[ext]!.count++
              extCounts[ext]!.lines += lineCount

              allFiles.push({
                path: relativePath,
                size: stat.size,
                lines: lineCount,
                modifiedAt: stat.mtimeMs,
              })
            } catch {
              // Skip binary/unreadable files for line count
              binaryFiles++
              try {
                const stat = fs.statSync(fullPath)
                totalSize += stat.size
                allFiles.push({
                  path: relativePath,
                  size: stat.size,
                  lines: 0,
                  modifiedAt: stat.mtimeMs,
                })
              } catch {
                // Skip completely unreadable files
              }
              if (!extCounts[ext]) {
                extCounts[ext] = { count: 0, lines: 0 }
              }
              extCounts[ext]!.count++
            }
          }
        }
      }

      scanDir(projectPath)

      const fileTypeBreakdown = Object.entries(extCounts)
        .map(([ext, data]) => ({ ext, count: data.count, lines: data.lines }))
        .sort((a, b) => b.lines - a.lines)

      const largestFiles = allFiles
        .sort((a, b) => b.size - a.size)
        .slice(0, 20)

      const recentFiles = [...allFiles]
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, 15)
        .map((f) => ({ path: f.path, modifiedAt: f.modifiedAt }))

      const biggestDirs = Object.entries(dirStats)
        .map(([dirPath, data]) => ({ path: dirPath, fileCount: data.fileCount, totalSize: data.totalSize }))
        .sort((a, b) => b.totalSize - a.totalSize)
        .slice(0, 15)

      const stats: ProjectStatsData = {
        totalFiles,
        totalLines,
        totalSize,
        totalDirs,
        avgFileSize: totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0,
        maxDepth,
        binaryFiles,
        emptyFiles,
        fileTypeBreakdown,
        largestFiles,
        recentFiles,
        biggestDirs,
      }

      return stats
    },
  )

  // Project notes - stored in ~/.kanbai/notes/{projectId}.md
  const NOTES_DIR = path.join(os.homedir(), '.kanbai', 'notes')

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_GET_NOTES,
    async (_event, { projectId }: { projectId: string }) => {
      const notePath = path.join(NOTES_DIR, `${projectId}.md`)
      if (fs.existsSync(notePath)) {
        return fs.readFileSync(notePath, 'utf-8')
      }
      return ''
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SAVE_NOTES,
    async (_event, { projectId, content }: { projectId: string; content: string }) => {
      if (!fs.existsSync(NOTES_DIR)) {
        fs.mkdirSync(NOTES_DIR, { recursive: true })
      }
      fs.writeFileSync(path.join(NOTES_DIR, `${projectId}.md`), content, 'utf-8')
      return { success: true }
    },
  )

  // Prompt templates - stored in ~/.kanbai/prompt-templates.json
  const TEMPLATES_PATH = path.join(os.homedir(), '.kanbai', 'prompt-templates.json')

  type TemplateEntry = Omit<PromptTemplate, 'id' | 'createdAt'>

  const DEFAULT_TEMPLATES: Record<Locale, TemplateEntry[]> = {
    en: [
      {
        name: 'Bug fix',
        category: 'Development',
        content: 'Fix the following bug:\n\n**Problem**: \n**Steps to reproduce**: \n**Expected behavior**: \n**Actual behavior**: \n\nInvestigate the root cause and apply a minimal fix. Add a test if possible.',
      },
      {
        name: 'New feature',
        category: 'Development',
        content: 'Implement the following feature:\n\n**Feature**: \n**Requirements**:\n- \n- \n\n**Acceptance criteria**:\n- \n- \n\nFollow existing code patterns. Add tests.',
      },
      {
        name: 'Refactoring',
        category: 'Development',
        content: 'Refactor the following code:\n\n**Target**: \n**Goal**: \n**Constraints**:\n- Do not change external behavior\n- Maintain all existing tests\n- Keep backwards compatibility',
      },
      {
        name: 'Code review',
        category: 'Quality',
        content: 'Review the recent changes in this project:\n\n1. Check for bugs, edge cases, and security issues\n2. Verify error handling is adequate\n3. Check naming conventions and code readability\n4. Suggest improvements if needed\n\nProvide a summary of findings.',
      },
      {
        name: 'Write tests',
        category: 'Quality',
        content: 'Write tests for:\n\n**Target**: \n**Test types**: unit / integration / e2e\n\nCover:\n- Happy path\n- Edge cases\n- Error scenarios\n\nUse the existing test framework and follow project conventions.',
      },
      {
        name: 'Documentation',
        category: 'Documentation',
        content: 'Write documentation for:\n\n**Target**: \n**Audience**: developers / users / both\n\nInclude:\n- Overview and purpose\n- Usage examples\n- API reference (if applicable)\n- Common pitfalls',
      },
      {
        name: 'Performance optimization',
        category: 'Quality',
        content: 'Optimize performance of:\n\n**Target**: \n**Current issue**: \n**Metrics**: \n\nProfile the code, identify bottlenecks, and apply optimizations. Benchmark before and after.',
      },
      {
        name: 'Security audit',
        category: 'Quality',
        content: 'Perform a security audit on this project:\n\n1. Check for OWASP Top 10 vulnerabilities\n2. Review authentication and authorization\n3. Check for hardcoded secrets\n4. Verify input validation and sanitization\n5. Check dependencies for known vulnerabilities\n\nReport findings with severity levels.',
      },
      {
        name: 'Migration / Upgrade',
        category: 'Development',
        content: 'Migrate/upgrade the following:\n\n**From**: \n**To**: \n\n**Steps**:\n1. Assess breaking changes\n2. Update dependencies\n3. Fix compatibility issues\n4. Run and fix tests\n5. Verify functionality',
      },
      {
        name: 'API endpoint',
        category: 'Development',
        content: 'Create a new API endpoint:\n\n**Method**: GET / POST / PUT / DELETE\n**Path**: \n**Request body**: \n**Response**: \n**Authentication**: required / optional / none\n\nImplement with proper validation, error handling, and tests.',
      },
      {
        name: 'CI/CD pipeline',
        category: 'DevOps',
        content: 'Set up or improve the CI/CD pipeline:\n\n**Platform**: GitHub Actions / GitLab CI / other\n**Steps needed**:\n- Lint\n- Type check\n- Unit tests\n- Build\n- Deploy (if applicable)\n\nOptimize for speed with caching and parallelism.',
      },
      {
        name: 'Free prompt',
        category: 'General',
        content: '',
      },
    ],
    fr: [
      {
        name: 'Correction de bug',
        category: 'Development',
        content: 'Corrige le bug suivant :\n\n**Probleme** : \n**Etapes de reproduction** : \n**Comportement attendu** : \n**Comportement actuel** : \n\nAnalyse la cause racine et applique un correctif minimal. Ajoute un test si possible.',
      },
      {
        name: 'Nouvelle fonctionnalite',
        category: 'Development',
        content: 'Implemente la fonctionnalite suivante :\n\n**Fonctionnalite** : \n**Exigences** :\n- \n- \n\n**Criteres d\'acceptation** :\n- \n- \n\nSuis les patterns existants du code. Ajoute des tests.',
      },
      {
        name: 'Refactoring',
        category: 'Development',
        content: 'Refactorise le code suivant :\n\n**Cible** : \n**Objectif** : \n**Contraintes** :\n- Ne pas changer le comportement externe\n- Maintenir tous les tests existants\n- Garder la retrocompatibilite',
      },
      {
        name: 'Revue de code',
        category: 'Quality',
        content: 'Passe en revue les changements recents de ce projet :\n\n1. Chercher les bugs, cas limites et problemes de securite\n2. Verifier que la gestion d\'erreurs est adequate\n3. Verifier les conventions de nommage et la lisibilite\n4. Suggerer des ameliorations si necessaire\n\nFournis un resume des observations.',
      },
      {
        name: 'Ecrire des tests',
        category: 'Quality',
        content: 'Ecris des tests pour :\n\n**Cible** : \n**Types de tests** : unitaire / integration / e2e\n\nCouvrir :\n- Cas nominal\n- Cas limites\n- Scenarios d\'erreur\n\nUtilise le framework de test existant et suis les conventions du projet.',
      },
      {
        name: 'Documentation',
        category: 'Documentation',
        content: 'Redige la documentation pour :\n\n**Cible** : \n**Public** : developpeurs / utilisateurs / les deux\n\nInclure :\n- Vue d\'ensemble et objectif\n- Exemples d\'utilisation\n- Reference API (si applicable)\n- Pieges courants',
      },
      {
        name: 'Optimisation des performances',
        category: 'Quality',
        content: 'Optimise les performances de :\n\n**Cible** : \n**Probleme actuel** : \n**Metriques** : \n\nProfile le code, identifie les goulots d\'etranglement et applique des optimisations. Mesure avant et apres.',
      },
      {
        name: 'Audit de securite',
        category: 'Quality',
        content: 'Realise un audit de securite sur ce projet :\n\n1. Verifier les vulnerabilites OWASP Top 10\n2. Passer en revue l\'authentification et l\'autorisation\n3. Chercher les secrets codes en dur\n4. Verifier la validation et l\'assainissement des entrees\n5. Verifier les dependances pour les vulnerabilites connues\n\nRapporte les observations avec leur niveau de severite.',
      },
      {
        name: 'Migration / Mise a jour',
        category: 'Development',
        content: 'Migrer/mettre a jour les elements suivants :\n\n**De** : \n**Vers** : \n\n**Etapes** :\n1. Evaluer les changements cassants\n2. Mettre a jour les dependances\n3. Corriger les problemes de compatibilite\n4. Lancer et corriger les tests\n5. Verifier le fonctionnement',
      },
      {
        name: 'Endpoint API',
        category: 'Development',
        content: 'Cree un nouvel endpoint API :\n\n**Methode** : GET / POST / PUT / DELETE\n**Chemin** : \n**Corps de la requete** : \n**Reponse** : \n**Authentification** : requise / optionnelle / aucune\n\nImplemente avec une validation correcte, gestion d\'erreurs et tests.',
      },
      {
        name: 'Pipeline CI/CD',
        category: 'DevOps',
        content: 'Configure ou ameliore le pipeline CI/CD :\n\n**Plateforme** : GitHub Actions / GitLab CI / autre\n**Etapes necessaires** :\n- Lint\n- Verification des types\n- Tests unitaires\n- Build\n- Deploiement (si applicable)\n\nOptimise la vitesse avec du cache et du parallelisme.',
      },
      {
        name: 'Prompt libre',
        category: 'General',
        content: '',
      },
    ],
  }

  // English default names for detecting unmodified templates
  const EN_DEFAULT_NAMES = new Set(DEFAULT_TEMPLATES.en.map((t) => t.name))

  function getCurrentLocale(): Locale {
    return storage.getSettings().locale ?? 'fr'
  }

  function seedTemplates(locale: Locale): PromptTemplate[] {
    const templates = DEFAULT_TEMPLATES[locale]
    const seeded: PromptTemplate[] = templates.map((t) => ({
      ...t,
      id: uuid(),
      createdAt: Date.now(),
    }))
    saveTemplates(seeded)
    return seeded
  }

  function loadTemplates(): PromptTemplate[] {
    const locale = getCurrentLocale()
    if (fs.existsSync(TEMPLATES_PATH)) {
      try {
        const existing: PromptTemplate[] = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'))
        // If all templates are unmodified EN defaults and locale is FR, re-seed
        if (locale !== 'en' && existing.length > 0) {
          const allAreEnDefaults = existing.every((t) => EN_DEFAULT_NAMES.has(t.name))
          if (allAreEnDefaults) {
            return seedTemplates(locale)
          }
        }
        // If all templates are unmodified FR defaults and locale is EN, re-seed
        const frNames = new Set(DEFAULT_TEMPLATES.fr.map((t) => t.name))
        if (locale !== 'fr' && existing.length > 0) {
          const allAreFrDefaults = existing.every((t) => frNames.has(t.name))
          if (allAreFrDefaults) {
            return seedTemplates(locale)
          }
        }
        return existing
      } catch {
        return []
      }
    }
    // First use: seed with current locale
    return seedTemplates(locale)
  }

  function saveTemplates(templates: PromptTemplate[]): void {
    fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8')
  }

  ipcMain.handle(IPC_CHANNELS.PROMPTS_LIST, async () => {
    return loadTemplates()
  })

  ipcMain.handle(
    IPC_CHANNELS.PROMPTS_CREATE,
    async (_event, data: Omit<PromptTemplate, 'id' | 'createdAt'>) => {
      const templates = loadTemplates()
      const template: PromptTemplate = {
        id: uuid(),
        name: data.name,
        content: data.content,
        category: data.category,
        createdAt: Date.now(),
      }
      templates.push(template)
      saveTemplates(templates)
      return template
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROMPTS_UPDATE,
    async (_event, data: Partial<PromptTemplate> & { id: string }) => {
      const templates = loadTemplates()
      const idx = templates.findIndex((t) => t.id === data.id)
      if (idx >= 0) {
        templates[idx] = { ...templates[idx]!, ...data }
        saveTemplates(templates)
        return templates[idx]
      }
      return null
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROMPTS_DELETE,
    async (_event, { id }: { id: string }) => {
      const templates = loadTemplates().filter((t) => t.id !== id)
      saveTemplates(templates)
      return { success: true }
    },
  )

  // --- Claude Agents (.claude/agents/*.md) ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_LIST_AGENTS,
    async (_event, { projectPath }: { projectPath: string }) => {
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      if (!fs.existsSync(agentsDir)) return []
      try {
        const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') || f.endsWith('.md.disabled'))
        return files.map((f) => ({
          name: f.replace(/\.md(\.disabled)?$/, ''),
          filename: f,
        }))
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_READ_AGENT,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'agents', filename)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_WRITE_AGENT,
    async (_event, { projectPath, filename, content }: { projectPath: string; filename: string; content: string }) => {
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true })
      fs.writeFileSync(path.join(agentsDir, filename), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_DELETE_AGENT,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'agents', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    },
  )

  // Rename agent file (for enable/disable toggle)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_RENAME_AGENT,
    async (_event, { projectPath, oldFilename, newFilename }: { projectPath: string; oldFilename: string; newFilename: string }) => {
      try {
        const agentsDir = path.join(projectPath, '.claude', 'agents')
        fs.renameSync(path.join(agentsDir, oldFilename), path.join(agentsDir, newFilename))
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },
  )

  // --- Claude Skills (.claude/skills/*.md) ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_LIST_SKILLS,
    async (_event, { projectPath }: { projectPath: string }) => {
      const skillsDir = path.join(projectPath, '.claude', 'skills')
      if (!fs.existsSync(skillsDir)) return []
      try {
        const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md') || f.endsWith('.md.disabled'))
        return files.map((f) => ({
          name: f.replace(/\.md(\.disabled)?$/, ''),
          filename: f,
        }))
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_READ_SKILL,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'skills', filename)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_WRITE_SKILL,
    async (_event, { projectPath, filename, content }: { projectPath: string; filename: string; content: string }) => {
      const skillsDir = path.join(projectPath, '.claude', 'skills')
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true })
      fs.writeFileSync(path.join(skillsDir, filename), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_DELETE_SKILL,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'skills', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    },
  )

  // Rename skill file (for enable/disable toggle)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_RENAME_SKILL,
    async (_event, { projectPath, oldFilename, newFilename }: { projectPath: string; oldFilename: string; newFilename: string }) => {
      try {
        const skillsDir = path.join(projectPath, '.claude', 'skills')
        fs.renameSync(path.join(skillsDir, oldFilename), path.join(skillsDir, newFilename))
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },
  )

  // --- Claude Activity Hooks ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_INSTALL_HOOKS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        // Install hooks in the project and its workspace env
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          installActivityHooks(basePath)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Claude Hooks Check ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_CHECK_HOOKS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
          if (!fs.existsSync(localSettingsPath)) return { installed: false }

          try {
            const content = fs.readFileSync(localSettingsPath, 'utf-8')
            const parsed = JSON.parse(content)
            const hooks = parsed.hooks as Record<string, unknown[]> | undefined
            if (!hooks) return { installed: false }

            const hookIdentifier = 'kanbai-activity.sh'
            const preToolHooks = hooks.PreToolUse as Array<{ hooks?: Array<{ command?: string }> }> | undefined
            const stopHooks = hooks.Stop as Array<{ hooks?: Array<{ command?: string }> }> | undefined

            const hasPreTool = preToolHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes(hookIdentifier)),
            ) ?? false
            const hasStop = stopHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes(hookIdentifier)),
            ) ?? false

            if (!hasPreTool || !hasStop) return { installed: false }
          } catch {
            return { installed: false }
          }
        }
        return { installed: true }
      } catch {
        return { installed: false }
      }
    },
  )

  // --- Claude Remove Hooks ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_REMOVE_HOOKS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        const hookIdentifiers = ['kanbai-activity.sh', 'kanbai-autoapprove.sh', 'kanban-done.sh']
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
          if (!fs.existsSync(localSettingsPath)) continue
          try {
            const content = fs.readFileSync(localSettingsPath, 'utf-8')
            const parsed = JSON.parse(content)
            const hooks = parsed.hooks as Record<string, unknown[]> | undefined
            if (!hooks) continue
            for (const eventKey of Object.keys(hooks)) {
              const entries = hooks[eventKey] as Array<{ hooks?: Array<{ command?: string }> }>
              hooks[eventKey] = entries.filter((entry) =>
                !entry.hooks?.some((hk) => hookIdentifiers.some((id) => hk.command?.includes(id)))
              )
              if ((hooks[eventKey] as unknown[]).length === 0) delete hooks[eventKey]
            }
            if (Object.keys(hooks).length === 0) delete parsed.hooks
            fs.writeFileSync(localSettingsPath, JSON.stringify(parsed, null, 2), 'utf-8')
          } catch { /* skip corrupt */ }
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Claude Check Hooks Status (installed + upToDate) ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_CHECK_HOOKS_STATUS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        let installed = false
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
          if (!fs.existsSync(localSettingsPath)) continue
          try {
            const content = fs.readFileSync(localSettingsPath, 'utf-8')
            const parsed = JSON.parse(content)
            const hooks = parsed.hooks as Record<string, unknown[]> | undefined
            if (!hooks) continue
            const preToolHooks = hooks.PreToolUse as Array<{ hooks?: Array<{ command?: string }> }> | undefined
            const stopHooks = hooks.Stop as Array<{ hooks?: Array<{ command?: string }> }> | undefined
            const hasPreTool = preToolHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes('kanbai-activity.sh'))
            ) ?? false
            const hasStop = stopHooks?.some((h) =>
              h.hooks?.some((hk) => hk.command?.includes('kanbai-activity.sh'))
            ) ?? false
            if (hasPreTool && hasStop) installed = true
          } catch { /* ignore */ }
        }

        // Check upToDate: compare installed script content vs expected
        let upToDate = true
        if (installed) {
          const hooksDir = path.join(os.homedir(), '.kanbai', 'hooks')
          const scriptPath = path.join(hooksDir, 'kanbai-activity.sh')
          if (!fs.existsSync(scriptPath)) {
            upToDate = false
          }
        }

        return { installed, upToDate }
      } catch {
        return { installed: false, upToDate: false }
      }
    },
  )

  // --- Claude Export / Import Config ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_EXPORT_CONFIG,
    async (_event, { projectPath }: { projectPath: string }) => {
      const claudeDir = path.join(projectPath, '.claude')
      if (!fs.existsSync(claudeDir)) return { success: false, error: 'No .claude directory found' }
      const result = await dialog.showSaveDialog({
        defaultPath: `claude-config-${Date.now()}.tar.gz`,
        filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }
      try {
        execSync(`tar czf "${result.filePath}" -C "${projectPath}" .claude`, { timeout: 30000 })
        return { success: true, filePath: result.filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_IMPORT_CONFIG,
    async (_event, { projectPath }: { projectPath: string }) => {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'Cancelled' }
      try {
        const claudeDir = path.join(projectPath, '.claude')
        if (fs.existsSync(claudeDir)) {
          const backupName = `.claude-backup-${Date.now()}`
          fs.renameSync(claudeDir, path.join(projectPath, backupName))
        }
        execSync(`tar xzf "${result.filePaths[0]}" -C "${projectPath}"`, { timeout: 30000 })
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Claude Settings Validation & Fix ---

  /**
   * Fix a single settings file: ensures permissions is a valid object,
   * migrates top-level allow/deny into permissions, removes corrupt fields.
   */
  function fixSettingsFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(content)

      // Fix permissions: must be an object with allow/deny arrays.
      // If permissions was a string (e.g. "bypassPermissions" from old format),
      // preserve it as _kanbaiMode before resetting.
      if (typeof parsed.permissions === 'string') {
        if (!parsed._kanbaiMode) {
          parsed._kanbaiMode = parsed.permissions
        }
        parsed.permissions = {}
      } else if (typeof parsed.permissions !== 'object' || parsed.permissions === null) {
        parsed.permissions = {}
      }

      // Migrate top-level allow/deny into permissions (old Kanbai format)
      if (Array.isArray(parsed.allow)) {
        parsed.permissions.allow = [
          ...new Set([...(parsed.permissions.allow ?? []), ...parsed.allow]),
        ]
        delete parsed.allow
      }
      if (Array.isArray(parsed.deny)) {
        parsed.permissions.deny = [
          ...new Set([...(parsed.permissions.deny ?? []), ...parsed.deny]),
        ]
        delete parsed.deny
      }

      // Also handle top-level allow/deny that are non-array (e.g. string)
      if ('allow' in parsed && !Array.isArray(parsed.allow)) {
        delete parsed.allow
      }
      if ('deny' in parsed && !Array.isArray(parsed.deny)) {
        delete parsed.deny
      }

      // Ensure allow/deny are arrays of strings
      if (parsed.permissions.allow && !Array.isArray(parsed.permissions.allow)) {
        parsed.permissions.allow = []
      }
      if (parsed.permissions.deny && !Array.isArray(parsed.permissions.deny)) {
        parsed.permissions.deny = []
      }

      // Filter out non-string entries from allow/deny arrays
      if (Array.isArray(parsed.permissions.allow)) {
        parsed.permissions.allow = parsed.permissions.allow.filter(
          (v: unknown) => typeof v === 'string',
        )
      }
      if (Array.isArray(parsed.permissions.deny)) {
        parsed.permissions.deny = parsed.permissions.deny.filter(
          (v: unknown) => typeof v === 'string',
        )
      }

      // Set default allow list if empty (only for settings.json, not settings.local.json)
      if (filePath.endsWith('settings.json') && !filePath.endsWith('settings.local.json')) {
        if (!parsed.permissions.allow || parsed.permissions.allow.length === 0) {
          parsed.permissions.allow = [
            'Bash(npm run *)',
            'Bash(npx *)',
            'Bash(make *)',
            'Bash(git *)',
          ]
        }
      }

      // Fix hooks: must be an object
      if ('hooks' in parsed && typeof parsed.hooks !== 'object') {
        delete parsed.hooks
      }

      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
    } catch {
      // JSON is totally broken — write fresh default
      // For settings.local.json, write empty object; for settings.json, write defaults
      if (filePath.endsWith('settings.local.json')) {
        fs.writeFileSync(filePath, '{}', 'utf-8')
      } else {
        const defaultSettings = {
          permissions: {
            allow: [
              'Bash(npm run *)',
              'Bash(npx *)',
              'Bash(make *)',
              'Bash(git *)',
            ],
          },
        }
        fs.writeFileSync(filePath, JSON.stringify(defaultSettings, null, 2), 'utf-8')
      }
    }
  }

  /**
   * Collect all paths where .claude/settings.json may live for a given project:
   * 1. The project path itself
   * 2. The workspace env directory (if workspaceName is provided)
   */
  function getAllSettingsPaths(projectPath: string, workspaceName?: string): string[] {
    const paths = [projectPath]

    if (workspaceName) {
      // Direct lookup using workspace name → env dir
      const sanitized = workspaceName.replace(/[/\\:*?"<>|]/g, '_')
      const envDir = path.join(os.homedir(), '.kanbai', 'envs', sanitized)
      if (fs.existsSync(envDir) && envDir !== projectPath) {
        paths.push(envDir)
      }
    }

    return paths
  }

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_VALIDATE_SETTINGS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      const errors: string[] = []

      for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
        const settingsPath = path.join(basePath, '.claude', 'settings.json')
        const localSettingsPath = path.join(basePath, '.claude', 'settings.local.json')
        const prefix = basePath === projectPath ? '' : `[env] `

        const filesToCheck: [string, string][] = [
          [`${prefix}settings.json`, settingsPath],
          [`${prefix}settings.local.json`, localSettingsPath],
        ]
        for (const [label, filePath] of filesToCheck) {
          if (!fs.existsSync(filePath)) continue
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const parsed = JSON.parse(content)

            if ('permissions' in parsed && (typeof parsed.permissions !== 'object' || parsed.permissions === null)) {
              errors.push(`${label}: permissions must be an object, got ${typeof parsed.permissions}`)
            }
            if ('allow' in parsed && Array.isArray(parsed.allow)) {
              errors.push(`${label}: allow should be inside permissions object`)
            }
            if ('deny' in parsed && Array.isArray(parsed.deny)) {
              errors.push(`${label}: deny should be inside permissions object`)
            }
            if ('hooks' in parsed && typeof parsed.hooks !== 'object') {
              errors.push(`${label}: hooks must be an object`)
            }
          } catch (err) {
            errors.push(`${label}: invalid JSON — ${String(err)}`)
          }
        }
      }

      return { valid: errors.length === 0, errors }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_FIX_SETTINGS,
    async (_event, { projectPath, workspaceName }: { projectPath: string; workspaceName?: string }) => {
      try {
        for (const basePath of getAllSettingsPaths(projectPath, workspaceName)) {
          const claudeDir = path.join(basePath, '.claude')
          const settingsPath = path.join(claudeDir, 'settings.json')
          const localSettingsPath = path.join(claudeDir, 'settings.local.json')

          // Fix both settings files (same structural fixes for each)
          fixSettingsFile(settingsPath)
          fixSettingsFile(localSettingsPath)

          // Re-install activity hooks
          installActivityHooks(basePath)
        }

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )
}
