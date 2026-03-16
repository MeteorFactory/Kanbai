import { useCallback, useMemo } from 'react'
import { useI18n } from '../../../../../lib/i18n'

interface Props {
  settings: Record<string, unknown>
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export function PromptCachingSection({ settings, onSettingsChange }: Props) {
  const { t } = useI18n()
  const envVars = useMemo(() => (settings.env as Record<string, string>) ?? {}, [settings.env])
  const disabled = envVars['DISABLE_PROMPT_CACHING'] === '1'

  const handleToggle = useCallback(() => {
    const newEnv = { ...envVars }
    if (disabled) {
      delete newEnv['DISABLE_PROMPT_CACHING']
    } else {
      newEnv['DISABLE_PROMPT_CACHING'] = '1'
    }
    const next = { ...settings }
    if (Object.keys(newEnv).length > 0) next.env = newEnv
    else delete next.env
    onSettingsChange(next)
  }, [disabled, envVars, settings, onSettingsChange])

  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{t('claude.promptCaching')}</label>
      <div className="cs-toggle-row">
        <span>{t('claude.disablePromptCaching')}</span>
        <button className={`cs-switch${disabled ? ' cs-switch--on' : ''}`} onClick={handleToggle}>
          <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
        </button>
      </div>
    </div>
  )
}
