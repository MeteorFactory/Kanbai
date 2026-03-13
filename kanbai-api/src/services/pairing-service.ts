import {
  createSession,
  getSessionByCode,
  markSessionConnected,
  deleteSessionByToken,
} from './session-store.js'
import type {
  PairRegisterRequest,
  PairRegisterResponse,
  PairConnectRequest,
  PairConnectResponse,
  PairStatusResponse,
} from '../types.js'

export function registerDesktop(req: PairRegisterRequest): PairRegisterResponse {
  const existing = getSessionByCode(req.code)
  if (existing) {
    throw new Error('Code already registered')
  }
  const session = createSession(req.code, req.appId, req.workspaceId)
  return { sessionId: session.id, token: session.desktopToken }
}

export function connectCompanion(req: PairConnectRequest): PairConnectResponse {
  const session = getSessionByCode(req.code)
  if (!session) {
    throw new Error('Invalid or expired code')
  }
  if (session.companionToken) {
    throw new Error('Session already has a companion')
  }
  const companionToken = markSessionConnected(session.id, req.appId)
  return {
    sessionId: session.id,
    token: companionToken,
    workspaceId: session.workspaceId,
  }
}

export function unregisterSession(token: string): boolean {
  return deleteSessionByToken(token)
}

export function getPairingStatus(code: string): PairStatusResponse {
  const session = getSessionByCode(code)
  if (!session) {
    return { status: 'expired' }
  }
  if (session.companionToken) {
    return { status: 'connected', companionId: session.companionAppId ?? undefined }
  }
  return { status: 'waiting' }
}
