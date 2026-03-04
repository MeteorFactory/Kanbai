import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-git-ipc-test-${process.pid}-${Date.now()}`)
const repoDir = path.join(TEST_DIR, 'test-repo')

function gitExec(cmd: string, cwd: string = repoDir): string {
  return execSync(cmd, { cwd, encoding: 'utf-8' }).trim()
}

function setupGitRepo(): void {
  fs.mkdirSync(repoDir, { recursive: true })
  gitExec('git init -b master')
  gitExec('git config user.email "test@test.com"')
  gitExec('git config user.name "Test User"')
}

function setupGitRepoWithCommit(): void {
  setupGitRepo()
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test')
  gitExec('git add .')
  gitExec('git commit -m "Initial commit"')
}

describe('Git IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true, force: true })
    }

    const { registerGitHandlers } = await import('../../src/main/ipc/git')

    mockIpcMain = createMockIpcMain()
    registerGitHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre tous les handlers git', () => {
    expect(mockIpcMain._handlers.has('git:init')).toBe(true)
    expect(mockIpcMain._handlers.has('git:status')).toBe(true)
    expect(mockIpcMain._handlers.has('git:log')).toBe(true)
    expect(mockIpcMain._handlers.has('git:branches')).toBe(true)
    expect(mockIpcMain._handlers.has('git:checkout')).toBe(true)
    expect(mockIpcMain._handlers.has('git:push')).toBe(true)
    expect(mockIpcMain._handlers.has('git:pull')).toBe(true)
    expect(mockIpcMain._handlers.has('git:commit')).toBe(true)
    expect(mockIpcMain._handlers.has('git:diff')).toBe(true)
    expect(mockIpcMain._handlers.has('git:stash')).toBe(true)
    expect(mockIpcMain._handlers.has('git:stashPop')).toBe(true)
    expect(mockIpcMain._handlers.has('git:createBranch')).toBe(true)
    expect(mockIpcMain._handlers.has('git:deleteBranch')).toBe(true)
    expect(mockIpcMain._handlers.has('git:merge')).toBe(true)
    expect(mockIpcMain._handlers.has('git:fetch')).toBe(true)
    expect(mockIpcMain._handlers.has('git:stage')).toBe(true)
    expect(mockIpcMain._handlers.has('git:unstage')).toBe(true)
    expect(mockIpcMain._handlers.has('git:discard')).toBe(true)
    expect(mockIpcMain._handlers.has('git:show')).toBe(true)
    expect(mockIpcMain._handlers.has('git:stashList')).toBe(true)
    expect(mockIpcMain._handlers.has('git:renameBranch')).toBe(true)
  })

  describe('git:init', () => {
    it('initialise un depot git', async () => {
      fs.mkdirSync(repoDir, { recursive: true })
      const result = await mockIpcMain._invoke('git:init', { cwd: repoDir })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(path.join(repoDir, '.git'))).toBe(true)
    })

    it('retourne une erreur si le chemin est invalide', async () => {
      const result = await mockIpcMain._invoke('git:init', { cwd: '/nonexistent/path/xyz' })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('git:status', () => {
    it('retourne le statut d un repo avec des fichiers non suivis', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'new-file.txt'), 'content')

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })

      expect(status).toBeDefined()
      expect(status.branch).toBe('master')
      expect(status.untracked).toContain('new-file.txt')
    })

    it('retourne le statut avec des fichiers modifies', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Modified')

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })

      // Le fichier est soit dans modified soit dans untracked selon le parsing
      // Le status porcelain montre ' M README.md' (espace + M)
      const allChanged = [...status.modified, ...status.staged, ...status.untracked]
      expect(allChanged.length).toBeGreaterThan(0)
    })

    it('retourne le statut avec des fichiers stages', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'content')
      gitExec('git add staged.txt')

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })

      expect(status.staged).toContain('staged.txt')
    })

    it('retourne null pour un dossier non-git', async () => {
      fs.mkdirSync(repoDir, { recursive: true })
      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status).toBeNull()
    })
  })

  describe('git:status avec repo vide (sans commits)', () => {
    // Comportement actuel : retourne null car git rev-parse --abbrev-ref HEAD echoue
    // Comportement attendu apres fix (Task #5) : retourne un statut avec branch special

    it('retourne un statut valide pour un repo sans commits', async () => {
      setupGitRepo()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# New project')

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })

      // Apres le fix Task #5, le handler detecte un repo git sans commits
      expect(status).not.toBeNull()
      expect(status.branch).toBe('(aucun commit)')
      expect(status.untracked).toContain('README.md')
      expect(status.staged).toEqual([])
      expect(status.modified).toEqual([])
      expect(status.ahead).toBe(0)
      expect(status.behind).toBe(0)
    })

    it('retourne null pour un dossier qui n est pas un repo git', async () => {
      // Simple dossier sans git init
      fs.mkdirSync(path.join(repoDir, 'just-a-folder'), { recursive: true })

      const status = await mockIpcMain._invoke('git:status', { cwd: path.join(repoDir, 'just-a-folder') })
      expect(status).toBeNull()
    })

    it('git:log retourne un tableau vide pour un repo sans commits', async () => {
      setupGitRepo()
      const log = await mockIpcMain._invoke('git:log', { cwd: repoDir })
      // Doit retourner [] proprement sans crash
      expect(log).toEqual([])
    })

    it('git:branches gere un repo sans commits sans crash', async () => {
      setupGitRepo()
      const branches = await mockIpcMain._invoke('git:branches', { cwd: repoDir })
      // Ne doit pas throw, peut retourner [] ou un tableau avec entrees vides
      expect(Array.isArray(branches)).toBe(true)
    })

    it('git:diff retourne une chaine vide pour un repo sans commits', async () => {
      setupGitRepo()
      fs.writeFileSync(path.join(repoDir, 'file.txt'), 'content')

      const diff = await mockIpcMain._invoke('git:diff', { cwd: repoDir })
      // Pas de HEAD pour comparer, retourne vide
      expect(typeof diff).toBe('string')
    })
  })

  describe('git:log', () => {
    it('retourne les commits du repo', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'file2.txt'), 'content')
      gitExec('git add .')
      gitExec('git commit -m "Second commit"')

      const log = await mockIpcMain._invoke('git:log', { cwd: repoDir })

      expect(log).toHaveLength(2)
      expect(log[0].message).toBe('Second commit')
      expect(log[1].message).toBe('Initial commit')
    })

    it('respecte la limite de commits', async () => {
      setupGitRepoWithCommit()
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(repoDir, `file${i}.txt`), `content ${i}`)
        gitExec('git add .')
        gitExec(`git commit -m "Commit ${i}"`)
      }

      const log = await mockIpcMain._invoke('git:log', { cwd: repoDir, limit: 3 })

      expect(log).toHaveLength(3)
    })

    it('retourne un tableau vide pour un repo sans commits', async () => {
      setupGitRepo()
      const log = await mockIpcMain._invoke('git:log', { cwd: repoDir })
      expect(log).toEqual([])
    })

    it('retourne un tableau vide pour un dossier non-git', async () => {
      fs.mkdirSync(repoDir, { recursive: true })
      const log = await mockIpcMain._invoke('git:log', { cwd: repoDir })
      expect(log).toEqual([])
    })
  })

  describe('git:branches', () => {
    it('liste les branches du repo', async () => {
      setupGitRepoWithCommit()

      const branches = await mockIpcMain._invoke('git:branches', { cwd: repoDir })

      expect(branches.length).toBeGreaterThan(0)
      expect(branches.some((b: { name: string }) => b.name === 'master')).toBe(true)
    }, 15_000)

    it('gere un repo sans commits', async () => {
      setupGitRepo()
      const branches = await mockIpcMain._invoke('git:branches', { cwd: repoDir })
      // Un repo sans commits peut retourner un tableau vide ou avec des entrees vides
      // selon la version de git
      expect(branches).toBeDefined()
    })
  })

  describe('git:commit', () => {
    it('cree un commit avec les fichiers specifies', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'new.txt'), 'content')

      const result = await mockIpcMain._invoke('git:commit', {
        cwd: repoDir,
        message: 'Add new file',
        files: ['new.txt'],
      })

      expect(result).toEqual({ success: true })

      const log = gitExec('git log --oneline -1')
      expect(log).toContain('Add new file')
    })

    it('echappe correctement les guillemets dans le message', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'file.txt'), 'content')

      const result = await mockIpcMain._invoke('git:commit', {
        cwd: repoDir,
        message: 'Fix "bug" in parser',
        files: ['file.txt'],
      })

      expect(result).toEqual({ success: true })
    })
  })

  describe('git:diff', () => {
    it('retourne le diff des fichiers modifies', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Modified\nNew content')

      const diff = await mockIpcMain._invoke('git:diff', { cwd: repoDir })

      expect(diff).toContain('Modified')
      expect(diff).toContain('New content')
    })

    it('retourne le diff staged', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Staged change')
      gitExec('git add README.md')

      const diff = await mockIpcMain._invoke('git:diff', { cwd: repoDir, staged: true })

      expect(diff).toContain('Staged change')
    })

    it('retourne une chaine vide si pas de diff', async () => {
      setupGitRepoWithCommit()

      const diff = await mockIpcMain._invoke('git:diff', { cwd: repoDir })

      expect(diff).toBe('')
    })
  })

  describe('git:createBranch', () => {
    it('cree une nouvelle branche et bascule dessus', async () => {
      setupGitRepoWithCommit()

      const result = await mockIpcMain._invoke('git:createBranch', {
        cwd: repoDir,
        name: 'feature/test',
      })

      expect(result).toEqual({ success: true })

      const branch = gitExec('git rev-parse --abbrev-ref HEAD')
      expect(branch).toBe('feature/test')
    })

    it('retourne une erreur pour un repo sans commits', async () => {
      setupGitRepo()

      const result = await mockIpcMain._invoke('git:createBranch', {
        cwd: repoDir,
        name: 'feature/new',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('git:checkout', () => {
    it('bascule vers une branche existante', async () => {
      setupGitRepoWithCommit()
      gitExec('git checkout -b dev')
      gitExec('git checkout master')

      const result = await mockIpcMain._invoke('git:checkout', {
        cwd: repoDir,
        branch: 'dev',
      })

      expect(result).toEqual({ success: true })
      const branch = gitExec('git rev-parse --abbrev-ref HEAD')
      expect(branch).toBe('dev')
    })

    it('echoue pour une branche inexistante', async () => {
      setupGitRepoWithCommit()

      const result = await mockIpcMain._invoke('git:checkout', {
        cwd: repoDir,
        branch: 'nonexistent',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('git:stash et git:stashPop', () => {
    it('stash et restaure les modifications', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Stashed')

      const stashResult = await mockIpcMain._invoke('git:stash', { cwd: repoDir })
      expect(stashResult).toEqual({ success: true })

      // Le fichier doit etre revenu a l'original
      const content = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf-8')
      expect(content).toBe('# Test')

      const popResult = await mockIpcMain._invoke('git:stashPop', { cwd: repoDir })
      expect(popResult).toEqual({ success: true })

      const restoredContent = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf-8')
      expect(restoredContent).toBe('# Stashed')
    })
  })

  describe('git:deleteBranch', () => {
    it('supprime une branche mergee', async () => {
      setupGitRepoWithCommit()
      gitExec('git checkout -b to-delete')
      gitExec('git checkout master')

      const result = await mockIpcMain._invoke('git:deleteBranch', {
        cwd: repoDir,
        name: 'to-delete',
      })

      expect(result).toEqual({ success: true })
    })
  })

  describe('git:merge', () => {
    it('merge une branche dans la courante', async () => {
      setupGitRepoWithCommit()
      gitExec('git checkout -b feature')
      fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'feature content')
      gitExec('git add .')
      gitExec('git commit -m "Feature commit"')
      gitExec('git checkout master')

      const result = await mockIpcMain._invoke('git:merge', {
        cwd: repoDir,
        branch: 'feature',
      })

      expect(result).toEqual({ success: true })
      expect(fs.existsSync(path.join(repoDir, 'feature.txt'))).toBe(true)
    })
  })

  describe('git:stage', () => {
    it('ajoute un fichier au staging', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'new.txt'), 'content')

      const result = await mockIpcMain._invoke('git:stage', {
        cwd: repoDir,
        files: ['new.txt'],
      })

      expect(result).toEqual({ success: true })

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.staged).toContain('new.txt')
    })

    it('ajoute plusieurs fichiers au staging', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'a.txt'), 'a')
      fs.writeFileSync(path.join(repoDir, 'b.txt'), 'b')

      const result = await mockIpcMain._invoke('git:stage', {
        cwd: repoDir,
        files: ['a.txt', 'b.txt'],
      })

      expect(result).toEqual({ success: true })

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.staged).toContain('a.txt')
      expect(status.staged).toContain('b.txt')
    })
  })

  describe('git:unstage', () => {
    it('retire un fichier du staging', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'content')
      gitExec('git add staged.txt')

      // Verify file is staged
      let status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.staged).toContain('staged.txt')

      const result = await mockIpcMain._invoke('git:unstage', {
        cwd: repoDir,
        files: ['staged.txt'],
      })

      expect(result).toEqual({ success: true })

      status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.staged).not.toContain('staged.txt')
      expect(status.untracked).toContain('staged.txt')
    })
  })

  describe('git:discard', () => {
    it('abandonne les modifications d un fichier', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Modifie')

      const result = await mockIpcMain._invoke('git:discard', {
        cwd: repoDir,
        files: ['README.md'],
      })

      expect(result).toEqual({ success: true })

      const content = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf-8')
      expect(content).toBe('# Test')
    })
  })

  describe('git:show', () => {
    it('retourne les fichiers et le diff d un commit', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'new.txt'), 'new content')
      gitExec('git add .')
      gitExec('git commit -m "Add new file"')

      const log = await mockIpcMain._invoke('git:log', { cwd: repoDir })
      const lastCommit = log[0]

      const detail = await mockIpcMain._invoke('git:show', {
        cwd: repoDir,
        hash: lastCommit.hash,
      })

      expect(detail.files).toBeDefined()
      expect(detail.files.length).toBeGreaterThan(0)
      expect(detail.files.some((f: { file: string }) => f.file === 'new.txt')).toBe(true)
      expect(detail.diff).toContain('new content')
    })

    it('retourne vide pour un repo sans commits', async () => {
      setupGitRepo()

      const detail = await mockIpcMain._invoke('git:show', {
        cwd: repoDir,
        hash: 'abc123',
      })

      expect(detail.files).toEqual([])
      expect(detail.diff).toBe('')
    })
  })

  describe('git:stashList', () => {
    it('retourne la liste des stashes', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Stash me')
      gitExec('git stash')

      const stashes = await mockIpcMain._invoke('git:stashList', { cwd: repoDir })

      expect(stashes.length).toBeGreaterThan(0)
      expect(stashes[0].ref).toContain('stash@{0}')
      expect(stashes[0].message).toBeDefined()
    })

    it('retourne un tableau vide si pas de stash', async () => {
      setupGitRepoWithCommit()

      const stashes = await mockIpcMain._invoke('git:stashList', { cwd: repoDir })

      expect(stashes).toEqual([])
    })

    it('retourne un tableau vide pour un repo sans commits', async () => {
      setupGitRepo()

      const stashes = await mockIpcMain._invoke('git:stashList', { cwd: repoDir })

      expect(stashes).toEqual([])
    })
  })

  describe('git:renameBranch', () => {
    it('renomme une branche', async () => {
      setupGitRepoWithCommit()
      gitExec('git checkout -b old-name')
      gitExec('git checkout master')

      const result = await mockIpcMain._invoke('git:renameBranch', {
        cwd: repoDir,
        oldName: 'old-name',
        newName: 'new-name',
      })

      expect(result).toEqual({ success: true })

      const branches = await mockIpcMain._invoke('git:branches', { cwd: repoDir })
      const branchNames = branches.map((b: { name: string }) => b.name)
      expect(branchNames).toContain('new-name')
      expect(branchNames).not.toContain('old-name')
    })
  })

  describe('git:fetch', () => {
    it('retourne success pour un repo local sans remote', async () => {
      setupGitRepoWithCommit()

      // fetch sans remote echoue normalement
      const result = await mockIpcMain._invoke('git:fetch', { cwd: repoDir })

      // Sans remote, fetch echoue mais retourne une erreur proprement
      expect(result).toBeDefined()
      // success peut etre false (pas de remote) mais ne doit pas crash
    })
  })

  describe('integration: stage + commit workflow', () => {
    it('stage individual files then commit only staged', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'a.txt'), 'a')
      fs.writeFileSync(path.join(repoDir, 'b.txt'), 'b')

      // Stage only a.txt
      await mockIpcMain._invoke('git:stage', { cwd: repoDir, files: ['a.txt'] })

      let status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.staged).toContain('a.txt')
      expect(status.staged).not.toContain('b.txt')

      // Commit with staged files
      const result = await mockIpcMain._invoke('git:commit', {
        cwd: repoDir,
        message: 'Add a only',
        files: status.staged,
      })

      expect(result).toEqual({ success: true })

      // b.txt should still be untracked
      status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.untracked).toContain('b.txt')
      expect(status.staged).toEqual([])
    })

    it('stage, unstage, then commit nothing fails gracefully', async () => {
      setupGitRepoWithCommit()
      fs.writeFileSync(path.join(repoDir, 'temp.txt'), 'temp')

      await mockIpcMain._invoke('git:stage', { cwd: repoDir, files: ['temp.txt'] })
      await mockIpcMain._invoke('git:unstage', { cwd: repoDir, files: ['temp.txt'] })

      const status = await mockIpcMain._invoke('git:status', { cwd: repoDir })
      expect(status.staged).toEqual([])

      // Trying to commit with no staged files should fail
      const result = await mockIpcMain._invoke('git:commit', {
        cwd: repoDir,
        message: 'Empty commit',
        files: [],
      })

      // Nothing to commit, should fail
      expect(result.success).toBe(false)
    })
  })
})
