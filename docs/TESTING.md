# Guide de test

## Stack de test

| Outil | Version | Role |
|-------|---------|------|
| Vitest | 3.x | Framework de test |
| @vitest/coverage-v8 | 3.x | Couverture de code |
| Node.js | - | Environnement d'execution (`environment: 'node'`) |

Configuration dans `vitest.config.ts` : globals actives, fichiers de setup automatiques (`tests/setup.ts`), alias de chemins (`@shared`, `@main`, `@renderer`).

## Lancer les tests

| Commande | Description |
|----------|-------------|
| `npm test` / `make test` | Lance tous les tests une fois |
| `npm run test:watch` / `make test-watch` | Mode watch (relance au changement) |
| `npm run test:coverage` / `make test-coverage` | Tests + rapport de couverture (text, html, lcov) |

Les 380 tests passent actuellement.

## Structure des dossiers

```
tests/
  setup.ts              # Nettoyage des mocks apres chaque test (vi.restoreAllMocks)
  mocks/
    electron.ts         # Mocks IpcMain, BrowserWindow, dialog, Notification
  helpers/
    storage.ts          # Repertoire temporaire et utilitaires fichiers pour StorageService
  unit/                 # 7 fichiers - logique metier isolee
  integration/          # 12 fichiers - handlers IPC avec vrai filesystem/git
```

## Tests unitaires (7 fichiers)

Tests de logique pure, sans I/O reseau. Utilisent des mocks pour isoler le code.

| Fichier | Tests | Cible |
|---------|-------|-------|
| `storage.test.ts` | 24 | `StorageService` - persistence JSON, CRUD workspaces/projets/kanban/templates |
| `workspaceStore.test.ts` | 20 | Store Zustand - init, CRUD, selection active, setup env |
| `terminalTabStore.test.ts` | 36 | Store tabs/panes terminal - split, resize, navigation |
| `viewStore.test.ts` | 37 | Store modes de vue - toggles, persistence etat |
| `updates.test.ts` | - | Logique de mise a jour |
| `collapseExpand.test.ts` | 11 | Collapse/expand des panels |
| `types.test.ts` | 12 | Validation des types partages |

### Pattern : test unitaire StorageService

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock os.homedir pour isoler le repertoire de donnees
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, default: { ...actual, homedir: () => TEST_DIR } }
})

const { StorageService, _resetForTesting } = await import('../../src/main/services/storage')

describe('StorageService', () => {
  beforeEach(() => {
    _resetForTesting()  // Reset du singleton
    service = new StorageService()
  })

  it('ajoute un workspace et le persiste', () => {
    service.addWorkspace(workspace)
    expect(service.getWorkspaces()).toHaveLength(1)
  })
})
```

### Pattern : test unitaire Store Zustand

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock de l'API window.kanbai (preload bridge)
const mockWorkspaceApi = { list: vi.fn(), create: vi.fn(), /* ... */ }
vi.stubGlobal('window', { kanbai: { workspace: mockWorkspaceApi } })

const { useWorkspaceStore } = await import('../../src/renderer/lib/stores/workspaceStore')

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ workspaces: [], initialized: false })
    vi.clearAllMocks()
  })

  it('charge les workspaces et marque initialized', async () => {
    mockWorkspaceApi.list.mockResolvedValue([ws])
    await useWorkspaceStore.getState().init()
    expect(useWorkspaceStore.getState().initialized).toBe(true)
  })
})
```

## Tests d'integration (12 fichiers)

Chaque fichier teste un module IPC complet : enregistrement des handlers, invocation, resultats. Les tests git utilisent de vrais depots git temporaires.

| Fichier | Cible |
|---------|-------|
| `git-ipc.test.ts` | 21 channels git (init, status, log, branches, commit, diff, stash...) |
| `workspace-ipc.test.ts` | CRUD workspaces via IPC |
| `workspaceEnv-ipc.test.ts` | Setup environnement workspace (symlinks, .workspaces) |
| `project-ipc.test.ts` | CRUD projets, selection dossier |
| `kanban-ipc.test.ts` | Taches kanban via IPC |
| `terminal-ipc.test.ts` | Creation/gestion sessions terminal (node-pty) |
| `terminal-session-navigation.test.ts` | Navigation entre sessions terminal |
| `session-ipc.test.ts` | Sessions applicatives |
| `claude-ipc.test.ts` | Integration Claude AI |
| `filesystem-ipc.test.ts` | Operations fichiers (lecture, ecriture, listdir) |
| `app-ipc.test.ts` | Handlers application (settings, theme) |
| `updates-ipc.test.ts` | Verification mises a jour |

### Pattern : test d'integration IPC

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockIpcMain } from '../mocks/electron'

describe('Mon IPC Handler', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()
    const { registerMyHandlers } = await import('../../src/main/ipc/myModule')
    mockIpcMain = createMockIpcMain()
    registerMyHandlers(mockIpcMain as never)
  })

  it('enregistre tous les handlers', () => {
    expect(mockIpcMain._handlers.has('myModule:action')).toBe(true)
  })

  it('execute une action', async () => {
    const result = await mockIpcMain._invoke('myModule:action', { param: 'value' })
    expect(result).toEqual({ success: true })
  })
})
```

## Mocks

### Mock IpcMain (`tests/mocks/electron.ts`)

`createMockIpcMain()` simule `ipcMain` d'Electron avec :
- `handle(channel, handler)` / `on(channel, listener)` : enregistrement
- `_invoke(channel, ...args)` : appel d'un handler (simule `ipcRenderer.invoke`)
- `_emit(channel, ...args)` : emission d'un event (simule `ipcRenderer.send`)
- `_handlers` / `_listeners` : Maps pour verification directe

Autres mocks disponibles : `createMockBrowserWindow()`, `createMockDialog()`, `createMockNotification()`.

### Mock de l'API preload (stores renderer)

Pour tester les stores Zustand qui appellent `window.kanbai.*` :

```typescript
const mockApi = { list: vi.fn(), create: vi.fn() }
vi.stubGlobal('window', { kanbai: { workspace: mockApi } })
```

### Mock du filesystem (StorageService)

Rediriger `os.homedir()` vers un repertoire temporaire pour isoler les tests de persistence :

```typescript
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, default: { ...actual, homedir: () => '/tmp/test' } }
})
```

## Couverture de code

```bash
npm run test:coverage
```

Genere trois rapports :
- **text** : affiche dans le terminal
- **html** : ouvrir `coverage/index.html`
- **lcov** : pour integration CI

Perimetre : `src/**/*.ts`, excluant `src/renderer/**` et les fichiers `index.ts`.

## Zones non testees

| Zone | Raison |
|------|--------|
| Composants React (`src/renderer/components/`) | 0 tests - pas de setup jsdom/testing-library |
| `claudeStore` | Store non couvert |
| `kanbanStore` | Store non couvert |
| Tests E2E (Playwright/Spectron) | Non mis en place |
| Preload scripts | Testes indirectement via les tests d'integration IPC |
