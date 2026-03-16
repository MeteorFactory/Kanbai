import React, { useState, useCallback } from 'react'
import { RuleTreeNode } from '../../../../../../../shared/types'
import { RuleTreeItem } from './rule-tree-item'
import { DropTarget } from './use-rules-drag-drop'

interface Props {
  tree: RuleTreeNode[]
  selectedPath: string | null
  renaming: string | null
  renameValue: string
  draggedItem: string | null
  dropTarget: DropTarget | null
  onSelect: (relativePath: string) => void
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

export function RuleTreeView({
  tree,
  selectedPath,
  renaming,
  renameValue,
  draggedItem,
  dropTarget,
  onSelect,
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const renderNodes = (nodes: RuleTreeNode[], depth: number): React.JSX.Element[] => {
    const elements: React.JSX.Element[] = []
    for (const node of nodes) {
      const isExp = expanded.has(node.relativePath)
      elements.push(
        <RuleTreeItem
          key={node.relativePath}
          node={node}
          depth={depth}
          isExpanded={isExp}
          isSelected={selectedPath === node.relativePath}
          isRenaming={renaming === node.relativePath}
          renameValue={renameValue}
          draggedItem={draggedItem}
          dropTarget={dropTarget}
          onSelect={onSelect}
          onToggle={toggleExpanded}
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
        />,
      )
      if (node.type === 'directory' && isExp && node.children) {
        elements.push(...renderNodes(node.children, depth + 1))
      }
    }
    return elements
  }

  return <div>{renderNodes(tree, 0)}</div>
}
