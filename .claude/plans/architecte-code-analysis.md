# Plan Architectural - Onglet Code Analysis (T-23)

## 1. Vue d'ensemble

Ajouter un onglet "Analysis" dans l'application Kanbai qui permet d'executer des outils SAST/SCA locaux (semgrep, eslint, bandit, graudit, bearer, osv-scanner, trivy) sur les projets, d'afficher les rapports, et de creer selectivement des tickets Kanban a partir des findings.

## 2. Types existants (deja dans shared/types/index.ts L498-552)

Les types suivants sont deja definis et seront reutilises tels quels :
- `AnalysisSeverity`, `AnalysisToolCategory`
- `AnalysisToolDef`, `AnalysisFinding`, `AnalysisReport`, `AnalysisRunOptions`

### 2.1 Types additionnels a ajouter (shared/types/index.ts)

```typescript
// Ticket creation from findings (selective)
export interface AnalysisTicketRequest {
  findingIds: string[]         // IDs des findings selectionnes
  reportId: string
  workspaceId: string
  targetProjectId?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  groupBy: 'individual' | 'file' | 'rule' | 'severity'
}

// Progress event for long-running analysis
export interface AnalysisProgress {
  toolId: string
  status: 'running' | 'done' | 'error'
  message?: string
}
```

## 3. IPC Channels (shared/types/index.ts - bloc IPC_CHANNELS)

Ajouter dans le bloc IPC_CHANNELS :

```typescript
// Code Analysis
ANALYSIS_LIST_TOOLS: 'analysis:listTools',
ANALYSIS_RUN: 'analysis:run',
ANALYSIS_CANCEL: 'analysis:cancel',
ANALYSIS_LIST_REPORTS: 'analysis:listReports',
ANALYSIS_GET_REPORT: 'analysis:getReport',
ANALYSIS_DELETE_REPORT: 'analysis:deleteReport',
ANALYSIS_PROGRESS: 'analysis:progress',
ANALYSIS_CREATE_TICKETS: 'analysis:createTickets',
```

## 4. Main Process - Service analysis (src/main/ipc/analysis.ts)

### 4.1 Structure du fichier

```
export function registerAnalysisHandlers(ipcMain: IpcMain): void
```

Suit le meme pattern que `kanban.ts` : un seul fichier avec toutes les fonctions helpers privees + un export `registerAnalysisHandlers`.

### 4.2 Handlers IPC

| Channel | Input | Output | Description |
|---------|-------|--------|-------------|
| `ANALYSIS_LIST_TOOLS` | `{ projectPath: string }` | `AnalysisToolDef[]` | Detecte les outils installes via `which`/`command -v`. Retourne le catalogue complet avec `installed: true/false`. |
| `ANALYSIS_RUN` | `AnalysisRunOptions` | `AnalysisReport` | Execute l'outil via `child_process.spawn`, parse la sortie JSON, construit le `AnalysisReport`. Envoie des `ANALYSIS_PROGRESS` events pendant l'execution. |
| `ANALYSIS_CANCEL` | `{ toolId: string }` | `void` | Kill le process en cours pour cet outil. |
| `ANALYSIS_LIST_REPORTS` | `{ projectPath: string }` | `AnalysisReport[]` | Liste les rapports sauvegardes pour ce projet (sommaire sans findings). |
| `ANALYSIS_GET_REPORT` | `{ reportId: string }` | `AnalysisReport` | Retourne un rapport complet avec tous les findings. |
| `ANALYSIS_DELETE_REPORT` | `{ reportId: string }` | `void` | Supprime un rapport sauvegarde. |
| `ANALYSIS_CREATE_TICKETS` | `AnalysisTicketRequest` | `{ created: number }` | Cree des tickets Kanban a partir des findings selectionnes, selon le mode de groupement. |

### 4.3 Catalogue d'outils (constante interne)

Un tableau `ANALYSIS_TOOLS_CATALOG: AnalysisToolDef[]` defini dans le fichier, contenant la configuration de chaque outil supporte :

```typescript
const ANALYSIS_TOOLS_CATALOG: Omit<AnalysisToolDef, 'installed'>[] = [
  { id: 'semgrep', name: 'Semgrep', command: 'semgrep', category: 'security', description: 'SAST rules-based', languages: ['python','js','ts','go','java','ruby','c','cpp'], jsonFlag: '--json' },
  { id: 'eslint', name: 'ESLint', command: 'eslint', category: 'quality', description: 'JS/TS linter', languages: ['js','ts','jsx','tsx'], jsonFlag: '-f json' },
  { id: 'bandit', name: 'Bandit', command: 'bandit', category: 'security', description: 'Python security', languages: ['python'], jsonFlag: '-f json' },
  { id: 'graudit', name: 'Graudit', command: 'graudit', category: 'security', description: 'Grep-based audit', languages: ['*'], jsonFlag: '' },
  { id: 'bearer', name: 'Bearer', command: 'bearer', category: 'security', description: 'SAST scanner', languages: ['js','ts','ruby','python','java','go','php'], jsonFlag: '--format json' },
  { id: 'osv-scanner', name: 'OSV-Scanner', command: 'osv-scanner', category: 'dependencies', description: 'Dep vulnerability scanner', languages: ['*'], jsonFlag: '--format json' },
  { id: 'trivy', name: 'Trivy', command: 'trivy', category: 'dependencies', description: 'Vulnerability scanner', languages: ['*'], jsonFlag: '-f json' },
]
```

### 4.4 Parsers de sortie

Chaque outil a un parser dedie :
- `parseSemgrepOutput(json: unknown): AnalysisFinding[]`
- `parseEslintOutput(json: unknown): AnalysisFinding[]`
- `parseBanditOutput(json: unknown): AnalysisFinding[]`
- `parseBearerOutput(json: unknown): AnalysisFinding[]`
- `parseOsvOutput(json: unknown): AnalysisFinding[]`
- `parseTrivyOutput(json: unknown): AnalysisFinding[]`
- `parseGrauditOutput(text: string): AnalysisFinding[]` (graudit n'a pas de sortie JSON)

Tous ces parsers sont des fonctions pures dans le meme fichier. Pattern : normaliser vers `AnalysisFinding[]`.

### 4.5 Stockage des rapports

Les rapports sont stockes dans `~/.kanbai/analysis/<projectHash>/<reportId>.json`.
- `projectHash` = hash court du chemin du projet (pour eviter les caracteres speciaux)
- Un fichier `index.json` liste les rapports (summaries sans findings) pour un chargement rapide
- Chaque rapport complet est un fichier `<reportId>.json`

### 4.6 Creation de tickets Kanban

Le handler `ANALYSIS_CREATE_TICKETS` :
1. Recoit les IDs des findings selectionnes + le mode de groupement
2. Lit le rapport complet pour retrouver les findings
3. Selon `groupBy`:
   - `individual`: 1 ticket par finding
   - `file`: 1 ticket par fichier (groupe les findings du meme fichier)
   - `rule`: 1 ticket par rule ID (groupe les findings de la meme regle)
   - `severity`: 1 ticket par niveau de severite
4. Cree les tickets via la meme logique que `readKanbanTasks/writeKanbanTasks` (reutiliser les fonctions du kanban)
5. Le titre du ticket contient : `[Analysis] <tool> - <groupLabel>`
6. La description contient le detail des findings groupes (fichier, ligne, message, snippet)

## 5. Preload API (src/preload/index.ts)

Ajouter une section `analysis:` dans l'objet `api` :

```typescript
analysis: {
  listTools: (projectPath: string): Promise<AnalysisToolDef[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_LIST_TOOLS, { projectPath }),
  run: (options: AnalysisRunOptions): Promise<AnalysisReport> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_RUN, options),
  cancel: (toolId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_CANCEL, { toolId }),
  listReports: (projectPath: string): Promise<AnalysisReport[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_LIST_REPORTS, { projectPath }),
  getReport: (reportId: string): Promise<AnalysisReport> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_GET_REPORT, { reportId }),
  deleteReport: (reportId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_DELETE_REPORT, { reportId }),
  createTickets: (request: AnalysisTicketRequest): Promise<{ created: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_CREATE_TICKETS, request),
  onProgress: (callback: (data: AnalysisProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnalysisProgress) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ANALYSIS_PROGRESS, listener)
  },
},
```

Ajouter les imports necessaires : `AnalysisToolDef, AnalysisRunOptions, AnalysisReport, AnalysisTicketRequest, AnalysisProgress`.

## 6. ViewStore (src/renderer/lib/stores/viewStore.ts)

Ajouter `'analysis'` au type `ViewMode` :

```typescript
export type ViewMode = 'terminal' | 'git' | 'kanban' | 'file' | 'npm' | 'diff' | 'claude' | 'settings' | 'todos' | 'shortcuts' | 'stats' | 'search' | 'prompts' | 'api' | 'database' | 'analysis'
```

## 7. Zustand Store - analysisStore (src/renderer/lib/stores/analysisStore.ts)

### 7.1 State

```typescript
interface AnalysisState {
  tools: AnalysisToolDef[]
  reports: AnalysisReport[]
  activeReport: AnalysisReport | null
  runningTools: Set<string>           // outils en cours d'execution
  selectedFindings: Set<string>       // IDs des findings selectionnes pour ticket creation
  filterSeverity: AnalysisSeverity | 'all'
  filterTool: string | 'all'
  sortBy: 'severity' | 'file' | 'tool'
  isLoading: boolean
}
```

### 7.2 Actions

```typescript
interface AnalysisActions {
  loadTools: (projectPath: string) => Promise<void>
  runTool: (options: AnalysisRunOptions) => Promise<void>
  cancelTool: (toolId: string) => Promise<void>
  loadReports: (projectPath: string) => Promise<void>
  viewReport: (reportId: string) => Promise<void>
  deleteReport: (reportId: string) => Promise<void>
  toggleFinding: (findingId: string) => void
  selectAllFindings: () => void
  clearSelection: () => void
  selectFindingsBySeverity: (severity: AnalysisSeverity) => void
  setFilterSeverity: (severity: AnalysisSeverity | 'all') => void
  setFilterTool: (toolId: string | 'all') => void
  setSortBy: (sort: 'severity' | 'file' | 'tool') => void
  createTickets: (workspaceId: string, groupBy: AnalysisTicketRequest['groupBy'], priority: KanbanTask['priority'], targetProjectId?: string) => Promise<number>
}
```

## 8. Composant CodeAnalysisPanel (src/renderer/components/CodeAnalysisPanel.tsx)

### 8.1 Hierarchie de composants

```
CodeAnalysisPanel
├── AnalysisToolbar
│   ├── Tool selector (dropdown des outils installes)
│   ├── Run button
│   └── Reports history dropdown
├── AnalysisToolsList
│   └── AnalysisToolCard (x N)
│       ├── Tool name + category badge
│       ├── Install status indicator
│       └── Run/Cancel button
├── AnalysisReportView (quand un rapport est selectionne)
│   ├── ReportHeader
│   │   ├── Summary badges (critical/high/medium/low/info counts)
│   │   ├── Duration + timestamp
│   │   └── Tool name
│   ├── FindingsFilterBar
│   │   ├── Severity filter chips
│   │   ├── Sort dropdown
│   │   └── Selection controls (select all / clear)
│   ├── FindingsList
│   │   └── FindingItem (x N)
│   │       ├── Checkbox (pour selection ticket)
│   │       ├── Severity badge
│   │       ├── File path + line (clickable -> ouvre le fichier)
│   │       ├── Message
│   │       ├── Rule ID + link (si disponible)
│   │       └── Code snippet (collapsible)
│   └── TicketCreationBar (visible quand selection > 0)
│       ├── Selection count
│       ├── Group by selector (individual/file/rule/severity)
│       ├── Priority selector
│       └── "Create tickets" button
```

### 8.2 Interactions cles

1. **Lancer une analyse** : Select tool -> Click "Run" -> Progress indicator -> Report auto-affiché
2. **Naviguer vers le code** : Click sur un filepath dans un finding -> `viewStore.openFile(path, line)`
3. **Creer des tickets** : Cocher les findings -> Choisir groupement + priorite -> Click "Create tickets" -> Tickets crees dans le Kanban
4. **Historique** : Dropdown pour voir les rapports precedents

### 8.3 Props

Le composant CodeAnalysisPanel est standalone (comme GitPanel, McpPanel) :
- Pas de props, il utilise les stores (analysisStore, workspaceStore, viewStore, kanbanStore)
- Le projectPath courant vient de `workspaceStore`

## 9. Integration dans App.tsx

### 9.1 Import + bouton nav

Ajouter le bouton dans la barre de navigation (entre 'database' et le separateur) :

```tsx
<button
  className={`view-btn${viewMode === 'analysis' ? ' view-btn--active' : ''}`}
  onClick={() => setViewMode('analysis')}
  title={t('nav.analysis')}
>
  {t('nav.analysis')}
</button>
```

### 9.2 Panel conditionnel

```tsx
{viewMode === 'analysis' && (
  <div className="view-panel">
    <CodeAnalysisPanel />
  </div>
)}
```

## 10. Enregistrement main process (src/main/index.ts)

```typescript
import { registerAnalysisHandlers } from './ipc/analysis'
// ...
registerAnalysisHandlers(ipcMain)
```

## 11. Traductions i18n

### fr.ts (section analysis)

```typescript
'nav.analysis': 'Analyse',
'analysis.title': 'Analyse de code',
'analysis.tools': 'Outils',
'analysis.toolInstalled': 'Installe',
'analysis.toolNotInstalled': 'Non installe',
'analysis.run': 'Lancer',
'analysis.running': 'Analyse en cours...',
'analysis.cancel': 'Annuler',
'analysis.noTools': 'Aucun outil d\'analyse detecte',
'analysis.reports': 'Rapports',
'analysis.noReports': 'Aucun rapport',
'analysis.deleteReport': 'Supprimer le rapport',
'analysis.findings': 'Resultats',
'analysis.noFindings': 'Aucun probleme detecte',
'analysis.severity.critical': 'Critique',
'analysis.severity.high': 'Eleve',
'analysis.severity.medium': 'Moyen',
'analysis.severity.low': 'Faible',
'analysis.severity.info': 'Info',
'analysis.filter.all': 'Tous',
'analysis.sort.severity': 'Par severite',
'analysis.sort.file': 'Par fichier',
'analysis.sort.tool': 'Par outil',
'analysis.createTickets': 'Creer des tickets',
'analysis.createTicketsCount': '{count} finding(s) selectionne(s)',
'analysis.groupBy.individual': 'Un ticket par finding',
'analysis.groupBy.file': 'Grouper par fichier',
'analysis.groupBy.rule': 'Grouper par regle',
'analysis.groupBy.severity': 'Grouper par severite',
'analysis.ticketsCreated': '{count} ticket(s) cree(s)',
'analysis.selectAll': 'Tout selectionner',
'analysis.clearSelection': 'Deselectionner',
'analysis.line': 'Ligne {line}',
'analysis.duration': 'Duree: {duration}s',
'analysis.error': 'Erreur lors de l\'analyse',
'analysis.category.security': 'Securite',
'analysis.category.quality': 'Qualite',
'analysis.category.dependencies': 'Dependances',
'analysis.category.infrastructure': 'Infrastructure',
```

### en.ts (section analysis - equivalent)

Traductions anglaises correspondantes.

## 12. Plan d'implementation (ordre des taches)

### Phase 1 : Types et IPC channels (shared)
1. Ajouter `AnalysisTicketRequest` et `AnalysisProgress` dans `shared/types/index.ts`
2. Ajouter les 8 IPC channels `ANALYSIS_*` dans `IPC_CHANNELS`

### Phase 2 : Main process service
3. Creer `src/main/ipc/analysis.ts` avec :
   - Catalogue d'outils + detection d'installation
   - Execution d'outils + parsers de sortie (semgrep, eslint, bandit, bearer, osv-scanner, trivy, graudit)
   - Stockage/lecture de rapports (~/.kanbai/analysis/)
   - Creation de tickets Kanban a partir des findings
4. Enregistrer dans `src/main/index.ts`

### Phase 3 : Preload + Store
5. Ajouter la section `analysis` dans `src/preload/index.ts`
6. Ajouter `'analysis'` au type `ViewMode` dans `viewStore.ts`
7. Creer `src/renderer/lib/stores/analysisStore.ts`

### Phase 4 : UI Component
8. Creer `src/renderer/components/CodeAnalysisPanel.tsx`
9. Integrer dans `App.tsx` (import, bouton nav, panel)

### Phase 5 : i18n
10. Ajouter les traductions fr + en

### Phase 6 : Tests
11. Tests unitaires des parsers (semgrep, eslint, etc.)
12. Tests du store analysisStore
13. Tests d'integration IPC

## 13. Decisions architecturales

1. **Un seul fichier IPC** (`analysis.ts`) plutot qu'un dossier services/ - coherent avec le pattern existant (kanban.ts, ssh.ts, etc.)
2. **Parsers dans le meme fichier** - ce sont des fonctions pures simples, pas besoin de modules separes
3. **Stockage fichier** (JSON dans `~/.kanbai/analysis/`) - coherent avec le kanban qui utilise `~/.kanbai/kanban/`
4. **Reutilisation du Kanban** pour la creation de tickets - on appelle les memes fonctions `readKanbanTasks/writeKanbanTasks` depuis le handler IPC
5. **Selection explicite** des findings pour les tickets - jamais de creation automatique de masse
6. **Groupement flexible** - l'utilisateur choisit comment grouper les findings en tickets
7. **Pas de polling** - l'evenement `ANALYSIS_PROGRESS` est envoye via `BrowserWindow.webContents.send()` (meme pattern que `KANBAN_FILE_CHANGED`)
