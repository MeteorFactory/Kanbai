import { useCallback, useMemo } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { PermissionModeSelector } from './features/security/permission-mode-selector'
import { PermissionRuleEditor } from './features/security/permission-rule-editor'
import { AdditionalDirectories } from './components/additional-directories'

interface Props {
  settings: Record<string, unknown>
  settingsErrors: string[]
  fixingSettings: boolean
  hooksInstalled: boolean
  installingHooks: boolean
  mcpServerKeys: string[]
  onFixSettings: () => void
  onInstallHooks: () => void
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export function PermissionsTab({
  settings,
  settingsErrors,
  fixingSettings,
  hooksInstalled,
  installingHooks,
  mcpServerKeys,
  onFixSettings,
  onInstallHooks,
  onSettingsChange,
}: Props) {
  const { t } = useI18n()

  const permsObj = useMemo(() => {
    const p = settings.permissions
    return (typeof p === 'object' && p !== null) ? p as { allow?: string[]; deny?: string[]; ask?: string[]; defaultMode?: string; additionalDirectories?: string[]; disableBypassPermissionsMode?: boolean } : {}
  }, [settings.permissions])

  const allowList = useMemo(() => permsObj.allow ?? [], [permsObj])
  const denyList = useMemo(() => permsObj.deny ?? [], [permsObj])
  const askList = useMemo(() => permsObj.ask ?? [], [permsObj])
  const additionalDirs = useMemo(() => permsObj.additionalDirectories ?? [], [permsObj])
  const permissionMode = permsObj.defaultMode ?? (settings as Record<string, unknown>)._kanbaiMode as string ?? 'default'
  const disableBypass = permsObj.disableBypassPermissionsMode ?? false

  // Generate MCP tool names from mcpServerKeys
  const mcpTools = useMemo(() => mcpServerKeys.flatMap((key) => [`mcp__${key}__*`]), [mcpServerKeys])

  const updatePerms = useCallback((patch: Partial<typeof permsObj>) => {
    const newPerms = { ...permsObj, ...patch }
    onSettingsChange({ ...settings, permissions: newPerms })
  }, [settings, permsObj, onSettingsChange])

  const handleModeChange = useCallback((mode: string) => {
    // Migrate to permissions.defaultMode
    const newSettings = { ...settings }
    delete (newSettings as Record<string, unknown>)._kanbaiMode
    const newPerms = { ...permsObj, defaultMode: mode }
    newSettings.permissions = newPerms
    onSettingsChange(newSettings)
  }, [settings, permsObj, onSettingsChange])

  const handleAddAllow = useCallback((tool: string) => {
    if (!allowList.includes(tool)) updatePerms({ allow: [...allowList, tool] })
  }, [allowList, updatePerms])

  const handleRemoveAllow = useCallback((tool: string) => {
    updatePerms({ allow: allowList.filter((t) => t !== tool) })
  }, [allowList, updatePerms])

  const handleAddDeny = useCallback((tool: string) => {
    if (!denyList.includes(tool)) updatePerms({ deny: [...denyList, tool] })
  }, [denyList, updatePerms])

  const handleRemoveDeny = useCallback((tool: string) => {
    updatePerms({ deny: denyList.filter((t) => t !== tool) })
  }, [denyList, updatePerms])

  const handleAddAsk = useCallback((tool: string) => {
    if (!askList.includes(tool)) updatePerms({ ask: [...askList, tool] })
  }, [askList, updatePerms])

  const handleRemoveAsk = useCallback((tool: string) => {
    updatePerms({ ask: askList.filter((t) => t !== tool) })
  }, [askList, updatePerms])

  const handleDirsChange = useCallback((dirs: string[]) => {
    updatePerms({ additionalDirectories: dirs.length > 0 ? dirs : undefined })
  }, [updatePerms])

  return (
    <div className="claude-rules-permissions">
      {settingsErrors.length > 0 && (
        <div className="claude-settings-error-banner">
          <div className="claude-settings-error-icon">&#x26A0;</div>
          <div className="claude-settings-error-body">
            <div className="claude-settings-error-title">{t('claude.settingsError')}</div>
            {settingsErrors.map((err, i) => (
              <div key={i} className="claude-settings-error-detail">{err}</div>
            ))}
          </div>
          <button
            className="claude-settings-fix-btn"
            onClick={onFixSettings}
            disabled={fixingSettings}
          >
            {fixingSettings ? t('common.loading') : t('claude.fixSettings')}
          </button>
        </div>
      )}

      <div className="claude-rules-section claude-hooks-section">
        <div className="claude-hooks-row">
          <div className="claude-hooks-info">
            <label className="claude-rules-label">{t('claude.activityHooks')}</label>
            <span className="claude-hooks-desc">{t('claude.activityHooksDesc')}</span>
          </div>
          <button
            className={`claude-hooks-btn${hooksInstalled ? ' claude-hooks-btn--success' : ''}`}
            onClick={onInstallHooks}
            disabled={installingHooks || hooksInstalled}
          >
            {hooksInstalled ? t('claude.hooksInstalled') : installingHooks ? t('common.loading') : t('claude.installHooks')}
          </button>
        </div>
      </div>

      <PermissionModeSelector
        value={permissionMode}
        onChange={handleModeChange}
        disableBypass={disableBypass}
      />

      <PermissionRuleEditor
        label={t('claude.allowedTools')}
        rules={allowList}
        onAdd={handleAddAllow}
        onRemove={handleRemoveAllow}
        variant="allow"
        mcpTools={mcpTools}
      />

      <PermissionRuleEditor
        label={t('claude.askTools')}
        rules={askList}
        onAdd={handleAddAsk}
        onRemove={handleRemoveAsk}
        variant="ask"
        mcpTools={mcpTools}
      />

      <PermissionRuleEditor
        label={t('claude.blockedTools')}
        rules={denyList}
        onAdd={handleAddDeny}
        onRemove={handleRemoveDeny}
        variant="deny"
        mcpTools={mcpTools}
      />

      <AdditionalDirectories
        directories={additionalDirs}
        onChange={handleDirsChange}
      />
    </div>
  )
}
