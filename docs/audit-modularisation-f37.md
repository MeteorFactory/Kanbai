# Audit de Modularisation Kanbai — F-37

**Date**: 2026-03-16
**Ticket**: F-37 (250283e8-316e-4b2b-a84d-9a7190796bdc)

## Etat actuel

L'application Kanbai est un terminal desktop Electron avec ~130 composants UI, 15 stores Zustand, 34 fichiers IPC handlers, 200+ canaux IPC, et 11 modules de services.

### Structure actuelle (renderer)

```
src/renderer/
├── components/           # TOUS les composants (~130 fichiers plats)
│   ├── claude-settings/  # Seul sous-dossier (65+ composants)
│   │   └── rules/        # Sous-dossier rules
│   ├── Terminal.tsx
│   ├── KanbanBoard.tsx
│   ├── GitPanel.tsx
│   ├── ... (tout au meme niveau)
├── lib/
│   ├── stores/           # 15 stores Zustand
│   └── i18n/             # Traductions FR/EN
├── hooks/                # 1 hook (useBackgroundKanbanSync)
└── styles/               # CSS par domaine
```

### Problemes identifies

1. **Aucune colocation** : composants, stores, hooks et CSS sont dans des dossiers separes
2. **Plat** : ~130 composants au meme niveau sans groupement par feature
3. **Couplage implicite** : pas de public API (index.ts) par feature
4. **Difficulte de navigation** : trouver les fichiers lies a une feature necessite de chercher dans 4+ dossiers

## Structure cible

```
src/renderer/
├── features/                    # Feature modules colocated
│   ├── terminal/
│   │   ├── index.ts             # Public API
│   │   ├── terminal.tsx
│   │   ├── terminal-area.tsx
│   │   ├── terminal-store.ts
│   │   ├── use-terminal.ts
│   │   └── terminal.css
│   ├── workspace/
│   │   ├── index.ts
│   │   ├── sidebar.tsx
│   │   ├── workspace-item.tsx
│   │   ├── workspace-store.ts
│   │   ├── use-workspace.ts
│   │   └── features/
│   │       ├── namespace/
│   │       └── project/
│   ├── claude/
│   │   ├── index.ts
│   │   ├── claude-session-panel.tsx
│   │   ├── claude-info-panel.tsx
│   │   ├── auto-clauder.tsx
│   │   ├── claude-store.ts
│   │   ├── use-claude.ts
│   │   ├── claude.css
│   │   └── features/
│   │       ├── settings/        # 65+ composants, sous-features: model, security, memory
│   │       ├── agents/          # 8 composants, sous-feature: skills
│   │       ├── rules/           # 11 composants + hooks + utils
│   │       └── ai-providers/    # codex, copilot, gemini (17+ composants)
│   ├── kanban/
│   │   ├── index.ts
│   │   ├── kanban-board.tsx
│   │   ├── kanban-store.ts
│   │   ├── use-kanban.ts
│   │   └── kanban.css
│   ├── git/
│   │   ├── index.ts
│   │   ├── git-panel.tsx
│   │   ├── file-diff-viewer.tsx
│   │   ├── use-git.ts
│   │   └── git.css
│   ├── database/
│   │   ├── index.ts
│   │   ├── database-explorer.tsx
│   │   ├── database-store.ts
│   │   ├── database-tab-store.ts
│   │   ├── use-database.ts
│   │   └── features/
│   │       ├── query/
│   │       ├── nl-chat/
│   │       └── connection/
│   ├── devops/
│   ├── packages/
│   ├── healthcheck/
│   ├── api-tester/
│   ├── files/
│   ├── notes/
│   ├── code-analysis/
│   ├── mcp/
│   ├── pixel-agents/
│   ├── companion/
│   ├── multi-agent/
│   ├── ssh/
│   ├── settings/
│   └── updates/
├── shared/
│   ├── ui/                      # Composants reutilisables
│   │   ├── command-palette.tsx
│   │   ├── global-search.tsx
│   │   ├── confirm-modal.tsx
│   │   ├── error-boundary.tsx
│   │   ├── toast-container.tsx
│   │   ├── context-menu.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── title-bar.tsx
│   │   ├── resize-divider.tsx
│   │   └── split-container.tsx
│   └── stores/
│       ├── view-store.ts
│       └── notification-store.ts
├── lib/
│   └── i18n/
└── styles/
    └── global.css
```

## Inventaire complet des features

### 1. Terminal (F-38)
| Type | Fichier actuel | Destination |
|------|---------------|-------------|
| Component | Terminal.tsx | features/terminal/terminal.tsx |
| Component | TerminalArea.tsx | features/terminal/terminal-area.tsx |
| Component | TabBar.tsx | features/terminal/tab-bar.tsx |
| Store | terminalTabStore.ts | features/terminal/terminal-store.ts |
| CSS | terminal.css | features/terminal/terminal.css |

### 2. Workspace & Project (F-39)
| Type | Fichier actuel | Destination |
|------|---------------|-------------|
| Component | Sidebar.tsx | features/workspace/sidebar.tsx |
| Component | WorkspaceItem.tsx | features/workspace/workspace-item.tsx |
| Component | ProjectItem.tsx | features/workspace/features/project/project-item.tsx |
| Component | ProjectStats.tsx | features/workspace/features/project/project-stats.tsx |
| Component | ProjectToolbar.tsx | features/workspace/features/project/project-toolbar.tsx |
| Store | workspaceStore.ts | features/workspace/workspace-store.ts |

### 3. Claude Core (F-40)
| Type | Fichier actuel | Destination |
|------|---------------|-------------|
| Component | ClaudeSessionPanel.tsx | features/claude/claude-session-panel.tsx |
| Component | ClaudeInfoPanel.tsx | features/claude/claude-info-panel.tsx |
| Component | AutoClauder.tsx | features/claude/auto-clauder.tsx |
| Component | AiProviderSelector.tsx | features/claude/ai-provider-selector.tsx |
| Component | ClaudeDefaultsLibrary.tsx | features/claude/claude-defaults-library.tsx |
| Store | claudeStore.ts | features/claude/claude-store.ts |
| CSS | claude.css | features/claude/claude.css |

### 4. Claude Settings (F-41) — 65+ composants
Sous-features: model, security, memory. Voir ticket pour detail complet.

### 5. Claude Agents (F-42) — 8 composants
Sous-feature: skills (3 composants).

### 6. Claude Rules (F-43) — 11 composants + 2 hooks + 1 util

### 7. AI Providers (F-44) — 17+ composants
Codex (6), Copilot (4), Gemini (7+1 hook).

### 8. Kanban (F-45)
| Type | Fichier actuel | Destination |
|------|---------------|-------------|
| Component | KanbanBoard.tsx | features/kanban/kanban-board.tsx |
| Store | kanbanStore.ts | features/kanban/kanban-store.ts |
| Hook | useBackgroundKanbanSync.ts | features/kanban/use-background-kanban-sync.ts |
| CSS | kanban.css | features/kanban/kanban.css |

### 9. Git (F-46)
| Type | Fichier actuel | Destination |
|------|---------------|-------------|
| Component | GitPanel.tsx | features/git/git-panel.tsx |
| Component | FileDiffViewer.tsx | features/git/file-diff-viewer.tsx |
| CSS | git.css | features/git/git.css |

### 10. Database (F-47) — 7 composants, 2 stores
Sous-features: query, nl-chat, connection.

### 11. DevOps (F-48)
### 12. Packages (F-49) — 5 composants, 1 store
### 13. Health Check (F-50) — 1 composant, 1 store
### 14. API Tester (F-51)
### 15. File Explorer (F-52) — 3 composants + file-icons util
### 16. Notes (F-53) — 1 composant, 1 store
### 17. Code Analysis (F-54) — 1 composant
### 18. Features legeres (F-55) — MCP, Pixel Agents, Companion, Multi-Agent, SSH
### 19. Settings & Updates (F-56) — 3 composants, 2 stores
### 20. Shared UI (F-57) — 13+ composants reutilisables + layout + stores partages
### 21. Finalisation imports (F-58) — dernier ticket, mise a jour imports + barrel exports

## Ordre d'execution recommande

1. **F-57** (Shared UI) — creer d'abord l'infrastructure partagee
2. **F-38 a F-56** (Features) — en parallele, par ordre de complexite croissante:
   - Simples: F-50, F-51, F-53, F-54, F-55 (1-2 composants)
   - Moyens: F-38, F-45, F-46, F-48, F-52, F-56 (2-5 composants)
   - Complexes: F-39, F-40, F-47, F-49 (5+ composants)
   - Massifs: F-41, F-42, F-43, F-44 (Claude ecosystem, 65+ composants)
3. **F-58** (Finalisation) — toujours en dernier

## Sous-tickets crees

21 tickets de refactoring (F-38 a F-58) crees dans le kanban avec status TODO.
