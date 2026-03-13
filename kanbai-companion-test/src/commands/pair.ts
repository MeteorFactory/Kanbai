import crypto from 'crypto'
import type { ApiClient } from '../api-client.js'

export function generatePairingCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase()
}

export async function runCompanionConnect(client: ApiClient, code: string): Promise<boolean> {
  try {
    const result = await client.connect(code)
    console.log(`Connected! Session: ${result.sessionId}, Workspace: ${result.workspaceId}`)
    return true
  } catch (err) {
    console.error(`Connection failed: ${(err as Error).message}`)
    return false
  }
}

export async function runCheckStatus(client: ApiClient, code: string): Promise<void> {
  try {
    const status = await client.getStatus(code)
    console.log(`Status: ${status.status}${status.companionId ? `, companion: ${status.companionId}` : ''}`)
  } catch (err) {
    console.error(`Status check failed: ${(err as Error).message}`)
  }
}
