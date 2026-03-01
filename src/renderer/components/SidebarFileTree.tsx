import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { FileEntry } from '../../shared/types'
import { useViewStore } from '../lib/stores/viewStore'
import { ContextMenu, ContextMenuItem } from './ContextMenu'

interface SidebarFileTreeProps {
  projectPath: string
}

interface FileNodeProps {
  entry: FileEntry
  depth: number
  onRefresh: () => void
}

function FileNode({ entry, depth, onRefresh }: FileNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const selectedFiles = useViewStore((s) => s.selectedFiles)
  const highlightedFilePath = useViewStore((s) => s.highlightedFilePath)

  const loadChildren = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await window.mirehub.fs.readDir(entry.path)
      setChildren(entries)
    } catch {
      setChildren([])
    }
    setLoading(false)
  }, [entry.path])

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    if (entry.isDirectory) {
      if (!expanded) {
        await loadChildren()
      }
      setExpanded(!expanded)
    } else {
      if (e.metaKey) {
        useViewStore.getState().toggleFileSelection(entry.path)
      } else {
        useViewStore.getState().clearSelection()
        useViewStore.getState().openFile(entry.path)
      }
    }
  }, [entry.isDirectory, entry.path, expanded, loadChildren])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleRenameStart = useCallback(() => {
    setRenameValue(entry.name)
    setIsRenaming(true)
  }, [entry.name])

  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== entry.name) {
      const dir = entry.path.substring(0, entry.path.lastIndexOf('/'))
      await window.mirehub.fs.rename(entry.path, dir + '/' + trimmed)
      onRefresh()
    }
    setIsRenaming(false)
  }, [renameValue, entry.name, entry.path, onRefresh])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
    }
  }, [handleRenameSubmit])

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  const handleCopy = useCallback(() => {
    useViewStore.getState().setClipboard(entry.path, 'copy')
  }, [entry.path])

  const handleDuplicate = useCallback(async () => {
    const dir = entry.path.substring(0, entry.path.lastIndexOf('/'))
    const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop() : ''
    const baseName = ext ? entry.name.slice(0, -ext.length) : entry.name
    let destName = `${baseName} copie${ext}`
    let destPath = `${dir}/${destName}`
    let counter = 2
    while (await window.mirehub.fs.exists(destPath)) {
      destName = `${baseName} copie ${counter}${ext}`
      destPath = `${dir}/${destName}`
      counter++
    }
    await window.mirehub.fs.copy(entry.path, destPath)
    onRefresh()
  }, [entry.path, entry.name, onRefresh])

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(`Supprimer "${entry.name}" ?`)
    if (confirmed) {
      await window.mirehub.fs.delete(entry.path)
      onRefresh()
    }
  }, [entry.path, entry.name, onRefresh])

  const handleNewFile = useCallback(async () => {
    const filePath = entry.path + '/nouveau_fichier'
    await window.mirehub.fs.writeFile(filePath, '')
    if (!expanded) {
      await loadChildren()
      setExpanded(true)
    } else {
      await loadChildren()
    }
  }, [entry.path, expanded, loadChildren])

  const handleNewFolder = useCallback(async () => {
    const dirPath = entry.path + '/nouveau_dossier'
    await window.mirehub.fs.mkdir(dirPath)
    if (!expanded) {
      await loadChildren()
      setExpanded(true)
    } else {
      await loadChildren()
    }
  }, [entry.path, expanded, loadChildren])

  const handlePaste = useCallback(async () => {
    const { clipboardPath } = useViewStore.getState()
    if (!clipboardPath) return
    const name = clipboardPath.split(/[\\/]/).pop() ?? 'paste'
    let destPath = `${entry.path}/${name}`
    let counter = 2
    while (await window.mirehub.fs.exists(destPath)) {
      const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
      const base = ext ? name.slice(0, -ext.length) : name
      destPath = `${entry.path}/${base} (${counter})${ext}`
      counter++
    }
    await window.mirehub.fs.copy(clipboardPath, destPath)
    useViewStore.getState().clearClipboard()
    if (expanded) {
      await loadChildren()
    }
  }, [entry.path, expanded, loadChildren])

  const clipboardPath = useViewStore((s) => s.clipboardPath)

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (entry.isDirectory) {
      const items: ContextMenuItem[] = [
        { label: 'Nouveau fichier', action: handleNewFile },
        { label: 'Nouveau dossier', action: handleNewFolder },
        { label: 'Renommer', action: handleRenameStart },
        { separator: true, label: '', action: () => {} },
        { label: 'Copier', action: handleCopy },
      ]
      if (clipboardPath) {
        items.push({ label: 'Coller', action: handlePaste })
      }
      items.push(
        { label: 'Dupliquer', action: handleDuplicate },
        { separator: true, label: '', action: () => {} },
        { label: 'Supprimer', action: handleDelete, danger: true },
      )
      return items
    }
    return [
      { label: 'Renommer', action: handleRenameStart },
      { label: 'Copier', action: handleCopy },
      { label: 'Dupliquer', action: handleDuplicate },
      { separator: true, label: '', action: () => {} },
      { label: 'Supprimer', action: handleDelete, danger: true },
    ]
  }

  const getFileIcon = (name: string, isDir: boolean): string => {
    if (isDir) return '\u{1F4C1}'
    const ext = name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'ts':
      case 'tsx':
        return '\u{1F535}'
      case 'js':
      case 'jsx':
        return '\u{1F7E1}'
      case 'json':
        return '\u{1F7E2}'
      case 'css':
        return '\u{1F7E3}'
      case 'md':
        return '\u{1F4DD}'
      case 'html':
        return '\u{1F7E0}'
      default:
        return '\u{1F4C4}'
    }
  }

  const isSelected = !entry.isDirectory && selectedFiles.includes(entry.path)
  const isHighlighted = entry.path === highlightedFilePath

  return (
    <div className="sidebar-ft-node">
      <div
        className={`sidebar-ft-row${entry.isDirectory ? ' sidebar-ft-row--dir' : ''}${isSelected ? ' sidebar-ft-row--selected' : ''}${isHighlighted ? ' sidebar-ft-row--highlighted' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {entry.isDirectory && (
          <span className={`sidebar-ft-chevron${expanded ? ' sidebar-ft-chevron--expanded' : ''}`}>
            <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
              <path
                d="M3 2L7 5L3 8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        <span className="sidebar-ft-icon">{getFileIcon(entry.name, entry.isDirectory)}</span>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="sidebar-ft-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="sidebar-ft-name">{entry.name}</span>
        )}
      </div>
      {expanded && entry.isDirectory && (
        <div className="sidebar-ft-children">
          {loading ? (
            <div className="sidebar-ft-loading" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
              ...
            </div>
          ) : (
            children.map((child) => (
              <FileNode key={child.path} entry={child} depth={depth + 1} onRefresh={loadChildren} />
            ))
          )}
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export function SidebarFileTree({ projectPath }: SidebarFileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)

  const loadEntries = useCallback(() => {
    if (!projectPath) {
      setEntries([])
      return
    }
    setLoading(true)
    window.mirehub.fs
      .readDir(projectPath)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [projectPath])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  if (loading) {
    return <div className="sidebar-ft-loading">Chargement...</div>
  }

  return (
    <div className="sidebar-ft-tree">
      {entries.map((entry) => (
        <FileNode key={entry.path} entry={entry} depth={0} onRefresh={loadEntries} />
      ))}
    </div>
  )
}
