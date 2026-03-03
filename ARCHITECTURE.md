# Kanbai - Architecture Globale

## 1. Vue d'ensemble

**Kanbai** est un terminal macOS enrichi par l'IA, construit avec Electron. Il combine un émulateur de terminal complet (xterm.js + node-pty), une gestion de workspaces/projets, l'intégration native de Claude Code, et un tableau Kanban avec assignation d'agents IA.

### Principes directeurs

- **Séparation stricte** Main Process / Renderer via IPC sécurisé
- **Context Isolation** obligatoire, nodeIntegration désactivé
- **Architecture plate** dans le renderer (composants dans `src/renderer/components/`, stores dans `src/renderer/lib/stores/`)
- **État centralisé** avec Zustand (léger, TypeScript-first, pas de boilerplate Redux)
- **Persistance locale** via fichier JSON (`~/.kanbai/data.json`) gere par `StorageService`

---

## 2. Architecture des composants

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS                          │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐         │
│  │ App      │  │ Window   │  │ IPC           │         │
│  │ Lifecycle│  │ Manager  │  │ Router        │         │
│  └──────────┘  └──────────┘  └───────┬───────┘         │
│                                       │                  │
│  ┌──────────┐  ┌──────────┐  ┌───────┴───────┐         │
│  │ PTY      │  │ Claude   │  │ Workspace     │         │
│  │ Service  │  │ Session  │  │ Service       │         │
│  │ (node-pty)│ │ Manager  │  │               │         │
│  └──────────┘  └──────────┘  └───────────────┘         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐         │
│  │ Update   │  │ Kanban   │  │ AutoClauder   │         │
│  │ Checker  │  │ Service  │  │ Service       │         │
│  └──────────┘  └──────────┘  └───────────────┘         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐         │
│  │ Git      │  │ FileSystem│ │ Workspace Env │         │
│  │ Service  │  │ Service  │  │ Service       │         │
│  └──────────┘  └──────────┘  └───────────────┘         │
│                                                          │
│  ┌──────────────────────────────────────────┐           │
│  │ StorageService (JSON: ~/.kanbai/data.json)│           │
│  └──────────────────────────────────────────┘           │
│                                                          │
├──────────────── contextBridge / preload ─────────────────┤
│                                                          │
│                   RENDERER PROCESS                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  React App (Zustand state management)             │   │
│  │                                                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐  │   │
│  │  │ Terminal   │ │ Sidebar    │ │ KanbanBoard  │  │   │
│  │  │ Area       │ │ Workspace  │ │              │  │   │
│  │  │ - TabBar   │ │ - Items    │ │              │  │   │
│  │  │ - Splits   │ │ - Projects │ │              │  │   │
│  │  │ - xterm.js │ │ - Claude   │ │              │  │   │
│  │  └────────────┘ │   detect   │ └──────────────┘  │   │
│  │                  └────────────┘                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐  │   │
│  │  │ Claude     │ │ GitPanel   │ │ FileExplorer │  │   │
│  │  │ Sessions   │ │ + Diff     │ │ + FileViewer │  │   │
│  │  │ Panel      │ │ Viewer     │ │ + Monaco     │  │   │
│  │  └────────────┘ └────────────┘ └──────────────┘  │   │
│  │                                                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐  │   │
│  │  │ Settings   │ │ AutoClauder│ │ Notification │  │   │
│  │  │ Panel      │ │            │ │ Center       │  │   │
│  │  └────────────┘ └────────────┘ └──────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.1 Main Process - Responsabilites

| Service / Handler IPC | Responsabilite |
|---------|---------------|
| **AppLifecycle** (`src/main/index.ts`) | Gestion du cycle de vie Electron (ready, activate, quit, window-all-closed) |
| **StorageService** (`src/main/services/storage.ts`) | Persistance JSON (`~/.kanbai/data.json`), singleton, CRUD workspaces/projects/kanban/settings/templates/sessions |
| **terminal.ts** (IPC handler) | Creation et gestion des pseudo-terminaux via node-pty |
| **claude.ts** (IPC handler) | Lancement/arret des processus Claude Code (child_process) |
| **workspace.ts** (IPC handler) | CRUD workspaces via StorageService |
| **project.ts** (IPC handler) | Gestion projets, scan .claude, scan info (Makefile, git), deploiement CLAUDE.md |
| **kanban.ts** (IPC handler) | CRUD des taches Kanban, persistance via fichier JSON par projet (`.workspaces/kanban.json`) |
| **git.ts** (IPC handler) | Operations Git completes (status, log, branches, commit, push, pull, stash, merge, diff...) |
| **filesystem.ts** (IPC handler) | Operations fichiers (readDir, readFile, writeFile, rename, delete, copy, mkdir, exists) |
| **updates.ts** (IPC handler) | Verification des mises a jour (Node, npm, Claude Code, app) |
| **session.ts** (IPC handler) | Sauvegarde/restauration de session (tabs, workspace actif) |
| **workspaceEnv.ts** (IPC handler) | Environnement virtuel workspace (symlinks vers projets) |
| **app.ts** (IPC handler) | Settings applicatifs, notifications |

### 2.2 Renderer Process - Composants

Tous les composants sont dans `src/renderer/components/` (architecture plate, pas de feature modules).

| Composant | Description |
|-----------|-------------|
| **TerminalArea** + **Terminal** + **TabBar** + **SplitContainer** | Onglets, splits (jusqu'a 4), xterm.js, liaison avec PTY backend |
| **Sidebar** + **WorkspaceItem** + **ProjectItem** + **SidebarFileTree** | Sidebar de navigation, liste workspaces/projets, arbre de fichiers |
| **KanbanBoard** | Tableau Kanban par projet (TODO/WORKING/PENDING/DONE/FAILED) |
| **ClaudeSessionPanel** + **ClaudeInfoPanel** + **ClaudeRulesPanel** | Gestion des sessions Claude Code, infos et regles |
| **MultiAgentView** | Vue multi-agents Claude (jusqu'a 4 par projet) |
| **GitPanel** + **FileDiffViewer** | Interface Git complete (status, branches, commits, diff) |
| **FileExplorer** + **FileViewer** | Explorateur de fichiers et editeur Monaco |
| **NpmPanel** | Gestion des dependances npm |
| **SettingsPanel** | Preferences utilisateur |
| **AutoClauder** | Configuration Auto-Clauder (templates) |
| **NotificationCenter** | Notifications et mises a jour |
| **TitleBar** | Barre de titre macOS personnalisee |
| **ProjectToolbar** | Barre d'outils projet (actions rapides) |
| **ContextMenu** + **ConfirmModal** + **SessionModal** | Composants utilitaires (menus, modales) |
| **ErrorBoundary** | Gestion des erreurs React |

---

## 3. Design des canaux IPC

### 3.1 Convention de nommage

Format: `{domain}:{action}` avec reponse `{domain}:{action}:result`

### 3.2 Canaux par domaine

Les noms de canaux sont definis dans `IPC_CHANNELS` (`src/shared/types/index.ts`).

#### Terminal

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `terminal:create` | Renderer → Main | invoke | Cree un nouveau PTY, retourne `{ id }` |
| `terminal:input` | Renderer → Main | send | Ecrit dans le PTY `{ id, data }` |
| `terminal:resize` | Renderer → Main | send | Redimensionne le PTY `{ id, cols, rows }` |
| `terminal:close` | Renderer → Main | invoke | Ferme le PTY `{ id }` |
| `terminal:data` | Main → Renderer | event | Donnees de sortie du PTY (stream) `{ id, data }` |

#### Workspace

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `workspace:list` | Renderer → Main | invoke | Liste tous les workspaces |
| `workspace:create` | Renderer → Main | invoke | Cree un workspace `{ name, color? }` |
| `workspace:update` | Renderer → Main | invoke | Met a jour un workspace `{ id, ...partial }` |
| `workspace:delete` | Renderer → Main | invoke | Supprime un workspace `{ id }` |
| `workspace:initDir` | Renderer → Main | invoke | Initialise le repertoire `.workspaces` d'un projet |
| `workspace:envSetup` | Renderer → Main | invoke | Cree un environnement virtuel (symlinks) |
| `workspace:envPath` | Renderer → Main | invoke | Retourne le chemin de l'env virtuel |
| `workspace:envDelete` | Renderer → Main | invoke | Supprime l'env virtuel |

#### Project

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `project:list` | Renderer → Main | invoke | Liste tous les projets |
| `project:add` | Renderer → Main | invoke | Ajoute un projet `{ workspaceId, path }` |
| `project:remove` | Renderer → Main | invoke | Supprime un projet `{ id }` |
| `project:selectDir` | Renderer → Main | invoke | Ouvre le dialog natif pour selectionner un dossier |
| `project:scanClaude` | Renderer → Main | invoke | Scanne la presence de .claude dans un projet |
| `project:scanInfo` | Renderer → Main | invoke | Scanne les infos projet (Makefile, git) |
| `project:checkClaude` | Renderer → Main | invoke | Verifie la config Claude d'un projet |
| `project:deployClaude` | Renderer → Main | invoke | Deploie CLAUDE.md dans un projet |
| `project:checkPackages` | Renderer → Main | invoke | Verifie les packages npm |
| `project:updatePackage` | Renderer → Main | invoke | Met a jour un package npm |
| `project:writeClaudeSettings` | Renderer → Main | invoke | Ecrit les settings Claude d'un projet |
| `project:writeClaudeMd` | Renderer → Main | invoke | Ecrit le CLAUDE.md d'un projet |

#### Claude Sessions

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `claude:start` | Renderer → Main | invoke | Lance une session Claude `{ projectId, prompt?, loopMode? }` |
| `claude:stop` | Renderer → Main | invoke | Arrete une session `{ id }` |
| `claude:status` | Main → Renderer | event | Changement de statut `{ id, status }` |
| `claude:sessionEnd` | Main → Renderer | event | Notification de fin de session `{ id, status }` |

#### Kanban

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `kanban:list` | Renderer → Main | invoke | Liste taches d'un projet `{ projectPath }` |
| `kanban:create` | Renderer → Main | invoke | Cree une tache (KanbanTask + `{ projectPath }`) |
| `kanban:update` | Renderer → Main | invoke | Met a jour une tache `{ id, projectPath, ...partial }` |
| `kanban:delete` | Renderer → Main | invoke | Supprime une tache `{ id, projectPath }` |
| `kanban:writePrompt` | Renderer → Main | invoke | Ecrit le prompt Claude et configure le hook kanban-done.sh |
| `kanban:cleanupPrompt` | Renderer → Main | invoke | Supprime le fichier prompt temporaire |

#### File System

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `fs:readDir` | Renderer → Main | invoke | Liste le contenu d'un repertoire |
| `fs:readFile` | Renderer → Main | invoke | Lit le contenu d'un fichier |
| `fs:writeFile` | Renderer → Main | invoke | Ecrit dans un fichier |
| `fs:rename` | Renderer → Main | invoke | Renomme un fichier/dossier |
| `fs:delete` | Renderer → Main | invoke | Supprime un fichier/dossier |
| `fs:copy` | Renderer → Main | invoke | Copie un fichier/dossier |
| `fs:mkdir` | Renderer → Main | invoke | Cree un repertoire |
| `fs:exists` | Renderer → Main | invoke | Verifie l'existence d'un fichier |
| `fs:readBase64` | Renderer → Main | invoke | Lit un fichier en base64 (images, binaires) |

#### Git

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `git:init` | Renderer → Main | invoke | Initialise un depot git |
| `git:status` | Renderer → Main | invoke | Status du depot |
| `git:log` | Renderer → Main | invoke | Historique des commits |
| `git:branches` | Renderer → Main | invoke | Liste des branches |
| `git:checkout` | Renderer → Main | invoke | Change de branche |
| `git:push` | Renderer → Main | invoke | Push vers remote |
| `git:pull` | Renderer → Main | invoke | Pull depuis remote |
| `git:commit` | Renderer → Main | invoke | Cree un commit `{ cwd, message, files }` |
| `git:diff` | Renderer → Main | invoke | Diff d'un fichier ou global |
| `git:stash` / `git:stashPop` / `git:stashList` | Renderer → Main | invoke | Operations stash |
| `git:createBranch` / `git:deleteBranch` / `git:renameBranch` | Renderer → Main | invoke | Gestion des branches |
| `git:merge` | Renderer → Main | invoke | Merge d'une branche |
| `git:fetch` | Renderer → Main | invoke | Fetch depuis remote |
| `git:stage` / `git:unstage` / `git:discard` | Renderer → Main | invoke | Gestion du staging area |
| `git:show` | Renderer → Main | invoke | Details d'un commit |

#### Updates

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `update:check` | Renderer → Main | invoke | Lance une verification |
| `update:install` | Renderer → Main | invoke | Installe une mise a jour `{ tool, scope, projectId? }` |
| `update:status` | Main → Renderer | event | Notification de progression |

#### Auto-Clauder

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `autoclaude:apply` | Renderer → Main | invoke | Applique un template Claude a un projet |
| `autoclaude:templates` | Renderer → Main | invoke | Liste les templates Auto-Clauder |

#### Session

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `session:save` | Renderer → Main | invoke | Sauvegarde l'etat de la session |
| `session:load` | Renderer → Main | invoke | Restaure la session precedente |
| `session:clear` | Renderer → Main | invoke | Efface la session sauvegardee |

#### App

| Canal | Direction | Pattern | Description |
|-------|-----------|---------|-------------|
| `app:settingsGet` | Renderer → Main | invoke | Recupere les settings |
| `app:settingsSet` | Renderer → Main | invoke | Sauvegarde les settings |
| `app:notification` | Renderer → Main | send | Envoie une notification native |

---

## 4. Interfaces TypeScript (shared/)

Toutes les interfaces sont dans un fichier unique: `src/shared/types/index.ts`.

```typescript
// ===== Workspace & Project =====

export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  color: string;
  projectIds: string[];       // IDs des projets associes
  createdAt: number;          // Unix timestamp
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;               // Chemin absolu vers la racine du projet
  hasClaude: boolean;         // Presence du dossier .claude
  hasGit?: boolean;
  workspaceId: string;
  createdAt: number;
}

// ===== Terminal =====

export interface TerminalSession {
  id: string;
  projectId?: string;
  title: string;
  cwd: string;
  shell: string;
  pid?: number;
  isActive: boolean;
}

export interface TerminalTab {
  id: string;
  label: string;
  color?: string;
  panes: TerminalPane[];
  activePane: string;
}

export interface TerminalPane {
  id: string;
  sessionId: string;          // Lie a la session terminal backend
  splitDirection?: 'horizontal' | 'vertical';
  size: number;               // Pourcentage
}

// ===== Claude Sessions =====

export interface ClaudeSession {
  id: string;
  projectId: string;
  terminalId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: number;
  endedAt?: number;
  prompt?: string;
  loopMode: boolean;
  loopCount: number;          // Nombre de boucles effectuees
  loopDelay: number;          // Delai entre boucles (ms)
}

// ===== Kanban =====

export type KanbanStatus = 'TODO' | 'WORKING' | 'PENDING' | 'DONE' | 'FAILED';

export interface KanbanTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: KanbanStatus;       // Colonne du Kanban (pas "column")
  priority: 'low' | 'medium' | 'high' | 'critical';  // Enum, pas number
  agentId?: string;           // ID de l'agent Claude assigne
  question?: string;          // Question en attente (PENDING)
  result?: string;            // Resultat de la tache
  error?: string;             // Erreur eventuelle
  createdAt: number;
  updatedAt: number;
}

// ===== Updates =====

export interface UpdateInfo {
  tool: string;               // Nom de l'outil (pas "target")
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;   // Pas "hasUpdate"
  scope: 'global' | 'project' | 'unit';
  projectId?: string;
}

// ===== Auto-Clauder =====

export interface AutoClauderTemplate {
  id: string;
  name: string;
  description: string;
  claudeMd: string;           // Contenu template CLAUDE.md
  settings: Record<string, unknown>;
  createdAt: number;
}

// ===== Session (persistance etat UI) =====

export interface SessionTab {
  workspaceId: string;
  cwd: string;
  label: string;
  isSplit: boolean;
  leftCommand: string | null;
  rightCommand: string | null;
}

export interface SessionData {
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  tabs: SessionTab[];
  savedAt: number;
}

// ===== Settings =====

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  defaultShell: string;
  fontSize: number;
  fontFamily: string;
  scrollbackLines: number;
  claudeDetectionColor: string;
  autoClauderEnabled: boolean;
  defaultAutoClauderTemplateId?: string;
  notificationSound: boolean;
  checkUpdatesOnLaunch: boolean;
}

// ===== File System & Git =====

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  parents: string[];
  refs: string[];
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface ProjectInfo {
  hasMakefile: boolean;
  makeTargets: string[];
  hasGit: boolean;
  gitBranch: string | null;
}

export interface NpmPackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  isDeprecated: boolean;
  deprecationMessage?: string;
  updateAvailable: boolean;
  type: 'dependency' | 'devDependency';
}
```

### 4.2 Canaux IPC (constantes)

Les canaux IPC sont definis comme un objet `IPC_CHANNELS` dans le meme fichier, avec 70+ canaux couvrant les domaines: terminal, workspace, project, claude, kanban, fs, git, session, workspaceEnv, autoclaude, app.

---

## 5. Structure de fichiers detaillee

```
Workspaces/
├── CLAUDE.md                          # Instructions projet
├── ARCHITECTURE.md                    # Ce document
├── package.json
├── tsconfig.json                      # Config TS racine
├── tsconfig.main.json                 # Config TS main process
├── tsconfig.renderer.json             # Config TS renderer
├── vitest.config.ts                   # Config tests
├── eslint.config.mjs                  # ESLint config (flat config)
├── .prettierrc                        # Prettier config
├── vite.config.ts                     # Vite config (renderer + main via plugin)
│
├── src/
│   ├── main/                          # --- MAIN PROCESS ---
│   │   ├── index.ts                   # Entry point, app lifecycle, BrowserWindow
│   │   │
│   │   ├── ipc/                       # IPC handlers (1 fichier par domaine)
│   │   │   ├── terminal.ts            # Terminal/PTY handlers
│   │   │   ├── workspace.ts           # Workspace CRUD handlers
│   │   │   ├── project.ts            # Project management handlers
│   │   │   ├── claude.ts             # Claude session handlers
│   │   │   ├── kanban.ts             # Kanban CRUD handlers
│   │   │   ├── git.ts                # Git operations handlers (20+ canaux)
│   │   │   ├── filesystem.ts         # File system operations handlers
│   │   │   ├── updates.ts            # Update checker handlers
│   │   │   ├── session.ts            # Session save/load handlers
│   │   │   ├── workspaceEnv.ts       # Workspace env (symlinks) handlers
│   │   │   └── app.ts                # Settings & notifications handlers
│   │   │
│   │   └── services/
│   │       └── storage.ts            # StorageService (singleton, JSON file)
│   │
│   ├── preload/                       # --- PRELOAD SCRIPTS ---
│   │   └── index.ts                   # contextBridge: expose window.kanbai (API par domaine)
│   │
│   ├── renderer/                      # --- RENDERER PROCESS (React) ---
│   │   ├── main.tsx                   # React entry point
│   │   ├── App.tsx                    # Root component, layout
│   │   │
│   │   ├── components/                # Tous les composants (architecture plate)
│   │   │   ├── TerminalArea.tsx       # Zone terminaux principale
│   │   │   ├── Terminal.tsx           # Composant terminal (xterm.js)
│   │   │   ├── TabBar.tsx             # Barre d'onglets terminaux
│   │   │   ├── SplitContainer.tsx     # Container split (jusqu'a 4 panes)
│   │   │   ├── Sidebar.tsx            # Sidebar principale
│   │   │   ├── WorkspaceItem.tsx      # Item workspace dans la sidebar
│   │   │   ├── ProjectItem.tsx        # Item projet avec indicateurs
│   │   │   ├── ProjectToolbar.tsx     # Barre d'outils projet
│   │   │   ├── SidebarFileTree.tsx    # Arbre de fichiers dans la sidebar
│   │   │   ├── FileExplorer.tsx       # Explorateur de fichiers
│   │   │   ├── FileViewer.tsx         # Visionneuse de fichiers (Monaco)
│   │   │   ├── FileDiffViewer.tsx     # Diff viewer Git
│   │   │   ├── GitPanel.tsx           # Panneau Git (status, branches, commits)
│   │   │   ├── KanbanBoard.tsx        # Tableau Kanban complet
│   │   │   ├── ClaudeSessionPanel.tsx # Gestion sessions Claude
│   │   │   ├── ClaudeInfoPanel.tsx    # Infos Claude pour un projet
│   │   │   ├── ClaudeRulesPanel.tsx   # Edition regles Claude
│   │   │   ├── MultiAgentView.tsx     # Vue multi-agents
│   │   │   ├── AutoClauder.tsx        # Config Auto-Clauder
│   │   │   ├── NpmPanel.tsx           # Gestion packages npm
│   │   │   ├── SettingsPanel.tsx      # Preferences
│   │   │   ├── NotificationCenter.tsx # Centre de notifications
│   │   │   ├── TitleBar.tsx           # Barre de titre macOS
│   │   │   ├── ContextMenu.tsx        # Menu contextuel
│   │   │   ├── ConfirmModal.tsx       # Modale de confirmation
│   │   │   ├── SessionModal.tsx       # Modale session
│   │   │   └── ErrorBoundary.tsx      # Gestion erreurs React
│   │   │
│   │   ├── lib/                       # Utilitaires et stores
│   │   │   ├── monacoSetup.ts         # Configuration Monaco Editor
│   │   │   └── stores/                # Zustand stores
│   │   │       ├── workspaceStore.ts  # Workspaces + projets
│   │   │       ├── terminalTabStore.ts # Onglets et panes terminal
│   │   │       ├── claudeStore.ts     # Sessions Claude
│   │   │       ├── kanbanStore.ts     # Taches Kanban
│   │   │       ├── updateStore.ts     # Mises a jour
│   │   │       └── viewStore.ts       # Etat de l'UI (panels, vues)
│   │   │
│   │   ├── types/
│   │   │   └── global.d.ts           # Declaration window.kanbai
│   │   │
│   │   └── styles/                    # CSS (pas de Tailwind)
│   │       ├── global.css             # Styles globaux + variables CSS
│   │       ├── terminal.css           # Styles terminal
│   │       ├── claude.css             # Styles Claude
│   │       ├── kanban.css             # Styles Kanban
│   │       ├── git.css                # Styles Git panel
│   │       ├── fileexplorer.css       # Styles explorateur fichiers
│   │       └── multiagent.css         # Styles vue multi-agents
│   │
│   └── shared/                        # --- SHARED (both processes) ---
│       ├── types/
│       │   └── index.ts              # TOUTES les interfaces + IPC_CHANNELS
│       └── constants/
│           └── defaults.ts           # Constantes: settings par defaut, limites
│
├── tests/
│   ├── setup.ts                       # Setup Vitest global
│   ├── mocks/
│   │   └── electron.ts               # Mock Electron APIs
│   ├── helpers/
│   │   └── storage.ts                # Helper StorageService pour tests
│   │
│   ├── unit/
│   │   ├── types.test.ts             # Tests des types
│   │   ├── storage.test.ts           # Tests StorageService
│   │   ├── workspaceStore.test.ts    # Tests store workspaces
│   │   ├── terminalTabStore.test.ts  # Tests store terminal tabs
│   │   ├── viewStore.test.ts         # Tests store vues
│   │   ├── updates.test.ts           # Tests updates
│   │   └── collapseExpand.test.ts    # Tests collapse/expand UI
│   │
│   └── integration/
│       ├── terminal-ipc.test.ts      # Tests IPC terminal
│       ├── workspace-ipc.test.ts     # Tests IPC workspace
│       ├── project-ipc.test.ts       # Tests IPC projet
│       ├── claude-ipc.test.ts        # Tests IPC Claude
│       ├── kanban-ipc.test.ts        # Tests IPC Kanban
│       ├── git-ipc.test.ts           # Tests IPC Git
│       ├── filesystem-ipc.test.ts    # Tests IPC filesystem
│       ├── updates-ipc.test.ts       # Tests IPC updates
│       ├── session-ipc.test.ts       # Tests IPC session
│       ├── workspaceEnv-ipc.test.ts  # Tests IPC workspace env
│       ├── app-ipc.test.ts           # Tests IPC app/settings
│       └── terminal-session-navigation.test.ts  # Tests navigation sessions
│
└── .workspaces/                       # Donnees Kanban par projet (JSON)
    └── kanban.json
```

---

## 6. Choix technologiques

| Technologie | Version | Justification |
|-------------|---------|---------------|
| **Electron 33+** | ^33.0.0 | Framework desktop cross-platform, acces natif macOS, mature pour les terminaux |
| **TypeScript 5.x** | ^5.8.0 | Typage strict, refactoring safe, DX superieure |
| **React 19** | ^19.1.0 | Renderer UI, vaste ecosysteme, hooks pour xterm.js lifecycle |
| **Vite 6** | ^6.3.0 | Build rapide pour renderer ET main process (via vite-plugin-electron) |
| **Zustand 5** | ^5.0.0 | State management leger, TypeScript-first, pas de boilerplate, stores par domaine |
| **@xterm/xterm 6** | ^6.0.0 | Terminal emulator standard, avec addons: fit, webgl, search, web-links, unicode11 |
| **node-pty** | ^1.0.0 | Pseudo-terminal natif, seule option viable pour un vrai shell dans Electron |
| **Monaco Editor** | ^0.55.1 | Editeur de code complet (via @monaco-editor/react ^4.7.0) pour visualiser/editer les fichiers |
| **electron-store** | ^10.0.0 | Persistance locale des settings (complement a StorageService) |
| **uuid** | ^11.1.0 | Generation d'identifiants uniques (workspaces, projets, taches) |
| **CSS custom properties** | — | Styles via CSS pur avec variables CSS, pas de framework CSS |
| **Vitest** | ^3.1.0 | Tests rapides, compatible Vite, API Jest-compatible |
| **electron-builder** | ^26.0.0 | Packaging macOS (.dmg, .app), code signing, notarization |

### Dependances alternatives considerees et rejetees

| Rejetee | Raison |
|---------|--------|
| Redux Toolkit | Trop de boilerplate pour ce projet, Zustand suffit |
| better-sqlite3 | Overhead inutile, un fichier JSON (`~/.kanbai/data.json`) suffit pour le volume de donnees |
| Tailwind CSS | Non necessaire, CSS natif avec variables suffit |
| Playwright / Spectron | Non installe, pas de tests E2E pour le moment |
| Zod | Non installe, validation manuelle dans les handlers IPC |

---

## 7. Plan de securite Electron

### 7.1 Configuration BrowserWindow

```typescript
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,          // OBLIGATOIRE: pas de Node dans renderer
    contextIsolation: true,          // OBLIGATOIRE: isolation du contexte
    sandbox: false,                  // Desactive pour node-pty (preload a besoin de Node)
    preload: path.join(__dirname, '../preload/index.js'),
    webSecurity: true,               // Pas de CORS bypass
  },
  titleBarStyle: 'hiddenInset',      // Style macOS natif
  vibrancy: 'under-window',         // Effet vibrancy macOS
  trafficLightPosition: { x: 15, y: 15 },
});
```

### 7.2 Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';   // Requis pour xterm.js + Monaco
font-src 'self';
connect-src 'self';
img-src 'self' data:;
```

### 7.3 Preload - API structuree par domaine

Le preload expose une API structuree par domaine via `contextBridge.exposeInMainWorld('kanbai', api)`. Le nom est **`window.kanbai`** (minuscule). Aucun module Node.js n'est expose directement.

```typescript
// preload/index.ts - Structure de l'API exposee
contextBridge.exposeInMainWorld('kanbai', {
  terminal: {
    create: (options) => ipcRenderer.invoke('terminal:create', options),
    write: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    close: (id) => ipcRenderer.invoke('terminal:close', { id }),
    onData: (callback) => { /* ipcRenderer.on wrapper, retourne unsubscribe */ },
    onClose: (callback) => { /* idem */ },
  },
  workspace: { list, create, update, delete },
  project: {
    list, selectDir, add, remove, scanClaude, scanInfo,
    checkClaude, deployClaude, checkPackages, updatePackage,
    writeClaudeSettings, writeClaudeMd,
  },
  fs: { readDir, readFile, writeFile, rename, delete, copy, mkdir, exists, readBase64 },
  git: {
    init, status, log, branches, checkout, push, pull, commit,
    diff, stash, stashPop, createBranch, deleteBranch, merge,
    fetch, stage, unstage, discard, show, stashList, renameBranch,
  },
  claude: { start, stop, onSessionEnd },
  kanban: { list, create, update, delete, writePrompt, cleanupPrompt },
  workspaceDir: { init },
  workspaceEnv: { setup, getPath, delete },
  updates: { check, install, onStatus },
  settings: { get, set },
  session: { save, load, clear },
  notify: (title, body) => ipcRenderer.send('app:notification', { title, body }),
});
```

**Pattern**: Chaque domaine a ses methodes propres au lieu d'un `invoke`/`on` generique. Les methodes utilisent `ipcRenderer.invoke` (request/response) ou `ipcRenderer.send`/`ipcRenderer.on` (events/streaming).

### 7.4 Regles de securite

1. **Validation IPC**: Chaque handler main process valide son payload manuellement
2. **Pas de shell.openExternal** sans validation d'URL (whitelist de domaines)
3. **Pas de remote module** (deprecie et dangereux)
4. **File system**: acces restreint aux paths des workspaces declares
5. **Claude Code**: lance via child_process.spawn avec arguments sanitizes
6. **CSP stricte**: pas de eval, pas de scripts externes
7. **Auto-update**: signe et verifie via electron-updater

---

## 8. Strategie de persistance des donnees

### 8.1 Fichier JSON (`StorageService`)

**Emplacement**: `~/.kanbai/data.json`

**Implementation**: `src/main/services/storage.ts` — singleton TypeScript qui charge le fichier JSON au demarrage et le persiste a chaque modification.

**Structure des donnees** :

```typescript
interface AppData {
  workspaces: Workspace[]          // Liste des workspaces
  projects: Project[]              // Liste des projets
  settings: AppSettings            // Preferences utilisateur
  kanbanTasks: KanbanTask[]        // Taches kanban (historique global)
  autoClauderTemplates: AutoClauderTemplate[]  // Templates Auto-Clauder
}
```

**Fonctionnement** :
- Au demarrage, `StorageService` lit `~/.kanbai/data.json` et stocke les donnees en memoire
- Chaque operation CRUD modifie les donnees en memoire puis appelle `save()` qui ecrit le fichier JSON complet
- Pattern singleton : toutes les instances partagent le meme etat en memoire
- Si le fichier n'existe pas, un etat par defaut est cree avec `DEFAULT_SETTINGS`

### 8.2 Fichier Kanban par projet

**Emplacement**: `.workspaces/kanban.json` a la racine de chaque projet

Le handler `kanban.ts` lit et ecrit directement ce fichier JSON pour isoler les taches kanban par projet. Cela permet aux hooks Claude de lire/modifier les taches independamment de l'application.

### 8.3 Session UI

**Emplacement**: via `StorageService` (champ `session` dans les donnees)

Sauvegarde de l'etat UI (workspace actif, onglets ouverts, commandes) pour restauration au prochain demarrage.

### 8.4 Donnees non persistees (en memoire)

- Etat des terminaux (tabs, panes, splits) — reconstruit a chaque session
- Sessions Claude actives — processus vivants, pas besoin de persistance
- Output terminal — pas stocke (trop volumineux)
- Instances PTY (node-pty) — gerees en Map dans le handler terminal

---

## 9. Gestion d'etat (State Management)

### 9.1 Architecture

```
Main Process                    Renderer Process
┌──────────────┐               ┌────────────────────┐
│ Services     │  ← IPC →     │ Zustand Stores      │
│ (source of   │               │ (UI state +         │
│  truth for   │               │  cached server      │
│  data)       │               │  state)             │
└──────────────┘               └────────────────────┘
```

### 9.2 Principes

1. **Main process = source de verite** pour les donnees persistees (workspaces, kanban, settings)
2. **Renderer = cache + UI state** via Zustand stores
3. **Synchronisation**: le renderer fetch via IPC et ecoute les events push du main process
4. **Feature slices**: chaque feature a son propre Zustand store (terminal, workspace, kanban, etc.)
5. **Pas de store global monolithique**: composition de stores independants

### 9.3 Flux de donnees

```
User action → React component → Zustand action → IPC invoke → Main service → DB
                                                                    ↓
                                                              IPC event push
                                                                    ↓
                                                    Zustand listener → React re-render
```

### 9.4 Stores Zustand

| Store | Responsabilite | Persiste? |
|-------|---------------|-----------|
| `useTerminalStore` | Tabs, panes, layouts, active pane | Non |
| `useWorkspaceStore` | Workspaces, projects, active selection | Cache IPC |
| `useClaudeSessionStore` | Sessions actives, statuts | Cache IPC |
| `useKanbanStore` | Taches par projet, drag state | Cache IPC |
| `useUpdateStore` | Infos de mises a jour | Cache IPC |
| `useSettingsStore` | Preferences UI | Cache IPC |

---

## 10. Strategie de test

### 10.1 Niveaux de test

| Niveau | Cible | Framework | Couverture visee |
|--------|-------|-----------|-----------------|
| **Unit** | Services main, stores Zustand, utils | Vitest | 90%+ |
| **Integration** | IPC handlers + services, Database | Vitest + mocks Electron | 80%+ |
| **Component** | Composants React individuels | Vitest + Testing Library | 70%+ |
| **E2E** | Flux utilisateur complets | Playwright | Chemins critiques |

### 10.2 Ce qu'on teste a chaque niveau

**Unit tests** (7 fichiers):
- `StorageService`: persistence JSON, CRUD workspaces/projets/kanban/templates (mock `os.homedir`)
- Zustand stores: `workspaceStore`, `terminalTabStore`, `viewStore` — init, CRUD, navigation, splits
- Types partages: validation des interfaces
- Updates: logique de verification de mises a jour
- UI: collapse/expand des panels

**Integration tests** (14 fichiers):
- IPC round-trip: renderer invoke → main handler → service → response
- Git: operations completes sur de vrais depots git temporaires
- Filesystem: operations fichiers reelles sur repertoires temporaires
- Workspace env: creation et suppression d'environnements virtuels (symlinks)
- Kanban: CRUD taches via IPC + integration Claude hooks
- Terminal, Claude, Session, App, Updates: handlers IPC complets

**E2E tests** (non mis en place):
- Aucun test E2E pour le moment (Playwright/Spectron non configure)

### 10.3 Infrastructure de test

- **`tests/mocks/electron.ts`**: `createMockIpcMain()` simule `ipcMain` d'Electron avec `handle`/`on`/`_invoke`/`_emit` + mocks pour `BrowserWindow`, `dialog`, `Notification`
- **`tests/helpers/storage.ts`**: repertoire temporaire et utilitaires fichiers pour isoler `StorageService`
- **`tests/setup.ts`**: nettoyage global (`vi.restoreAllMocks` apres chaque test)
- **Mock preload**: `vi.stubGlobal('window', { kanbai: { ... } })` pour tester les stores renderer

---

## 11. Historique d'implementation

Le projet a ete construit selon les phases suivantes :

### Phase 1 - Fondations (Terminal + Tabs) ✓
1. Setup projet (Electron + Vite + React + TypeScript)
2. Configuration securite Electron (BrowserWindow, preload, CSP)
3. Infrastructure IPC type-safe (`IPC_CHANNELS` + contextBridge)
4. Service PTY + terminal basique (xterm.js + node-pty)
5. Systeme d'onglets avec splits (jusqu'a 4 panes)

### Phase 2 - Workspaces et navigation ✓
6. CRUD workspaces et projets (StorageService JSON)
7. Scan projets (.claude, .git, Makefile)
8. Sidebar workspace/projets avec detection Claude
9. Environnements virtuels (symlinks `~/.workspaces/`)

### Phase 3 - Integration Claude ✓
10. ClaudeSessionManager (lancement/arret Claude Code via child_process)
11. Vue multi-agents (jusqu'a 4 par projet)
12. Mode loop avec relance automatique
13. Auto-Clauder (templates de deploiement .claude)

### Phase 4 - Kanban, Git et outils ✓
14. Kanban board par projet (persistance JSON `.workspaces/kanban.json`)
15. Integration Kanban-Claude via hooks (kanban-done.sh)
16. Interface Git complete (21 canaux IPC)
17. Gestionnaire NPM (audit packages, mises a jour)
18. Editeur Monaco pour fichiers et diff

### Phase 5 - Polish ✓
19. Packaging macOS (electron-builder, DMG)
20. Persistance de session (restauration onglets)
21. Centre de notifications et update checker
22. Rendu WebGL terminal avec fallback canvas

---

## 12. Integration Kanban-Claude (hooks)

Le systeme de hooks permet aux taches Kanban d'etre automatiquement mises a jour lorsqu'une session Claude termine son travail.

### 12.1 Flux de fonctionnement

```
KanbanBoard "Envoyer a Claude"
  → kanban:writePrompt (ecrit .workspaces/.kanban-prompt-{taskId}.md)
  → ensureKanbanHook() cree le hook kanban-done.sh
  → claude:start lance Claude avec le prompt
  → Claude execute la tache dans un terminal dedie
  → A la fin de Claude, le hook Stop s'execute
  → kanban-done.sh lit les env vars et met a jour kanban.json
  → kanbanStore.syncTasksFromFile() detecte le changement
  → L'UI met a jour le statut de la tache (WORKING → DONE)
```

### 12.2 Fichiers impliques

| Fichier | Role |
|---------|------|
| `src/main/ipc/kanban.ts` | Handler IPC, fonction `ensureKanbanHook()` |
| `.workspaces/hooks/kanban-done.sh` | Script shell auto-genere qui met a jour `kanban.json` |
| `.workspaces/kanban.json` | Persistance des taches Kanban (lu par le hook) |
| `.workspaces/.kanban-prompt-{taskId}.md` | Prompt temporaire pour la session Claude |
| `.claude/settings.local.json` | Configuration du hook Stop de Claude |

### 12.3 Mecanisme du hook

1. **`ensureKanbanHook(projectPath)`** :
   - Cree `.workspaces/hooks/kanban-done.sh` (idempotent)
   - Cree `.claude/settings.local.json` avec un hook `Stop` qui execute le script
   - Le hook est configure une seule fois (verifie `alreadyConfigured`)

2. **Variables d'environnement** :
   - `KANBAI_KANBAN_TASK_ID` : ID de la tache Kanban en cours
   - `KANBAI_KANBAN_FILE` : Chemin absolu vers `kanban.json`
   - Ces variables sont definies uniquement pour les sessions lancees depuis le Kanban

3. **Script `kanban-done.sh`** :
   - Verifie la presence des env vars (sort si absentes)
   - Lit `kanban.json`, trouve la tache par ID
   - Si le statut est `WORKING`, le change en `DONE`
   - Ecrit le fichier modifie

### 12.4 Configuration Claude generee

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"/path/to/project/.workspaces/hooks/kanban-done.sh\""
          }
        ]
      }
    ]
  }
}
```
