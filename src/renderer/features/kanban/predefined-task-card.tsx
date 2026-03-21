import { useI18n } from '../../lib/i18n'
import { TYPE_CONFIG, PRIORITY_COLORS } from './kanban-constants'
import type { PredefinedTaskTemplate } from './kanban-constants'

export function PredefinedTaskCard({
  template,
  onAdd,
  onDismiss,
  onDoubleClick,
}: {
  template: PredefinedTaskTemplate
  onAdd: () => void
  onDismiss: () => void
  onDoubleClick: () => void
}) {
  const { t, locale } = useI18n()

  const typeConf = TYPE_CONFIG[template.type] ?? TYPE_CONFIG.feature

  return (
    <div className="kanban-card kanban-card--predefined" onDoubleClick={onDoubleClick}>
      <div className="kanban-card-accent" style={{ backgroundColor: typeConf.color }} />
      <div className="kanban-card-inner">
        <div className="kanban-card-top-row">
          <span
            className="kanban-card-type-badge"
            style={{ color: typeConf.color, background: `${typeConf.color}1a` }}
          >
            {locale === 'en' ? typeConf.labelEn : typeConf.labelFr}
          </span>
          <span
            className="kanban-card-priority"
            style={{ backgroundColor: PRIORITY_COLORS[template.priority] }}
          />
        </div>
        <span className="kanban-card-title">{t(template.titleKey)}</span>
        <p className="kanban-card-desc">{t(template.descriptionKey)}</p>
        <div className="kanban-predefined-actions">
          <button
            className="kanban-predefined-add"
            onClick={onAdd}
          >
            {t('kanban.predefined.add')}
          </button>
          <button
            className="kanban-predefined-dismiss"
            onClick={onDismiss}
          >
            {t('kanban.predefined.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
