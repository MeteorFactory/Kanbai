import type { AppSettings } from '../types'
import { getDefaultShell } from '../platform'

/**
 * Returns default settings with platform-correct values.
 * Using a function (not a module-level const) prevents rollup from
 * incorrectly inlining getDefaultShell() during bundling.
 */
export function createDefaultSettings(): AppSettings {
  return {
    theme: 'dark',
    locale: 'fr',
    defaultShell: getDefaultShell(),
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    scrollbackLines: 10000,
    claudeDetectionColor: '#7c3aed',
    autoClauderEnabled: false,
    notificationSound: true,
    notificationBadge: true,
    checkUpdatesOnLaunch: true,
    autoCloseCompletedTerminals: false,
    autoCloseCtoTerminals: true,
    autoApprove: true,
  }
}

/** @deprecated Use createDefaultSettings() — kept for backward compat */
export const DEFAULT_SETTINGS: AppSettings = createDefaultSettings()

export const MAX_PANES_PER_TAB = 4
export const MAX_AGENTS_PER_PROJECT = 4
export const DEFAULT_LOOP_DELAY_MS = 5000
export const MAX_LOOP_ERRORS_BEFORE_STOP = 3
