import React, { useEffect, useRef } from 'react'
import { useI18n } from '../../lib/i18n'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmModalProps) {
  const { t } = useI18n()
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel, onConfirm])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onCancel()
  }

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-dialog">
        <div className="modal-header">{title}</div>
        <div className="modal-body">{message}</div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn--secondary" onClick={onCancel}>
            {resolvedCancelLabel}
          </button>
          <button
            className={`modal-btn ${danger ? 'modal-btn--danger' : 'modal-btn--primary'}`}
            onClick={onConfirm}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
