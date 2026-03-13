import crypto from 'crypto'
import type { Session } from '../types.js'

const PAIRING_TTL_MS = 5 * 60 * 1000      // 5 minutes
const CONNECTED_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CLEANUP_INTERVAL_MS = 30 * 1000       // 30 seconds

const sessions = new Map<string, Session>()
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function createSession(code: string, appId: string, workspaceId: string): Session {
  const session: Session = {
    id: crypto.randomUUID(),
    code,
    desktopToken: generateToken(),
    companionToken: null,
    desktopAppId: appId,
    companionAppId: null,
    workspaceId,
    createdAt: Date.now(),
    expiresAt: Date.now() + PAIRING_TTL_MS,
    desktopWs: null,
    companionWs: null,
  }
  sessions.set(session.id, session)
  return session
}

export function getSessionByCode(code: string): Session | undefined {
  for (const session of sessions.values()) {
    if (session.code === code && session.expiresAt > Date.now()) {
      return session
    }
  }
  return undefined
}

export function getSessionByToken(token: string): Session | undefined {
  for (const session of sessions.values()) {
    if (
      (session.desktopToken === token || session.companionToken === token) &&
      session.expiresAt > Date.now()
    ) {
      return session
    }
  }
  return undefined
}

export function markSessionConnected(sessionId: string, companionAppId: string): string {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Session not found')
  session.companionToken = generateToken()
  session.companionAppId = companionAppId
  session.expiresAt = Date.now() + CONNECTED_TTL_MS
  return session.companionToken
}

export function deleteSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    if (session.desktopWs) session.desktopWs.close()
    if (session.companionWs) session.companionWs.close()
    sessions.delete(sessionId)
  }
}

export function deleteSessionByToken(token: string): boolean {
  for (const session of sessions.values()) {
    if (session.desktopToken === token || session.companionToken === token) {
      deleteSession(session.id)
      return true
    }
  }
  return false
}

export function getSessionById(sessionId: string): Session | undefined {
  return sessions.get(sessionId)
}

export function startCleanup(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now) {
        if (session.desktopWs) session.desktopWs.close()
        if (session.companionWs) session.companionWs.close()
        sessions.delete(id)
      }
    }
  }, CLEANUP_INTERVAL_MS)
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}
