import { IpcMain } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_CHANNELS, GitLogEntry, GitStatus, GitTag, GitBlameLine, GitRemote, GitWorktree } from '../../shared/types'
import { StorageService } from '../services/storage'

// ---------------------------------------------------------------------------
// Input validation helpers (CWE-78 defense-in-depth)
// execFileSync with array args already prevents shell injection, but we also
// guard against git option/argument injection from IPC inputs.
// ---------------------------------------------------------------------------

const WORKTREE_LOCK_FILE = '.kanbai-session.lock'
const WORKTREE_LOCK_STALE_MS = 4 * 60 * 60 * 1000 // 4 hours

/**
 * Resolve the git directory for a worktree and ensure the lock file is listed
 * in its per-worktree `info/exclude` file. This prevents the lock file from
 * showing up as untracked or being accidentally committed, without modifying
 * the tracked `.gitignore`.
 */
function ensureLockExcludedInWorktree(worktreePath: string): void {
  try {
    const dotGitPath = path.join(worktreePath, '.git')
    const dotGitContent = fs.readFileSync(dotGitPath, 'utf-8').trim()
    // .git file in worktrees contains "gitdir: <path>"
    const match = dotGitContent.match(/^gitdir:\s*(.+)$/)
    if (!match?.[1]) return
    const gitDirRaw = match[1]
    const gitDir = path.isAbsolute(gitDirRaw)
      ? gitDirRaw
      : path.resolve(worktreePath, gitDirRaw)
    const infoDir = path.join(gitDir, 'info')
    if (!fs.existsSync(infoDir)) {
      fs.mkdirSync(infoDir, { recursive: true })
    }
    const excludePath = path.join(infoDir, 'exclude')
    let content = ''
    if (fs.existsSync(excludePath)) {
      content = fs.readFileSync(excludePath, 'utf-8')
    }
    const lines = content.split('\n')
    if (!lines.some((l) => l.trim() === WORKTREE_LOCK_FILE)) {
      const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      fs.writeFileSync(excludePath, content + suffix + WORKTREE_LOCK_FILE + '\n', 'utf-8')
    }
  } catch { /* exclude update is best-effort */ }
}

/** Check if a worktree has an active session lock. Returns true if locked and not stale. */
function isWorktreeLocked(worktreePath: string): boolean {
  const lockPath = path.join(worktreePath, WORKTREE_LOCK_FILE)
  try {
    if (!fs.existsSync(lockPath)) return false
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
    const age = Date.now() - (content.timestamp ?? 0)
    if (age > WORKTREE_LOCK_STALE_MS) {
      // Stale lock — remove it
      fs.unlinkSync(lockPath)
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Validate a git ref (branch, tag, remote name) — rejects option injection. */
function validateRef(ref: string): string {
  if (!ref || ref.startsWith('-')) {
    throw new Error(`Invalid git ref: "${ref}"`)
  }
  return ref
}

/** Validate a commit hash — must be hexadecimal. */
function validateHash(hash: string): string {
  if (!hash || !/^[0-9a-fA-F]+$/.test(hash)) {
    throw new Error(`Invalid commit hash: "${hash}"`)
  }
  return hash
}

/** Execute a git command safely using execFileSync (no shell interpretation). */
function execGit(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function hasCommits(cwd: string): boolean {
  try {
    execGit(['rev-parse', 'HEAD'], cwd)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve git config overrides (-c flags) for a project path based on its namespace profile.
 * Returns an array like ['-c', 'user.name=X', '-c', 'user.email=Y'] or empty.
 */
function getGitConfigOverrides(cwd: string): string[] {
  const storage = new StorageService()
  // Find the project by path
  const projects = storage.getProjects()
  const project = projects.find((p) => cwd.startsWith(p.path))
  if (!project) return []

  // Find the workspace
  const workspace = storage.getWorkspace(project.workspaceId)
  if (!workspace?.namespaceId) return []

  // Find the namespace
  const namespace = storage.getNamespace(workspace.namespaceId)
  if (!namespace || namespace.isDefault) return [] // Default namespace uses global git config

  // Find the git profile
  const profile = storage.getGitProfile(workspace.namespaceId)
  if (!profile) return [] // No custom profile, use global

  const overrides: string[] = []
  if (profile.userName) {
    overrides.push('-c', `user.name=${profile.userName}`)
  }
  if (profile.userEmail) {
    overrides.push('-c', `user.email=${profile.userEmail}`)
  }
  return overrides
}

export function registerGitHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (_event, { cwd }: { cwd: string }) => {
    try {
      execGit(['init'], cwd)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_event, { cwd }: { cwd: string }) => {
    try {
      let branch: string
      try {
        branch = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
      } catch {
        // HEAD resolution failed — check if it's still a git repo (no commits yet)
        try {
          execGit(['rev-parse', '--git-dir'], cwd)
          branch = '(aucun commit)'
        } catch {
          return null
        }
      }

      let ahead = 0
      let behind = 0
      if (branch !== '(aucun commit)') {
        try {
          const counts = execGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd)
          const [a, b] = counts.split('\t')
          ahead = parseInt(a || '0', 10)
          behind = parseInt(b || '0', 10)
        } catch {
          // No upstream configured
        }
      }

      const statusOutput = execGit(['status', '--porcelain'], cwd)
      const staged: string[] = []
      const modified: string[] = []
      const untracked: string[] = []

      for (const line of statusOutput.split('\n')) {
        if (!line) continue
        const x = line[0]
        const y = line[1]
        const file = line.slice(3)

        if (x === '?' && y === '?') {
          untracked.push(file)
        } else {
          if (x && x !== ' ' && x !== '?') staged.push(file)
          if (y && y !== ' ' && y !== '?') modified.push(file)
        }
      }

      const status: GitStatus = { branch, ahead, behind, staged, modified, untracked }
      return status
    } catch {
      return null
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_LOG,
    async (_event, { cwd, limit }: { cwd: string; limit?: number }) => {
      try {
        // Return empty if no commits yet
        if (!hasCommits(cwd)) return []

        const n = Math.max(1, Math.floor(Number(limit) || 50))
        const RS = '\x1e' // Record separator between entries
        const SEP = '\x1f' // Unit separator within entry
        const output = execGit(
          ['log', '--all', '--topo-order', `-${n}`, `--pretty=format:%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ai${SEP}%s${SEP}%P${SEP}%D${SEP}%b${RS}`],
          cwd,
        )
        const entries: GitLogEntry[] = output.split(RS).filter(Boolean).map((record) => {
          const parts = record.trim().split(SEP)
          const body = parts[8] || ''
          const cherryMatch = body.match(/\(cherry picked from commit ([a-f0-9]+)\)/)
          return {
            hash: parts[0] || '',
            shortHash: parts[1] || '',
            author: parts[2] || '',
            authorEmail: parts[3] || '',
            date: parts[4] || '',
            message: parts[5] || '',
            parents: (parts[6] || '').split(' ').filter(Boolean),
            refs: (parts[7] || '').split(',').map((r) => r.trim()).filter(Boolean),
            cherryPickOf: cherryMatch?.[1] || undefined,
          }
        })
        return entries
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCHES, async (_event, { cwd }: { cwd: string }) => {
    try {
      // Return empty if no commits yet (branches reference commits)
      if (!hasCommits(cwd)) return []

      const output = execGit(['branch', '-a', '--format=%(refname:short)|%(objectname:short)|%(upstream:short)'], cwd)
      const branches = output.split('\n').map((line) => {
        const [name, hash, upstream] = line.split('|')
        return { name: name || '', hash: hash || '', upstream: upstream || '' }
      })
      return branches
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_CHECKOUT,
    async (_event, { cwd, branch }: { cwd: string; branch: string }) => {
      try {
        execGit(['checkout', validateRef(branch)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_event, { cwd }: { cwd: string }) => {
    try {
      execGit(['push'], cwd)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (_event, { cwd }: { cwd: string }) => {
    try {
      execGit(['pull'], cwd)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT,
    async (
      _event,
      { cwd, message, files }: { cwd: string; message: string; files: string[] },
    ) => {
      try {
        for (const file of files) {
          execGit(['add', file], cwd)
        }
        // Apply namespace git profile overrides if configured
        const overrides = getGitConfigOverrides(cwd)
        execGit([...overrides, 'commit', '-m', message], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_event, { cwd, file, staged }: { cwd: string; file?: string; staged?: boolean }) => {
      try {
        // For staged diff on repos with no commits, use --cached against empty tree
        if (staged && !hasCommits(cwd)) {
          const args = ['diff', '--cached', '--diff-algorithm=minimal']
          if (file) args.push('--', file)
          return execGit(args, cwd)
        }
        const args = ['diff']
        if (staged) args.push('--cached')
        if (file) args.push('--', file)
        return execGit(args, cwd)
      } catch {
        return ''
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.GIT_STASH, async (_event, { cwd }: { cwd: string }) => {
    try {
      execGit(['stash'], cwd)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STASH_POP, async (_event, { cwd }: { cwd: string }) => {
    try {
      execGit(['stash', 'pop'], cwd)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_CREATE_BRANCH,
    async (_event, { cwd, name }: { cwd: string; name: string }) => {
      try {
        if (!hasCommits(cwd)) {
          return { success: false, error: 'Impossible de creer une branche sans commit initial.' }
        }
        execGit(['checkout', '-b', validateRef(name)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_DELETE_BRANCH,
    async (_event, { cwd, name }: { cwd: string; name: string }) => {
      try {
        execGit(['branch', '-d', validateRef(name)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_MERGE,
    async (_event, { cwd, branch }: { cwd: string; branch: string }) => {
      try {
        execGit(['merge', validateRef(branch)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, async (_event, { cwd }: { cwd: string }) => {
    try {
      execGit(['fetch', '--all', '--prune'], cwd)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_STAGE,
    async (_event, { cwd, files }: { cwd: string; files: string[] }) => {
      try {
        for (const file of files) {
          execGit(['add', file], cwd)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_UNSTAGE,
    async (_event, { cwd, files }: { cwd: string; files: string[] }) => {
      try {
        if (!hasCommits(cwd)) {
          for (const file of files) {
            execGit(['rm', '--cached', file], cwd)
          }
        } else {
          for (const file of files) {
            execGit(['reset', 'HEAD', '--', file], cwd)
          }
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_DISCARD,
    async (_event, { cwd, files }: { cwd: string; files: string[] }) => {
      try {
        for (const file of files) {
          execGit(['checkout', '--', file], cwd)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_SHOW,
    async (_event, { cwd, hash }: { cwd: string; hash: string }) => {
      try {
        if (!hasCommits(cwd)) return { files: [], diff: '' }
        // Get list of changed files with status
        const filesOutput = execGit(['diff-tree', '--no-commit-id', '--name-status', '-r', validateHash(hash)], cwd)
        const files = filesOutput
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [status, ...nameParts] = line.split('\t')
            return { status: status || '?', file: nameParts.join('\t') || '' }
          })
        // Get full diff
        const diff = execGit(['show', '--format=', '--patch', validateHash(hash)], cwd)
        return { files, diff }
      } catch {
        return { files: [], diff: '' }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.GIT_STASH_LIST, async (_event, { cwd }: { cwd: string }) => {
    try {
      const output = execGit(['stash', 'list', '--format=%gd|%gs|%ci'], cwd)
      if (!output) return []
      return output.split('\n').filter(Boolean).map((line) => {
        const [ref, message, date] = line.split('|')
        return { ref: ref || '', message: message || '', date: date || '' }
      })
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_RENAME_BRANCH,
    async (_event, { cwd, oldName, newName }: { cwd: string; oldName: string; newName: string }) => {
      try {
        execGit(['branch', '-m', validateRef(oldName), validateRef(newName)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Tag management ---

  ipcMain.handle(IPC_CHANNELS.GIT_TAGS, async (_event, { cwd }: { cwd: string }) => {
    try {
      if (!hasCommits(cwd)) return []
      const SEP = '\x1f'
      const output = execGit(
        ['tag', '-l', '--sort=-creatordate', `--format=%(refname:short)${SEP}%(objectname:short)${SEP}%(contents:subject)${SEP}%(creatordate:iso)${SEP}%(objecttype)`],
        cwd,
      )
      if (!output) return []
      const tags: GitTag[] = output.split('\n').filter(Boolean).map((line) => {
        const parts = line.split(SEP)
        return {
          name: parts[0] || '',
          hash: parts[1] || '',
          message: parts[2] || '',
          date: parts[3] || '',
          isAnnotated: parts[4] === 'tag',
        }
      })
      return tags
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_CREATE_TAG,
    async (
      _event,
      { cwd, name, message }: { cwd: string; name: string; message?: string },
    ) => {
      try {
        if (message) {
          execGit(['tag', '-a', validateRef(name), '-m', message], cwd)
        } else {
          execGit(['tag', validateRef(name)], cwd)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_DELETE_TAG,
    async (_event, { cwd, name }: { cwd: string; name: string }) => {
      try {
        execGit(['tag', '-d', validateRef(name)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Cherry-pick ---

  ipcMain.handle(
    IPC_CHANNELS.GIT_CHERRY_PICK,
    async (_event, { cwd, hash }: { cwd: string; hash: string }) => {
      try {
        execGit(['cherry-pick', '-x', validateHash(hash)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Branch comparison ---

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF_BRANCHES,
    async (
      _event,
      { cwd, branch1, branch2 }: { cwd: string; branch1: string; branch2: string },
    ) => {
      try {
        const output = execGit(['diff', `${validateRef(branch1)}...${validateRef(branch2)}`, '--stat'], cwd)
        return output
      } catch (err) {
        return String(err)
      }
    },
  )

  // --- Blame ---

  ipcMain.handle(
    IPC_CHANNELS.GIT_BLAME,
    async (_event, { cwd, file }: { cwd: string; file: string }) => {
      try {
        if (!hasCommits(cwd)) return []
        const output = execGit(['blame', '--porcelain', file], cwd)
        const lines: GitBlameLine[] = []
        const blocks = output.split('\n')
        let currentHash = ''
        let currentAuthor = ''
        let currentDate = ''
        let currentLineNumber = 0

        for (const line of blocks) {
          // Commit header line: <hash> <orig-line> <final-line> [<num-lines>]
          const headerMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/)
          if (headerMatch) {
            currentHash = headerMatch[1]!
            currentLineNumber = parseInt(headerMatch[2]!, 10)
            continue
          }
          if (line.startsWith('author ')) {
            currentAuthor = line.slice(7)
            continue
          }
          if (line.startsWith('author-time ')) {
            const timestamp = parseInt(line.slice(12), 10)
            currentDate = new Date(timestamp * 1000).toISOString()
            continue
          }
          // Content line starts with a tab
          if (line.startsWith('\t')) {
            lines.push({
              hash: currentHash.slice(0, 8),
              author: currentAuthor,
              date: currentDate,
              lineNumber: currentLineNumber,
              content: line.slice(1),
            })
          }
        }
        return lines
      } catch {
        return []
      }
    },
  )

  // --- Remote management ---

  ipcMain.handle(IPC_CHANNELS.GIT_REMOTES, async (_event, { cwd }: { cwd: string }) => {
    try {
      const output = execGit(['remote', '-v'], cwd)
      if (!output) return []
      const remoteMap = new Map<string, GitRemote>()
      for (const line of output.split('\n')) {
        if (!line) continue
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
        if (!match) continue
        const [, name, url, type] = match
        if (!remoteMap.has(name!)) {
          remoteMap.set(name!, { name: name!, fetchUrl: '', pushUrl: '' })
        }
        const remote = remoteMap.get(name!)!
        if (type === 'fetch') remote.fetchUrl = url!
        else remote.pushUrl = url!
      }
      return Array.from(remoteMap.values())
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_ADD_REMOTE,
    async (_event, { cwd, name, url }: { cwd: string; name: string; url: string }) => {
      try {
        execGit(['remote', 'add', validateRef(name), url], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_REMOVE_REMOTE,
    async (_event, { cwd, name }: { cwd: string; name: string }) => {
      try {
        execGit(['remote', 'remove', validateRef(name)], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_RESET_SOFT,
    async (_event, { cwd }: { cwd: string }) => {
      try {
        if (!hasCommits(cwd)) return { success: false, error: 'No commits to undo' }
        execGit(['reset', '--soft', 'HEAD~1'], cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Worktree management ---

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_ADD,
    async (
      _event,
      { cwd, worktreePath, branch }: { cwd: string; worktreePath: string; branch: string },
    ) => {
      try {
        if (!hasCommits(cwd)) {
          return { success: false, error: 'Cannot create worktree without initial commit.' }
        }

        // Detect the current working branch before creating the worktree
        const currentBranch = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim()

        // Detect default branch (main/master) to use as start point
        let defaultBranch = 'main'
        try {
          // Check if 'main' exists
          execGit(['rev-parse', '--verify', 'main'], cwd)
        } catch {
          try {
            // Fallback to 'master'
            execGit(['rev-parse', '--verify', 'master'], cwd)
            defaultBranch = 'master'
          } catch {
            // Neither main nor master — use current branch as start point
            defaultBranch = currentBranch
          }
        }

        // Create worktree from the default branch (main/master) as start point
        execGit(['worktree', 'add', worktreePath, '-b', validateRef(branch), defaultBranch], cwd)

        // Propagate .claude/settings.local.json to the worktree so Claude Code
        // hooks (Stop, PreToolUse, etc.) fire correctly in the worktree context.
        // The worktree has its own .git file, so Claude treats it as a separate
        // project root — untracked files like settings.local.json must be copied.
        try {
          const sourceSettings = path.join(cwd, '.claude', 'settings.local.json')
          if (fs.existsSync(sourceSettings)) {
            const destClaudeDir = path.join(worktreePath, '.claude')
            if (!fs.existsSync(destClaudeDir)) {
              fs.mkdirSync(destClaudeDir, { recursive: true })
            }
            fs.copyFileSync(sourceSettings, path.join(destClaudeDir, 'settings.local.json'))
          }
        } catch { /* hook propagation is best-effort */ }

        // Ensure .kanbai-worktrees/ is in the main repo's .gitignore
        const gitignorePath = path.join(cwd, '.gitignore')
        const worktreeDirEntry = '.kanbai-worktrees/'
        try {
          let content = ''
          if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf-8')
          }
          const lines = content.split('\n')
          if (!lines.some((l) => l.trim() === worktreeDirEntry)) {
            const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
            fs.writeFileSync(gitignorePath, content + suffix + worktreeDirEntry + '\n', 'utf-8')
          }
        } catch { /* gitignore update is best-effort */ }

        // Exclude .kanbai-session.lock via the worktree's git info/exclude
        // (not tracked, won't pollute commits when merged back)
        ensureLockExcludedInWorktree(worktreePath)

        return { success: true, baseBranch: currentBranch, startPoint: defaultBranch }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_REMOVE,
    async (
      _event,
      { cwd, worktreePath, force }: { cwd: string; worktreePath: string; force?: boolean },
    ) => {
      try {
        // Prevent removal of worktrees with active Claude sessions
        if (isWorktreeLocked(worktreePath)) {
          return { success: false, locked: true, error: 'Worktree has an active session' }
        }
        const args = ['worktree', 'remove']
        if (force) args.push('--force')
        args.push(worktreePath)
        execGit(args, cwd)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_FINALIZE,
    async (
      _event,
      { worktreePath, ticketLabel }: { worktreePath: string; ticketLabel: string },
    ) => {
      try {
        // Check if there are uncommitted changes in the worktree
        const status = execGit(['status', '--porcelain'], worktreePath).trim()
        if (!status) {
          return { success: true, committed: false, message: 'No uncommitted changes' }
        }

        // Stage all changes and commit
        execGit(['add', '-A'], worktreePath)
        const commitMessage = `chore(kanban): auto-commit ${ticketLabel} worktree changes`
        execGit(['commit', '-m', commitMessage], worktreePath)

        return { success: true, committed: true, message: `Auto-committed changes for ${ticketLabel}` }
      } catch (err) {
        return { success: false, committed: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_MERGE_AND_CLEANUP,
    async (
      _event,
      {
        repoPath,
        worktreePath,
        worktreeBranch,
        ticketLabel,
        targetBranch,
      }: {
        repoPath: string
        worktreePath: string
        worktreeBranch: string
        ticketLabel: string
        targetBranch?: string
      },
    ) => {
      try {
        // Prevent merge/cleanup of worktrees with active Claude sessions
        if (isWorktreeLocked(worktreePath)) {
          return { success: false, merged: false, locked: true, error: 'Worktree has an active session — cleanup deferred' }
        }

        const currentBranch = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath).trim()
        // Use targetBranch (the branch that was active when the worktree was created)
        // to merge into the correct working branch, falling back to current HEAD
        const mainBranch = targetBranch ?? currentBranch

        // Checkout the target branch if not already on it
        if (targetBranch && currentBranch !== targetBranch) {
          try {
            execGit(['checkout', validateRef(targetBranch)], repoPath)
          } catch {
            // If checkout fails, fall back to current branch
          }
        }
        const worktreeExists = fs.existsSync(worktreePath)

        // Step 1: Finalize — auto-commit any uncommitted changes in the worktree
        if (worktreeExists) {
          try {
            const status = execGit(['status', '--porcelain'], worktreePath).trim()
            if (status) {
              execGit(['add', '-A'], worktreePath)
              const commitMessage = `chore(kanban): auto-commit ${ticketLabel} worktree changes`
              execGit(['commit', '-m', commitMessage], worktreePath)
            }
          } catch {
            // Auto-commit is best-effort — worktree may already be in a clean state
          }
        }

        // Step 2: Check if branch exists before attempting merge
        let branchExists = false
        try {
          execGit(['rev-parse', '--verify', validateRef(worktreeBranch)], repoPath)
          branchExists = true
        } catch {
          // Branch doesn't exist — already merged and deleted by the shell hook
        }

        // Step 3: Merge the worktree branch into the main branch
        if (branchExists) {
          execGit(['merge', validateRef(worktreeBranch)], repoPath)
        }

        // Step 4: Remove the worktree
        if (worktreeExists) {
          try {
            execGit(['worktree', 'remove', '--force', worktreePath], repoPath)
          } catch {
            // If git worktree remove fails, try manual cleanup
            fs.rmSync(worktreePath, { recursive: true, force: true })
            execGit(['worktree', 'prune'], repoPath)
          }
        }

        // Step 5: Delete the worktree branch (it's merged now)
        if (branchExists) {
          try {
            execGit(['branch', '-d', validateRef(worktreeBranch)], repoPath)
          } catch {
            // Branch deletion is best-effort — may already be gone
          }
        }

        // Step 6: Restore the original branch if we switched away from it
        if (targetBranch && currentBranch !== targetBranch) {
          try {
            execGit(['checkout', validateRef(currentBranch)], repoPath)
          } catch {
            // Restore is best-effort — user may need to switch manually
          }
        }

        return {
          success: true,
          merged: branchExists,
          mainBranch,
          message: branchExists
            ? `Merged ${worktreeBranch} into ${mainBranch} and cleaned up worktree`
            : `Worktree already merged and cleaned up`,
        }
      } catch (err) {
        return { success: false, merged: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_LIST,
    async (_event, { cwd }: { cwd: string }) => {
      try {
        const output = execGit(['worktree', 'list', '--porcelain'], cwd)
        const worktrees: GitWorktree[] = []
        let current: Partial<GitWorktree> = {}

        for (const line of output.split('\n')) {
          if (line.startsWith('worktree ')) {
            if (current.path) worktrees.push(current as GitWorktree)
            current = { path: line.slice(9), branch: '', head: '', isBare: false }
          } else if (line.startsWith('HEAD ')) {
            current.head = line.slice(5)
          } else if (line.startsWith('branch ')) {
            current.branch = line.slice(7).replace('refs/heads/', '')
          } else if (line === 'bare') {
            current.isBare = true
          } else if (line === '' && current.path) {
            worktrees.push(current as GitWorktree)
            current = {}
          }
        }
        if (current.path) worktrees.push(current as GitWorktree)

        return worktrees
      } catch {
        return []
      }
    },
  )

  // --- Worktree session lock management ---

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_LOCK,
    async (
      _event,
      { worktreePath, taskId, tabId }: { worktreePath: string; taskId: string; tabId: string },
    ) => {
      try {
        // Ensure the lock file is excluded before creating it
        ensureLockExcludedInWorktree(worktreePath)
        const lockPath = path.join(worktreePath, WORKTREE_LOCK_FILE)
        const lockData = { taskId, tabId, timestamp: Date.now() }
        fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_UNLOCK,
    async (
      _event,
      { worktreePath }: { worktreePath: string },
    ) => {
      try {
        const lockPath = path.join(worktreePath, WORKTREE_LOCK_FILE)
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_IS_LOCKED,
    async (
      _event,
      { worktreePath }: { worktreePath: string },
    ) => {
      return isWorktreeLocked(worktreePath)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_BRANCH_IS_MERGED,
    async (
      _event,
      { cwd, branch }: { cwd: string; branch: string },
    ) => {
      try {
        // Check if the branch tip is an ancestor of the current HEAD
        execGit(['merge-base', '--is-ancestor', validateRef(branch), 'HEAD'], cwd)
        return true
      } catch {
        return false
      }
    },
  )
}
