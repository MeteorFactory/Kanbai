/**
 * Configurable tabs that users can show/hide.
 * Dynamic tabs (file, diff, search, prompts, shortcuts) are NOT configurable —
 * they appear contextually based on user actions.
 */

export interface TabConfig {
  id: string
  group: 'standalone' | 'services' | 'devops' | 'projects'
  labelKey: string
}

export const CONFIGURABLE_TABS: TabConfig[] = [
  { id: 'kanban', group: 'standalone', labelKey: 'view.kanban' },
  { id: 'terminal', group: 'standalone', labelKey: 'view.terminal' },
  { id: 'database', group: 'services', labelKey: 'view.database' },
  { id: 'api', group: 'services', labelKey: 'view.api' },
  { id: 'healthcheck', group: 'services', labelKey: 'view.healthcheck' },
  { id: 'devops', group: 'devops', labelKey: 'view.devops' },
  { id: 'packages', group: 'projects', labelKey: 'view.packages' },
  { id: 'analysis', group: 'projects', labelKey: 'view.analysis' },
  { id: 'stats', group: 'projects', labelKey: 'view.stats' },
  { id: 'git', group: 'projects', labelKey: 'view.git' },
  { id: 'notes', group: 'standalone', labelKey: 'view.notes' },
  { id: 'ai', group: 'standalone', labelKey: 'view.ai' },
]

export const ALL_TAB_IDS = CONFIGURABLE_TABS.map((t) => t.id)

export const TAB_GROUPS: Record<string, string[]> = {
  services: CONFIGURABLE_TABS.filter((t) => t.group === 'services').map((t) => t.id),
  devops: CONFIGURABLE_TABS.filter((t) => t.group === 'devops').map((t) => t.id),
  projects: CONFIGURABLE_TABS.filter((t) => t.group === 'projects').map((t) => t.id),
}
