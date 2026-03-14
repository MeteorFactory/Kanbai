#!/usr/bin/env npx tsx
/**
 * Companion Tester CLI
 *
 * A test client for the Kanbai companion data server.
 * Allows querying kanban data using workspace/namespace names instead of IDs.
 * All data retrieval is encrypted with AES-256-GCM.
 *
 * Usage:
 *   npx tsx tools/companion-tester.ts --port <port> --key <base64key> --token <token> workspaces
 *   npx tsx tools/companion-tester.ts --port <port> --key <base64key> --token <token> tickets <workspace-name>
 *   npx tsx tools/companion-tester.ts --port <port> --key <base64key> --token <token> ticket <workspace-name> <ticket-id-or-number>
 */

import http from 'http'
import crypto from 'crypto'

const ENCRYPTION_ALGO = 'aes-256-gcm'

interface EncryptedPayload {
  iv: string
  encrypted: string
  tag: string
}

function decrypt(payload: EncryptedPayload, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64')
  const iv = Buffer.from(payload.iv, 'base64')
  const encrypted = Buffer.from(payload.encrypted, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf-8')
}

function request(port: number, path: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw}`))
            return
          }
          resolve(raw)
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function fetchDecrypted(port: number, path: string, token: string, key: string): Promise<unknown> {
  const raw = await request(port, path, token)
  const payload: EncryptedPayload = JSON.parse(raw)
  const decrypted = decrypt(payload, key)
  return JSON.parse(decrypted)
}

function printHelp(): void {
  console.log(`
Kanbai Companion Tester

Usage:
  npx tsx tools/companion-tester.ts [options] <command> [args...]

Options:
  --port <port>      Companion data server port
  --key <base64>     Encryption key (base64)
  --token <token>    Bearer token for authentication

Commands:
  workspaces                                List all workspaces (with namespace names)
  tickets <workspace-name-or-id>            List tickets for a workspace (by name or ID)
  ticket <workspace-name-or-id> <ticket>    Get ticket detail (by ID or ticket number)

Examples:
  npx tsx tools/companion-tester.ts --port 54321 --key abc123== --token mytoken workspaces
  npx tsx tools/companion-tester.ts --port 54321 --key abc123== --token mytoken tickets "Mon Projet"
  npx tsx tools/companion-tester.ts --port 54321 --key abc123== --token mytoken ticket "Mon Projet" 5
`)
}

function parseArgs(argv: string[]): { port: number; key: string; token: string; command: string; args: string[] } {
  const args = argv.slice(2)
  let port = 0
  let key = ''
  let token = ''
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--port' && args[i + 1]) {
      port = parseInt(args[++i]!, 10)
    } else if (arg === '--key' && args[i + 1]) {
      key = args[++i]!
    } else if (arg === '--token' && args[i + 1]) {
      token = args[++i]!
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      positional.push(arg)
    }
  }

  if (!port || !key || !token || positional.length === 0) {
    printHelp()
    process.exit(1)
  }

  return { port, key, token, command: positional[0]!, args: positional.slice(1) }
}

async function main(): Promise<void> {
  const { port, key, token, command, args } = parseArgs(process.argv)

  switch (command) {
    case 'workspaces': {
      const data = await fetchDecrypted(port, '/api/v1/companion/workspaces', token, key)
      console.log(JSON.stringify(data, null, 2))
      break
    }

    case 'tickets': {
      const workspace = args[0]
      if (!workspace) {
        console.error('Error: workspace name or ID required')
        process.exit(1)
      }
      const encoded = encodeURIComponent(workspace)
      const data = await fetchDecrypted(port, `/api/v1/companion/tickets?workspace=${encoded}`, token, key)
      console.log(JSON.stringify(data, null, 2))
      break
    }

    case 'ticket': {
      const workspace = args[0]
      const ticketId = args[1]
      if (!workspace || !ticketId) {
        console.error('Error: workspace name/ID and ticket ID/number required')
        process.exit(1)
      }
      const encodedWs = encodeURIComponent(workspace)
      const encodedId = encodeURIComponent(ticketId)
      const data = await fetchDecrypted(
        port,
        `/api/v1/companion/tickets/${encodedId}?workspace=${encodedWs}`,
        token,
        key,
      )
      console.log(JSON.stringify(data, null, 2))
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', (err as Error).message)
  process.exit(1)
})
