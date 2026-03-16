import { useState, useCallback, useRef } from 'react'

export type DropPosition = 'before' | 'inside' | 'after'

export interface DropTarget {
  relativePath: string
  position: DropPosition
  type: 'file' | 'directory'
}

export function useRulesDragDrop(
  onMoveRule: (oldPath: string, newPath: string) => Promise<void>,
) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dragCounterRef = useRef(0)

  const handleDragStart = useCallback((e: React.DragEvent, relativePath: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', relativePath)
    setDraggedItem(relativePath)
  }, [])

  const handleDragOver = useCallback((
    e: React.DragEvent,
    targetPath: string,
    targetType: 'file' | 'directory',
  ) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggedItem || draggedItem === targetPath) return

    // Can't drop into own subdirectory
    if (targetPath.startsWith(draggedItem + '/')) return

    e.dataTransfer.dropEffect = 'move'

    if (targetType === 'directory') {
      setDropTarget({ relativePath: targetPath, position: 'inside', type: targetType })
    } else {
      // Determine position based on mouse Y within element
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const position: DropPosition = y < rect.height / 2 ? 'before' : 'after'
      setDropTarget({ relativePath: targetPath, position, type: targetType })
    }
  }, [draggedItem])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setDropTarget(null)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const sourcePath = e.dataTransfer.getData('text/plain')
    if (!sourcePath || !dropTarget) {
      setDraggedItem(null)
      setDropTarget(null)
      dragCounterRef.current = 0
      return
    }

    const sourceFilename = sourcePath.split(/[\\/]/).pop()!
    let newPath: string

    if (dropTarget.position === 'inside' && dropTarget.type === 'directory') {
      // Drop into directory
      newPath = dropTarget.relativePath + '/' + sourceFilename
    } else {
      // Drop before/after a file — place in same directory
      const targetParts = dropTarget.relativePath.split('/')
      if (targetParts.length > 1) {
        newPath = targetParts.slice(0, -1).join('/') + '/' + sourceFilename
      } else {
        newPath = sourceFilename
      }
    }

    if (newPath !== sourcePath) {
      await onMoveRule(sourcePath, newPath)
    }

    setDraggedItem(null)
    setDropTarget(null)
    dragCounterRef.current = 0
  }, [dropTarget, onMoveRule])

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null)
    setDropTarget(null)
    dragCounterRef.current = 0
  }, [])

  return {
    draggedItem,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  }
}
