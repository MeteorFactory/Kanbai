import { useCallback } from 'react'

interface Props {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  defaultValue: number
  onChange: (value: number) => void
}

export function TokenSlider({ label, description, value, min, max, step, defaultValue, onChange }: Props) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value))
  }, [onChange])

  const handleReset = useCallback(() => {
    onChange(defaultValue)
  }, [defaultValue, onChange])

  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="cs-token-slider">
      <div className="cs-token-slider-header">
        <label className="claude-rules-label">{label}</label>
        <span className="cs-token-slider-value" onClick={handleReset} title="Reset">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="cs-toggle-desc">{description}</div>
      <div className="cs-token-slider-track-wrap">
        <input
          type="range"
          className="cs-token-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          style={{ '--slider-pct': `${pct}%` } as React.CSSProperties}
        />
      </div>
    </div>
  )
}
