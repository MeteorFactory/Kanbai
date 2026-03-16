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
│   ├── terminal/                # F-38
│   │   ├── index.ts
│   │   ├── terminal.tsx
│   │   ├── terminal-area.tsx
│   │   ├── terminal-store.ts
│   │   ├── use-terminal.ts
│   │   └── terminal.css
│   ├── workspace/               # F-39
│   │   ├── index.ts
│   │   ├── sidebar.tsx
│   │   ├── workspace-item.tsx
│   │   ├── workspace-store.ts
│   │   ├── use-workspace.ts
│   │   └── features/
│   │       ├── namespace/       # Gestion namespaces, git profiles
│   │       ├── project/         # ProjectItem, Stats, Toolbar
│   │       └── session/         # Save/load/clear, tab persistence
│   ├── claude/                  # F-40
│   │   ├── index.ts
│   │   ├── claude-session-panel.tsx
│   │   ├── claude-info-panel.tsx
│   │   ├── auto-clauder.tsx
│   │   ├── claude-store.ts
│   │   ├── use-claude.ts
│   │   ├── claude.css
│   │   └── features/
│   │       ├── settings/        # F-41 (65+ composants)
│   │       │   └── features/
│   │       │       ├── model/
│   │       │       ├── security/
│   │       │       └── memory/
│   │       ├── agents/          # F-42 (8 composants)
│   │       │   └── features/skills/
│   │       ├── rules/           # F-43 (11 composants + hooks + utils)
│   │       └── ai-providers/    # F-44
│   │           └── features/
│   │               ├── codex/
│   │               ├── copilot/
│   │               └── gemini/
│   ├── kanban/                  # F-45
│   │   ├── index.ts
│   │   ├── kanban-board.tsx
│   │   ├── kanban-store.ts
│   │   ├── use-kanban.ts
│   │   ├── use-background-kanban-sync.ts
│   │   ├── kanban.css
│   │   └── features/
│   │       ├── attachments/
│   │       ├── config/
│   │       └── comments/
│   ├── git/                     # F-46
│   │   ├── index.ts
│   │   ├── git-panel.tsx
│   │   ├── file-diff-viewer.tsx
│   │   ├── use-git.ts
│   │   └── git.css
│   ├── database/                # F-47
│   │   ├── index.ts
│   │   ├── database-explorer.tsx
│   │   ├── database-store.ts
│   │   ├── database-tab-store.ts
│   │   ├── use-database.ts
│   │   └── features/
│   │       ├── query/           # QueryArea, ResultsTable, TabBar
│   │       ├── nl-chat/         # NL queries, SQL generation
│   │       ├── connection/      # ConnectionModal, Sidebar
│   │       ├── backup/          # Backup, restore, transfer
│   │       └── schema/          # Tables, views, columns, indexes
│   ├── devops/                  # F-48
│   ├── packages/                # F-49
│   ├── healthcheck/             # F-50
│   ├── api-tester/              # F-51
│   ├── files/                   # F-52
│   ├── notes/                   # F-53
│   ├── code-analysis/           # F-54
│   │   └── features/
│   │       ├── reports/
│   │       └── tools/
│   ├── mcp/                     # F-59
│   ├── pixel-agents/            # F-60
│   ├── companion/               # F-61
│   ├── multi-agent/             # F-62
│   ├── ssh/                     # F-63
│   ├── notifications/           # F-64
│   │   ├── notification-center.tsx
│   │   ├── toast-container.tsx
│   │   └── notification-store.ts
│   ├── prompts/                 # F-65
│   ├── search/                  # F-66
│   │   ├── global-search.tsx
│   │   └── todo-scanner.tsx
│   ├── skills-store/            # F-67
│   ├── command-palette/         # F-68
│   │   ├── command-palette.tsx
│   │   └── shortcuts-panel.tsx
│   ├── settings/                # F-56
│   └── updates/                 # F-56
├── shared/                      # F-57
│   ├── ui/
│   │   ├── confirm-modal.tsx
│   │   ├── error-boundary.tsx
│   │   ├── copyable-error.tsx
│   │   ├── context-menu.tsx
│   │   ├── tutorial-modal.tsx
│   │   └── session-modal.tsx
│   ├── layout/
│   │   ├── title-bar.tsx
│   │   ├── resize-divider.tsx
│   │   └── split-container.tsx
│   └── stores/
│       └── view-store.ts
├── lib/
│   └── i18n/
└── styles/
    └── global.css
```

## Inventaire complet des features (30 tickets)

### Features principales

| # | Feature | Ticket | Composants | Store(s) | Sous-features |
|---|---------|--------|------------|----------|---------------|
| 1 | Terminal | F-38 | 3 | terminalTabStore | Split panes, zoom, sessions |
| 2 | Workspace & Project | F-39 | 5 | workspaceStore | Namespace, Project, Session |
| 3 | Claude Core | F-40 | 5 | claudeStore | Provider selection, defaults |
| 4 | Claude Settings | F-41 | 65+ | — | Model, Security, Memory |
| 5 | Claude Agents | F-42 | 8 | — | Skills |
| 6 | Claude Rules | F-43 | 11+hooks | — | DnD, tree, templates |
| 7 | AI Providers | F-44 | 17+ | — | Codex, Copilot, Gemini |
| 8 | Kanban Board | F-45 | 1 | kanbanStore | Attachments, Config, Comments |
| 9 | Git | F-46 | 2 | — | Diff, blame, worktrees |
| 10 | Database Explorer | F-47 | 7 | 2 stores | Query, NL-Chat, Connection, Backup, Schema |
| 11 | DevOps | F-48 | 1 | devopsStore | Pipelines, approvals |
| 12 | Packages | F-49 | 5 | packagesStore | NL queries, multi-tech |
| 13 | Health Check | F-50 | 1 | healthCheckStore | Scheduling, incidents |
| 14 | API Tester | F-51 | 1 | — | Collections, chains, assertions |
| 15 | File Explorer | F-52 | 3 | — | Bookmarks, icons |
| 16 | Notes | F-53 | 1 | notesStore | Markdown, workspace-scoped |
| 17 | Code Analysis | F-54 | 1 | — | Reports, Tools detection |
| 18 | Settings & Updates | F-56 | 3 | 2 stores | Theme, locale, auto-update |
| 19 | Shared UI | F-57 | 6+ | viewStore | Modals, layout, error boundary |
| 20 | Finalisation | F-58 | — | — | Imports, barrel exports, build |

### Features ajoutees (v2)

| # | Feature | Ticket | Composants | Store | Raison |
|---|---------|--------|------------|-------|--------|
| 21 | MCP | F-59 | 1 | — | Catalogue serveurs, tools |
| 22 | Pixel Agents | F-60 | 1 | — | Editeur noeuds visuels, layout |
| 23 | Companion | F-61 | 1 | companionStore | Pairing, sync, chiffrement |
| 24 | Multi-Agent | F-62 | 1 | — | Orchestration agents |
| 25 | SSH | F-63 | 0 (IPC) | — | Cles Ed25519/RSA |
| 26 | Notifications | F-64 | 2 | notificationStore | Inbox, toasts, tab-scoped |
| 27 | Prompt Templates | F-65 | 1 | — | Bibliotheque, categories |
| 28 | Search & Todos | F-66 | 2 | — | Full-text, TODO scanner |
| 29 | Skills Store | F-67 | 1 | — | Marketplace, installation |
| 30 | Command Palette | F-68 | 2 | — | Fuzzy search, shortcuts |

## Ordre d'execution recommande

### Phase 1 — Infrastructure
1. **F-57** (Shared UI) — creer d'abord l'infrastructure partagee

### Phase 2 — Features simples (1-2 composants, pas de sous-features)
F-50, F-51, F-53, F-48, F-59, F-62, F-63, F-65

### Phase 3 — Features moyennes (2-5 composants ou 1 store)
F-38, F-45, F-46, F-52, F-56, F-60, F-61, F-64, F-66, F-67, F-68

### Phase 4 — Features complexes (5+ composants, sous-features)
F-39, F-40, F-47, F-49, F-54

### Phase 5 — Claude ecosystem (massif, 65+ composants)
F-41, F-42, F-43, F-44

### Phase 6 — Finalisation
**F-58** — toujours en dernier (imports, barrel exports, build verification)

## Statistiques

- **30 sous-tickets** de refactoring (F-38 a F-68, sauf F-55 supprime)
- **~130 composants** a migrer
- **15 stores** a reloger
- **10 fichiers CSS** a coloquer
- **33 domaines fonctionnels** identifies
