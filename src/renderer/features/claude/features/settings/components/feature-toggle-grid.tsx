interface Feature {
  key: string
  label: string
  description: string
  active: boolean
  onToggle: () => void
}

interface Props {
  features: Feature[]
  accentColor?: string
}

export function FeatureToggleGrid({ features, accentColor }: Props) {
  return (
    <div className="cs-feature-grid">
      {features.map((f) => {
        const activeStyle = f.active && accentColor
          ? { borderColor: `${accentColor}66`, background: `${accentColor}1F` }
          : undefined
        const nameStyle = f.active && accentColor
          ? { color: accentColor }
          : undefined
        return (
          <button
            key={f.key}
            className={`cs-feature-card${f.active ? ' cs-feature-card--active' : ''}`}
            style={activeStyle}
            onClick={f.onToggle}
          >
            <span className="cs-feature-card-name" style={nameStyle}>{f.label}</span>
            <span className="cs-feature-card-desc">{f.description}</span>
          </button>
        )
      })}
    </div>
  )
}
