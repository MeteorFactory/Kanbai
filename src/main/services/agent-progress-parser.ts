interface TodoItem {
  content: string
  status: string
}

export interface AgentTaskItem {
  label: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type AgentActivityType = 'thinking' | 'tool' | 'subagent' | 'text' | 'idle'

export interface AgentActivity {
  type: AgentActivityType
  label: string
  detail?: string
}

interface TerminalState {
  taskId: string
  lineBuffer: string
  seenToolIds: Set<string>
  taskCount: number
  completedTasks: number
  items: AgentTaskItem[]
  activity: AgentActivity
}

export interface ProgressUpdate {
  taskId: string
  progress: string
  message: string
  items: AgentTaskItem[]
  activity: AgentActivity
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
      activity: { type: 'idle', label: '' },
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
    // Handle session end
    if (event.type === 'result') {
      state.activity = { type: 'idle', label: '' }
      return this.buildUpdate(state)
    }

    if (event.type !== 'assistant') return null

    const message = event.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return null

    let changed = false
    for (const block of content) {
      const blockType = block.type as string

      // Thinking block
      if (blockType === 'thinking' && block.thinking) {
        state.activity = { type: 'thinking', label: 'Réflexion...' }
        changed = true
        continue
      }

      // Text block
      if (blockType === 'text') {
        const text = (block.text as string)?.trim()
        if (text) {
          state.activity = { type: 'text', label: 'Rédaction...' }
          changed = true
        }
        continue
      }

      // Tool use
      if (blockType === 'tool_use') {
        const id = block.id as string
        if (state.seenToolIds.has(id)) continue
        state.seenToolIds.add(id)

        const name = block.name as string
        const input = (block.input as Record<string, unknown>) ?? {}

        // Update activity based on tool type
        state.activity = this.toolToActivity(name, input)
        changed = true

        // Extract progress for task-tracking tools
        this.extractProgress(name, input, state)
      }
    }

    return changed ? this.buildUpdate(state) : null
  }

  private buildUpdate(state: TerminalState): ProgressUpdate {
    return {
      taskId: state.taskId,
      progress: state.taskCount > 0 || state.items.length > 0
        ? `${state.completedTasks}/${Math.max(state.taskCount, state.items.length)}`
        : '',
      message: state.activity.label,
      items: [...state.items],
      activity: { ...state.activity },
    }
  }

  private toolToActivity(name: string, input: Record<string, unknown>): AgentActivity {
    switch (name) {
      case 'Agent':
        return {
          type: 'subagent',
          label: (input.description as string) ?? 'Subagent',
          detail: (input.subagent_type as string) ?? undefined,
        }
      case 'Read':
        return { type: 'tool', label: `Lecture`, detail: this.shortPath(input.file_path as string) }
      case 'Write':
        return { type: 'tool', label: `Écriture`, detail: this.shortPath(input.file_path as string) }
      case 'Edit':
        return { type: 'tool', label: `Modification`, detail: this.shortPath(input.file_path as string) }
      case 'Bash':
        return { type: 'tool', label: `Commande`, detail: this.truncate(input.command as string, 60) }
      case 'Grep':
        return { type: 'tool', label: `Recherche`, detail: input.pattern as string }
      case 'Glob':
        return { type: 'tool', label: `Recherche fichiers`, detail: input.pattern as string }
      case 'TodoWrite':
        return { type: 'tool', label: 'Mise à jour tâches' }
      case 'TaskCreate':
        return { type: 'tool', label: 'Création tâche', detail: input.subject as string }
      case 'TaskUpdate':
        return { type: 'tool', label: 'Mise à jour tâche', detail: input.subject as string }
      case 'WebSearch':
        return { type: 'tool', label: 'Recherche web', detail: input.query as string }
      case 'WebFetch':
        return { type: 'tool', label: 'Fetch web', detail: input.url as string }
      default:
        return { type: 'tool', label: name }
    }
  }

  private shortPath(filePath?: string): string | undefined {
    if (!filePath) return undefined
    const parts = filePath.split('/')
    return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : filePath
  }

  private truncate(text?: string, max = 50): string | undefined {
    if (!text) return undefined
    return text.length > max ? text.slice(0, max) + '…' : text
  }

  private extractProgress(
    name: string,
    input: Record<string, unknown>,
    state: TerminalState,
  ): void {
    if (name === 'TodoWrite') {
      const todos = input.todos as TodoItem[] | undefined
      if (!Array.isArray(todos) || todos.length === 0) return
      state.items = todos.map((t) => ({
        label: t.content,
        status: t.status === 'completed' ? 'completed' as const
          : t.status === 'in_progress' ? 'in_progress' as const
          : 'pending' as const,
      }))
      const completed = todos.filter((t) => t.status === 'completed').length
      state.completedTasks = completed
      state.taskCount = todos.length
    }

    if (name === 'TaskCreate') {
      state.taskCount++
      const subject = (input.subject as string) ?? ''
      state.items.push({ label: subject, status: 'pending' })
    }

    if (name === 'TaskUpdate') {
      const status = input.status as string | undefined
      const title = (input.subject as string) ?? (input.title as string) ?? ''
      if (status === 'completed') {
        state.completedTasks++
        const item = state.items.find((i) => i.label === title || i.status !== 'completed')
        if (item) item.status = 'completed'
      }
      if (status === 'in_progress') {
        const item = state.items.find((i) => i.label === title)
        if (item) item.status = 'in_progress'
      }
    }
  }
}
