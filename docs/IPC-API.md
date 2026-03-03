# Reference API IPC - Kanbai

## Introduction

Kanbai utilise le systeme IPC (Inter-Process Communication) d'Electron pour communiquer entre le processus renderer (React) et le processus main (Node.js). L'architecture suit le modele de securite recommande par Electron :

```
Renderer (React)  →  Preload (contextBridge)  →  Main Process (Node.js)
window.kanbai.*        ipcRenderer.invoke()         ipcMain.handle()
```

- **contextIsolation** : active — le renderer n'a pas acces direct a Node.js
- **contextBridge** : expose une API typee sous `window.kanbai`
- **Invoke/Handle** : la majorite des canaux utilisent le pattern requete/reponse (`invoke`/`handle`)
- **Send/On** : les canaux unidirectionnels (input terminal, notifications, streaming de donnees) utilisent `send`/`on`

## Convention de nommage

Tous les canaux IPC suivent le pattern `{domaine}:{action}` :

| Prefixe | Domaine |
|---------|---------|
| `terminal:` | Gestion des terminaux PTY |
| `workspace:` | Workspaces et environnements virtuels |
| `project:` | Projets, detection Claude, packages NPM |
| `fs:` | Operations sur le systeme de fichiers |
| `git:` | Operations Git |
| `claude:` | Sessions Claude Code |
| `kanban:` | Tableau kanban par projet |
| `session:` | Persistance de session UI |
| `update:` | Verification et installation de mises a jour |
| `app:` | Parametres applicatifs et notifications |
| `autoclaude:` | Templates Auto-Clauder |

Les constantes sont definies dans `src/shared/types/index.ts` via l'objet `IPC_CHANNELS`.

## API Preload (`window.kanbai`)

L'API est exposee dans le renderer via `contextBridge.exposeInMainWorld('kanbai', api)` depuis `src/preload/index.ts`. Voici la surface complete organisee par domaine :

```typescript
window.kanbai.terminal     // create, write, resize, close, onData, onClose
window.kanbai.workspace    // list, create, update, delete
window.kanbai.project      // list, selectDir, add, remove, scanClaude, scanInfo,
                           // checkClaude, deployClaude, checkPackages, updatePackage,
                           // writeClaudeSettings, writeClaudeMd
window.kanbai.fs           // readDir, readFile, writeFile, rename, delete, copy, mkdir, exists, readBase64
window.kanbai.git          // init, status, log, branches, checkout, push, pull, commit, diff,
                           // stash, stashPop, createBranch, deleteBranch, merge, fetch,
                           // stage, unstage, discard, show, stashList, renameBranch
window.kanbai.claude       // start, stop, onSessionEnd
window.kanbai.kanban       // list, create, update, delete, writePrompt, cleanupPrompt
window.kanbai.workspaceDir // init
window.kanbai.workspaceEnv // setup, getPath, delete
window.kanbai.updates      // check, install, onStatus
window.kanbai.settings     // get, set
window.kanbai.session      // save, load, clear
window.kanbai.notify       // (title, body) — fonction directe
```

Le type TypeScript complet est exporte en tant que `KanbaiAPI` depuis `src/preload/index.ts`.

## Canaux par domaine

### Terminal (5 canaux)

Gestion des terminaux PTY via `node-pty`. Le shell par defaut est `$SHELL` ou `/bin/zsh`.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `terminal:create` | `{ cwd?: string, shell?: string }` | `{ id: string, pid: number }` | Cree un nouveau terminal PTY |
| `terminal:input` | `{ id: string, data: string }` | _(fire-and-forget)_ | Envoie des donnees au terminal (send, pas invoke) |
| `terminal:resize` | `{ id: string, cols: number, rows: number }` | _(fire-and-forget)_ | Redimensionne le terminal (send, pas invoke) |
| `terminal:close` | `{ id: string }` | `void` | Ferme et detruit le terminal PTY |
| `terminal:data` | — | _Event_ `{ id: string, data: string }` | **Event** : donnees emises par le terminal vers le renderer |

### Workspace (4 canaux)

CRUD des workspaces. Les donnees sont persistees via `StorageService`.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `workspace:list` | _(aucun)_ | `Workspace[]` | Liste tous les workspaces |
| `workspace:create` | `{ name: string, color?: string }` | `Workspace` | Cree un workspace (couleur par defaut : `#3b82f6`) |
| `workspace:update` | `{ id: string } & Partial<Workspace>` | `Workspace` | Met a jour un workspace. Renomme l'env si le nom change |
| `workspace:delete` | `{ id: string }` | `void` | Supprime un workspace et son repertoire env associe |

### Project (12 canaux)

Gestion des projets, detection Claude Code, et audit de packages NPM.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `project:list` | _(aucun)_ | `Project[]` | Liste tous les projets |
| `project:selectDir` | _(aucun)_ | `string \| null` | Ouvre le dialogue natif de selection de dossier |
| `project:add` | `{ workspaceId: string, path: string }` | `Project` | Ajoute un projet a un workspace (detecte `.claude` et `.git`) |
| `project:remove` | `{ id: string }` | `void` | Supprime un projet |
| `project:scanClaude` | `{ path: string }` | `{ hasClaude: boolean, claudeMd: string \| null, settings: object \| null }` | Scanne la config Claude d'un projet (CLAUDE.md + settings.json) |
| `project:scanInfo` | `{ path: string }` | `ProjectInfo` | Detecte Makefile (+ targets), Git (+ branche courante) |
| `project:checkClaude` | `{ path: string }` | `boolean` | Verifie si le dossier `.claude` existe dans le projet |
| `project:deployClaude` | `{ targetPath: string, force: boolean }` | `{ success: boolean, error?: string, hasExisting?: boolean }` | Deploie la config `.claude` de Kanbai vers un projet cible |
| `project:checkPackages` | `{ path: string }` | `{ packages: NpmPackageInfo[] }` | Audite les packages NPM (via `npm outdated --json`) |
| `project:updatePackage` | `{ projectPath: string, packageName?: string }` | `{ success: boolean, error?: string, output?: string }` | Met a jour un package NPM specifique ou tous |
| `project:writeClaudeSettings` | `{ projectPath: string, settings: object }` | `{ success: boolean }` | Ecrit `.claude/settings.json` dans le projet |
| `project:writeClaudeMd` | `{ projectPath: string, content: string }` | `{ success: boolean }` | Ecrit `CLAUDE.md` a la racine du projet |

### File System (9 canaux)

Operations sur le systeme de fichiers. Limite de lecture : 5 Mo par fichier.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `fs:readDir` | `{ path: string }` | `FileEntry[]` | Liste le contenu d'un repertoire (trie : dossiers d'abord, puis alphabetique) |
| `fs:readFile` | `{ path: string }` | `{ content: string \| null, error: string \| null }` | Lit un fichier texte (refuse > 5 Mo) |
| `fs:writeFile` | `{ path: string, content: string }` | `{ success: boolean, error: string \| null }` | Ecrit du contenu dans un fichier |
| `fs:rename` | `{ oldPath: string, newPath: string }` | `true` | Renomme ou deplace un fichier/dossier |
| `fs:delete` | `{ path: string }` | `true` | Supprime un fichier ou dossier (recursif) |
| `fs:copy` | `{ src: string, dest: string }` | `true` | Copie un fichier ou dossier (recursif) |
| `fs:mkdir` | `{ path: string }` | `true` | Cree un repertoire (recursif) |
| `fs:exists` | `{ path: string }` | `boolean` | Verifie l'existence d'un chemin |
| `fs:readBase64` | `{ path: string }` | `{ data: string \| null, error: string \| null }` | Lit un fichier en base64 (pour images et binaires) |

### Git (21 canaux)

Operations Git completes. Toutes les commandes prennent un `cwd` (chemin du depot).

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `git:init` | `{ cwd: string }` | `{ success: boolean, error?: string }` | Initialise un depot Git |
| `git:status` | `{ cwd: string }` | `GitStatus \| null` | Statut du depot (branche, ahead/behind, staged, modified, untracked) |
| `git:log` | `{ cwd: string, limit?: number }` | `GitLogEntry[]` | Historique des commits (defaut : 50) |
| `git:branches` | `{ cwd: string }` | `Array<{ name, hash, upstream }>` | Liste toutes les branches (locales + distantes) |
| `git:checkout` | `{ cwd: string, branch: string }` | `{ success: boolean, error?: string }` | Change de branche |
| `git:push` | `{ cwd: string }` | `{ success: boolean, error?: string }` | Pousse les commits vers le remote |
| `git:pull` | `{ cwd: string }` | `{ success: boolean, error?: string }` | Tire les changements depuis le remote |
| `git:commit` | `{ cwd: string, message: string, files: string[] }` | `{ success: boolean, error?: string }` | Stage les fichiers specifies puis commit |
| `git:diff` | `{ cwd: string, file?: string, staged?: boolean }` | `string` | Affiche le diff (optionnel : fichier specifique, staged) |
| `git:stash` | `{ cwd: string }` | `{ success: boolean, error?: string }` | Met les modifications en stash |
| `git:stashPop` | `{ cwd: string }` | `{ success: boolean, error?: string }` | Restaure le dernier stash |
| `git:stashList` | `{ cwd: string }` | `Array<{ ref, message, date }>` | Liste tous les stashs |
| `git:createBranch` | `{ cwd: string, name: string }` | `{ success: boolean, error?: string }` | Cree et checkout une nouvelle branche (necessite au moins un commit) |
| `git:deleteBranch` | `{ cwd: string, name: string }` | `{ success: boolean, error?: string }` | Supprime une branche locale (`-d`, safe delete) |
| `git:renameBranch` | `{ cwd: string, oldName: string, newName: string }` | `{ success: boolean, error?: string }` | Renomme une branche |
| `git:merge` | `{ cwd: string, branch: string }` | `{ success: boolean, error?: string }` | Fusionne une branche dans la branche courante |
| `git:fetch` | `{ cwd: string }` | `{ success: boolean, error?: string }` | Fetch tous les remotes avec prune (`--all --prune`) |
| `git:stage` | `{ cwd: string, files: string[] }` | `{ success: boolean, error?: string }` | Stage des fichiers specifiques |
| `git:unstage` | `{ cwd: string, files: string[] }` | `{ success: boolean, error?: string }` | Unstage des fichiers (utilise `rm --cached` si pas de commits) |
| `git:discard` | `{ cwd: string, files: string[] }` | `{ success: boolean, error?: string }` | Annule les modifications locales de fichiers (`checkout --`) |
| `git:show` | `{ cwd: string, hash: string }` | `{ files: Array<{ status, file }>, diff: string }` | Affiche les fichiers modifies et le diff d'un commit |

### Claude (3 canaux + 1 event)

Gestion des sessions Claude Code. Supporte le mode boucle avec relance automatique.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `claude:start` | `{ projectId: string, projectPath: string, terminalId: string, prompt?: string, loopMode?: boolean, loopDelay?: number }` | `ClaudeSession` | Demarre une session Claude (lance `claude --dangerously-skip-permissions`) |
| `claude:stop` | `{ id: string }` | `void` | Arrete une session Claude (SIGTERM) et desactive le mode boucle |
| `claude:status` | _(aucun)_ | `ClaudeSession[]` | Liste toutes les sessions Claude actives |
| `claude:sessionEnd` | — | _Event_ `{ id: string, status: string }` | **Event** : notifie la fin d'une session (completed/failed) |

### Kanban (6 canaux)

Tableau kanban stocke dans `.workspaces/kanban.json` a la racine du projet.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `kanban:list` | `{ projectPath: string }` | `KanbanTask[]` | Liste les taches kanban du projet |
| `kanban:create` | `{ projectPath, projectId, title, description, priority, status? }` | `KanbanTask` | Cree une tache kanban |
| `kanban:update` | `{ id: string, projectPath: string } & Partial<KanbanTask>` | `KanbanTask` | Met a jour une tache kanban |
| `kanban:delete` | `{ id: string, projectPath: string }` | `void` | Supprime une tache kanban |
| `kanban:writePrompt` | `{ projectPath: string, taskId: string, prompt: string }` | `string` | Ecrit le prompt Claude dans `.workspaces/.kanban-prompt-{taskId}.md` et configure le hook kanban-done.sh |
| `kanban:cleanupPrompt` | `{ projectPath: string, taskId: string }` | `void` | Supprime le fichier prompt temporaire apres execution |

### Workspace Env (3 canaux)

Gestion des environnements virtuels de workspace (repertoire `~/.workspaces/` avec symlinks).

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `workspace:envSetup` | `{ workspaceName: string, projectPaths: string[] }` | `{ success: boolean, envPath?: string, error?: string }` | Cree/met a jour l'env avec des symlinks vers chaque projet |
| `workspace:envPath` | `{ workspaceName: string }` | `string \| null` | Retourne le chemin de l'env ou null s'il n'existe pas |
| `workspace:envDelete` | `{ workspaceName: string }` | `{ success: boolean, error?: string }` | Supprime le repertoire env d'un workspace |

### Workspace Dir (1 canal)

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `workspace:initDir` | `{ projectPath: string }` | `true` | Cree le dossier `.workspaces/` dans un projet |

### Session (3 canaux)

Persistance de l'etat UI entre les redemarrages de l'application.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `session:save` | `SessionData` | `{ success: boolean }` | Sauvegarde l'etat de session |
| `session:load` | _(aucun)_ | `SessionData \| null` | Charge la derniere session sauvegardee |
| `session:clear` | _(aucun)_ | `{ success: boolean }` | Supprime la session sauvegardee |

### Updates (3 canaux)

Verification et installation des mises a jour d'outils (node, npm, claude, git).

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `update:check` | _(aucun)_ | `UpdateInfo[]` | Verifie les mises a jour disponibles pour tous les outils |
| `update:install` | `{ tool: string, scope: string, projectId?: string }` | `{ success: boolean, error?: string }` | Installe une mise a jour (brew pour node, npm pour npm/claude) |
| `update:status` | — | _Event_ `{ tool, scope, status, progress? }` | **Event** : progression de l'installation en cours |

### App / Settings (3 canaux)

Parametres applicatifs et notifications systeme.

| Canal | Parametres | Retour | Description |
|-------|-----------|--------|-------------|
| `app:settingsGet` | _(aucun)_ | `AppSettings` | Recupere les parametres de l'application |
| `app:settingsSet` | `Partial<AppSettings>` | `AppSettings` | Met a jour les parametres (merge partiel) et retourne le resultat |
| `app:notification` | `{ title: string, body: string }` | _(fire-and-forget)_ | Affiche une notification systeme macOS (send, pas invoke) |

## Canaux evenementiels (Event Channels)

Certains canaux fonctionnent en mode push : le processus main envoie des donnees au renderer sans requete prealable. L'API preload expose des fonctions `on*` qui retournent une fonction de cleanup.

| Canal | Payload | API Preload | Description |
|-------|---------|-------------|-------------|
| `terminal:data` | `{ id: string, data: string }` | `kanbai.terminal.onData(cb)` | Sortie du terminal (stdout/stderr du PTY) |
| `terminal:close` | `{ id: string, exitCode: number, signal: number }` | `kanbai.terminal.onClose(cb)` | Fermeture du terminal (processus termine) |
| `claude:sessionEnd` | `{ id: string, status: string }` | `kanbai.claude.onSessionEnd(cb)` | Fin d'une session Claude (completed/failed) |
| `update:status` | `{ tool, scope, status, progress? }` | `kanbai.updates.onStatus(cb)` | Progression d'une installation de mise a jour |

**Pattern de cleanup** : chaque listener retourne une fonction de desinscription :

```typescript
const cleanup = window.kanbai.terminal.onData((data) => {
  console.log(data.id, data.data)
})
// Plus tard :
cleanup() // retire le listener
```

## Types associes

Tous les types sont definis dans `src/shared/types/index.ts`. Voici les interfaces principales :

| Interface | Utilisation |
|-----------|------------|
| `Workspace` | Structure d'un workspace (id, name, color, projectIds, timestamps) |
| `Project` | Structure d'un projet (id, name, path, hasClaude, hasGit, workspaceId) |
| `TerminalSession` | Session terminal (id, pid, cwd, shell, isActive) |
| `ClaudeSession` | Session Claude (id, projectId, terminalId, status, loopMode, loopCount) |
| `KanbanTask` | Tache kanban (id, title, description, status, priority, agentId) |
| `KanbanStatus` | `'TODO' \| 'WORKING' \| 'PENDING' \| 'DONE' \| 'FAILED'` |
| `GitStatus` | Statut Git (branch, ahead, behind, staged, modified, untracked) |
| `GitLogEntry` | Entree de log Git (hash, author, date, message, parents, refs) |
| `FileEntry` | Entree de systeme de fichiers (name, path, isDirectory, isSymlink) |
| `ProjectInfo` | Info projet scannee (hasMakefile, makeTargets, hasGit, gitBranch) |
| `NpmPackageInfo` | Info package NPM (name, versions, deprecated, updateAvailable) |
| `UpdateInfo` | Info de mise a jour d'outil (tool, versions, scope) |
| `SessionData` | Donnees de session UI (activeWorkspaceId, tabs, savedAt) |
| `AppSettings` | Parametres applicatifs (theme, shell, font, scrollback, etc.) |
| `IPC_CHANNELS` | Objet `as const` contenant tous les noms de canaux |
