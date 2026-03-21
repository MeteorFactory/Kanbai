import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import type { KanbanTask } from '../../../shared/types/index'
import { blobToBase64, getClipboardImageMimeType, getClipboardImageExtension } from './kanban-constants'
import { renderPdfFirstPage } from './pdf-preview'

export function TaskDetailAttachments({
  task,
  onAttachFiles,
  onAttachFromClipboard,
  onRemoveAttachment,
}: {
  task: KanbanTask
  onAttachFiles: () => void
  onAttachFromClipboard: (dataBase64: string, filename: string, mimeType: string) => void
  onRemoveAttachment: (attachmentId: string) => void
}) {
  const { t } = useI18n()
  const [lightboxImage, setLightboxImage] = useState<{ src: string; filename: string; type?: 'image' | 'pdf' } | null>(null)
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})
  const [pdfDataUrls, setPdfDataUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const imageAttachments = (task.attachments ?? []).filter((att) =>
      att.mimeType.startsWith('image/')
    )
    const pdfAttachments = (task.attachments ?? []).filter((att) =>
      att.mimeType === 'application/pdf'
    )
    if (imageAttachments.length === 0 && pdfAttachments.length === 0) {
      setAttachmentPreviews({})
      setPdfDataUrls({})
      return
    }
    let cancelled = false
    const loadPreviews = async (): Promise<void> => {
      const previews: Record<string, string> = {}
      const pdfs: Record<string, string> = {}
      for (const att of imageAttachments) {
        if (cancelled) return
        const base64 = await window.kanbai.kanban.readAttachment(att.storedPath)
        if (base64 && !cancelled) {
          previews[att.id] = `data:${att.mimeType};base64,${base64}`
        }
      }
      for (const att of pdfAttachments) {
        if (cancelled) return
        const base64 = await window.kanbai.kanban.readAttachment(att.storedPath)
        if (base64 && !cancelled) {
          const pdfDataUrl = `data:application/pdf;base64,${base64}`
          pdfs[att.id] = pdfDataUrl
          const thumbnail = await renderPdfFirstPage(pdfDataUrl, 256)
          if (thumbnail && !cancelled) {
            previews[att.id] = thumbnail
          }
        }
      }
      if (!cancelled) {
        setAttachmentPreviews(previews)
        setPdfDataUrls(pdfs)
      }
    }
    loadPreviews()
    return () => { cancelled = true }
  }, [task.id, task.attachments])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
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
        onAttachFromClipboard(dataBase64, filename, mimeType)
      }
    }
  }, [onAttachFromClipboard])

  return (
    <>
      <div className="kanban-detail-section" onPaste={handlePaste}>
        <span className="kanban-detail-section-title">{t('kanban.attachedFiles')}</span>
        <div className="kanban-detail-attachments">
          {task.attachments && task.attachments.length > 0 ? (
            <>
              {/* Image & PDF thumbnails grid */}
              {task.attachments.some((att) => attachmentPreviews[att.id]) && (
                <div className="kanban-attachment-thumbnails">
                  {task.attachments.filter((att) => attachmentPreviews[att.id]).map((att) => {
                    const isPdf = att.mimeType === 'application/pdf'
                    const lightboxSrc = isPdf ? (pdfDataUrls[att.id] ?? attachmentPreviews[att.id]!) : attachmentPreviews[att.id]!
                    return (
                      <div
                        key={att.id}
                        className={`kanban-attachment-thumbnail${isPdf ? ' kanban-attachment-thumbnail--pdf' : ''}`}
                        onClick={() => setLightboxImage({ src: lightboxSrc, filename: att.filename, type: isPdf ? 'pdf' : 'image' })}
                        title={att.filename}
                      >
                        <img src={attachmentPreviews[att.id]} alt={att.filename} />
                        {isPdf && <span className="kanban-attachment-pdf-badge">PDF</span>}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* File list */}
              {task.attachments.map((att) => {
                const isPdf = att.mimeType === 'application/pdf'
                const hasPreview = !!attachmentPreviews[att.id]
                const lightboxSrc = isPdf ? (pdfDataUrls[att.id] ?? attachmentPreviews[att.id]!) : attachmentPreviews[att.id]!
                const lightboxType = isPdf ? 'pdf' as const : 'image' as const
                return (
                <div key={att.id} className={`kanban-attachment-item${hasPreview ? ' kanban-attachment-item--image' : ''}`}>
                  {hasPreview ? (
                    <img
                      className="kanban-attachment-item-thumb"
                      src={attachmentPreviews[att.id]}
                      alt={att.filename}
                      onClick={() => setLightboxImage({ src: lightboxSrc, filename: att.filename, type: lightboxType })}
                    />
                  ) : (
                    <span className="kanban-attachment-item-icon">📄</span>
                  )}
                  <span
                    className={`kanban-attachment-item-name${hasPreview ? ' kanban-attachment-item-name--clickable' : ''}`}
                    title={att.storedPath}
                    onClick={hasPreview ? () => setLightboxImage({ src: lightboxSrc, filename: att.filename, type: lightboxType }) : undefined}
                  >
                    {att.filename}
                  </span>
                  <span className="kanban-attachment-item-size">
                    {att.size < 1024 ? `${att.size} o` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)} Ko` : `${(att.size / 1048576).toFixed(1)} Mo`}
                  </span>
                  <button
                    className="kanban-attachment-item-remove"
                    onClick={() => onRemoveAttachment(att.id)}
                    title={t('common.delete')}
                  >
                    &times;
                  </button>
                </div>
                )
              })}
            </>
          ) : (
            <span className="kanban-detail-empty-hint">{t('kanban.noAttachments')}</span>
          )}
        </div>
        <button className="kanban-attach-btn" onClick={onAttachFiles}>
          {t('kanban.addFile')}
        </button>
      </div>

      {/* Image / PDF lightbox */}
      {lightboxImage && (
        <div className="kanban-lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div
            className={`kanban-lightbox-content${lightboxImage.type === 'pdf' ? ' kanban-lightbox-content--pdf' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxImage.type === 'pdf' ? (
              <object
                data={lightboxImage.src}
                type="application/pdf"
                className="kanban-lightbox-pdf"
              >
                <p>PDF preview unavailable</p>
              </object>
            ) : (
              <img src={lightboxImage.src} alt={lightboxImage.filename} onClick={() => setLightboxImage(null)} />
            )}
            <div className="kanban-lightbox-filename">{lightboxImage.filename}</div>
          </div>
          <button className="kanban-lightbox-close" onClick={() => setLightboxImage(null)}>&times;</button>
        </div>
      )}
    </>
  )
}
