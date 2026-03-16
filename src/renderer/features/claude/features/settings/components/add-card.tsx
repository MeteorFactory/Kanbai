interface Props {
  label: string
  onClick: () => void
}

export function AddCard({ label, onClick }: Props) {
  return (
    <button className="cs-add-card" onClick={onClick}>
      <span className="cs-add-card-icon">+</span>
      <span className="cs-add-card-label">{label}</span>
    </button>
  )
}
