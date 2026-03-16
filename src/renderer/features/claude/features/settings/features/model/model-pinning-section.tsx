import { useCallback, useMemo } from 'react'
import { useI18n } from '../../../../../../lib/i18n'

const MODEL_PIN_VARS = [
  { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', labelKey: 'claude.defaultOpus' },
  { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', labelKey: 'claude.defaultSonnet' },
  { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', labelKey: 'claude.defaultHaiku' },
  { key: 'CLAUDE_CODE_SUBAGENT_MODEL', labelKey: 'claude.subagentModel' },
]

interface Props {
  settings: Record<string, unknown>
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export function ModelPinningSection({ settings, onSettingsChange }: Props) {
  const { t } = useI18n()
  const envVars = useMemo(() => (settings.env as Record<string, string>) ?? {}, [settings.env])

  const handleChange = useCallback((varKey: string, value: string) => {
    const newEnv = { ...envVars }
    if (value.trim()) {
      newEnv[varKey] = value.trim()
    } else {
      delete newEnv[varKey]
    }
    const next = { ...settings }
    if (Object.keys(newEnv).length > 0) next.env = newEnv
    else delete next.env
    onSettingsChange(next)
  }, [envVars, settings, onSettingsChange])

  return (
    <div className="claude-rules-section cs-pinning">
      <label className="claude-rules-label">{t('claude.modelPinning')}</label>
      <p className="cs-pinning-desc">{t('claude.modelPinningDesc')}</p>
      <div className="cs-pinning-grid">
        {MODEL_PIN_VARS.map((v) => (
          <div key={v.key} className="cs-pinning-row">
            <label className="cs-pinning-label">{t(v.labelKey)}</label>
            <input
              className="cs-pinning-input"
              value={envVars[v.key] ?? ''}
              onChange={(e) => handleChange(v.key, e.target.value)}
              placeholder={v.key}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
