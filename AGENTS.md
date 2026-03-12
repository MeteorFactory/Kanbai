# Kanbai - Codex Instructions

## Project Overview

Kanbai is an AI-enhanced desktop terminal built with Electron. It combines a full terminal emulator (xterm.js + node-pty), workspace/project management, native Claude Code integration, a Kanban board with AI agent assignment, database exploration, health monitoring, DevOps tools, code analysis, and package management. Targets macOS (primary) and Windows.

## Language

- Code (variables, functions, comments): **English**
- Git commits, PR descriptions: **French**

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 40+ | Desktop framework (macOS + Windows) |
| TypeScript | 5.9+ | Strict mode everywhere |
| React | 19 | Renderer UI |
| Vite | 7 | Build tooling via vite-plugin-electron (main + preload + renderer) |
| Zustand | 5 | State management (per-domain stores) |
| xterm.js | 6 | Terminal emulator with WebGL rendering |
| node-pty | 1.x | Pseudo-terminal backend |
| Monaco Editor | 0.55+ | Code editor/viewer |
| ESLint | 9 | Linting (flat config) |
| Vitest | 4.x | Unit and integration tests |
| electron-builder | 26+ | Packaging (.dmg/.app for macOS, .nsis/.zip for Windows) |
| better-sqlite3 | 12+ | SQLite database driver |
| pg / mysql2 / mssql / mongodb | latest | Multi-database support |
| @modelcontextprotocol/sdk | 1.x | MCP server integration |

## Architecture

```
src/
  main/              # Main process (Node.js) — app lifecycle, IPC handlers, services
    index.ts         # App entry point, BrowserWindow creation
    ipc/             # IPC handlers (1 file per domain, 29 handlers)
    services/        # Business logic services
      storage.ts     # StorageService singleton (~/.kanbai/data.json)
      healthCheckScheduler.ts
      notificationService.ts
      activityHooks.ts   # AI provider activity hooks (Kanbai integration)
      ai-cli.ts          # AI CLI detection and management
      pixel-agents-service.ts   # Pixel agents integration
      pixel-agents-assets.ts    # Pixel agents static assets
      database/      # DB connection, queries, backup, crypto, NL queries, drivers/
      packages/      # Package analysis, NL package queries
    assets/          # Static assets (rule-templates)
  preload/           # Preload scripts — contextBridge, exposes window.kanbai
  renderer/          # Renderer process (React + Zustand)
    components/      # All UI components (flat architecture, ~60 components)
    lib/stores/      # Zustand stores (per domain, 13 stores)
    styles/          # CSS custom properties
  shared/            # Shared types and constants (both processes)
    types/index.ts   # ALL interfaces + IPC_CHANNELS
    constants/       # Shared constants
tests/
  unit/              # Unit tests (services, stores, utils)
  integration/       # IPC round-trip tests
```

## Process Model

| Process | Environment | Access | Role |
|---------|-------------|--------|------|
| Main | Node.js | Full OS | Window management, IPC handlers, services, database |
| Renderer | Chromium | Sandboxed | UI rendering (React) |
| Preload | Isolated | Limited Node.js | Bridge via contextBridge (`window.kanbai`) |

## Security (Mandatory)

- `contextIsolation: true` — always
- `nodeIntegration: false` — never enable
- `webSecurity: true` — never disable
- `sandbox: true` — keep renderer sandboxed
- Never expose `ipcRenderer` directly — wrap in contextBridge functions
- Validate all inputs in main process IPC handlers
- No `shell.openExternal` with unvalidated URLs

## IPC Conventions

- Channel naming: `namespace:action` (e.g., `terminal:create`, `git:status`)
- All channels defined in `IPC_CHANNELS` constant (`src/shared/types/index.ts`)
- Request-response: `ipcRenderer.invoke` / `ipcMain.handle`
- Fire-and-forget: `ipcRenderer.send` / `ipcMain.on`
- Preload exposes API as `window.kanbai` with domain-grouped methods

### IPC Domains

terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents

## State Management

- Main process = source of truth (StorageService, `~/.kanbai/data.json`)
- Renderer = Zustand stores as cache + UI state
- Flow: User action → React → Zustand action → IPC invoke → Main service → JSON

### Zustand Stores

terminalTabStore, workspaceStore, claudeStore, kanbanStore, viewStore, updateStore, appUpdateStore, notificationStore, devopsStore, packagesStore, databaseStore, databaseTabStore, healthCheckStore

## Key Features

| Feature | IPC Handler | Store | Components |
|---------|-------------|-------|------------|
| Terminal | terminal.ts | terminalTabStore | Terminal, TerminalArea, TabBar |
| Workspace/Project | workspace.ts, project.ts | workspaceStore | Sidebar, WorkspaceItem, ProjectItem |
| Claude Integration | claude.ts, claudeDefaults.ts, claudeMemory.ts | claudeStore | ClaudeSessionPanel, ClaudeInfoPanel, AutoClauder |
| Kanban Board | kanban.ts | kanbanStore | KanbanBoard |
| Git | git.ts, gitConfig.ts | — | GitPanel, FileDiffViewer |
| Database Explorer | database.ts | databaseStore, databaseTabStore | DatabaseExplorer, DatabaseSidebar, DatabaseQueryArea |
| Health Check | healthcheck.ts | healthCheckStore | HealthCheckPanel |
| DevOps | devops.ts | devopsStore | DevOpsPanel |
| Code Analysis | analysis.ts | — | CodeAnalysisPanel |
| Package Management | packages.ts | packagesStore | PackagesPanel, PackagesContent |
| API Tester | api.ts | — | ApiTesterPanel |
| SSH | ssh.ts | — | — |
| MCP | mcp.ts | — | McpPanel |
| Settings | app.ts | viewStore | SettingsPanel |
| File Explorer | filesystem.ts | — | FileExplorer, FileViewer |
| App Updates | appUpdate.ts | appUpdateStore | AppUpdateModal, UpdateCenter |
| Pixel Agents | pixel-agents.ts | — | PixelAgentsPane |
| Multi-Agent | — | — | MultiAgentView |

## Data Persistence

- `~/.kanbai/data.json` — workspaces, projects, settings, templates (via StorageService singleton)
- `.workspaces/kanban.json` — per-project Kanban tasks
- Session state saved/restored via StorageService

## Code Conventions

- TypeScript strict mode, no `any` without justification
- ESLint 9 (flat config) + Prettier for formatting
- Conventional Commits in French: `type(scope): description`
- No Co-Authored-By trailers in commits
- Files: `kebab-case.ts`, IPC handlers: `[namespace].ts`
- Small functions (< 30 lines), max 3 levels nesting
- CSS custom properties (no Tailwind)

## Key Interfaces

All TypeScript interfaces in `src/shared/types/index.ts`:
- `Workspace`, `Project` — workspace/project management
- `TerminalSession`, `TerminalTab`, `TerminalPane` — terminal system
- `ClaudeSession` — Claude Code integration
- `KanbanTask` (status: TODO|WORKING|PENDING|DONE|FAILED)
- `AppSettings` — user preferences
- `GitStatus`, `GitLogEntry`, `FileEntry` — git/filesystem
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

- Vitest for all tests
- Unit: services, stores, utilities (`tests/unit/`)
- Integration: IPC round-trips with mocked Electron (`tests/integration/`)
- Mock infrastructure: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
- Always run tests before marking work as done
