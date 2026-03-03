# Securite Electron

## Principes fondamentaux

Kanbai respecte les bonnes pratiques de securite Electron. Le modele de securite repose sur l'**isolation stricte** entre le processus renderer (non fiable) et le processus main (privilegie).

```
┌──────────────────────────┐     ┌───────────────────────────┐
│     RENDERER PROCESS     │     │      MAIN PROCESS         │
│  (React, xterm.js)       │     │  (Node.js, file system)   │
│                          │     │                           │
│  ✗ Pas d'acces Node.js   │←IPC→│  ✓ Acces complet OS       │
│  ✗ Pas d'acces filesystem │     │  ✓ Spawn de processus     │
│  ✓ window.kanbai.* only  │     │  ✓ Lecture/ecriture        │
└──────────────────────────┘     └───────────────────────────┘
            ↑
     contextBridge
     (preload/index.ts)
```

---

## 1. Configuration BrowserWindow

```typescript
// src/main/index.ts
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,     // OBLIGATOIRE - isole le contexte du renderer
    nodeIntegration: false,     // OBLIGATOIRE - pas de Node.js dans le renderer
    sandbox: false,             // Desactive pour node-pty (preload a besoin de Node)
    webSecurity: true,          // CSP et CORS actifs
    preload: path.join(__dirname, '../preload/index.js'),
  },
})
```

### Pourquoi sandbox: false ?

Le preload script doit acceder a `node-pty` pour creer des pseudo-terminaux. `sandbox: false` est le compromis minimal : `nodeIntegration` reste desactive, donc le renderer n'a toujours **aucun acces direct** a Node.js. Seul le preload script peut utiliser les API Node.

---

## 2. Preload et contextBridge

Le preload script (`src/preload/index.ts`) expose une API structuree par domaine sous `window.kanbai` :

```typescript
contextBridge.exposeInMainWorld('kanbai', {
  terminal: { create, write, resize, close, onData, onClose },
  workspace: { list, create, update, delete },
  project: { list, add, remove, scanClaude, ... },
  fs: { readDir, readFile, writeFile, ... },
  git: { status, log, commit, push, ... },
  // ...
})
```

**Regles** :
- Chaque methode est un wrapper fin autour de `ipcRenderer.invoke()` ou `ipcRenderer.send()`
- Aucun module Node.js n'est expose directement
- Les callbacks d'events (`onData`, `onClose`, etc.) retournent une fonction de cleanup

---

## 3. Validation IPC

Chaque handler IPC dans le main process (`src/main/ipc/`) est responsable de valider ses parametres. La validation est manuelle (pas de Zod).

**Exemples de validation** :
- Les chemins de fichiers sont verifies comme existants avant les operations
- Les IDs sont verifies comme non-vides
- Les operations git sont scopees au `cwd` fourni

---

## 4. Operations sensibles

### Systeme de fichiers

Le handler `filesystem.ts` :
- Refuse de lire les fichiers > 5 Mo
- Utilise `fs.rm` avec `recursive: true` pour les suppressions (pas de shell)
- Les operations sont effectuees via les API Node.js natives (pas de `child_process`)

### Claude Code

Le handler `claude.ts` :
- Lance Claude via `child_process.spawn` avec des arguments pre-construits
- Le flag `--dangerously-skip-permissions` est utilise pour le mode non-interactif
- Les sessions sont trackees en memoire et nettoyees au quit de l'app
- Maximum 3 erreurs consecutives avant arret automatique

### Git

Le handler `git.ts` :
- Toutes les commandes sont scopees au `cwd` fourni
- Les commandes sont executees via `child_process.execFile` (pas de shell)
- Les arguments sont passes comme tableau (pas d'injection possible)

---

## 5. Ce qui n'est PAS utilise

| Module/Feature | Statut | Raison |
|---------------|--------|--------|
| `remote` module | Non utilise | Deprecie et dangereux — permet l'acces direct au main process |
| `shell.openExternal` | Non utilise | Risque d'ouverture d'URLs malveillantes |
| `eval` / `Function()` | Non utilise | CSP les interdit |
| `webFrame.executeJavaScript` | Non utilise | Injection de code arbitraire |
| `protocol.registerHttpProtocol` | Non utilise | Risque de man-in-the-middle |

---

## 6. Regles non negociables

1. **`contextIsolation: true`** — JAMAIS desactiver
2. **`nodeIntegration: false`** — JAMAIS activer dans le renderer
3. **Tout acces Node.js passe par le preload bridge uniquement**
4. **Valider toutes les entrees dans les handlers IPC**
5. **Pas de `shell.openExternal`** avec des URLs non validees
6. **Pas de module `remote`** (deprecie et dangereux)
7. **Pas de secrets dans le code source** (.env, tokens, credentials)

---

## 7. Points d'amelioration potentiels

| Amelioration | Statut | Impact |
|-------------|--------|--------|
| Activer `sandbox: true` | Bloque par node-pty | Isolerait davantage le preload |
| Ajouter une CSP stricte via `session.defaultSession.webRequest` | A implementer | Bloque scripts/styles externes |
| Valider les chemins de fichiers contre un whitelist | A implementer | Empeche la lecture hors workspaces |
| Ajouter Zod pour la validation IPC | A evaluer | Validation formelle des payloads |
| Code signing + notarization | Configure (electron-builder) | Distribution securisee sur macOS |
