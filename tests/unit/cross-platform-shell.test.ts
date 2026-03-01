import { describe, it, expect } from 'vitest'
import {
  IS_WIN,
  shellEscape,
  getInstallShell,
  getInstallCommands,
  getWhichCommand,
  getDefaultShell,
  getDefaultShellArgs,
  getExecOptions,
} from '../../src/shared/platform'
import { IS_MAC as TEST_IS_MAC, IS_WIN as TEST_IS_WIN } from '../helpers/platform'

describe('cross-platform shell', () => {
  describe('shellEscape()', () => {
    it('returns a non-empty string', () => {
      const result = shellEscape('hello')
      expect(result.length).toBeGreaterThan(0)
    })

    it('wraps the value in quotes', () => {
      const result = shellEscape('hello world')
      expect(result.startsWith('"') || result.startsWith("'")).toBe(true)
    })

    if (TEST_IS_WIN) {
      it('uses double quotes on Windows', () => {
        expect(shellEscape('test')).toBe('"test"')
      })

      it('escapes inner double quotes on Windows', () => {
        expect(shellEscape('say "hi"')).toBe('"say \\"hi\\""')
      })
    }

    if (TEST_IS_MAC) {
      it('uses single quotes on macOS', () => {
        expect(shellEscape('test')).toBe("'test'")
      })

      it('escapes inner single quotes on macOS', () => {
        expect(shellEscape("it's")).toBe("'it'\\''s'")
      })
    }
  })

  describe('getInstallShell()', () => {
    it('returns a command and buildArgs function', () => {
      const shell = getInstallShell()
      expect(typeof shell.command).toBe('string')
      expect(typeof shell.buildArgs).toBe('function')
    })

    it('buildArgs returns an array with the command', () => {
      const shell = getInstallShell()
      const args = shell.buildArgs('echo test')
      expect(Array.isArray(args)).toBe(true)
      expect(args.length).toBe(2)
      expect(args[1]).toBe('echo test')
    })

    if (TEST_IS_WIN) {
      it('uses cmd on Windows', () => {
        const shell = getInstallShell()
        expect(shell.command).toBe('cmd')
        expect(shell.buildArgs('echo test')[0]).toBe('/c')
      })
    }

    if (TEST_IS_MAC) {
      it('uses sh on macOS', () => {
        const shell = getInstallShell()
        expect(shell.command).toBe('sh')
        expect(shell.buildArgs('echo test')[0]).toBe('-c')
      })
    }
  })

  describe('getInstallCommands()', () => {
    it('returns commands for all expected tools', () => {
      const commands = getInstallCommands()
      const expectedTools = ['semgrep', 'eslint', 'trivy', 'bandit', 'cppcheck']
      expectedTools.forEach((tool) => {
        expect(commands[tool]).toBeDefined()
        expect(typeof commands[tool]).toBe('string')
      })
    })

    if (TEST_IS_WIN) {
      it('uses pip/choco/npm on Windows', () => {
        const commands = getInstallCommands()
        const allCommands = Object.values(commands).join(' ')
        expect(
          allCommands.includes('pip') ||
          allCommands.includes('choco') ||
          allCommands.includes('npm'),
        ).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('uses brew on macOS', () => {
        const commands = getInstallCommands()
        expect(commands.semgrep).toContain('brew')
      })
    }
  })

  describe('getWhichCommand()', () => {
    if (TEST_IS_WIN) {
      it('returns "where" on Windows', () => {
        expect(getWhichCommand()).toBe('where')
      })
    }

    if (TEST_IS_MAC) {
      it('returns "which" on macOS', () => {
        expect(getWhichCommand()).toBe('which')
      })
    }
  })

  describe('getDefaultShell()', () => {
    it('returns a non-empty string', () => {
      expect(getDefaultShell().length).toBeGreaterThan(0)
    })

    if (TEST_IS_WIN) {
      it('returns a Windows shell on Windows', () => {
        const shell = getDefaultShell()
        expect(
          shell.includes('powershell') || shell.includes('cmd'),
        ).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('returns a Unix shell on macOS', () => {
        const shell = getDefaultShell()
        expect(shell.startsWith('/')).toBe(true)
      })
    }
  })

  describe('getDefaultShellArgs()', () => {
    if (TEST_IS_WIN) {
      it('returns empty array for Windows shells', () => {
        expect(getDefaultShellArgs('powershell.exe')).toEqual([])
        expect(getDefaultShellArgs('cmd.exe')).toEqual([])
      })
    }

    if (TEST_IS_MAC) {
      it('returns [-l] for bash on macOS', () => {
        expect(getDefaultShellArgs('/bin/bash')).toEqual(['-l'])
      })

      it('returns [] for zsh on macOS', () => {
        expect(getDefaultShellArgs('/bin/zsh')).toEqual([])
      })
    }
  })

  describe('getExecOptions()', () => {
    it('returns an object with shell property', () => {
      const opts = getExecOptions()
      expect(typeof opts.shell).toBe('boolean')
    })

    if (TEST_IS_WIN) {
      it('returns shell: true on Windows', () => {
        expect(getExecOptions().shell).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('returns shell: false on macOS', () => {
        expect(getExecOptions().shell).toBe(false)
      })
    }
  })
})
