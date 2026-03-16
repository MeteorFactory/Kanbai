import { useState } from 'react'
import { useI18n } from '../../../../../lib/i18n'

const SPECIFIER_EXAMPLES = [
  { pattern: 'Bash(npm run *)', desc: 'Allow npm run commands' },
  { pattern: 'Bash(git *)', desc: 'Allow git commands' },
  { pattern: 'Read(/src/**)', desc: 'Read files in /src/' },
  { pattern: 'Edit(/src/**)', desc: 'Edit files in /src/' },
  { pattern: 'Write(/src/**)', desc: 'Write files in /src/' },
  { pattern: 'WebFetch(domain:api.example.com)', desc: 'Fetch from specific domain' },
  { pattern: 'Task(*)', desc: 'All sub-agent tasks' },
  { pattern: 'mcp__server__*', desc: 'All tools from an MCP server' },
  { pattern: 'mcp__server__tool', desc: 'Specific MCP tool' },
]

export function ToolSpecifierHelp() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="cs-specifier-help">
      <button
        className="cs-specifier-help-btn"
        onClick={() => setOpen(!open)}
        title={t('claude.specifierHelp')}
      >
        ?
      </button>
      {open && (
        <div className="cs-specifier-help-popover">
          <div className="cs-specifier-help-title">{t('claude.specifierHelp')}</div>
          <p className="cs-specifier-help-desc">{t('claude.specifierHelpDesc')}</p>
          <div className="cs-specifier-help-list">
            {SPECIFIER_EXAMPLES.map((ex) => (
              <div key={ex.pattern} className="cs-specifier-help-item">
                <code className="cs-specifier-help-pattern">{ex.pattern}</code>
                <span className="cs-specifier-help-meaning">{ex.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
