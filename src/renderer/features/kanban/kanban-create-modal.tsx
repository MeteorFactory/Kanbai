import React, { useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import { AI_PROVIDERS } from '../../../shared/types/ai-provider'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import type { KanbanTaskType, Project } from '../../../shared/types/index'
import {
  PRIORITIES,
  TASK_TYPES,
  TYPE_CONFIG,
  PendingClipboardImage,
  getClipboardImageMimeType,
  getClipboardImageExtension,
  blobToBase64,
} from './kanban-constants'

export function KanbanCreateModal({
  newTitle,
  setNewTitle,
  newDesc,
  setNewDesc,
  newPriority,
  setNewPriority,
  newType,
  setNewType,
  newTargetProjectId,
  setNewTargetProjectId,
  newAiProvider,
  setNewAiProvider,
  newIsCtoMode,
  setNewIsCtoMode,
  pendingAttachments,
  setPendingAttachments,
  pendingClipboardImages,
  setPendingClipboardImages,
  hasActiveCtoTicket,
  workspaceDefaultAiProvider,
  workspaceProjects,
  activeWorkspaceName,
  editingPredefinedId: _editingPredefinedId,
  setEditingPredefinedId,
  onClose,
  onCreate,
}: {
  newTitle: string
  setNewTitle: (v: string) => void
  newDesc: string
  setNewDesc: (v: string) => void
  newPriority: (typeof PRIORITIES)[number]
  setNewPriority: (v: (typeof PRIORITIES)[number]) => void
  newType: KanbanTaskType
  setNewType: (v: KanbanTaskType) => void
  newTargetProjectId: string
  setNewTargetProjectId: (v: string) => void
  newAiProvider: AiProviderId | ''
  setNewAiProvider: (v: AiProviderId | '') => void
  newIsCtoMode: boolean
  setNewIsCtoMode: (v: boolean) => void
  pendingAttachments: string[]
  setPendingAttachments: React.Dispatch<React.SetStateAction<string[]>>
  pendingClipboardImages: PendingClipboardImage[]
  setPendingClipboardImages: React.Dispatch<React.SetStateAction<PendingClipboardImage[]>>
  hasActiveCtoTicket: boolean
  workspaceDefaultAiProvider: AiProviderId
  workspaceProjects: Array<Pick<Project, 'id' | 'name'>>
  activeWorkspaceName: string | undefined
  editingPredefinedId: string | null
  setEditingPredefinedId: (v: string | null) => void
  onClose: () => void
  onCreate: () => void
}) {
  const { t, locale } = useI18n()
  const [isDragOver, setIsDragOver] = useState(false)
  const [createLightboxSrc, setCreateLightboxSrc] = useState<string | null>(null)

  const resolvedProvider = newAiProvider || workspaceDefaultAiProvider
  const providerInfo = AI_PROVIDERS[resolvedProvider]

  const handleSelectPendingFiles = useCallback(async () => {
    const files = await window.kanbai.kanban.selectFiles()
    if (files && files.length > 0) {
      setPendingAttachments((prev) => [...prev, ...files])
    }
  }, [setPendingAttachments])

  const handleCreateModalPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue
        const mimeType = getClipboardImageMimeType(item.type)
        const ext = getClipboardImageExtension(mimeType)
        const filename = `clipboard-${Date.now()}${ext}`
        const dataBase64 = await blobToBase64(blob)
        setPendingClipboardImages((prev) => [...prev, { dataBase64, filename, mimeType }])
      }
    }
  }, [setPendingClipboardImages])

  const handleCreateModalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    const paths: string[] = []
    for (const file of Array.from(files)) {
      try {
        const filePath = window.kanbai.getFilePathFromDrop(file)
        if (filePath) paths.push(filePath)
      } catch {
        // Fallback: try legacy file.path (non-sandbox environments)
        const legacyPath = (file as unknown as { path?: string }).path
        if (legacyPath) paths.push(legacyPath)
      }
    }
    if (paths.length > 0) {
      setPendingAttachments((prev) => [...prev, ...paths])
    }
  }, [setPendingAttachments])

  const handleCreateModalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleCreateModalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleClose = useCallback(() => {
    setNewIsCtoMode(false)
    setEditingPredefinedId(null)
    onClose()
  }, [onClose, setNewIsCtoMode, setEditingPredefinedId])

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className={`kanban-create-modal${newIsCtoMode ? ' kanban-create-modal--cto' : ''}${isDragOver ? ' kanban-create-modal--dragover' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onPaste={handleCreateModalPaste}
        onDrop={handleCreateModalDrop}
        onDragOver={handleCreateModalDragOver}
        onDragLeave={handleCreateModalDragLeave}
      >
        <button className="kanban-create-modal-close" onClick={handleClose}>&times;</button>
        <div className="kanban-create-modal-body">
          {/* Type Selector — visual buttons */}
          <div className="kanban-create-type-bar">
            {TASK_TYPES.map((tp) => {
              const conf = TYPE_CONFIG[tp]
              const isActive = newType === tp
              return (
                <button
                  key={tp}
                  className={`kanban-create-type-btn${isActive ? ' kanban-create-type-btn--active' : ''}`}
                  style={isActive ? { color: conf.color } : undefined}
                  onClick={() => setNewType(tp)}
                >
                  {locale === 'en' ? conf.labelEn : conf.labelFr}
                </button>
              )
            })}
          </div>

          {/* Title */}
          <input
            className="kanban-create-modal-title-input"
            placeholder={t('kanban.taskTitlePlaceholder')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            autoFocus
          />

          {/* Description */}
          <textarea
            className="kanban-create-modal-desc"
            placeholder={t('kanban.descriptionPlaceholder')}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={4}
          />

          {/* Meta row: Priority, Scope, AI Provider */}
          <div className="kanban-create-modal-meta">
            {/* Priority pills */}
            <div className="kanban-create-meta-group">
              <span className="kanban-create-meta-label">{t('kanban.priority')}</span>
              <div className="kanban-create-pill-row">
                {PRIORITIES.map((p) => {
                  const isActive = newPriority === p
                  return (
                    <button
                      key={p}
                      className={`kanban-create-pill${isActive ? ' kanban-create-pill--active' : ''}`}
                      onClick={() => setNewPriority(p)}
                    >
                      {t(`kanban.${p}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Scope */}
            <div className="kanban-create-meta-group">
              <span className="kanban-create-meta-label">{t('kanban.scope')}</span>
              <select
                className="kanban-select"
                value={newTargetProjectId}
                onChange={(e) => setNewTargetProjectId(e.target.value)}
              >
                <option value="">Workspace{activeWorkspaceName ? ` (${activeWorkspaceName})` : ''}</option>
                {workspaceProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* AI Provider pills */}
            <div className="kanban-create-meta-group">
              <span className="kanban-create-meta-label">AI</span>
              <div className="kanban-create-pill-row">
                {Object.values(AI_PROVIDERS).map((p) => {
                  const isActive = resolvedProvider === p.id
                  const isDefault = p.id === workspaceDefaultAiProvider && !newAiProvider
                  return (
                    <button
                      key={p.id}
                      className={`kanban-create-pill kanban-create-pill--ai${isActive ? ' kanban-create-pill--active' : ''}`}
                      style={isActive ? { color: '#fff', background: p.detectionColor } : undefined}
                      onClick={() => setNewAiProvider(isDefault ? '' : p.id)}
                    >
                      {p.displayName}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* CTO Mode */}
          <div className="kanban-create-modal-extras">
            <button
              className="kanban-create-modal-attach"
              onClick={handleSelectPendingFiles}
              title={t('kanban.attachFiles')}
            >
              <span style={{ fontSize: 14 }}>&#128206;</span> {t('kanban.attachFiles')}{pendingAttachments.length + pendingClipboardImages.length > 0 ? ` (${pendingAttachments.length + pendingClipboardImages.length})` : ''}
            </button>
            <button
              className={`kanban-create-cto-btn${newIsCtoMode ? ' kanban-create-cto-btn--active' : ''}`}
              onClick={() => {
                if (hasActiveCtoTicket && !newIsCtoMode) return
                const next = !newIsCtoMode
                setNewIsCtoMode(next)
                if (next) setNewPriority('low')
              }}
              disabled={hasActiveCtoTicket && !newIsCtoMode}
              title={hasActiveCtoTicket && !newIsCtoMode ? t('kanban.ctoModeAlreadyActive') : t('kanban.ctoModeToggle')}
            >
              CTO
            </button>
          </div>

          {/* CTO Warning */}
          {newIsCtoMode && (
            <div className="kanban-cto-warning">
              <div className="kanban-cto-warning-content">
                <strong>{t('kanban.ctoModeWarningTitle')}</strong>
                <p>{t('kanban.ctoModeWarning')}</p>
              </div>
            </div>
          )}

          {/* Attachments */}
          {(pendingAttachments.length > 0 || pendingClipboardImages.length > 0) && (
            <div className="kanban-create-attachments">
              {pendingAttachments.map((fp, i) => (
                <span key={`file-${i}`} className="kanban-attachment-chip">
                  {fp.split(/[\\/]/).pop()}
                  <button
                    className="kanban-attachment-chip-remove"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    &times;
                  </button>
                </span>
              ))}
              {pendingClipboardImages.map((img, i) => {
                const dataUrl = `data:${img.mimeType};base64,${img.dataBase64}`
                return (
                  <div key={`clip-${i}`} className="kanban-attachment-chip kanban-attachment-chip--image">
                    <img
                      src={dataUrl}
                      alt={img.filename}
                      className="kanban-attachment-chip-preview"
                      onClick={() => setCreateLightboxSrc(dataUrl)}
                    />
                    <span
                      className="kanban-attachment-chip-name"
                      onClick={() => setCreateLightboxSrc(dataUrl)}
                    >
                      {img.filename}
                    </span>
                    <button
                      className="kanban-attachment-chip-remove"
                      onClick={() => setPendingClipboardImages((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      &times;
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Drag overlay */}
          {isDragOver && (
            <div className="kanban-create-drop-zone">
              {t('kanban.dropFiles')}
            </div>
          )}
        </div>
        <div className="kanban-create-modal-footer">
          <button className="kanban-create-modal-cancel" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button
            className={`kanban-create-modal-submit${newIsCtoMode ? ' kanban-create-modal-submit--cto' : ''}`}
            style={!newIsCtoMode ? { background: providerInfo.detectionColor } : undefined}
            onClick={onCreate}
          >
            {t('common.create')}
          </button>
        </div>
      </div>

      {/* Lightbox for creation modal */}
      {createLightboxSrc && (
        <div className="kanban-lightbox-overlay" onClick={(e) => { e.stopPropagation(); setCreateLightboxSrc(null) }}>
          <div className="kanban-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={createLightboxSrc} alt="preview" onClick={() => setCreateLightboxSrc(null)} />
          </div>
          <button className="kanban-lightbox-close" onClick={(e) => { e.stopPropagation(); setCreateLightboxSrc(null) }}>&times;</button>
        </div>
      )}
    </div>
  )
}
