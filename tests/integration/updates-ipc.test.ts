import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockIpcMain } from '../mocks/electron'
import { IS_WIN } from '../helpers/platform'

// Mock crossExecFile from platform (instead of child_process directly)
const mockExecFile = vi.fn()

vi.mock('../../src/shared/platform', async () => {
  const actual = await vi.importActual<typeof import('../../src/shared/platform')>('../../src/shared/platform')
  return {
    ...actual,
    crossExecFile: mockExecFile,
  }
})

// Mock fs/promises for rtk vendor operations
const mockFsRm = vi.fn().mockResolvedValue(undefined)
const mockFsMkdir = vi.fn().mockResolvedValue(undefined)
const mockFsAccess = vi.fn().mockRejectedValue(new Error('not found'))

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return {
    ...actual,
    default: {
      ...actual,
      rm: mockFsRm,
      mkdir: mockFsMkdir,
      access: mockFsAccess,
    },
    rm: mockFsRm,
    mkdir: mockFsMkdir,
    access: mockFsAccess,
  }
})

// Mock BrowserWindow
const mockWebContentsSend = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: mockWebContentsSend,
          isDestroyed: () => false,
        },
      },
    ],
  },
  app: {
    getPath: () => '/tmp/kanbai-test',
  },
}))

describe('Update IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    mockExecFile.mockReset()
    mockWebContentsSend.mockClear()
    mockFsRm.mockReset().mockResolvedValue(undefined)
    mockFsMkdir.mockReset().mockResolvedValue(undefined)
    mockFsAccess.mockReset().mockRejectedValue(new Error('not found'))
    vi.resetModules()

    const { registerUpdateHandlers } = await import('../../src/main/ipc/updates')

    mockIpcMain = createMockIpcMain()
    registerUpdateHandlers(mockIpcMain as never)
  })

  it('enregistre les 3 handlers update', () => {
    expect(mockIpcMain._handlers.has('update:check')).toBe(true)
    expect(mockIpcMain._handlers.has('update:install')).toBe(true)
    expect(mockIpcMain._handlers.has('update:uninstall')).toBe(true)
  })

  describe('check', () => {
    it('verifie les versions des outils', async () => {
      mockExecFile.mockImplementation((command: string, args: string[]) => {
        if (command === 'node' && args[0] === '--version') {
          return Promise.resolve({ stdout: 'v20.0.0\n' })
        }
        if (command === 'npm' && args[0] === '--version') {
          return Promise.resolve({ stdout: '10.0.0\n' })
        }
        if (command === 'claude' && args[0] === '--version') {
          return Promise.resolve({ stdout: '1.0.0\n' })
        }
        if (command === 'git' && args[0] === '--version') {
          return Promise.resolve({ stdout: 'git version 2.40.0\n' })
        }
        if (command === 'brew' && args[0] === 'info') {
          return Promise.resolve({
            stdout: JSON.stringify({
              formulae: [{ versions: { stable: '22.0.0' } }],
            }),
          })
        }
        if (command === 'npm' && args[0] === 'view') {
          if (args[1] === 'npm') return Promise.resolve({ stdout: '11.0.0\n' })
          if (args[1] === '@anthropic-ai/claude-code') return Promise.resolve({ stdout: '2.0.0\n' })
          if (args[1] === 'node') return Promise.resolve({ stdout: '22.0.0\n' })
        }
        return Promise.reject(new Error(`Unknown command: ${command} ${args.join(' ')}`))
      })

      const results = await mockIpcMain._invoke('update:check')

      expect(results).toBeInstanceOf(Array)
      expect(results.length).toBeGreaterThan(0)

      const nodeInfo = results.find((r: { tool: string }) => r.tool === 'node')
      expect(nodeInfo).toBeDefined()
      expect(nodeInfo.currentVersion).toBe('20.0.0')
      expect(nodeInfo.installed).toBe(true)
      expect(nodeInfo.scope).toBe('global')
    })

    it('detecte la version de npm correctement', async () => {
      mockExecFile.mockImplementation((command: string, args: string[]) => {
        if (command === 'npm' && args[0] === '--version') {
          return Promise.resolve({ stdout: '10.2.4\n' })
        }
        if (command === 'npm' && args[0] === 'view' && args[1] === 'npm') {
          return Promise.resolve({ stdout: '11.0.0\n' })
        }
        return Promise.reject(new Error('not found'))
      })

      const results = await mockIpcMain._invoke('update:check')
      const npmInfo = results.find((r: { tool: string }) => r.tool === 'npm')
      expect(npmInfo).toBeDefined()
      expect(npmInfo.installed).toBe(true)
      expect(npmInfo.currentVersion).toBe('10.2.4')
      expect(npmInfo.latestVersion).toBe('11.0.0')
      expect(npmInfo.updateAvailable).toBe(true)
    })

    if (!IS_WIN) {
      it('utilise brew pour verifier codex quand il est installe via Homebrew', async () => {
        mockExecFile.mockImplementation((command: string, args: string[]) => {
          if (command === 'codex' && args[0] === '--version') {
            return Promise.resolve({ stdout: 'codex-cli 0.107.0\n' })
          }
          if (command === 'brew' && args[0] === 'info' && args[2] === 'codex') {
            return Promise.resolve({
              stdout: JSON.stringify({
                formulae: [],
                casks: [{ version: '0.108.0', installed: '0.107.0' }],
              }),
            })
          }
          if (command === 'npm' && args[0] === 'view' && args[1] === '@openai/codex') {
            return Promise.reject(new Error('unexpected npm lookup for brew-managed codex'))
          }
          return Promise.reject(new Error('not found'))
        })

        const results = await mockIpcMain._invoke('update:check')
        const codexInfo = results.find((r: { tool: string }) => r.tool === 'codex')

        expect(codexInfo).toBeDefined()
        expect(codexInfo.currentVersion).toBe('0.107.0')
        expect(codexInfo.latestVersion).toBe('0.108.0')
        expect(codexInfo.updateAvailable).toBe(true)

        const npmCodexViewCalls = mockExecFile.mock.calls.filter(
          (call: unknown[]) =>
            call[0] === 'npm'
            && (call[1] as string[])[0] === 'view'
            && (call[1] as string[])[1] === '@openai/codex',
        )
        expect(npmCodexViewCalls).toHaveLength(0)
      })
    }

    it('retourne les outils introuvables avec installed a false', async () => {
      mockExecFile.mockImplementation((command: string, args: string[]) => {
        if (command === 'node' && args[0] === '--version') {
          return Promise.resolve({ stdout: 'v20.0.0\n' })
        }
        // All other tools fail
        return Promise.reject(new Error('command not found'))
      })

      const results = await mockIpcMain._invoke('update:check')

      // All tools are returned, but only node is installed
      const installed = results.filter((r: { installed: boolean }) => r.installed)
      expect(installed).toHaveLength(1)
      expect(installed[0].tool).toBe('node')

      const notInstalled = results.filter((r: { installed: boolean }) => !r.installed)
      expect(notInstalled.length).toBeGreaterThan(0)
      notInstalled.forEach((r: { currentVersion: string }) => {
        expect(r.currentVersion).toBe('')
      })
    })

    it('retourne tous les outils comme non installes si aucun n est disponible', async () => {
      mockExecFile.mockRejectedValue(new Error('command not found'))

      const results = await mockIpcMain._invoke('update:check')

      // All tools returned but none installed
      expect(results.length).toBeGreaterThan(0)
      results.forEach((r: { installed: boolean; currentVersion: string }) => {
        expect(r.installed).toBe(false)
        expect(r.currentVersion).toBe('')
      })
    })

    if (IS_WIN) {
      it('passe shell: true dans les options execFile sur Windows', async () => {
        mockExecFile.mockImplementation((command: string, args: string[], options?: Record<string, unknown>) => {
          if (command === 'node' && args[0] === '--version') {
            // Verify shell option is passed
            expect(options).toBeDefined()
            expect(options!.shell).toBe(true)
            return Promise.resolve({ stdout: 'v20.0.0\n' })
          }
          if (command === 'npm' && args[0] === '--version') {
            expect(options!.shell).toBe(true)
            return Promise.resolve({ stdout: '10.0.0\n' })
          }
          return Promise.reject(new Error('not found'))
        })

        await mockIpcMain._invoke('update:check')
      })
    }
  })

  describe('install', () => {
    it('installe une mise a jour npm', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'npm',
        scope: 'global',
      })

      expect(result).toEqual({ success: true })
      expect(mockWebContentsSend).toHaveBeenCalledWith('update:status', expect.objectContaining({
        tool: 'npm',
        status: 'completed',
        progress: 100,
      }))
    })

    it('installe rtk via git clone en mode release', async () => {
      // which rtk → not found (not brew-managed)
      // brew info → not found
      // git clone → success
      mockExecFile.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.reject(new Error('not found'))
        }
        if (cmd === 'brew') {
          return Promise.reject(new Error('not found'))
        }
        if (cmd === 'git') {
          return Promise.resolve({ stdout: '', stderr: '' })
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'rtk',
        scope: 'global',
      })

      expect(result).toEqual({ success: true })

      // Verify git clone was called with the correct repo URL
      const cloneCall = mockExecFile.mock.calls.find(
        (call: unknown[]) => call[0] === 'git' && (call[1] as string[]).includes('clone'),
      )
      expect(cloneCall).toBeDefined()
      const args = cloneCall![1] as string[]
      expect(args).toContain('clone')
      expect(args).toContain('--depth=1')
      expect(args).toContain('https://github.com/rtk-ai/rtk.git')
    })

    it('echoue pour rtk si git clone echoue', async () => {
      mockExecFile.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.reject(new Error('not found'))
        }
        if (cmd === 'brew') {
          return Promise.reject(new Error('not found'))
        }
        if (cmd === 'git' && args[0] === 'clone') {
          return Promise.reject(new Error('git clone failed'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'rtk',
        scope: 'global',
      })

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('git clone failed'),
      })
    })

    it('installe une mise a jour node', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'node',
        scope: 'global',
      })

      expect(result).toEqual({ success: true })

      const installCall = mockExecFile.mock.calls.find(
        (call: unknown[]) => {
          const cmd = call[0] as string
          return cmd === 'winget' || cmd === 'brew'
        },
      )
      expect(installCall).toBeDefined()
    })

    it('installe une mise a jour claude', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'claude',
        scope: 'global',
      })

      expect(result).toEqual({ success: true })

      const installCall = mockExecFile.mock.calls.find(
        (call: unknown[]) => call[0] === 'npm' && (call[1] as string[]).includes('@anthropic-ai/claude-code@latest'),
      )
      expect(installCall).toBeDefined()
    })

    if (!IS_WIN) {
      it('installe codex via brew --cask quand codex est gere par Homebrew', async () => {
        mockExecFile.mockImplementation((command: string, args: string[]) => {
          if (command === 'codex' && args[0] === '--version') {
            return Promise.resolve({ stdout: 'codex-cli 0.107.0\n' })
          }
          if (command === 'brew' && args[0] === 'info' && args[2] === 'codex') {
            return Promise.resolve({
              stdout: JSON.stringify({
                formulae: [],
                casks: [{ version: '0.108.0', installed: '0.107.0' }],
              }),
            })
          }
          if (
            command === 'brew'
            && args[0] === 'upgrade'
            && args[1] === '--cask'
            && args[2] === 'codex'
          ) {
            return Promise.resolve({ stdout: '', stderr: '' })
          }
          return Promise.reject(new Error(`Unexpected command: ${command} ${args.join(' ')}`))
        })

        const result = await mockIpcMain._invoke('update:install', {
          tool: 'codex',
          scope: 'global',
        })

        expect(result).toEqual({ success: true })

        const brewUpgradeCall = mockExecFile.mock.calls.find(
          (call: unknown[]) =>
            call[0] === 'brew'
            && (call[1] as string[])[0] === 'upgrade'
            && (call[1] as string[])[1] === '--cask'
            && (call[1] as string[])[2] === 'codex',
        )
        expect(brewUpgradeCall).toBeDefined()

        const npmCodexInstallCall = mockExecFile.mock.calls.find(
          (call: unknown[]) =>
            call[0] === 'npm' && (call[1] as string[]).includes('@openai/codex@latest'),
        )
        expect(npmCodexInstallCall).toBeUndefined()
      })
    }

    if (!IS_WIN) {
      it('installe go via brew quand go est gere par Homebrew', async () => {
        mockExecFile.mockImplementation((command: string, args: string[]) => {
          if (command === 'go' && args[0] === 'version') {
            return Promise.resolve({ stdout: 'go version go1.22.1 darwin/arm64\n' })
          }
          if (command === 'brew' && args[0] === 'info' && args[2] === 'go') {
            return Promise.resolve({
              stdout: JSON.stringify({
                formulae: [{ versions: { stable: '1.22.2' }, installed: [{}] }],
                casks: [],
              }),
            })
          }
          if (command === 'brew' && args[0] === 'upgrade' && args[1] === 'go') {
            return Promise.resolve({ stdout: '', stderr: '' })
          }
          return Promise.reject(new Error(`Unexpected command: ${command} ${args.join(' ')}`))
        })

        const result = await mockIpcMain._invoke('update:install', {
          tool: 'go',
          scope: 'global',
        })

        expect(result).toEqual({ success: true })

        const brewUpgradeCall = mockExecFile.mock.calls.find(
          (call: unknown[]) =>
            call[0] === 'brew'
            && (call[1] as string[])[0] === 'upgrade'
            && (call[1] as string[])[1] === 'go',
        )
        expect(brewUpgradeCall).toBeDefined()
      })
    }

    it('echoue pour un outil inconnu', async () => {
      const result = await mockIpcMain._invoke('update:install', {
        tool: 'unknown-tool',
        scope: 'global',
      })

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Unknown tool'),
      })
    })

    it('gere les erreurs d installation', async () => {
      mockExecFile.mockRejectedValue(new Error('Permission denied'))

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'npm',
        scope: 'global',
      })

      expect(result).toEqual({
        success: false,
        error: 'Permission denied',
      })
      expect(mockWebContentsSend).toHaveBeenCalledWith('update:status', expect.objectContaining({
        status: 'failed',
      }))
    })

    it('envoie les notifications de progression', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      await mockIpcMain._invoke('update:install', {
        tool: 'npm',
        scope: 'global',
      })

      // Should have sent: starting, installing (50%), completed (100%)
      const statusCalls = mockWebContentsSend.mock.calls.filter(
        (call: unknown[]) => call[0] === 'update:status',
      )
      expect(statusCalls.length).toBeGreaterThanOrEqual(3)

      expect(statusCalls[0][1]).toMatchObject({ status: 'starting' })
      expect(statusCalls[1][1]).toMatchObject({ status: 'installing', progress: 50 })
      expect(statusCalls[2][1]).toMatchObject({ status: 'completed', progress: 100 })
    })

    if (IS_WIN) {
      it('passe shell: true pour l install sur Windows', async () => {
        mockExecFile.mockImplementation((_command: string, _args: string[], options?: Record<string, unknown>) => {
          expect(options).toBeDefined()
          expect(options!.shell).toBe(true)
          return Promise.resolve({ stdout: '', stderr: '' })
        })

        await mockIpcMain._invoke('update:install', {
          tool: 'npm',
          scope: 'global',
        })
      })
    }
  })

  describe('uninstall', () => {
    it('desinstalle rtk en supprimant le repertoire source', async () => {
      // which rtk → found (system install, not brew)
      // brew info → not found
      mockExecFile.mockImplementation((cmd: string) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.resolve({ stdout: '/usr/local/bin/rtk\n', stderr: '' })
        }
        if (cmd === 'brew') {
          return Promise.reject(new Error('not found'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:uninstall', { tool: 'rtk' })

      expect(result).toEqual({ success: true })
      expect(mockFsRm).toHaveBeenCalledWith(
        expect.stringContaining('vendor/rtk'),
        expect.objectContaining({ recursive: true, force: true }),
      )
    })

    it('refuse de desinstaller un outil systeme', async () => {
      const result = await mockIpcMain._invoke('update:uninstall', { tool: 'node' })

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Cannot uninstall core tool'),
      })
    })

    it('envoie les notifications de statut pour la desinstallation', async () => {
      mockExecFile.mockImplementation((cmd: string) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.resolve({ stdout: '/usr/local/bin/rtk\n', stderr: '' })
        }
        if (cmd === 'brew') {
          return Promise.reject(new Error('not found'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      await mockIpcMain._invoke('update:uninstall', { tool: 'rtk' })

      const statusCalls = mockWebContentsSend.mock.calls.filter(
        (call: unknown[]) => call[0] === 'update:status',
      )
      expect(statusCalls.length).toBeGreaterThanOrEqual(2)
      expect(statusCalls[0][1]).toMatchObject({ status: 'uninstalling' })
      expect(statusCalls[1][1]).toMatchObject({ status: 'completed' })
    })

    it('gere les erreurs de desinstallation via brew', async () => {
      // Simulate rtk installed via brew, but brew uninstall fails
      // which rtk → not found (so !commandPath is true, brew path is taken)
      mockExecFile.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.reject(new Error('not found'))
        }
        if (cmd === 'brew' && args[0] === 'info') {
          return Promise.resolve({
            stdout: JSON.stringify({
              formulae: [{ name: 'rtk', versions: { stable: '1.0.0' }, installed: [{}] }],
              casks: [],
            }),
          })
        }
        if (cmd === 'brew' && args[0] === 'uninstall') {
          return Promise.reject(new Error('brew uninstall failed'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:uninstall', { tool: 'rtk' })

      expect(result).toEqual({
        success: false,
        error: 'brew uninstall failed',
      })
      expect(mockWebContentsSend).toHaveBeenCalledWith('update:status', expect.objectContaining({
        status: 'failed',
      }))
    })
  })

  describe('enrichedExecOptions', () => {
    it('inclut le PATH enrichi avec les chemins d outils', async () => {
      mockExecFile.mockImplementation((_command: string, _args: string[], options?: Record<string, unknown>) => {
        const env = options?.env as NodeJS.ProcessEnv | undefined
        expect(env).toBeDefined()
        expect(env!.PATH).toBeDefined()
        // PATH should contain the original PATH plus extended tool paths
        expect(env!.PATH!.length).toBeGreaterThan((process.env.PATH || '').length)
        return Promise.resolve({ stdout: 'v20.0.0\n' })
      })

      await mockIpcMain._invoke('update:check')
    })

    if (IS_WIN) {
      it('inclut les chemins cargo et chocolatey sur Windows', async () => {
        mockExecFile.mockImplementation((_command: string, _args: string[], options?: Record<string, unknown>) => {
          const env = options?.env as NodeJS.ProcessEnv | undefined
          const pathValue = env?.PATH || ''
          expect(pathValue).toContain('.cargo\\bin')
          expect(pathValue).toContain('chocolatey')
          return Promise.resolve({ stdout: 'v20.0.0\n' })
        })

        await mockIpcMain._invoke('update:check')
      })
    }
  })
})
