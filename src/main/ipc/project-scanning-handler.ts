import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import ignore from 'ignore'

import { IPC_CHANNELS, TodoEntry, ProjectStatsData } from '../../shared/types/index'

export function registerProjectScanningHandlers(ipcMain: IpcMain): void {
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
}
