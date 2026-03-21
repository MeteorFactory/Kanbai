---
description: Tauri v2+ project conventions and architecture
alwaysApply: true
---

# Tauri Project Guidelines

## Stack

- Tauri v2+ with Rust backend and TypeScript frontend
- Any web frontend framework (React, Vue, Svelte, Solid, etc.)
- Vitest for frontend tests, `cargo test` for Rust tests
- `cargo clippy` for linting, `cargo fmt` for formatting

## Architecture

```
src/                 # Frontend (TypeScript)
src-tauri/
  src/               # Rust backend (commands, state, plugins)
  capabilities/      # Permission scopes per window
  Cargo.toml         # Rust dependencies
  tauri.conf.json    # App config, CSP, bundle settings
```

## IPC Model

- Use `invoke<T>()` for frontend-to-backend commands (request-response)
- Use `emit()` / `listen()` for fire-and-forget events
- Define typed wrapper functions in a dedicated `api/` directory — no inline `invoke` string literals
- Mirror Rust command return types in TypeScript

## Security Principles

- Capabilities-based permission model — default deny, explicit allow
- Scope filesystem access to app directories (`$APPDATA`, `$APPCONFIG`, `$APPLOCAL`)
- Set a strict CSP in `tauri.conf.json` — never use `unsafe-eval`
- Validate all inputs in Rust commands before processing
- Never expose `tauri::AppHandle` directly to the frontend

## Code Style

- Rust: `snake_case` functions/modules, one module per domain
- TypeScript: `camelCase` functions, typed wrappers around `invoke()`
- Files: `snake_case.rs` for Rust, `kebab-case.ts` for TypeScript
- Error types: use `thiserror` for Rust command errors
- Never use `.unwrap()` in command handlers — always propagate errors

## Commands

```bash
npm run tauri dev       # Dev with hot-reload
npm run tauri build     # Production build
npm run tauri icon      # Generate app icons
npm run test            # Frontend tests (Vitest)
cargo test              # Rust tests
cargo clippy            # Rust linting
cargo fmt               # Rust formatting
```
