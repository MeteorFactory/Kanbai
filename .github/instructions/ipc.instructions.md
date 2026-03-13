---
applyTo: "src/main/ipc/**,src/preload/**,src/shared/types/**"
---

# IPC Communication Rules

## Channel Definition

- All channel names defined in `IPC_CHANNELS` constant (`src/shared/types/index.ts`)
- Format: `namespace:action` (e.g., `terminal:create`, `git:status`)
- One handler file per domain in `src/main/ipc/`

## Patterns

- Request-response: `ipcRenderer.invoke` / `ipcMain.handle` (use for all operations returning a result)
- Fire-and-forget: `ipcRenderer.send` / `ipcMain.on` (only for one-way notifications)
- Main-to-renderer events: `webContents.send` on a specific window

## Preload Bridge

- Expose via `contextBridge.exposeInMainWorld('kanbai', api)`
- Domain-grouped methods: `window.kanbai.{domain}.{method}()`
- Return unsubscribe functions for `ipcRenderer.on` listeners
- Keep surface area minimal — one method per IPC action

## Error Handling

- Errors thrown in `handle` callbacks propagate to renderer `invoke` as rejections
- Wrap handler logic in try/catch for expected failures
- Log unexpected errors in main process before re-throwing

## IPC Domains (30)

terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents, skillsStore

## Anti-patterns

- No inline magic strings for channel names — use `IPC_CHANNELS`
- No `send/on` for request-response — use `invoke/handle`
- No raw `ipcRenderer` exposure to renderer
- No trusting renderer input without validation
