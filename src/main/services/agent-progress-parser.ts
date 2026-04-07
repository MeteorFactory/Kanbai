interface TodoItem {
  content: string
  status: string
}

export interface AgentTaskItem {
  label: string
  status: 'pending' | 'in_progress' | 'completed'
}

interface TerminalState {
  taskId: string
  lineBuffer: string
  seenToolIds: Set<string>
  taskCount: number
  completedTasks: number
  items: AgentTaskItem[]
}

export interface ProgressUpdate {
  taskId: string
  progress: string
  message: string
  items: AgentTaskItem[]
}

export class AgentProgressParser {
  private terminals = new Map<string, TerminalState>()

  register(terminalId: string, taskId: string): void {
    this.terminals.set(terminalId, {
      taskId,
      lineBuffer: '',
      seenToolIds: new Set(),
      taskCount: 0,
      completedTasks: 0,
      items: [],
    })
  }

  unregister(terminalId: string): void {
    this.terminals.delete(terminalId)
  }

  feed(terminalId: string, raw: string): ProgressUpdate | null {
    const state = this.terminals.get(terminalId)
    if (!state) return null

    state.lineBuffer += raw
    const lines = state.lineBuffer.split('\n')
    state.lineBuffer = lines.pop() ?? ''

    let lastUpdate: ProgressUpdate | null = null
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const update = this.parseEvent(JSON.parse(trimmed), state)
        if (update) lastUpdate = update
      } catch {
        // not JSON — skip
      }
    }
    return lastUpdate
  }

  private parseEvent(
    event: Record<string, unknown>,
    state: TerminalState,
  ): ProgressUpdate | null {
    if (event.type !== 'assistant') return null

    const message = event.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return null

    let lastUpdate: ProgressUpdate | null = null
    for (const block of content) {
      if (block.type !== 'tool_use') continue

      const id = block.id as string
      if (state.seenToolIds.has(id)) continue
      state.seenToolIds.add(id)

      const name = block.name as string
      const input = (block.input as Record<string, unknown>) ?? {}
      const update = this.extractProgress(name, input, state)
      if (update) lastUpdate = update
    }
    return lastUpdate
  }

  private extractProgress(
    name: string,
    input: Record<string, unknown>,
    state: TerminalState,
  ): ProgressUpdate | null {
    if (name === 'TodoWrite') {
      const todos = input.todos as TodoItem[] | undefined
      if (!Array.isArray(todos) || todos.length === 0) return null
      const completed = todos.filter((t) => t.status === 'completed').length
      const active = todos.find((t) => t.status === 'in_progress')
      state.items = todos.map((t) => ({
        label: t.content,
        status: t.status === 'completed' ? 'completed' as const
          : t.status === 'in_progress' ? 'in_progress' as const
          : 'pending' as const,
      }))
      return {
        taskId: state.taskId,
        progress: `${completed}/${todos.length}`,
        message: active?.content ?? '',
        items: [...state.items],
      }
    }

    if (name === 'TaskCreate') {
      state.taskCount++
      const subject = (input.subject as string) ?? ''
      state.items.push({ label: subject, status: 'pending' })
      return {
        taskId: state.taskId,
        progress: `${state.completedTasks}/${state.taskCount}`,
        message: subject,
        items: [...state.items],
      }
    }

    if (name === 'TaskUpdate') {
      const status = input.status as string | undefined
      const title = (input.subject as string) ?? (input.title as string) ?? ''
      if (status === 'completed') {
        state.completedTasks++
        const item = state.items.find((i) => i.label === title || i.status !== 'completed')
        if (item) item.status = 'completed'
        return {
          taskId: state.taskId,
          progress: `${state.completedTasks}/${Math.max(state.taskCount, state.completedTasks)}`,
          message: title,
          items: [...state.items],
        }
      }
      if (status === 'in_progress') {
        const item = state.items.find((i) => i.label === title)
        if (item) item.status = 'in_progress'
        return {
          taskId: state.taskId,
          progress: `${state.completedTasks}/${Math.max(state.taskCount, state.completedTasks)}`,
          message: title,
          items: [...state.items],
        }
      }
    }

    return null
  }
}
