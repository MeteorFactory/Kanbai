# Kanbai - Gemini CLI Instructions

## Project Overview

Kanbai is an AI-enhanced desktop terminal built with Electron. It combines a full terminal emulator (xterm.js + node-pty), workspace/project management, native Claude Code integration, a Kanban board with AI agent assignment, database exploration, health monitoring, DevOps tools, code analysis, and package management. Targets macOS (primary) and Windows.

## Language

- Code (variables, functions, comments): **English**
- Git commits, PR descriptions: **French**

## Tech Stack

- **Electron 40+** — Desktop framework (macOS + Windows)
- **TypeScript 5.9+** — Strict mode everywhere, no `any`
- **React 19** — Renderer UI
- **Vite 7** — Build tooling via vite-plugin-electron (main + preload + renderer)
- **Zustand 5** — State management (lightweight, per-domain stores)
- **xterm.js 6** — Terminal emulator with WebGL rendering
- **node-pty** — Pseudo-terminal backend
- **Monaco Editor** — Code editor/viewer
- **ESLint 9** — Linting (flat config)
- **Vitest 4.x** — Unit and integration tests
- **electron-builder** — Packaging (.dmg/.app for macOS, .nsis/.zip for Windows)
- **better-sqlite3 / pg / mysql2 / mssql / mongodb** — Multi-database support
- **@modelcontextprotocol/sdk** — MCP server integration

## Architecture

Three-process Electron model:

1. **Main Process** (`src/main/`) — Node.js, full OS access
   - `index.ts` — App lifecycle, BrowserWindow creation
   - `ipc/` — IPC handlers (1 file per domain, 29 handlers)
   - `services/` — storage.ts (StorageService singleton), healthCheckScheduler, notificationService, appUpdateState, activityHooks (AI provider hooks), ai-cli, pixel-agents-service, pixel-agents-assets, database/ (connection, queries, backup, crypto, NL queries, drivers/), packages/ (analysis, NL queries)

2. **Preload** (`src/preload/`) — Bridge between processes
   - Exposes `window.kanbai` API via `contextBridge`
   - Domain-grouped methods (terminal, workspace, project, fs, git, claude, kanban, database, etc.)

3. **Renderer** (`src/renderer/`) — Chromium, sandboxed
   - React app with Zustand state management
   - Flat component architecture in `components/` (~60 components)
   - Stores in `lib/stores/` (13 stores)
   - CSS custom properties in `styles/`

4. **Shared** (`src/shared/`) — Types and constants used by all processes
   - `types/index.ts` — ALL interfaces + `IPC_CHANNELS` constant
   - `constants/` — Shared constants

## Security Rules (Mandatory)

- `contextIsolation: true` — always on
- `nodeIntegration: false` — never enable
- `webSecurity: true` — never disable
- `sandbox: true` — keep renderer sandboxed
- Never expose `ipcRenderer` directly to renderer
- Validate all inputs in main process IPC handlers
- No `shell.openExternal` with unvalidated URLs

## IPC Conventions

- Channel format: `namespace:action` (e.g., `terminal:create`, `git:status`)
- Request-response: `ipcRenderer.invoke` / `ipcMain.handle`
- Events: `ipcRenderer.send` / `ipcMain.on` (fire-and-forget only)
- All channel names in `IPC_CHANNELS` constant

### IPC Domains

terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents

## State Management

- Main process = source of truth for persisted data
- Renderer uses Zustand stores as cache + UI state
- Data flow: User action → React → Zustand → IPC invoke → Main service → JSON file
- Each domain has its own store (no monolithic global store)

### Zustand Stores

terminalTabStore, workspaceStore, claudeStore, kanbanStore, viewStore, updateStore, appUpdateStore, notificationStore, devopsStore, packagesStore, databaseStore, databaseTabStore, healthCheckStore

## Key Features

- **Terminal** — Full terminal emulator with tabs, splits, and sessions
- **Workspace/Project** — Multi-workspace management with project tracking
- **Claude Integration** — Native Claude Code sessions, defaults library, memory management
- **Kanban Board** — Task management with AI agent assignment
- **Git** — Full git panel with status, diff, log, config
- **Database Explorer** — Multi-database (SQLite, PostgreSQL, MySQL, MSSQL, MongoDB) with NL queries
- **Health Check** — Endpoint monitoring with scheduling
- **DevOps** — CI/CD connector panel
- **Code Analysis** — Static analysis tools
- **Package Management** — Dependency analysis and management
- **API Tester** — HTTP request testing
- **MCP** — Model Context Protocol server management
- **File Explorer** — File browsing and viewing with Monaco
- **App Updates** — Auto-update with update center
- **Pixel Agents** — AI pixel agent integration
- **Multi-Agent View** — Multi-agent orchestration UI
- **AI Configs** — Per-provider configuration (Codex, Copilot, Gemini, generic AI provider)
- **SSH** — Remote SSH connection management

## Code Conventions

- TypeScript strict mode everywhere
- No `any` without documented justification
- ESLint 9 (flat config) + Prettier for formatting
- Conventional Commits in French: `type(scope): description`
- No Co-Authored-By trailers
- Files: `kebab-case.ts`
- Small functions (< 30 lines), max 3 nesting levels
- CSS custom properties (no Tailwind)

## Key Types

All in `src/shared/types/index.ts`:
- `Workspace`, `Project` — workspace/project management
- `TerminalSession`, `TerminalTab`, `TerminalPane` — terminal system
- `ClaudeSession` — AI integration
- `KanbanTask` — status: `TODO | WORKING | PENDING | DONE | FAILED`
- `AppSettings` — user preferences
- `GitStatus`, `GitLogEntry`, `FileEntry` — git and filesystem
- `DatabaseConnection`, `DatabaseQuery` — database explorer
- `HealthCheckConfig` — health monitoring

## Commands

```bash
npm run dev          # Dev with hot-reload (vite + vite-plugin-electron)
npm run build        # Production build
npm run build:app    # Build + package for macOS
npm run build:local  # Build + package locally (no publish)
npm run test         # Unit tests (Vitest)
npm run test:watch   # Tests in watch mode
npm run test:coverage # Tests with coverage
npm run lint         # ESLint (flat config)
npm run lint:fix     # ESLint auto-fix
npm run typecheck    # TypeScript check
npm run format       # Prettier
npm run build:mcp    # Build MCP server
```

## Testing

- **Vitest 4.x** for unit and integration tests
- Unit tests: `tests/unit/` — services, stores, utilities
- Integration tests: `tests/integration/` — IPC round-trips
- Mock infrastructure: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
- Always run tests before completing work

## Data Persistence

- `~/.kanbai/data.json` — main data store (workspaces, projects, settings)
- `.workspaces/kanban.json` — per-project Kanban tasks
- StorageService singleton loads JSON at startup, writes on every change
