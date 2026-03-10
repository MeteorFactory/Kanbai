---
author: "SpaceMalamute"
authorUrl: "https://github.com/SpaceMalamute"
---

---
description: "Electron 40+ project conventions and architecture"
alwaysApply: true
---

# Electron Project Guidelines

## Stack

- Electron 40+ with TypeScript strict mode
- electron-vite for build tooling (main + preload + renderer)
- electron-builder for macOS packaging (.dmg, .app)
- Vitest for unit tests, Playwright for E2E tests

## Architecture

```
src/
  main/           # Main process (Node.js)
  preload/        # Preload scripts (bridge)
  renderer/       # Renderer process (Chromium)
  shared/         # Shared types and constants
```

## Process Model

| Process   | Environment | Access          | Role                              |
|-----------|-------------|-----------------|-----------------------------------|
| Main      | Node.js     | Full OS access  | Window management, IPC, app lifecycle |
| Renderer  | Chromium    | Sandboxed       | UI rendering, user interaction    |
| Preload   | Isolated    | Limited Node.js | Bridge between main and renderer  |
| Utility   | Node.js     | Configurable    | CPU-intensive or I/O-bound tasks  |

## IPC Principles

- Prefer `ipcRenderer.invoke` / `ipcMain.handle` for request-response
- Use `ipcRenderer.send` / `ipcMain.on` only for fire-and-forget events
- Define all channel names in a shared constants file
- Channel naming convention: `namespace:action` (e.g., `file:read`, `window:minimize`)
- Never expose `ipcRenderer` directly to the renderer — use `contextBridge`
- Validate all inputs received in main process handlers

## Security Defaults

Every `BrowserWindow` must enforce:
- `contextIsolation: true` — always on
- `nodeIntegration: false` — never enable
- `sandbox: true` — keep the renderer sandboxed
- `webSecurity: true` — never disable

## Code Style

- Files: `kebab-case.ts` — IPC handlers: `[namespace].ts`
- One handler file per IPC namespace
- Shared types in `src/shared/types/`
- Constants (channels, defaults) in `src/shared/constants/`

## Commands

```bash
npm run dev         # Dev with hot-reload (electron-vite)
npm run build       # Production build
npm run package     # Package app (electron-builder)
npm run test        # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
npm run lint        # ESLint
npm run typecheck   # TypeScript check
```
