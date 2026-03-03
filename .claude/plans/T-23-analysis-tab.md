# Plan Architectural - T-23: Onglet Code Analysis

## 1. Handler IPC Main Process (`src/main/ipc/analysis.ts`)

### Structure

```typescript
export function registerAnalysisHandlers(ipcMain: IpcMain): void
```

### Handlers

#### `ANALYSIS_DETECT_TOOLS` - Detection des outils installes

- Parcourt une liste statique `TOOL_REGISTRY: AnalysisToolDef[]` (sans le champ `installed`)
- Pour chaque outil, execute `which <command>` (ou `command -v`) via `execSync` avec timeout 3s
- Retourne `AnalysisToolDef[]` avec `installed: true/false`
- Pas d'acces reseau, pas de telechargement

#### `ANALYSIS_RUN` - Execution d'une analyse

- Recoit `AnalysisRunOptions` (projectPath, toolId, extraArgs?)
- Valide que `projectPath` existe et que `toolId` est dans le registre
- **SECURITE**: Valide projectPath contre path traversal (doit etre absolu, pas de `..`)
- **SECURITE**: toolId valide contre la liste statique (pas d'injection de commande)
- Lance la commande avec `child_process.spawn` (pas `exec` - pas d'injection shell)
- Envoie `ANALYSIS_PROGRESS` au renderer via `webContents.send()` pendant l'execution
- Parse la sortie JSON/SARIF selon le tool
- Genere un `AnalysisReport` avec un `id` uuid
- Retourne `{ success: true, report: AnalysisReport }` ou `{ success: false, error: string }`

#### `ANALYSIS_CREATE_TICKETS` - Creation de tickets Kanban

- Recoit `AnalysisTicketRequest`
- Lit le rapport en memoire (le handler gardera un cache Map<reportId, AnalysisReport> des derniers rapports)
- Groupe les findings selon `groupBy`
- Cree les `KanbanTask` via la meme logique que `kanban.ts` (lecture/ecriture du fichier kanban.json)
- Retourne `{ success: true, ticketCount: number }`

### Registre des outils (`TOOL_REGISTRY`)

Chaque entree definit comment lancer l'outil et parser sa sortie:

```typescript
interface ToolRunner {
  def: Omit<AnalysisToolDef, 'installed'>
  buildArgs: (projectPath: string, extraArgs?: string[]) => string[]
  parseOutput: (stdout: string, stderr: string, projectPath: string) => AnalysisFinding[]
}
```

**Outils et parsers**:

| Outil | Commande | Flag JSON | Parser |
|-------|----------|-----------|--------|
| Semgrep | `semgrep scan` | `--json` | JSON natif (results[].check_id, path, start.line, etc.) |
| Bandit | `bandit -r` | `-f json` | JSON natif (results[].filename, line_number, severity, etc.) |
| ESLint | `eslint` | `-f json` | JSON natif ([].filePath, messages[].line, severity, etc.) |
| OSV-Scanner | `osv-scanner` | `--json` | JSON natif (results[].packages[].vulnerabilities[]) |
| Trivy | `trivy fs` | `-f json` | JSON natif (Results[].Vulnerabilities[]) |
| Checkov | `checkov -d` | `-o json` | JSON natif (results.failed_checks[]) |
| Graudit | `graudit -B` | (text) | Parser regex ligne par ligne (file:line: message) |
| Bearer | `bearer scan` | `-f json` | JSON natif |
| PMD | `pmd check` | `-f json` | JSON natif (files[].violations[]) |
| Cppcheck | `cppcheck` | `--output-file=` | XML parser (errors[]) |
| Pylint | `pylint` | `-f json` | JSON natif ([].path, line, message, symbol) |
| MegaLinter | `mega-linter-runner` | (text) | Parser rapport megalinter-reports/ |

**Strategie de parsing**: Chaque parser normalise vers `AnalysisFinding[]`. La severite est mappee depuis la terminologie de chaque outil vers notre enum `AnalysisSeverity`.

### Gestion des progres

Pendant l'execution de `spawn`, le handler :
1. Envoie `{ toolId, status: 'running', message: 'Starting...' }` immediatement
2. Lit `stdout` ligne par ligne pour estimer la progression
3. Envoie `{ toolId, status: 'done' }` ou `{ toolId, status: 'error', message }` a la fin
4. Utilise `BrowserWindow.getAllWindows()[0].webContents.send()` pour les push events

## 2. API Preload (`src/preload/index.ts`)

Ajouter un namespace `analysis` dans l'objet `api`:

```typescript
// Code Analysis
analysis: {
  detectTools: (): Promise<AnalysisToolDef[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_DETECT_TOOLS),
  run: (options: AnalysisRunOptions): Promise<{ success: boolean; report?: AnalysisReport; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_RUN, options),
  createTickets: (request: AnalysisTicketRequest): Promise<{ success: boolean; ticketCount?: number; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_CREATE_TICKETS, request),
  onProgress: (callback: (data: AnalysisProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnalysisProgress) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ANALYSIS_PROGRESS, listener)
  },
},
```

Import types supplementaires dans la ligne d'import existante:
`AnalysisToolDef, AnalysisRunOptions, AnalysisReport, AnalysisTicketRequest, AnalysisProgress`

## 3. Architecture Renderer

### Composant principal: `CodeAnalysisPanel.tsx`

Un seul fichier composant (pattern identique a `TodoScanner.tsx`, `DatabaseExplorer.tsx`), decoupage interne en sections via des fonctions locales (pas de sous-fichiers sauf si > 500 lignes).

### State Management

State local via `useState` (pas de store Zustand dedie - meme pattern que les autres panels):

```typescript
// Etat principal
const [tools, setTools] = useState<AnalysisToolDef[]>([])
const [loadingTools, setLoadingTools] = useState(true)
const [selectedTool, setSelectedTool] = useState<string | null>(null)
const [running, setRunning] = useState(false)
const [progress, setProgress] = useState<AnalysisProgress | null>(null)

// Rapports
const [reports, setReports] = useState<AnalysisReport[]>([])  // historique des rapports de la session
const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null)

// Filtrage
const [severityFilter, setSeverityFilter] = useState<Set<AnalysisSeverity>>(new Set(['critical', 'high', 'medium', 'low', 'info']))
const [fileFilter, setFileFilter] = useState<string>('')
const [ruleFilter, setRuleFilter] = useState<string>('')

// Selection pour tickets
const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set())
const [ticketModalOpen, setTicketModalOpen] = useState(false)
```

### Layout du composant (sections)

```
+-------------------------------------------------------+
| HEADER: titre + badge count + bouton refresh tools     |
+-------------------------------------------------------+
| TOOLBAR: selection outil + bouton "Analyser"           |
|          [barre de progression si running]              |
+-------------------------------------------------------+
| SUMMARY BAR: badges critical/high/medium/low/info      |
+-------------------------------------------------------+
| FILTERS: severity toggles | recherche fichier | regle  |
+-------------------------------------------------------+
| FINDINGS LIST (groupes par fichier):                   |
|  [checkbox] fichier.ts (12 findings)                   |
|    [x] L.42 [HIGH] message... rule-name                |
|    [ ] L.78 [MEDIUM] message... rule-name              |
|  [checkbox] autre.ts (3 findings)                      |
|    ...                                                  |
+-------------------------------------------------------+
| FOOTER: "X selectionnes" + bouton "Creer tickets"      |
+-------------------------------------------------------+
```

### Sous-sections en fonctions locales

1. **renderToolSelector()** - Dropdown/liste des outils detectes, groupes par categorie (security/quality/dependencies/infrastructure), outils non installes en grise avec tooltip "Non installe"
2. **renderProgressBar()** - Barre animee pendant l'analyse avec message status
3. **renderSummaryBar()** - Badges cliquables par severite (cliquer toggle le filtre)
4. **renderFilters()** - Input recherche fichier + input recherche regle
5. **renderFindingsList()** - Liste groupee par fichier, chaque finding est cliquable pour ouvrir le fichier (via `openFile()` du viewStore), checkbox pour selection
6. **renderTicketModal()** - Modal inline pour configurer la creation de tickets (choix groupBy, priority, projet cible)

### Interactions cles

- **Ouvrir fichier**: Clic sur un finding appelle `openFile(fullPath, line)` (pattern TodoScanner)
- **Selection findings**: Checkboxes individuelles + "selectionner tout le fichier"
- **Creation tickets**: Ouvre modal inline, appelle `window.kanbai.analysis.createTickets()`
- **Detection outils**: Au montage du composant (`useEffect` sur `activeProject`)
- **Progression**: `useEffect` avec `window.kanbai.analysis.onProgress()`, cleanup au unmount

## 4. Plan CSS (`src/renderer/styles/analysis.css`)

Nouveau fichier CSS, importe dans `global.css` ou directement dans le composant.

### Classes principales

```css
.analysis-panel { ... }           /* conteneur flex vertical */
.analysis-header { ... }          /* titre + actions */
.analysis-toolbar { ... }         /* selection outil + run */
.analysis-tool-selector { ... }   /* dropdown categorise */
.analysis-tool-item { ... }       /* item dans la liste outils */
.analysis-tool-item--disabled { ... }  /* outil non installe */
.analysis-progress { ... }        /* barre de progression */
.analysis-summary { ... }         /* badges severite */
.analysis-severity-badge { ... }  /* badge individuel */
.analysis-filters { ... }         /* zone filtres */
.analysis-findings { ... }        /* liste des findings */
.analysis-file-group { ... }      /* groupe par fichier */
.analysis-file-header { ... }     /* en-tete fichier (pattern todo-scanner-file-header) */
.analysis-finding { ... }         /* ligne finding individuel */
.analysis-finding-severity { ... } /* badge severite inline */
.analysis-finding-message { ... }  /* texte du message */
.analysis-finding-rule { ... }     /* lien vers la regle */
.analysis-footer { ... }          /* barre selection + actions */
.analysis-ticket-modal { ... }    /* modal creation tickets */
```

### Variables couleurs severite

```css
.analysis-severity-badge--critical { background: var(--danger); }
.analysis-severity-badge--high { background: #fab387; }  /* warning orange */
.analysis-severity-badge--medium { background: #f9e2af; color: #1e1e2e; }  /* jaune */
.analysis-severity-badge--low { background: var(--accent); }
.analysis-severity-badge--info { background: var(--text-muted); }
```

## 5. Integration dans le projet

### 5.1 viewStore.ts

Ajouter `'analysis'` au type union `ViewMode`:

```typescript
export type ViewMode = 'terminal' | 'git' | 'kanban' | 'file' | 'npm' | 'diff' | 'claude' | 'settings' | 'todos' | 'shortcuts' | 'stats' | 'search' | 'prompts' | 'api' | 'database' | 'analysis'
```

### 5.2 App.tsx

1. Import du composant:
```typescript
import { CodeAnalysisPanel } from './components/CodeAnalysisPanel'
```

2. Bouton dans le view-switcher (apres le bouton 'database'):
```tsx
<button
  className={`view-btn${viewMode === 'analysis' ? ' view-btn--active' : ''}`}
  onClick={() => setViewMode('analysis')}
>
  {t('view.analysis')}
</button>
```

3. Panel dans view-content:
```tsx
{viewMode === 'analysis' && (
  <div className="view-panel" style={{ display: 'flex' }}>
    <CodeAnalysisPanel />
  </div>
)}
```

### 5.3 main/index.ts

1. Import:
```typescript
import { registerAnalysisHandlers } from './ipc/analysis'
```

2. Enregistrement (apres `registerSshHandlers`):
```typescript
registerAnalysisHandlers(ipcMain)
```

3. Menu View - ajouter entree "Analyse" avec accelerateur `CmdOrCtrl+6`:
```typescript
{
  label: isFr ? 'Analyse de code' : 'Code Analysis',
  accelerator: 'CmdOrCtrl+6',
  click: () => sendMenuAction('view:analysis'),
},
```

### 5.4 i18n

**fr.ts** - Nouvelles cles:
```typescript
'view.analysis': 'Analyse',
'analysis.title': 'Analyse de code',
'analysis.selectProject': 'Selectionnez un projet pour analyser.',
'analysis.detectingTools': 'Detection des outils...',
'analysis.noToolsInstalled': 'Aucun outil d\'analyse installe. Installez Semgrep, Bandit, ESLint, etc.',
'analysis.selectTool': 'Choisir un outil',
'analysis.run': 'Analyser',
'analysis.running': 'Analyse en cours...',
'analysis.findings': '{count} problemes',
'analysis.noFindings': 'Aucun probleme detecte.',
'analysis.severity.critical': 'Critique',
'analysis.severity.high': 'Eleve',
'analysis.severity.medium': 'Moyen',
'analysis.severity.low': 'Faible',
'analysis.severity.info': 'Info',
'analysis.filterFile': 'Filtrer par fichier...',
'analysis.filterRule': 'Filtrer par regle...',
'analysis.selected': '{count} selectionnes',
'analysis.createTickets': 'Creer tickets',
'analysis.ticketModal.title': 'Creer des tickets Kanban',
'analysis.ticketModal.groupBy': 'Regrouper par',
'analysis.ticketModal.groupBy.individual': 'Finding individuel',
'analysis.ticketModal.groupBy.file': 'Fichier',
'analysis.ticketModal.groupBy.rule': 'Regle',
'analysis.ticketModal.groupBy.severity': 'Severite',
'analysis.ticketModal.priority': 'Priorite',
'analysis.ticketModal.create': 'Creer {count} tickets',
'analysis.ticketModal.created': '{count} tickets crees !',
'analysis.category.security': 'Securite',
'analysis.category.quality': 'Qualite',
'analysis.category.dependencies': 'Dependances',
'analysis.category.infrastructure': 'Infrastructure',
'analysis.notInstalled': 'Non installe',
'analysis.duration': 'Duree: {duration}s',
'analysis.openFile': 'Ouvrir dans l\'editeur',
```

**en.ts** - Memes cles en anglais.

### 5.5 CSS import

Dans le fichier d'entree CSS principal, ajouter:
```css
@import './analysis.css';
```

## 6. Points d'attention securite Electron

1. **Pas de shell injection**: Utiliser `spawn` avec un tableau d'arguments, jamais `exec` avec une string concatenee. Le `toolId` est valide contre une liste statique.

2. **Path traversal**: Valider que `projectPath` est un chemin absolu et ne contient pas `..` relatif. Verifier avec `path.resolve` et comparer.

3. **Pas d'evaluation dynamique**: Les sorties d'outils sont parsees via `JSON.parse` (pas `eval`).

4. **Timeout des commandes**: Chaque `spawn` a un timeout configurable (defaut 5 minutes). Kill SIGTERM puis SIGKILL apres 10s.

5. **contextIsolation maintenu**: L'API preload expose uniquement des wrappers `invoke/on`, aucun objet Node.js.

6. **Sanitization des snippets**: Les `snippet` dans les findings sont affiches en `textContent` (pas `innerHTML`). React gere ca nativement.

7. **Validation des inputs IPC**: Le handler valide tous les arguments recus (types, valeurs attendues) avant execution.

## 7. Dependances entre taches

```
T1: Handler IPC (analysis.ts)  -- aucune dependance
T2: API Preload                -- depend de T1 (types de retour)
T3: CSS analysis.css           -- aucune dependance
T4: CodeAnalysisPanel.tsx      -- depend de T2 et T3
T5: Integration App.tsx/viewStore/i18n/menu -- depend de T4
T6: Tests                      -- depend de T5
```

T1 et T3 peuvent etre parallelises.
T2 peut commencer des que T1 est termine.
T4 attend T2 et T3.

## 8. Hors scope (a traiter dans des tickets futurs)

- Persistance des rapports sur disque (pour l'instant en memoire session)
- Configuration avancee par outil (fichiers de regles custom)
- Export des rapports en PDF/HTML
- Comparaison de rapports (diff entre 2 analyses)
- Integration avec GitHub Security Advisories
