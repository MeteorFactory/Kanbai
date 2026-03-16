import { useState, useCallback, useMemo } from 'react'
import { useI18n } from '../../../../../../lib/i18n'

interface Props {
  settings: Record<string, unknown>
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export function SandboxConfig({ settings, onSettingsChange }: Props) {
  const { t } = useI18n()

  const sandboxObj = useMemo(() => {
    const s = settings.sandbox
    return (typeof s === 'object' && s !== null) ? s as {
      enabled?: boolean
      autoAllowBashIfSandboxed?: boolean
      excludedCommands?: string[]
      network?: { allowedDomains?: string[] }
    } : {}
  }, [settings.sandbox])

  const enabled = sandboxObj.enabled ?? false
  const autoAllow = sandboxObj.autoAllowBashIfSandboxed ?? false
  const excluded = sandboxObj.excludedCommands ?? []
  const allowedDomains = sandboxObj.network?.allowedDomains ?? []

  const [newExcluded, setNewExcluded] = useState('')
  const [newDomain, setNewDomain] = useState('')

  const updateSandbox = useCallback((patch: Record<string, unknown>) => {
    const newSandbox = { ...sandboxObj, ...patch }
    onSettingsChange({ ...settings, sandbox: newSandbox })
  }, [settings, sandboxObj, onSettingsChange])

  const handleToggleEnabled = useCallback(() => {
    updateSandbox({ enabled: !enabled })
  }, [enabled, updateSandbox])

  const handleToggleAutoAllow = useCallback(() => {
    updateSandbox({ autoAllowBashIfSandboxed: !autoAllow })
  }, [autoAllow, updateSandbox])

  const handleAddExcluded = useCallback(() => {
    const trimmed = newExcluded.trim()
    if (trimmed && !excluded.includes(trimmed)) {
      updateSandbox({ excludedCommands: [...excluded, trimmed] })
      setNewExcluded('')
    }
  }, [newExcluded, excluded, updateSandbox])

  const handleRemoveExcluded = useCallback((cmd: string) => {
    updateSandbox({ excludedCommands: excluded.filter((c) => c !== cmd) })
  }, [excluded, updateSandbox])

  const handleAddDomain = useCallback(() => {
    const trimmed = newDomain.trim()
    if (trimmed && !allowedDomains.includes(trimmed)) {
      updateSandbox({ network: { ...sandboxObj.network, allowedDomains: [...allowedDomains, trimmed] } })
      setNewDomain('')
    }
  }, [newDomain, allowedDomains, sandboxObj.network, updateSandbox])

  const handleRemoveDomain = useCallback((domain: string) => {
    updateSandbox({ network: { ...sandboxObj.network, allowedDomains: allowedDomains.filter((d) => d !== domain) } })
  }, [allowedDomains, sandboxObj.network, updateSandbox])

  return (
    <div className="claude-rules-section cs-sandbox">
      <label className="claude-rules-label">{t('claude.sandboxConfig')}</label>

      <div className="cs-toggle-row">
        <span>{t('claude.sandboxEnabled')}</span>
        <button className={`cs-switch${enabled ? ' cs-switch--on' : ''}`} onClick={handleToggleEnabled}>
          <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
        </button>
      </div>

      <div className="cs-toggle-row">
        <span>{t('claude.sandboxAutoAllow')}</span>
        <button className={`cs-switch${autoAllow ? ' cs-switch--on' : ''}`} onClick={handleToggleAutoAllow}>
          <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
        </button>
      </div>

      <div className="cs-sandbox-list-section">
        <label className="claude-rules-label">{t('claude.sandboxExcluded')}</label>
        <div className="cs-dirs-list">
          {excluded.map((cmd) => (
            <div key={cmd} className="cs-dirs-item">
              <span className="cs-dirs-path">{cmd}</span>
              <button className="cs-dirs-remove" onClick={() => handleRemoveExcluded(cmd)}>&times;</button>
            </div>
          ))}
        </div>
        <div className="cs-rule-input-row">
          <input
            className="cs-rule-input"
            value={newExcluded}
            onChange={(e) => setNewExcluded(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddExcluded() }}
            placeholder={t('claude.sandboxExcludedPlaceholder')}
          />
          <button className="cs-rule-add-btn" onClick={handleAddExcluded} disabled={!newExcluded.trim()}>+</button>
        </div>
      </div>

      <div className="cs-sandbox-list-section">
        <label className="claude-rules-label">{t('claude.sandboxAllowedDomains')}</label>
        <div className="cs-dirs-list">
          {allowedDomains.map((d) => (
            <div key={d} className="cs-dirs-item">
              <span className="cs-dirs-path">{d}</span>
              <button className="cs-dirs-remove" onClick={() => handleRemoveDomain(d)}>&times;</button>
            </div>
          ))}
        </div>
        <div className="cs-rule-input-row">
          <input
            className="cs-rule-input"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddDomain() }}
            placeholder={t('claude.sandboxDomainPlaceholder')}
          />
          <button className="cs-rule-add-btn" onClick={handleAddDomain} disabled={!newDomain.trim()}>+</button>
        </div>
      </div>
    </div>
  )
}
