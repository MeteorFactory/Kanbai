# Frontend Structure

Guide for reorganizing the renderer process from a flat component folder to feature-based architecture.

## Current State

```
renderer/
├── components/          # 80+ files flat (except claude-settings/)
├── hooks/               # 1 shared hook
├── lib/stores/          # 12 Zustand stores
├── lib/i18n/            # French + English
├── styles/              # 8 CSS files
└── types/
```

**Problem:** Finding all files related to a feature (e.g., database) requires looking in 3+ different directories. Stores are separated from the components that use them. CSS is separated from the components it styles.

## Proposed Structure

```
renderer/
├── features/
│   ├── terminal/
│   │   ├── Terminal.tsx
│   │   ├── TerminalArea.tsx
│   │   ├── TabBar.tsx
│   │   ├── SplitContainer.tsx
│   │   ├── terminalTabStore.ts
│   │   ├── terminal.css
│   │   └── index.ts
│   │
│   ├── git/
│   │   ├── GitPanel.tsx
│   │   ├── FileDiffViewer.tsx
│   │   ├── git.css
│   │   └── index.ts
│   │
│   ├── kanban/
│   │   ├── KanbanBoard.tsx
│   │   ├── kanbanStore.ts
│   │   ├── kanban.css
│   │   └── index.ts
│   │
│   ├── database/
│   │   ├── DatabaseExplorer.tsx
│   │   ├── DatabaseSidebar.tsx
│   │   ├── DatabaseQueryArea.tsx
│   │   ├── DatabaseResultsTable.tsx
│   │   ├── DatabaseTabBar.tsx
│   │   ├── DatabaseConnectionModal.tsx
│   │   ├── DatabaseNLChat.tsx
│   │   ├── databaseStore.ts
│   │   ├── databaseTabStore.ts
│   │   └── index.ts
│   │
│   ├── claude/
│   │   ├── ClaudeSessionPanel.tsx
│   │   ├── ClaudeInfoPanel.tsx
│   │   ├── ClaudeDefaultsLibrary.tsx
│   │   ├── AutoClauder.tsx
│   │   ├── MultiAgentView.tsx
│   │   ├── claudeStore.ts
│   │   ├── settings/
│   │   │   ├── ClaudeSettingsPanel.tsx
│   │   │   ├── GeneralTab.tsx
│   │   │   ├── PermissionsTab.tsx
│   │   │   ├── ModelConfigTab.tsx
│   │   │   ├── ModelPerformanceTab.tsx
│   │   │   ├── SecuritySandboxTab.tsx
│   │   │   ├── IntegrationsTab.tsx
│   │   │   ├── WorkflowTab.tsx
│   │   │   ├── MemoryTab.tsx
│   │   │   ├── AgentsSkillsTab.tsx
│   │   │   ├── ClaudeMdTab.tsx
│   │   │   ├── RulesManager.tsx
│   │   │   ├── rules/
│   │   │   │   ├── RulesSidebar.tsx
│   │   │   │   ├── RuleTreeView.tsx
│   │   │   │   ├── RuleTreeItem.tsx
│   │   │   │   ├── RuleContextMenu.tsx
│   │   │   │   ├── RuleAuthorBadge.tsx
│   │   │   │   ├── TemplateSection.tsx
│   │   │   │   ├── treeUtils.ts
│   │   │   │   └── useRulesDragDrop.ts
│   │   │   ├── [remaining settings components]
│   │   │   └── index.ts
│   │   ├── claude.css
│   │   └── index.ts
│   │
│   ├── packages/
│   │   ├── PackagesPanel.tsx
│   │   ├── PackagesSidebar.tsx
│   │   ├── PackagesContent.tsx
│   │   ├── PackagesChat.tsx
│   │   ├── NpmPanel.tsx
│   │   ├── packagesStore.ts
│   │   └── index.ts
│   │
│   ├── api-tester/
│   │   ├── ApiTesterPanel.tsx
│   │   └── index.ts
│   │
│   ├── analysis/
│   │   ├── CodeAnalysisPanel.tsx
│   │   ├── TodoScanner.tsx
│   │   ├── ProjectStats.tsx
│   │   ├── analysis.css
│   │   └── index.ts
│   │
│   ├── healthcheck/
│   │   ├── HealthCheckPanel.tsx
│   │   ├── healthCheckStore.ts
│   │   └── index.ts
│   │
│   ├── workspace/
│   │   ├── Sidebar.tsx
│   │   ├── SidebarFileTree.tsx
│   │   ├── WorkspaceItem.tsx
│   │   ├── ProjectItem.tsx
│   │   ├── ProjectToolbar.tsx
│   │   ├── FileExplorer.tsx
│   │   ├── FileViewer.tsx
│   │   ├── GlobalSearch.tsx
│   │   ├── workspaceStore.ts
│   │   ├── fileexplorer.css
│   │   └── index.ts
│   │
│   ├── settings/
│   │   ├── SettingsPanel.tsx
│   │   ├── ShortcutsPanel.tsx
│   │   ├── UpdateCenter.tsx
│   │   └── index.ts
│   │
│   └── mcp/
│       ├── McpPanel.tsx
│       └── index.ts
│
├── components/ui/
│   ├── ResizeDivider.tsx
│   ├── ConfirmModal.tsx
│   ├── ContextMenu.tsx
│   ├── CommandPalette.tsx
│   ├── ErrorBoundary.tsx
│   ├── CopyableError.tsx
│   ├── ToastContainer.tsx
│   ├── NotificationCenter.tsx
│   ├── SessionModal.tsx
│   ├── TutorialModal.tsx
│   ├── AppUpdateModal.tsx
│   └── PromptTemplates.tsx
│
├── layout/
│   ├── TitleBar.tsx
│   └── App.tsx
│
├── hooks/
│   └── useBackgroundKanbanSync.ts
│
├── lib/
│   ├── i18n/
│   │   ├── en.ts
│   │   ├── fr.ts
│   │   └── index.ts
│   ├── stores/
│   │   ├── viewStore.ts
│   │   ├── notificationStore.ts
│   │   ├── updateStore.ts
│   │   └── appUpdateStore.ts
│   └── monacoSetup.ts
│
├── styles/
│   ├── global.css
│   └── multiagent.css
│
├── types/
│   └── global.d.ts
└── main.tsx
```

## Directory Roles

| Directory | Contains | Rule |
|-----------|----------|------|
| `features/X/` | Components + store + CSS + hooks for feature X | Everything about X lives here |
| `components/ui/` | Components reused by 2+ features | Generic, no business logic |
| `layout/` | App shell (titlebar, root layout) | No business logic |
| `hooks/` | Hooks shared across 3+ features | Feature-specific hooks stay in their feature |
| `lib/stores/` | Cross-cutting stores only | Feature stores move to their feature directory |
| `lib/i18n/` | Internationalization | Shared by all features |
| `styles/` | Global styles only | Feature-specific CSS moves to its feature |

## Key Principle: Stores Follow Features

A store belongs to the feature that owns it. Only stores used by 3+ features stay in `lib/stores/`.

| Store | Location | Reason |
|-------|----------|--------|
| `terminalTabStore.ts` | `features/terminal/` | Only used by terminal components |
| `kanbanStore.ts` | `features/kanban/` | Only used by kanban components |
| `databaseStore.ts` | `features/database/` | Only used by database components |
| `databaseTabStore.ts` | `features/database/` | Only used by database components |
| `claudeStore.ts` | `features/claude/` | Only used by claude components |
| `healthCheckStore.ts` | `features/healthcheck/` | Only used by healthcheck components |
| `packagesStore.ts` | `features/packages/` | Only used by packages components |
| `workspaceStore.ts` | `features/workspace/` | Only used by workspace components |
| `viewStore.ts` | `lib/stores/` | Used by App, Sidebar, multiple features |
| `notificationStore.ts` | `lib/stores/` | Used by many features for toasts |
| `updateStore.ts` | `lib/stores/` | Used by settings + notification center |
| `appUpdateStore.ts` | `lib/stores/` | Used by titlebar + settings + modal |

## Feature File Map

Complete mapping of current files to their new locations.

### features/terminal/

| Current | New |
|---------|-----|
| `components/Terminal.tsx` | `features/terminal/Terminal.tsx` |
| `components/TerminalArea.tsx` | `features/terminal/TerminalArea.tsx` |
| `components/TabBar.tsx` | `features/terminal/TabBar.tsx` |
| `components/SplitContainer.tsx` | `features/terminal/SplitContainer.tsx` |
| `lib/stores/terminalTabStore.ts` | `features/terminal/terminalTabStore.ts` |
| `styles/terminal.css` | `features/terminal/terminal.css` |

### features/git/

| Current | New |
|---------|-----|
| `components/GitPanel.tsx` | `features/git/GitPanel.tsx` |
| `components/FileDiffViewer.tsx` | `features/git/FileDiffViewer.tsx` |
| `styles/git.css` | `features/git/git.css` |

### features/kanban/

| Current | New |
|---------|-----|
| `components/KanbanBoard.tsx` | `features/kanban/KanbanBoard.tsx` |
| `lib/stores/kanbanStore.ts` | `features/kanban/kanbanStore.ts` |
| `styles/kanban.css` | `features/kanban/kanban.css` |

### features/database/

| Current | New |
|---------|-----|
| `components/DatabaseExplorer.tsx` | `features/database/DatabaseExplorer.tsx` |
| `components/DatabaseSidebar.tsx` | `features/database/DatabaseSidebar.tsx` |
| `components/DatabaseQueryArea.tsx` | `features/database/DatabaseQueryArea.tsx` |
| `components/DatabaseResultsTable.tsx` | `features/database/DatabaseResultsTable.tsx` |
| `components/DatabaseTabBar.tsx` | `features/database/DatabaseTabBar.tsx` |
| `components/DatabaseConnectionModal.tsx` | `features/database/DatabaseConnectionModal.tsx` |
| `components/DatabaseNLChat.tsx` | `features/database/DatabaseNLChat.tsx` |
| `lib/stores/databaseStore.ts` | `features/database/databaseStore.ts` |
| `lib/stores/databaseTabStore.ts` | `features/database/databaseTabStore.ts` |

### features/claude/

| Current | New |
|---------|-----|
| `components/ClaudeSessionPanel.tsx` | `features/claude/ClaudeSessionPanel.tsx` |
| `components/ClaudeInfoPanel.tsx` | `features/claude/ClaudeInfoPanel.tsx` |
| `components/ClaudeDefaultsLibrary.tsx` | `features/claude/ClaudeDefaultsLibrary.tsx` |
| `components/AutoClauder.tsx` | `features/claude/AutoClauder.tsx` |
| `components/MultiAgentView.tsx` | `features/claude/MultiAgentView.tsx` |
| `lib/stores/claudeStore.ts` | `features/claude/claudeStore.ts` |
| `components/claude-settings/*` | `features/claude/settings/*` |
| `styles/claude.css` | `features/claude/claude.css` |
| `styles/multiagent.css` | `features/claude/multiagent.css` |

### features/packages/

| Current | New |
|---------|-----|
| `components/PackagesPanel.tsx` | `features/packages/PackagesPanel.tsx` |
| `components/PackagesSidebar.tsx` | `features/packages/PackagesSidebar.tsx` |
| `components/PackagesContent.tsx` | `features/packages/PackagesContent.tsx` |
| `components/PackagesChat.tsx` | `features/packages/PackagesChat.tsx` |
| `components/NpmPanel.tsx` | `features/packages/NpmPanel.tsx` |
| `lib/stores/packagesStore.ts` | `features/packages/packagesStore.ts` |

### features/api-tester/

| Current | New |
|---------|-----|
| `components/ApiTesterPanel.tsx` | `features/api-tester/ApiTesterPanel.tsx` |

### features/analysis/

| Current | New |
|---------|-----|
| `components/CodeAnalysisPanel.tsx` | `features/analysis/CodeAnalysisPanel.tsx` |
| `components/TodoScanner.tsx` | `features/analysis/TodoScanner.tsx` |
| `components/ProjectStats.tsx` | `features/analysis/ProjectStats.tsx` |
| `styles/analysis.css` | `features/analysis/analysis.css` |

### features/healthcheck/

| Current | New |
|---------|-----|
| `components/HealthCheckPanel.tsx` | `features/healthcheck/HealthCheckPanel.tsx` |
| `lib/stores/healthCheckStore.ts` | `features/healthcheck/healthCheckStore.ts` |

### features/workspace/

| Current | New |
|---------|-----|
| `components/Sidebar.tsx` | `features/workspace/Sidebar.tsx` |
| `components/SidebarFileTree.tsx` | `features/workspace/SidebarFileTree.tsx` |
| `components/WorkspaceItem.tsx` | `features/workspace/WorkspaceItem.tsx` |
| `components/ProjectItem.tsx` | `features/workspace/ProjectItem.tsx` |
| `components/ProjectToolbar.tsx` | `features/workspace/ProjectToolbar.tsx` |
| `components/FileExplorer.tsx` | `features/workspace/FileExplorer.tsx` |
| `components/FileViewer.tsx` | `features/workspace/FileViewer.tsx` |
| `components/GlobalSearch.tsx` | `features/workspace/GlobalSearch.tsx` |
| `lib/stores/workspaceStore.ts` | `features/workspace/workspaceStore.ts` |
| `styles/fileexplorer.css` | `features/workspace/fileexplorer.css` |

### features/settings/

| Current | New |
|---------|-----|
| `components/SettingsPanel.tsx` | `features/settings/SettingsPanel.tsx` |
| `components/ShortcutsPanel.tsx` | `features/settings/ShortcutsPanel.tsx` |
| `components/UpdateCenter.tsx` | `features/settings/UpdateCenter.tsx` |

### features/mcp/

| Current | New |
|---------|-----|
| `components/McpPanel.tsx` | `features/mcp/McpPanel.tsx` |

### components/ui/ (shared)

| Current | New |
|---------|-----|
| `components/ResizeDivider.tsx` | `components/ui/ResizeDivider.tsx` |
| `components/ConfirmModal.tsx` | `components/ui/ConfirmModal.tsx` |
| `components/ContextMenu.tsx` | `components/ui/ContextMenu.tsx` |
| `components/CommandPalette.tsx` | `components/ui/CommandPalette.tsx` |
| `components/ErrorBoundary.tsx` | `components/ui/ErrorBoundary.tsx` |
| `components/CopyableError.tsx` | `components/ui/CopyableError.tsx` |
| `components/ToastContainer.tsx` | `components/ui/ToastContainer.tsx` |
| `components/NotificationCenter.tsx` | `components/ui/NotificationCenter.tsx` |
| `components/SessionModal.tsx` | `components/ui/SessionModal.tsx` |
| `components/TutorialModal.tsx` | `components/ui/TutorialModal.tsx` |
| `components/AppUpdateModal.tsx` | `components/ui/AppUpdateModal.tsx` |
| `components/PromptTemplates.tsx` | `components/ui/PromptTemplates.tsx` |

### layout/

| Current | New |
|---------|-----|
| `components/TitleBar.tsx` | `layout/TitleBar.tsx` |
| `App.tsx` | `layout/App.tsx` |

## Import Changes

```typescript
// Before
import { DatabaseExplorer } from './components/DatabaseExplorer'
import { useDatabaseStore } from './lib/stores/databaseStore'
import { GitPanel } from './components/GitPanel'

// After
import { DatabaseExplorer } from './features/database'
import { useDatabaseStore } from './features/database/databaseStore'
import { GitPanel } from './features/git'
```

## Barrel Exports (index.ts)

Each feature gets one `index.ts` that re-exports its public API:

```typescript
// features/database/index.ts
export { DatabaseExplorer } from './DatabaseExplorer'
export { DatabaseConnectionModal } from './DatabaseConnectionModal'
```

Only export components that other features import. Internal components stay unexported.

## Migration Strategy

### Option A: Progressive (recommended)

Migrate one feature at a time. Both structures coexist during migration.

**Order by independence (least cross-feature imports first):**

1. `healthcheck/` — self-contained, 2 files
2. `api-tester/` — self-contained, 1 file
3. `mcp/` — self-contained, 1 file
4. `analysis/` — self-contained, 3 files + CSS
5. `packages/` — self-contained, 5 files + store
6. `database/` — self-contained, 9 files + 2 stores
7. `kanban/` — self-contained, 1 file + store + CSS
8. `git/` — 2 files + CSS
9. `terminal/` — 4 files + store + CSS
10. `claude/` — largest, 5 files + store + settings/ (already organized)
11. `workspace/` — most cross-references, 8 files + store + CSS
12. `settings/` — depends on workspace store
13. Remaining → `components/ui/` and `layout/`

**Per-feature migration steps:**

1. Create the feature directory
2. Move files
3. Update imports in moved files
4. Update imports in files that reference moved files
5. Run `npm run typecheck` — fix any broken imports
6. Run `npm run test` — verify nothing broke
7. Commit: `refactor(renderer): move [feature] to features/`

### Option B: Big Bang

Move everything at once in one commit. Faster but riskier — if something breaks, harder to isolate.

Only recommended if the codebase has good test coverage on the renderer side (currently it does not — tests focus on main process).

## What NOT To Do

- **No folder-per-component** (`Button/Button.tsx` + `Button/index.ts`) — unnecessary for this project size
- **No `containers/` vs `presentational/`** — outdated pattern superseded by hooks
- **No barrel exports in every subdirectory** — one `index.ts` per feature is enough
- **No `common/` or `shared/` folder** — `components/ui/` is the shared layer
- **No `pages/` directory** — the app is tab-based, not page-based
