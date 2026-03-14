# Kanbai - GitHub Copilot Instructions

## Project Overview

Kanbai is an AI-enhanced desktop terminal built with Electron. It combines a full terminal emulator (xterm.js + node-pty), workspace/project management, native Claude Code integration, a Kanban board with AI agent assignment, database exploration, health monitoring, DevOps tools, code analysis, package management, a companion API system, and workspace notes. Targets macOS (primary) and Windows.

## Language

- Code (variables, functions, comments): **English**
- Git commits, PR descriptions: **French**

## Tech Stack

- Node.js >= 22.12.0 (runtime requirement)
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

- **Main** (`src/main/`) — Node.js, IPC handlers in `ipc/` (32 handlers), services in `services/` (storage, healthCheck, notifications, appUpdateState, activityHooks, ai-cli, pixel-agents-service, pixel-agents-assets, companion-server [AES-256-GCM encrypted data server], database/ [connection, queries, backup, crypto, NL, drivers/], packages/ [analysis, NL])
- **Preload** (`src/preload/`) — contextBridge, exposes `window.kanbai` API
- **Renderer** (`src/renderer/`) — React, flat + claude-settings components (~60), Zustand stores in `lib/stores/` (15 stores)
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
- Domains: terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents, skillsStore, companion, notes

## State Management

- Main process = source of truth (StorageService -> `~/.kanbai/data.json`)
- Renderer = Zustand stores as cache (terminalTab, workspace, claude, kanban, view, update, appUpdate, notification, devops, packages, database, databaseTab, healthCheck, companion, notes)
- Flow: React -> Zustand -> IPC invoke -> Main service -> JSON -> IPC event -> Zustand -> React

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
- AI provider configuration (Codex, Copilot, Gemini, generic)
- Skills Store (Claude Code skills marketplace)
- Companion API pairing and registration
- Workspace notes
- SSH remote connection management

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
- `SkillStoreRepo`, `SkillStoreEntry` — skills store marketplace
- `Note` — workspace notes

## Testing

- Vitest 4.x: `tests/unit/` (services, stores) + `tests/integration/` (IPC round-trips)
- Mock infra: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
- Always run tests before marking work as done

## Data Persistence

- `~/.kanbai/data.json` — main data store (workspaces, projects, settings, via StorageService singleton)
- `.workspaces/kanban.json` — per-project Kanban tasks
- `~/.kanbai/notes-workspace/{workspaceId}.json` — per-workspace notes
- Session state saved/restored via StorageService

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

## Workflow

1. **Plan First** — For non-trivial tasks (3+ steps or architectural decisions), write a plan before coding
2. **Verify Before Completion** — Never mark a task as done without proving it works (run tests, check logs)
3. **Autonomous Bug Fixing** — When a bug is reported, fix it directly. Point to logs, errors, failing tests — then resolve
4. **Elegance Check** — For non-trivial changes, pause and ask "is there a more elegant way?" Skip for simple fixes
5. **Self-Improvement** — After any user correction, capture the lesson to avoid repeating the same mistake

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary.
