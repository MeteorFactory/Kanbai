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
}))

describe('Update IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    mockExecFile.mockReset()
    mockWebContentsSend.mockClear()
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

    it('installe rtk avec --git et l URL GitHub', async () => {
      // First call: 'where'/'which' check for cargo → found
      // Second call: cargo install → success
      mockExecFile.mockImplementation((cmd: string) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.resolve({ stdout: '/usr/bin/cargo\n', stderr: '' })
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'rtk',
        scope: 'global',
      })

      expect(result).toEqual({ success: true })

      // Verify the correct args were passed to cargo
      const installCall = mockExecFile.mock.calls.find(
        (call: unknown[]) => call[0] === 'cargo' && (call[1] as string[]).includes('install'),
      )
      expect(installCall).toBeDefined()
      const args = installCall![1] as string[]
      expect(args).toContain('install')
      expect(args).toContain('--git')
      expect(args).toContain('https://github.com/rtk-ai/rtk')
      // Must NOT contain the old crate name
      expect(args).not.toContain('rtk-token-killer')
    })

    it('echoue pour rtk si cargo n est pas installe', async () => {
      mockExecFile.mockImplementation((cmd: string) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.reject(new Error('not found'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:install', {
        tool: 'rtk',
        scope: 'global',
      })

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Cargo is not installed'),
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
    it('desinstalle rtk avec le bon nom de binaire', async () => {
      mockExecFile.mockImplementation((cmd: string) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.resolve({ stdout: '/usr/bin/cargo\n', stderr: '' })
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:uninstall', { tool: 'rtk' })

      expect(result).toEqual({ success: true })

      const uninstallCall = mockExecFile.mock.calls.find(
        (call: unknown[]) => call[0] === 'cargo' && (call[1] as string[]).includes('uninstall'),
      )
      expect(uninstallCall).toBeDefined()
      const args = uninstallCall![1] as string[]
      expect(args).toContain('uninstall')
      expect(args).toContain('rtk')
      // Must NOT contain the old crate name
      expect(args).not.toContain('rtk-token-killer')
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
          return Promise.resolve({ stdout: '/usr/bin/cargo\n', stderr: '' })
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

    it('gere les erreurs de desinstallation', async () => {
      let callCount = 0
      mockExecFile.mockImplementation((cmd: string) => {
        if (cmd === (IS_WIN ? 'where' : 'which')) {
          return Promise.resolve({ stdout: '/usr/bin/cargo\n', stderr: '' })
        }
        callCount++
        if (callCount === 1) {
          return Promise.reject(new Error('cargo not found'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      const result = await mockIpcMain._invoke('update:uninstall', { tool: 'rtk' })

      expect(result).toEqual({
        success: false,
        error: 'cargo not found',
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
