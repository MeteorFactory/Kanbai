import { useRef, useEffect } from 'react'
import { RuleTreeNode } from '../../../../../../../shared/types'
import { DropTarget } from './use-rules-drag-drop'

interface Props {
  node: RuleTreeNode
  depth: number
  isExpanded: boolean
  isSelected: boolean
  isRenaming: boolean
  renameValue: string
  draggedItem: string | null
  dropTarget: DropTarget | null
  onSelect: (relativePath: string) => void
  onToggle: (relativePath: string) => void
  onContextMenu: (e: React.MouseEvent, relativePath: string, type: 'file' | 'directory') => void
  onRenameChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onDragStart: (e: React.DragEvent, relativePath: string) => void
  onDragOver: (e: React.DragEvent, targetPath: string, targetType: 'file' | 'directory') => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

export function RuleTreeItem({
  node,
  depth,
  isExpanded,
  isSelected,
  isRenaming,
  renameValue,
  draggedItem,
  dropTarget,
  onSelect,
  onToggle,
  onContextMenu,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isFile = node.type === 'file'
  const isDragging = draggedItem === node.relativePath
  const isDropTarget = dropTarget?.relativePath === node.relativePath

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const dropClass = isDropTarget
    ? ` cs-rules-tree-item--drop-${dropTarget.position}`
    : ''

  const className = [
    'cs-rules-tree-item',
    isSelected && 'cs-rules-tree-item--active',
    !isFile && 'cs-rules-tree-item--directory',
    isDragging && 'cs-rules-tree-item--dragging',
    dropClass,
  ].filter(Boolean).join(' ')

  const handleClick = () => {
    if (isFile) {
      onSelect(node.relativePath)
    } else {
      onToggle(node.relativePath)
    }
  }

  const isLocalFile = isFile && node.rule && !node.rule.isSymlink

  return (
    <div
      className={className}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, node.relativePath, node.type)}
      draggable={!!isLocalFile}
      onDragStart={isLocalFile ? (e) => onDragStart(e, node.relativePath) : undefined}
      onDragOver={(e) => onDragOver(e, node.relativePath, node.type)}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Chevron or placeholder */}
      {!isFile ? (
        <span className={`cs-rules-tree-chevron${isExpanded ? ' cs-rules-tree-chevron--expanded' : ''}`}>
          ▶
        </span>
      ) : (
        <span className="cs-rules-tree-chevron cs-rules-tree-chevron--placeholder">▶</span>
      )}

      {isRenaming ? (
        <input
          ref={inputRef}
          className="cs-rule-input"
          style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameSubmit()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="cs-rules-file-name" style={{ flex: 1 }}>{node.name}</span>
          {isFile && node.rule?.isSymlink && (
            <span className="cs-rules-badge cs-rules-badge--shared" style={{ marginLeft: 4 }}>⟡</span>
          )}
          {isFile && node.rule?.paths && node.rule.paths.length > 0 && (
            <div className="cs-rule-item-paths" style={{ fontSize: 9 }}>
              {node.rule.paths.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
