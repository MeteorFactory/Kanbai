---
description: "Electron 40+ project conventions and architecture"
alwaysApply: true
---

# Kanbai — Electron Desktop Application

Kanbai is an AI-enhanced desktop terminal built with Electron. It combines a full terminal emulator (xterm.js + node-pty), workspace/project management, native Claude Code integration, a Kanban board with AI agent assignment, database exploration, health monitoring, DevOps tools, code analysis, and package management. Targets macOS (primary) and Windows.

## Stack

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
    ipc/             # IPC handlers (1 file per domain, 32 handlers)
    services/        # Business logic services
      storage.ts     # StorageService singleton (~/.kanbai/data.json)
      healthCheckScheduler.ts
      notificationService.ts
      appUpdateState.ts  # App update state management
      activityHooks.ts   # AI provider activity hooks (Kanbai integration)
      ai-cli.ts          # AI CLI detection and management
      pixel-agents-service.ts   # Pixel agents integration
      pixel-agents-assets.ts    # Pixel agents static assets
      database/      # DB connection, queries, backup, crypto, NL queries, drivers/
      packages/      # Package analysis, NL package queries
    assets/          # Static assets (rule-templates)
  preload/           # Preload scripts — contextBridge, exposes window.kanbai
  renderer/          # Renderer process (React + Zustand)
    components/      # All UI components (flat + claude-settings subdirectory, ~130 components)
    lib/stores/      # Zustand stores (per domain, 15 stores)
    styles/          # CSS custom properties
  shared/            # Shared types and constants (both processes)
    types/index.ts   # ALL interfaces + IPC_CHANNELS
    constants/       # Shared constants
tests/
  unit/              # Unit tests (services, stores, utils)
  integration/       # IPC round-trip tests
```

## Process Model

| Process   | Environment | Access          | Role                              |
|-----------|-------------|-----------------|-----------------------------------|
| Main      | Node.js     | Full OS access  | Window management, IPC handlers, services, database |
| Renderer  | Chromium    | Sandboxed       | UI rendering (React)              |
| Preload   | Isolated    | Limited Node.js | Bridge via contextBridge (`window.kanbai`) |

## IPC Conventions

- Channel naming: `namespace:action` (e.g., `terminal:create`, `git:status`)
- All channels defined in `IPC_CHANNELS` constant (`src/shared/types/index.ts`)
- Request-response: `ipcRenderer.invoke` / `ipcMain.handle`
- Fire-and-forget: `ipcRenderer.send` / `ipcMain.on`
- Preload exposes API as `window.kanbai` with domain-grouped methods
- Never expose `ipcRenderer` directly to the renderer — use `contextBridge`
- Validate all inputs received in main process handlers

### IPC Domains

terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents, skillsStore, companion, notes

## Security Defaults

Every `BrowserWindow` must enforce:
- `contextIsolation: true` — always on
- `nodeIntegration: false` — never enable
- `sandbox: true` — keep the renderer sandboxed
- `webSecurity: true` — never disable

## State Management

- Main process = source of truth (StorageService, `~/.kanbai/data.json`)
- Renderer = Zustand stores as cache + UI state
- Flow: User action → React → Zustand action → IPC invoke → Main service → JSON

### Zustand Stores

terminalTabStore, workspaceStore, claudeStore, kanbanStore, viewStore, updateStore, appUpdateStore, notificationStore, devopsStore, packagesStore, databaseStore, databaseTabStore, healthCheckStore, companionStore, notesStore

## Key Features

| Feature | IPC Handler | Store | Key Components |
|---------|-------------|-------|----------------|
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
| MCP | mcp.ts | — | McpPanel |
| Settings | app.ts | viewStore | SettingsPanel |
| File Explorer | filesystem.ts | — | FileExplorer, FileViewer |
| App Updates | appUpdate.ts | appUpdateStore | AppUpdateModal, UpdateCenter |
| Pixel Agents | pixel-agents.ts | — | PixelAgentsPane |
| Multi-Agent | — | — | MultiAgentView |
| AI Configs | codexConfig.ts, copilotConfig.ts, geminiConfig.ts, aiProvider.ts | — | SettingsPanel |
| Skills Store | skillsStore.ts | — | SkillsStoreSection, AgentsSkillsTab |
| Companion | companion.ts | companionStore | CompanionIndicator |
| Notes | notes.ts | notesStore | NotesPanel |
| SSH | ssh.ts | — | — |

## Data Persistence

- `~/.kanbai/data.json` — workspaces, projects, settings, templates (via StorageService singleton)
- `.workspaces/kanban.json` — per-project Kanban tasks
- `~/.kanbai/notes-workspace/{workspaceId}.json` — per-workspace notes
- Session state saved/restored via StorageService

## Key Types

All in `src/shared/types/index.ts`:
- `Workspace`, `Project` — workspace/project management
- `TerminalSession`, `TerminalTab`, `TerminalPane` — terminal system
- `ClaudeSession` — Claude Code integration
- `KanbanTask` (status: `TODO | WORKING | PENDING | DONE | FAILED`)
- `AppSettings` — user preferences
- `GitStatus`, `GitLogEntry`, `FileEntry` — git/filesystem
- `DatabaseConnection`, `DatabaseQuery` — database explorer
- `HealthCheckConfig` — health monitoring
- `SkillStoreRepo`, `SkillStoreEntry` — skills store marketplace
- `Note` — workspace notes

## Code Style

- Files: `kebab-case.ts` — IPC handlers: `[namespace].ts`
- One handler file per IPC namespace
- Shared types in `src/shared/types/`
- Constants (channels, defaults) in `src/shared/constants/`
- CSS custom properties for styling (no Tailwind, no CSS modules)

## Commands

```bash
npm run dev              # Dev with hot-reload (vite + vite-plugin-electron)
npm run dev:companion    # Dev with Companion API enabled
npm run build            # Production build
npm run build:app        # Build + package for macOS (.dmg/.app)
npm run build:app:win    # Build + package for Windows (.nsis/.zip)
npm run build:local      # Build + package locally (no publish)
npm run build:local:win  # Build + package locally for Windows
npm run test             # Unit tests (Vitest)
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Tests with coverage
npm run lint             # ESLint (flat config)
npm run lint:fix         # ESLint auto-fix
npm run typecheck        # TypeScript check
npm run format           # Prettier
npm run build:mcp        # Build MCP server
```

## Testing

- Vitest for all tests
- Unit: services, stores, utilities (`tests/unit/`)
- Integration: IPC round-trips with mocked Electron (`tests/integration/`)
- Mock infrastructure: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
