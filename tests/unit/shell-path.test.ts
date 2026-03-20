import { describe, it, expect, vi } from 'vitest'
import { isAllowedShell, resolveLoginShellPath } from '../../src/main/services/shell-path'

vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => '/usr/local/bin:/usr/bin:/bin'),
}))

describe('shell-path', () => {
  describe('isAllowedShell', () => {
    it('should accept /bin/zsh', () => {
      expect(isAllowedShell('/bin/zsh')).toBe(true)
    })

    it('should accept /bin/bash', () => {
      expect(isAllowedShell('/bin/bash')).toBe(true)
    })

    it('should accept /bin/sh', () => {
      expect(isAllowedShell('/bin/sh')).toBe(true)
    })

    it('should accept /usr/bin/zsh', () => {
      expect(isAllowedShell('/usr/bin/zsh')).toBe(true)
    })

    it('should accept /usr/bin/bash', () => {
      expect(isAllowedShell('/usr/bin/bash')).toBe(true)
    })

    it('should accept /usr/local/bin/bash', () => {
      expect(isAllowedShell('/usr/local/bin/bash')).toBe(true)
    })

    it('should accept /opt/homebrew/bin/zsh', () => {
      expect(isAllowedShell('/opt/homebrew/bin/zsh')).toBe(true)
    })

    it('should reject an injected command string', () => {
      expect(isAllowedShell('/bin/zsh; rm -rf /')).toBe(false)
    })

    it('should reject a relative path', () => {
      expect(isAllowedShell('zsh')).toBe(false)
    })

    it('should reject an arbitrary absolute path', () => {
      expect(isAllowedShell('/tmp/evil-shell')).toBe(false)
    })

    it('should reject an empty string', () => {
      expect(isAllowedShell('')).toBe(false)
    })

    it('should reject path traversal attempts', () => {
      expect(isAllowedShell('/bin/../tmp/evil')).toBe(false)
    })
  })

  describe('resolveLoginShellPath', () => {
    it('should return PATH when shell is allowed', () => {
      const result = resolveLoginShellPath('/bin/zsh')
      expect(result).toBe('/usr/local/bin:/usr/bin:/bin')
    })

    it('should return null when shell is not allowed', () => {
      const result = resolveLoginShellPath('/tmp/evil-shell')
      expect(result).toBeNull()
    })

    it('should return null when shell contains injection', () => {
      const result = resolveLoginShellPath('/bin/zsh; cat /etc/passwd')
      expect(result).toBeNull()
    })

    it('should default to /bin/zsh when no shell is provided', async () => {
      const { execFileSync } = vi.mocked(await import('child_process'))
      resolveLoginShellPath(undefined)
      expect(execFileSync).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-ilc', 'printf "%s" "$PATH"'],
        { encoding: 'utf-8', timeout: 5000 },
      )
    })

    it('should use execFileSync with array arguments', async () => {
      const { execFileSync } = vi.mocked(await import('child_process'))
      resolveLoginShellPath('/bin/bash')
      expect(execFileSync).toHaveBeenCalledWith(
        '/bin/bash',
        ['-ilc', 'printf "%s" "$PATH"'],
        { encoding: 'utf-8', timeout: 5000 },
      )
    })
  })
})
