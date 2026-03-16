import { useState, useCallback } from 'react'
import { useI18n } from '../../../../../lib/i18n'

interface Props {
  announcements: string[]
  onChange: (items: string[]) => void
}

export function CompanyAnnouncements({ announcements, onChange }: Props) {
  const { t } = useI18n()
  const [newItem, setNewItem] = useState('')

  const handleAdd = useCallback(() => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    onChange([...announcements, trimmed])
    setNewItem('')
  }, [newItem, announcements, onChange])

  const handleRemove = useCallback((index: number) => {
    onChange(announcements.filter((_, i) => i !== index))
  }, [announcements, onChange])

  const handleEdit = useCallback((index: number, value: string) => {
    const next = [...announcements]
    next[index] = value
    onChange(next)
  }, [announcements, onChange])

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return
    const next = [...announcements]
    ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
    onChange(next)
  }, [announcements, onChange])

  const handleMoveDown = useCallback((index: number) => {
    if (index >= announcements.length - 1) return
    const next = [...announcements]
    ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
    onChange(next)
  }, [announcements, onChange])

  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{t('claude.companyAnnouncements')}</label>
      <div className="cs-announcements-list">
        {announcements.map((item, i) => (
          <div key={i} className="cs-announcement-row">
            <div className="cs-announcement-arrows">
              <button className="cs-announcement-arrow" onClick={() => handleMoveUp(i)} disabled={i === 0}>&uarr;</button>
              <button className="cs-announcement-arrow" onClick={() => handleMoveDown(i)} disabled={i >= announcements.length - 1}>&darr;</button>
            </div>
            <input
              className="cs-announcement-input"
              value={item}
              onChange={(e) => handleEdit(i, e.target.value)}
            />
            <button className="cs-env-remove" onClick={() => handleRemove(i)}>&times;</button>
          </div>
        ))}
      </div>
      <div className="cs-rule-input-row">
        <input
          className="cs-rule-input"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={t('claude.announcementPlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <button className="cs-rule-add-btn" onClick={handleAdd} disabled={!newItem.trim()}>+</button>
      </div>
    </div>
  )
}
