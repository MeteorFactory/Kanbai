import { v4 as uuid } from 'uuid'
import { readKanbanTasks, writeKanbanTasks, getNextTicketNumber } from '../../../mcp-server/lib/kanban-store'
import type { KanbanTask } from '../../../shared/types'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

function summarizeTask(task: KanbanTask): Partial<KanbanTask> {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    ticketNumber: task.ticketNumber,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    type: task.type,
    dueDate: task.dueDate,
    archived: task.archived,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

export const kanbanFeature: CompanionFeature = {
  id: 'kanban',
  name: 'Kanban Board',
  workspaceScoped: true,
  projectScoped: false,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    const tasks = readKanbanTasks(ctx.workspaceId)
    const activeTasks = tasks.filter((t) => !t.archived)
    return { success: true, data: activeTasks.map(summarizeTask) }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'get',
        description: 'Get a ticket by ID or ticket number',
        params: {
          ticketId: { type: 'string', required: true, description: 'Ticket ID or number' },
        },
      },
      {
        name: 'create',
        description: 'Create a new ticket',
        params: {
          title: { type: 'string', required: true, description: 'Ticket title' },
          description: { type: 'string', required: false, description: 'Ticket description' },
          priority: { type: 'string', required: false, description: 'Priority: low, medium, high' },
          type: { type: 'string', required: false, description: 'Type: bug, feature, test, doc, ia, refactor' },
        },
      },
      {
        name: 'update',
        description: 'Update a ticket',
        params: {
          ticketId: { type: 'string', required: true, description: 'Ticket ID' },
          title: { type: 'string', required: false, description: 'New title' },
          description: { type: 'string', required: false, description: 'New description' },
          status: { type: 'string', required: false, description: 'New status: TODO, WORKING, PENDING, DONE, FAILED' },
          priority: { type: 'string', required: false, description: 'New priority: low, medium, high' },
        },
      },
      {
        name: 'delete',
        description: 'Delete a ticket',
        params: {
          ticketId: { type: 'string', required: true, description: 'Ticket ID' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, ctx: CompanionContext): Promise<CompanionResult> {
    const tasks = readKanbanTasks(ctx.workspaceId)

    if (command === 'get') {
      const ticketId = String(params.ticketId ?? '')
      const task = tasks.find((t) => t.id === ticketId || String(t.ticketNumber) === ticketId)
      if (!task) return { success: false, error: `Ticket not found: ${ticketId}` }
      return { success: true, data: task }
    }

    if (command === 'create') {
      const title = params.title as string
      if (!title) return { success: false, error: 'Missing title' }

      const task: KanbanTask = {
        id: uuid(),
        workspaceId: ctx.workspaceId,
        ticketNumber: getNextTicketNumber(tasks),
        title,
        description: (params.description as string) || '',
        status: 'TODO',
        priority: (params.priority as KanbanTask['priority']) || 'medium',
        type: (params.type as KanbanTask['type']) || 'feature',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      tasks.push(task)
      writeKanbanTasks(ctx.workspaceId, tasks)
      return { success: true, data: task }
    }

    if (command === 'update') {
      const ticketId = String(params.ticketId ?? '')
      const idx = tasks.findIndex((t) => t.id === ticketId)
      if (idx < 0) return { success: false, error: `Ticket not found: ${ticketId}` }

      const task = tasks[idx]!
      if (params.title !== undefined) task.title = params.title as string
      if (params.description !== undefined) task.description = params.description as string
      if (params.status !== undefined) task.status = params.status as KanbanTask['status']
      if (params.priority !== undefined) task.priority = params.priority as KanbanTask['priority']
      task.updatedAt = Date.now()

      writeKanbanTasks(ctx.workspaceId, tasks)
      return { success: true, data: task }
    }

    if (command === 'delete') {
      const ticketId = String(params.ticketId ?? '')
      const filtered = tasks.filter((t) => t.id !== ticketId)
      if (filtered.length === tasks.length) return { success: false, error: `Ticket not found: ${ticketId}` }
      writeKanbanTasks(ctx.workspaceId, filtered)
      return { success: true }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
