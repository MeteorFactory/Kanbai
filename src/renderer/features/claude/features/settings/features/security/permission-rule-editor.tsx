import { useState, useCallback } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { ToolSpecifierHelp } from '../../components/tool-specifier-help'

const BASE_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit']
const PATTERN_SUGGESTIONS = ['Bash(npm run *)', 'Bash(git *)', 'Read(/src/**)', 'Edit(/src/**)', 'Write(/src/**)', 'WebFetch(domain:*)', 'Task(*)']

interface Props {
  label: string
  rules: string[]
  onAdd: (rule: string) => void
  onRemove: (rule: string) => void
  variant: 'allow' | 'deny' | 'ask'
  mcpTools?: string[]
}

export function PermissionRuleEditor({ label, rules, onAdd, onRemove, variant, mcpTools = [] }: Props) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const allTools = [...BASE_TOOLS, ...PATTERN_SUGGESTIONS, ...mcpTools]
  const availableTools = allTools.filter((tool) => !rules.includes(tool))

  const handleAdd = useCallback(() => {
    const trimmed = input.trim()
    if (trimmed && !rules.includes(trimmed)) {
      onAdd(trimmed)
      setInput('')
    }
  }, [input, rules, onAdd])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }, [handleAdd])

  const filteredSuggestions = availableTools.filter((tool) =>
    tool.toLowerCase().includes(input.toLowerCase())
  )

  const chipClass = variant === 'allow'
    ? 'claude-rules-chip--allow'
    : variant === 'deny'
      ? 'claude-rules-chip--deny'
      : 'claude-rules-chip--ask'

  const suggestBtnClass = variant === 'deny'
    ? 'claude-rules-suggest-btn--deny'
    : variant === 'ask'
      ? 'claude-rules-suggest-btn--ask'
      : ''

  return (
    <div className="claude-rules-section">
      <div className="cs-rule-label-row">
        <label className="claude-rules-label">{label}</label>
        <ToolSpecifierHelp />
      </div>
      <div className="claude-rules-tool-chips">
        {rules.map((rule) => (
          <span key={rule} className={`claude-rules-chip ${chipClass}`}>
            {rule}
            <button className="claude-rules-chip-remove" onClick={() => onRemove(rule)}>&times;</button>
          </span>
        ))}
      </div>
      <div className="cs-rule-input-row">
        <input
          className="cs-rule-input"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={t('claude.ruleInputPlaceholder')}
        />
        <button className="cs-rule-add-btn" onClick={handleAdd} disabled={!input.trim()}>+</button>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="claude-rules-tool-suggestions">
          {filteredSuggestions.slice(0, 12).map((tool) => (
            <button
              key={tool}
              className={`claude-rules-suggest-btn ${suggestBtnClass}`}
              onMouseDown={(e) => { e.preventDefault(); onAdd(tool); setInput('') }}
            >
              + {tool}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
