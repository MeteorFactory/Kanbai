---
applyTo: "src/renderer/**"
---

# Renderer Process Rules

## Architecture

- Flat component architecture in `src/renderer/components/` (~60 components)
- Zustand stores in `src/renderer/lib/stores/` (one per domain)
- Access main process ONLY through `window.kanbai` preload API
- Never import Node.js modules in renderer code

## State Management (Zustand)

- Each domain has its own store (terminalTab, workspace, claude, kanban, view, update, appUpdate, notification, devops, packages, database, databaseTab, healthCheck)
- Stores cache data from main process via IPC
- Main process is source of truth — stores are read caches + UI state
- Use `zustand` actions for state mutations, not direct state assignment

## Components

- React 19 with TypeScript strict mode
- CSS custom properties for styling (no Tailwind, no CSS modules)
- Style files in `src/renderer/styles/`
- macOS-native look and feel (vibrancy, system fonts)

## Accessibility

- Use semantic HTML (`<button>` not `<div onClick>`)
- Keyboard navigation for all interactive elements
- `aria-label` on icon-only buttons
- Respect `prefers-reduced-motion`
