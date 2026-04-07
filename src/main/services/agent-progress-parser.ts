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

export interface SubagentInfo {
  name: string
  status: string
}

interface TerminalState {
  taskId: string
  lineBuffer: string
  activity: AgentActivity
  subagents: SubagentInfo[]
  items: AgentTaskItem[]
  completedCount: number
  totalCount: number
}

export interface ProgressUpdate {
  taskId: string
  progress: string
  message: string
  items: AgentTaskItem[]
  activity: AgentActivity
  subagents: SubagentInfo[]
}

// Strip ANSI escape codes from PTY output
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z?]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[\?[0-9;]*[hlsr]/g, '')
}

// Claude Code spinner verbs — fancy animated thinking indicators
const SPINNER_PATTERN = /[✶✻✽✳✢✺✵❋✿⊹⋆]\s*(\S+…)/

// Tool use patterns — ⏺ prefix in Claude Code CLI output
const TOOL_PATTERNS: Array<{
  pattern: RegExp
  type: AgentActivityType
  labelFn: (m: RegExpMatchArray) => string
  detailFn?: (m: RegExpMatchArray) => string | undefined
}> = [
  {
    pattern: /⏺\s*(?:Read|Reading)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Lecture',
    detailFn: (m) => m[1]?.trim().replace(/\.{3}$/, ''),
  },
  {
    pattern: /⏺\s*(?:Edit|Editing)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Modification',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /⏺\s*(?:Write|Writing)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Écriture',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /⏺\s*Bash\((.+?)\)/,
    type: 'tool',
    labelFn: () => 'Commande',
    detailFn: (m) => {
      const cmd = m[1]?.trim()
      return cmd && cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd
    },
  },
  {
    pattern: /⏺\s*(?:Grep|Searching)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Recherche',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /⏺\s*(?:Glob|Finding)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Recherche fichiers',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /⏺\s*Agent\s*\((.+?)\)/,
    type: 'subagent',
    labelFn: (m) => m[1]?.trim() ?? 'Subagent',
  },
  {
    pattern: /⏺\s*(?:WebSearch|Searching the web)\s*(.+)/,
    type: 'tool',
    labelFn: () => 'Recherche web',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /⏺\s*(?:TodoWrite|TaskCreate|TaskUpdate)/,
    type: 'tool',
    labelFn: () => 'Mise à jour tâches',
  },
]

// Task items from Claude Code TodoWrite display
const TASK_COMPLETED = /[✔✓]\s+(.+)/
const TASK_IN_PROGRESS = /[◐◑◒◓⏳]\s+(.+)/
const TASK_PENDING = /[◼○◻]\s+(.+)/

// Generic ⏺ tool call fallback
const GENERIC_TOOL = /⏺\s*(\S+)/

// Subagent patterns — "● Running 2 Explore agents…" header + "├─ Name · stats" details
const RUNNING_AGENTS = /Running\s+(\d+)\s+(\w+)\s+agents?…/
const SUBAGENT_DETAIL = /[├└]─?\s+(.+?)(?:\s+·\s+(.+))?$/

// "Reading N files" pattern
const READING_FILES = /Reading\s+(\d+)\s+files?/

// "Searched for" pattern
const SEARCHED_FOR = /Searched\s+for\s+(.+)/

export class AgentProgressParser {
  private terminals = new Map<string, TerminalState>()

  register(terminalId: string, taskId: string): void {
    this.terminals.set(terminalId, {
      taskId,
      lineBuffer: '',
      activity: { type: 'idle', label: '' },
      subagents: [],
      items: [],
      completedCount: 0,
      totalCount: 0,
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

    let changed = false
    for (const line of lines) {
      const clean = stripAnsi(line).trim()
      if (!clean) continue
      if (this.parseLine(clean, state)) changed = true
    }

    // Also check partial line for spinner updates (they refresh in-place)
    const partialClean = stripAnsi(state.lineBuffer).trim()
    if (partialClean && this.parseLine(partialClean, state)) changed = true

    return changed ? this.buildUpdate(state) : null
  }

  private parseLine(clean: string, state: TerminalState): boolean {
    // 1. Spinner (thinking) — ✶ Hyperspacing… (2m24s · ↓ 4.1k tokens)
    const spinnerMatch = clean.match(SPINNER_PATTERN)
    if (spinnerMatch) {
      state.activity = { type: 'thinking', label: spinnerMatch[1]! }
      return true
    }

    // Standalone thinking word — e.g. "Pollinating…" or "Mulling…"
    if (/^\w+…$/.test(clean)) {
      state.activity = { type: 'thinking', label: clean }
      return true
    }

    // "thinking" or "thought for Ns" in status line
    if (/thinking|thought\s+for/i.test(clean) && /·/.test(clean)) {
      state.activity = { type: 'thinking', label: 'Réflexion...' }
      return true
    }

    // 2. Tool patterns
    for (const tp of TOOL_PATTERNS) {
      const m = clean.match(tp.pattern)
      if (m) {
        state.activity = {
          type: tp.type,
          label: tp.labelFn(m),
          detail: tp.detailFn?.(m),
        }
        return true
      }
    }

    // 3. Reading N files
    const readingMatch = clean.match(READING_FILES)
    if (readingMatch) {
      state.activity = { type: 'tool', label: 'Lecture', detail: `${readingMatch[1]} fichiers` }
      return true
    }

    // 4. Searched for
    const searchMatch = clean.match(SEARCHED_FOR)
    if (searchMatch) {
      state.activity = { type: 'tool', label: 'Recherche', detail: searchMatch[1]?.trim() }
      return true
    }

    // 5. Running N agents — "● Running 2 Explore agents…"
    const runningMatch = clean.match(RUNNING_AGENTS)
    if (runningMatch) {
      state.activity = {
        type: 'subagent',
        label: `${runningMatch[1]} ${runningMatch[2]} agents`,
      }
      state.subagents = []
      return true
    }

    // 5b. Subagent detail lines — "├─ Explore v2 workspace/project UI · 10 tool uses · 44.9k tokens"
    const detailMatch = clean.match(SUBAGENT_DETAIL)
    if (detailMatch) {
      const name = detailMatch[1]!.trim()
      const stats = detailMatch[2]?.trim() ?? ''
      const existing = state.subagents.find((s) => s.name === name)
      if (existing) {
        existing.status = stats
      } else {
        state.subagents.push({ name, status: stats })
      }
      state.activity = {
        type: 'subagent',
        label: `${state.subagents.length} agents`,
        detail: state.subagents.map((s) => s.name).join(', '),
      }
      return true
    }

    // 6. Generic ⏺ tool
    const genericMatch = clean.match(GENERIC_TOOL)
    if (genericMatch && !clean.includes('bypass permissions') && !clean.includes('accept edits')) {
      state.activity = { type: 'tool', label: genericMatch[1]! }
      return true
    }

    // 8. Task items — ✔ completed, ◼ pending
    const completedMatch = clean.match(TASK_COMPLETED)
    if (completedMatch) {
      this.updateTaskItem(state, completedMatch[1]!.trim(), 'completed')
      return true
    }

    const inProgressMatch = clean.match(TASK_IN_PROGRESS)
    if (inProgressMatch) {
      this.updateTaskItem(state, inProgressMatch[1]!.trim(), 'in_progress')
      return true
    }

    const pendingMatch = clean.match(TASK_PENDING)
    if (pendingMatch) {
      this.updateTaskItem(state, pendingMatch[1]!.trim(), 'pending')
      return true
    }

    // 9. Text response (● bullet)
    if (clean.startsWith('●') && clean.length > 2) {
      state.activity = { type: 'text', label: 'Réponse...' }
      return true
    }

    return false
  }

  private updateTaskItem(state: TerminalState, label: string, status: AgentTaskItem['status']): void {
    const existing = state.items.find((i) => i.label === label)
    if (existing) {
      existing.status = status
    } else {
      state.items.push({ label, status })
    }
    state.completedCount = state.items.filter((i) => i.status === 'completed').length
    state.totalCount = state.items.length
  }

  private buildUpdate(state: TerminalState): ProgressUpdate {
    return {
      taskId: state.taskId,
      progress: state.totalCount > 0 ? `${state.completedCount}/${state.totalCount}` : '',
      message: state.activity.label,
      items: [...state.items],
      activity: { ...state.activity },
      subagents: [...state.subagents],
    }
  }
}
