# Plan de documentation - Kanbai

## Analyse de l'existant

### Documents actuels
- **ARCHITECTURE.md** (871 lignes) : Architecture detaillee mais partiellement desynchronisee
- **CLAUDE.md** : Configuration agent team, conventions de developpement

### Ecarts ARCHITECTURE.md vs implementation reelle
- Persistance : `better-sqlite3` decrit vs `electron-store` utilise
- Structure : `features/` planifie vs `components/` flat reel
- Domaines manquants : Git (18 canaux IPC), File System (8), NPM, Workspace Env, Session Recovery
- Canaux IPC : ~60 reels vs ~30 documentes

### Inventaire du code reel
- 27 composants React (`src/renderer/components/`)
- 12 handlers IPC (`src/main/ipc/`)
- 6 stores Zustand (`src/renderer/lib/stores/`)
- 19 fichiers de test (6 unit + 10 integration + 3 autres)
- 1 preload avec API riche (12 domaines)
- 7 fichiers CSS

---

## Documents a creer

### 1. README.md (CRITIQUE)
Premier point de contact. Presentation, features, installation, scripts npm, structure, tests, build.
~150 lignes.

### 2. docs/IPC-API.md (HAUTE)
Reference exhaustive des ~60 canaux IPC reels, organisee par domaine, avec types et exemples.
~300 lignes.

### 3. docs/COMPONENTS.md (MOYENNE)
Catalogue des 27 composants React : role, props, stores associes.
~250 lignes.

### 4. docs/TESTING.md (MOYENNE)
Guide de test : lancer, ecrire, patterns existants, mocks.
~150 lignes.

### 5. docs/CONTRIBUTING.md (BASSE)
Guide de contribution : setup, conventions, checklist nouveau feature, securite.
~120 lignes.

## Action supplementaire recommandee
Mise a jour de ARCHITECTURE.md pour refleter l'implementation reelle.

## Ordre d'execution
Documents 1-4 en parallele (independants), puis document 5 (references croisees).
