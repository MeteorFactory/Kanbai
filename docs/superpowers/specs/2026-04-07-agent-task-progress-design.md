# Agent Task Progress Tracking — Design Spec

**Ticket:** F-07 — Migration fonctionnalites v2 vers v1
**Date:** 2026-04-07
**Status:** Approved

## Goal

Display real-time agent task progress on kanban cards in Kanbai v1. When an AI agent (Claude Code) works on a ticket, the kanban card shows a progress bar and current task message, mirroring the feature available in kanbai-v2.

## Architecture

```
PTY output (NDJSON) → Parser (main process) → IPC broadcast → Zustand store (renderer) → Card UI
```

### Pipeline overview

1. Claude Code emits NDJSON lines to the terminal PTY
2. A new parser in the main process intercepts PTY output for terminals linked to kanban tasks
3. The parser detects `TodoWrite`, `TaskCreate`, `TaskUpdate` tool invocations
4. Progress data (`{current, total, message}`) is broadcast to the renderer via a new IPC channel
5. The renderer Zustand store holds `agentProgress` state per task
6. The kanban card component renders a progress bar + message when available

## Components

### 1. Agent Progress Parser (`src/main/services/agent-progress-parser.ts`) — NEW

Stateful parser that processes raw PTY output per terminal session.

**State per terminal:**
```typescript
interface ParserState {
  lineBuffer: string          // incomplete NDJSON line accumulator
  taskId: string              // linked kanban task ID
  completedTasks: number
  totalTasks: number
  currentMessage: string
}
```

**Exports:**
```typescript
function registerTerminal(terminalId: string, taskId: string): void
function feedOutput(terminalId: string, data: string): ProgressUpdate | null
function unregisterTerminal(terminalId: string): void
```

**Parsing logic:**
- Split incoming data by newlines, accumulate partial lines in `lineBuffer`
- For each complete line, attempt `JSON.parse`
- Detect tool invocations by checking for known patterns:
  - `TodoWrite`: Extract todos array, count completed vs total, find in_progress item for message
  - `TaskCreate`: Increment `totalTasks`
  - `TaskUpdate` with `status: "completed"`: Increment `completedTasks`
  - `TaskUpdate` with `status: "in_progress"`: Update `currentMessage`
- Return `{ taskId, progress: "${completed}/${total}", message }` or null if no change

**NDJSON detection:**
Claude Code outputs structured JSON when run with `--output-format stream-json`. Each line is a JSON object. The parser looks for lines containing tool use data. Lines that fail `JSON.parse` are silently ignored (terminal escape codes, shell prompts, etc.).

### 2. IPC Channel (`src/shared/types/channels.ts`)

Add:
```typescript
KANBAN_TASK_PROGRESS: 'kanban:taskProgress'
```

Payload: `{ taskId: string; progress: string; message: string }`

### 3. Terminal Hook (`src/main/ipc/terminal.ts`)

In the `pty.onData` callback (line ~821), after existing logic:
```typescript
// If this terminal is linked to a kanban task, parse for progress
if (managed.taskId) {
  const update = agentProgressParser.feedOutput(id, data)
  if (update) {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.KANBAN_TASK_PROGRESS, update)
        }
      } catch { /* ignore */ }
    }
  }
}
```

Register terminal when `setTaskInfo` is called. Unregister on `pty.onExit`.

### 4. Preload Bridge (`src/preload/index.ts`)

Add to the `kanban` namespace:
```typescript
onTaskProgress: (callback: (data: { taskId: string; progress: string; message: string }) => void) => {
  const handler = (_event: IpcRendererEvent, data: any) => callback(data)
  ipcRenderer.on(IPC_CHANNELS.KANBAN_TASK_PROGRESS, handler)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.KANBAN_TASK_PROGRESS, handler)
}
```

### 5. Zustand Store

**kanban-store-types.ts** — Add to `KanbanState`:
```typescript
agentProgress: Record<string, { progress?: string; message?: string }>
```

**kanban-store.ts** — Initialize:
```typescript
agentProgress: {},
```

**New listener setup** (in a hook or component that mounts early):
```typescript
useEffect(() => {
  return window.kanbai.kanban.onTaskProgress((data) => {
    useKanbanStore.setState((s) => ({
      agentProgress: {
        ...s.agentProgress,
        [data.taskId]: { progress: data.progress, message: data.message },
      },
    }))
  })
}, [])
```

### 6. Kanban Card UI (`src/renderer/features/kanban/kanban-card.tsx`)

When `task.status === 'WORKING'` and `agentProgress[task.id]` exists:

```
┌─────────────────────────────────┐
│ F-42  feature  ●                │
│ My ticket title                 │
│ Description...                  │
│ ████████░░░░░░░  3/7            │  ← progress bar
│ Implementing the store...       │  ← current message
│ 7 avr. 14:32        ▶ Terminal  │
└─────────────────────────────────┘
```

Progress bar: pure CSS (div width percentage), themed with the AI provider color.

### 7. CSS Styles (`src/renderer/features/kanban/kanban.css`)

```css
.kanban-card-progress { ... }
.kanban-card-progress-bar { ... }
.kanban-card-progress-text { ... }
.kanban-card-progress-message { ... }
```

## Cleanup

- On `pty.onExit`: unregister terminal from parser, broadcast a final event to clear progress
- On task status change to DONE/FAILED: renderer clears `agentProgress[taskId]`
- On workspace switch: clear all `agentProgress`

## Scope

- **In scope:** Claude Code NDJSON parsing, progress display on cards
- **Out of scope:** Other AI providers (Codex, Copilot, Gemini) — they don't emit structured NDJSON. Can be added later with provider-specific parsers.
- **Out of scope:** Detailed task list display (showing individual todos) — only aggregate progress bar + current message.

## Files Changed

| File | Change |
|------|--------|
| `src/main/services/agent-progress-parser.ts` | **New** |
| `src/main/ipc/terminal.ts` | Hook parser into pty.onData + setTaskInfo + onExit |
| `src/shared/types/channels.ts` | Add `KANBAN_TASK_PROGRESS` |
| `src/preload/index.ts` | Add `onTaskProgress` listener |
| `src/renderer/features/kanban/kanban-store-types.ts` | Add `agentProgress` to state |
| `src/renderer/features/kanban/kanban-store.ts` | Init `agentProgress` |
| `src/renderer/features/kanban/kanban-card.tsx` | Progress bar + message |
| `src/renderer/features/kanban/kanban.css` | Progress bar styles |
| `src/renderer/features/kanban/kanban-board.tsx` | Pass agentProgress to cards + setup listener |

## Testing Strategy

- Unit tests for `agent-progress-parser.ts` with mock NDJSON payloads
- Verify TodoWrite, TaskCreate, TaskUpdate parsing
- Verify partial line buffering
- Verify cleanup on unregister
