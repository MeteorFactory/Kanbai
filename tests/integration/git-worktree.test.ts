import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createMockIpcMain } from '../mocks/electron'

// Mock StorageService to avoid filesystem side effects from git config overrides.
// Use a class (not an arrow function) so `new StorageService()` works after vi.resetModules().
vi.mock('../../src/main/services/storage', () => ({
  StorageService: class MockStorageService {
    getProjects() { return [] }
    getWorkspace() { return null }
    getNamespace() { return null }
    getGitProfile() { return null }
    getSettings() { return {} }
  },
}))

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

/** Detect the default branch name of a repo (main or master). */
function getDefaultBranch(cwd: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
}

describe('Git Worktree IPC Handlers', { timeout: 15000 }, () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>
  let repoDir: string
  let defaultBranch: string

  beforeEach(async () => {
    vi.resetModules()

    // Create a temporary git repo with local user config and an initial commit.
    // Local config is required because IPC handlers (FINALIZE, MERGE_AND_CLEANUP)
    // run `git commit` without -c overrides — fails on systems without global git config.
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbai-worktree-test-'))
    git(['init'], repoDir)
    git(['config', 'user.name', 'Test'], repoDir)
    git(['config', 'user.email', 'test@test.com'], repoDir)
    git(['commit', '--allow-empty', '-m', 'initial commit'], repoDir)
    defaultBranch = getDefaultBranch(repoDir)

    const { registerGitHandlers } = await import('../../src/main/ipc/git')
    mockIpcMain = createMockIpcMain()
    registerGitHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    try {
      try { git(['worktree', 'prune'], repoDir) } catch { /* ignore */ }
      fs.rmSync(repoDir, { recursive: true, force: true })
    } catch { /* ignore cleanup failures */ }
  })

  describe('worktree creation from active branch', () => {
    it('creates worktree from current active branch as start point', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'test-task-1')

      const result = await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-1',
      })

      expect(result).toMatchObject({
        success: true,
        baseBranch: defaultBranch,
      })

      // Verify worktree was created
      expect(fs.existsSync(worktreePath)).toBe(true)

      // Verify the worktree is on the correct branch
      const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath)
      expect(branch).toBe('kanban/t-1')

      // Verify the worktree started from current branch's HEAD
      const mainHead = git(['rev-parse', defaultBranch], repoDir)
      const worktreeBase = git(['merge-base', 'kanban/t-1', defaultBranch], repoDir)
      expect(worktreeBase).toBe(mainHead)
    })

    it('creates worktree from feature branch when on a feature branch', async () => {
      // Create and switch to a feature branch with a commit
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'checkout', '-b', 'feat/my-feature'], repoDir)
      fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'feature work')
      git(['add', 'feature.txt'], repoDir)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'feature commit'], repoDir)

      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'test-task-2')

      const result = await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-2',
      })

      expect(result).toMatchObject({
        success: true,
        baseBranch: 'feat/my-feature',
      })

      // The worktree should start from the active branch (feat/my-feature)
      const featureHead = git(['rev-parse', 'feat/my-feature'], repoDir)
      const worktreeHead = git(['rev-parse', 'HEAD'], worktreePath)
      expect(worktreeHead).toBe(featureHead)

      // The feature.txt SHOULD exist in the worktree (it started from feat/my-feature)
      expect(fs.existsSync(path.join(worktreePath, 'feature.txt'))).toBe(true)
    })

    it('creates worktree from master when master is the active branch', async () => {
      // Create a repo with master as default branch
      const masterRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbai-worktree-master-test-'))
      git(['init', '-b', 'master'], masterRepoDir)
      git(['config', 'user.name', 'Test'], masterRepoDir)
      git(['config', 'user.email', 'test@test.com'], masterRepoDir)
      git(['commit', '--allow-empty', '-m', 'initial'], masterRepoDir)

      const worktreePath = path.join(masterRepoDir, '.kanbai-worktrees', 'test-task-3')

      const result = await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: masterRepoDir,
        worktreePath,
        branch: 'kanban/t-3',
      })

      expect(result).toMatchObject({
        success: true,
        baseBranch: 'master',
      })

      // Clean up
      try {
        git(['worktree', 'prune'], masterRepoDir)
        fs.rmSync(masterRepoDir, { recursive: true, force: true })
      } catch { /* ignore */ }
    })

    it('returns baseBranch pointing to active branch for merge target', async () => {
      // Switch to feature branch
      git(['checkout', '-b', 'feat/login'], repoDir)

      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'test-task-4')

      const result = await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-4',
      })

      // baseBranch should be the active branch (feat/login)
      expect(result.baseBranch).toBe('feat/login')
    })

    it('propagates .claude/settings.local.json to the worktree', async () => {
      const claudeDir = path.join(repoDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(
        path.join(claudeDir, 'settings.local.json'),
        JSON.stringify({ hooks: { Stop: [] } }, null, 2),
      )

      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'test-task-5')

      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-5',
      })

      const destSettings = path.join(worktreePath, '.claude', 'settings.local.json')
      expect(fs.existsSync(destSettings)).toBe(true)
      const content = JSON.parse(fs.readFileSync(destSettings, 'utf-8'))
      expect(content.hooks).toBeDefined()
    })

    it('adds .kanbai-worktrees/ to .gitignore', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'test-task-6')

      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-6',
      })

      const gitignore = fs.readFileSync(path.join(repoDir, '.gitignore'), 'utf-8')
      expect(gitignore).toContain('.kanbai-worktrees/')
    })

    it('excludes .kanbai-session.lock via worktree info/exclude', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'test-task-7')

      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-7',
      })

      // Read the worktree's .git file to find the gitdir
      const dotGit = fs.readFileSync(path.join(worktreePath, '.git'), 'utf-8').trim()
      const gitDirMatch = dotGit.match(/^gitdir:\s*(.+)$/)
      expect(gitDirMatch?.[1]).toBeDefined()
      const gitDir = path.isAbsolute(gitDirMatch![1]!)
        ? gitDirMatch![1]!
        : path.resolve(worktreePath, gitDirMatch![1]!)
      const excludePath = path.join(gitDir, 'info', 'exclude')
      const excludeContent = fs.readFileSync(excludePath, 'utf-8')
      expect(excludeContent).toContain('.kanbai-session.lock')
    })
  })

  describe('worktree merge and cleanup into working branch', () => {
    it('merges worktree branch into the specified target branch', async () => {
      // Create a feature branch
      git(['checkout', '-b', 'feat/dashboard'], repoDir)
      git(['checkout', defaultBranch], repoDir)

      // Create worktree
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-merge-1')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-10',
      })

      // Make changes in the worktree
      fs.writeFileSync(path.join(worktreePath, 'new-feature.txt'), 'dashboard work')
      git(['add', 'new-feature.txt'], worktreePath)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'add dashboard feature'], worktreePath)

      // Merge into feat/dashboard (the target working branch), NOT into default branch
      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-10',
        ticketLabel: 'T-10',
        targetBranch: 'feat/dashboard',
      })

      expect(result).toMatchObject({
        success: true,
        merged: true,
        mainBranch: 'feat/dashboard',
      })

      // Verify the changes are on feat/dashboard
      git(['checkout', 'feat/dashboard'], repoDir)
      expect(fs.existsSync(path.join(repoDir, 'new-feature.txt'))).toBe(true)

      // Verify changes are NOT on default branch
      git(['checkout', defaultBranch], repoDir)
      expect(fs.existsSync(path.join(repoDir, 'new-feature.txt'))).toBe(false)
    })

    it('falls back to current HEAD when no targetBranch specified', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-merge-2')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-11',
      })

      // Make changes
      fs.writeFileSync(path.join(worktreePath, 'fallback.txt'), 'fallback work')
      git(['add', 'fallback.txt'], worktreePath)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'fallback commit'], worktreePath)

      // Merge without targetBranch — should merge into current HEAD
      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-11',
        ticketLabel: 'T-11',
      })

      expect(result).toMatchObject({
        success: true,
        merged: true,
        mainBranch: defaultBranch,
      })

      expect(fs.existsSync(path.join(repoDir, 'fallback.txt'))).toBe(true)
    })

    it('auto-commits uncommitted changes before merging', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-merge-3')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-12',
      })

      // Leave changes uncommitted in worktree
      fs.writeFileSync(path.join(worktreePath, 'uncommitted.txt'), 'not committed yet')

      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-12',
        ticketLabel: 'T-12',
      })

      expect(result).toMatchObject({ success: true, merged: true })
      expect(fs.existsSync(path.join(repoDir, 'uncommitted.txt'))).toBe(true)
    })

    it('cleans up worktree directory and branch after merge', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-merge-4')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-13',
      })

      fs.writeFileSync(path.join(worktreePath, 'cleanup.txt'), 'data')
      git(['add', 'cleanup.txt'], worktreePath)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'cleanup test'], worktreePath)

      await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-13',
        ticketLabel: 'T-13',
      })

      expect(fs.existsSync(worktreePath)).toBe(false)
      const branches = git(['branch', '--list'], repoDir)
      expect(branches).not.toContain('kanban/t-13')
    })

    it('prevents merge when worktree is locked', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-merge-5')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-14',
      })

      await mockIpcMain._invoke('git:worktreeLock', {
        worktreePath,
        taskId: 'task-14',
        tabId: 'tab-14',
      })

      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-14',
        ticketLabel: 'T-14',
      })

      expect(result).toMatchObject({ success: false, locked: true })
      expect(fs.existsSync(worktreePath)).toBe(true)

      await mockIpcMain._invoke('git:worktreeUnlock', { worktreePath })
    })

    it('restores original branch after merge to a different target', async () => {
      git(['checkout', '-b', 'feat/api'], repoDir)
      git(['checkout', defaultBranch], repoDir)

      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-merge-6')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-15',
      })

      fs.writeFileSync(path.join(worktreePath, 'api-work.txt'), 'api changes')
      git(['add', 'api-work.txt'], worktreePath)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'api work'], worktreePath)

      // Merge into feat/api while repo is on default branch
      await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-15',
        ticketLabel: 'T-15',
        targetBranch: 'feat/api',
      })

      // Repo should be back on default branch after the merge
      const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir)
      expect(currentBranch).toBe(defaultBranch)
    })
  })

  describe('end-to-end worktree lifecycle', () => {
    it('full lifecycle: create from default branch → work → merge to working branch', async () => {
      // Setup: create a feature branch with some work
      git(['checkout', '-b', 'feat/settings'], repoDir)
      fs.writeFileSync(path.join(repoDir, 'settings.ts'), 'export const settings = {}')
      git(['add', 'settings.ts'], repoDir)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'add settings module'], repoDir)

      // Step 1: Create worktree (simulating kanban task launch)
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-lifecycle')
      const addResult = await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-42',
      })

      expect(addResult.success).toBe(true)
      expect(addResult.baseBranch).toBe('feat/settings')

      // Worktree SHOULD have settings.ts (it started from the active branch feat/settings)
      expect(fs.existsSync(path.join(worktreePath, 'settings.ts'))).toBe(true)

      // Step 2: Lock worktree (simulating session start)
      await mockIpcMain._invoke('git:worktreeLock', {
        worktreePath,
        taskId: 'task-42',
        tabId: 'tab-42',
      })

      // Step 3: Do work in worktree
      fs.writeFileSync(path.join(worktreePath, 'new-config.ts'), 'export const config = { theme: "dark" }')
      git(['add', 'new-config.ts'], worktreePath)
      git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'feat(kanban): T-42 add config'], worktreePath)

      // Step 4: Finalize (auto-commit any remaining changes)
      fs.writeFileSync(path.join(worktreePath, 'extra.txt'), 'last-minute change')
      const finalizeResult = await mockIpcMain._invoke('git:worktreeFinalize', {
        worktreePath,
        ticketLabel: 'T-42',
      })
      expect(finalizeResult.success).toBe(true)
      expect(finalizeResult.committed).toBe(true)

      // Step 5: Unlock worktree (simulating session end)
      await mockIpcMain._invoke('git:worktreeUnlock', { worktreePath })

      // Step 6: Merge and cleanup into working branch (feat/settings)
      const mergeResult = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/t-42',
        ticketLabel: 'T-42',
        targetBranch: 'feat/settings',
      })

      expect(mergeResult).toMatchObject({
        success: true,
        merged: true,
        mainBranch: 'feat/settings',
      })

      // Verify: changes are on feat/settings
      git(['checkout', 'feat/settings'], repoDir)
      expect(fs.existsSync(path.join(repoDir, 'new-config.ts'))).toBe(true)
      expect(fs.existsSync(path.join(repoDir, 'extra.txt'))).toBe(true)
      expect(fs.existsSync(path.join(repoDir, 'settings.ts'))).toBe(true)

      // Verify: changes are NOT on default branch
      git(['checkout', defaultBranch], repoDir)
      expect(fs.existsSync(path.join(repoDir, 'new-config.ts'))).toBe(false)
      expect(fs.existsSync(path.join(repoDir, 'settings.ts'))).toBe(false)

      // Verify: worktree and branch cleaned up
      expect(fs.existsSync(worktreePath)).toBe(false)
      const branches = git(['branch', '--list'], repoDir)
      expect(branches).not.toContain('kanban/t-42')
    })
  })

  describe('merge conflict detection', () => {
    it('detects merge conflicts and aborts cleanly', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'conflict-task')

      // Create a file on default branch
      fs.writeFileSync(path.join(repoDir, 'shared.ts'), 'export const value = "original"')
      git(['add', 'shared.ts'], repoDir)
      git(['commit', '-m', 'add shared file'], repoDir)

      // Create worktree
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/conflict-1',
      })

      // Modify the same file differently in the worktree
      fs.writeFileSync(path.join(worktreePath, 'shared.ts'), 'export const value = "from-worktree"')
      git(['add', 'shared.ts'], worktreePath)
      git(['commit', '-m', 'change shared in worktree'], worktreePath)

      // Modify the same file on the default branch (creating a conflict)
      fs.writeFileSync(path.join(repoDir, 'shared.ts'), 'export const value = "from-main"')
      git(['add', 'shared.ts'], repoDir)
      git(['commit', '-m', 'change shared on main'], repoDir)

      // Attempt merge — should detect conflict
      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/conflict-1',
        ticketLabel: 'C-01',
        targetBranch: defaultBranch,
      })

      expect(result).toMatchObject({
        success: false,
        merged: false,
        conflict: true,
      })
      expect(result.conflictFiles).toContain('shared.ts')
      expect(result.error).toContain('Merge conflict')

      // Verify: merge was aborted — no unmerged entries remain
      const status = git(['diff', '--name-only', '--diff-filter=U'], repoDir)
      expect(status).toBe('')

      // Verify: worktree and branch still exist (preserved for manual resolution)
      expect(fs.existsSync(worktreePath)).toBe(true)
      const branches = git(['branch', '--list'], repoDir)
      expect(branches).toContain('kanban/conflict-1')
    })

    it('merges cleanly when no conflicts exist (fast-forward)', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'no-conflict-task')

      // Create worktree
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/no-conflict-1',
      })

      // Add a new file in worktree (no conflict possible)
      fs.writeFileSync(path.join(worktreePath, 'new-feature.ts'), 'export const feature = true')
      git(['add', 'new-feature.ts'], worktreePath)
      git(['commit', '-m', 'add feature'], worktreePath)

      // Merge — should succeed
      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/no-conflict-1',
        ticketLabel: 'NC-01',
        targetBranch: defaultBranch,
      })

      expect(result).toMatchObject({
        success: true,
        merged: true,
      })

      // Verify: file is on default branch
      expect(fs.existsSync(path.join(repoDir, 'new-feature.ts'))).toBe(true)

      // Verify: worktree and branch cleaned up
      expect(fs.existsSync(worktreePath)).toBe(false)
      const branches = git(['branch', '--list'], repoDir)
      expect(branches).not.toContain('kanban/no-conflict-1')
    })

    it('reports multiple conflicting files', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'multi-conflict')

      // Create files on default branch
      fs.writeFileSync(path.join(repoDir, 'fileA.ts'), 'A original')
      fs.writeFileSync(path.join(repoDir, 'fileB.ts'), 'B original')
      git(['add', 'fileA.ts', 'fileB.ts'], repoDir)
      git(['commit', '-m', 'add files A and B'], repoDir)

      // Create worktree
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/multi-conflict-1',
      })

      // Modify both files in worktree
      fs.writeFileSync(path.join(worktreePath, 'fileA.ts'), 'A from worktree')
      fs.writeFileSync(path.join(worktreePath, 'fileB.ts'), 'B from worktree')
      git(['add', 'fileA.ts', 'fileB.ts'], worktreePath)
      git(['commit', '-m', 'change A and B in worktree'], worktreePath)

      // Modify both files on default branch
      fs.writeFileSync(path.join(repoDir, 'fileA.ts'), 'A from main')
      fs.writeFileSync(path.join(repoDir, 'fileB.ts'), 'B from main')
      git(['add', 'fileA.ts', 'fileB.ts'], repoDir)
      git(['commit', '-m', 'change A and B on main'], repoDir)

      // Attempt merge
      const result = await mockIpcMain._invoke('git:worktreeMergeAndCleanup', {
        repoPath: repoDir,
        worktreePath,
        worktreeBranch: 'kanban/multi-conflict-1',
        ticketLabel: 'MC-01',
        targetBranch: defaultBranch,
      })

      expect(result.success).toBe(false)
      expect(result.conflict).toBe(true)
      expect(result.conflictFiles).toHaveLength(2)
      expect(result.conflictFiles).toContain('fileA.ts')
      expect(result.conflictFiles).toContain('fileB.ts')

      // Verify clean state after abort — no unmerged entries remain
      const status = git(['diff', '--name-only', '--diff-filter=U'], repoDir)
      expect(status).toBe('')
    })
  })

  describe('worktree session locking', () => {
    it('lock and unlock cycle works correctly', async () => {
      const worktreePath = path.join(repoDir, '.kanbai-worktrees', 'task-lock')
      await mockIpcMain._invoke('git:worktreeAdd', {
        cwd: repoDir,
        worktreePath,
        branch: 'kanban/t-lock',
      })

      const isLockedBefore = await mockIpcMain._invoke('git:worktreeIsLocked', { worktreePath })
      expect(isLockedBefore).toBe(false)

      await mockIpcMain._invoke('git:worktreeLock', {
        worktreePath,
        taskId: 'lock-task',
        tabId: 'lock-tab',
      })

      const isLockedAfter = await mockIpcMain._invoke('git:worktreeIsLocked', { worktreePath })
      expect(isLockedAfter).toBe(true)

      await mockIpcMain._invoke('git:worktreeUnlock', { worktreePath })

      const isLockedFinal = await mockIpcMain._invoke('git:worktreeIsLocked', { worktreePath })
      expect(isLockedFinal).toBe(false)
    })
  })
})
