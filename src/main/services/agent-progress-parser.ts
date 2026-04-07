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

// Priority: higher = more interesting to the user
const ACTIVITY_PRIORITY: Record<AgentActivityType, number> = {
  idle: 0,
  thinking: 1,
  text: 2,
  tool: 3,
  subagent: 4,
}

// How long a high-priority activity stays visible before a lower one can replace it (ms)
const ACTIVITY_HOLD_MS = 3000

// Minimum length for a thinking label to be displayed (excluding trailing …)
// Below this, we show "Réflexion..." instead of garbled single-char labels like "t…"
const MIN_THINKING_LABEL_LENGTH = 3

const THINKING_FALLBACK = 'Réflexion...'

interface TerminalState {
  taskId: string
  lineBuffer: string
  activity: AgentActivity
  activitySetAt: number
  subagents: SubagentInfo[]
  items: AgentTaskItem[]
  completedCount: number
  totalCount: number
  phase: string
}

export interface ProgressUpdate {
  taskId: string
  progress: string
  message: string
  items: AgentTaskItem[]
  activity: AgentActivity
  subagents: SubagentInfo[]
  phase: string
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

// Tool use patterns — bullet prefix in Claude Code CLI output
const TOOL_PATTERNS: Array<{
  pattern: RegExp
  type: AgentActivityType
  labelFn: (m: RegExpMatchArray) => string
  detailFn?: (m: RegExpMatchArray) => string | undefined
}> = [
  {
    pattern: /[⏺●]\s*(?:Read|Reading)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Lecture',
    detailFn: (m) => m[1]?.trim().replace(/\.{3}$/, ''),
  },
  {
    pattern: /[⏺●]\s*(?:Edit|Editing)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Modification',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /[⏺●]\s*(?:Write|Writing)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Écriture',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /[⏺●]\s*Bash\((.+?)\)/,
    type: 'tool',
    labelFn: () => 'Commande',
    detailFn: (m) => {
      const cmd = m[1]?.trim()
      return cmd && cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd
    },
  },
  {
    pattern: /[⏺●]\s*(?:Grep|Searching)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Recherche',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /[⏺●]\s*(?:Glob|Finding)\s+(.+)/,
    type: 'tool',
    labelFn: () => 'Recherche fichiers',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /[⏺●]\s*(?:Agent|Explore|Plan)\s*\((.+?)\)/,
    type: 'subagent',
    labelFn: (m) => m[1]?.trim() ?? 'Subagent',
  },
  {
    pattern: /[⏺●]\s*(?:WebSearch|Searching the web)\s*(.+)/,
    type: 'tool',
    labelFn: () => 'Recherche web',
    detailFn: (m) => m[1]?.trim(),
  },
  {
    pattern: /[⏺●]\s*(?:TodoWrite|TaskCreate|TaskUpdate)/,
    type: 'tool',
    labelFn: () => 'Mise à jour tâches',
  },
]

// Task items from Claude Code TodoWrite display
const TASK_COMPLETED = /[✔✓]\s+(.+)/
const TASK_IN_PROGRESS = /[◐◑◒◓⏳]\s+(.+)/
const TASK_PENDING = /[◼○◻]\s+(.+)/

// Subagent patterns — "● Running 2 Explore agents…" header + "├─ Name · stats" details
const RUNNING_AGENTS = /Running\s+(\d+)\s+(\w+)\s+agents?…/
const SUBAGENT_DETAIL = /[├└]─?\s+(.+?)(?:\s+·\s+(.+))?$/

// "Reading N files" pattern
const READING_FILES = /Reading\s+(\d+)\s+files?/

// "Searched for" pattern
const SEARCHED_FOR = /Searched\s+for\s+(.+)/

// Phase / step header patterns — "Phase 1 : Title", "Step 2: Title", "## Phase 1 — Title", "Étape 3 : Titre"
const PHASE_PATTERNS = [
  /^(?:Phase|Étape|Step)\s+(\d+)\s*[:—–-]\s*(.+)/i,
  /^#{1,3}\s*(?:Phase|Étape|Step)\s+(\d+)\s*[:—–-]\s*(.+)/i,
  /^\*{2}(?:Phase|Étape|Step)\s+(\d+)\s*[:—–-]\s*(.+?)\*{2}/i,
]

export class AgentProgressParser {
  private terminals = new Map<string, TerminalState>()

  register(terminalId: string, taskId: string): void {
    this.terminals.set(terminalId, {
      taskId,
      lineBuffer: '',
      activity: { type: 'idle', label: '' },
      activitySetAt: 0,
      subagents: [],
      items: [],
      completedCount: 0,
      totalCount: 0,
      phase: '',
    })
  }

  unregister(terminalId: string): void {
    this.terminals.delete(terminalId)
  }

  feed(terminalId: string, raw: string): ProgressUpdate | null {
    const state = this.terminals.get(terminalId)
    if (!state) return null

    state.lineBuffer += raw

    // Split on \n and \r — PTY uses \r for in-place status line updates
    const lines = state.lineBuffer.split(/[\n\r]+/)
    state.lineBuffer = lines.pop() ?? ''

    // Cap buffer size to prevent unbounded growth
    if (state.lineBuffer.length > 2000) {
      state.lineBuffer = state.lineBuffer.slice(-1000)
    }

    let changed = false
    for (const line of lines) {
      const clean = stripAnsi(line).trim()
      if (!clean) continue
      if (this.parseLine(clean, state)) changed = true
    }

    // Also check partial line for spinner/status updates (written in-place without newline)
    const partialClean = stripAnsi(state.lineBuffer).trim()
    if (partialClean && this.parseLine(partialClean, state)) changed = true

    return changed ? this.buildUpdate(state) : null
  }

  private parseLine(clean: string, state: TerminalState): boolean {
    // 0. Phase / step headers — "Phase 1 : Root Cause Investigation"
    for (const pattern of PHASE_PATTERNS) {
      const phaseMatch = clean.match(pattern)
      if (phaseMatch) {
        const num = phaseMatch[1]!
        const title = phaseMatch[2]!.trim()
        state.phase = `Phase ${num} : ${title}`
        return true
      }
    }

    // 1. Spinner (thinking) — ✶ Hyperspacing… (2m24s · ↓ 4.1k tokens)
    const spinnerMatch = clean.match(SPINNER_PATTERN)
    if (spinnerMatch) {
      const rawLabel = spinnerMatch[1]!
      const labelText = rawLabel.replace(/…$/, '')
      const label = labelText.length >= MIN_THINKING_LABEL_LENGTH ? rawLabel : THINKING_FALLBACK
      this.setActivity(state, { type: 'thinking', label })
      return true
    }

    // Standalone thinking word — e.g. "Pollinating…" or "Mulling…"
    if (/^\w+…$/.test(clean)) {
      const labelText = clean.replace(/…$/, '')
      const label = labelText.length >= MIN_THINKING_LABEL_LENGTH ? clean : THINKING_FALLBACK
      this.setActivity(state, { type: 'thinking', label })
      return true
    }
    if (/^\w{1,3}…$/.test(clean)) {
      this.setActivity(state, { type: 'thinking', label: 'Réflexion...' })
      return true
    }

    // "thinking" or "thought for Ns" in status line
    if (/thinking|thought\s+for/i.test(clean) && /·/.test(clean)) {
      this.setActivity(state, { type: 'thinking', label: 'Réflexion...' })
      return true
    }

    // 2. Tool patterns
    for (const tp of TOOL_PATTERNS) {
      const m = clean.match(tp.pattern)
      if (m) {
        this.setActivity(state, { type: tp.type, label: tp.labelFn(m), detail: tp.detailFn?.(m) })
        return true
      }
    }

    // 3. Reading N files
    const readingMatch = clean.match(READING_FILES)
    if (readingMatch) {
      this.setActivity(state, { type: 'tool', label: 'Lecture', detail: `${readingMatch[1]} fichiers` })
      return true
    }

    // 4. Searched for
    const searchMatch = clean.match(SEARCHED_FOR)
    if (searchMatch) {
      this.setActivity(state, { type: 'tool', label: 'Recherche', detail: searchMatch[1]?.trim() })
      return true
    }

    // 5. Running N agents — "● Running 2 Explore agents…"
    const runningMatch = clean.match(RUNNING_AGENTS)
    if (runningMatch) {
      state.subagents = []
      this.setActivity(state, { type: 'subagent', label: `${runningMatch[1]} ${runningMatch[2]} agents` })
      return true
    }

    // 5b. Subagent detail lines — "├─ Name · stats"
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
      this.setActivity(state, {
        type: 'subagent',
        label: `${state.subagents.length} agents`,
        detail: state.subagents.map((s) => s.name).join(', '),
      })
      return true
    }

    // 5c. Subagent completion — "⎿ Done" clears subagent lock
    if (state.subagents.length > 0 && /^[⎿└]\s*Done/.test(clean)) {
      state.subagents = []
      state.activity = { type: 'idle', label: '' }
      state.activitySetAt = 0
      return true
    }

    // 6. Generic bullet + tool call (e.g. "⏺ Update(...)")
    const genericMatch = clean.match(/[⏺●]\s*([A-Z]\w{2,})\s*\(/)
    if (genericMatch && !clean.includes('bypass permissions') && !clean.includes('accept edits')) {
      this.setActivity(state, { type: 'tool', label: genericMatch[1]! })
      return true
    }

    // 7. Task items — ✔ completed, ◼ pending
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

    // 8. Text response (● bullet with sentence text)
    if (clean.startsWith('●') && clean.length > 2) {
      this.setActivity(state, { type: 'text', label: 'Réponse...' })
      return true
    }

    return false
  }

  private setActivity(state: TerminalState, activity: AgentActivity): boolean {
    const now = Date.now()
    const newPriority = ACTIVITY_PRIORITY[activity.type] ?? 0
    const currentPriority = ACTIVITY_PRIORITY[state.activity.type] ?? 0
    const elapsed = now - state.activitySetAt

    // Guard against garbled single-char labels from partial PTY output
    if (activity.label.replace(/[.…]+$/, '').length < 2 && activity.type !== 'idle') {
      activity = { ...activity, label: THINKING_FALLBACK }
    }

    // While subagents are running, only subagent-level updates can change activity
    if (state.subagents.length > 0 && newPriority < ACTIVITY_PRIORITY.subagent) {
      return false
    }

    // Accept higher or equal priority, or if hold time has elapsed
    if (newPriority >= currentPriority || elapsed >= ACTIVITY_HOLD_MS) {
      // Clear subagents when a non-subagent activity replaces them
      if (activity.type !== 'subagent' && state.subagents.length > 0) {
        state.subagents = []
      }
      state.activity = activity
      state.activitySetAt = now
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
      phase: state.phase,
    }
  }
}
