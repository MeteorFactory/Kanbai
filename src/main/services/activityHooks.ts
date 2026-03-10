import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import { sendNotification, sendSilentNotification, playBellRepeat } from './notificationService'
import { StorageService } from './storage'
import { IS_WIN } from '../../shared/platform'
import type { AiProviderId } from '../../shared/types/ai-provider'

const ACTIVITY_DIR = path.join(os.homedir(), '.kanbai', 'activity')
const HOOKS_DIR = path.join(os.homedir(), '.kanbai', 'hooks')
const ENVS_DIR = path.join(os.homedir(), '.kanbai', 'envs')
const HOOK_SCRIPT_NAME = IS_WIN ? 'kanbai-activity.ps1' : 'kanbai-activity.sh'
const AUTOAPPROVE_SCRIPT_NAME = IS_WIN ? 'kanbai-autoapprove.ps1' : 'kanbai-autoapprove.sh'
const KANBAN_DONE_SCRIPT_NAME = IS_WIN ? 'kanban-done.ps1' : 'kanban-done.sh'
const PIXEL_AGENTS_SCRIPT_NAME = IS_WIN ? 'kanbai-pixel-agents.ps1' : 'kanbai-pixel-agents.sh'

/**
 * Ensures the global activity hook script exists at ~/.kanbai/hooks/kanbai-activity.sh
 */
export function ensureActivityHookScript(): void {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }
  if (!fs.existsSync(ACTIVITY_DIR)) {
    fs.mkdirSync(ACTIVITY_DIR, { recursive: true })
  }

  const scriptPath = path.join(HOOKS_DIR, HOOK_SCRIPT_NAME)

  if (IS_WIN) {
    const script = `# Kanbai Claude Activity Hook (auto-generated)
# Signals Claude activity status to Kanbai via status files

# Skip activity tracking for NL database queries
if ($env:KANBAI_NL_QUERY) { exit 0 }

$StatusDir = "$env:USERPROFILE\\.kanbai\\activity"
if (!(Test-Path $StatusDir)) { New-Item -ItemType Directory -Path $StatusDir -Force | Out-Null }

$Hash = [System.BitConverter]::ToString(
  [System.Security.Cryptography.MD5]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($PWD.Path)
  )
).Replace("-","").Substring(0,16).ToLower()
$File = "$StatusDir\\$Hash.json"

$Status = if ($args[0]) { $args[0] } else { "working" }

# Throttle working->working writes (max once per 30s)
if ($Status -eq "working" -and (Test-Path $File)) {
  $content = Get-Content $File -Raw -ErrorAction SilentlyContinue
  if ($content -match '"status":"working"') {
    $mtime = (Get-Item $File).LastWriteTime
    $age = ((Get-Date) - $mtime).TotalSeconds
    if ($age -lt 30) { exit 0 }
  }
}

$timestamp = [Math]::Floor(([DateTimeOffset]::UtcNow).ToUnixTimeSeconds())
$json = '{"status":"' + $Status + '","path":"' + ($PWD.Path -replace '\\\\','/') + '","timestamp":' + $timestamp + '}'
Set-Content -Path $File -Value $json -NoNewline
`
    fs.writeFileSync(scriptPath, script)
  } else {
    const script = `#!/bin/bash
# Kanbai Claude Activity Hook (auto-generated)
# Signals Claude activity status to Kanbai via status files

# Skip activity tracking for NL database queries (no bell sound)
[ -n "$KANBAI_NL_QUERY" ] && exit 0

STATUS_DIR="$HOME/.kanbai/activity"
mkdir -p "$STATUS_DIR"

# Hash the project path for unique filename
if command -v md5 &>/dev/null; then
  HASH=$(echo -n "$PWD" | md5)
elif command -v md5sum &>/dev/null; then
  HASH=$(echo -n "$PWD" | md5sum | cut -d' ' -f1)
else
  HASH=$(echo -n "$PWD" | shasum | cut -d' ' -f1)
fi
HASH="\${HASH:0:16}"
FILE="$STATUS_DIR/$HASH.json"

STATUS="\${1:-working}"

# For 'working' status, throttle writes (max once per 30s)
# Only throttle working→working, not transitions from other states (ask, waiting, etc.)
if [ "$STATUS" = "working" ] && [ -f "$FILE" ]; then
  if grep -q '"status":"working"' "$FILE" 2>/dev/null; then
    MTIME=$(stat -f %m "$FILE" 2>/dev/null || stat -c %Y "$FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$((NOW - MTIME))
    if [ "$AGE" -lt 30 ]; then
      exit 0
    fi
  fi
fi

printf '{"status":"%s","path":"%s","timestamp":%s}\\n' "$STATUS" "$PWD" "$(date +%s)" > "$FILE"
`
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  }
}

/**
 * Ensures the auto-approve hook script exists at ~/.kanbai/hooks/kanbai-autoapprove.sh
 * When globalAutoApprove is true: auto-approves ALL tool permissions.
 * When globalAutoApprove is false: only auto-approves during kanban sessions (KANBAI_KANBAN_TASK_ID).
 */
export function ensureAutoApproveScript(globalAutoApprove = false): void {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }

  const scriptPath = path.join(HOOKS_DIR, AUTOAPPROVE_SCRIPT_NAME)

  if (IS_WIN) {
    const kanbanCheck = globalAutoApprove ? '# Global auto-approve enabled' : 'if (-not $env:KANBAI_KANBAN_TASK_ID) { exit 0 }'
    const script = `# Kanbai - Auto-approve hook (auto-generated)
${kanbanCheck}
$null = $input | Out-Null
Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Kanbai auto-approve"}}'
`
    fs.writeFileSync(scriptPath, script)
  } else {
    const kanbanOnlyCheck = '[ -z "$KANBAI_KANBAN_TASK_ID" ] && exit 0'
    const script = `#!/bin/bash
# Kanbai - Auto-approve hook (auto-generated)
${globalAutoApprove ? '# Global auto-approve enabled' : kanbanOnlyCheck}
cat > /dev/null
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Kanbai auto-approve"}}'
`
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  }
}

/**
 * Ensures the kanban-done hook script exists at ~/.kanbai/hooks/kanban-done.sh
 * Handles ticket status transitions on Claude Stop event.
 */
export function ensureKanbanDoneScript(): void {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }

  const scriptPath = path.join(HOOKS_DIR, KANBAN_DONE_SCRIPT_NAME)

  if (IS_WIN) {
    const script = `# Kanbai - Kanban task completion hook (auto-generated)
if (-not $env:KANBAI_KANBAN_TASK_ID) { exit 0 }
if (-not $env:KANBAI_KANBAN_FILE) { exit 0 }

$ActivityScript = "$env:USERPROFILE\\.kanbai\\hooks\\${HOOK_SCRIPT_NAME}"

$result = node -e @"
const fs = require('fs');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    let isCto = task.isCtoTicket || false;
    if (!isCto && task.parentTicketId) {
      const parent = tasks.find(t => t.id === task.parentTicketId);
      if (parent && parent.isCtoTicket) isCto = true;
    }
    process.stdout.write(task.status + '|' + (isCto ? 'true' : 'false'));
  }
} catch(e) {}
"@

if ($result) {
  $parts = $result -split '\\|'
  $ticketStatus = $parts[0]
  $isCto = $parts[1]

  switch ($ticketStatus) {
    'PENDING' {
      if ($isCto -eq 'true') {
        node -e @"
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
} catch(e) {}
"@
      } else {
        & powershell -File "$ActivityScript" waiting
      }
    }
    'FAILED' {
      & powershell -File "$ActivityScript" failed
    }
    'WORKING' {
      $reason = 'RAPPEL: Tu n as pas mis a jour le ticket kanban !'
      Write-Output ('{"decision":"block","reason":"' + $reason + '"}')
    }
  }
}
`
    fs.writeFileSync(scriptPath, script)
  } else {
    const script = `#!/bin/bash
# Kanbai - Kanban task completion hook (auto-generated)
# Runs on Claude Code Stop event to check if the kanban ticket was updated.
#
# Behavior:
# - WORKING → BLOCK Claude from stopping, remind to update the ticket
# - PENDING + CTO → auto-approve: revert to TODO (unblock CTO cycle)
# - PENDING + regular → activity "waiting" (double bell in Electron)
# - FAILED  → activity "failed" (quad bell in Electron)
# - DONE    → auto-commit + auto-merge worktree if enabled
ACTIVITY_SCRIPT="$HOME/.kanbai/hooks/kanbai-activity.sh"

[ -z "$KANBAI_KANBAN_TASK_ID" ] && exit 0
[ -z "$KANBAI_KANBAN_FILE" ] && exit 0

# Auto-commit uncommitted worktree changes (runs in the worktree CWD)
auto_commit_worktree() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  local status
  status=$(git status --porcelain 2>/dev/null)
  [ -z "$status" ] && return 0
  local ticket_label="\${KANBAI_KANBAN_TICKET:-unknown}"
  git add -A 2>/dev/null
  git commit -m "chore(kanban): auto-commit \${ticket_label} worktree changes" 2>/dev/null
}

# Read ticket status, isCtoTicket flag, worktree info, base branch, and autoMerge config
# Use tab separator to handle paths with spaces correctly
IFS=$'\\t' read -r TICKET_STATUS IS_CTO WORKTREE_PATH WORKTREE_BRANCH WORKTREE_BASE_BRANCH AUTO_MERGE <<< $(node -e "
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
    let isCto = task.isCtoTicket || false;
    if (!isCto && task.parentTicketId) {
      const parent = tasks.find(t => t.id === task.parentTicketId);
      if (parent && parent.isCtoTicket) isCto = true;
    }
    const wtPath = task.worktreePath || '';
    const wtBranch = task.worktreeBranch || '';
    const wtBaseBranch = task.worktreeBaseBranch || '';
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
    process.stdout.write([task.status, isCto ? 'true' : 'false', wtPath, wtBranch, wtBaseBranch, autoMerge].join('\\t'));
  }
} catch(e) { /* ignore */ }
")

case "$TICKET_STATUS" in
  DONE)
    auto_commit_worktree
    # Worktree merge/cleanup is deferred to the renderer (handleTabClosed)
    # to prevent deleting the worktree while Claude's process is still running.
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
  FAILED)
    auto_commit_worktree
    bash "$ACTIVITY_SCRIPT" failed
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
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  }
}

/**
 * Ensures the pixel-agents hook script exists at ~/.kanbai/hooks/kanbai-pixel-agents.sh
 * Feeds Claude tool activity to the Pixel Agents visualization via events.jsonl.
 */
export function ensurePixelAgentsHookScript(): void {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }

  const scriptPath = path.join(HOOKS_DIR, PIXEL_AGENTS_SCRIPT_NAME)

  if (IS_WIN) {
    const script = `# Kanbai Pixel Agents Hook (auto-generated)
# Feeds agent tool activity to Pixel Agents visualization
if ($env:KANBAI_NL_QUERY) { exit 0 }

$EventDir = "$env:USERPROFILE\\.kanbai\\pixel-agents"
if (!(Test-Path $EventDir)) { New-Item -ItemType Directory -Path $EventDir -Force | Out-Null }
$EventFile = "$EventDir\\events.jsonl"

$EventType = if ($args[0]) { $args[0] } else { "toolStart" }

$RawInput = $input | Out-String
$SessionId = ""
if ($RawInput -match '"session_id":"([^"]*)"') { $SessionId = $Matches[1] }
if (!$SessionId) { exit 0 }

$ToolName = ""
if ($EventType -eq "toolStart" -or $EventType -eq "toolDone") {
  if ($RawInput -match '"tool_name":"([^"]*)"') { $ToolName = $Matches[1] }
}

$Ticket = $env:KANBAI_KANBAN_TICKET
$WorkspaceId = $env:KANBAI_WORKSPACE_ID
$TabId = $env:KANBAI_TAB_ID
$Provider = $env:KANBAI_AI_PROVIDER
$Ts = [Math]::Floor(([DateTimeOffset]::UtcNow).ToUnixTimeSeconds())
$Line = '{"type":"' + $EventType + '","sessionId":"' + $SessionId + '","tool":"' + $ToolName + '","ts":' + $Ts
if ($Ticket) { $Line += ',"ticket":"' + $Ticket + '"' }
if ($WorkspaceId) { $Line += ',"workspaceId":"' + $WorkspaceId + '"' }
if ($TabId) { $Line += ',"tabId":"' + $TabId + '"' }
if ($Provider) { $Line += ',"provider":"' + $Provider + '"' }
$Line += '}'
Add-Content -Path $EventFile -Value $Line
`
    fs.writeFileSync(scriptPath, script)
  } else {
    const script = `#!/bin/bash
# Kanbai Pixel Agents Hook (auto-generated)
# Feeds agent tool activity to Pixel Agents visualization

[ -n "$KANBAI_NL_QUERY" ] && exit 0

EVENT_DIR="$HOME/.kanbai/pixel-agents"
mkdir -p "$EVENT_DIR"
EVENT_FILE="$EVENT_DIR/events.jsonl"

EVENT_TYPE="\${1:-toolStart}"

# Read hook stdin JSON
INPUT=$(cat)

# Extract session_id (fast grep — no jq/node dependency)
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$SESSION_ID" ] && exit 0

# Extract tool_name for tool events
TOOL_NAME=""
if [ "$EVENT_TYPE" = "toolStart" ] || [ "$EVENT_TYPE" = "toolDone" ]; then
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# Include ticket label from kanban env var if available
TICKET_FIELD=""
if [ -n "$KANBAI_KANBAN_TICKET" ]; then
  TICKET_FIELD=',"ticket":"'"$KANBAI_KANBAN_TICKET"'"'
fi

# Include workspace ID if available
WORKSPACE_FIELD=""
if [ -n "$KANBAI_WORKSPACE_ID" ]; then
  WORKSPACE_FIELD=',"workspaceId":"'"$KANBAI_WORKSPACE_ID"'"'
fi

# Include tab ID if available
TAB_FIELD=""
if [ -n "$KANBAI_TAB_ID" ]; then
  TAB_FIELD=',"tabId":"'"$KANBAI_TAB_ID"'"'
fi

# Include AI provider if available
PROVIDER_FIELD=""
if [ -n "$KANBAI_AI_PROVIDER" ]; then
  PROVIDER_FIELD=',"provider":"'"$KANBAI_AI_PROVIDER"'"'
fi

TS=$(date +%s)
printf '{"type":"%s","sessionId":"%s","tool":"%s","ts":%s%s%s%s%s}\\n' \\
  "$EVENT_TYPE" "$SESSION_ID" "$TOOL_NAME" "$TS" "$TICKET_FIELD" "$WORKSPACE_FIELD" "$TAB_FIELD" "$PROVIDER_FIELD" >> "$EVENT_FILE"
`
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  }
}

/**
 * Installs PreToolUse + Stop hooks in a project's settings.local.json
 * to signal Claude activity back to Kanbai.
 * Merges with existing hooks (e.g. kanban hooks) without overwriting.
 */
export async function installActivityHooks(
  projectPath: string,
  workspaceName?: string,
  provider: AiProviderId = 'claude',
): Promise<void> {
  if (provider === 'codex') {
    await installCodexActivityHooks(projectPath, workspaceName)
    return
  }
  if (provider === 'copilot') {
    await installCopilotActivityHooks(projectPath, workspaceName)
    return
  }
  if (provider === 'gemini') {
    await installGeminiActivityHooks(projectPath, workspaceName)
    return
  }

  const storage = new StorageService()
  const { autoApprove } = storage.getSettings()
  ensureActivityHookScript()
  ensureAutoApproveScript(autoApprove)
  ensureKanbanDoneScript()
  ensurePixelAgentsHookScript()

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

  const activityScriptPath = path.join(HOOKS_DIR, HOOK_SCRIPT_NAME)
  const autoApproveScriptPath = path.join(HOOKS_DIR, AUTOAPPROVE_SCRIPT_NAME)
  const kanbanDoneScriptPath = path.join(HOOKS_DIR, KANBAN_DONE_SCRIPT_NAME)

  const shellCmd = IS_WIN
    ? (scriptPath: string, ...scriptArgs: string[]) => `powershell -ExecutionPolicy Bypass -File "${scriptPath}" ${scriptArgs.join(' ')}`
    : (scriptPath: string, ...scriptArgs: string[]) => `bash "${scriptPath}" ${scriptArgs.join(' ')}`

  const activityScriptIncludes = IS_WIN ? 'kanbai-activity.ps1' : 'kanbai-activity.sh'
  const autoApproveScriptIncludes = IS_WIN ? 'kanbai-autoapprove.ps1' : 'kanbai-autoapprove.sh'
  const kanbanDoneScriptIncludes = IS_WIN ? 'kanban-done.ps1' : 'kanban-done.sh'
  const pixelAgentsScriptPath = path.join(HOOKS_DIR, PIXEL_AGENTS_SCRIPT_NAME)
  const pixelAgentsScriptIncludes = IS_WIN ? 'kanbai-pixel-agents.ps1' : 'kanbai-pixel-agents.sh'

  // Clean up legacy mirehub hook entries (renamed to kanbai)
  const legacyPatterns = ['mirehub-activity', 'mirehub-autoapprove', '.mirehub/hooks/']
  for (const eventName of ['PreToolUse', 'Stop', 'PermissionRequest', 'PostToolUse', 'SessionEnd']) {
    const eventHooks = hooks[eventName] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> | undefined
    if (eventHooks) {
      hooks[eventName] = eventHooks.filter(
        (h) => !h.hooks?.some((hk) => legacyPatterns.some((p) => hk.command?.includes(p))),
      )
    }
  }

  // === PreToolUse hooks ===
  if (!hooks.PreToolUse) {
    hooks.PreToolUse = []
  }
  const preToolHooks = hooks.PreToolUse as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>

  // Activity working hook
  if (!preToolHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(activityScriptIncludes)))) {
    preToolHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(activityScriptPath, 'working') }],
    })
  }

  // Auto-approve hook (kanban sessions only)
  if (!preToolHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(autoApproveScriptIncludes)))) {
    preToolHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(autoApproveScriptPath) }],
    })
  }

  // Pixel-agents: signal tool start
  if (!preToolHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(pixelAgentsScriptIncludes)))) {
    preToolHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(pixelAgentsScriptPath, 'toolStart') }],
    })
  }

  // === PermissionRequest hooks ===
  if (!hooks.PermissionRequest) {
    hooks.PermissionRequest = []
  }
  const permReqHooks = hooks.PermissionRequest as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>

  // Activity "ask" hook — signals Claude is blocked waiting for permission
  if (!permReqHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(activityScriptIncludes)))) {
    permReqHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(activityScriptPath, 'ask') }],
    })
  }

  // === PostToolUse hooks ===
  if (!hooks.PostToolUse) {
    hooks.PostToolUse = []
  }
  const postToolHooks = hooks.PostToolUse as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>

  // Restore "working" status after tool executes (permission was granted)
  if (!postToolHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(activityScriptIncludes)))) {
    postToolHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(activityScriptPath, 'working') }],
    })
  }

  // Pixel-agents: signal tool done
  if (!postToolHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(pixelAgentsScriptIncludes)))) {
    postToolHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(pixelAgentsScriptPath, 'toolDone') }],
    })
  }

  // === Stop hooks ===
  if (!hooks.Stop) {
    hooks.Stop = []
  }
  const stopHooks = hooks.Stop as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>

  // Kanban-done hook (ensure global path, update stale paths)
  const expectedKanbanCmd = shellCmd(kanbanDoneScriptPath)
  const kanbanIdx = stopHooks.findIndex((h) =>
    h.hooks?.some((hk) => hk.command?.includes(kanbanDoneScriptIncludes)),
  )
  if (kanbanIdx === -1) {
    // Insert at the beginning so it runs before activity-done
    stopHooks.unshift({
      matcher: '',
      hooks: [{ type: 'command', command: expectedKanbanCmd }],
    })
  } else {
    // Update if pointing to old/stale path
    const hookCmd = stopHooks[kanbanIdx]!.hooks?.find((hk) => hk.command?.includes(kanbanDoneScriptIncludes))
    if (hookCmd && hookCmd.command !== expectedKanbanCmd) {
      hookCmd.command = expectedKanbanCmd
    }
  }

  // Activity done hook
  if (!stopHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(activityScriptIncludes)))) {
    stopHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(activityScriptPath, 'done') }],
    })
  }

  // Pixel-agents: signal turn end
  if (!stopHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(pixelAgentsScriptIncludes)))) {
    stopHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(pixelAgentsScriptPath, 'turnEnd') }],
    })
  }

  // === SessionEnd hooks ===
  if (!hooks.SessionEnd) {
    hooks.SessionEnd = []
  }
  const sessionEndHooks = hooks.SessionEnd as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>

  // Pixel-agents: signal session end for immediate agent removal
  if (!sessionEndHooks.some((h) => h.hooks?.some((hk) => hk.command?.includes(pixelAgentsScriptIncludes)))) {
    sessionEndHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: shellCmd(pixelAgentsScriptPath, 'sessionEnd') }],
    })
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Installs activity hooks for Codex provider.
 * Codex uses .codex/config.toml — we add a notify directive that calls our activity hook script.
 */
async function installCodexActivityHooks(
  projectPath: string,
  _workspaceName?: string,
): Promise<void> {
  ensureActivityHookScript()
  ensurePixelAgentsHookScript()

  const codexDir = path.join(projectPath, '.codex')
  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true })
  }

  const hookScriptPath = path.join(os.homedir(), '.kanbai', 'hooks', 'kanbai-activity.sh')
  const configPath = path.join(codexDir, 'config.toml')

  let existingConfig = ''
  if (fs.existsSync(configPath)) {
    existingConfig = fs.readFileSync(configPath, 'utf-8')
  }

  // Only add if not already present
  if (!existingConfig.includes('kanbai-activity')) {
    const notifyLine = `notify = ["bash", "${hookScriptPath}", "working"]`
    if (existingConfig.trim()) {
      fs.writeFileSync(configPath, `${existingConfig.trimEnd()}\n${notifyLine}\n`, 'utf-8')
    } else {
      fs.writeFileSync(configPath, `${notifyLine}\n`, 'utf-8')
    }
  }
}

/**
 * Installs activity hooks for Copilot provider.
 * Copilot uses .copilot/ config directory — similar approach to Codex.
 */
async function installCopilotActivityHooks(
  projectPath: string,
  _workspaceName?: string,
): Promise<void> {
  ensureActivityHookScript()
  ensurePixelAgentsHookScript()

  const copilotDir = path.join(projectPath, '.copilot')
  if (!fs.existsSync(copilotDir)) {
    fs.mkdirSync(copilotDir, { recursive: true })
  }

  const hookScriptPath = path.join(os.homedir(), '.kanbai', 'hooks', 'kanbai-activity.sh')
  const configPath = path.join(copilotDir, 'config.json')

  let existingConfig: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch { /* ignore corrupt file */ }
  }

  if (!existingConfig.hooks) {
    existingConfig.hooks = { notify: ['bash', hookScriptPath, 'working'] }
    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8')
  }
}

/**
 * Installs activity hooks for Gemini provider.
 * Gemini uses .gemini/settings.json — we add hooks configuration.
 */
async function installGeminiActivityHooks(
  projectPath: string,
  _workspaceName?: string,
): Promise<void> {
  ensureActivityHookScript()
  ensurePixelAgentsHookScript()

  const geminiDir = path.join(projectPath, '.gemini')
  if (!fs.existsSync(geminiDir)) {
    fs.mkdirSync(geminiDir, { recursive: true })
  }

  const hookScriptPath = path.join(os.homedir(), '.kanbai', 'hooks', 'kanbai-activity.sh')
  const configPath = path.join(geminiDir, 'settings.json')

  let existingConfig: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch { /* ignore corrupt file */ }
  }

  if (!existingConfig.hooks) {
    existingConfig.hooks = { notify: ['bash', hookScriptPath, 'working'] }
    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8')
  }
}

/**
 * Iterates all existing workspace env directories (~/.kanbai/envs/*)
 * and ensures hooks are installed in each one.
 * Called at app startup to keep all envs in sync.
 */
export function syncAllWorkspaceEnvHooks(): void {
  if (!fs.existsSync(ENVS_DIR)) return
  const providers: AiProviderId[] = ['claude', 'codex', 'copilot', 'gemini']
  try {
    const entries = fs.readdirSync(ENVS_DIR)
    for (const entry of entries) {
      const envDir = path.join(ENVS_DIR, entry)
      try {
        const stat = fs.statSync(envDir)
        if (stat.isDirectory()) {
          for (const provider of providers) {
            installActivityHooks(envDir, undefined, provider)
          }
        }
      } catch { /* skip individual failures */ }
    }
  } catch { /* ignore readdir errors */ }
}

/**
 * Watches ~/.kanbai/activity/ for status file changes.
 * Broadcasts CLAUDE_ACTIVITY events to all renderer windows.
 */
export function startActivityWatcher(): () => void {
  if (!fs.existsSync(ACTIVITY_DIR)) {
    fs.mkdirSync(ACTIVITY_DIR, { recursive: true })
  }

  let debounceTimer: NodeJS.Timeout | null = null

  const watcher = fs.watch(ACTIVITY_DIR, (_eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) return

    // Debounce rapid file changes
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      broadcastActivityFromFile(path.join(ACTIVITY_DIR, filename))
    }, 200)
  })

  // Also do an initial scan for any existing activity files
  try {
    const files = fs.readdirSync(ACTIVITY_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      broadcastActivityFromFile(path.join(ACTIVITY_DIR, file))
    }
  } catch { /* ignore */ }

  // Periodic cleanup: remove activity files older than 5 minutes
  const cleanupInterval = setInterval(() => {
    try {
      const now = Date.now() / 1000
      const files = fs.readdirSync(ACTIVITY_DIR).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        const filePath = path.join(ACTIVITY_DIR, file)
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          const isTerminal = data.status === 'done' || data.status === 'waiting' || data.status === 'failed'
          if (isTerminal && now - data.timestamp > 300) {
            fs.unlinkSync(filePath)
          }
        } catch {
          // Remove corrupt files
          try { fs.unlinkSync(filePath) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }, 60000)

  return () => {
    watcher.close()
    clearInterval(cleanupInterval)
    if (debounceTimer) clearTimeout(debounceTimer)
  }
}

// Bell cooldown per project path — prevents double bells when multiple Stop hooks
// (kanban-done + kanbai-activity) write terminal statuses to the same activity file.
const lastBellTimestamp: Record<string, number> = {}
const BELL_COOLDOWN_MS = 3000

function broadcastActivityFromFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return
    const content = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    if (!data.path || !data.status) return

    const payload = {
      path: data.path,
      status: data.status,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
    }

    // Notify based on activity status (with cooldown to prevent duplicate bells)
    const isTerminal = data.status === 'done' || data.status === 'ask' || data.status === 'waiting' || data.status === 'failed'
    const now = Date.now()
    const lastBell = lastBellTimestamp[data.path]
    const bellOnCooldown = isTerminal && lastBell !== undefined && now - lastBell < BELL_COOLDOWN_MS

    if (!bellOnCooldown) {
      if (data.status === 'done') {
        sendNotification('Claude terminé', `Session terminée sur ${path.basename(data.path)}`)
      } else if (data.status === 'ask') {
        sendSilentNotification('Claude bloqué', `En attente de réponse sur ${path.basename(data.path)}`)
        playBellRepeat(2, 300)
      } else if (data.status === 'waiting') {
        sendSilentNotification('Claude en attente', `En attente d'information sur ${path.basename(data.path)}`)
        playBellRepeat(2, 300)
      } else if (data.status === 'failed') {
        sendSilentNotification('Claude échoué', `Échec sur ${path.basename(data.path)}`)
        playBellRepeat(4, 250)
      }

      if (isTerminal) {
        lastBellTimestamp[data.path] = now
      }
    }

    // Always broadcast state update to renderer windows (even if bell is on cooldown)
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.CLAUDE_ACTIVITY, payload)
        }
      } catch { /* render frame disposed — ignore */ }
    }
  } catch { /* ignore read/parse errors */ }
}
