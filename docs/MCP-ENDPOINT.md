# Kanbai MCP Server

Serveur MCP (Model Context Protocol) qui expose les fonctionnalites Kanbai a Claude sous forme d'outils structures.

## Architecture

Le serveur MCP est un processus Node.js standalone qui communique via stdio (JSON-RPC 2.0). Il lit et ecrit les memes fichiers JSON que l'application Electron, permettant une synchronisation automatique grace au file watcher existant.

```
src/mcp-server/
  index.ts              # Point d'entree (bootstrap stdio)
  tools/
    kanban.ts           # CRUD kanban (5 tools)
    analysis.ts         # Analyse de code (4 tools)
    project.ts          # Observation projet (3 tools)
  lib/
    kanban-store.ts     # Read/write kanban JSON (partage avec main process)
    analysis-runner.ts  # Execution analyse (partage avec main process)
    context.ts          # Resolution contexte workspace via env vars
```

## Outils exposes (13)

### Kanban (5)

| Tool | Description | Contrainte |
|------|-------------|------------|
| `kanban_list` | Lister les tickets (filtres: status, priority) | |
| `kanban_get` | Obtenir un ticket par ID ou numero | |
| `kanban_create` | Creer un ticket | Status force a **TODO** |
| `kanban_update` | Modifier un ticket | **PENDING** interdit |
| `kanban_delete` | Supprimer un ticket | |

### Analyse (4)

| Tool | Description |
|------|-------------|
| `analysis_detect_tools` | Detecter les outils installes (semgrep, trivy, etc.) |
| `analysis_run` | Lancer une analyse sur un projet |
| `analysis_list_reports` | Lister les rapports d'analyse |
| `analysis_create_tickets` | Creer des tickets Kanban depuis les findings |

### Projet (4)

| Tool | Description |
|------|-------------|
| `project_list` | Lister les projets du workspace |
| `project_scan_info` | Scanner un projet (git, Makefile, packages) |
| `project_setup_claude_rules` | Configurer CLAUDE.md et .claude/settings.json |
| `workspace_info` | Info du workspace courant |

## Configuration

Le serveur est automatiquement enregistre dans `.claude/settings.local.json` lors du setup du workspace. La configuration est de la forme :

```json
{
  "mcpServers": {
    "kanbai": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/mcp-server/index.ts"],
      "env": {
        "KANBAI_WORKSPACE_ID": "<uuid>",
        "KANBAI_WORKSPACE_NAME": "Workspace"
      }
    }
  }
}
```

En production (app packagee), `command` est `node` et `args` pointe vers le JS compile dans l'asar unpacked.

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `KANBAI_WORKSPACE_ID` | UUID du workspace (requis) |
| `KANBAI_WORKSPACE_NAME` | Nom du workspace (requis) |

## Regles metier

- **kanban_create** : le status est toujours force a `TODO`. L'IA gere son propre backlog sans passer par `PENDING`.
- **kanban_update** : le status `PENDING` est interdit via MCP. Seuls `TODO`, `WORKING`, `DONE` et `FAILED` sont autorises.
- Le file watcher existant dans l'app Electron detecte automatiquement les modifications du fichier kanban et rafraichit l'UI.

## Build

```bash
# Compiler le serveur MCP separement
npm run build:mcp

# Tester manuellement
KANBAI_WORKSPACE_ID=<uuid> KANBAI_WORKSPACE_NAME=Workspace npx tsx src/mcp-server/index.ts
```

## Test manuel

Envoyer une requete JSON-RPC via stdin :

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"workspace_info","arguments":{}}}
```
