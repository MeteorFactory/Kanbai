import { IpcMain, BrowserWindow } from 'electron'
import { spawn, IPty } from 'node-pty'
import { v4 as uuid } from 'uuid'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import { IS_WIN, getDefaultShell, getDefaultShellArgs, killProcess } from '../../shared/platform'
import { StorageService } from '../services/storage'

interface ManagedTerminal {
  id: string
  pty: IPty
  cwd: string
  disposables: Array<{ dispose(): void }>
}

const terminals = new Map<string, ManagedTerminal>()

/**
 * Dispose listeners BEFORE killing the pty process.
 * This prevents native callbacks from firing into a dying JS context (SIGABRT).
 *
 * We use process.kill(pid, 'SIGKILL') instead of pty.kill() (SIGHUP) so the
 * child exits immediately — minimising the window where node-pty's native read
 * thread can queue a ThreadSafeFunction callback into a shutting-down V8 isolate.
 */
function disposeTerminal(terminal: ManagedTerminal): void {
  for (const d of terminal.disposables) {
    d.dispose()
  }
  terminal.disposables.length = 0
  killProcess(terminal.pty.pid, 'SIGKILL')
}

/**
 * Ensure a custom ZDOTDIR with a .zshenv and .zshrc that properly
 * initialise the shell environment. This handles two issues:
 *
 * 1. When launched from Finder, process.env.PATH is minimal
 *    (/usr/bin:/bin:/usr/sbin:/sbin). We source /etc/zprofile and
 *    ~/.zprofile in .zshenv so path_helper and user PATH additions
 *    are available (claude, eza, brew tools, etc.).
 *
 * 2. compinit must be loaded BEFORE the user's .zshrc to prevent
 *    "command not found: compdef" errors.
 */
function ensureZshWrapper(): string {
  const shellDir = path.join(os.homedir(), '.mirehub', 'shell')
  if (!fs.existsSync(shellDir)) {
    fs.mkdirSync(shellDir, { recursive: true })
  }

  // .zshenv runs first (before .zshrc) — set up PATH here
  const zshenvContent = [
    '# Source system and user profile for PATH setup (critical when launched from Finder)',
    '[ -f /etc/zprofile ] && source /etc/zprofile',
    '[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"',
  ].join('\n')

  const zshenvPath = path.join(shellDir, '.zshenv')
  if (!fs.existsSync(zshenvPath) || fs.readFileSync(zshenvPath, 'utf-8') !== zshenvContent) {
    fs.writeFileSync(zshenvPath, zshenvContent, 'utf-8')
  }

  // .zshrc — compinit + user config
  const zshrcContent = [
    'autoload -Uz compinit && compinit -C',
    'ZDOTDIR="$HOME"',
    '[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"',
  ].join('\n')

  const zshrcPath = path.join(shellDir, '.zshrc')
  if (!fs.existsSync(zshrcPath) || fs.readFileSync(zshrcPath, 'utf-8') !== zshrcContent) {
    fs.writeFileSync(zshrcPath, zshrcContent, 'utf-8')
  }

  return shellDir
}

export function registerTerminalHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (_event, options: { cwd?: string; shell?: string }) => {
      const id = uuid()
      const savedShell = new StorageService().getSettings().defaultShell
      // Validate saved shell exists — it may be a macOS path (e.g. /bin/zsh)
      // on a Windows machine if data.json was synced across platforms.
      const shellExists = savedShell && fs.existsSync(savedShell)
      const shell = options.shell || (shellExists ? savedShell : null) || getDefaultShell()
      const cwd = options.cwd || os.homedir()

      // No -l for zsh (node-pty PTY makes it interactive; login shell causes compdef issues)
      // Keep -l for bash where it's needed for PATH setup
      const isZsh = !IS_WIN && shell.endsWith('/zsh')
      const shellArgs = getDefaultShellArgs(shell)

      // For zsh: use a custom ZDOTDIR that loads compinit before the user's .zshrc
      const shellEnv: Record<string, string> = {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>

      // Remove Claude Code session markers so terminals can launch claude without
      // "nested session" errors (the app may itself be launched from a Claude session)
      delete shellEnv.CLAUDECODE
      delete shellEnv.CLAUDE_CODE_ENTRYPOINT

      if (isZsh) {
        shellEnv.ZDOTDIR = ensureZshWrapper()
      }

      const pty = spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: shellEnv,
      })

      const managed: ManagedTerminal = { id, pty, cwd, disposables: [] }
      terminals.set(id, managed)

      // Forward output to renderer (try-catch guards against render frame disposal during reload)
      managed.disposables.push(
        pty.onData((data: string) => {
          // Guard: ignore callbacks for terminals already removed from the map
          if (!terminals.has(id)) return
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id, data })
              }
            } catch { /* render frame disposed — ignore */ }
          }
        }),
      )

      managed.disposables.push(
        pty.onExit(({ exitCode, signal }) => {
          terminals.delete(id)
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.TERMINAL_CLOSE, { id, exitCode, signal })
              }
            } catch { /* render frame disposed — ignore */ }
          }
        }),
      )

      return { id, pid: pty.pid }
    },
  )

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_event, { id, data }: { id: string; data: string }) => {
    const terminal = terminals.get(id)
    if (terminal) {
      terminal.pty.write(data)
    }
  })

  ipcMain.on(
    IPC_CHANNELS.TERMINAL_RESIZE,
    (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
      const terminal = terminals.get(id)
      if (terminal) {
        terminal.pty.resize(cols, rows)
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CLOSE, async (_event, { id }: { id: string }) => {
    const terminal = terminals.get(id)
    if (terminal) {
      terminals.delete(id)
      disposeTerminal(terminal)
      // Notify renderer manually since onExit won't fire after dispose
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.TERMINAL_CLOSE, { id, exitCode: 0, signal: 0 })
          }
        } catch { /* render frame disposed — ignore */ }
      }
    }
  })
}

export function cleanupTerminals(): void {
  for (const [, terminal] of terminals) {
    disposeTerminal(terminal)
  }
  terminals.clear()
}
