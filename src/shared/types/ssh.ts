// SSH Key types

export type SshKeyType = 'ed25519' | 'rsa'

export interface SshKeyInfo {
  id: string
  name: string
  type: SshKeyType
  fingerprint: string
  publicKeyPath: string
  privateKeyPath: string
  comment: string
  createdAt: number
  isDefault: boolean
}
