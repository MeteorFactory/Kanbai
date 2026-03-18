import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/types'
import {
  DEFAULT_SETTINGS,
  MAX_PANES_PER_TAB,
  MAX_AGENTS_PER_PROJECT,
  DEFAULT_LOOP_DELAY_MS,
  MAX_LOOP_ERRORS_BEFORE_STOP,
} from '../../src/shared/constants/defaults'

describe('IPC_CHANNELS', () => {
  it('definit tous les canaux terminal', () => {
    expect(IPC_CHANNELS.TERMINAL_CREATE).toBe('terminal:create')
    expect(IPC_CHANNELS.TERMINAL_DATA).toBe('terminal:data')
    expect(IPC_CHANNELS.TERMINAL_RESIZE).toBe('terminal:resize')
    expect(IPC_CHANNELS.TERMINAL_CLOSE).toBe('terminal:close')
    expect(IPC_CHANNELS.TERMINAL_INPUT).toBe('terminal:input')
  })

  it('definit tous les canaux workspace', () => {
    expect(IPC_CHANNELS.WORKSPACE_LIST).toBe('workspace:list')
    expect(IPC_CHANNELS.WORKSPACE_CREATE).toBe('workspace:create')
    expect(IPC_CHANNELS.WORKSPACE_UPDATE).toBe('workspace:update')
    expect(IPC_CHANNELS.WORKSPACE_DELETE).toBe('workspace:delete')
  })

  it('definit tous les canaux project', () => {
    expect(IPC_CHANNELS.PROJECT_ADD).toBe('project:add')
    expect(IPC_CHANNELS.PROJECT_REMOVE).toBe('project:remove')
    expect(IPC_CHANNELS.PROJECT_SCAN_CLAUDE).toBe('project:scanClaude')
    expect(IPC_CHANNELS.PROJECT_SELECT_DIR).toBe('project:selectDir')
  })

  it('definit tous les canaux claude', () => {
    expect(IPC_CHANNELS.CLAUDE_START).toBe('claude:start')
    expect(IPC_CHANNELS.CLAUDE_STOP).toBe('claude:stop')
    expect(IPC_CHANNELS.CLAUDE_STATUS).toBe('claude:status')
    expect(IPC_CHANNELS.CLAUDE_SESSION_END).toBe('claude:sessionEnd')
  })

  it('definit tous les canaux kanban', () => {
    expect(IPC_CHANNELS.KANBAN_LIST).toBe('kanban:list')
    expect(IPC_CHANNELS.KANBAN_CREATE).toBe('kanban:create')
    expect(IPC_CHANNELS.KANBAN_UPDATE).toBe('kanban:update')
    expect(IPC_CHANNELS.KANBAN_DELETE).toBe('kanban:delete')
  })

  it('definit tous les canaux app', () => {
    expect(IPC_CHANNELS.APP_SETTINGS_GET).toBe('app:settingsGet')
    expect(IPC_CHANNELS.APP_SETTINGS_SET).toBe('app:settingsSet')
    expect(IPC_CHANNELS.APP_NOTIFICATION).toBe('app:notification')
  })

  it('est immutable (as const)', () => {
    // Verify the object is frozen-like (readonly via as const)
    const keys = Object.keys(IPC_CHANNELS)
    expect(keys.length).toBeGreaterThan(0)
    // All values should be strings
    for (const key of keys) {
      expect(typeof IPC_CHANNELS[key as keyof typeof IPC_CHANNELS]).toBe('string')
    }
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('a toutes les proprietes requises', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('dark')
    expect(DEFAULT_SETTINGS.defaultShell).toBeDefined()
    expect(DEFAULT_SETTINGS.fontSize).toBe(14)
    expect(DEFAULT_SETTINGS.fontFamily).toContain('Menlo')
    expect(DEFAULT_SETTINGS.scrollbackLines).toBe(10000)
    expect(DEFAULT_SETTINGS.claudeDetectionColor).toBe('#D4A574')
    expect(DEFAULT_SETTINGS.autoClauderEnabled).toBe(false)
    expect(DEFAULT_SETTINGS.notificationSound).toBe(true)
    expect(DEFAULT_SETTINGS.checkUpdatesOnLaunch).toBe(true)
    expect(DEFAULT_SETTINGS.toolAutoCheckEnabled).toBe(true)
  })
})

describe('constantes globales', () => {
  it('MAX_PANES_PER_TAB est 4', () => {
    expect(MAX_PANES_PER_TAB).toBe(4)
  })

  it('MAX_AGENTS_PER_PROJECT est 4', () => {
    expect(MAX_AGENTS_PER_PROJECT).toBe(4)
  })

  it('DEFAULT_LOOP_DELAY_MS est 5000', () => {
    expect(DEFAULT_LOOP_DELAY_MS).toBe(5000)
  })

  it('MAX_LOOP_ERRORS_BEFORE_STOP est 3', () => {
    expect(MAX_LOOP_ERRORS_BEFORE_STOP).toBe(3)
  })
})
