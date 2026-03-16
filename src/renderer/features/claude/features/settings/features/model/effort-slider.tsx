import { useI18n } from '../../../../../../lib/i18n'

const EFFORT_LEVELS = ['low', 'medium', 'high'] as const
type EffortLevel = typeof EFFORT_LEVELS[number]

interface Props {
  value: EffortLevel
  onChange: (level: EffortLevel) => void
}

export function EffortSlider({ value, onChange }: Props) {
  const { t } = useI18n()

  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{t('claude.effortLevel')}</label>
      <div className="cs-effort-control">
        {EFFORT_LEVELS.map((level) => (
          <button
            key={level}
            className={`cs-effort-btn${value === level ? ' cs-effort-btn--active' : ''}`}
            onClick={() => onChange(level)}
          >
            {t(`claude.effort_${level}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
