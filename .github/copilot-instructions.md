# Kanbai - GitHub Copilot Instructions

## Project Overview

Kanbai is an AI-enhanced desktop terminal built with Electron. It combines a full terminal emulator (xterm.js + node-pty), workspace/project management, native Claude Code integration, a Kanban board with AI agent assignment, database exploration, health monitoring, DevOps tools, code analysis, and package management. Targets macOS (primary) and Windows.

## Language

- Code (variables, functions, comments): **English**
- Git commits, PR descriptions: **French**

## Tech Stack

- Electron 40+ (macOS + Windows)
- TypeScript 5.9+ (strict mode, no `any`)
- React 19 (renderer UI)
- Vite 7 + vite-plugin-electron (build tooling)
- Zustand 5 (state management, per-domain stores)
- xterm.js 6 + node-pty (terminal emulator)
- Monaco Editor (code viewer/editor)
- ESLint 9 (flat config) + Prettier
- CSS custom properties (no Tailwind)
- Vitest 4.x (testing)
- electron-builder (packaging)
- better-sqlite3 / pg / mysql2 / mssql / mongodb (multi-database)
- @modelcontextprotocol/sdk (MCP integration)

## Architecture

Three-process Electron model:

- **Main** (`src/main/`) — Node.js, IPC handlers in `ipc/` (29 handlers), services in `services/` (storage, healthCheck, notifications, activityHooks, ai-cli, pixel-agents-service, pixel-agents-assets, database/ [connection, queries, backup, crypto, NL, drivers/], packages/ [analysis, NL])
- **Preload** (`src/preload/`) — contextBridge, exposes `window.kanbai` API
- **Renderer** (`src/renderer/`) — React, flat components in `components/` (~60), Zustand stores in `lib/stores/` (13 stores)
- **Shared** (`src/shared/`) — All types in `types/index.ts`, constants in `constants/`

## Security (Mandatory)

- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, `sandbox: true`
- Never expose `ipcRenderer` directly — use contextBridge wrapper functions
- Validate all inputs in main process handlers
- No `shell.openExternal` without URL validation

## IPC Patterns

- Channel format: `namespace:action` (e.g., `terminal:create`, `git:status`)
- All channels in `IPC_CHANNELS` constant (`src/shared/types/index.ts`)
- Request-response: `ipcRenderer.invoke` / `ipcMain.handle`
- Events only: `ipcRenderer.send` / `ipcMain.on`
- Preload API: `window.kanbai.{domain}.{method}()`
- Domains: terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents

## State Management

- Main process = source of truth (StorageService → `~/.kanbai/data.json`)
- Renderer = Zustand stores as cache (terminalTab, workspace, claude, kanban, view, update, appUpdate, notification, devops, packages, database, databaseTab, healthCheck)
- Flow: React → Zustand → IPC invoke → Main service → JSON → IPC event → Zustand → React

## Key Features

- Terminal emulator with tabs and splits
- Workspace/project management
- Claude Code integration with defaults library and memory
- Kanban board with AI agent assignment
- Git panel (status, diff, log, config)
- Database explorer (SQLite, PostgreSQL, MySQL, MSSQL, MongoDB)
- Health check monitoring
- DevOps CI/CD panel
- Code analysis
- Package management
- API tester
- MCP server management
- File explorer with Monaco viewer
- App updates with update center
- Pixel agents integration
- Multi-agent orchestration view

## Code Conventions

- TypeScript strict mode, explicit return types on exports
- `interface` for object shapes, `type` for unions
- No `enum` — use `as const` + `typeof`
- Files: `kebab-case.ts`
- Small functions (< 30 lines), max 3 nesting levels
- Conventional Commits in French
- No Co-Authored-By trailers

## Key Types (src/shared/types/index.ts)

- `Workspace`, `Project` — workspace/project management
- `TerminalSession`, `TerminalTab`, `TerminalPane` — terminal system
- `ClaudeSession` — AI session management
- `KanbanTask` — Kanban with status: `TODO | WORKING | PENDING | DONE | FAILED`
- `AppSettings`, `GitStatus`, `FileEntry`
- `DatabaseConnection`, `DatabaseQuery` — database explorer
- `HealthCheckConfig` — health monitoring

## Testing

- Vitest 4.x: `tests/unit/` (services, stores) + `tests/integration/` (IPC round-trips)
- Mock infra: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
