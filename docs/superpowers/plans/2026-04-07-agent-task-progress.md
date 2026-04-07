# Agent Task Progress Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display real-time agent task progress (progress bar + message) on kanban cards when an AI agent is working on a ticket.

**Architecture:** A NDJSON parser in the main process intercepts PTY output for task-linked terminals, extracts progress from TodoWrite/TaskCreate/TaskUpdate tool calls, and broadcasts updates to the renderer via IPC. The Zustand store holds progress state, and kanban cards render a CSS progress bar.

**Tech Stack:** TypeScript, Electron IPC, Zustand, node-pty, CSS custom properties

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/main/services/agent-progress-parser.ts` | **NEW** — Stateful NDJSON parser per terminal |
| `src/main/ipc/terminal.ts` | Hook parser into pty.onData, setTaskInfo, onExit |
| `src/shared/types/channels.ts` | Add KANBAN_TASK_PROGRESS channel |
| `src/preload/index.ts` | Expose onTaskProgress listener |
| `src/renderer/features/kanban/kanban-store-types.ts` | Add agentProgress to KanbanState |
| `src/renderer/features/kanban/kanban-store.ts` | Init agentProgress + updateAgentProgress action |
| `src/renderer/features/kanban/kanban-board.tsx` | Setup IPC listener + pass agentProgress to columns |
| `src/renderer/features/kanban/kanban-columns.tsx` | Pass agentProgress to cards |
| `src/renderer/features/kanban/kanban-card.tsx` | Render progress bar + message |
| `src/renderer/features/kanban/kanban.css` | Progress bar styles |
| `tests/unit/agent-progress-parser.test.ts` | **NEW** — Unit tests for parser |

---

### Task 1: Agent Progress Parser — Tests

**Files:**
- Create: `tests/unit/agent-progress-parser.test.ts`

- [ ] **Step 1: Write unit tests for the parser**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { AgentProgressParser } from '../../src/main/services/agent-progress-parser'

describe('AgentProgressParser', () => {
  let parser: AgentProgressParser

  beforeEach(() => {
    parser = new AgentProgressParser()
    parser.register('term-1', 'task-abc')
  })

  it('returns null for non-JSON lines', () => {
    const result = parser.feed('term-1', 'some random terminal output\n')
    expect(result).toBeNull()
  })

  it('returns null for unregistered terminals', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'TaskCreate', input: { subject: 'Do stuff' } }] },
    })
    const result = parser.feed('unknown-term', line + '\n')
    expect(result).toBeNull()
  })

  it('extracts progress from TodoWrite', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 't1',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Setup project', status: 'completed' },
              { content: 'Write parser', status: 'in_progress' },
              { content: 'Add UI', status: 'pending' },
            ],
          },
        }],
      },
    })
    const result = parser.feed('term-1', line + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '1/3',
      message: 'Write parser',
    })
  })

  it('extracts progress from TaskCreate', () => {
    const line1 = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'TaskCreate', input: { subject: 'First task' } }] },
    })
    const line2 = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't2', name: 'TaskCreate', input: { subject: 'Second task' } }] },
    })
    parser.feed('term-1', line1 + '\n')
    const result = parser.feed('term-1', line2 + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '0/2',
      message: 'Second task',
    })
  })

  it('extracts progress from TaskUpdate completed', () => {
    // First create two tasks
    const create1 = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'TaskCreate', input: { subject: 'Task A' } }] },
    })
    const create2 = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't2', name: 'TaskCreate', input: { subject: 'Task B' } }] },
    })
    parser.feed('term-1', create1 + '\n')
    parser.feed('term-1', create2 + '\n')

    // Complete one
    const update = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't3', name: 'TaskUpdate', input: { taskId: '1', status: 'completed', subject: 'Task A' } }] },
    })
    const result = parser.feed('term-1', update + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '1/2',
      message: 'Task A',
    })
  })

  it('extracts progress from TaskUpdate in_progress', () => {
    const create = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'TaskCreate', input: { subject: 'Task A' } }] },
    })
    parser.feed('term-1', create + '\n')

    const update = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't4', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress', subject: 'Working on A' } }] },
    })
    const result = parser.feed('term-1', update + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '0/1',
      message: 'Working on A',
    })
  })

  it('handles partial lines across multiple feeds', () => {
    const fullLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 't1',
          name: 'TodoWrite',
          input: { todos: [{ content: 'Done', status: 'completed' }, { content: 'Next', status: 'in_progress' }] },
        }],
      },
    })
    const half1 = fullLine.slice(0, 50)
    const half2 = fullLine.slice(50) + '\n'

    const r1 = parser.feed('term-1', half1)
    expect(r1).toBeNull()
    const r2 = parser.feed('term-1', half2)
    expect(r2).toEqual({
      taskId: 'task-abc',
      progress: '1/2',
      message: 'Next',
    })
  })

  it('deduplicates tool_use IDs', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'same-id', name: 'TaskCreate', input: { subject: 'X' } }] },
    })
    parser.feed('term-1', line + '\n')
    const r2 = parser.feed('term-1', line + '\n')
    // Second feed with same ID should not increment
    expect(r2).toBeNull()
  })

  it('cleanup removes terminal state', () => {
    parser.unregister('term-1')
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'TaskCreate', input: { subject: 'X' } }] },
    })
    const result = parser.feed('term-1', line + '\n')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Kanbai && npx vitest run tests/unit/agent-progress-parser.test.ts --reporter=verbose`
Expected: FAIL — module `../../src/main/services/agent-progress-parser` not found

- [ ] **Step 3: Commit test file**

```bash
cd Kanbai && git add tests/unit/agent-progress-parser.test.ts && git commit -m "test(kanban): add unit tests for agent progress parser"
```

---

### Task 2: Agent Progress Parser — Implementation

**Files:**
- Create: `src/main/services/agent-progress-parser.ts`

- [ ] **Step 1: Implement the parser**

```typescript
interface TodoItem {
  content: string
  status: string
}

interface TerminalState {
  taskId: string
  lineBuffer: string
  seenToolIds: Set<string>
  taskCount: number
  completedTasks: number
}

export interface ProgressUpdate {
  taskId: string
  progress: string
  message: string
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
      return {
        taskId: state.taskId,
        progress: `${completed}/${todos.length}`,
        message: active?.content ?? '',
      }
    }

    if (name === 'TaskCreate') {
      state.taskCount++
      const subject = (input.subject as string) ?? ''
      return {
        taskId: state.taskId,
        progress: `${state.completedTasks}/${state.taskCount}`,
        message: subject,
      }
    }

    if (name === 'TaskUpdate') {
      const status = input.status as string | undefined
      const title = (input.subject as string) ?? (input.title as string) ?? ''
      if (status === 'completed') {
        state.completedTasks++
        return {
          taskId: state.taskId,
          progress: `${state.completedTasks}/${Math.max(state.taskCount, state.completedTasks)}`,
          message: title,
        }
      }
      if (status === 'in_progress') {
        return {
          taskId: state.taskId,
          progress: `${state.completedTasks}/${Math.max(state.taskCount, state.completedTasks)}`,
          message: title,
        }
      }
    }

    return null
  }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd Kanbai && npx vitest run tests/unit/agent-progress-parser.test.ts --reporter=verbose`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
cd Kanbai && git add src/main/services/agent-progress-parser.ts && git commit -m "feat(kanban): implement agent progress NDJSON parser"
```

---

### Task 3: IPC Channel + Preload Bridge

**Files:**
- Modify: `src/shared/types/channels.ts:66` (after KANBAN_EXECUTE_TEMPLATE_ACTION)
- Modify: `src/preload/index.ts:394-404` (add onTaskProgress to kanban namespace)

- [ ] **Step 1: Add IPC channel**

In `src/shared/types/channels.ts`, after line 66 (`KANBAN_EXECUTE_TEMPLATE_ACTION`), add:

```typescript
  KANBAN_TASK_PROGRESS: 'kanban:taskProgress',
```

- [ ] **Step 2: Add preload bridge listener**

In `src/preload/index.ts`, inside the `kanban: {` object, after the `executeTemplateAction` method (before the closing `},` of the kanban namespace around line 404), add:

```typescript
    onTaskProgress: (callback: (data: { taskId: string; progress: string; message: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { taskId: string; progress: string; message: string }) =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.KANBAN_TASK_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.KANBAN_TASK_PROGRESS, listener)
    },
```

- [ ] **Step 3: Commit**

```bash
cd Kanbai && git add src/shared/types/channels.ts src/preload/index.ts && git commit -m "feat(kanban): add IPC channel and preload bridge for task progress"
```

---

### Task 4: Hook Parser into Terminal PTY

**Files:**
- Modify: `src/main/ipc/terminal.ts` (import parser, register on setTaskInfo, feed on onData, unregister on onExit)

- [ ] **Step 1: Import and instantiate the parser**

At the top of `src/main/ipc/terminal.ts`, after the existing imports (around line 16), add:

```typescript
import { AgentProgressParser } from '../services/agent-progress-parser'

const agentProgressParser = new AgentProgressParser()
```

- [ ] **Step 2: Hook parser into pty.onData**

In `src/main/ipc/terminal.ts`, inside the `pty.onData` callback (around line 821-833), after the existing `win.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id, data })` broadcast loop, add the progress parsing:

```typescript
          // Parse agent progress for task-linked terminals
          if (managed.taskId) {
            const progressUpdate = agentProgressParser.feed(id, data)
            if (progressUpdate) {
              for (const win of BrowserWindow.getAllWindows()) {
                try {
                  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.KANBAN_TASK_PROGRESS, progressUpdate)
                  }
                } catch { /* render frame disposed */ }
              }
            }
          }
```

This goes right after the closing `}` of the existing broadcast loop (after line 832), still inside the `pty.onData` callback.

- [ ] **Step 3: Register terminal in parser when task info is set**

In `src/main/ipc/terminal.ts`, in the `setTerminalTaskInfo` function (around line 302-314), after `terminal.taskId = taskId` (line 305), add:

```typescript
      agentProgressParser.register(terminal.id, taskId)
```

Also in the pending branch (around line 313), we don't need to register yet — the terminal will be registered when `pendingTaskInfo` is consumed during terminal creation. Find where `pendingTaskInfo` is consumed (around line 808-813) and add after `managed.ticketNumber = pending.ticketNumber`:

```typescript
          agentProgressParser.register(id, pending.taskId)
```

- [ ] **Step 4: Unregister on terminal exit**

In `src/main/ipc/terminal.ts`, in the `pty.onExit` callback (find the existing `pty.onExit` handler around line 836), add near the top of the callback:

```typescript
          agentProgressParser.unregister(id)
          // Broadcast progress clear
          if (terminal?.taskId) {
            for (const win of BrowserWindow.getAllWindows()) {
              try {
                if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                  win.webContents.send(IPC_CHANNELS.KANBAN_TASK_PROGRESS, {
                    taskId: terminal.taskId,
                    progress: '',
                    message: '',
                  })
                }
              } catch { /* ignore */ }
            }
          }
```

- [ ] **Step 5: Commit**

```bash
cd Kanbai && git add src/main/ipc/terminal.ts && git commit -m "feat(kanban): hook agent progress parser into terminal PTY lifecycle"
```

---

### Task 5: Zustand Store — Add agentProgress State

**Files:**
- Modify: `src/renderer/features/kanban/kanban-store-types.ts:4-13`
- Modify: `src/renderer/features/kanban/kanban-store.ts:16-23`

- [ ] **Step 1: Add agentProgress to KanbanState**

In `src/renderer/features/kanban/kanban-store-types.ts`, add `agentProgress` to `KanbanState` (after `backgroundTasks` on line 12):

```typescript
  agentProgress: Record<string, { progress?: string; message?: string }>
```

- [ ] **Step 2: Initialize in the store**

In `src/renderer/features/kanban/kanban-store.ts`, add after `backgroundTasks: {},` (line 23):

```typescript
  agentProgress: {},
```

- [ ] **Step 3: Commit**

```bash
cd Kanbai && git add src/renderer/features/kanban/kanban-store-types.ts src/renderer/features/kanban/kanban-store.ts && git commit -m "feat(kanban): add agentProgress state to kanban store"
```

---

### Task 6: IPC Listener Setup in KanbanBoard

**Files:**
- Modify: `src/renderer/features/kanban/kanban-board.tsx` (add useEffect for IPC listener, pass agentProgress down)
- Modify: `src/renderer/features/kanban/kanban-columns.tsx` (accept + forward agentProgress prop)
- Modify: `src/renderer/features/kanban/kanban-card.tsx` (accept agentProgress prop)

- [ ] **Step 1: Setup IPC listener in KanbanBoard**

In `src/renderer/features/kanban/kanban-board.tsx`, inside the `KanbanBoard` component, after the existing store destructuring (around line 33-49), add:

```typescript
  const agentProgress = useKanbanStore((s) => s.agentProgress)
```

Then add a `useEffect` to setup the IPC listener (after the existing useEffect hooks):

```typescript
  // Listen for agent progress updates from main process
  useEffect(() => {
    return window.kanbai.kanban.onTaskProgress((data) => {
      useKanbanStore.setState((s) => {
        if (!data.progress && !data.message) {
          // Clear progress for this task
          const { [data.taskId]: _, ...rest } = s.agentProgress
          return { agentProgress: rest }
        }
        return {
          agentProgress: {
            ...s.agentProgress,
            [data.taskId]: { progress: data.progress, message: data.message },
          },
        }
      })
    })
  }, [])
```

- [ ] **Step 2: Pass agentProgress to KanbanColumns**

In the JSX where `<KanbanColumns` is rendered in `kanban-board.tsx`, add the prop:

```typescript
              agentProgress={agentProgress}
```

- [ ] **Step 3: Accept and forward in KanbanColumns**

In `src/renderer/features/kanban/kanban-columns.tsx`, add `agentProgress` to the props type (after `workspaceDefaultAiProvider: AiProviderId`):

```typescript
  agentProgress: Record<string, { progress?: string; message?: string }>
```

Add to the destructured props:

```typescript
  agentProgress,
```

Then on each `<KanbanCard` instance (there are 2 — one in the ACTIVE_COLUMNS loop around line 81 and one in the DONE column around line 127), add the prop:

```typescript
                agentProgress={agentProgress[task.id]}
```

- [ ] **Step 4: Accept prop in KanbanCard**

In `src/renderer/features/kanban/kanban-card.tsx`, add to the props type (after `defaultAiProvider: AiProviderId`):

```typescript
  agentProgress?: { progress?: string; message?: string }
```

And add to the destructured props:

```typescript
  agentProgress,
```

- [ ] **Step 5: Commit**

```bash
cd Kanbai && git add src/renderer/features/kanban/kanban-board.tsx src/renderer/features/kanban/kanban-columns.tsx src/renderer/features/kanban/kanban-card.tsx && git commit -m "feat(kanban): wire agent progress from IPC listener through to kanban cards"
```

---

### Task 7: Kanban Card UI — Progress Bar

**Files:**
- Modify: `src/renderer/features/kanban/kanban-card.tsx` (render progress bar + message)
- Modify: `src/renderer/features/kanban/kanban.css` (progress bar styles)

- [ ] **Step 1: Add progress bar rendering to KanbanCard**

In `src/renderer/features/kanban/kanban-card.tsx`, add a helper function before the component (at the top of the file, after imports):

```typescript
function parseProgress(p?: string): number | null {
  if (!p) return null
  const match = p.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) return null
  const [, current, total] = match
  if (Number(total) === 0) return 0
  return Math.min(100, Math.max(0, (Number(current) / Number(total)) * 100))
}
```

Then inside the JSX, after the `splitSuggestions` badge (after line 109, before `<div className="kanban-card-footer">`), add:

```tsx
        {isWorking && agentProgress && (agentProgress.progress || agentProgress.message) && (
          <div className="kanban-card-progress">
            {agentProgress.progress && (
              <div className="kanban-card-progress-bar-container">
                <div
                  className="kanban-card-progress-bar"
                  style={{
                    width: `${parseProgress(agentProgress.progress) ?? 0}%`,
                    backgroundColor: workingColor,
                  }}
                />
                <span className="kanban-card-progress-text" style={{ color: workingColor }}>
                  {agentProgress.progress}
                </span>
              </div>
            )}
            {agentProgress.message && (
              <p className="kanban-card-progress-message">{agentProgress.message}</p>
            )}
          </div>
        )}
```

- [ ] **Step 2: Add CSS styles**

In `src/renderer/features/kanban/kanban.css`, find the `.kanban-card-split-badge` rule (around line 1191) and add these styles after it:

```css
/* Agent progress bar */
.kanban-card-progress {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
}

.kanban-card-progress-bar-container {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kanban-card-progress-bar-container::before {
  content: '';
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-hover);
  position: relative;
}

/* Use a wrapper approach for the bar fill */
.kanban-card-progress-bar-container {
  position: relative;
}

.kanban-card-progress-bar {
  height: 4px;
  border-radius: 2px;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

.kanban-card-progress-bar-container {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 14px;
}

.kanban-card-progress-bar {
  position: absolute;
  left: 0;
  top: 5px;
  height: 4px;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.kanban-card-progress-bar-container::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  right: 32px;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-hover);
}

.kanban-card-progress-text {
  font-size: 9px;
  font-weight: 600;
  margin-left: auto;
  white-space: nowrap;
}

.kanban-card-progress-message {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  line-height: 1.3;
}
```

- [ ] **Step 3: Commit**

```bash
cd Kanbai && git add src/renderer/features/kanban/kanban-card.tsx src/renderer/features/kanban/kanban.css && git commit -m "feat(kanban): render agent progress bar and message on kanban cards"
```

---

### Task 8: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `cd Kanbai && npx vitest run --reporter=verbose`
Expected: All tests pass including the new agent-progress-parser tests

- [ ] **Step 2: Run typecheck**

Run: `cd Kanbai && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `cd Kanbai && npm run lint`
Expected: No lint errors

- [ ] **Step 4: Verify build**

Run: `cd Kanbai && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Final commit if any fixes needed**

If any fixes were needed, commit them:
```bash
cd Kanbai && git add -A && git commit -m "fix(kanban): address lint/type issues in agent progress feature"
```
