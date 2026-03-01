import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'
import { sendNotification, sendSilentNotification, playBellRepeat } from './notificationService'
import { StorageService } from './storage'
import { IS_WIN } from '../../shared/platform'

const ACTIVITY_DIR = path.join(os.homedir(), '.mirehub', 'activity')
const HOOKS_DIR = path.join(os.homedir(), '.mirehub', 'hooks')
const ENVS_DIR = path.join(os.homedir(), '.mirehub', 'envs')
const HOOK_SCRIPT_NAME = IS_WIN ? 'mirehub-activity.ps1' : 'mirehub-activity.sh'
const AUTOAPPROVE_SCRIPT_NAME = IS_WIN ? 'mirehub-autoapprove.ps1' : 'mirehub-autoapprove.sh'
const KANBAN_DONE_SCRIPT_NAME = IS_WIN ? 'kanban-done.ps1' : 'kanban-done.sh'

/**
 * Ensures the global activity hook script exists at ~/.mirehub/hooks/mirehub-activity.sh
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
    const script = `# Mirehub Claude Activity Hook (auto-generated)
# Signals Claude activity status to Mirehub via status files

# Skip activity tracking for NL database queries
if ($env:MIREHUB_NL_QUERY) { exit 0 }

$StatusDir = "$env:USERPROFILE\\.mirehub\\activity"
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
# Mirehub Claude Activity Hook (auto-generated)
# Signals Claude activity status to Mirehub via status files

# Skip activity tracking for NL database queries (no bell sound)
[ -n "$MIREHUB_NL_QUERY" ] && exit 0

STATUS_DIR="$HOME/.mirehub/activity"
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
 * Ensures the auto-approve hook script exists at ~/.mirehub/hooks/mirehub-autoapprove.sh
 * When globalAutoApprove is true: auto-approves ALL tool permissions.
 * When globalAutoApprove is false: only auto-approves during kanban sessions (MIREHUB_KANBAN_TASK_ID).
 */
export function ensureAutoApproveScript(globalAutoApprove = false): void {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }

  const scriptPath = path.join(HOOKS_DIR, AUTOAPPROVE_SCRIPT_NAME)

  if (IS_WIN) {
    const kanbanCheck = globalAutoApprove ? '# Global auto-approve enabled' : 'if (-not $env:MIREHUB_KANBAN_TASK_ID) { exit 0 }'
    const script = `# Mirehub - Auto-approve hook (auto-generated)
${kanbanCheck}
$null = $input | Out-Null
Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Mirehub auto-approve"}}'
`
    fs.writeFileSync(scriptPath, script)
  } else {
    const kanbanOnlyCheck = '[ -z "$MIREHUB_KANBAN_TASK_ID" ] && exit 0'
    const script = `#!/bin/bash
# Mirehub - Auto-approve hook (auto-generated)
${globalAutoApprove ? '# Global auto-approve enabled' : kanbanOnlyCheck}
cat > /dev/null
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Mirehub auto-approve"}}'
`
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  }
}

/**
 * Ensures the kanban-done hook script exists at ~/.mirehub/hooks/kanban-done.sh
 * Handles ticket status transitions on Claude Stop event.
 */
export function ensureKanbanDoneScript(): void {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }

  const scriptPath = path.join(HOOKS_DIR, KANBAN_DONE_SCRIPT_NAME)

  if (IS_WIN) {
    const script = `# Mirehub - Kanban task completion hook (auto-generated)
if (-not $env:MIREHUB_KANBAN_TASK_ID) { exit 0 }
if (-not $env:MIREHUB_KANBAN_FILE) { exit 0 }

$ActivityScript = "$env:USERPROFILE\\.mirehub\\hooks\\${HOOK_SCRIPT_NAME}"

$result = node -e @"
const fs = require('fs');
const file = process.env.MIREHUB_KANBAN_FILE;
const taskId = process.env.MIREHUB_KANBAN_TASK_ID;
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
const file = process.env.MIREHUB_KANBAN_FILE;
const taskId = process.env.MIREHUB_KANBAN_TASK_ID;
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
# Mirehub - Kanban task completion hook (auto-generated)
# Runs on Claude Code Stop event to check if the kanban ticket was updated.
#
# Behavior:
# - WORKING → BLOCK Claude from stopping, remind to update the ticket
# - PENDING + CTO → auto-approve: revert to TODO (unblock CTO cycle)
# - PENDING + regular → activity "waiting" (double bell in Electron)
# - FAILED  → activity "failed" (quad bell in Electron)
# - DONE    → no-op (activity "done" already written by mirehub-activity.sh)
ACTIVITY_SCRIPT="$HOME/.mirehub/hooks/mirehub-activity.sh"

[ -z "$MIREHUB_KANBAN_TASK_ID" ] && exit 0
[ -z "$MIREHUB_KANBAN_FILE" ] && exit 0

# Read ticket status, isCtoTicket flag, and title
read -r TICKET_STATUS IS_CTO TICKET_TITLE <<< $(node -e "
const fs = require('fs');
const file = process.env.MIREHUB_KANBAN_FILE;
const taskId = process.env.MIREHUB_KANBAN_TASK_ID;
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    let isCto = task.isCtoTicket || false;
    if (!isCto && task.parentTicketId) {
      const parent = tasks.find(t => t.id === task.parentTicketId);
      if (parent && parent.isCtoTicket) isCto = true;
    }
    process.stdout.write(task.status + ' ' + (isCto ? 'true' : 'false') + ' ' + (task.title || '').replace(/[\\n\\r]/g, ' '));
  }
} catch(e) { /* ignore */ }
")

case "$TICKET_STATUS" in
  PENDING)
    if [ "$IS_CTO" = "true" ]; then
      # CTO auto-approve: set back to TODO to unblock the CTO cycle
      node -e "
const fs = require('fs');
const file = process.env.MIREHUB_KANBAN_FILE;
const taskId = process.env.MIREHUB_KANBAN_TASK_ID;
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
    bash "$ACTIVITY_SCRIPT" failed
    ;;
  WORKING)
    # Claude forgot to update the ticket — block and remind
    node -e "
const reason = 'RAPPEL: Tu n as pas mis a jour le ticket kanban !\\n'
  + 'Fichier: ' + process.env.MIREHUB_KANBAN_FILE + '\\n'
  + 'Ticket ID: ' + process.env.MIREHUB_KANBAN_TASK_ID + '\\n\\n'
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
 * Installs PreToolUse + Stop hooks in a project's settings.local.json
 * to signal Claude activity back to Mirehub.
 * Merges with existing hooks (e.g. kanban hooks) without overwriting.
 */
export function installActivityHooks(projectPath: string): void {
  const storage = new StorageService()
  const { autoApprove } = storage.getSettings()
  ensureActivityHookScript()
  ensureAutoApproveScript(autoApprove)
  ensureKanbanDoneScript()

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

  const activityScriptIncludes = IS_WIN ? 'mirehub-activity.ps1' : 'mirehub-activity.sh'
  const autoApproveScriptIncludes = IS_WIN ? 'mirehub-autoapprove.ps1' : 'mirehub-autoapprove.sh'
  const kanbanDoneScriptIncludes = IS_WIN ? 'kanban-done.ps1' : 'kanban-done.sh'

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

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Iterates all existing workspace env directories (~/.mirehub/envs/*)
 * and ensures hooks are installed in each one.
 * Called at app startup to keep all envs in sync.
 */
export function syncAllWorkspaceEnvHooks(): void {
  if (!fs.existsSync(ENVS_DIR)) return
  try {
    const entries = fs.readdirSync(ENVS_DIR)
    for (const entry of entries) {
      const envDir = path.join(ENVS_DIR, entry)
      try {
        const stat = fs.statSync(envDir)
        if (stat.isDirectory()) {
          installActivityHooks(envDir)
        }
      } catch { /* skip individual failures */ }
    }
  } catch { /* ignore readdir errors */ }
}

/**
 * Watches ~/.mirehub/activity/ for status file changes.
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

    // Notify based on activity status
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

    // Send to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.CLAUDE_ACTIVITY, payload)
        }
      } catch { /* render frame disposed — ignore */ }
    }
  } catch { /* ignore read/parse errors */ }
}
