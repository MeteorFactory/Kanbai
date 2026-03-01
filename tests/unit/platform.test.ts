import { describe, it, expect } from 'vitest'
import {
  IS_MAC,
  IS_WIN,
  PATH_SEP,
  getDefaultShell,
  getDefaultShellArgs,
  getPlaySoundCommand,
  getExtendedToolPaths,
  getDbToolPaths,
  getAnalysisToolPaths,
  getWhichCommand,
  getInstallCommands,
  getInstallShell,
  shellEscape,
  getUpdateCommands,
  getAvailableShells,
  isElevated,
} from '../../src/shared/platform'
import { IS_MAC as TEST_IS_MAC, IS_WIN as TEST_IS_WIN } from '../helpers/platform'

describe('platform module', () => {
  describe('platform detection', () => {
    it('IS_MAC and IS_WIN are mutually exclusive or both false', () => {
      expect(IS_MAC && IS_WIN).toBe(false)
    })

    it('matches process.platform', () => {
      expect(IS_MAC).toBe(process.platform === 'darwin')
      expect(IS_WIN).toBe(process.platform === 'win32')
    })
  })

  describe('PATH_SEP', () => {
    it('is ; on Windows, : on macOS', () => {
      if (IS_WIN) {
        expect(PATH_SEP).toBe(';')
      } else {
        expect(PATH_SEP).toBe(':')
      }
    })
  })

  describe('getDefaultShell()', () => {
    it('returns a non-empty string', () => {
      const shell = getDefaultShell()
      expect(shell).toBeTruthy()
      expect(typeof shell).toBe('string')
    })

    if (TEST_IS_WIN) {
      it('returns powershell or cmd on Windows', () => {
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
      it('returns empty array on Windows', () => {
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

  describe('getPlaySoundCommand()', () => {
    it('returns a command string containing the path', () => {
      const cmd = getPlaySoundCommand('/tmp/test.wav')
      expect(cmd).toContain('test.wav')
    })

    if (TEST_IS_WIN) {
      it('uses SoundPlayer on Windows', () => {
        const cmd = getPlaySoundCommand('C:\\test.wav')
        expect(cmd).toContain('SoundPlayer')
        expect(cmd).toContain('powershell')
      })
    }

    if (TEST_IS_MAC) {
      it('uses afplay on macOS', () => {
        const cmd = getPlaySoundCommand('/tmp/test.wav')
        expect(cmd).toContain('afplay')
      })
    }
  })

  describe('getExtendedToolPaths()', () => {
    it('returns an array of path strings', () => {
      const paths = getExtendedToolPaths()
      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBeGreaterThan(0)
    })

    if (TEST_IS_WIN) {
      it('includes chocolatey path on Windows', () => {
        const paths = getExtendedToolPaths()
        expect(paths.some((p) => p.includes('chocolatey'))).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('includes homebrew path on macOS', () => {
        const paths = getExtendedToolPaths()
        expect(paths.some((p) => p.includes('homebrew'))).toBe(true)
      })
    }
  })

  describe('getDbToolPaths()', () => {
    it('returns an array', () => {
      const paths = getDbToolPaths()
      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBeGreaterThan(0)
    })

    if (TEST_IS_WIN) {
      it('includes PostgreSQL Program Files path on Windows', () => {
        const paths = getDbToolPaths()
        expect(paths.some((p) => p.includes('PostgreSQL'))).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('includes homebrew postgresql path on macOS', () => {
        const paths = getDbToolPaths()
        expect(paths.some((p) => p.includes('postgresql'))).toBe(true)
      })
    }
  })

  describe('getAnalysisToolPaths()', () => {
    it('returns an array', () => {
      const paths = getAnalysisToolPaths()
      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBeGreaterThan(0)
    })
  })

  describe('getWhichCommand()', () => {
    it('returns where on Windows, which on macOS', () => {
      if (IS_WIN) {
        expect(getWhichCommand()).toBe('where')
      } else {
        expect(getWhichCommand()).toBe('which')
      }
    })
  })

  describe('getInstallCommands()', () => {
    it('returns commands for known tools', () => {
      const commands = getInstallCommands()
      expect(commands.semgrep).toBeTruthy()
      expect(commands.eslint).toBeTruthy()
      expect(commands.trivy).toBeTruthy()
    })

    it('graudit Windows command does not contain literal %USERPROFILE%', () => {
      const commands = getInstallCommands()
      expect(commands.graudit).not.toContain('%USERPROFILE%')
    })

    if (TEST_IS_WIN) {
      it('uses pip/choco on Windows', () => {
        const commands = getInstallCommands()
        expect(
          commands.semgrep.includes('pip') || commands.semgrep.includes('choco'),
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

  describe('getInstallShell()', () => {
    it('returns a command and buildArgs function', () => {
      const shell = getInstallShell()
      expect(shell.command).toBeTruthy()
      expect(typeof shell.buildArgs).toBe('function')
    })

    if (TEST_IS_WIN) {
      it('uses cmd on Windows', () => {
        const shell = getInstallShell()
        expect(shell.command).toBe('cmd')
        expect(shell.buildArgs('echo hello')).toEqual(['/c', 'echo hello'])
      })
    }

    if (TEST_IS_MAC) {
      it('uses sh on macOS', () => {
        const shell = getInstallShell()
        expect(shell.command).toBe('sh')
        expect(shell.buildArgs('echo hello')).toEqual(['-c', 'echo hello'])
      })
    }
  })

  describe('shellEscape()', () => {
    if (TEST_IS_WIN) {
      it('wraps with double quotes on Windows', () => {
        const escaped = shellEscape('hello world')
        expect(escaped).toBe('"hello world"')
      })

      it('escapes inner double quotes on Windows', () => {
        const escaped = shellEscape('say "hello"')
        expect(escaped).toBe('"say \\"hello\\""')
      })
    }

    if (TEST_IS_MAC) {
      it('wraps with single quotes on macOS', () => {
        const escaped = shellEscape('hello world')
        expect(escaped).toBe("'hello world'")
      })

      it('escapes inner single quotes on macOS', () => {
        const escaped = shellEscape("it's")
        expect(escaped).toBe("'it'\\''s'")
      })
    }
  })

  describe('getUpdateCommands()', () => {
    it('returns commands for node, npm, claude', () => {
      const cmds = getUpdateCommands()
      expect(cmds.node).toBeDefined()
      expect(cmds.npm).toBeDefined()
      expect(cmds.claude).toBeDefined()
    })

    it('uses --git flag and GitHub URL for rtk', () => {
      const cmds = getUpdateCommands()
      expect(cmds.rtk).toBeDefined()
      expect(cmds.rtk.command).toBe('cargo')
      expect(cmds.rtk.args).toContain('--git')
      expect(cmds.rtk.args).toContain('https://github.com/rtk-ai/rtk')
    })

    if (TEST_IS_WIN) {
      it('uses winget for node on Windows', () => {
        const cmds = getUpdateCommands()
        expect(cmds.node.command).toBe('winget')
      })
    }

    if (TEST_IS_MAC) {
      it('uses brew for node on macOS', () => {
        const cmds = getUpdateCommands()
        expect(cmds.node.command).toBe('brew')
      })
    }
  })

  describe('getAvailableShells()', () => {
    it('returns a non-empty array of shell options', () => {
      const shells = getAvailableShells()
      expect(Array.isArray(shells)).toBe(true)
      expect(shells.length).toBeGreaterThan(0)
    })

    it('each shell has value and label', () => {
      const shells = getAvailableShells()
      for (const shell of shells) {
        expect(shell.value).toBeTruthy()
        expect(shell.label).toBeTruthy()
      }
    })

    if (TEST_IS_WIN) {
      it('includes PowerShell on Windows', () => {
        const shells = getAvailableShells()
        expect(shells.some((s) => s.value === 'powershell.exe')).toBe(true)
      })

      it('includes cmd on Windows', () => {
        const shells = getAvailableShells()
        expect(shells.some((s) => s.value === 'cmd.exe')).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('includes zsh on macOS', () => {
        const shells = getAvailableShells()
        expect(shells.some((s) => s.value === '/bin/zsh')).toBe(true)
      })

      it('includes bash on macOS', () => {
        const shells = getAvailableShells()
        expect(shells.some((s) => s.value === '/bin/bash')).toBe(true)
      })
    }
  })

  describe('isElevated()', () => {
    it('returns a boolean', () => {
      const result = isElevated()
      expect(typeof result).toBe('boolean')
    })

    if (TEST_IS_MAC) {
      it('returns false on macOS', () => {
        expect(isElevated()).toBe(false)
      })
    }
  })
})
