import { RuleTreeNode, TemplateRuleEntry } from '../../../../../../../shared/types'
import { useI18n } from '../../../../../../lib/i18n'
import { RuleTreeView } from './rule-tree-view'
import { TemplateSection } from './template-section'
import { SharedRule, Selection } from './use-rules-state'
import { DropTarget } from './use-rules-drag-drop'

interface Props {
  // Data
  tree: RuleTreeNode[]
  linkedRules: Array<{ relativePath: string; filename: string; isSymlink: boolean }>
  availableShared: SharedRule[]
  templates: TemplateRuleEntry[]
  selected: Selection | null

  // Create state
  creating: boolean
  creatingDir: boolean
  newName: string

  // Rename state
  renaming: string | null
  renameValue: string

  // DnD
  draggedItem: string | null
  dropTarget: DropTarget | null

  // Handlers
  onSelect: (relativePath: string, source: 'local' | 'available' | 'template') => void
  onCreateStart: () => void
  onCreateDirStart: () => void
  onCreateSubmit: () => void
  onCreateDirSubmit: () => void
  onCreateCancel: () => void
  onNameChange: (name: string) => void
  onContextMenu: (e: React.MouseEvent, relativePath: string, type: 'file' | 'directory') => void
  onLinkShared: (filename: string) => void
  onImportTemplates: (relativePaths: string[]) => void
  onExport: () => void
  onImport: () => void

  // Rename
  onRenameChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void

  // DnD handlers
  onDragStart: (e: React.DragEvent, relativePath: string) => void
  onDragOver: (e: React.DragEvent, targetPath: string, targetType: 'file' | 'directory') => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void

  rulesCount: number
  syncing?: boolean
}

export function RulesSidebar({
  tree,
  linkedRules,
  availableShared,
  templates,
  selected,
  creating,
  creatingDir,
  newName,
  renaming,
  renameValue,
  draggedItem,
  dropTarget,
  onSelect,
  onCreateStart,
  onCreateDirStart,
  onCreateSubmit,
  onCreateDirSubmit,
  onCreateCancel,
  onNameChange,
  onContextMenu,
  onLinkShared,
  onImportTemplates,
  onExport,
  onImport,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  rulesCount,
  syncing,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="cs-rules-sidebar">
      {/* Header */}
      <div className="cs-rules-sidebar-header">
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="modal-btn modal-btn--primary"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={onCreateStart}
          >
            + {t('claude.newRule')}
          </button>
          <button
            className="modal-btn modal-btn--secondary"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={onCreateDirStart}
          >
            + {t('claude.newFolder')}
          </button>
        </div>
      </div>

      {/* Syncing indicator */}
      {syncing && (
        <div className="cs-rules-syncing-indicator">{t('claude.checkingAiRules')}</div>
      )}

      {/* New file/folder input */}
      {(creating || creatingDir) && (
        <div className="cs-rule-input-row" style={{ padding: '4px 8px' }}>
          <input
            className="cs-rule-input"
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={creating ? t('claude.ruleName') : t('claude.folderName')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { if (creating) onCreateSubmit(); else onCreateDirSubmit(); }
              if (e.key === 'Escape') onCreateCancel()
            }}
            autoFocus
          />
          <button
            className="cs-rule-add-btn"
            onClick={creating ? onCreateSubmit : onCreateDirSubmit}
            disabled={!newName.trim()}
          >
            +
          </button>
          <button
            className="modal-btn modal-btn--secondary"
            style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={onCreateCancel}
          >
            &times;
          </button>
        </div>
      )}

      <div className="cs-rules-file-list">
        {/* Local rules tree */}
        {tree.length > 0 && (
          <>
            <div className="cs-rules-section-label">{t('claude.localRule')}</div>
            <RuleTreeView
              tree={tree}
              selectedPath={selected?.source === 'local' ? selected.relativePath : null}
              renaming={renaming}
              renameValue={renameValue}
              draggedItem={draggedItem}
              dropTarget={dropTarget}
              onSelect={(path) => onSelect(path, 'local')}
              onContextMenu={onContextMenu}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          </>
        )}

        {/* Linked shared rules */}
        {linkedRules.length > 0 && (
          <>
            <div className="cs-rules-section-label">{t('claude.sharedRules')}</div>
            {linkedRules.map((rule) => (
              <div
                key={rule.relativePath}
                className={`cs-rules-file-item cs-rules-file-item--shared${
                  selected?.source === 'local' && selected.relativePath === rule.relativePath
                    ? ' cs-rules-file-item--active'
                    : ''
                }`}
                onClick={() => onSelect(rule.relativePath, 'local')}
                onContextMenu={(e) => onContextMenu(e, rule.relativePath, 'file')}
              >
                <span className="cs-rules-file-name">{rule.filename}</span>
                <span className="cs-rules-badge cs-rules-badge--shared">{t('claude.sharedRule')}</span>
              </div>
            ))}
          </>
        )}

        {/* Available shared rules */}
        {availableShared.length > 0 && (
          <>
            <div className="cs-rules-section-label">{t('claude.availableRules')}</div>
            {availableShared.map((s) => (
              <div
                key={s.filename}
                className={`cs-rules-file-item cs-rules-available-item${
                  selected?.source === 'available' && selected.relativePath === s.filename
                    ? ' cs-rules-file-item--active'
                    : ''
                }`}
                onClick={() => onSelect(s.filename, 'available')}
              >
                <span className="cs-rules-file-name">{s.filename}</span>
                <button
                  className="cs-rules-add-btn"
                  onClick={(e) => { e.stopPropagation(); onLinkShared(s.filename) }}
                  title={t('claude.addToProject')}
                >
                  +
                </button>
              </div>
            ))}
          </>
        )}

        {/* Templates */}
        <TemplateSection
          templates={templates}
          onSelect={(path) => onSelect(path, 'template')}
          onImport={onImportTemplates}
          selectedPath={selected?.source === 'template' ? selected.relativePath : null}
        />
      </div>

      {/* Footer */}
      <div className="cs-rules-sidebar-footer">
        <button className="modal-btn modal-btn--secondary" style={{ fontSize: 10 }} onClick={onImport}>
          {t('claude.importRules')}
        </button>
        <button
          className="modal-btn modal-btn--secondary"
          style={{ fontSize: 10 }}
          onClick={onExport}
          disabled={rulesCount === 0}
        >
          {t('claude.exportRules')}
        </button>
      </div>
    </div>
  )
}
