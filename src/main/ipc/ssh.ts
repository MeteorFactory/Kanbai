import { IpcMain, dialog, shell } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { IPC_CHANNELS, SshKeyInfo, SshKeyType } from '../../shared/types'

const SSH_DIR = path.join(os.homedir(), '.ssh')

const KEY_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

function validateKeyName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new Error('Key name must be a string')
  }
  if (name.length === 0) {
    throw new Error('Key name must not be empty')
  }
  if (name.includes('\0')) {
    throw new Error('Key name must not contain null bytes')
  }
  if (!KEY_NAME_REGEX.test(name)) {
    throw new Error(
      'Key name must contain only alphanumeric characters, hyphens, and underscores',
    )
  }
  return name
}

function validatePublicKeyPath(keyPath: unknown): string {
  if (typeof keyPath !== 'string') {
    throw new Error('Key path must be a string')
  }
  if (keyPath.includes('\0')) {
    throw new Error('Key path must not contain null bytes')
  }
  const resolved = path.resolve(keyPath)
  const sshDirResolved = path.resolve(SSH_DIR)
  if (!resolved.startsWith(sshDirResolved + path.sep) && resolved !== sshDirResolved) {
    throw new Error('Key path must be within the ~/.ssh directory')
  }
  if (!resolved.endsWith('.pub')) {
    throw new Error('Key path must point to a .pub file')
  }
  return resolved
}

function getFingerprint(pubKeyPath: string): string {
  try {
    return execFileSync('ssh-keygen', ['-lf', pubKeyPath], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()
  } catch {
    return ''
  }
}

function detectKeyType(privateKeyPath: string): SshKeyType | string {
  try {
    const content = fs.readFileSync(privateKeyPath, 'utf-8')
    if (content.includes('OPENSSH PRIVATE KEY')) {
      // Detect from public key or filename
      const pubPath = privateKeyPath + '.pub'
      if (fs.existsSync(pubPath)) {
        const pubContent = fs.readFileSync(pubPath, 'utf-8')
        if (pubContent.startsWith('ssh-ed25519')) return 'ed25519'
        if (pubContent.startsWith('ssh-rsa')) return 'rsa'
        if (pubContent.startsWith('ecdsa-')) return 'ecdsa'
      }
      return 'ed25519'
    }
    if (content.includes('RSA PRIVATE KEY')) return 'rsa'
    if (content.includes('EC PRIVATE KEY')) return 'ecdsa'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function getComment(pubKeyPath: string): string {
  try {
    const content = fs.readFileSync(pubKeyPath, 'utf-8').trim()
    const parts = content.split(' ')
    return parts.length >= 3 ? parts.slice(2).join(' ') : ''
  } catch {
    return ''
  }
}

function listSshKeys(): SshKeyInfo[] {
  if (!fs.existsSync(SSH_DIR)) return []

  const files = fs.readdirSync(SSH_DIR)
  const keys: SshKeyInfo[] = []

  // Find private keys (files that have a matching .pub)
  for (const file of files) {
    if (file.startsWith('.') || file === 'known_hosts' || file === 'known_hosts.old' ||
        file === 'config' || file === 'authorized_keys' || file.endsWith('.pub')) continue

    const fullPath = path.join(SSH_DIR, file)
    const pubPath = fullPath + '.pub'
    const stat = fs.statSync(fullPath)

    if (!stat.isFile()) continue

    // Check if it looks like a key file
    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      if (!content.includes('PRIVATE KEY') && !content.includes('OPENSSH')) continue
    } catch {
      continue
    }

    const hasPub = fs.existsSync(pubPath)
    const keyType = detectKeyType(fullPath)
    const fingerprint = hasPub ? getFingerprint(pubPath) : ''
    const comment = hasPub ? getComment(pubPath) : ''

    keys.push({
      id: file,
      name: file,
      type: keyType as SshKeyType,
      fingerprint,
      publicKeyPath: hasPub ? pubPath : '',
      privateKeyPath: fullPath,
      comment,
      createdAt: stat.birthtimeMs || stat.mtimeMs,
      isDefault: file === 'id_ed25519' || file === 'id_rsa',
    })
  }

  // Sort: default keys first, then by name
  keys.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return a.name.localeCompare(b.name)
  })

  return keys
}

export function registerSshHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.SSH_LIST_KEYS, async () => {
    try {
      return { success: true, keys: listSshKeys() }
    } catch (err) {
      return { success: false, keys: [], error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SSH_GENERATE_KEY,
    async (
      _event,
      { name, type, comment }: { name: string; type: SshKeyType; comment: string },
    ) => {
      try {
        const validName = validateKeyName(name)

        // Ensure ~/.ssh exists
        if (!fs.existsSync(SSH_DIR)) {
          fs.mkdirSync(SSH_DIR, { mode: 0o700 })
        }

        const keyPath = path.join(SSH_DIR, validName)

        // Don't overwrite existing keys
        if (fs.existsSync(keyPath)) {
          return { success: false, error: `Key "${name}" already exists` }
        }

        const args = ['-t', type, '-f', keyPath, '-N', '']
        if (comment) {
          args.push('-C', comment)
        }

        execFileSync('ssh-keygen', args, {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SSH_READ_PUBLIC_KEY,
    async (_event, { keyPath }: { keyPath: string }) => {
      try {
        const validPath = validatePublicKeyPath(keyPath)
        const content = fs.readFileSync(validPath, 'utf-8').trim()
        return { success: true, content }
      } catch (err) {
        return { success: false, content: '', error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SSH_IMPORT_KEY,
    async (_event, { name, privateKey, publicKey }: { name: string; privateKey: string; publicKey?: string }) => {
      try {
        const validName = validateKeyName(name)

        if (!fs.existsSync(SSH_DIR)) {
          fs.mkdirSync(SSH_DIR, { mode: 0o700 })
        }

        const keyPath = path.join(SSH_DIR, validName)
        if (fs.existsSync(keyPath)) {
          return { success: false, error: `Key "${name}" already exists` }
        }

        fs.writeFileSync(keyPath, privateKey, { mode: 0o600 })

        if (publicKey) {
          fs.writeFileSync(keyPath + '.pub', publicKey, { mode: 0o644 })
        }

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SSH_DELETE_KEY,
    async (_event, { name }: { name: string }) => {
      try {
        const validName = validateKeyName(name)
        const keyPath = path.join(SSH_DIR, validName)
        const pubPath = keyPath + '.pub'

        if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath)
        if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath)

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.SSH_OPEN_DIRECTORY, async () => {
    try {
      if (!fs.existsSync(SSH_DIR)) {
        fs.mkdirSync(SSH_DIR, { mode: 0o700 })
      }
      shell.openPath(SSH_DIR)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SSH_SELECT_KEY_FILE, async () => {
    try {
      const result = await dialog.showOpenDialog({
        defaultPath: SSH_DIR,
        properties: ['openFile'],
        title: 'Select SSH Key',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      const filePath = result.filePaths[0]!
      const content = fs.readFileSync(filePath, 'utf-8')
      const fileName = path.basename(filePath)

      return { success: true, filePath, fileName, content }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
