---
applyTo: "src/main/**,src/preload/**"
---

# Electron Main Process & Preload Rules

## Main Process

- Use `app.whenReady()` (Promise-based), not `app.on('ready')`
- Handle `window-all-closed` (quit on non-macOS) and `activate` (recreate window on macOS)
- Show window only after `ready-to-show` to avoid white flash
- Store BrowserWindow references to prevent garbage collection
- One IPC handler file per domain in `src/main/ipc/` (29 handlers)
- Services in `src/main/services/`: storage, healthCheck, notifications, appUpdateState, activityHooks (AI provider hooks), ai-cli, pixel-agents-service, pixel-agents-assets, database/ (connection, queries, backup, crypto, NL, drivers/), packages/ (analysis, NL)

## Preload

- Expose only named methods via `contextBridge.exposeInMainWorld('kanbai', api)`
- Never expose raw `ipcRenderer` — wrap each call in a function
- Return unsubscribe functions for `ipcRenderer.on` listeners
- Keep surface area minimal — one method per IPC action

## IPC

- Channel naming: `namespace:action` (defined in `IPC_CHANNELS` in `src/shared/types/index.ts`)
- `invoke/handle` for request-response, `send/on` for fire-and-forget only
- Validate all inputs in main process handlers (type check, sanitize paths)
- Errors in `handle` propagate to renderer `invoke` as rejections

## Security

- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, `sandbox: true`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- Block navigation away from app origin via `will-navigate`
- Validate URLs before `shell.openExternal` (allow only `https:` and `mailto:`)
