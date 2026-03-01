import { useState, useCallback, useMemo, useRef } from 'react'
import { useI18n } from '../../lib/i18n'
import { MemoryEditor } from './MemoryEditor'
import { ConfirmModal } from '../ConfirmModal'
import { useRulesState } from './rules/useRulesState'
import { useRulesDragDrop } from './rules/useRulesDragDrop'
import { buildRuleTree } from './rules/treeUtils'
import { RulesSidebar } from './rules/RulesSidebar'
import { RuleContextMenu } from './rules/RuleContextMenu'
import { RuleAuthorBadge } from './rules/RuleAuthorBadge'

interface Props {
  projectPath: string
}

export function RulesManager({ projectPath }: Props) {
  const { t } = useI18n()
  const state = useRulesState(projectPath)
  const dnd = useRulesDragDrop(state.handleMoveRule)

  const [contextMenu, setContextMenu] = useState<{
    relativePath: string
    type: 'file' | 'directory'
    x: number
    y: number
  } | null>(null)

  // Stable callback to sync ai-rules from SpaceMalamute upstream
  const loadRef = useRef(state.load)
  loadRef.current = state.load
  const handleSyncAiRules = useCallback(async () => {
    await window.mirehub.claudeMemory.syncAiRules(projectPath)
    await loadRef.current()
  }, [projectPath])

  const tree = useMemo(
    () => buildRuleTree(state.localRules, state.directories),
    [state.localRules, state.directories],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, relativePath: string, type: 'file' | 'directory') => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ relativePath, type, x: e.clientX, y: e.clientY })
  }, [])

  const handleSelect = useCallback((relativePath: string, source: 'local' | 'available' | 'template') => {
    state.setSelected({ relativePath, source })
  }, [state])

  const handleCreateCancel = useCallback(() => {
    state.setCreating(false)
    state.setCreatingDir(false)
    state.setNewName('')
  }, [state])

  // Context menu actions
  const contextRule = contextMenu
    ? state.rules.find((r) => r.relativePath === contextMenu.relativePath)
    : null

  const contextIsSymlink = contextRule?.isSymlink ?? false
  const contextHasConflict = contextMenu
    ? state.conflictingLocals.has(contextMenu.relativePath)
    : false

  return (
    <div className="cs-rules-panel">
      {/* Left sidebar */}
      <RulesSidebar
        tree={tree}
        linkedRules={state.linkedRules}
        availableShared={state.availableShared}
        templates={state.templates}
        selected={state.selected}
        creating={state.creating}
        creatingDir={state.creatingDir}
        newName={state.newName}
        renaming={state.renaming}
        renameValue={state.renameValue}
        draggedItem={dnd.draggedItem}
        dropTarget={dnd.dropTarget}
        onSelect={handleSelect}
        onCreateStart={() => { state.setCreating(true); state.setCreatingDir(false) }}
        onCreateDirStart={() => { state.setCreatingDir(true); state.setCreating(false) }}
        onCreateSubmit={state.handleCreate}
        onCreateDirSubmit={state.handleCreateDir}
        onCreateCancel={handleCreateCancel}
        onNameChange={state.setNewName}
        onContextMenu={handleContextMenu}
        onLinkShared={state.handleLinkShared}
        onImportTemplates={state.handleImportTemplates}
        onExport={state.handleExport}
        onImport={state.handleImport}
        onRenameChange={state.setRenameValue}
        onRenameSubmit={() => {
          if (state.renaming) {
            // Determine if renaming a file or directory
            const isDir = state.directories.includes(state.renaming)
            if (isDir) state.handleRenameDir(state.renaming)
            else state.handleRename(state.renaming)
          }
        }}
        onRenameCancel={() => state.setRenaming(null)}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragEnter={dnd.handleDragEnter}
        onDragLeave={dnd.handleDragLeave}
        onDrop={dnd.handleDrop}
        onDragEnd={dnd.handleDragEnd}
        rulesCount={state.rules.length}
        syncing={state.syncing}
      />

      {/* Right editor */}
      <div className="cs-rules-editor">
        {state.selectedRule ? (
          <>
            {/* Author badge */}
            {state.selectedRule.author && (
              <RuleAuthorBadge
                author={state.selectedRule.author}
                authorUrl={state.selectedRule.authorUrl}
                coAuthors={state.selectedRule.coAuthors}
                onSync={state.selectedRule.author === 'SpaceMalamute' ? handleSyncAiRules : undefined}
              />
            )}

            {/* Shared warning */}
            {state.selectedRule.isSymlink && (
              <div className="cs-rules-shared-warning">
                {t('claude.sharedRuleWarning')}
              </div>
            )}

            {/* Conflict banner */}
            {!state.selectedRule.isSymlink && state.conflictingLocals.has(state.selectedRule.relativePath) && (
              <div className="cs-rules-conflict-banner">
                <span>{t('claude.conflictBanner')}</span>
                <button
                  className="modal-btn modal-btn--secondary"
                  style={{ fontSize: 10, padding: '2px 8px', marginLeft: 8 }}
                  onClick={() => handleSelect(state.selectedRule!.filename, 'available')}
                >
                  {t('claude.viewShared')}
                </button>
                <button
                  className="modal-btn modal-btn--secondary"
                  style={{ fontSize: 10, padding: '2px 8px', marginLeft: 4 }}
                  onClick={() => state.setConfirmReplace(state.selectedRule!.filename)}
                >
                  {t('claude.confirmReplaceTitle')}
                </button>
              </div>
            )}

            <MemoryEditor
              title={state.selectedRule.relativePath}
              content={state.selectedRule.content}
              onSave={state.handleSave}
            />
          </>
        ) : state.selectedAvailable ? (
          <>
            <div className="cs-rules-shared-warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{t('claude.availableRules')}</span>
              <button
                className="modal-btn modal-btn--primary"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => state.handleLinkShared(state.selectedAvailable!.filename)}
              >
                {t('claude.addToProject')}
              </button>
            </div>
            <MemoryEditor
              title={state.selectedAvailable.filename}
              content={state.selectedAvailable.content}
              readOnly
            />
          </>
        ) : state.selectedTemplate ? (
          <>
            <RuleAuthorBadge
              author={state.selectedTemplate.author}
              authorUrl={state.selectedTemplate.authorUrl}
              onSync={state.selectedTemplate.author === 'SpaceMalamute' ? handleSyncAiRules : undefined}
            />
            <div className="cs-rules-shared-warning">
              {t('claude.templateReadOnly')}
            </div>
            <MemoryEditor
              title={state.selectedTemplate.relativePath}
              content={state.selectedTemplate.content}
              readOnly
            />
          </>
        ) : (
          <div className="cs-rules-empty-editor">
            <div className="cs-toggle-desc">{t('claude.noRules')}</div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <RuleContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          relativePath={contextMenu.relativePath}
          type={contextMenu.type}
          isSymlink={contextIsSymlink}
          hasConflict={contextHasConflict}
          onRename={() => {
            const name = contextMenu.relativePath.split(/[\\/]/).pop() || ''
            state.setRenaming(contextMenu.relativePath)
            state.setRenameValue(name)
            setContextMenu(null)
          }}
          onConvertToShared={() => {
            state.handleConvertToShared(contextMenu.relativePath)
            setContextMenu(null)
          }}
          onReplaceWithShared={() => {
            if (contextRule) {
              state.setConfirmReplace(contextRule.filename)
            }
            setContextMenu(null)
          }}
          onUnlink={() => {
            state.handleDelete(contextMenu.relativePath)
            setContextMenu(null)
          }}
          onDelete={() => {
            state.handleDelete(contextMenu.relativePath)
            setContextMenu(null)
          }}
          onDeleteDir={() => {
            state.handleDeleteDir(contextMenu.relativePath)
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Confirmation modal - replace with shared */}
      {state.confirmReplace && (
        <ConfirmModal
          title={t('claude.confirmReplaceTitle')}
          message={t('claude.confirmReplaceMessage')}
          danger
          onConfirm={() => state.handleReplaceWithShared(state.confirmReplace!)}
          onCancel={() => state.setConfirmReplace(null)}
        />
      )}

      {/* Confirmation modal - overwrite shared when converting */}
      {state.confirmOverwriteShared && (
        <ConfirmModal
          title={t('claude.confirmOverwriteSharedTitle')}
          message={t('claude.confirmOverwriteSharedMessage')}
          danger
          onConfirm={state.confirmConvertToShared}
          onCancel={() => state.setConfirmOverwriteShared(null)}
        />
      )}
    </div>
  )
}
