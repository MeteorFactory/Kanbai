# Catalogue des Composants - Workspaces

## 1. Vue d'ensemble

L'application est structuree autour d'un layout principal defini dans `App.tsx`. L'arbre de composants suit cette hierarchie :

```
ErrorBoundary
  App
    TitleBar ...................... Barre de titre macOS (drag region + NotificationCenter)
    Sidebar ....................... Panneau lateral gauche (workspaces + projets)
      WorkspaceItem
        ProjectItem
          ClaudeInfoPanel
          SidebarFileTree
    ViewSwitcher .................. Onglets principaux (Terminal, Git, Kanban, NPM, Claude, Settings)
    ViewContent
      TerminalArea ................ Vue terminal avec onglets et split panes
        ProjectToolbar
        SplitContainer
          Terminal
      GitPanel .................... Vue Git complete (graphe, branches, changes, diff)
      KanbanBoard ................. Tableau Kanban par projet
      NpmPanel .................... Gestionnaire de packages NPM
      FileViewer .................. Editeur Monaco pour fichiers
      FileDiffViewer .............. Comparaison cote-a-cote de fichiers
      ClaudeRulesPanel ............ Configuration Claude (permissions, CLAUDE.md, profil)
      SettingsPanel ............... Preferences de l'application
    SessionModal .................. Modal de restauration de session
```

Les vues principales sont controlees par `viewStore.viewMode`. Le terminal est toujours monte (via `display: none/flex`) pour preserver l'etat xterm. Les autres vues sont montees/demontees conditionnellement.

---

## 2. Layout

### App.tsx
- **Fichier** : `src/renderer/App.tsx`
- **Role** : Composant racine. Orchestre le layout global, le view switcher, la detection des magic tabs (NPM), et la restauration de session au demarrage.
- **Stores** : `viewStore`, `workspaceStore`, `terminalTabStore`

### TitleBar.tsx
- **Fichier** : `src/renderer/components/TitleBar.tsx`
- **Role** : Barre de titre macOS avec region draggable, titre "Workspaces", et le `NotificationCenter`.
- **Stores** : aucun

### Sidebar.tsx
- **Fichier** : `src/renderer/components/Sidebar.tsx`
- **Role** : Panneau lateral gauche. Affiche la liste des workspaces, chaque workspace contenant ses projets. Gere la creation de workspace (bouton + ou Cmd+Shift+N) et la navigation clavier entre workspaces (Cmd+Shift+[ / ]).
- **Stores** : `workspaceStore`

### ProjectToolbar.tsx
- **Fichier** : `src/renderer/components/ProjectToolbar.tsx`
- **Role** : Barre contextuelle affichee sous les onglets terminal. Montre la branche Git active et les cibles Makefile prioritaires (dev, build, test, etc.) du projet actif. Envoie les commandes `make` dans le terminal actif.
- **Stores** : `workspaceStore`, `terminalTabStore`

---

## 3. Terminal

### TerminalArea.tsx
- **Fichier** : `src/renderer/components/TerminalArea.tsx`
- **Role** : Zone principale du terminal. Gere les onglets (creation, fermeture, renommage, reordonnancement par drag & drop), les raccourcis clavier (Cmd+T, Cmd+W, Cmd+D pour split, Cmd+Alt+Fleches pour navigation entre panes), et filtre les onglets par workspace actif.
- **Stores** : `terminalTabStore`, `workspaceStore`

### TabBar.tsx
- **Fichier** : `src/renderer/components/TabBar.tsx`
- **Role** : Barre d'onglets alternative avec menu contextuel (renommer, fermer, fermer les autres). Supporte le drag & drop pour reordonner.
- **Stores** : `terminalTabStore`

### Terminal.tsx
- **Fichier** : `src/renderer/components/Terminal.tsx`
- **Role** : Composant terminal individuel base sur xterm.js. Cree une session PTY via IPC, gere le rendu WebGL (avec fallback canvas), le redimensionnement automatique, les addons (search, web-links), et l'execution d'une commande initiale (ex: `claude`).
- **Props** : `cwd`, `shell`, `initialCommand`, `isVisible`, `onActivity`, `onClose`, `onSessionCreated`
- **Stores** : aucun (communique via callbacks)

### SplitContainer.tsx
- **Fichier** : `src/renderer/components/SplitContainer.tsx`
- **Role** : Conteneur de panes avec positionnement absolu. Calcule les rectangles de chaque pane a partir de l'arbre `PaneNode`, gere le zoom sur un pane unique, et affiche les dividers redimensionnables entre panes.
- **Props** : `tabId`
- **Stores** : `terminalTabStore`

---

## 4. Workspace / Projet

### WorkspaceItem.tsx
- **Fichier** : `src/renderer/components/WorkspaceItem.tsx`
- **Role** : Element de workspace dans la sidebar. Affiche le nom, la couleur/icone, le chevron d'expansion, et la liste des projets. Supporte le renommage, le changement de couleur/icone via menu contextuel, et le drop de projets (drag & drop inter-workspace).
- **Props** : `workspace: Workspace`, `projects: Project[]`, `isActive: boolean`
- **Stores** : `workspaceStore`, `viewStore`

### ProjectItem.tsx
- **Fichier** : `src/renderer/components/ProjectItem.tsx`
- **Role** : Element de projet dans un workspace. Affiche le nom, l'icone (dossier ou Claude), le badge Claude, et l'arbre de fichiers quand expanse. Supporte le deploiement .claude, l'import Claude, le drag pour deplacer entre workspaces, et le menu contextuel.
- **Props** : `project: Project`, `isActive: boolean`
- **Stores** : `workspaceStore`, `viewStore`

### SidebarFileTree.tsx
- **Fichier** : `src/renderer/components/SidebarFileTree.tsx`
- **Role** : Arbre de fichiers compact affiche dans la sidebar sous chaque projet actif. Charge les fichiers a la demande, supporte le renommage, la creation de fichiers/dossiers, la copie, le collage, la duplication et la suppression via menu contextuel. Permet l'ouverture de fichiers dans le FileViewer et la selection multiple pour diff (Cmd+clic).
- **Props** : `projectPath: string`
- **Stores** : `viewStore` (selectedFiles, clipboard)

### FileExplorer.tsx
- **Fichier** : `src/renderer/components/FileExplorer.tsx`
- **Role** : Explorateur de fichiers plein ecran (non utilise dans le layout actuel, composant disponible). Affiche l'arbre de fichiers du projet actif avec renommage sur double-clic.
- **Stores** : `workspaceStore`

### FileViewer.tsx
- **Fichier** : `src/renderer/components/FileViewer.tsx`
- **Role** : Editeur de fichiers base sur Monaco Editor. Affiche le contenu d'un fichier avec coloration syntaxique (theme Catppuccin Mocha), sauvegarde via Cmd+S, indicateur de modification, et detection automatique du langage.
- **Stores** : `viewStore` (selectedFilePath, isEditorDirty)

### FileDiffViewer.tsx
- **Fichier** : `src/renderer/components/FileDiffViewer.tsx`
- **Role** : Comparaison cote-a-cote de deux fichiers via Monaco DiffEditor. Active automatiquement quand deux fichiers sont selectionnes avec Cmd+clic dans le SidebarFileTree.
- **Stores** : `viewStore` (diffFiles)

---

## 5. Claude AI

### ClaudeSessionPanel.tsx
- **Fichier** : `src/renderer/components/ClaudeSessionPanel.tsx`
- **Role** : Panneau de gestion des sessions Claude. Permet de lancer une session avec un prompt personnalise et un mode boucle (execution repetee avec delai configurable). Affiche la liste des sessions actives avec leur statut (running, completed, failed, paused).
- **Stores** : `claudeStore`, `workspaceStore`

### ClaudeInfoPanel.tsx
- **Fichier** : `src/renderer/components/ClaudeInfoPanel.tsx`
- **Role** : Panneau d'information Claude affiche dans la sidebar sous un projet. Montre un apercu rapide de la configuration : mode de permission, outils autorises/bloques, badges (CLAUDE.md, settings.json), et le contenu brut de CLAUDE.md.
- **Props** : `projectPath: string`, `onClose: () => void`
- **Stores** : aucun (charge via IPC)

### MultiAgentView.tsx
- **Fichier** : `src/renderer/components/MultiAgentView.tsx`
- **Role** : Vue multi-agents permettant de lancer jusqu'a 4 agents Claude simultanes sur un projet. Chaque agent a son propre terminal et prompt. Layout en grille adaptative (1x1, 1x2, 2x2).
- **Stores** : `claudeStore`, `workspaceStore`

### AutoClauder.tsx
- **Fichier** : `src/renderer/components/AutoClauder.tsx`
- **Role** : Outil pour deployer automatiquement la configuration .claude sur les projets qui n'en ont pas. Propose des templates predefinis (Standard, Fullstack, Frontend) avec apercu du CLAUDE.md genere.
- **Stores** : `workspaceStore`

### ClaudeRulesPanel.tsx
- **Fichier** : `src/renderer/components/ClaudeRulesPanel.tsx`
- **Role** : Vue complete de configuration Claude (onglet "Claude" dans le view switcher). Trois sous-onglets : Permissions (mode, outils autorises/bloques), CLAUDE.md (editeur Monaco), et Profil & Skills (vue en sections du CLAUDE.md).
- **Stores** : `workspaceStore`

### SessionModal.tsx
- **Fichier** : `src/renderer/components/SessionModal.tsx`
- **Role** : Modal affichee au demarrage si une session precedente a ete sauvegardee. Propose de reprendre (restaurer les onglets), effacer, ou ignorer la session. Affiche le temps ecoule et la liste des onglets sauvegardes.
- **Props** : `session: SessionData`, `onResume`, `onClear`, `onDismiss`
- **Stores** : aucun

---

## 6. Kanban

### KanbanBoard.tsx
- **Fichier** : `src/renderer/components/KanbanBoard.tsx`
- **Role** : Tableau Kanban complet avec 5 colonnes (A faire, En cours, En attente, Termine, Echoue). Supporte la creation de taches avec priorite, le drag & drop entre colonnes, un panneau de detail (edition titre/description, changement statut/priorite), et l'envoi de taches a Claude (cree un onglet terminal avec la commande `claude -p`). Donnees persistees dans `.workspaces/kanban.json`.
- **Stores** : `kanbanStore`, `workspaceStore`, `terminalTabStore`, `viewStore`

---

## 7. Git

### GitPanel.tsx
- **Fichier** : `src/renderer/components/GitPanel.tsx`
- **Role** : Vue Git complete. Comprend :
  - **Header** : branche active, indicateurs ahead/behind, boutons Fetch/Pull/Push/Stash/Pop
  - **Sidebar branches** : branches locales/remote avec checkout, merge, renommage, suppression via menu contextuel ; stashes
  - **Graphe de commits** : visualisation SVG avec lignes de couleur, badges de ref (HEAD, branches, tags), selection pour voir le detail
  - **Zone changes** : fichiers staged/modified/untracked avec stage/unstage/discard, zone de commit (Cmd+Enter), et diff inline
  - **Barre de statut** : compteurs de fichiers modifies, staged, untracked, commits
  - Peut initialiser un depot Git si le projet n'en a pas
- **Stores** : `workspaceStore`

---

## 8. NPM

### NpmPanel.tsx
- **Fichier** : `src/renderer/components/NpmPanel.tsx`
- **Role** : Gestionnaire de packages NPM. Analyse le package.json du projet actif et affiche tous les packages avec leur version actuelle. Filtres par type (deps, devDeps), packages obsoletes, et mises a jour disponibles. Permet la mise a jour individuelle ou globale. Feedback visuel avec auto-dismiss.
- **Stores** : `workspaceStore`

---

## 9. Utilitaires

### ContextMenu.tsx
- **Fichier** : `src/renderer/components/ContextMenu.tsx`
- **Role** : Menu contextuel reutilisable. Se positionne aux coordonnees du clic, s'ajuste pour rester dans le viewport, se ferme au clic exterieur. Supporte les separateurs et les items dangereux (rouge).
- **Props** : `x`, `y`, `items: ContextMenuItem[]`, `onClose`

### ConfirmModal.tsx
- **Fichier** : `src/renderer/components/ConfirmModal.tsx`
- **Role** : Modal de confirmation reutilisable. Supporte les raccourcis Escape (annuler) et Enter (confirmer), clic sur overlay pour fermer, et style danger optionnel.
- **Props** : `title`, `message`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `danger`

### ErrorBoundary.tsx
- **Fichier** : `src/renderer/components/ErrorBoundary.tsx`
- **Role** : Composant class React qui capture les erreurs de rendu. Affiche un message d'erreur avec un bouton "Recharger". Utilise autour de l'app entiere et de la sidebar.

### SettingsPanel.tsx
- **Fichier** : `src/renderer/components/SettingsPanel.tsx`
- **Role** : Panneau de preferences. Sections : Apparence (theme sombre/clair/systeme, taille et famille de police), Terminal (shell par defaut, scrollback), Claude (couleur de detection, auto-clauder), Notifications (son, verification MAJ au lancement). Persistence via IPC `window.kanbai.settings`.
- **Stores** : aucun (etat local, persistance IPC)

### NotificationCenter.tsx
- **Fichier** : `src/renderer/components/NotificationCenter.tsx`
- **Role** : Centre de notifications dans la TitleBar. Icone cloche avec badge de compteur. Affiche un panneau deroulant avec les mises a jour disponibles (outils de dev), permet l'installation individuelle ou globale, et affiche le statut de la derniere verification.
- **Stores** : `updateStore`

---

## 10. State Management (Zustand Stores)

### workspaceStore
- **Fichier** : `src/renderer/lib/stores/workspaceStore.ts`
- **Role** : Store central pour les workspaces et projets.
- **Etat** : `workspaces`, `projects`, `activeWorkspaceId`, `activeProjectId`, `initialized`, `pendingClaudeImport`
- **Actions principales** :
  - `init` : charge les workspaces et projets depuis le main process, scanne les .claude
  - `createWorkspaceFromFolder` : ouvre un selecteur de dossier, cree le workspace + projet, setup l'env, et cree un onglet split Claude+Terminal
  - `addProject` / `removeProject` / `moveProject` : gestion des projets avec rebuild de l'env workspace
  - `setActiveWorkspace` : active un workspace, selectionne le premier projet, cree un onglet split si aucun n'existe
  - `rescanClaude` / `rescanAllClaude` : detection des dossiers .claude
  - `navigateWorkspace` : navigation cyclique entre workspaces

### terminalTabStore
- **Fichier** : `src/renderer/lib/stores/terminalTabStore.ts`
- **Role** : Gestion des onglets terminal et de leur arbre de panes.
- **Etat** : `tabs: TerminalTabData[]`, `activeTabId`
- **Types** : `PaneLeaf` (feuille avec sessionId et initialCommand), `PaneSplit` (noeud avec direction, ratio, et deux enfants), `PaneNode` (union)
- **Actions principales** :
  - `createTab` / `createSplitTab` : creation d'onglets simples ou pre-splittes
  - `splitPane` / `closePane` : split horizontal/vertical (max 4 panes), fermeture avec promotion du sibling
  - `resizePane` : ajustement du ratio d'un split (clamp 0.1-0.9)
  - `toggleZoomPane` : zoom/dezoom d'un pane unique
  - `focusDirection` : navigation directionnelle entre panes (calcul par position geometrique)
  - `activateNext` / `activatePrev` / `activateByIndex` : navigation entre onglets, scopee par workspace
- **Exports utilitaires** : `computePaneRects`, `computeSplitDividers`, `countLeaves`, `collectLeafIds`

### kanbanStore
- **Fichier** : `src/renderer/lib/stores/kanbanStore.ts`
- **Role** : Gestion des taches Kanban par projet.
- **Etat** : `tasks`, `isLoading`, `draggedTaskId`, `currentProjectPath`
- **Actions principales** :
  - `loadTasks` : charge les taches depuis le fichier kanban du projet
  - `createTask` : cree une tache avec titre, description, priorite
  - `updateTaskStatus` / `updateTask` / `deleteTask` : CRUD avec persistance
  - `setDragged` : gestion du drag & drop entre colonnes

### claudeStore
- **Fichier** : `src/renderer/lib/stores/claudeStore.ts`
- **Role** : Gestion des sessions Claude Code.
- **Etat** : `sessions: ClaudeSession[]`, `flashingSessionId`
- **Actions principales** :
  - `startSession` : demarre une session avec prompt optionnel, mode boucle, et delai
  - `stopSession` : arrete une session
  - `initListeners` : ecoute les evenements de fin de session (notification macOS + animation flash)

### viewStore
- **Fichier** : `src/renderer/lib/stores/viewStore.ts`
- **Role** : Gestion de la vue active et de l'etat de l'editeur.
- **Etat** : `viewMode` (terminal | git | kanban | file | npm | diff | claude | settings), `selectedFilePath`, `isEditorDirty`, `availableMagicTabs`, `selectedFiles`, `diffFiles`, `clipboardPath`
- **Actions principales** :
  - `setViewMode` : change la vue active
  - `openFile` : ouvre un fichier dans le FileViewer
  - `toggleFileSelection` : selection multi-fichier pour diff (max 2, auto-ouverture du diff)
  - `setClipboard` / `clearClipboard` : presse-papier interne pour copier/coller des fichiers

### updateStore
- **Fichier** : `src/renderer/lib/stores/updateStore.ts`
- **Role** : Verification et installation des mises a jour d'outils.
- **Etat** : `updates: UpdateInfo[]`, `isChecking`, `lastChecked`, `installingTool`, `installStatus`
- **Actions principales** :
  - `checkUpdates` : interroge le main process pour les mises a jour disponibles
  - `installUpdate` : installe une mise a jour specifique puis re-verifie
