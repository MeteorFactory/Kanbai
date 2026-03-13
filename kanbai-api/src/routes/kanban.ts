import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { sendJson, sendError, readBody } from '../server.js'
import type { Session, KanbanTaskApi, CreateTicketRequest, UpdateTicketRequest } from '../types.js'

function kanbanFilePath(workspaceId: string): string {
  return path.join(os.homedir(), '.kanbai', 'kanban', `${workspaceId}.json`)
}

function readTasks(workspaceId: string): KanbanTaskApi[] {
  const filePath = kanbanFilePath(workspaceId)
  if (!fs.existsSync(filePath)) return []
  const raw = fs.readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw) as { tasks?: KanbanTaskApi[] }
  return data.tasks ?? []
}

function writeTasks(workspaceId: string, tasks: KanbanTaskApi[]): void {
  const filePath = kanbanFilePath(workspaceId)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({ tasks }, null, 2), 'utf-8')
}

export function handleListTickets(_req: IncomingMessage, res: ServerResponse, session: Session): void {
  const tasks = readTasks(session.workspaceId)
  sendJson(res, 200, { tickets: tasks })
}

export function handleGetTicket(_req: IncomingMessage, res: ServerResponse, session: Session, ticketId: string): void {
  const tasks = readTasks(session.workspaceId)
  const task = tasks.find((t) => t.id === ticketId)
  if (!task) {
    sendError(res, 404, 'Ticket not found')
    return
  }
  sendJson(res, 200, task)
}

export async function handleCreateTicket(req: IncomingMessage, res: ServerResponse, session: Session): Promise<void> {
  const body = await readBody<CreateTicketRequest>(req)
  if (!body.title) {
    sendError(res, 400, 'Missing required field: title')
    return
  }
  const tasks = readTasks(session.workspaceId)
  const newTask: KanbanTaskApi = {
    id: crypto.randomUUID(),
    title: body.title,
    description: body.description ?? '',
    status: body.status ?? 'TODO',
    priority: body.priority,
    tags: body.tags,
    assignee: body.assignee,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  tasks.push(newTask)
  writeTasks(session.workspaceId, tasks)
  sendJson(res, 201, newTask)
}

export async function handleUpdateTicket(
  req: IncomingMessage,
  res: ServerResponse,
  session: Session,
  ticketId: string,
): Promise<void> {
  const body = await readBody<UpdateTicketRequest>(req)
  const tasks = readTasks(session.workspaceId)
  const index = tasks.findIndex((t) => t.id === ticketId)
  if (index === -1) {
    sendError(res, 404, 'Ticket not found')
    return
  }
  const existing = tasks[index]!
  const updated: KanbanTaskApi = {
    ...existing,
    ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  }
  tasks[index] = updated
  writeTasks(session.workspaceId, tasks)
  sendJson(res, 200, updated)
}

export function handleDeleteTicket(_req: IncomingMessage, res: ServerResponse, session: Session, ticketId: string): void {
  const tasks = readTasks(session.workspaceId)
  const index = tasks.findIndex((t) => t.id === ticketId)
  if (index === -1) {
    sendError(res, 404, 'Ticket not found')
    return
  }
  tasks.splice(index, 1)
  writeTasks(session.workspaceId, tasks)
  sendJson(res, 204, null)
}
