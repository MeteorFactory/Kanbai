import { useState, useCallback } from 'react'
import { useI18n } from '../../../../../lib/i18n'

interface Props {
  envVars: Record<string, string>
  onChange: (vars: Record<string, string>) => void
}

export function EnvVarsEditor({ envVars, onChange }: Props) {
  const { t } = useI18n()
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())

  const entries = Object.entries(envVars)

  const handleAdd = useCallback(() => {
    const key = newKey.trim()
    if (!key) return
    onChange({ ...envVars, [key]: newValue })
    setNewKey('')
    setNewValue('')
  }, [newKey, newValue, envVars, onChange])

  const handleRemove = useCallback((key: string) => {
    const next = { ...envVars }
    delete next[key]
    onChange(next)
  }, [envVars, onChange])

  const handleValueChange = useCallback((key: string, val: string) => {
    onChange({ ...envVars, [key]: val })
  }, [envVars, onChange])

  const toggleHidden = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{t('claude.envVars')}</label>
      <div className="cs-env-list">
        {entries.map(([key, val]) => (
          <div key={key} className="cs-env-row">
            <span className="cs-env-key">{key}</span>
            <input
              className="cs-env-value"
              type={hiddenKeys.has(key) ? 'password' : 'text'}
              value={val}
              onChange={(e) => handleValueChange(key, e.target.value)}
            />
            <button className="cs-env-toggle" onClick={() => toggleHidden(key)} title={t('claude.toggleVisibility')}>
              {hiddenKeys.has(key) ? '👁' : '🔒'}
            </button>
            <button className="cs-env-remove" onClick={() => handleRemove(key)}>&times;</button>
          </div>
        ))}
      </div>
      <div className="cs-env-add-row">
        <input
          className="cs-env-input"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={t('claude.envKeyPlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <input
          className="cs-env-input"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={t('claude.envValuePlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <button className="cs-rule-add-btn" onClick={handleAdd} disabled={!newKey.trim()}>+</button>
      </div>
    </div>
  )
}
