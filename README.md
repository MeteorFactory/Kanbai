<p align="center">
  <img src="website/assets/icon-256.png" alt="Kanbai" width="128" height="128">
</p>

<h1 align="center">Kanbai</h1>

<p align="center">
  <strong>AI-powered development environment for macOS</strong>
</p>

<p align="center">
  <a href="https://github.com/AntonyCanut/Kanbai/releases"><img src="https://img.shields.io/github/v/release/AntonyCanut/Kanbai?style=flat-square" alt="Release"></a>
  <a href="https://github.com/AntonyCanut/Kanbai/actions"><img src="https://img.shields.io/github/actions/workflow/status/AntonyCanut/Kanbai/ci.yml?style=flat-square" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Proprietary-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/AntonyCanut/Kanbai/issues"><img src="https://img.shields.io/github/issues/AntonyCanut/Kanbai?style=flat-square" alt="Issues"></a>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#screenshots">Screenshots</a> &bull;
  <a href="#tech-stack">Tech Stack</a> &bull;
  <a href="#documentation">Documentation</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

Kanbai combines a multi-tab terminal, project workspaces, a Kanban board, Git tools, a database explorer, and Claude AI sessions into a single native macOS application. It is built with Electron and designed to streamline the full development workflow without switching between tools.

## Features

### Terminal

Full-featured terminal emulator powered by xterm.js and node-pty. Supports multiple tabs with up to 4 split panes per tab, WebGL rendering, search, and Unicode.

### Workspaces

Isolated project environments managed via symlinks (`~/.kanbai/envs/{name}`). Each workspace maintains its own terminal tabs, open files, and session state.

### Git

Comprehensive Git integration — status, branches, commits, diff, stash, merge, fetch, and config. All operations are available through a dedicated panel with 20+ IPC channels.

### Kanban Board

5-column task board (TODO, WORKING, PENDING, DONE, FAILED) with built-in Claude AI integration for automated task execution and tracking.

### Claude Code Sessions

Run up to 4 concurrent Claude Code AI agents per project. Includes loop mode, session history, prompt templates, and a CLAUDE.md defaults library for consistent agent behavior.

### Database Explorer

Connect to PostgreSQL, MySQL, MSSQL, SQLite, and MongoDB. Browse schemas, run queries, and interact with your data through a natural language chat interface.

### Code Editor

Monaco Editor with syntax highlighting, file diff viewer, and integrated file saving.

### Package Manager

Visualize installed npm packages, check for outdated versions, and manage dependencies with an AI-assisted chat for package-related questions.

### Code Analysis & Health Check

Static code analysis panel and application health monitoring dashboard.

### API Tester

Built-in HTTP client for testing API endpoints directly from the application.

### Additional Tools

- **File Explorer** — navigable directory tree with multi-file diff support
- **TODO Scanner** — finds and aggregates TODO/FIXME comments across the codebase
- **MCP Server** — Model Context Protocol integration for extended tool support
- **Command Palette** — quick access to all application commands
- **Global Search** — search across files in the current workspace
- **SSH Management** — manage SSH keys and connections
- **Auto-Updater** — built-in update mechanism with release notes
- **Notification Center** — in-app notifications and alerts
- **Project Statistics** — lines of code, file counts, and project metrics
- **Native macOS UI** — custom titlebar, vibrancy effects, system fonts

## Screenshots

<p align="center">
  <img src="website/screenshots/hero-terminal.png" alt="Terminal" width="800">
</p>

<details>
<summary><strong>More screenshots</strong></summary>

| Feature | Preview |
|---------|---------|
| Git Panel | <img src="website/screenshots/screenshot-git.png" width="400"> |
| Kanban Board | <img src="website/screenshots/screenshot-kanban.png" width="400"> |
| Claude Sessions | <img src="website/screenshots/screenshot-claude.png" width="400"> |
| Database Explorer | <img src="website/screenshots/screenshot-database.png" width="400"> |
| Package Manager | <img src="website/screenshots/screenshot-npm.png" width="400"> |
| Code Analysis | <img src="website/screenshots/screenshot-code-analysis.png" width="400"> |
| Project Stats | <img src="website/screenshots/screenshot-stats.png" width="400"> |
| API Tester | <img src="website/screenshots/screenshot-api.png" width="400"> |
| Codex Config | <img src="website/screenshots/screenshot-codex.png" width="400"> |
| Copilot Config | <img src="website/screenshots/screenshot-copilot.png" width="400"> |
| Gemini Config | <img src="website/screenshots/screenshot-gemini.png" width="400"> |
| Pixel Agents | <img src="website/screenshots/screenshot-pixel-agents.png" width="400"> |

</details>

## Installation

### Prerequisites

- **macOS** (native macOS application)
- **Node.js** >= 20 (LTS)
- **npm** (included with Node.js)
- **Claude Code** (optional — required for AI features)

### From source

```bash
git clone https://github.com/AntonyCanut/Kanbai.git
cd Kanbai
npm install
npm run dev
```

### Build a DMG

```bash
npm run build:app
```

The DMG is generated via electron-builder with hardened runtime enabled. Output goes to the `release/` directory.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Electron 40 |
| UI | React 19 |
| Language | TypeScript (strict) |
| Build | Vite 7 |
| State | Zustand 5 |
| Terminal | node-pty + xterm.js |
| Editor | Monaco Editor |
| Database | better-sqlite3, pg, mysql2, mssql, mongodb |
| Tests | Vitest |
| Linting | ESLint + Prettier |
| Packaging | electron-builder |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build all processes (main + preload + renderer) |
| `npm run build:app` | Build + package macOS DMG |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | TypeScript type checking |

### Vendor Tools

External tools are managed in the `vendor/` directory and can be set up and updated:

| Command | Description |
|---------|-------------|
| `npm run pixel-agents:setup` | Clone and build Pixel Agents from GitHub |
| `npm run pixel-agents:update` | Update Pixel Agents to the latest version |
| `npm run rtk:setup` | Clone RTK (Rust Toolkit) from GitHub |
| `npm run rtk:update` | Update RTK to the latest version |

A `Makefile` is also available with equivalent targets plus `make install`, `make clean`, and `make check` (pre-deploy validation).

## Project Structure

```
src/
  main/               # Electron main process (Node.js)
    ipc/              # IPC handler modules (23 namespaces)
    services/         # Core services (storage, etc.)
  preload/            # Preload scripts (contextBridge API)
  renderer/           # Renderer process (React)
    components/       # UI components (50+)
    lib/
      stores/         # Zustand state stores
      monacoSetup.ts  # Monaco Editor configuration
    styles/           # CSS stylesheets
  shared/             # Shared types and constants
tests/
  unit/               # Unit tests
  integration/        # Integration tests
  mocks/              # Electron mocks
  helpers/            # Test utilities
website/              # Project website and screenshots
docs/                 # Extended documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | System architecture and design decisions |
| [IPC API](docs/IPC-API.md) | Reference for 70+ IPC channels |
| [Components](docs/COMPONENTS.md) | React component catalog |
| [Stores](docs/STORES.md) | Zustand state management docs |
| [Keyboard Shortcuts](docs/KEYBOARD-SHORTCUTS.md) | Complete shortcut reference |
| [Security](docs/SECURITY.md) | Electron security guide |
| [Testing](docs/TESTING.md) | Testing guide and strategies |
| [MCP Endpoint](docs/MCP-ENDPOINT.md) | MCP server integration |
| [Contributing](docs/CONTRIBUTING.md) | Contribution guidelines |

## Contributing

Contributions are welcome. Please read the [Contributing Guide](docs/CONTRIBUTING.md) before submitting a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Push to your branch (`git push origin feat/my-feature`)
5. Open a Pull Request

## License

This project is released under a [Proprietary Source-Available License](LICENSE). You may view, study, and use the source code for personal, non-commercial purposes. Commercial use requires a separate license — see the [LICENSE](LICENSE) file for full terms.

## Author

**Antony Kervazo Canut** — [GitHub](https://github.com/AntonyCanut)
