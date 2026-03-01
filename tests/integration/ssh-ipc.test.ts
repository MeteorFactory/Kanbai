import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'
import { IS_WIN } from '../helpers/platform'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-ssh-ipc-test-${process.pid}-${Date.now()}`)
const sshDir = path.join(TEST_DIR, '.ssh')

// Mock os.homedir to use temp directory
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: { ...actual, homedir: () => TEST_DIR },
    homedir: () => TEST_DIR,
  }
})

// Mock child_process
const mockExecFileSync = vi.fn()
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  return { ...actual, execFileSync: (...args: unknown[]) => mockExecFileSync(...args) }
})

// Mock electron dialog and shell
const mockDialog = { showOpenDialog: vi.fn() }
const mockShell = { openPath: vi.fn() }
vi.mock('electron', () => ({
  dialog: mockDialog,
  shell: mockShell,
}))

const PRIVATE_KEY_CONTENT = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbm\n-----END OPENSSH PRIVATE KEY-----'
const PUBLIC_KEY_CONTENT = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyContent user@host'
const RSA_PRIVATE_KEY_CONTENT = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'
const RSA_PUBLIC_KEY_CONTENT = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDExample user@host'

describe('SSH IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()
    mockExecFileSync.mockReset()
    mockDialog.showOpenDialog.mockReset()
    mockShell.openPath.mockReset()

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })

    const { registerSshHandlers } = await import('../../src/main/ipc/ssh')

    mockIpcMain = createMockIpcMain()
    registerSshHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // ─── Enregistrement des handlers ──────────────────────────────────────

  it('enregistre les 7 handlers SSH', () => {
    expect(mockIpcMain._handlers.has('ssh:listKeys')).toBe(true)
    expect(mockIpcMain._handlers.has('ssh:generateKey')).toBe(true)
    expect(mockIpcMain._handlers.has('ssh:readPublicKey')).toBe(true)
    expect(mockIpcMain._handlers.has('ssh:importKey')).toBe(true)
    expect(mockIpcMain._handlers.has('ssh:deleteKey')).toBe(true)
    expect(mockIpcMain._handlers.has('ssh:openDirectory')).toBe(true)
    expect(mockIpcMain._handlers.has('ssh:selectKeyFile')).toBe(true)
  })

  // ─── SSH_LIST_KEYS ────────────────────────────────────────────────────

  describe('ssh:listKeys', () => {
    it('retourne une liste vide quand le dossier .ssh n existe pas', async () => {
      const result = await mockIpcMain._invoke<{ success: boolean; keys: unknown[] }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toEqual([])
    })

    it('retourne une liste vide quand le dossier .ssh est vide', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      const result = await mockIpcMain._invoke<{ success: boolean; keys: unknown[] }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toEqual([])
    })

    it('detecte les cles ed25519 avec fichier prive et public', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abcdefg user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string; type: string; isDefault: boolean; comment: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
      expect(result.keys[0].type).toBe('ed25519')
      expect(result.keys[0].isDefault).toBe(true)
      expect(result.keys[0].comment).toBe('user@host')
    })

    it('detecte les cles RSA avec fichier prive et public', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'id_rsa'), RSA_PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_rsa.pub'), RSA_PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('2048 SHA256:xyzabc user@host (RSA)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string; type: string; isDefault: boolean }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_rsa')
      expect(result.keys[0].type).toBe('rsa')
      expect(result.keys[0].isDefault).toBe(true)
    })

    it('liste plusieurs cles et les trie (cles par defaut en premier)', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      // Cle personnalisee "deploy"
      fs.writeFileSync(path.join(sshDir, 'deploy'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'deploy.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      // Cle par defaut "id_ed25519"
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      // Cle personnalisee "github"
      fs.writeFileSync(path.join(sshDir, 'github'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'github.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string; isDefault: boolean }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(3)
      // La cle par defaut en premier
      expect(result.keys[0].name).toBe('id_ed25519')
      expect(result.keys[0].isDefault).toBe(true)
      // Puis les autres triees alphabetiquement
      expect(result.keys[1].name).toBe('deploy')
      expect(result.keys[1].isDefault).toBe(false)
      expect(result.keys[2].name).toBe('github')
      expect(result.keys[2].isDefault).toBe(false)
    })

    it('ignore le fichier config', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'config'), 'Host *\n  AddKeysToAgent yes')
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('ignore les fichiers known_hosts et known_hosts.old', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'known_hosts'), 'github.com ssh-rsa AAAAB3...')
      fs.writeFileSync(path.join(sshDir, 'known_hosts.old'), 'old entry')
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('ignore le fichier authorized_keys', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'authorized_keys'), PUBLIC_KEY_CONTENT)
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('ignore les fichiers .pub isoles sans cle privee correspondante', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      // Seulement un fichier .pub sans cle privee
      fs.writeFileSync(path.join(sshDir, 'orphan.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('ignore les fichiers caches (commencant par un point)', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, '.hidden_key'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('ignore les sous-dossiers dans .ssh', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.mkdirSync(path.join(sshDir, 'old-keys'))
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('ignore les fichiers qui ne contiennent pas PRIVATE KEY', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      // Un fichier texte quelconque dans .ssh
      fs.writeFileSync(path.join(sshDir, 'notes'), 'This is just a text file', { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('id_ed25519')
    })

    it('inclut le fingerprint via ssh-keygen', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      const expectedFingerprint = '256 SHA256:abcdefghijklmnop user@host (ED25519)'
      mockExecFileSync.mockReturnValue(expectedFingerprint)

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ fingerprint: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys[0].fingerprint).toBe(expectedFingerprint)
    })

    it('gere un fingerprint vide si ssh-keygen echoue', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockImplementation(() => {
        throw new Error('ssh-keygen failed')
      })

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ fingerprint: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys[0].fingerprint).toBe('')
    })

    it('retourne les chemins complets des cles privee et publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'mykey'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'mykey.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ privateKeyPath: string; publicKeyPath: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys[0].privateKeyPath).toBe(path.join(sshDir, 'mykey'))
      expect(result.keys[0].publicKeyPath).toBe(path.join(sshDir, 'mykey.pub'))
    })

    it('gere une cle privee sans fichier .pub correspondant', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'lonely_key'), PRIVATE_KEY_CONTENT, { mode: 0o600 })

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string; publicKeyPath: string; fingerprint: string; comment: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(1)
      expect(result.keys[0].name).toBe('lonely_key')
      expect(result.keys[0].publicKeyPath).toBe('')
      expect(result.keys[0].fingerprint).toBe('')
      expect(result.keys[0].comment).toBe('')
    })

    it('trie correctement avec deux cles par defaut (id_ed25519 et id_rsa)', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      fs.writeFileSync(path.join(sshDir, 'id_rsa'), RSA_PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_rsa.pub'), RSA_PUBLIC_KEY_CONTENT, { mode: 0o644 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })
      fs.writeFileSync(path.join(sshDir, 'custom'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'custom.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (KEY)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string; isDefault: boolean }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys).toHaveLength(3)
      // Les deux cles par defaut en premier (triees entre elles par nom)
      expect(result.keys[0].isDefault).toBe(true)
      expect(result.keys[1].isDefault).toBe(true)
      // La cle personnalisee en dernier
      expect(result.keys[2].name).toBe('custom')
      expect(result.keys[2].isDefault).toBe(false)
    })

    it('extrait le commentaire de la cle publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'mykey'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'mykey.pub'), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 my-email@example.com', { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc my-email@example.com (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ comment: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys[0].comment).toBe('my-email@example.com')
    })

    it('gere un commentaire avec espaces dans la cle publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'mykey'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'mykey.pub'), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 my key comment with spaces', { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc (ED25519)')

      const result = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ comment: string }> }>('ssh:listKeys')

      expect(result.success).toBe(true)
      expect(result.keys[0].comment).toBe('my key comment with spaces')
    })
  })

  // ─── SSH_GENERATE_KEY ─────────────────────────────────────────────────

  describe('ssh:generateKey', () => {
    it('genere une cle ed25519 avec succes', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      mockExecFileSync.mockReturnValue('')

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:generateKey', {
        name: 'my_new_key',
        type: 'ed25519',
        comment: 'user@host',
      })

      expect(result.success).toBe(true)
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'ssh-keygen',
        ['-t', 'ed25519', '-f', path.join(sshDir, 'my_new_key'), '-N', '', '-C', 'user@host'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 10000 }),
      )
    })

    it('genere une cle RSA avec succes', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      mockExecFileSync.mockReturnValue('')

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:generateKey', {
        name: 'my_rsa_key',
        type: 'rsa',
        comment: '',
      })

      expect(result.success).toBe(true)
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'ssh-keygen',
        ['-t', 'rsa', '-f', path.join(sshDir, 'my_rsa_key'), '-N', ''],
        expect.objectContaining({ encoding: 'utf-8', timeout: 10000 }),
      )
    })

    it('n inclut pas le flag -C quand le commentaire est vide', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      mockExecFileSync.mockReturnValue('')

      await mockIpcMain._invoke('ssh:generateKey', {
        name: 'no_comment_key',
        type: 'ed25519',
        comment: '',
      })

      const callArgs = mockExecFileSync.mock.calls[0][1] as string[]
      expect(callArgs).not.toContain('-C')
    })

    it('retourne une erreur si la cle existe deja', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'existing_key'), PRIVATE_KEY_CONTENT, { mode: 0o600 })

      const result = await mockIpcMain._invoke<{ success: boolean; error: string }>('ssh:generateKey', {
        name: 'existing_key',
        type: 'ed25519',
        comment: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('already exists')
      expect(mockExecFileSync).not.toHaveBeenCalled()
    })

    it('cree le dossier .ssh s il n existe pas', async () => {
      // Pas de sshDir cree ici
      expect(fs.existsSync(sshDir)).toBe(false)

      mockExecFileSync.mockReturnValue('')

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:generateKey', {
        name: 'new_key',
        type: 'ed25519',
        comment: 'test@host',
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(sshDir)).toBe(true)
    })

    it('retourne une erreur si ssh-keygen echoue', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      mockExecFileSync.mockImplementation(() => {
        throw new Error('ssh-keygen: command not found')
      })

      const result = await mockIpcMain._invoke<{ success: boolean; error: string }>('ssh:generateKey', {
        name: 'fail_key',
        type: 'ed25519',
        comment: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('ssh-keygen')
    })
  })

  // ─── SSH_READ_PUBLIC_KEY ──────────────────────────────────────────────

  describe('ssh:readPublicKey', () => {
    it('lit le contenu d une cle publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const pubPath = path.join(sshDir, 'id_ed25519.pub')
      fs.writeFileSync(pubPath, PUBLIC_KEY_CONTENT, { mode: 0o644 })

      const result = await mockIpcMain._invoke<{ success: boolean; content: string }>('ssh:readPublicKey', {
        keyPath: pubPath,
      })

      expect(result.success).toBe(true)
      expect(result.content).toBe(PUBLIC_KEY_CONTENT)
    })

    it('retourne le contenu sans espaces de fin', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const pubPath = path.join(sshDir, 'id_ed25519.pub')
      fs.writeFileSync(pubPath, PUBLIC_KEY_CONTENT + '\n\n  ', { mode: 0o644 })

      const result = await mockIpcMain._invoke<{ success: boolean; content: string }>('ssh:readPublicKey', {
        keyPath: pubPath,
      })

      expect(result.success).toBe(true)
      expect(result.content).toBe(PUBLIC_KEY_CONTENT)
    })

    it('retourne une erreur pour un fichier inexistant', async () => {
      const result = await mockIpcMain._invoke<{ success: boolean; content: string; error: string }>('ssh:readPublicKey', {
        keyPath: path.join(sshDir, 'nonexistent.pub'),
      })

      expect(result.success).toBe(false)
      expect(result.content).toBe('')
      expect(result.error).toBeDefined()
    })

    it('lit une cle publique RSA', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const pubPath = path.join(sshDir, 'id_rsa.pub')
      fs.writeFileSync(pubPath, RSA_PUBLIC_KEY_CONTENT, { mode: 0o644 })

      const result = await mockIpcMain._invoke<{ success: boolean; content: string }>('ssh:readPublicKey', {
        keyPath: pubPath,
      })

      expect(result.success).toBe(true)
      expect(result.content).toBe(RSA_PUBLIC_KEY_CONTENT)
    })
  })

  // ─── SSH_IMPORT_KEY ───────────────────────────────────────────────────

  describe('ssh:importKey', () => {
    it('importe une paire cle privee + cle publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:importKey', {
        name: 'imported_key',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      expect(result.success).toBe(true)

      const privatePath = path.join(sshDir, 'imported_key')
      const publicPath = path.join(sshDir, 'imported_key.pub')
      expect(fs.existsSync(privatePath)).toBe(true)
      expect(fs.existsSync(publicPath)).toBe(true)
      expect(fs.readFileSync(privatePath, 'utf-8')).toBe(PRIVATE_KEY_CONTENT)
      expect(fs.readFileSync(publicPath, 'utf-8')).toBe(PUBLIC_KEY_CONTENT)
    })

    it('importe une cle privee seule sans cle publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:importKey', {
        name: 'private_only',
        privateKey: PRIVATE_KEY_CONTENT,
      })

      expect(result.success).toBe(true)

      const privatePath = path.join(sshDir, 'private_only')
      const publicPath = path.join(sshDir, 'private_only.pub')
      expect(fs.existsSync(privatePath)).toBe(true)
      expect(fs.existsSync(publicPath)).toBe(false)
      expect(fs.readFileSync(privatePath, 'utf-8')).toBe(PRIVATE_KEY_CONTENT)
    })

    it.skipIf(IS_WIN)('applique les permissions 0o600 a la cle privee', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      await mockIpcMain._invoke('ssh:importKey', {
        name: 'perm_check',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      const privateStat = fs.statSync(path.join(sshDir, 'perm_check'))
      // Verification des permissions (masque pour owner read/write)
      expect(privateStat.mode & 0o777).toBe(0o600)
    })

    it.skipIf(IS_WIN)('applique les permissions 0o644 a la cle publique', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      await mockIpcMain._invoke('ssh:importKey', {
        name: 'perm_check_pub',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      const publicStat = fs.statSync(path.join(sshDir, 'perm_check_pub.pub'))
      expect(publicStat.mode & 0o777).toBe(0o644)
    })

    it('retourne une erreur si la cle existe deja', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'duplicate'), PRIVATE_KEY_CONTENT, { mode: 0o600 })

      const result = await mockIpcMain._invoke<{ success: boolean; error: string }>('ssh:importKey', {
        name: 'duplicate',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('already exists')
    })

    it('cree le dossier .ssh s il n existe pas', async () => {
      expect(fs.existsSync(sshDir)).toBe(false)

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:importKey', {
        name: 'new_import',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(sshDir)).toBe(true)
      expect(fs.existsSync(path.join(sshDir, 'new_import'))).toBe(true)
    })
  })

  // ─── SSH_DELETE_KEY ───────────────────────────────────────────────────

  describe('ssh:deleteKey', () => {
    it('supprime les fichiers prive et public', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const privatePath = path.join(sshDir, 'to_delete')
      const publicPath = path.join(sshDir, 'to_delete.pub')
      fs.writeFileSync(privatePath, PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(publicPath, PUBLIC_KEY_CONTENT, { mode: 0o644 })

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:deleteKey', {
        name: 'to_delete',
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(privatePath)).toBe(false)
      expect(fs.existsSync(publicPath)).toBe(false)
    })

    it('supprime la cle privee meme sans fichier .pub', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const privatePath = path.join(sshDir, 'only_private')
      fs.writeFileSync(privatePath, PRIVATE_KEY_CONTENT, { mode: 0o600 })

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:deleteKey', {
        name: 'only_private',
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(privatePath)).toBe(false)
    })

    it('reussit meme si les fichiers n existent pas', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:deleteKey', {
        name: 'nonexistent_key',
      })

      expect(result.success).toBe(true)
    })

    it('ne supprime pas les autres cles dans le dossier', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(path.join(sshDir, 'keep_me'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'keep_me.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })
      fs.writeFileSync(path.join(sshDir, 'delete_me'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'delete_me.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      await mockIpcMain._invoke('ssh:deleteKey', { name: 'delete_me' })

      expect(fs.existsSync(path.join(sshDir, 'keep_me'))).toBe(true)
      expect(fs.existsSync(path.join(sshDir, 'keep_me.pub'))).toBe(true)
      expect(fs.existsSync(path.join(sshDir, 'delete_me'))).toBe(false)
      expect(fs.existsSync(path.join(sshDir, 'delete_me.pub'))).toBe(false)
    })
  })

  // ─── SSH_OPEN_DIRECTORY ───────────────────────────────────────────────

  describe('ssh:openDirectory', () => {
    it('ouvre le dossier .ssh avec shell.openPath', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:openDirectory')

      expect(result.success).toBe(true)
      expect(mockShell.openPath).toHaveBeenCalledWith(sshDir)
    })

    it('cree le dossier .ssh s il n existe pas avant d ouvrir', async () => {
      expect(fs.existsSync(sshDir)).toBe(false)

      const result = await mockIpcMain._invoke<{ success: boolean }>('ssh:openDirectory')

      expect(result.success).toBe(true)
      expect(fs.existsSync(sshDir)).toBe(true)
      expect(mockShell.openPath).toHaveBeenCalledWith(sshDir)
    })

    it('appelle shell.openPath exactement une fois', async () => {
      fs.mkdirSync(sshDir, { recursive: true })

      await mockIpcMain._invoke('ssh:openDirectory')

      expect(mockShell.openPath).toHaveBeenCalledTimes(1)
    })
  })

  // ─── SSH_SELECT_KEY_FILE ──────────────────────────────────────────────

  describe('ssh:selectKeyFile', () => {
    it('retourne canceled: true quand le dialog est annule', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      const result = await mockIpcMain._invoke<{ success: boolean; canceled: boolean }>('ssh:selectKeyFile')

      expect(result.success).toBe(false)
      expect(result.canceled).toBe(true)
    })

    it('retourne canceled: true quand aucun fichier n est selectionne', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })

      const result = await mockIpcMain._invoke<{ success: boolean; canceled: boolean }>('ssh:selectKeyFile')

      expect(result.success).toBe(false)
      expect(result.canceled).toBe(true)
    })

    it('retourne le contenu et le chemin du fichier selectionne', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const keyFilePath = path.join(sshDir, 'selected_key')
      fs.writeFileSync(keyFilePath, PRIVATE_KEY_CONTENT, { mode: 0o600 })

      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [keyFilePath],
      })

      const result = await mockIpcMain._invoke<{
        success: boolean
        filePath: string
        fileName: string
        content: string
      }>('ssh:selectKeyFile')

      expect(result.success).toBe(true)
      expect(result.filePath).toBe(keyFilePath)
      expect(result.fileName).toBe('selected_key')
      expect(result.content).toBe(PRIVATE_KEY_CONTENT)
    })

    it('passe les bonnes options au dialog', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      await mockIpcMain._invoke('ssh:selectKeyFile')

      expect(mockDialog.showOpenDialog).toHaveBeenCalledWith({
        defaultPath: sshDir,
        properties: ['openFile'],
        title: 'Select SSH Key',
      })
    })

    it('retourne le nom de fichier correct depuis un chemin complet', async () => {
      fs.mkdirSync(sshDir, { recursive: true })
      const keyFilePath = path.join(sshDir, 'my-deploy-key')
      fs.writeFileSync(keyFilePath, PRIVATE_KEY_CONTENT, { mode: 0o600 })

      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [keyFilePath],
      })

      const result = await mockIpcMain._invoke<{ success: boolean; fileName: string }>('ssh:selectKeyFile')

      expect(result.success).toBe(true)
      expect(result.fileName).toBe('my-deploy-key')
    })

    it('retourne une erreur si la lecture du fichier echoue', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/nonexistent/path/key'],
      })

      const result = await mockIpcMain._invoke<{ success: boolean; error: string }>('ssh:selectKeyFile')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ─── Operations chainees ──────────────────────────────────────────────

  describe('operations chainees (workflow complet)', () => {
    it('genere une cle puis la liste', async () => {
      mockExecFileSync.mockReturnValue('')

      // Generer la cle
      const genResult = await mockIpcMain._invoke<{ success: boolean }>('ssh:generateKey', {
        name: 'workflow_key',
        type: 'ed25519',
        comment: 'test@host',
      })
      expect(genResult.success).toBe(true)

      // Simuler les fichiers crees par ssh-keygen
      fs.writeFileSync(path.join(sshDir, 'workflow_key'), PRIVATE_KEY_CONTENT, { mode: 0o600 })
      fs.writeFileSync(path.join(sshDir, 'workflow_key.pub'), PUBLIC_KEY_CONTENT, { mode: 0o644 })

      mockExecFileSync.mockReturnValue('256 SHA256:abc test@host (ED25519)')

      // Lister les cles
      const listResult = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')
      expect(listResult.success).toBe(true)
      expect(listResult.keys.some((k) => k.name === 'workflow_key')).toBe(true)
    })

    it('importe une cle, lit sa cle publique, puis la supprime', async () => {
      // Importer
      const importResult = await mockIpcMain._invoke<{ success: boolean }>('ssh:importKey', {
        name: 'lifecycle_key',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })
      expect(importResult.success).toBe(true)

      // Lire la cle publique
      const readResult = await mockIpcMain._invoke<{ success: boolean; content: string }>('ssh:readPublicKey', {
        keyPath: path.join(sshDir, 'lifecycle_key.pub'),
      })
      expect(readResult.success).toBe(true)
      expect(readResult.content).toBe(PUBLIC_KEY_CONTENT)

      // Supprimer
      const deleteResult = await mockIpcMain._invoke<{ success: boolean }>('ssh:deleteKey', {
        name: 'lifecycle_key',
      })
      expect(deleteResult.success).toBe(true)

      // Verifier la suppression
      expect(fs.existsSync(path.join(sshDir, 'lifecycle_key'))).toBe(false)
      expect(fs.existsSync(path.join(sshDir, 'lifecycle_key.pub'))).toBe(false)
    })

    it('importe deux cles puis verifie le tri dans la liste', async () => {
      // Importer "zeta_key"
      await mockIpcMain._invoke('ssh:importKey', {
        name: 'zeta_key',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      // Importer "alpha_key"
      await mockIpcMain._invoke('ssh:importKey', {
        name: 'alpha_key',
        privateKey: PRIVATE_KEY_CONTENT,
        publicKey: PUBLIC_KEY_CONTENT,
      })

      mockExecFileSync.mockReturnValue('256 SHA256:abc user@host (ED25519)')

      const listResult = await mockIpcMain._invoke<{ success: boolean; keys: Array<{ name: string }> }>('ssh:listKeys')

      expect(listResult.success).toBe(true)
      expect(listResult.keys).toHaveLength(2)
      // Tri alphabetique (aucune cle par defaut)
      expect(listResult.keys[0].name).toBe('alpha_key')
      expect(listResult.keys[1].name).toBe('zeta_key')
    })
  })
})
