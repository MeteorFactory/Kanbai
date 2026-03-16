import { useI18n } from '../../../../../../lib/i18n'

const MODEL_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'opusplan', label: 'Opus Plan' },
  { value: 'sonnet[1m]', label: 'Sonnet Extended 1M' },
]

interface Props {
  model: string
  onModelChange: (model: string) => void
}

export function ModelSelector({ model, onModelChange }: Props) {
  const { t } = useI18n()

  return (
    <div className="cs-model-section">
      <div className="claude-rules-section">
        <label className="claude-rules-label">{t('claude.modelSelection')}</label>
        <select
          className="cs-select"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
