import { execFileSync } from 'child_process'

const ALLOWED_SHELLS = new Set([
  '/bin/sh',
  '/bin/bash',
  '/bin/zsh',
  '/usr/bin/sh',
  '/usr/bin/bash',
  '/usr/bin/zsh',
  '/usr/local/bin/bash',
  '/usr/local/bin/zsh',
  '/opt/homebrew/bin/bash',
  '/opt/homebrew/bin/zsh',
])

export function isAllowedShell(shellPath: string): boolean {
  return ALLOWED_SHELLS.has(shellPath)
}

export function resolveLoginShellPath(envShell?: string): string | null {
  const userShell = envShell || '/bin/zsh'

  if (!isAllowedShell(userShell)) {
    return null
  }

  const shellPath = execFileSync(userShell, ['-ilc', 'printf "%s" "$PATH"'], {
    encoding: 'utf-8',
    timeout: 5000,
  })

  return shellPath || null
}
