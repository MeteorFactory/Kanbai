# Kanbai - Codex Instructions

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

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | >= 22.12.0 | Runtime requirement |
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
    ipc/             # IPC handlers (1 file per domain, 40 handler files)
    services/        # Business logic services
      storage.ts     # StorageService singleton (~/.kanbai/data.json)
      healthCheckScheduler.ts
      notificationService.ts
      appUpdateState.ts  # App update state management
      activityHooks.ts   # AI provider activity hooks (Kanbai integration)
      ai-cli.ts          # AI CLI detection and management
      pixel-agents-service.ts   # Pixel agents integration
      pixel-agents-assets.ts    # Pixel agents static assets
      companion-server.ts  # Companion data server (AES-256-GCM encrypted)
      database/      # DB connection, queries, backup, crypto, NL queries, drivers/
      packages/      # Package analysis, NL package queries
    assets/          # Static assets (rule-templates)
  preload/           # Preload scripts — contextBridge, exposes window.kanbai
  renderer/          # Renderer process (React + Zustand)
    features/        # Feature-based modules (26 self-contained features)
      terminal/      # Terminal emulator (components, hooks, store)
      workspace/     # Workspace/project management
      claude/        # Claude AI integration (nested: agents, ai-providers, rules, settings, hooks, plugins)
      kanban/        # Kanban board
      database/      # Database explorer (nested: connection, nl-chat, query)
      installer/     # Node.js package installer
      git/           # Git operations
      healthcheck/   # Health monitoring
      devops/        # DevOps CI/CD panel
      code-analysis/ # Static analysis tools
      packages/      # Package management
      api-tester/    # HTTP request testing
      mcp/           # MCP server management
      files/         # File explorer/viewer
      updates/       # App updates & version management
      pixel-agents/  # AI pixel agents
      multi-agent/   # Multi-agent orchestration
      settings/      # Settings panel
      skills-store/  # Skills marketplace
      companion/     # Companion API integration
      notes/         # Workspace notes
      notifications/ # Toast & notification center
      command-palette/ # Command palette
      prompts/       # Prompt templates
      search/        # Global search & TODO scanner
      ssh/           # SSH connections
    shared/          # Shared renderer modules
      ui/            # Base UI components (ConfirmModal, ContextMenu, ErrorBoundary...)
      stores/        # Shared stores (notificationStore, viewStore)
      layout/        # Layout components (ResizeDivider, SplitContainer, TitleBar)
    lib/stores/      # Domain Zustand stores (14 stores)
    hooks/           # Shared hooks
    styles/          # CSS custom properties
  shared/            # Shared types and constants (both processes)
    types/index.ts   # ALL interfaces + IPC_CHANNELS
    constants/       # Shared constants
tests/
  unit/              # Unit tests (services, stores, utils)
  integration/       # IPC round-trip tests
```

Each feature module is self-contained with colocated components, hooks, and store. Shared UI primitives live in `shared/ui/`, shared stores in `shared/stores/`.

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
- CSP headers set via `session.defaultSession.webRequest.onHeadersReceived`

## IPC Conventions

- Channel naming: `namespace:action` (e.g., `terminal:create`, `git:status`)
- All channels defined in `IPC_CHANNELS` constant (`src/shared/types/index.ts`)
- Request-response: `ipcRenderer.invoke` / `ipcMain.handle`
- Fire-and-forget: `ipcRenderer.send` / `ipcMain.on`
- Preload exposes API as `window.kanbai` with domain-grouped methods

### IPC Domains

terminal, workspace, project, claude, kanban, git, filesystem, session, app, database, packages, analysis, ssh, healthcheck, devops, mcp, api, updates, appUpdate, workspaceEnv, claudeMemory, claudeDefaults, codexConfig, copilotConfig, geminiConfig, gitConfig, namespace, aiProvider, pixel-agents, skillsStore, companion, notes, installer, prompts

## State Management

- Main process = source of truth (StorageService, `~/.kanbai/data.json`)
- Renderer = Zustand stores as cache + UI state
- Flow: User action -> React -> Zustand action -> IPC invoke -> Main service -> JSON

### Zustand Stores (lib/stores/)

terminalTabStore, workspaceStore, claudeStore, kanbanStore, viewStore, updateStore, appUpdateStore, devopsStore, packagesStore, databaseStore, databaseTabStore, healthCheckStore, companionStore, notesStore

Feature-local stores are colocated in their feature directory (e.g., `features/terminal/terminal-store.ts`). Shared stores (notificationStore, viewStore) live in `shared/stores/`.

## Key Features

| Feature | IPC Handler | Store | Components |
|---------|-------------|-------|------------|
| Terminal | terminal.ts | terminalTabStore | Terminal, TerminalArea, TabBar |
| Workspace/Project | workspace.ts, project.ts | workspaceStore | Sidebar, WorkspaceItem, ProjectItem |
| Claude Integration | claude.ts, claudeDefaults.ts, claudeMemory.ts, claude-assets-handler.ts, claude-config-handler.ts, claude-hooks-handler.ts, claude-plugins.ts | claudeStore | ClaudeSessionPanel, ClaudeInfoPanel, AutoClauder |
| Kanban Board | kanban.ts | kanbanStore | KanbanBoard (with PDF preview, AI provider/model display) |
| Git | git.ts, gitConfig.ts | — | GitPanel, FileDiffViewer |
| Database Explorer | database.ts | databaseStore, databaseTabStore | DatabaseExplorer, DatabaseSidebar, DatabaseQueryArea |
| Health Check | healthcheck.ts | healthCheckStore | HealthCheckPanel |
| DevOps | devops.ts | devopsStore | DevOpsPanel |
| Code Analysis | analysis.ts | — | CodeAnalysisPanel |
| Package Management | packages.ts | packagesStore | PackagesPanel, PackagesContent |
| API Tester | api.ts | — | ApiTesterPanel |
| MCP | mcp.ts | — | McpPanel |
| Settings | app.ts | viewStore | SettingsPanel |
| File Explorer | filesystem.ts | — | FileExplorer, FileViewer (buffered reading for >5MB files) |
| App Updates | appUpdate.ts | appUpdateStore | AppUpdateModal, UpdateCenter |
| Pixel Agents | pixel-agents.ts | — | PixelAgentsPane |
| Multi-Agent | — | — | MultiAgentView |
| AI Configs | codexConfig.ts, copilotConfig.ts, geminiConfig.ts, aiProvider.ts | — | SettingsPanel (workspace-level AI tab with propagation to projects) |
| Skills Store | skillsStore.ts | — | SkillsStoreSection, AgentsSkillsTab |
| Companion | companion.ts | companionStore | CompanionIndicator |
| Notes | notes.ts | notesStore | NotesPanel (with image support: paste, drag-drop, resize) |
| SSH | ssh.ts | — | — |
| Installer | installer.ts | — | InstallerPanel |
| Prompts | prompts-handler.ts | — | PromptsPanel |
| Makefile Runner | — | — | Makefile target buttons attached to terminal tabs |

## AI Provider Integration

4 AI coding assistants with consistent integration pattern:

| Provider | Color | Config dir | Memory file |
|----------|-------|------------|-------------|
| Claude Code | #C15F3C (orange) | `.claude/` | `CLAUDE.md` |
| Codex | #10a37f (green) | `.codex/` | `AGENTS.md` |
| Copilot | #e2538a (pink) | `.copilot/` | `.github/copilot-instructions.md` |
| Gemini CLI | #4285F4 (blue) | `.gemini/` | `GEMINI.md` |

Each provider has:
- Config files synced to workspace env at workspace creation
- Activity hooks (`kanbai-activity.sh`) for tracking in Kanban
- Settings UI with provider-colored accents (toggles, tabs, borders)
- Pixel Agents visual integration (animated character per active AI agent)
- Terminal integration (double terminal: user + AI)
- Workspace-level AI tab with defaults propagation to all projects
- Memory/instruction files managed via Kanbai UI

## Pixel Agents

Animated AI characters that visually represent active AI sessions:
- Git submodule in `vendor/pixel-agents/`
- **Buffer architecture**: events stored in buffer even when Pixel Agents pane is closed
- Displays ticket number (e.g., T-10) above each character
- Provider label (Claude/Codex/Copilot/Gemini) with brand color below character
- Service in main process (`pixel-agents-service.ts`) with `attachEmitter`/`detachEmitter`

## Kanban System

- Data stored in `~/.kanbai/kanban/{workspaceId}.json`
- Statuses: TODO, WORKING, DONE, FAILED, PENDING
- Ticket reactivation: DONE->WORKING only on Enter (message submit), not on keystrokes
- Auto-creation of "Refonte memoires IA" tickets every 10 tickets (configurable in Settings > Kanban)
- Labels system (e.g., `ai-memory-refactor`, `maintenance`, `bug`)
- Comments on tickets with timestamps
- Cards display update time (hours/minutes) and AI provider/model used
- PDF preview in ticket attachments
- Worktree isolation: each ticket runs in its own git worktree branch

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

## Code Conventions

- TypeScript strict mode, no `any` without justification
- ESLint 9 (flat config) + Prettier for formatting
- Conventional Commits in French: `type(scope): description`
- No Co-Authored-By trailers in commits
- Files: `kebab-case.ts`, IPC handlers: `[namespace].ts`
- Small functions (< 30 lines), max 3 levels nesting
- CSS custom properties (no Tailwind, no CSS modules)

## Key Types

All TypeScript interfaces in `src/shared/types/index.ts`:
- `Workspace`, `Project` — workspace/project management
- `TerminalSession`, `TerminalTab`, `TerminalPane` — terminal system
- `ClaudeSession` — Claude Code integration
- `KanbanTask` (status: TODO|WORKING|PENDING|DONE|FAILED)
- `AppSettings` — user preferences
- `GitStatus`, `GitLogEntry`, `FileEntry` — git/filesystem
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

- Vitest for all tests
- Unit: services, stores, utilities (`tests/unit/`)
- Integration: IPC round-trips with mocked Electron (`tests/integration/`)
- Mock infrastructure: `tests/mocks/electron.ts`, `tests/helpers/storage.ts`
- Always run tests before marking work as done

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
