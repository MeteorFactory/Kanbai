# Kanbai - Gemini CLI Instructions

## Project Overview

Kanbai is an AI-enhanced desktop terminal built with Electron. It combines a full terminal emulator (xterm.js + node-pty), workspace/project management, native Claude Code integration, a Kanban board with AI agent assignment, database exploration, health monitoring, DevOps tools, code analysis, package management, a companion API system, and workspace notes. Targets macOS (primary) and Windows.

## Language

- Code (variables, functions, comments): **English**
- Git commits, PR descriptions: **French**

## Execution Rules

When executing kanban tickets or task files, start implementation immediately after reading the ticket. Limit exploration to 2-3 minutes max. Do NOT spend entire sessions planning — produce code changes early and iterate.

## Testing

After implementing any feature, always run the existing test suite before reporting completion. Fix any failing tests before marking work as done.

## Code Patterns / Gotchas

When generating shell scripts or wrapper scripts, never use heredoc syntax inside template literals. Write files using direct fs.writeFileSync or equivalent with properly escaped content.

## Tech Stack

- **Node.js >= 22.12.0** — Runtime requirement
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
   - `ipc/` — IPC handlers (1 file per domain, 40 handler files)
   - `services/` — storage.ts (StorageService singleton), healthCheckScheduler, notificationService, appUpdateState, activityHooks (AI provider hooks), ai-cli, pixel-agents-service, pixel-agents-assets, companion-server (AES-256-GCM encrypted data server), database/ (connection, queries, backup, crypto, NL queries, drivers/), packages/ (analysis, NL queries)

2. **Preload** (`src/preload/`) — Bridge between processes
   - Exposes `window.kanbai` API via `contextBridge`
   - Domain-grouped methods (terminal, workspace, project, fs, git, claude, kanban, database, etc.)

3. **Renderer** (`src/renderer/`) — Chromium, sandboxed
   - Feature-based architecture: `features/` contains 26+ self-contained modules (terminal, workspace, claude, kanban, database, git, healthcheck, devops, packages, mcp, settings, skills-store, companion, notes, notifications, command-palette, prompts, search, ssh, etc.)
   - Each feature colocates its components, hooks, and store
   - Features: terminal, workspace, claude, kanban, database, git, healthcheck, devops, code-analysis, packages, api-tester, mcp, files, updates, pixel-agents, multi-agent, settings, skills-store, companion, notes, ssh, installer, notifications, command-palette, prompts, search
   - `shared/ui/` — Base UI components (ConfirmModal, ContextMenu, ErrorBoundary...)
   - `shared/stores/` — Shared stores (notificationStore, viewStore)
   - `shared/layout/` — Layout components (ResizeDivider, SplitContainer, TitleBar)
   - `lib/stores/` — Domain Zustand stores (14 stores)
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
- CSP headers set via `session.defaultSession.webRequest.onHeadersReceived`

## IPC Conventions

- Channel format: `namespace:action` (e.g., `terminal:create`, `git:status`)
- Request-response: `ipcRenderer.invoke` / `ipcMain.handle`
- Events: `ipcRenderer.send` / `ipcMain.on` (fire-and-forget only)
- All channel names in `IPC_CHANNELS` constant

### IPC Domains

terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents, skillsStore, companion, notes, installer, prompts

## State Management

- Main process = source of truth for persisted data
- Renderer uses Zustand stores as cache + UI state
- Data flow: User action -> React -> Zustand -> IPC invoke -> Main service -> JSON file
- Each domain has its own store (no monolithic global store)
- Store organization: domain stores in `lib/stores/`, feature-local stores colocated in `features/`, shared stores in `shared/stores/`

### Zustand Stores (lib/stores/)

terminalTabStore, workspaceStore, claudeStore, kanbanStore, viewStore, updateStore, appUpdateStore, devopsStore, packagesStore, databaseStore, databaseTabStore, healthCheckStore, companionStore, notesStore

Feature-local stores are colocated (e.g., `features/terminal/terminal-store.ts`). Shared stores (notificationStore, viewStore) live in `shared/stores/`.

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
- **Skills Store** — Claude Code skills marketplace with multi-repo fetching and one-click install
- **Companion** — External companion API pairing and registration system
- **Notes** — Per-workspace note management with image support (paste, drag-drop, resize)
- **SSH** — Remote SSH connection management
- **Installer** — Node.js package installer
- **Prompts** — Prompt templates management
- **Makefile Runner** — Makefile target buttons attached to terminal tabs

## AI Provider Integration

4 AI coding assistants with consistent integration pattern:

| Provider | Color | Config dir | Memory file |
|----------|-------|------------|-------------|
| Claude Code | #C15F3C (orange) | `.claude/` | `CLAUDE.md` |
| Codex | #10a37f (green) | `.codex/` | `AGENTS.md` |
| Copilot | #e2538a (pink) | `.copilot/` | `.github/copilot-instructions.md` |
| Gemini CLI | #4285F4 (blue) | `.gemini/` | `GEMINI.md` (this file) |

Each provider has activity hooks, settings UI with provider-colored accents, Pixel Agents visual integration, terminal integration, workspace-level AI tab with defaults propagation to all projects, and memory/instruction files managed via Kanbai UI.

## Pixel Agents

Animated AI characters that visually represent active AI sessions:
- Git submodule in `vendor/pixel-agents/`
- **Buffer architecture**: events stored in buffer even when Pixel Agents pane is closed
- Displays ticket number above each character, provider label with brand color below
- Service in main process (`pixel-agents-service.ts`) with `attachEmitter`/`detachEmitter`

## Kanban System

- Data stored in `~/.kanbai/kanban/{workspaceId}.json`
- Statuses: TODO, WORKING, DONE, FAILED, PENDING
- Ticket reactivation: DONE->WORKING only on Enter (message submit), not on keystrokes
- Auto-creation of "Refonte memoires IA" tickets every 10 tickets (configurable in Settings > Kanban)
- Labels system and comments on tickets with timestamps
- Cards display update time (hours/minutes) and AI provider/model used
- PDF preview in ticket attachments
- Worktree isolation: each ticket runs in its own git worktree branch

## Code Conventions

- TypeScript strict mode everywhere
- No `any` without documented justification
- ESLint 9 (flat config) + Prettier for formatting
- Conventional Commits in French: `type(scope): description`
- No Co-Authored-By trailers
- Files: `kebab-case.ts`
- Small functions (< 30 lines), max 3 nesting levels
- CSS custom properties (no Tailwind, no CSS modules)

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
- `SkillStoreRepo`, `SkillStoreEntry` — skills store marketplace
- `Note` — workspace notes

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
npm run pixel-agents:setup   # Install Pixel agents integration
npm run pixel-agents:update  # Update Pixel agents
npm run rtk:setup            # Setup RTK (Rust Token Killer) on macOS
npm run rtk:setup:windows    # Setup RTK on Windows
npm run rtk:update           # Update RTK
```

## Testing

- **Vitest 4.x** for unit and integration tests
- Unit tests: `tests/unit/` — services, stores, utilities
- Integration tests: `tests/integration/` — IPC round-trips
- Mock infrastructure: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
- Always run tests before completing work

## Design System

Kanbai Brand Identity v1.0 applied across the entire application:
- Consistent color palette, typography, and spacing via CSS custom properties
- Provider-colored accents for each AI tool (orange/green/pink/blue)
- macOS-native feel with vibrancy and system fonts

## Data Persistence

| Path | Purpose |
|------|---------|
| `~/.kanbai/data.json` | Global persistence (workspaces, projects, settings, via StorageService) |
| `~/.kanbai/kanban/{workspaceId}.json` | Kanban board data per workspace |
| `.workspaces/kanban.json` | Per-project Kanban tasks |
| `~/.kanbai/notes-workspace/{workspaceId}.json` | Per-workspace notes (including embedded images) |
| `~/.kanbai/envs/{Name}/` | Workspace environment root |
| `~/.kanbai/hooks/` | Shared activity and automation hooks |

## Key Architectural Decisions

| Decision | Choice | Rejected alternatives |
|----------|--------|-----------------------|
| State management | Zustand | Redux, Context API |
| Persistence | JSON files (StorageService) | SQLite, IndexedDB |
| Dev server | Vite + vite-plugin-electron | electron-vite |
| Packaging | electron-builder | Electron Forge |
| Terminal backend | node-pty | — |
| Code editor | Monaco Editor | CodeMirror |
| CI/CD | GitHub Actions, auto-increment patch | Manual versioning |

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
