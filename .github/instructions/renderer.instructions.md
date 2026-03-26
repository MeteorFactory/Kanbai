---
applyTo: "src/renderer/**"
---

# Renderer Process Rules

## Architecture

- Feature-based architecture: `src/renderer/features/` with 26 self-contained modules
- Each feature colocates its components, hooks, and store (e.g., `features/terminal/use-terminal.ts`, `features/terminal/terminal-store.ts`)
- Shared UI primitives: `src/renderer/shared/ui/` (ConfirmModal, ContextMenu, ErrorBoundary...)
- Shared stores: `src/renderer/shared/stores/` (notificationStore, viewStore)
- Layout components: `src/renderer/shared/layout/` (ResizeDivider, SplitContainer, TitleBar)
- Domain stores: `src/renderer/lib/stores/` (14 stores)
- Access main process ONLY through `window.kanbai` preload API
- Never import Node.js modules in renderer code

## State Management (Zustand)

- Each domain has its own store in `lib/stores/` (terminalTab, workspace, claude, kanban, view, update, appUpdate, devops, packages, database, databaseTab, healthCheck, companion, notes)
- Feature-local stores colocated in their feature directory
- Shared stores (notification, view) in `shared/stores/`
- Stores cache data from main process via IPC
- Main process is source of truth — stores are read caches + UI state
- Use `zustand` actions for state mutations, not direct state assignment

## Components

- React 19 with TypeScript strict mode
- CSS custom properties for styling (no Tailwind, no CSS modules)
- Style files in `src/renderer/styles/`
- macOS-native look and feel (vibrancy, system fonts)
- When adding a new component, place it in the relevant `features/` module

## Accessibility

- Use semantic HTML (`<button>` not `<div onClick>`)
- Keyboard navigation for all interactive elements
- `aria-label` on icon-only buttons
- Respect `prefers-reduced-motion`
