# Plan Architectural - 8 Axes d'Amelioration

## Vue d'ensemble

Ce plan couvre 8 axes d'amelioration pour Kanbai, organises par priorite d'implementation et dependances.

---

## AXE 1 : Editeur de code avec coloration syntaxique (Monaco Editor)

### Analyse
Le `FileViewer.tsx` actuel utilise `<pre><code>` sans coloration ni edition. L'objectif est de le remplacer par Monaco Editor (meme editeur que VS Code) avec support ecriture et raccourci Cmd+S.

### Nouveaux types/interfaces

```typescript
// Dans shared/types/index.ts
export const IPC_CHANNELS = {
  // ... existant
  FS_WRITE_FILE: 'fs:writeFile',  // NOUVEAU
}
```

### Nouveau canal IPC : `fs:writeFile`

**Fichier**: `src/main/ipc/filesystem.ts`
```typescript
ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, async (_event, { path: filePath, content }: { path: string; content: string }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
```

### Modifications preload

**Fichier**: `src/preload/index.ts` - ajouter dans `fs`:
```typescript
writeFile: (filePath: string, content: string): Promise<{ success: boolean; error: string | null }> =>
  ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, { path: filePath, content }),
```

### Modification viewStore

**Fichier**: `src/renderer/lib/stores/viewStore.ts`
- Ajouter `isEditorDirty: boolean` dans l'etat
- Ajouter `setEditorDirty: (dirty: boolean) => void`

### Remplacement FileViewer

**Fichier**: `src/renderer/components/FileViewer.tsx` - refonte complete
- Remplacer `<pre><code>` par le composant Monaco Editor
- Detecter le langage a partir de l'extension du fichier
- Ajouter un indicateur "modifie" (dot sur le header)
- Implementer Cmd+S pour sauvegarder via `window.kanbai.fs.writeFile()`
- Ajouter bouton "Enregistrer" dans le header
- Mode lecture seule pour les fichiers > 5Mo (coherent avec la limite existante)

### Dependance npm

```
npm install @monaco-editor/react monaco-editor
```

### Theme Monaco
- Configurer le theme Catppuccin Mocha pour correspondre au CSS existant
- Couleurs de base: `--bg-primary` (#1e1e2e), `--text-primary` (#cdd6f4)

### CSS : `src/renderer/styles/global.css`
- Supprimer `.file-viewer-code` (plus utilise)
- Ajouter `.file-viewer-editor` pour le container Monaco (flex: 1, overflow: hidden)
- Ajouter `.file-viewer-dirty-dot` pour l'indicateur de modification
- Ajouter `.file-viewer-save-btn` pour le bouton sauvegarder

---

## AXE 2 : Placement du panneau Claude Config

### Analyse
Actuellement dans `ProjectItem.tsx`, le `ClaudeInfoPanel` apparait APRES le `SidebarFileTree` (lignes 145-156). Il faut le deplacer AVANT l'arbre de fichiers (juste sous le nom du projet).

De plus, le nom du projet utilise `--claude-color` (#7c3aed violet) quand il a Claude. Il faut :
- Couleur par defaut : blanc (`--text-primary`)
- Couleur si Git detecte : orange (`--warning` = #fab387)

### Modifications

**Fichier**: `src/renderer/components/ProjectItem.tsx`
- Inverser l'ordre : ClaudeInfoPanel AVANT SidebarFileTree dans le JSX
- La condition reste la meme (`project.hasClaude && showClaudeInfo`)

```tsx
{/* AVANT : Claude info panel directement sous le nom du projet */}
{project.hasClaude && showClaudeInfo && (
  <ClaudeInfoPanel projectPath={project.path} onClose={() => setShowClaudeInfo(false)} />
)}

{/* APRES : File tree */}
{isActive && (
  <div className="project-item-filetree">
    <SidebarFileTree projectPath={project.path} />
  </div>
)}
```

**Fichier**: `src/renderer/components/ProjectItem.tsx`
- Ajouter une prop `hasGit` au composant (a obtenir depuis ProjectInfo)
- Ou bien : enrichir le type `Project` avec `hasGit?: boolean` (plus propre car evite un scan par projet)

**Fichier**: `src/shared/types/index.ts`
```typescript
export interface Project {
  // ... existant
  hasGit?: boolean  // NOUVEAU - detecte au scan
}
```

**Fichier**: `src/main/ipc/project.ts` - dans PROJECT_ADD handler:
```typescript
const hasGit = fs.existsSync(path.join(data.path, '.git'))
```
Ajouter `hasGit` a l'objet Project cree.

**Fichier**: `src/renderer/styles/global.css`
- Modifier `.project-item--claude .project-item-name` : remplacer `color: var(--text-primary)` par `color: var(--text-primary)` (pas de changement, violet supprime)
- Supprimer `.project-item--claude.project-item--active .project-item-name` (plus de violet)
- Ajouter `.project-item--git .project-item-name { color: var(--warning); }` (orange pour les projets Git)
- Le violet est completement retire du nom de projet

---

## AXE 3 : Collapse/expand des dossiers et projets

### Analyse
Probleme actuel : quand on change de projet actif, on ne voit pas clairement quel projet est collapse. L'objectif est :
1. Cliquer sur un dossier/projet dans la sidebar collapse son contenu
2. Changer de projet actif ne doit PAS collapser les autres projets

### Modifications

**Fichier**: `src/renderer/components/ProjectItem.tsx`
- Le `SidebarFileTree` n'est affiche QUE quand `isActive`. Il faut changer cette logique.
- Ajouter un etat local `expanded` (boolean, defaut: false, passe a true quand isActive change a true)
- Le file tree est affiche si `expanded` ET le projet a ete clique au moins une fois
- Cliquer sur le projet toggle `expanded` (si deja actif) OU set active + expanded (si pas actif)

```tsx
const [expanded, setExpanded] = useState(isActive)

const handleClick = useCallback(() => {
  if (isActive) {
    // Deja actif : toggle collapse
    setExpanded(prev => !prev)
  } else {
    // Pas actif : activer et deployer
    setActiveProject(project.id)
    setExpanded(true)
  }
}, [project.id, isActive, setActiveProject])

// Afficher le file tree si expanded (independant de isActive)
{expanded && (
  <div className="project-item-filetree">
    <SidebarFileTree projectPath={project.path} />
  </div>
)}
```

- Ajouter un chevron de collapse a gauche du nom du projet pour montrer l'etat expanded/collapsed.

### CSS

- Ajouter `.project-item-chevron` (similaire a `.workspace-item-chevron`) pour le chevron du projet
- Animation de rotation du chevron (0deg -> 90deg)

---

## AXE 4 : Environnement virtuel du workspace

### Analyse
`workspaceEnv.ts` est deja fonctionnel (cree des symlinks dans `~/.kanbai/envs/{workspaceId}/`).
L'integration manquante est :
1. A la creation/import d'un workspace, appeler `setupWorkspaceEnv` automatiquement
2. Le terminal doit naviguer dans l'env virtuel quand le workspace est active

### Modifications

**Fichier**: `src/renderer/lib/stores/workspaceStore.ts`
- Dans `createWorkspaceFromFolder` : appeler `setupWorkspaceEnv` apres l'ajout du projet
- Dans `setActiveWorkspace` : c'est deja partiellement fait via `getWorkspaceCwd()` qui utilise l'env virtuel pour les multi-projets

La logique existante dans `getWorkspaceCwd` est correcte :
- 1 projet : utilise le path direct
- N projets : cree l'env virtuel et l'utilise

**Amelioration** : s'assurer que `setupWorkspaceEnv` est appele systematiquement dans :
- `createWorkspaceFromFolder()` - APRES l'ajout du projet
- `addProject()` - deja fait (ligne 196)
- `removeProject()` - deja fait (ligne 218)

C'est deja quasi-complet. Seul ajout : dans `createWorkspaceFromFolder`, apres la creation du split tab, appeler `setupWorkspaceEnv`.

---

## AXE 5 : Import .claude dans le workspace

### Analyse
Quand un projet est ajoute a un workspace et qu'il n'a PAS de `.claude`, on doit proposer de :
1. Importer le `.claude` depuis le template de l'app (comme le deploy actuel)
2. Proposer a Claude de definir le `CLAUDE.md` du workspace

### Nouveaux types

```typescript
// Pas de nouveau type necessaire, on reutilise l'existant
```

### Modifications

**Fichier**: `src/renderer/lib/stores/workspaceStore.ts` - dans `addProject`:
- Apres le scan Claude, si `!project.hasClaude`, retourner un signal pour que l'UI puisse proposer l'import
- Ajouter un champ `pendingClaudeImport: string | null` (projectId) dans le store

```typescript
interface WorkspaceState {
  // ... existant
  pendingClaudeImport: string | null  // NOUVEAU
}
```

**Fichier**: `src/renderer/components/ProjectItem.tsx` ou nouveau composant `ClaudeImportModal.tsx`
- Quand `pendingClaudeImport` correspond au projet, afficher un modal :
  "Ce projet n'a pas de configuration Claude. Voulez-vous deployer .claude ?"
  - Bouton "Deployer" -> appelle `project.deployClaude`
  - Bouton "Ignorer" -> ferme le modal

### Workflow

1. Utilisateur ajoute un projet au workspace
2. Scan Claude -> pas de .claude
3. Le store set `pendingClaudeImport = project.id`
4. Le composant detecte et affiche le modal
5. L'utilisateur choisit de deployer ou non
6. Le store reset `pendingClaudeImport = null`

---

## AXE 6 : Fix Git pour les repos vides

### Analyse
Dans `src/main/ipc/git.ts`, `git rev-parse --abbrev-ref HEAD` echoue si le repo n'a aucun commit. Meme chose pour `git log`. L'erreur est silencieusement catchee mais retourne `null` pour le status, ce qui cache le probleme.

### Modifications

**Fichier**: `src/main/ipc/git.ts`

Pour `GIT_STATUS`:
```typescript
ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_event, { cwd }) => {
  try {
    let branch: string
    try {
      branch = exec('git rev-parse --abbrev-ref HEAD', cwd)
    } catch {
      // Pas de commits : verifier si c'est un repo git quand meme
      try {
        exec('git rev-parse --git-dir', cwd)
        // C'est un repo git mais sans commits
        branch = '(aucun commit)'

        // On peut quand meme lire le status
        const statusOutput = exec('git status --porcelain', cwd)
        // ... parser les fichiers untracked/staged
        return { branch, ahead: 0, behind: 0, staged: [], modified: [], untracked: [...] }
      } catch {
        return null // Pas un repo git du tout
      }
    }
    // ... reste du code existant
  } catch {
    return null
  }
})
```

Pour `GIT_LOG`:
```typescript
// Ajouter un try-catch specifique pour les repos sans commits
try {
  const output = exec(`git log -${n} --pretty=format:...`, cwd)
  // ...
} catch {
  // Peut etre un repo sans commits
  return [] // Retourner liste vide au lieu de crasher silencieusement
}
```

Pour `GIT_BRANCHES`:
- Meme logique : catch propre pour les repos sans commits

**Fichier**: `src/main/ipc/project.ts` - dans `PROJECT_SCAN_INFO`:
```typescript
if (hasGit) {
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { ... }).trim()
  } catch {
    // Repo sans commits
    try {
      execSync('git rev-parse --git-dir', { cwd: projectPath, ... })
      gitBranch = '(aucun commit)'
    } catch {
      // Pas vraiment un repo git
    }
  }
}
```

---

## AXE 7 : Fix du Centre de Notifications (comparaison de versions)

### Analyse
Le probleme est dans `src/main/ipc/updates.ts` ligne 92 :
```typescript
updateAvailable: latestVersion !== null && latestVersion !== currentVersion
```

Pour Claude, `getVersion` retourne `"Claude Code 2.1.49"` (car `claude --version` affiche ca). Puis `getLatestNpmVersion('@anthropic-ai/claude-code')` retourne `"2.1.49"`. La comparaison `"Claude Code 2.1.49" !== "2.1.49"` est toujours `true` -> faux positif.

### Modifications

**Fichier**: `src/main/ipc/updates.ts`

1. **Normaliser la version Claude** dans `getVersion()`:
```typescript
async function getVersion(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 10000 })
    let version = stdout.trim()
      .replace(/^v/, '')
      .replace(/^git version /, '')
      .replace(/^Claude Code /, '')  // NOUVEAU : normaliser la sortie Claude
    return version
  } catch {
    return null
  }
}
```

2. **Utiliser une comparaison semver correcte** au lieu de `!==`:
```typescript
function compareVersions(current: string, latest: string): boolean {
  // Extraire uniquement les chiffres de version (x.y.z)
  const extractVersion = (v: string): string => {
    const match = v.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : v
  }

  const c = extractVersion(current)
  const l = extractVersion(latest)

  if (c === l) return false // Meme version = pas de mise a jour

  const cParts = c.split('.').map(Number)
  const lParts = l.split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    if ((lParts[i] ?? 0) > (cParts[i] ?? 0)) return true  // latest > current
    if ((lParts[i] ?? 0) < (cParts[i] ?? 0)) return false // latest < current (downgrade)
  }
  return false
}
```

3. **Remplacer la comparaison** dans `checkToolUpdates()`:
```typescript
results.push({
  tool: tool.name,
  currentVersion: extractVersion(currentVersion),
  latestVersion: latestVersion ? extractVersion(latestVersion) : extractVersion(currentVersion),
  updateAvailable: latestVersion !== null && compareVersions(currentVersion, latestVersion),
  scope: 'global',
})
```

---

## AXE 8 : Magic Tabs (onglets conditionnels)

### Analyse
Les "Magic Tabs" sont des onglets dans le view-switcher (Terminal / Git / Kanban / ...) qui apparaissent dynamiquement en fonction du contenu du projet actif. Exemple : si `package.json` existe, afficher un onglet "NPM" avec les mises a jour des packages.

### Nouveaux types

```typescript
// Dans shared/types/index.ts

export interface MagicTab {
  id: string
  label: string
  icon?: string
  condition: 'package.json' | 'Cargo.toml' | 'pyproject.toml' | 'Gemfile'  // fichier declencheur
}

export interface NpmPackageInfo {
  name: string
  currentVersion: string
  latestVersion: string | null
  isDeprecated: boolean
  updateAvailable: boolean
  type: 'dependency' | 'devDependency'
}

// Nouveau channel IPC
export const IPC_CHANNELS = {
  // ... existant
  PROJECT_CHECK_PACKAGES: 'project:checkPackages',  // NOUVEAU
}
```

### Nouveau canal IPC

**Fichier**: `src/main/ipc/project.ts` - ajouter handler:
```typescript
ipcMain.handle(IPC_CHANNELS.PROJECT_CHECK_PACKAGES, async (_event, { path: projectPath }) => {
  const pkgPath = path.join(projectPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return { packages: [] }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  const results: NpmPackageInfo[] = []
  for (const [name, version] of Object.entries(deps)) {
    try {
      const { stdout } = await execFileAsync('npm', ['view', name, 'version', 'deprecated', '--json'], { timeout: 10000 })
      const info = JSON.parse(stdout)
      results.push({
        name,
        currentVersion: (version as string).replace(/^[\^~]/, ''),
        latestVersion: typeof info === 'string' ? info : info.version,
        isDeprecated: !!info.deprecated,
        updateAvailable: /* compareVersions */,
        type: pkg.dependencies?.[name] ? 'dependency' : 'devDependency',
      })
    } catch {
      results.push({ name, currentVersion: version as string, latestVersion: null, isDeprecated: false, updateAvailable: false, type: 'dependency' })
    }
  }
  return { packages: results }
})
```

### Modification du ViewStore

**Fichier**: `src/renderer/lib/stores/viewStore.ts`
```typescript
export type ViewMode = 'terminal' | 'git' | 'kanban' | 'file' | 'npm'  // NOUVEAU: 'npm'

interface ViewState {
  viewMode: ViewMode
  selectedFilePath: string | null
  availableMagicTabs: string[]  // NOUVEAU: ['npm', ...]
  setViewMode: (mode: ViewMode) => void
  openFile: (filePath: string) => void
  setAvailableMagicTabs: (tabs: string[]) => void  // NOUVEAU
}
```

### Nouveau composant

**Fichier**: `src/renderer/components/NpmPanel.tsx` (NOUVEAU)
- Affiche la liste des packages avec leur version actuelle/derniere
- Indicateur visuel pour les packages deprecated (rouge)
- Indicateur visuel pour les mises a jour disponibles (vert)
- Bouton pour mettre a jour un package individuel
- Filtre par type (dependency / devDependency)

### Modifications App.tsx

**Fichier**: `src/renderer/App.tsx`
- Importer `NpmPanel`
- Dans le view-switcher, afficher les magic tabs conditionnellement:
```tsx
{availableMagicTabs.includes('npm') && (
  <button className={`view-btn${viewMode === 'npm' ? ' view-btn--active' : ''}`}
    onClick={() => setViewMode('npm')}>
    NPM
  </button>
)}
```
- Ajouter le panel dans view-content:
```tsx
{viewMode === 'npm' && (
  <div className="view-panel" style={{ display: 'flex' }}>
    <NpmPanel />
  </div>
)}
```

### Detection des magic tabs

**Fichier**: `src/renderer/App.tsx` ou composant dedie
- Quand `activeProjectId` change, scanner le projet pour detecter les fichiers declencheurs
- Utiliser `window.kanbai.fs.readDir()` pour verifier l'existence de `package.json`
- Mettre a jour `availableMagicTabs` dans le viewStore

### CSS

- `.npm-panel` : layout flex column, fond `--bg-primary`
- `.npm-package-row` : ligne de package avec nom, version, statut
- `.npm-deprecated` : fond rouge subtil
- `.npm-update-available` : badge vert

### Preload

**Fichier**: `src/preload/index.ts` - ajouter dans `project`:
```typescript
checkPackages: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CHECK_PACKAGES, { path }),
```

---

## Resume des dependances NPM a ajouter

```bash
npm install @monaco-editor/react monaco-editor
```

Aucune autre dependance necessaire.

---

## Ordre d'implementation recommande

```
Phase 1 (parallelisable) :
  - Axe 6 : Git fix (pas de dependance, bug fix simple)
  - Axe 7 : Notification fix (pas de dependance, bug fix simple)
  - Axe 2 : Placement Claude panel (CSS + JSX simple)

Phase 2 (apres Phase 1) :
  - Axe 3 : Collapse/expand projets (modifie ProjectItem)
  - Axe 1 : Monaco Editor (nouvelle dependance, refonte FileViewer)

Phase 3 (apres Phase 2) :
  - Axe 4 : Workspace env (amelioration mineure)
  - Axe 5 : Import .claude (depend de ProjectItem stable)

Phase 4 (derniere) :
  - Axe 8 : Magic Tabs (nouveau composant, nouveau IPC, plus complexe)
```

---

## Strategie de tests

### Tests unitaires
- `compareVersions()` : 10+ cas (egal, superieur, inferieur, formats differents, prefix "Claude Code")
- `extractVersion()` : parsing divers formats de version
- `viewStore` : test des nouveaux etats (isEditorDirty, availableMagicTabs)
- Types : validation des nouvelles interfaces

### Tests d'integration IPC
- `fs:writeFile` : ecriture fichier, erreur permission, fichier inexistant
- `project:checkPackages` : package.json valide, invalide, absent
- `git:status` pour repo vide (no commits)
- `git:log` pour repo vide
- `update:check` avec versions Claude normalisees

### Tests specifiques par axe
- **Axe 1** : Test que writeFile ecrit correctement, test du store dirty state
- **Axe 2** : Test CSS (snapshot) du nouvel ordre ClaudeInfoPanel/FileTree
- **Axe 3** : Test du comportement expand/collapse independant de isActive
- **Axe 6** : Test git status/log/branches sur repo sans commits (mock execSync)
- **Axe 7** : Test compareVersions avec tous les edge cases Claude
- **Axe 8** : Test du handler checkPackages, test detection magic tabs

### Fichiers de test a creer/modifier
- `tests/unit/compareVersions.test.ts` (NOUVEAU)
- `tests/integration/filesystem-ipc.test.ts` (NOUVEAU - pour writeFile)
- `tests/integration/git-ipc.test.ts` (MODIFIER - ajouter cas repos vides)
- `tests/integration/updates-ipc.test.ts` (MODIFIER - ajouter cas normalisation Claude)
- `tests/unit/viewStore.test.ts` (NOUVEAU)
- `tests/integration/project-ipc.test.ts` (MODIFIER - ajouter checkPackages)

---

## Changements breaking / migration

- **Aucun changement breaking** : tous les ajouts sont retrocompatibles
- Le type `Project` recoit un champ optionnel `hasGit?: boolean` (pas de migration necessaire)
- Le `ViewMode` est etendu avec `'npm'` (pas de conflit)
- Les projets existants sans `hasGit` se comporteront comme avant (couleur par defaut blanche)

---

## Fichiers modifies (resume complet)

| Fichier | Axe(s) | Nature |
|---------|--------|--------|
| `src/shared/types/index.ts` | 1, 2, 8 | Nouveaux IPC channels, types |
| `src/main/ipc/filesystem.ts` | 1 | Nouveau handler writeFile |
| `src/main/ipc/git.ts` | 6 | Fix repos vides |
| `src/main/ipc/updates.ts` | 7 | Fix comparaison versions |
| `src/main/ipc/project.ts` | 2, 8 | hasGit dans Project, checkPackages |
| `src/preload/index.ts` | 1, 8 | Nouveaux bindings writeFile, checkPackages |
| `src/renderer/lib/stores/viewStore.ts` | 1, 8 | Dirty state, magic tabs, nouveau ViewMode |
| `src/renderer/lib/stores/workspaceStore.ts` | 4, 5 | pendingClaudeImport, env setup |
| `src/renderer/components/FileViewer.tsx` | 1 | Refonte Monaco Editor |
| `src/renderer/components/ProjectItem.tsx` | 2, 3 | Ordre panels, collapse, hasGit |
| `src/renderer/components/NotificationCenter.tsx` | 7 | (pas de changement direct, fix cote main) |
| `src/renderer/components/NpmPanel.tsx` | 8 | NOUVEAU composant |
| `src/renderer/App.tsx` | 8 | Magic tabs dans view-switcher |
| `src/renderer/styles/global.css` | 1, 2, 3, 8 | Styles Monaco, couleurs projet, npm panel |
