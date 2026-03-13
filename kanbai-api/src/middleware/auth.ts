import type { IncomingMessage } from 'http'
import { getSessionByToken } from '../services/session-store.js'
import type { Session } from '../types.js'

export function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization']
  if (!auth || !auth.startsWith('Bearer ')) return null
  return auth.slice(7)
}

export function authenticate(req: IncomingMessage): Session | null {
  const token = extractToken(req)
  if (!token) return null
  return getSessionByToken(token) ?? null
}
