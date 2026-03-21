import type { AppSettings } from '../../../../shared/types'
import { useI18n } from '../../../lib/i18n'
import { useWorkspaceStore } from '../../workspace/workspace-store'
import { CONFIGURABLE_TABS, ALL_TAB_IDS } from '../../../../shared/constants/tabs'

interface TabsSettingsProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function TabsSettings({ settings, updateSetting }: TabsSettingsProps) {
  const { t } = useI18n()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? ''

  return (
    <div className="settings-section">
      {/* Workspace-level visible tabs */}
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.tabsWorkspace')}</label>
            <span className="settings-hint">{t('settings.tabsWorkspaceHint')}{activeWorkspaceName ? ` (${activeWorkspaceName})` : ''}</span>
          </div>
        </div>
        <div className="settings-tab-grid">
          {CONFIGURABLE_TABS.map((tab) => {
            const wsTabs = activeWorkspaceId
              ? (workspaces.find((w) => w.id === activeWorkspaceId)?.visibleTabs ?? ALL_TAB_IDS)
              : ALL_TAB_IDS
            const isActive = wsTabs.includes(tab.id)
            return (
              <button
                key={tab.id}
                className={`settings-radio-btn${isActive ? ' settings-radio-btn--active' : ''}`}
                onClick={() => {
                  if (!activeWorkspaceId) return
                  const current = workspaces.find((w) => w.id === activeWorkspaceId)?.visibleTabs ?? [...ALL_TAB_IDS]
                  const next = isActive
                    ? current.filter((id) => id !== tab.id)
                    : [...current, tab.id]
                  const ws = useWorkspaceStore.getState()
                  ws.updateWorkspace(activeWorkspaceId, { visibleTabs: next })
                }}
              >
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Default tabs for new workspaces */}
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-info">
            <label className="settings-label">{t('settings.tabsDefault')}</label>
            <span className="settings-hint">{t('settings.tabsDefaultHint')}</span>
          </div>
        </div>
        <div className="settings-tab-grid">
          {CONFIGURABLE_TABS.map((tab) => {
            const defaultTabs = settings.defaultVisibleTabs ?? ALL_TAB_IDS
            const isActive = defaultTabs.includes(tab.id)
            return (
              <button
                key={tab.id}
                className={`settings-radio-btn${isActive ? ' settings-radio-btn--active' : ''}`}
                onClick={() => {
                  const current = settings.defaultVisibleTabs ?? [...ALL_TAB_IDS]
                  const next = isActive
                    ? current.filter((id) => id !== tab.id)
                    : [...current, tab.id]
                  updateSetting('defaultVisibleTabs', next)
                }}
              >
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
