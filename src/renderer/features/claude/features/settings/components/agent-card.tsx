import { useI18n } from '../../../../../lib/i18n'
import type { EnrichedAgent } from './parse-agent-frontmatter'

interface Props {
  agent: EnrichedAgent
  type: 'agent' | 'skill'
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggle?: () => void
}

export function AgentCard({ agent, type, onEdit, onDuplicate, onDelete, onToggle }: Props) {
  const { t } = useI18n()

  const isDisabled = agent.disabled ?? false

  return (
    <div className={`cs-agent-card${isDisabled ? ' cs-agent-card--disabled' : ''}`}>
      <div className="cs-agent-card-header">
        <span className={`cs-agent-card-status${isDisabled ? ' cs-agent-card-status--disabled' : ' cs-agent-card-status--active'}`} />
        <span className="cs-agent-card-name">{agent.name}</span>
        {onToggle && (
          <button className={`cs-switch cs-agent-card-toggle${!isDisabled ? ' cs-switch--on' : ''}`} onClick={onToggle}>
            <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
          </button>
        )}
      </div>
      {agent.description && (
        <p className="cs-agent-card-desc">{agent.description}</p>
      )}
      {type === 'skill' && (
        <div className="cs-skill-invoke">/{agent.name}</div>
      )}
      {agent.tools.length > 0 && (
        <div className="cs-agent-card-tools">
          {agent.tools.slice(0, 4).map((tool) => (
            <span key={tool} className="cs-agent-card-tool-chip">{tool}</span>
          ))}
          {agent.tools.length > 4 && (
            <span className="cs-agent-card-tool-chip cs-agent-card-tool-chip--more">+{agent.tools.length - 4}</span>
          )}
        </div>
      )}
      <div className="cs-agent-card-meta">
        {agent.model && (
          <span className={`cs-agent-card-model-badge cs-agent-card-model-badge--${agent.model}`}>{agent.model}</span>
        )}
        {type === 'skill' && agent.context && (
          <span className="cs-agent-card-context-badge">{agent.context}</span>
        )}
      </div>
      <div className="cs-agent-card-actions">
        <button className="cs-agent-card-btn" onClick={onEdit}>{t('common.edit')}</button>
        <button className="cs-agent-card-btn" onClick={onDuplicate}>{t('common.duplicate')}</button>
        <button className="cs-agent-card-btn cs-agent-card-btn--danger" onClick={onDelete}>{t('common.delete')}</button>
      </div>
    </div>
  )
}
