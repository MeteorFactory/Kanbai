interface CardOption {
  value: string
  label: string
  description: string
}

interface Props {
  label: string
  options: CardOption[]
  value: string
  onChange: (value: string) => void
  accentColor?: string
}

export function CardSelector({ label, options, value, onChange, accentColor }: Props) {
  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{label}</label>
      <div className="claude-rules-mode-list">
        {options.map((opt) => {
          const isActive = value === opt.value
          const activeStyle = isActive && accentColor
            ? { borderColor: accentColor, background: `${accentColor}14` }
            : undefined
          return (
            <button
              key={opt.value}
              className={`claude-rules-mode-btn${isActive ? ' claude-rules-mode-btn--active' : ''}`}
              style={activeStyle}
              onClick={() => onChange(opt.value)}
            >
              <span className="claude-rules-mode-name">{opt.label}</span>
              <span className="claude-rules-mode-desc">{opt.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
