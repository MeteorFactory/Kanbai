import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import type { KanbanTask, KanbanStatus } from '../../shared/types'

export function getKanbanDir(): string {
  const dir = path.join(os.homedir(), '.kanbai', 'kanban')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getKanbanPath(workspaceId: string): string {
  return path.join(getKanbanDir(), `${workspaceId}.json`)
}

export function readKanbanTasks(workspaceId: string): KanbanTask[] {
  const filePath = getKanbanPath(workspaceId)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function writeKanbanTasks(workspaceId: string, tasks: KanbanTask[]): void {
  const filePath = getKanbanPath(workspaceId)
  getKanbanDir()
  fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8')
}

export function getNextTicketNumber(tasks: KanbanTask[]): number {
  return tasks.reduce((max, t) => Math.max(max, t.ticketNumber ?? 0), 0) + 1
}

export function createKanbanTask(
  workspaceId: string,
  data: {
    title: string
    description: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    status?: KanbanStatus
    targetProjectId?: string
    labels?: string[]
    isCtoTicket?: boolean
    disabled?: boolean
    parentTicketId?: string
  },
): KanbanTask {
  const tasks = readKanbanTasks(workspaceId)
  const task: KanbanTask = {
    id: uuid(),
    workspaceId,
    targetProjectId: data.targetProjectId,
    ticketNumber: getNextTicketNumber(tasks),
    title: data.title,
    description: data.description,
    status: data.status || 'TODO',
    priority: data.priority,
    labels: data.labels,
    isCtoTicket: data.isCtoTicket,
    disabled: data.disabled,
    parentTicketId: data.parentTicketId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.push(task)

  // If parentTicketId is set, update the parent's childTicketIds
  if (data.parentTicketId) {
    const parentIdx = tasks.findIndex((t) => t.id === data.parentTicketId)
    if (parentIdx !== -1) {
      const parent = tasks[parentIdx]!
      const children = parent.childTicketIds ?? []
      if (!children.includes(task.id)) {
        tasks[parentIdx] = {
          ...parent,
          childTicketIds: [...children, task.id],
          updatedAt: Date.now(),
        }
      }
    }
  }

  writeKanbanTasks(workspaceId, tasks)
  return task
}

export function updateKanbanTask(
  workspaceId: string,
  taskId: string,
  updates: Partial<KanbanTask>,
): KanbanTask {
  const tasks = readKanbanTasks(workspaceId)
  const idx = tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) throw new Error(`Kanban task ${taskId} not found`)
  const { workspaceId: _wid, ...safeUpdates } = updates
  tasks[idx] = { ...tasks[idx]!, ...safeUpdates, updatedAt: Date.now() }
  writeKanbanTasks(workspaceId, tasks)
  return tasks[idx]!
}

export function deleteKanbanTask(workspaceId: string, taskId: string): void {
  const tasks = readKanbanTasks(workspaceId)
  const taskToDelete = tasks.find((t) => t.id === taskId)

  // Clean up parent's childTicketIds if this task has a parent
  if (taskToDelete?.parentTicketId) {
    const parent = tasks.find((t) => t.id === taskToDelete.parentTicketId)
    if (parent?.childTicketIds) {
      parent.childTicketIds = parent.childTicketIds.filter((id) => id !== taskId)
      parent.updatedAt = Date.now()
    }
  }

  // Clean up children's parentTicketId if this task is a parent
  if (taskToDelete?.childTicketIds) {
    for (const childId of taskToDelete.childTicketIds) {
      const child = tasks.find((t) => t.id === childId)
      if (child) {
        child.parentTicketId = undefined
        child.updatedAt = Date.now()
      }
    }
  }

  const filtered = tasks.filter((t) => t.id !== taskId)
  writeKanbanTasks(workspaceId, filtered)
}
