import { useRef, useEffect } from 'react'
import { useI18n } from '../../../../../../lib/i18n'

interface Props {
  x: number
  y: number
  relativePath: string
  type: 'file' | 'directory'
  isSymlink: boolean
  hasConflict: boolean
  onRename: () => void
  onConvertToShared: () => void
  onReplaceWithShared: () => void
  onUnlink: () => void
  onDelete: () => void
  onDeleteDir: () => void
  onClose: () => void
}

export function RuleContextMenu({
  x,
  y,
  type,
  isSymlink,
  hasConflict,
  onRename,
  onConvertToShared,
  onReplaceWithShared,
  onUnlink,
  onDelete,
  onDeleteDir,
  onClose,
}: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (type === 'directory') {
    return (
      <div ref={ref} className="cs-rules-context-menu" style={{ top: y, left: x }}>
        <button className="cs-rules-context-item" onClick={onRename}>
          {t('claude.renameFolder')}
        </button>
        <button className="cs-rules-context-item cs-rules-context-item--danger" onClick={onDeleteDir}>
          {t('claude.deleteFolder')}
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="cs-rules-context-menu" style={{ top: y, left: x }}>
      {!isSymlink && (
        <>
          <button className="cs-rules-context-item" onClick={onRename}>
            {t('claude.rename')}
          </button>
          <button className="cs-rules-context-item" onClick={onConvertToShared}>
            {t('claude.convertToShared')}
          </button>
          {hasConflict && (
            <button className="cs-rules-context-item" onClick={onReplaceWithShared}>
              {t('claude.replaceWithShared')}
            </button>
          )}
        </>
      )}
      {isSymlink && (
        <button className="cs-rules-context-item" onClick={onUnlink}>
          {t('claude.unlinkSharedRule')}
        </button>
      )}
      <button className="cs-rules-context-item cs-rules-context-item--danger" onClick={onDelete}>
        {t('claude.deleteConfirm')}
      </button>
    </div>
  )
}
