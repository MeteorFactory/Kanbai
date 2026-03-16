import { useCallback, useMemo } from 'react'
import { ToolToggleGrid } from '../../components/tool-toggle-grid'
import { AdditionalDirectories } from '../../components/additional-directories'
import { SandboxConfig } from './sandbox-config'

interface Props {
  settings: Record<string, unknown>
  mcpServerKeys: string[]
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export function SecuritySandboxTab({ settings, mcpServerKeys, onSettingsChange }: Props) {
  const permsObj = useMemo(() => {
    const p = settings.permissions
    return (typeof p === 'object' && p !== null) ? p as { allow?: string[]; deny?: string[]; additionalDirectories?: string[] } : {}
  }, [settings.permissions])

  const allowList = useMemo(() => permsObj.allow ?? [], [permsObj])
  const denyList = useMemo(() => permsObj.deny ?? [], [permsObj])
  const additionalDirs = useMemo(() => permsObj.additionalDirectories ?? [], [permsObj])

  const updatePerms = useCallback((patch: Partial<typeof permsObj>) => {
    const newPerms = { ...permsObj, ...patch }
    onSettingsChange({ ...settings, permissions: newPerms })
  }, [settings, permsObj, onSettingsChange])

  const handleAllowChange = useCallback((tools: string[]) => {
    updatePerms({ allow: tools.length > 0 ? tools : undefined })
  }, [updatePerms])

  const handleDenyChange = useCallback((tools: string[]) => {
    updatePerms({ deny: tools.length > 0 ? tools : undefined })
  }, [updatePerms])

  const handleDirsChange = useCallback((dirs: string[]) => {
    updatePerms({ additionalDirectories: dirs.length > 0 ? dirs : undefined })
  }, [updatePerms])

  return (
    <div className="claude-rules-permissions">
      <ToolToggleGrid
        allowList={allowList}
        denyList={denyList}
        mcpServerKeys={mcpServerKeys}
        onAllowChange={handleAllowChange}
        onDenyChange={handleDenyChange}
      />
      <SandboxConfig settings={settings} onSettingsChange={onSettingsChange} />
      <AdditionalDirectories directories={additionalDirs} onChange={handleDirsChange} />
    </div>
  )
}
