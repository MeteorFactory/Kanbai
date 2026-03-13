import type { IncomingMessage, ServerResponse } from 'http'
import {
  registerDesktop,
  connectCompanion,
  unregisterSession,
  getPairingStatus,
} from '../services/pairing-service.js'
import { extractToken } from '../middleware/auth.js'
import { readBody, sendJson, sendError } from '../server.js'
import type { PairRegisterRequest, PairConnectRequest } from '../types.js'

export async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody<PairRegisterRequest>(req)
  if (!body.code || !body.appId || !body.workspaceId) {
    sendError(res, 400, 'Missing required fields: code, appId, workspaceId')
    return
  }
  try {
    const result = registerDesktop(body)
    sendJson(res, 201, result)
  } catch (err) {
    sendError(res, 409, (err as Error).message)
  }
}

export async function handleConnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody<PairConnectRequest>(req)
  if (!body.code || !body.appId) {
    sendError(res, 400, 'Missing required fields: code, appId')
    return
  }
  try {
    const result = connectCompanion(body)
    sendJson(res, 200, result)
  } catch (err) {
    sendError(res, 404, (err as Error).message)
  }
}

export async function handleUnregister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractToken(req)
  if (!token) {
    sendError(res, 401, 'Missing authorization token')
    return
  }
  const deleted = unregisterSession(token)
  if (deleted) {
    sendJson(res, 200, { ok: true })
  } else {
    sendError(res, 404, 'Session not found')
  }
}

export function handleStatus(_req: IncomingMessage, res: ServerResponse, code: string): void {
  const status = getPairingStatus(code)
  sendJson(res, 200, status)
}
