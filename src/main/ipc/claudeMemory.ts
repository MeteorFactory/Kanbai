import { IpcMain, dialog, app, shell } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, RuleEntry, TemplateRuleEntry } from '../../shared/types'

/**
 * Sanitize a project path for Claude Code memory directory naming.
 * Mirrors how Claude Code sanitizes: slashes → dashes, remove leading dash.
 */
function sanitizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-').replace(/^-/, '')
}

export function registerClaudeMemoryHandlers(ipcMain: IpcMain): void {
  // Read auto-memory: MEMORY.md + topic files
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_READ_AUTO,
    async (_event, { projectPath }: { projectPath: string }) => {
      const sanitized = sanitizeProjectPath(projectPath)
      const memoryDir = path.join(os.homedir(), '.claude', 'projects', sanitized, 'memory')
      const result: { content: string; topicFiles: { name: string; path: string }[] } = {
        content: '',
        topicFiles: [],
      }
      if (!fs.existsSync(memoryDir)) return result
      const memoryMd = path.join(memoryDir, 'MEMORY.md')
      if (fs.existsSync(memoryMd)) {
        result.content = fs.readFileSync(memoryMd, 'utf-8')
      }
      const files = fs.readdirSync(memoryDir).filter((f) => f !== 'MEMORY.md' && f.endsWith('.md'))
      result.topicFiles = files.map((f) => ({ name: f, path: path.join(memoryDir, f) }))
      return result
    },
  )

  // Toggle auto-memory in settings.json
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_TOGGLE_AUTO,
    async (_event, { projectPath, enabled }: { projectPath: string; enabled: boolean }) => {
      const settingsPath = path.join(projectPath, '.claude', 'settings.json')
      let settings: Record<string, unknown> = {}
      if (fs.existsSync(settingsPath)) {
        try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) } catch { /* */ }
      }
      settings.autoMemoryEnabled = enabled
      const dir = path.dirname(settingsPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Parse YAML frontmatter from rule content
  function parseFrontmatter(content: string): {
    paths: string[]
    author?: string
    authorUrl?: string
    coAuthors?: string[]
  } {
    const result: { paths: string[]; author?: string; authorUrl?: string; coAuthors?: string[] } = { paths: [] }
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch || !fmMatch[1]) return result
    const fm = fmMatch[1]
    const pathsMatch = fm.match(/paths:\s*\n((?:\s+-\s+.+\n?)*)/)
    if (pathsMatch && pathsMatch[1]) {
      result.paths = pathsMatch[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    }
    const authorMatch = fm.match(/^author:\s*(.+)$/m)
    if (authorMatch && authorMatch[1]) result.author = authorMatch[1].trim().replace(/^["']|["']$/g, '')
    const authorUrlMatch = fm.match(/^authorUrl:\s*(.+)$/m)
    if (authorUrlMatch && authorUrlMatch[1]) result.authorUrl = authorUrlMatch[1].trim().replace(/^["']|["']$/g, '')
    const coAuthorsMatch = fm.match(/coAuthors:\s*\n((?:\s+-\s+.+\n?)*)/)
    if (coAuthorsMatch && coAuthorsMatch[1]) {
      result.coAuthors = coAuthorsMatch[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    }
    return result
  }

  // Recursively list all .md files in a directory
  function listMdFilesRecursive(dir: string, baseDir: string): RuleEntry[] {
    if (!fs.existsSync(dir)) return []
    const entries: RuleEntry[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        entries.push(...listMdFilesRecursive(fullPath, baseDir))
      } else if (entry.name.endsWith('.md') || entry.isSymbolicLink()) {
        const stat = fs.lstatSync(fullPath)
        const isSymlink = stat.isSymbolicLink()
        if (!entry.name.endsWith('.md') && isSymlink) {
          try {
            const target = fs.readlinkSync(fullPath)
            if (!target.endsWith('.md')) continue
          } catch { continue }
        }
        let symlinkTarget = ''
        if (isSymlink) {
          try { symlinkTarget = fs.readlinkSync(fullPath) } catch { /* */ }
        }
        let content = ''
        try { content = fs.readFileSync(fullPath, 'utf-8') } catch { /* broken symlink */ }
        const fm = parseFrontmatter(content)
        const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/')
        entries.push({
          relativePath,
          filename: entry.name,
          fullPath,
          paths: fm.paths,
          content,
          isSymlink,
          symlinkTarget,
          author: fm.author,
          authorUrl: fm.authorUrl,
          coAuthors: fm.coAuthors,
        })
      }
    }
    return entries
  }

  // List subdirectories recursively (relative paths)
  function listDirectoriesRecursive(dir: string, baseDir: string): string[] {
    if (!fs.existsSync(dir)) return []
    const dirs: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name)
        const rel = path.relative(baseDir, fullPath)
        dirs.push(rel)
        dirs.push(...listDirectoriesRecursive(fullPath, baseDir))
      }
    }
    return dirs
  }

  // List rules from .claude/rules/ (recursive)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_LIST_RULES,
    async (_event, { projectPath }: { projectPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      if (!fs.existsSync(rulesDir)) return { rules: [], directories: [] }
      const rules = listMdFilesRecursive(rulesDir, rulesDir)
      const directories = listDirectoriesRecursive(rulesDir, rulesDir)
      return { rules, directories }
    },
  )

  // Read a single rule (supports relative paths like "conventions/core.md")
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_READ_RULE,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'rules', filename)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  // Write a rule (supports relative paths, creates intermediate directories)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_WRITE_RULE,
    async (_event, { projectPath, filename, content }: { projectPath: string; filename: string; content: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      const filePath = path.join(rulesDir, filename)
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    },
  )

  // Clean up empty parent directories up to the rules root
  function cleanEmptyParents(filePath: string, stopAt: string): void {
    let dir = path.dirname(filePath)
    while (dir !== stopAt && dir.startsWith(stopAt)) {
      try {
        const entries = fs.readdirSync(dir)
        if (entries.length === 0) {
          fs.rmdirSync(dir)
          dir = path.dirname(dir)
        } else {
          break
        }
      } catch { break }
    }
  }

  // Delete a rule (cleans empty parent directories)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_DELETE_RULE,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      const filePath = path.join(rulesDir, filename)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        cleanEmptyParents(filePath, rulesDir)
      }
      return { success: true }
    },
  )

  // Read a generic memory file (CLAUDE.md, CLAUDE.local.md, ~/.claude/CLAUDE.md)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_READ_FILE,
    async (_event, { filePath }: { filePath: string }) => {
      const resolved = filePath.replace(/^~/, os.homedir())
      if (!fs.existsSync(resolved)) return null
      return fs.readFileSync(resolved, 'utf-8')
    },
  )

  // Write a generic memory file
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_WRITE_FILE,
    async (_event, { filePath, content }: { filePath: string; content: string }) => {
      const resolved = filePath.replace(/^~/, os.homedir())
      const dir = path.dirname(resolved)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(resolved, content, 'utf-8')
      return { success: true }
    },
  )

  // Read managed CLAUDE.md (macOS: ~/Library/Application Support/ClaudeCode/CLAUDE.md)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_READ_MANAGED,
    async () => {
      const managedPath = path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeCode', 'CLAUDE.md')
      if (!fs.existsSync(managedPath)) return null
      return fs.readFileSync(managedPath, 'utf-8')
    },
  )

  // Export rules as JSON file
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_EXPORT_RULES,
    async (_event, { projectPath }: { projectPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      if (!fs.existsSync(rulesDir)) return { success: false, error: 'No rules directory' }
      const files = (fs.readdirSync(rulesDir, { recursive: true }) as string[]).filter((f) => f.endsWith('.md'))
      if (files.length === 0) return { success: false, error: 'No rules to export' }
      const rules = files.map((f) => ({
        filename: f,
        content: fs.readFileSync(path.join(rulesDir, f), 'utf-8'),
      }))
      const result = await dialog.showSaveDialog({
        title: 'Export Rules',
        defaultPath: 'claude-rules.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return { success: false }
      fs.writeFileSync(result.filePath, JSON.stringify(rules, null, 2), 'utf-8')
      return { success: true }
    },
  )

  // Import rules from JSON file
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_IMPORT_RULES,
    async (_event, { projectPath }: { projectPath: string }) => {
      const result = await dialog.showOpenDialog({
        title: 'Import Rules',
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Markdown', extensions: ['md'] },
        ],
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled || result.filePaths.length === 0) return { success: false }
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true })
      for (const filePath of result.filePaths) {
        const ext = path.extname(filePath).toLowerCase()
        if (ext === '.json') {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<{ filename: string; content: string }>
          for (const rule of data) {
            fs.writeFileSync(path.join(rulesDir, rule.filename), rule.content, 'utf-8')
          }
        } else if (ext === '.md') {
          const filename = path.basename(filePath)
          fs.copyFileSync(filePath, path.join(rulesDir, filename))
        }
      }
      return { success: true }
    },
  )

  // Initialize project CLAUDE.md with template
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_INIT,
    async (_event, { projectPath }: { projectPath: string }) => {
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
      if (fs.existsSync(claudeMdPath)) return { success: false, error: 'CLAUDE.md already exists' }
      const template = `# Project Instructions

## Overview
<!-- Describe your project here -->

## Code Conventions
<!-- Add your coding standards -->

## Important Files
<!-- List key files and their purposes -->
`
      fs.writeFileSync(claudeMdPath, template, 'utf-8')
      return { success: true }
    },
  )

  // Initialize default rule files if none exist
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_INIT_DEFAULT_RULES,
    async (_event, { projectPath }: { projectPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true })
      const existing = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'))
      if (existing.length > 0) return { success: false, created: [] }
      const defaults: Array<{ filename: string; content: string }> = [
        { filename: 'preferences.md', content: '# Preferences\n\n<!-- Vos préférences de codage personnelles -->\n' },
        { filename: 'workflows.md', content: '# Workflows\n\n<!-- Vos flux de travail préférés -->\n' },
      ]
      for (const d of defaults) {
        fs.writeFileSync(path.join(rulesDir, d.filename), d.content, 'utf-8')
      }
      return { success: true, created: defaults.map((d) => d.filename) }
    },
  )

  // Validate that a path doesn't escape the base directory (path traversal prevention)
  function validatePath(basePath: string, relativePath: string): string {
    const resolved = path.resolve(basePath, relativePath)
    if (!resolved.startsWith(basePath + path.sep) && resolved !== basePath) {
      throw new Error('Path traversal detected')
    }
    return resolved
  }

  // Move a rule file within the rules directory
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_MOVE_RULE,
    async (_event, { projectPath, oldPath, newPath }: { projectPath: string; oldPath: string; newPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      const src = validatePath(rulesDir, oldPath)
      const dst = validatePath(rulesDir, newPath)
      if (!fs.existsSync(src)) return { success: false, error: 'Source not found' }
      const dstDir = path.dirname(dst)
      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
      fs.renameSync(src, dst)
      cleanEmptyParents(src, rulesDir)
      return { success: true }
    },
  )

  // Create a rule directory
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_CREATE_RULE_DIR,
    async (_event, { projectPath, dirPath }: { projectPath: string; dirPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      const fullDir = validatePath(rulesDir, dirPath)
      fs.mkdirSync(fullDir, { recursive: true })
      return { success: true }
    },
  )

  // Rename a rule directory
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_RENAME_RULE_DIR,
    async (_event, { projectPath, oldPath, newPath }: { projectPath: string; oldPath: string; newPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      const src = validatePath(rulesDir, oldPath)
      const dst = validatePath(rulesDir, newPath)
      if (!fs.existsSync(src)) return { success: false, error: 'Directory not found' }
      fs.renameSync(src, dst)
      return { success: true }
    },
  )

  // Delete a rule directory
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_DELETE_RULE_DIR,
    async (_event, { projectPath, dirPath }: { projectPath: string; dirPath: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      const fullDir = validatePath(rulesDir, dirPath)
      if (!fs.existsSync(fullDir)) return { success: true }
      fs.rmSync(fullDir, { recursive: true, force: true })
      cleanEmptyParents(fullDir, rulesDir)
      return { success: true }
    },
  )

  // Resolve templates directory (prefer synced cache over bundled)
  function getTemplatesDir(): string {
    const cachedDir = path.join(os.homedir(), '.mirehub', 'cache', 'rule-templates')
    if (fs.existsSync(cachedDir)) return cachedDir
    if (app.isPackaged) return path.join(process.resourcesPath, 'rule-templates')
    return path.join(__dirname, '..', '..', 'src', 'main', 'assets', 'rule-templates')
  }

  // List all template rules
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_LIST_TEMPLATES,
    async () => {
      const templatesDir = getTemplatesDir()
      if (!fs.existsSync(templatesDir)) return []
      const templates: TemplateRuleEntry[] = []
      function walkTemplates(dir: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            walkTemplates(fullPath)
          } else if (entry.name.endsWith('.md')) {
            const relativePath = path.relative(templatesDir, fullPath)
            const parts = relativePath.split(path.sep)
            const framework = parts[0] || '_shared'
            let content = ''
            try { content = fs.readFileSync(fullPath, 'utf-8') } catch { /* */ }
            const fm = parseFrontmatter(content)
            templates.push({
              relativePath,
              filename: entry.name,
              framework,
              content,
              author: fm.author || 'SpaceMalamute',
              authorUrl: fm.authorUrl || 'https://github.com/SpaceMalamute',
            })
          }
        }
      }
      walkTemplates(templatesDir)
      return templates
    },
  )

  // Read a single template
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_READ_TEMPLATE,
    async (_event, { relativePath }: { relativePath: string }) => {
      const templatesDir = getTemplatesDir()
      const filePath = validatePath(templatesDir, relativePath)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  // Import templates into project rules
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_IMPORT_TEMPLATES,
    async (_event, { projectPath, relativePaths }: { projectPath: string; relativePaths: string[] }) => {
      const templatesDir = getTemplatesDir()
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true })
      const imported: string[] = []
      for (const relPath of relativePaths) {
        const srcPath = validatePath(templatesDir, relPath)
        if (!fs.existsSync(srcPath)) continue
        const content = fs.readFileSync(srcPath, 'utf-8')
        const fm = parseFrontmatter(content)
        // Ensure author frontmatter is present in the imported file
        let finalContent = content
        if (!fm.author) {
          const authorBlock = `---\nauthor: "SpaceMalamute"\nauthorUrl: "https://github.com/SpaceMalamute"\n---\n\n`
          finalContent = authorBlock + content
        }
        const dstPath = path.join(rulesDir, relPath)
        const dstDir = path.dirname(dstPath)
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
        fs.writeFileSync(dstPath, finalContent, 'utf-8')
        imported.push(relPath)
      }
      return { success: true, imported }
    },
  )

  // Shared rules directory: ~/.mirehub/shared-rules/
  const sharedRulesDir = path.join(os.homedir(), '.mirehub', 'shared-rules')

  // List shared rules (global)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_LIST_SHARED_RULES,
    async () => {
      if (!fs.existsSync(sharedRulesDir)) return []
      const files = fs.readdirSync(sharedRulesDir).filter((f) => f.endsWith('.md'))
      return files.map((f) => {
        const fullPath = path.join(sharedRulesDir, f)
        let content = ''
        try { content = fs.readFileSync(fullPath, 'utf-8') } catch { /* */ }
        return { filename: f, fullPath, content }
      })
    },
  )

  // Write a shared rule
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_WRITE_SHARED_RULE,
    async (_event, { filename, content }: { filename: string; content: string }) => {
      if (!fs.existsSync(sharedRulesDir)) fs.mkdirSync(sharedRulesDir, { recursive: true })
      fs.writeFileSync(path.join(sharedRulesDir, filename), content, 'utf-8')
      return { success: true }
    },
  )

  // Delete a shared rule
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_DELETE_SHARED_RULE,
    async (_event, { filename }: { filename: string }) => {
      const filePath = path.join(sharedRulesDir, filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    },
  )

  // Link a shared rule into a project (create symlink)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_LINK_SHARED_RULE,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true })
      const target = path.join(sharedRulesDir, filename)
      const link = path.join(rulesDir, filename)
      if (!fs.existsSync(target)) return { success: false, error: 'Shared rule not found' }
      if (fs.existsSync(link)) {
        const stat = fs.lstatSync(link)
        if (stat.isSymbolicLink()) fs.unlinkSync(link)
        else return { success: false, error: 'Local rule with same name exists' }
      }
      fs.symlinkSync(target, link)
      return { success: true }
    },
  )

  // Unlink a shared rule from a project (remove symlink only)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_UNLINK_SHARED_RULE,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const link = path.join(projectPath, '.claude', 'rules', filename)
      if (!fs.existsSync(link)) return { success: true }
      const stat = fs.lstatSync(link)
      if (!stat.isSymbolicLink()) return { success: false, error: 'Not a symlink' }
      fs.unlinkSync(link)
      return { success: true }
    },
  )

  // Sync ai-rules from SpaceMalamute/ai-rules (force-reset debounce so it runs immediately)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_SYNC_AI_RULES,
    async (_event, { projectPath }: { projectPath: string }) => {
      const syncScript = path.join(os.homedir(), '.mirehub', 'hooks', 'ai-rules-sync.sh')
      if (!fs.existsSync(syncScript)) return { success: false, error: 'Sync script not found' }

      // Remove debounce timestamp so the script actually runs
      const stateDir = path.join(projectPath, '.claude', '.ai-rules-sync')
      const timestampFile = path.join(stateDir, 'last-check')
      if (fs.existsSync(timestampFile)) fs.unlinkSync(timestampFile)

      return new Promise((resolve) => {
        execFile('bash', [syncScript], { timeout: 30_000 }, (error) => {
          if (error) return resolve({ success: false, error: error.message })
          resolve({ success: true })
        })
      })
    },
  )

  // Check ai-rules from SpaceMalamute/ai-rules (respects script's 24h debounce)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MEMORY_CHECK_AI_RULES,
    async (_event, { projectPath: _projectPath }: { projectPath: string }) => {
      const syncScript = path.join(os.homedir(), '.mirehub', 'hooks', 'ai-rules-sync.sh')
      if (!fs.existsSync(syncScript)) return { success: false, error: 'Sync script not found' }

      return new Promise((resolve) => {
        execFile('bash', [syncScript], { timeout: 30_000 }, (error) => {
          if (error) return resolve({ success: false, error: error.message })
          resolve({ success: true })
        })
      })
    },
  )

  // Open an external URL in the default browser
  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    async (_event, { url }: { url: string }) => {
      if (!url.startsWith('https://')) return { success: false, error: 'Only HTTPS URLs allowed' }
      await shell.openExternal(url)
      return { success: true }
    },
  )
}
