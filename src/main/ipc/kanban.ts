import { IpcMain, BrowserWindow, dialog } from 'electron'
import { type ChildProcess } from 'child_process'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, KanbanTask, KanbanTaskType, KanbanStatus, KanbanAttachment, KanbanConfig } from '../../shared/types'
import type { AiProviderId } from '../../shared/types/ai-provider'
import {
  getKanbanPath,
  readKanbanTasks,
  writeKanbanTasks,
  maybeCreateMemoryRefactorTicket,
} from '../../mcp-server/lib/kanban-store'
import { callAiCli } from '../services/ai-cli'
import { IS_WIN } from '../../shared/platform'

const DEFAULT_KANBAN_CONFIG: KanbanConfig = {
  autoCloseCompletedTerminals: false,
  autoCloseCtoTerminals: true,
  autoCreateAiMemoryRefactorTickets: true,
  autoPrequalifyTickets: false,
  autoPrioritizeBugs: true,
  useWorktrees: false,
  autoMergeWorktrees: false,
  maxConcurrentWorktrees: 1,
  paused: false,
}

function getKanbanConfigPath(workspaceId: string): string {
  const kanbanDir = path.join(os.homedir(), '.kanbai', 'kanban')
  return path.join(kanbanDir, `${workspaceId}-config.json`)
}

function getDefaultKanbanConfigPath(): string {
  return path.join(os.homedir(), '.kanbai', 'kanban', 'default-config.json')
}

function readDefaultKanbanConfig(): KanbanConfig {
  const configPath = getDefaultKanbanConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      return { ...DEFAULT_KANBAN_CONFIG, ...JSON.parse(raw) }
    }
  } catch { /* fallback to defaults */ }
  return { ...DEFAULT_KANBAN_CONFIG }
}

function writeDefaultKanbanConfig(config: KanbanConfig): void {
  const configPath = getDefaultKanbanConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function readKanbanConfig(workspaceId: string): KanbanConfig {
  const defaults = readDefaultKanbanConfig()
  const configPath = getKanbanConfigPath(workspaceId)
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      return { ...defaults, ...JSON.parse(raw) }
    }
  } catch { /* fallback to defaults */ }

  // Migration: read from global settings if per-workspace config doesn't exist yet
  try {
    const dataPath = path.join(os.homedir(), '.kanbai', 'data.json')
    if (fs.existsSync(dataPath)) {
      const appData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      const s = appData.settings
      if (s) {
        return {
          autoCloseCompletedTerminals: s.autoCloseCompletedTerminals ?? defaults.autoCloseCompletedTerminals,
          autoCloseCtoTerminals: s.autoCloseCtoTerminals ?? defaults.autoCloseCtoTerminals,
          autoCreateAiMemoryRefactorTickets: s.autoCreateAiMemoryRefactorTickets ?? defaults.autoCreateAiMemoryRefactorTickets,
          autoPrequalifyTickets: s.kanbanSettings?.autoPrequalifyTickets ?? defaults.autoPrequalifyTickets,
          autoPrioritizeBugs: s.kanbanSettings?.autoPrioritizeBugs ?? defaults.autoPrioritizeBugs,
          useWorktrees: defaults.useWorktrees,
          autoMergeWorktrees: defaults.autoMergeWorktrees,
          maxConcurrentWorktrees: defaults.maxConcurrentWorktrees,
          paused: defaults.paused,
        }
      }
    }
  } catch { /* fallback to defaults */ }

  return { ...defaults }
}

function writeKanbanConfig(workspaceId: string, config: KanbanConfig): void {
  const configPath = getKanbanConfigPath(workspaceId)
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Ensures a Claude Stop hook exists to auto-update kanban task status.
 * The hook reads KANBAI_KANBAN_TASK_ID / KANBAI_KANBAN_FILE env vars
 * (only set on kanban sessions) and updates the kanban.json file.
 */
function ensureKanbanHook(projectPath: string): void {
  const hooksDir = path.join(projectPath, '.kanbai', 'hooks')
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }

  const hookScriptName = IS_WIN ? 'kanban-done.ps1' : 'kanban-done.sh'
  const hookScriptPath = path.join(hooksDir, hookScriptName)

  if (IS_WIN) {
    const hookScript = `# Kanbai - Kanban task completion hook (auto-generated, PowerShell)
# Checks the kanban ticket status and writes the appropriate activity status.
# DONE/FAILED -> auto-commit uncommitted worktree changes, merge branch if enabled (worktree cleanup deferred to terminal close)
# PENDING + CTO -> auto-approve: revert to TODO (unblock CTO cycle)
# PENDING + regular -> activity "waiting" (double bell in Electron)
# WORKING -> block Claude from stopping and remind ticket update
$ActivityScript = "$env:USERPROFILE\\.kanbai\\hooks\\kanbai-activity.ps1"

if (-not $env:KANBAI_KANBAN_TASK_ID) { exit 0 }
if (-not $env:KANBAI_KANBAN_FILE) { exit 0 }

function Auto-CommitWorktree {
  try { git rev-parse --is-inside-work-tree 2>$null | Out-Null } catch { return }
  if ($LASTEXITCODE -ne 0) { return }
  $status = git status --porcelain 2>$null
  if (-not $status) { return }
  $ticketLabel = if ($env:KANBAI_KANBAN_TICKET) { $env:KANBAI_KANBAN_TICKET } else { "unknown" }
  git add -A 2>$null
  git commit -m "chore(kanban): auto-commit $ticketLabel worktree changes" 2>$null
}

function Merge-WorktreeBranch($wtPath, $wtBranch, $repoPath) {
  if (-not $wtPath -or -not $wtBranch -or -not $repoPath) { return }
  try { git -C $repoPath merge $wtBranch -m "Merge branch '$wtBranch'" 2>$null } catch { return }
  # Worktree directory and branch are kept alive until the terminal is closed.
  # Cleanup is handled by the Electron app on terminal tab close (handleTabClosed).
}

$nodeOutput = node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
const wsId = process.env.KANBAI_WORKSPACE_ID || '';
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    const isCto = task.isCtoTicket ? 'true' : 'false';
    const wtPath = task.worktreePath || '';
    const wtBranch = task.worktreeBranch || '';
    let autoMerge = 'false';
    if (wsId) {
      try {
        const cfgPath = path.join(os.homedir(), '.kanbai', 'kanban', wsId + '-config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          if (cfg.autoMergeWorktrees) autoMerge = 'true';
        }
      } catch(e2) { /* ignore */ }
    }
    process.stdout.write(task.status + ' ' + isCto + ' ' + wtPath + ' ' + wtBranch + ' ' + autoMerge);
  }
} catch(e) { /* ignore */ }
"
$parts = ($nodeOutput -split ' ')
$TicketStatus = $parts[0]
$IsCto = $parts[1]
$WorktreePath = $parts[2]
$WorktreeBranch = $parts[3]
$AutoMerge = $parts[4]

$RepoPath = ""
if ($WorktreePath) {
  $RepoPath = $WorktreePath -replace '[\\\\/]\\.kanbai-worktrees[\\\\/][^\\\\/]*$', ''
}

switch ($TicketStatus) {
  "DONE" {
    Auto-CommitWorktree
    if ($AutoMerge -eq "true" -and $WorktreePath -and $WorktreeBranch) {
      Merge-WorktreeBranch $WorktreePath $WorktreeBranch $RepoPath
    }
  }
  "FAILED" {
    Auto-CommitWorktree
    if (Test-Path $ActivityScript) { & $ActivityScript failed }
  }
  "PENDING" {
    if ($IsCto -eq "true") {
      node -e "
const fs = require('fs');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task && task.status === 'PENDING') {
    task.status = 'TODO';
    task.updatedAt = Date.now();
    fs.writeFileSync(file, JSON.stringify(tasks, null, 2), 'utf-8');
  }
} catch(e) { /* ignore */ }
"
    } else {
      if (Test-Path $ActivityScript) { & $ActivityScript waiting }
    }
  }
  "WORKING" {
    node -e "
const reason = 'RAPPEL: Tu n as pas mis a jour le ticket kanban !\\n'
  + 'Fichier: ' + process.env.KANBAI_KANBAN_FILE + '\\n'
  + 'Ticket ID: ' + process.env.KANBAI_KANBAN_TASK_ID + '\\n\\n'
  + 'Tu DOIS editer le fichier kanban pour mettre a jour ce ticket:\\n'
  + '- Change status a DONE (succes), FAILED (echec), ou PENDING (question)\\n'
  + '- Ajoute result, error, ou question selon le cas\\n'
  + '- Mets a jour updatedAt avec Date.now()\\n\\n'
  + 'Fais-le MAINTENANT avant de terminer.';
process.stdout.write(JSON.stringify({ decision: 'block', reason: reason }));
"
  }
}
`
    fs.writeFileSync(hookScriptPath, hookScript)
  } else {
    const hookScript = `#!/bin/bash
# Kanbai - Kanban task completion hook (auto-generated)
# Checks the kanban ticket status and writes the appropriate activity status.
# DONE/FAILED → auto-commit uncommitted worktree changes, merge branch if enabled (worktree cleanup deferred to terminal close)
# PENDING + CTO → auto-approve: revert to TODO (unblock CTO cycle)
# PENDING + regular → activity "waiting" (double bell in Electron)
# WORKING → block Claude from stopping and remind ticket update
ACTIVITY_SCRIPT="$HOME/.kanbai/hooks/kanbai-activity.sh"

[ -z "$KANBAI_KANBAN_TASK_ID" ] && exit 0
[ -z "$KANBAI_KANBAN_FILE" ] && exit 0

# Auto-commit uncommitted worktree changes (runs in the worktree CWD)
auto_commit_worktree() {
  # Only proceed if we are inside a git repo
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  # Check for uncommitted changes (staged or unstaged or untracked)
  local status
  status=$(git status --porcelain 2>/dev/null)
  [ -z "$status" ] && return 0
  # Stage all and commit
  local ticket_label="\${KANBAI_KANBAN_TICKET:-unknown}"
  git add -A 2>/dev/null
  git commit -m "chore(kanban): auto-commit \${ticket_label} worktree changes" 2>/dev/null
}

# Merge worktree branch into the target branch (worktree cleanup deferred to terminal close)
# Arguments: $1=worktreePath $2=worktreeBranch $3=repoPath
merge_worktree_branch() {
  local wt_path="$1" wt_branch="$2" repo_path="$3"
  [ -z "$wt_path" ] || [ -z "$wt_branch" ] || [ -z "$repo_path" ] && return 0

  # Merge the worktree branch into the target branch
  git -C "$repo_path" merge "$wt_branch" -m "Merge branch '$wt_branch'" 2>/dev/null || return 0

  # Worktree directory and branch are kept alive until the terminal is closed.
  # Cleanup is handled by the Electron app on terminal tab close (handleTabClosed).
}

# Read ticket status, isCtoTicket flag, worktree info, and autoMerge config
read -r TICKET_STATUS IS_CTO WORKTREE_PATH WORKTREE_BRANCH AUTO_MERGE <<< $(node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
const wsId = process.env.KANBAI_WORKSPACE_ID || '';
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    const isCto = task.isCtoTicket ? 'true' : 'false';
    const wtPath = task.worktreePath || '';
    const wtBranch = task.worktreeBranch || '';
    let autoMerge = 'false';
    if (wsId) {
      try {
        const cfgPath = path.join(os.homedir(), '.kanbai', 'kanban', wsId + '-config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          if (cfg.autoMergeWorktrees) autoMerge = 'true';
        }
      } catch(e2) { /* ignore */ }
    }
    process.stdout.write(task.status + ' ' + isCto + ' ' + wtPath + ' ' + wtBranch + ' ' + autoMerge);
  }
} catch(e) { /* ignore */ }
")

# Derive repo path from worktree path (strip .kanbai-worktrees/<id>)
REPO_PATH=""
if [ -n "$WORKTREE_PATH" ]; then
  REPO_PATH=$(echo "$WORKTREE_PATH" | sed 's|/\\.kanbai-worktrees/[^/]*$||')
fi

case "$TICKET_STATUS" in
  DONE)
    auto_commit_worktree
    if [ "$AUTO_MERGE" = "true" ] && [ -n "$WORKTREE_PATH" ] && [ -n "$WORKTREE_BRANCH" ]; then
      merge_worktree_branch "$WORKTREE_PATH" "$WORKTREE_BRANCH" "$REPO_PATH"
    fi
    ;;
  FAILED)
    auto_commit_worktree
    bash "$ACTIVITY_SCRIPT" failed
    ;;
  PENDING)
    if [ "$IS_CTO" = "true" ]; then
      # CTO auto-approve: set back to TODO to unblock the CTO cycle
      node -e "
const fs = require('fs');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task && task.status === 'PENDING') {
    task.status = 'TODO';
    task.updatedAt = Date.now();
    fs.writeFileSync(file, JSON.stringify(tasks, null, 2), 'utf-8');
  }
} catch(e) { /* ignore */ }
"
    else
      bash "$ACTIVITY_SCRIPT" waiting
    fi
    ;;
  WORKING)
    # Claude forgot to update the ticket — block and remind
    node -e "
const reason = 'RAPPEL: Tu n as pas mis a jour le ticket kanban !\\n'
  + 'Fichier: ' + process.env.KANBAI_KANBAN_FILE + '\\n'
  + 'Ticket ID: ' + process.env.KANBAI_KANBAN_TASK_ID + '\\n\\n'
  + 'Tu DOIS editer le fichier kanban pour mettre a jour ce ticket:\\n'
  + '- Change status a DONE (succes), FAILED (echec), ou PENDING (question)\\n'
  + '- Ajoute result, error, ou question selon le cas\\n'
  + '- Mets a jour updatedAt avec Date.now()\\n\\n'
  + 'Fais-le MAINTENANT avant de terminer.';
process.stdout.write(JSON.stringify({ decision: 'block', reason: reason }));
"
    ;;
esac
`
    fs.writeFileSync(hookScriptPath, hookScript, { mode: 0o755 })
  }

  const claudeDir = path.join(projectPath, '.claude')
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true })
  }

  const settingsPath = path.join(claudeDir, 'settings.local.json')
  let settings: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch { /* ignore corrupt file */ }
  }

  if (!settings.hooks) {
    settings.hooks = {}
  }
  const hooks = settings.hooks as Record<string, unknown[]>
  if (!hooks.Stop) {
    hooks.Stop = []
  }

  const stopHooks = hooks.Stop as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
  const hookFileName = IS_WIN ? 'kanban-done.ps1' : 'kanban-done.sh'
  const expectedCommand = IS_WIN
    ? `powershell -ExecutionPolicy Bypass -File "${hookScriptPath}"`
    : `bash "${hookScriptPath}"`
  const existingIdx = stopHooks.findIndex((h) =>
    h.hooks?.some((hk) => hk.command?.includes(hookFileName)),
  )

  if (existingIdx === -1) {
    // Check for stale cross-platform hook (e.g. .sh on Windows or .ps1 on macOS)
    const staleFileName = IS_WIN ? 'kanban-done.sh' : 'kanban-done.ps1'
    const staleIdx = stopHooks.findIndex((h) =>
      h.hooks?.some((hk) => hk.command?.includes(staleFileName)),
    )
    if (staleIdx !== -1) {
      // Replace stale hook with correct platform variant
      const staleEntry = stopHooks[staleIdx]!
      const staleCmd = staleEntry.hooks?.find((hk) => hk.command?.includes(staleFileName))
      if (staleCmd) staleCmd.command = expectedCommand
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    } else {
      // No kanban hook at all — add it
      stopHooks.push({
        matcher: '',
        hooks: [{ type: 'command', command: expectedCommand }],
      })
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    }
  } else {
    // Kanban hook exists — check if path is correct, update if stale
    const entry = stopHooks[existingIdx]!
    const hookCmd = entry.hooks?.find((hk) => hk.command?.includes(hookFileName))
    if (hookCmd && hookCmd.command !== expectedCommand) {
      hookCmd.command = expectedCommand
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    }
  }
}

function getAttachmentsDir(taskId: string): string {
  const dir = path.join(os.homedir(), '.kanbai', 'kanban', 'attachments', taskId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.zip': 'application/zip',
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function ensureWorkspacesDir(projectPath: string): string {
  const dir = path.join(projectPath, '.kanbai')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Finds the newest Claude Code conversation JSONL file for a given working directory.
 * Claude Code stores conversations at ~/.claude/projects/{path-hash}/{sessionId}.jsonl
 * where the path-hash replaces both '/' and '.' with '-'.
 */
function findNewestClaudeConversation(cwd: string): string | null {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(projectsDir)) return null

  // Resolve symlinks to get canonical path
  let resolvedCwd = cwd
  try { resolvedCwd = fs.realpathSync(cwd) } catch { /* use original */ }

  // Claude Code replaces both '/' and '.' with '-' in the directory name
  const candidates = [
    resolvedCwd.replace(/[/.]/g, '-'),
    cwd.replace(/[/.]/g, '-'),
    resolvedCwd.replace(/\//g, '-'),
    cwd.replace(/\//g, '-'),
  ]

  let claudeProjectDir: string | null = null
  const existingDirs = fs.readdirSync(projectsDir)
  for (const candidate of candidates) {
    if (existingDirs.includes(candidate)) {
      claudeProjectDir = path.join(projectsDir, candidate)
      break
    }
  }

  if (!claudeProjectDir) return null

  // Find the newest JSONL file in the directory
  try {
    const entries = fs.readdirSync(claudeProjectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const fullPath = path.join(claudeProjectDir!, f)
        try {
          return { name: f, mtime: fs.statSync(fullPath).mtimeMs, path: fullPath }
        } catch {
          return null
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.mtime - a.mtime)

    return entries.length > 0 ? entries[0]!.path : null
  } catch {
    return null
  }
}

/**
 * Finds the newest Codex conversation JSONL file for a given working directory.
 * Codex stores sessions at ~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{sessionId}.jsonl
 * Each JSONL starts with a session_meta event containing the cwd.
 */
function findNewestCodexConversation(cwd: string): string | null {
  const sessionsDir = path.join(os.homedir(), '.codex', 'sessions')
  if (!fs.existsSync(sessionsDir)) return null

  let resolvedCwd = cwd
  try { resolvedCwd = fs.realpathSync(cwd) } catch { /* use original */ }

  // Collect all JSONL files, sorted newest first by mtime
  const allFiles: Array<{ path: string; mtime: number }> = []
  try {
    // Walk YYYY/MM/DD structure
    const years = fs.readdirSync(sessionsDir)
    for (const year of years) {
      const yearDir = path.join(sessionsDir, year)
      try {
        const months = fs.readdirSync(yearDir)
        for (const month of months) {
          const monthDir = path.join(yearDir, month)
          try {
            const days = fs.readdirSync(monthDir)
            for (const day of days) {
              const dayDir = path.join(monthDir, day)
              try {
                const files = fs.readdirSync(dayDir).filter((f) => f.endsWith('.jsonl'))
                for (const file of files) {
                  const fullPath = path.join(dayDir, file)
                  try {
                    allFiles.push({ path: fullPath, mtime: fs.statSync(fullPath).mtimeMs })
                  } catch { /* skip */ }
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  } catch {
    return null
  }

  // Sort newest first and check cwd match
  allFiles.sort((a, b) => b.mtime - a.mtime)

  for (const file of allFiles.slice(0, 50)) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8')
      const firstLine = content.split('\n')[0]
      if (!firstLine) continue
      const meta = JSON.parse(firstLine)
      if (meta.type === 'session_meta' && meta.payload?.cwd) {
        let sessionCwd = meta.payload.cwd
        try { sessionCwd = fs.realpathSync(sessionCwd) } catch { /* use as-is */ }
        if (sessionCwd === resolvedCwd || sessionCwd === cwd) {
          return file.path
        }
      }
    } catch { /* skip malformed files */ }
  }

  return null
}

/**
 * Finds the newest Copilot conversation JSONL file for a given working directory.
 * Copilot stores sessions at ~/.copilot/session-state/{sessionId}/events.jsonl
 * Each session directory contains a workspace.yaml with the cwd.
 */
function findNewestCopilotConversation(cwd: string): string | null {
  const sessionStateDir = path.join(os.homedir(), '.copilot', 'session-state')
  if (!fs.existsSync(sessionStateDir)) return null

  let resolvedCwd = cwd
  try { resolvedCwd = fs.realpathSync(cwd) } catch { /* use original */ }

  // Collect all session dirs with their events.jsonl mtime
  const sessionDirs: Array<{ eventsPath: string; mtime: number; dir: string }> = []
  try {
    const entries = fs.readdirSync(sessionStateDir)
    for (const entry of entries) {
      const sessionDir = path.join(sessionStateDir, entry)
      const eventsPath = path.join(sessionDir, 'events.jsonl')
      try {
        const stat = fs.statSync(eventsPath)
        if (stat.isFile()) {
          sessionDirs.push({ eventsPath, mtime: stat.mtimeMs, dir: sessionDir })
        }
      } catch { /* skip sessions without events.jsonl */ }
    }
  } catch {
    return null
  }

  // Sort newest first and check cwd match
  sessionDirs.sort((a, b) => b.mtime - a.mtime)

  for (const session of sessionDirs.slice(0, 50)) {
    try {
      // First try workspace.yaml (faster than parsing the whole JSONL)
      const yamlPath = path.join(session.dir, 'workspace.yaml')
      if (fs.existsSync(yamlPath)) {
        const yamlContent = fs.readFileSync(yamlPath, 'utf-8')
        const cwdMatch = yamlContent.match(/^cwd:\s*(.+)$/m)
        if (cwdMatch) {
          let sessionCwd = cwdMatch[1]!.trim()
          try { sessionCwd = fs.realpathSync(sessionCwd) } catch { /* use as-is */ }
          if (sessionCwd === resolvedCwd || sessionCwd === cwd) {
            return session.eventsPath
          }
          continue
        }
      }
      // Fallback: parse first line of events.jsonl for session.start with cwd
      const content = fs.readFileSync(session.eventsPath, 'utf-8')
      const firstLine = content.split('\n')[0]
      if (!firstLine) continue
      const event = JSON.parse(firstLine)
      if (event.type === 'session.start' && event.data?.context?.cwd) {
        let sessionCwd = event.data.context.cwd
        try { sessionCwd = fs.realpathSync(sessionCwd) } catch { /* use as-is */ }
        if (sessionCwd === resolvedCwd || sessionCwd === cwd) {
          return session.eventsPath
        }
      }
    } catch { /* skip malformed sessions */ }
  }

  return null
}

/**
 * Finds the newest conversation file for the given AI provider and working directory.
 */
function findNewestConversation(cwd: string, provider: AiProviderId = 'claude'): string | null {
  switch (provider) {
    case 'claude':
      return findNewestClaudeConversation(cwd)
    case 'codex':
      return findNewestCodexConversation(cwd)
    case 'copilot':
      return findNewestCopilotConversation(cwd)
    case 'gemini':
      // Gemini CLI does not persist conversation files
      return null
    default:
      return findNewestClaudeConversation(cwd)
  }
}

/**
 * Migrates a legacy task: infers type from labels, removes labels,
 * downgrades critical priority to high.
 */
function migrateTask(task: KanbanTask & { labels?: string[] }): boolean {
  let changed = false

  if (!task.type) {
    const labels = (task as { labels?: string[] }).labels ?? []
    const labelMap: Record<string, KanbanTaskType> = {
      bug: 'bug',
      feature: 'feature',
      refactor: 'refactor',
      docs: 'doc',
      test: 'test',
    }
    let inferred: KanbanTaskType = 'feature'
    for (const label of labels) {
      if (label in labelMap) {
        inferred = labelMap[label]!
        break
      }
    }
    task.type = inferred
    changed = true
  }

  if ((task.priority as string) === 'critical') {
    task.priority = 'high'
    changed = true
  }

  if ('labels' in task) {
    delete (task as unknown as Record<string, unknown>).labels
    changed = true
  }

  return changed
}

// Multi-workspace file watcher state for kanban files
const watchers = new Map<string, { watcher: fs.FSWatcher; debounceTimer: ReturnType<typeof setTimeout> | null }>()

function broadcastFileChanged(workspaceId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.KANBAN_FILE_CHANGED, { workspaceId })
  }
}

function addWatcher(workspaceId: string): void {
  // Idempotent: skip if already watching
  if (watchers.has(workspaceId)) return
  const filePath = getKanbanPath(workspaceId)
  if (!fs.existsSync(filePath)) return

  try {
    const entry: { watcher: fs.FSWatcher; debounceTimer: ReturnType<typeof setTimeout> | null } = {
      watcher: null!,
      debounceTimer: null,
    }
    entry.watcher = fs.watch(filePath, { persistent: false }, () => {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null
        if (watchers.has(workspaceId)) {
          broadcastFileChanged(workspaceId)
        }
      }, 150)
    })
    entry.watcher.on('error', () => {
      removeWatcher(workspaceId)
    })
    watchers.set(workspaceId, entry)
  } catch {
    // fs.watch can fail on some edge cases — silently ignore
  }
}

function removeWatcher(workspaceId: string): void {
  const entry = watchers.get(workspaceId)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  try { entry.watcher.close() } catch { /* ignore */ }
  watchers.delete(workspaceId)
}

function removeAllWatchers(): void {
  for (const wsId of watchers.keys()) {
    removeWatcher(wsId)
  }
}

export function registerKanbanHandlers(ipcMain: IpcMain): void {
  // Init .workspaces directory
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_INIT_DIR,
    async (_event, { projectPath }: { projectPath: string }) => {
      ensureWorkspacesDir(projectPath)
      return true
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_LIST,
    async (_event, { workspaceId }: { workspaceId?: string }) => {
      if (!workspaceId) return []
      const tasks = readKanbanTasks(workspaceId)

      let needsWrite = false

      // Migration: assign ticketNumber to tasks that don't have one
      const needsTicketMigration = tasks.some((t) => t.ticketNumber == null)
      if (needsTicketMigration) {
        const sorted = [...tasks].sort((a, b) => a.createdAt - b.createdAt)
        let nextNum = 1
        for (const t of sorted) {
          if (t.ticketNumber == null) {
            const original = tasks.find((o) => o.id === t.id)!
            original.ticketNumber = nextNum
          }
          nextNum = Math.max(nextNum, (t.ticketNumber ?? nextNum) + 1)
        }
        needsWrite = true
      }

      // Migration: labels → type, critical → high
      for (const task of tasks) {
        if (migrateTask(task)) needsWrite = true
      }

      if (needsWrite) writeKanbanTasks(workspaceId, tasks)

      return tasks
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_CREATE,
    async (
      _event,
      data: {
        workspaceId: string
        targetProjectId?: string
        title: string
        description: string
        priority: 'low' | 'medium' | 'high'
        type?: KanbanTaskType
        status?: KanbanStatus
        isCtoTicket?: boolean
        disabled?: boolean
        aiProvider?: string
        splitFromId?: string
        error?: string
        result?: string
        question?: string
        comments?: KanbanTask['comments']
      },
    ) => {
      const tasks = readKanbanTasks(data.workspaceId)

      // Calculate next ticket number
      const maxTicketNumber = tasks.reduce((max, t) => Math.max(max, t.ticketNumber ?? 0), 0)

      // Auto-prioritize bugs to high if setting enabled (per-workspace config)
      let finalPriority = data.priority
      const taskType = data.type ?? 'feature'
      if (taskType === 'bug') {
        const config = readKanbanConfig(data.workspaceId)
        if (config.autoPrioritizeBugs) {
          finalPriority = 'high'
        }
      }

      const task: KanbanTask = {
        id: uuid(),
        workspaceId: data.workspaceId,
        targetProjectId: data.targetProjectId,
        ticketNumber: maxTicketNumber + 1,
        title: data.title,
        description: data.description,
        status: data.status || 'TODO',
        priority: finalPriority,
        type: taskType,
        isCtoTicket: data.isCtoTicket,
        disabled: data.disabled,
        aiProvider: data.aiProvider as KanbanTask['aiProvider'],
        splitFromId: data.splitFromId,
        error: data.error,
        result: data.result,
        question: data.question,
        comments: data.comments,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      tasks.push(task)
      writeKanbanTasks(data.workspaceId, tasks)

      // Auto-create memory refactor ticket every 10 tickets (checks setting internally)
      maybeCreateMemoryRefactorTicket(data.workspaceId, readKanbanTasks(data.workspaceId))

      return task
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_UPDATE,
    async (_event, data: Partial<KanbanTask> & { id: string; workspaceId: string }) => {
      const tasks = readKanbanTasks(data.workspaceId)
      const idx = tasks.findIndex((t) => t.id === data.id)
      if (idx === -1) throw new Error(`Kanban task ${data.id} not found`)

      const { workspaceId: _wid, ...updateData } = data
      tasks[idx] = { ...tasks[idx]!, ...updateData, updatedAt: Date.now() }
      writeKanbanTasks(data.workspaceId, tasks)
      return tasks[idx]
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_DELETE,
    async (_event, { id, workspaceId }: { id: string; workspaceId: string }) => {
      const tasks = readKanbanTasks(workspaceId)
      const taskToDelete = tasks.find((t) => t.id === id)

      // Clean up parent's childTicketIds if this task has a parent
      if (taskToDelete?.parentTicketId) {
        const parent = tasks.find((t) => t.id === taskToDelete.parentTicketId)
        if (parent?.childTicketIds) {
          parent.childTicketIds = parent.childTicketIds.filter((cid) => cid !== id)
          parent.updatedAt = Date.now()
        }
      }

      // Clean up children's parentTicketId if this task is a parent
      if (taskToDelete?.childTicketIds) {
        for (const childId of taskToDelete.childTicketIds) {
          const child = tasks.find((t) => t.id === childId)
          if (child) {
            child.parentTicketId = undefined
            child.updatedAt = Date.now()
          }
        }
      }

      const filtered = tasks.filter((t) => t.id !== id)
      writeKanbanTasks(workspaceId, filtered)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_WRITE_PROMPT,
    async (_event, { projectPath, taskId, prompt }: { projectPath: string; taskId: string; prompt: string }) => {
      const dir = ensureWorkspacesDir(projectPath)
      const promptPath = path.join(dir, `.kanban-prompt-${taskId}.md`)
      fs.writeFileSync(promptPath, prompt, 'utf-8')

      // Setup kanban hook (best-effort)
      try {
        ensureKanbanHook(projectPath)
      } catch { /* non-critical */ }

      return promptPath
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_CLEANUP_PROMPT,
    async (_event, { projectPath, taskId }: { projectPath: string; taskId: string }) => {
      const dir = path.join(projectPath, '.kanbai')
      const promptPath = path.join(dir, `.kanban-prompt-${taskId}.md`)
      try {
        if (fs.existsSync(promptPath)) {
          fs.unlinkSync(promptPath)
        }
      } catch { /* best-effort cleanup */ }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_GET_PATH,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      return getKanbanPath(workspaceId)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_SELECT_FILES,
    async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled) return []
      return result.filePaths
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_ATTACH_FILE,
    async (
      _event,
      { taskId, workspaceId, filePath }: { taskId: string; workspaceId: string; filePath: string },
    ) => {
      const attachDir = getAttachmentsDir(taskId)
      const filename = path.basename(filePath)
      const attachId = uuid()
      const storedPath = path.join(attachDir, `${attachId}-${filename}`)

      fs.copyFileSync(filePath, storedPath)
      const stats = fs.statSync(storedPath)

      const attachment: KanbanAttachment = {
        id: attachId,
        filename,
        storedPath,
        mimeType: getMimeType(filePath),
        size: stats.size,
        addedAt: Date.now(),
      }

      const tasks = readKanbanTasks(workspaceId)
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        if (!task.attachments) task.attachments = []
        task.attachments.push(attachment)
        task.updatedAt = Date.now()
        writeKanbanTasks(workspaceId, tasks)
      }

      return attachment
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_ATTACH_FROM_CLIPBOARD,
    async (
      _event,
      {
        taskId,
        workspaceId,
        dataBase64,
        filename,
        mimeType,
      }: { taskId: string; workspaceId: string; dataBase64: string; filename: string; mimeType: string },
    ) => {
      const attachDir = getAttachmentsDir(taskId)
      const attachId = uuid()
      const storedPath = path.join(attachDir, `${attachId}-${filename}`)

      const buffer = Buffer.from(dataBase64, 'base64')
      fs.writeFileSync(storedPath, buffer)

      const attachment: KanbanAttachment = {
        id: attachId,
        filename,
        storedPath,
        mimeType,
        size: buffer.length,
        addedAt: Date.now(),
      }

      const tasks = readKanbanTasks(workspaceId)
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        if (!task.attachments) task.attachments = []
        task.attachments.push(attachment)
        task.updatedAt = Date.now()
        writeKanbanTasks(workspaceId, tasks)
      }

      return attachment
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_REMOVE_ATTACHMENT,
    async (
      _event,
      { taskId, workspaceId, attachmentId }: { taskId: string; workspaceId: string; attachmentId: string },
    ) => {
      const tasks = readKanbanTasks(workspaceId)
      const task = tasks.find((t) => t.id === taskId)
      if (!task || !task.attachments) return

      const attachment = task.attachments.find((a) => a.id === attachmentId)
      if (attachment) {
        try {
          if (fs.existsSync(attachment.storedPath)) {
            fs.unlinkSync(attachment.storedPath)
          }
        } catch { /* best-effort cleanup */ }
      }

      task.attachments = task.attachments.filter((a) => a.id !== attachmentId)
      task.updatedAt = Date.now()
      writeKanbanTasks(workspaceId, tasks)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_GET_WORKING_TICKET,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      const tasks = readKanbanTasks(workspaceId)
      const active = tasks.find((t) => t.status === 'WORKING' || t.status === 'PENDING' || t.status === 'FAILED')
      if (!active) return null
      // Check if active ticket is a CTO ticket OR a child of a CTO ticket
      let isCto = active.isCtoTicket ?? false
      if (!isCto && active.parentTicketId) {
        const parent = tasks.find((t) => t.id === active.parentTicketId)
        if (parent?.isCtoTicket) isCto = true
      }
      return {
        ticketNumber: active.ticketNumber ?? null,
        isCtoTicket: isCto,
        type: active.type,
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_GET_WORKING_TICKETS,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      const tasks = readKanbanTasks(workspaceId)
      const working = tasks.filter((t) => t.status === 'WORKING')
      return working.map((task) => {
        let isCto = task.isCtoTicket ?? false
        if (!isCto && task.parentTicketId) {
          const parent = tasks.find((t) => t.id === task.parentTicketId)
          if (parent?.isCtoTicket) isCto = true
        }
        return {
          ticketNumber: task.ticketNumber ?? null,
          isCtoTicket: isCto,
          type: task.type,
          title: task.title,
        }
      })
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_WATCH,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      addWatcher(workspaceId)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_UNWATCH,
    async () => {
      removeAllWatchers()
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_WATCH_ADD,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      addWatcher(workspaceId)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_WATCH_REMOVE,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      removeWatcher(workspaceId)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_LINK_CONVERSATION,
    async (
      _event,
      { cwd, taskId, workspaceId, aiProvider }: { cwd: string; taskId: string; workspaceId: string; aiProvider?: AiProviderId },
    ) => {
      const conversationPath = findNewestConversation(cwd, aiProvider)
      if (!conversationPath) return null

      // Store the conversation path in the ticket
      const tasks = readKanbanTasks(workspaceId)
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        task.conversationHistoryPath = conversationPath
        task.updatedAt = Date.now()
        writeKanbanTasks(workspaceId, tasks)
      }

      return conversationPath
    },
  )

  const prequalifyProcesses = new Map<string, ChildProcess>()

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_PREQUALIFY,
    async (
      _event,
      {
        title,
        description,
        priority,
        type,
        targetProjectId,
        isCtoTicket,
        hasAttachments,
        hasComments,
      }: {
        title: string
        description: string
        priority?: string
        type?: string
        targetProjectId?: string
        isCtoTicket?: boolean
        hasAttachments?: boolean
        hasComments?: boolean
      },
    ) => {
      const metadataLines: string[] = []
      if (priority) metadataLines.push(`Priorite actuelle: ${priority}`)
      if (type) metadataLines.push(`Type actuel: ${type}`)
      if (targetProjectId) metadataLines.push(`Projet cible: ${targetProjectId}`)
      if (isCtoTicket) metadataLines.push(`Mode CTO: oui`)
      if (hasAttachments) metadataLines.push(`Pieces jointes: oui (ne pas les ignorer lors de l'execution)`)
      if (hasComments) metadataLines.push(`Commentaires utilisateur: oui (contexte supplementaire disponible)`)

      const metadataSection = metadataLines.length > 0
        ? `\nMetadonnees du ticket:\n${metadataLines.join('\n')}\n`
        : ''

      const prompt = `Analyse ce ticket Kanban et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de texte autour) avec cette structure exacte :
{"suggestedType":"bug"|"feature"|"test"|"doc"|"ia"|"refactor","suggestedPriority":"low"|"medium"|"high","clarifiedDescription":"clarification supplementaire pour l'agent IA","isVague":true|false,"splitSuggestions":[]}

REGLES IMPORTANTES :
1. PRESERVATION DU TEXTE ORIGINAL : La description originale de l'utilisateur ne sera JAMAIS remplacee. Elle reste toujours le champ principal du ticket. Le champ "clarifiedDescription" sert UNIQUEMENT a ajouter du contexte supplementaire pour l'agent IA : precisions techniques, etapes suggerees, ou reformulation actionnable. Il ne doit PAS repeter le texte original, mais le COMPLETER. Si la description est deja claire et complete, mets une chaine vide "".

2. DETECTION MULTI-ITEMS : Analyse si le ticket contient plusieurs elements DISTINCTS et NON-LIES (ex: un bug + une feature, ou plusieurs features independantes). Si oui, remplis "splitSuggestions" avec un tableau d'objets {"title":"...","description":"...","type":"bug"|"feature"|...,"priority":"low"|"medium"|"high"} pour chaque sous-ticket propose.
   - EXCEPTION : Si une SEULE feature impacte plusieurs applications ou environnements, ne PAS decouper — c'est un seul ticket.
   - "splitSuggestions" doit etre un tableau VIDE [] si le ticket ne contient qu'un seul element ou si les elements sont lies.
   - CHAQUE suggestion DOIT inclure le texte exact de l'utilisateur pertinent a ce sous-ticket dans sa description (copier-coller verbatim), suivi d'eventuelles precisions supplementaires. Ne JAMAIS resumer ou reformuler le texte de l'utilisateur dans les splits.

3. RESPECT DES METADONNEES : Si une priorite ou un type est deja defini par l'utilisateur, ne le change que si c'est clairement incorrect. Privilegie le choix explicite de l'utilisateur.
${metadataSection}
Titre: ${title}
Description: ${description || '(aucune)'}`

      try {
        console.log('[kanban-prequalify] Starting prequalification for:', title)
        const output = await callAiCli('claude', prompt, 'kanban-prequalify', prequalifyProcesses)
        console.log('[kanban-prequalify] Raw output:', output.slice(0, 200))
        // Extract JSON from output (may contain markdown fences or extra text)
        const jsonMatch = output.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.log('[kanban-prequalify] No JSON found in output')
          return null
        }
        const parsed = JSON.parse(jsonMatch[0])
        console.log('[kanban-prequalify] Result:', parsed)
        return parsed
      } catch (err) {
        console.error('[kanban-prequalify] Error:', err)
        return null
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_GET_CONFIG,
    async (_event, { workspaceId }: { workspaceId: string }) => {
      return readKanbanConfig(workspaceId)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_SET_CONFIG,
    async (_event, { workspaceId, config }: { workspaceId: string; config: Partial<KanbanConfig> }) => {
      const current = readKanbanConfig(workspaceId)
      const updated = { ...current, ...config }
      writeKanbanConfig(workspaceId, updated)
      return updated
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_GET_DEFAULT_CONFIG,
    async () => {
      return readDefaultKanbanConfig()
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.KANBAN_SET_DEFAULT_CONFIG,
    async (_event, { config }: { config: Partial<KanbanConfig> }) => {
      const current = readDefaultKanbanConfig()
      const updated = { ...current, ...config }
      writeDefaultKanbanConfig(updated)
      return updated
    },
  )
}
