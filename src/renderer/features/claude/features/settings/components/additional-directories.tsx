import { useState, useCallback } from 'react'
import { useI18n } from '../../../../../lib/i18n'

interface Props {
  directories: string[]
  onChange: (dirs: string[]) => void
}

export function AdditionalDirectories({ directories, onChange }: Props) {
  const { t } = useI18n()
  const [input, setInput] = useState('')

  const handleAdd = useCallback(() => {
    const trimmed = input.trim()
    if (trimmed && !directories.includes(trimmed)) {
      onChange([...directories, trimmed])
      setInput('')
    }
  }, [input, directories, onChange])

  const handleRemove = useCallback((dir: string) => {
    onChange(directories.filter((d) => d !== dir))
  }, [directories, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }, [handleAdd])

  return (
    <div className="claude-rules-section">
      <label className="claude-rules-label">{t('claude.additionalDirs')}</label>
      <div className="cs-dirs-list">
        {directories.map((dir) => (
          <div key={dir} className="cs-dirs-item">
            <span className="cs-dirs-path">{dir}</span>
            <button className="cs-dirs-remove" onClick={() => handleRemove(dir)}>&times;</button>
          </div>
        ))}
      </div>
      <div className="cs-rule-input-row">
        <input
          className="cs-rule-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('claude.dirPlaceholder')}
        />
        <button className="cs-rule-add-btn" onClick={handleAdd} disabled={!input.trim()}>+</button>
      </div>
    </div>
  )
}
