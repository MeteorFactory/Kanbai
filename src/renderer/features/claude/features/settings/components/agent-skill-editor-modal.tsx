import { useI18n } from '../../../../../lib/i18n'
import { AgentSkillEditor } from './agent-skill-editor'
import type { EnrichedAgent } from './parse-agent-frontmatter'

interface Props {
  type: 'agent' | 'skill'
  initial: EnrichedAgent | null
  isDefault?: boolean
  defaultContent?: string
  onSave: (filename: string, content: string) => Promise<void>
  onCancel: () => void
  onRestore?: () => void
}

export function AgentSkillEditorModal({ type, initial, isDefault, onSave, onCancel, onRestore }: Props) {
  const { t } = useI18n()

  return (
    <div className="cs-modal-overlay" onClick={onCancel}>
      <div className="cs-modal cs-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="cs-modal-body" style={{ padding: 0 }}>
          <AgentSkillEditor
            type={type}
            initial={initial}
            onSave={onSave}
            onCancel={onCancel}
          />
          {isDefault && onRestore && (
            <div style={{ padding: '0 16px 12px', textAlign: 'right' }}>
              <button className="modal-btn modal-btn--secondary" onClick={onRestore}>
                {t('claude.restoreOriginal')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
