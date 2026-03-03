# Guide de contribution

## Setup du projet

### Prerequis

- **macOS** (application Electron native macOS)
- **Node.js** LTS (>= 20)
- **npm** (inclus avec Node.js)

### Installation

```bash
git clone <repo-url>
cd Workspace
npm install
```

### Lancement en developpement

```bash
npm run dev
```

Cela lance Vite + Electron avec hot reload. Le renderer se recharge automatiquement, le main process necessite un redemarrage.

### IDE recommande

**VS Code** avec les extensions suivantes :
- TypeScript (inclus)
- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)

---

## Conventions de code

### TypeScript

- **Strict mode** active partout
- **Pas de `any`** sauf justification documentee en commentaire
- Verifier les types : `npm run typecheck`

### ESLint

Configuration dans `eslint.config.mjs`. Lancer :

```bash
npm run lint        # Verifier
npm run lint:fix    # Corriger automatiquement
```

### Prettier

Configuration dans `.prettierrc` :
- Pas de point-virgule (`semi: false`)
- Guillemets simples (`singleQuote: true`)
- Virgules trainantes (`trailingComma: "all"`)
- Largeur max 100 caracteres (`printWidth: 100`)
- Indentation 2 espaces (`tabWidth: 2`)

```bash
npm run format      # Formater tous les fichiers
```

---

## Conventions de commits

On utilise **Conventional Commits** en **francais**.

### Types

| Type       | Usage                          |
|------------|--------------------------------|
| `feat`     | Nouvelle fonctionnalite        |
| `fix`      | Correction de bug              |
| `docs`     | Documentation                  |
| `style`    | Formatage, pas de changement logique |
| `refactor` | Refactoring sans changement fonctionnel |
| `test`     | Ajout ou modification de tests |
| `chore`    | Maintenance, dependances, CI   |

### Exemples

```
feat: ajout du panneau Git
fix: correction du split terminal
docs: mise a jour du guide de contribution
test: ajout des tests d'integration IPC workspace
```

---

## Architecture en bref

```
src/
  main/           # Main Process (Node.js)
    ipc/          #   Handlers IPC (git, workspace, terminal...)
    services/     #   Services (storage, PTY, Claude session)
  preload/        # Preload scripts (contextBridge → window.kanbai)
  renderer/       # Renderer Process (React)
    components/   #   Composants UI (GitPanel, KanbanBoard, Terminal...)
    lib/stores/   #   Stores Zustand (workspaceStore, etc.)
    styles/       #   Fichiers CSS
  shared/         # Types TypeScript partages entre processus
    types/        #   Interfaces et constantes (IPC_CHANNELS)
```

**Flux de communication** : Renderer → preload (`window.kanbai`) → IPC → Main Process

---

## Ajouter une fonctionnalite - Checklist

1. Definir les types dans `src/shared/types/index.ts`
2. Ajouter la constante de canal IPC dans `IPC_CHANNELS`
3. Creer le handler IPC dans `src/main/ipc/`
4. Exposer via le preload dans `src/preload/index.ts`
5. Creer/mettre a jour le store Zustand dans `src/renderer/lib/stores/`
6. Creer le composant React dans `src/renderer/components/`
7. Ajouter le CSS dans `src/renderer/styles/`
8. Ecrire les tests unitaires dans `tests/unit/`
9. Ecrire les tests d'integration dans `tests/integration/`

---

## Securite Electron

Regles **non negociables** :

- `contextIsolation: true` — **JAMAIS** desactiver
- `nodeIntegration: false` — **JAMAIS** activer dans le renderer
- Tout acces Node.js passe par le preload bridge uniquement
- Valider toutes les entrees dans les handlers IPC
- Pas de `shell.openExternal` avec des URLs non validees
- Pas d'utilisation du module `remote`

---

## Tests

```bash
npm test              # Lancer tous les tests (Vitest)
npm run test:watch    # Mode watch
npm run test:coverage # Avec couverture de code
```

| Dossier              | Contenu                  |
|----------------------|--------------------------|
| `tests/unit/`        | Tests unitaires          |
| `tests/integration/` | Tests d'integration IPC  |

Voir [TESTING.md](./TESTING.md) pour le guide complet.

---

## Build et distribution

```bash
npm run build         # Build de developpement (Vite)
npm run build:app     # Build + packaging macOS DMG (electron-builder)
```

Le packaging utilise `electron-builder` avec hardened runtime pour macOS.

---

## Liens utiles

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Architecture systeme complete
- [IPC-API.md](./IPC-API.md) — Reference API IPC
- [COMPONENTS.md](./COMPONENTS.md) — Catalogue des composants
- [STORES.md](./STORES.md) — Stores Zustand (gestion d'etat)
- [KEYBOARD-SHORTCUTS.md](./KEYBOARD-SHORTCUTS.md) — Raccourcis clavier
- [SECURITY.md](./SECURITY.md) — Guide securite Electron
- [TESTING.md](./TESTING.md) — Guide de tests
