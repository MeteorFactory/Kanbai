import { IpcMain, BrowserWindow, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, KanbanTask, KanbanStatus, KanbanAttachment } from '../../shared/types'
import {
  getKanbanPath,
  readKanbanTasks,
  writeKanbanTasks,
} from '../../mcp-server/lib/kanban-store'

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

  const hookScriptPath = path.join(hooksDir, 'kanban-done.sh')
  const hookScript = `#!/bin/bash
# Kanbai - Kanban task completion hook (auto-generated)
# Checks the kanban ticket status and writes the appropriate activity status.
# PENDING + CTO → auto-approve: revert to TODO (unblock CTO cycle)
# PENDING + regular → activity "waiting" (double bell in Electron)
# FAILED  → activity "failed"  (quad bell in Electron)
# WORKING → interrupted, revert to TODO (renderer handles re-launch)
# DONE    → activity "done" (already written by kanbai-activity.sh)
ACTIVITY_SCRIPT="$HOME/.kanbai/hooks/kanbai-activity.sh"

[ -z "$KANBAI_KANBAN_TASK_ID" ] && exit 0
[ -z "$KANBAI_KANBAN_FILE" ] && exit 0

# Read ticket status and isCtoTicket flag
read -r TICKET_STATUS IS_CTO <<< $(node -e "
const fs = require('fs');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task) process.stdout.write(task.status + ' ' + (task.isCtoTicket ? 'true' : 'false'));
} catch(e) { /* ignore */ }
")

case "$TICKET_STATUS" in
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
    bash "$ACTIVITY_SCRIPT" failed
    ;;
  WORKING)
    # Claude was interrupted — revert to TODO
    node -e "
const fs = require('fs');
const file = process.env.KANBAI_KANBAN_FILE;
const taskId = process.env.KANBAI_KANBAN_TASK_ID;
try {
  const tasks = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const task = tasks.find(t => t.id === taskId);
  if (task && task.status === 'WORKING') {
    task.status = 'TODO';
    task.updatedAt = Date.now();
    fs.writeFileSync(file, JSON.stringify(tasks, null, 2), 'utf-8');
  }
} catch(e) { /* ignore */ }
"
    ;;
esac
`
  fs.writeFileSync(hookScriptPath, hookScript, { mode: 0o755 })

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
  const expectedCommand = `bash "${hookScriptPath}"`
  const existingIdx = stopHooks.findIndex((h) =>
    h.hooks?.some((hk) => hk.command?.includes('kanban-done.sh')),
  )

  if (existingIdx === -1) {
    // No kanban hook at all — add it
    stopHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: expectedCommand }],
    })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } else {
    // Kanban hook exists — check if path is correct, update if stale
    const entry = stopHooks[existingIdx]!
    const hookCmd = entry.hooks?.find((hk) => hk.command?.includes('kanban-done.sh'))
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

      // Migration: assign ticketNumber to tasks that don't have one
      const needsMigration = tasks.some((t) => t.ticketNumber == null)
      if (needsMigration) {
        // Sort by createdAt to assign numbers in chronological order
        const sorted = [...tasks].sort((a, b) => a.createdAt - b.createdAt)
        let nextNum = 1
        for (const t of sorted) {
          if (t.ticketNumber == null) {
            // Find the actual task in the array and assign
            const original = tasks.find((o) => o.id === t.id)!
            original.ticketNumber = nextNum
          }
          nextNum = Math.max(nextNum, (t.ticketNumber ?? nextNum) + 1)
        }
        writeKanbanTasks(workspaceId, tasks)
      }

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
        priority: 'low' | 'medium' | 'high' | 'critical'
        status?: KanbanStatus
        isCtoTicket?: boolean
        disabled?: boolean
        labels?: string[]
        aiProvider?: string
      },
    ) => {
      const tasks = readKanbanTasks(data.workspaceId)

      // Calculate next ticket number
      const maxTicketNumber = tasks.reduce((max, t) => Math.max(max, t.ticketNumber ?? 0), 0)

      const task: KanbanTask = {
        id: uuid(),
        workspaceId: data.workspaceId,
        targetProjectId: data.targetProjectId,
        ticketNumber: maxTicketNumber + 1,
        title: data.title,
        description: data.description,
        status: data.status || 'TODO',
        priority: data.priority,
        isCtoTicket: data.isCtoTicket,
        disabled: data.disabled,
        labels: data.labels,
        aiProvider: data.aiProvider as KanbanTask['aiProvider'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      tasks.push(task)
      writeKanbanTasks(data.workspaceId, tasks)
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
      }
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
      { cwd, taskId, workspaceId }: { cwd: string; taskId: string; workspaceId: string },
    ) => {
      const conversationPath = findNewestClaudeConversation(cwd)
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
}
