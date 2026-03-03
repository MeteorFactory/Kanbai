# Gestion d'etat - Stores Zustand

## Vue d'ensemble

L'application utilise **Zustand 5** pour la gestion d'etat dans le processus renderer. Chaque domaine fonctionnel possede son propre store, sans store global monolithique.

```
Main Process (source de verite)  ← IPC →  Renderer (cache + etat UI)
       StorageService                         Zustand stores
       (~/.kanbai/data.json)                  (en memoire)
```

**Principe** : le main process est la source de verite pour les donnees persistees. Les stores Zustand agissent comme un cache synchronise via IPC et gerent l'etat UI ephemere.

**Flux de donnees** :

```
Action utilisateur → Composant React → Action Zustand → IPC invoke → Main process
                                                                          ↓
                                                                    IPC event push
                                                                          ↓
                                                         Zustand listener → Re-render React
```

---

## 1. workspaceStore

**Fichier** : `src/renderer/lib/stores/workspaceStore.ts`
**Hook** : `useWorkspaceStore`

### Etat

| Champ | Type | Description |
|-------|------|-------------|
| `workspaces` | `Workspace[]` | Liste des workspaces |
| `projects` | `Project[]` | Liste des projets (tous workspaces confondus) |
| `activeWorkspaceId` | `string \| null` | Workspace actuellement selectionne |
| `activeProjectId` | `string \| null` | Projet actuellement selectionne |
| `initialized` | `boolean` | Indique si le store a ete charge |
| `pendingClaudeImport` | `string \| null` | ID projet en attente d'import .claude |

### Actions

| Action | Description |
|--------|-------------|
| `init()` | Charge workspaces et projets depuis le main process, scanne les .claude |
| `loadWorkspaces()` | Recharge workspaces et projets depuis le main process |
| `createWorkspace(name, color?)` | Cree un workspace vide |
| `createWorkspaceFromFolder()` | Ouvre un selecteur de dossier, cree workspace + projet, setup env, cree onglet split |
| `deleteWorkspace(id)` | Supprime workspace + projets associes |
| `updateWorkspace(id, data)` | Met a jour un workspace (nom, couleur, icone) |
| `addProject(workspaceId)` | Ouvre un selecteur de dossier et ajoute le projet au workspace |
| `removeProject(id)` | Supprime un projet et reconstruit l'env workspace |
| `moveProject(projectId, targetWorkspaceId)` | Deplace un projet entre workspaces (reconstruit les deux envs) |
| `rescanClaude(projectId)` | Re-detecte la presence de .claude dans un projet |
| `rescanAllClaude()` | Scanne tous les projets pour .claude (appele au init) |
| `setupWorkspaceEnv(workspaceId)` | Cree/met a jour l'env virtuel `~/.workspaces/{name}` avec symlinks |
| `setActiveWorkspace(id)` | Active un workspace + auto-selectionne le premier projet + cree un onglet split si aucun |
| `setActiveProject(id)` | Active un projet |
| `navigateWorkspace(direction)` | Navigation cyclique entre workspaces (next/prev) |

### Interactions inter-stores

- Utilise `useTerminalTabStore` pour creer des onglets split (Claude + Terminal) lors de la selection d'un workspace

---

## 2. terminalTabStore

**Fichier** : `src/renderer/lib/stores/terminalTabStore.ts`
**Hook** : `useTerminalTabStore`

### Architecture des panes

Les panes sont organises en arbre binaire. Chaque noeud est soit une feuille (`PaneLeaf`), soit un split (`PaneSplit`) contenant deux enfants.

```typescript
PaneLeaf  { type: 'leaf', id, sessionId, initialCommand, externalSessionId }
PaneSplit { type: 'split', id, direction, children: [PaneNode, PaneNode], ratio }
PaneNode  = PaneLeaf | PaneSplit
```

**Limite** : maximum 4 panes par onglet.

### Etat

| Champ | Type | Description |
|-------|------|-------------|
| `tabs` | `TerminalTabData[]` | Liste de tous les onglets terminal |
| `activeTabId` | `string \| null` | Onglet actuellement actif |

**TerminalTabData** :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string` | Identifiant unique |
| `label` | `string` | Nom affiche dans la barre d'onglets |
| `color` | `string \| null` | Couleur de l'onglet (null = defaut) |
| `hasActivity` | `boolean` | Indicateur d'activite (onglet inactif) |
| `paneTree` | `PaneNode` | Arbre de panes |
| `activePaneId` | `string` | Pane actuellement focus |
| `zoomedPaneId` | `string \| null` | Pane en mode zoom (plein ecran) |
| `workspaceId` | `string` | Workspace proprietaire |
| `cwd` | `string` | Repertoire de travail initial |

### Actions - Onglets

| Action | Description |
|--------|-------------|
| `createTab(workspaceId, cwd, label?, cmd?)` | Cree un onglet avec un seul pane |
| `createSplitTab(wsId, cwd, label, leftCmd, rightCmd)` | Cree un onglet pre-splitte horizontalement |
| `createViewOnlyTab(wsId, cwd, label, extSessionId)` | Cree un onglet lie a une session externe |
| `closeTab(id)` | Ferme un onglet (active l'adjacent) |
| `setActiveTab(id)` | Active un onglet et retire son indicateur d'activite |
| `renameTab(id, label)` | Renomme un onglet |
| `setTabColor(id, color)` | Change la couleur d'un onglet |
| `reorderTabs(from, to)` | Reordonne les onglets par drag & drop |
| `activateNext(wsId?)` / `activatePrev(wsId?)` | Navigation entre onglets (scopee par workspace) |
| `activateByIndex(index, wsId?)` | Active l'onglet N du workspace |
| `closeOtherTabs(id)` | Ferme tous les onglets sauf celui specifie |

### Actions - Panes

| Action | Description |
|--------|-------------|
| `splitPane(tabId, paneId, direction)` | Split un pane (horizontal/vertical), max 4 |
| `closePane(tabId, paneId)` | Ferme un pane (promeut le sibling ; ferme l'onglet si dernier pane) |
| `setActivePane(tabId, paneId)` | Focus un pane |
| `setPaneSessionId(tabId, paneId, sessionId)` | Lie un pane a une session PTY |
| `resizePane(tabId, splitId, ratio)` | Ajuste le ratio d'un split (clamp 0.1-0.9) |
| `toggleZoomPane(tabId, paneId)` | Zoom/dezoom un pane en plein ecran |
| `focusDirection(tabId, direction)` | Navigation directionnelle entre panes (calcul geometrique) |

### Fonctions utilitaires exportees

| Fonction | Description |
|----------|-------------|
| `countLeaves(node)` | Compte les feuilles dans l'arbre |
| `collectLeafIds(node)` | Retourne les IDs de toutes les feuilles |
| `computePaneRects(node, x, y, w, h)` | Calcule les rectangles de chaque pane (pour rendu et navigation) |
| `computeSplitDividers(node, x, y, w, h)` | Calcule les positions des dividers de redimensionnement |

---

## 3. kanbanStore

**Fichier** : `src/renderer/lib/stores/kanbanStore.ts`
**Hook** : `useKanbanStore`

### Etat

| Champ | Type | Description |
|-------|------|-------------|
| `tasks` | `KanbanTask[]` | Taches du projet courant |
| `isLoading` | `boolean` | Chargement en cours |
| `draggedTaskId` | `string \| null` | Tache en cours de drag |
| `currentProjectPath` | `string \| null` | Chemin du projet actif |
| `currentProjectId` | `string \| null` | ID du projet actif |
| `kanbanTabIds` | `Record<string, string>` | Mapping taskId → tabId (onglets Claude) |

### Actions

| Action | Description |
|--------|-------------|
| `loadTasks(projectId, projectPath)` | Charge les taches depuis le fichier kanban. Auto-envoie les taches TODO et WORKING a Claude |
| `syncTasksFromFile()` | Re-lit le fichier kanban et detecte les changements de statut (colore les onglets) |
| `createTask(projectId, path, title, desc, priority)` | Cree une tache et l'envoie automatiquement a Claude |
| `updateTaskStatus(taskId, status)` | Change le statut d'une tache |
| `updateTask(taskId, data)` | Met a jour les champs d'une tache |
| `deleteTask(taskId)` | Supprime une tache |
| `setDragged(taskId)` | Definit la tache en cours de drag & drop |
| `sendToClaude(task)` | Cree un onglet terminal avec `claude -p` et le prompt du ticket |

### Flux d'integration Claude

1. `createTask` → cree la tache → appelle `sendToClaude`
2. `sendToClaude` → ecrit un fichier prompt → cree un onglet terminal avec `claude --dangerously-skip-permissions -p`
3. La tache passe en `WORKING` (mise a jour optimiste)
4. `syncTasksFromFile` (appele periodiquement) detecte les changements de statut et colore les onglets :
   - DONE → vert (`#a6e3a1`)
   - FAILED → rouge (`#f38ba8`)
   - PENDING → jaune (`#f9e2af`) + indicateur d'activite

---

## 4. claudeStore

**Fichier** : `src/renderer/lib/stores/claudeStore.ts`
**Hook** : `useClaudeStore`

### Etat

| Champ | Type | Description |
|-------|------|-------------|
| `sessions` | `ClaudeSession[]` | Sessions Claude actives |
| `flashingSessionId` | `string \| null` | Session dont l'onglet clignote (notification visuelle) |
| `flashingWorkspaceId` | `string \| null` | Workspace dont l'icone clignote |

### Actions

| Action | Description |
|--------|-------------|
| `startSession(projectId, path, terminalId, prompt?, loop?, delay?)` | Lance une session Claude Code via IPC |
| `stopSession(sessionId)` | Arrete une session (SIGTERM) |
| `refreshSessions()` | Recharge la liste des sessions actives |
| `setFlashing(sessionId)` | Active le clignotement pour une session |
| `getSessionsForProject(projectId)` | Filtre les sessions par projet |
| `initListeners()` | Ecoute `claude:sessionEnd` — notifie macOS, clignote 5s, met a jour le statut |

### Comportement des listeners

Quand une session se termine (`claude:sessionEnd`) :
1. Met a jour le statut de la session (completed/failed)
2. Active le clignotement du workspace parent (5s)
3. Active le clignotement de la session (5s)
4. Envoie une notification macOS native

---

## 5. viewStore

**Fichier** : `src/renderer/lib/stores/viewStore.ts`
**Hook** : `useViewStore`

### Etat

| Champ | Type | Description |
|-------|------|-------------|
| `viewMode` | `ViewMode` | Mode de vue actif |
| `selectedFilePath` | `string \| null` | Fichier ouvert dans le FileViewer |
| `highlightedFilePath` | `string \| null` | Fichier surligne dans le SidebarFileTree |
| `isEditorDirty` | `boolean` | Modifications non sauvegardees dans l'editeur |
| `availableMagicTabs` | `string[]` | Onglets magiques disponibles (ex: NPM) |
| `selectedFiles` | `string[]` | Fichiers selectionnes pour diff (max 2) |
| `diffFiles` | `[string, string] \| null` | Paire de fichiers en comparaison diff |
| `clipboardPath` | `string \| null` | Chemin copie pour coller |
| `clipboardOperation` | `'copy' \| null` | Type d'operation du presse-papier |

**ViewMode** : `'terminal' | 'git' | 'kanban' | 'file' | 'npm' | 'diff' | 'claude' | 'settings'`

### Actions

| Action | Description |
|--------|-------------|
| `setViewMode(mode)` | Change la vue active |
| `openFile(filePath)` | Ouvre un fichier dans le FileViewer (passe en mode `file`) |
| `toggleFileSelection(filePath)` | Selection multi-fichier (max 2) — ouvre le diff automatiquement |
| `openDiff()` | Ouvre la vue diff avec les 2 fichiers selectionnes |
| `clearSelection()` | Vide la selection de fichiers |
| `setClipboard(path, operation)` | Copie un chemin dans le presse-papier interne |
| `clearClipboard()` | Vide le presse-papier interne |

---

## 6. updateStore

**Fichier** : `src/renderer/lib/stores/updateStore.ts`
**Hook** : `useUpdateStore`

### Etat

| Champ | Type | Description |
|-------|------|-------------|
| `updates` | `UpdateInfo[]` | Mises a jour disponibles |
| `isChecking` | `boolean` | Verification en cours |
| `lastChecked` | `number \| null` | Timestamp de la derniere verification |
| `installingTool` | `string \| null` | Outil en cours d'installation |
| `installStatus` | `InstallStatus \| null` | Resultat de la derniere installation |

### Actions

| Action | Description |
|--------|-------------|
| `checkUpdates()` | Interroge le main process pour les MAJ disponibles |
| `installUpdate(tool, scope, projectId?)` | Installe une MAJ puis re-verifie |
| `clearUpdates()` | Vide la liste des MAJ |
| `clearInstallStatus()` | Efface le statut d'installation |

---

## Patterns communs

### Acces depuis les composants

```typescript
import { useWorkspaceStore } from '../lib/stores/workspaceStore'

function MyComponent() {
  // Selection reactive (re-render quand activeProjectId change)
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)

  // Acces aux actions (stable, pas de re-render)
  const { addProject } = useWorkspaceStore.getState()
}
```

### Acces inter-stores

Les stores peuvent acceder a d'autres stores via `.getState()` :

```typescript
// Dans kanbanStore
const termStore = useTerminalTabStore.getState()
termStore.createTab(workspaceId, cwd, label, command)
```

### Mock pour les tests

```typescript
const mockApi = { list: vi.fn(), create: vi.fn() }
vi.stubGlobal('window', { kanbai: { workspace: mockApi } })
```
