import React, { useState, useEffect, useCallback } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { ContextMenu } from '../../shared/ui/context-menu'
import type { ContextMenuItem } from '../../shared/ui/context-menu'
import type { FileEntry } from '../../../shared/types'
import { FolderIcon, getFileIcon } from './file-icons'
import './fileexplorer.css'

type SortField = 'name' | 'size' | 'date'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function sortEntries(entries: FileEntry[], sortField: SortField): FileEntry[] {
  return [...entries].sort((a, b) => {
    // Directories always first
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

    switch (sortField) {
      case 'size':
        return (a.size ?? 0) - (b.size ?? 0)
      case 'date':
        return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0)
      case 'name':
      default:
        return a.name.localeCompare(b.name)
    }
  })
}

interface FileTreeNodeProps {
  entry: FileEntry
  depth: number
  sortField: SortField
  onRename: (oldPath: string, newName: string) => void
  onRefreshParent: () => void
}

function FileTreeNode({ entry, depth, sortField, onRename, onRefreshParent: _onRefreshParent }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null)
  const [createValue, setCreateValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const loadChildren = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await window.kanbai.fs.readDir(entry.path)
      setChildren(entries)
    } catch {
      setChildren([])
    }
    setLoading(false)
  }, [entry.path])

  const handleToggle = useCallback(async () => {
    if (!entry.isDirectory) return

    if (!expanded) {
      await loadChildren()
    }
    setExpanded(!expanded)
  }, [entry.isDirectory, expanded, loadChildren])

  const handleRenameStart = useCallback(() => {
    setIsRenaming(true)
    setRenameValue(entry.name)
  }, [entry.name])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== entry.name) {
      onRename(entry.path, trimmed)
    }
    setIsRenaming(false)
  }, [renameValue, entry.name, entry.path, onRename])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRenameSubmit()
      else if (e.key === 'Escape') setIsRenaming(false)
    },
    [handleRenameSubmit],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(entry.path).catch(() => {
      console.error('Failed to copy path to clipboard')
    })
  }, [entry.path])

  const handleOpenInFinder = useCallback(() => {
    window.kanbai.fs.openInFinder(entry.path)
  }, [entry.path])

  const handleCreateFile = useCallback(() => {
    if (!entry.isDirectory) return
    if (!expanded) {
      loadChildren().then(() => setExpanded(true))
    }
    setIsCreating('file')
    setCreateValue('')
  }, [entry.isDirectory, expanded, loadChildren])

  const handleCreateFolder = useCallback(() => {
    if (!entry.isDirectory) return
    if (!expanded) {
      loadChildren().then(() => setExpanded(true))
    }
    setIsCreating('folder')
    setCreateValue('')
  }, [entry.isDirectory, expanded, loadChildren])

  const handleCreateSubmit = useCallback(async () => {
    const trimmed = createValue.trim()
    if (!trimmed || !isCreating) {
      setIsCreating(null)
      return
    }

    const newPath = `${entry.path}/${trimmed}`
    try {
      if (isCreating === 'file') {
        await window.kanbai.fs.writeFile(newPath, '')
      } else {
        await window.kanbai.fs.mkdir(newPath)
      }
      await loadChildren()
    } catch (err) {
      console.error(`Failed to create ${isCreating}:`, err)
    }
    setIsCreating(null)
  }, [createValue, isCreating, entry.path, loadChildren])

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreateSubmit()
      else if (e.key === 'Escape') setIsCreating(null)
    },
    [handleCreateSubmit],
  )

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      { label: 'Copy path', action: handleCopyPath },
      { label: 'Open in Finder', action: handleOpenInFinder },
      { label: 'Rename', action: handleRenameStart },
    ]

    if (entry.isDirectory) {
      items.push(
        { label: '', action: () => {}, separator: true },
        { label: 'New file', action: handleCreateFile },
        { label: 'New folder', action: handleCreateFolder },
      )
    }

    return items
  }, [handleCopyPath, handleOpenInFinder, handleRenameStart, entry.isDirectory, handleCreateFile, handleCreateFolder])

  const sortedChildren = sortEntries(children, sortField)

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-row${entry.isDirectory ? ' file-tree-row--dir' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleToggle}
        onDoubleClick={handleRenameStart}
        onContextMenu={handleContextMenu}
      >
        {entry.isDirectory ? (
          <span className={`file-tree-chevron${expanded ? ' file-tree-chevron--expanded' : ''}`}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <path
                d="M3 2L7 5L3 8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ) : (
          <span className="file-tree-chevron-spacer" />
        )}
        <span className="file-tree-icon">
          {entry.isDirectory ? <FolderIcon /> : getFileIcon(entry.name)}
        </span>
        {isRenaming ? (
          <input
            className="file-tree-rename"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <>
            <span className="file-tree-name">{entry.name}</span>
            {!entry.isDirectory && entry.size != null && (
              <span className="file-tree-size">{formatFileSize(entry.size)}</span>
            )}
          </>
        )}
      </div>
      {expanded && entry.isDirectory && (
        <div className="file-tree-children">
          {loading ? (
            <div className="file-tree-loading" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              Chargement...
            </div>
          ) : (
            <>
              {isCreating && (
                <div
                  className="file-tree-row file-tree-row--creating"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                >
                  <span className="file-tree-icon">
                    {isCreating === 'folder' ? <FolderIcon /> : getFileIcon(createValue)}
                  </span>
                  <input
                    className="file-tree-rename"
                    value={createValue}
                    onChange={(e) => setCreateValue(e.target.value)}
                    onBlur={handleCreateSubmit}
                    onKeyDown={handleCreateKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={isCreating === 'folder' ? 'Folder name...' : 'File name...'}
                    autoFocus
                  />
                </div>
              )}
              {sortedChildren.map((child) => (
                <FileTreeNode
                  key={child.path}
                  entry={child}
                  depth={depth + 1}
                  sortField={sortField}
                  onRename={onRename}
                  onRefreshParent={loadChildren}
                />
              ))}
            </>
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

export function FileExplorer() {
  const { activeProjectId, projects } = useWorkspaceStore()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null)
  const [createValue, setCreateValue] = useState('')

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const refreshEntries = useCallback(async () => {
    if (!activeProject) return
    try {
      const refreshed = await window.kanbai.fs.readDir(activeProject.path)
      setEntries(refreshed)
    } catch {
      setEntries([])
    }
  }, [activeProject])

  useEffect(() => {
    if (!activeProject) {
      setEntries([])
      return
    }

    setLoading(true)
    window.kanbai.fs
      .readDir(activeProject.path)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [activeProject])

  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      const parts = oldPath.split('/')
      parts[parts.length - 1] = newName
      const newPath = parts.join('/')
      try {
        await window.kanbai.fs.rename(oldPath, newPath)
        await refreshEntries()
      } catch (err) {
        console.error('Rename failed:', err)
      }
    },
    [refreshEntries],
  )

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleRootCreateSubmit = useCallback(async () => {
    const trimmed = createValue.trim()
    if (!trimmed || !isCreating || !activeProject) {
      setIsCreating(null)
      return
    }

    const newPath = `${activeProject.path}/${trimmed}`
    try {
      if (isCreating === 'file') {
        await window.kanbai.fs.writeFile(newPath, '')
      } else {
        await window.kanbai.fs.mkdir(newPath)
      }
      await refreshEntries()
    } catch (err) {
      console.error(`Failed to create ${isCreating}:`, err)
    }
    setIsCreating(null)
  }, [createValue, isCreating, activeProject, refreshEntries])

  const handleRootCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRootCreateSubmit()
      else if (e.key === 'Escape') setIsCreating(null)
    },
    [handleRootCreateSubmit],
  )

  const rootContextMenuItems: ContextMenuItem[] = activeProject
    ? [
        {
          label: 'Copy path',
          action: () => {
            navigator.clipboard.writeText(activeProject.path).catch(() => {
              console.error('Failed to copy path to clipboard')
            })
          },
        },
        {
          label: 'Open in Finder',
          action: () => window.kanbai.fs.openInFinder(activeProject.path),
        },
        { label: '', action: () => {}, separator: true },
        {
          label: 'New file',
          action: () => {
            setIsCreating('file')
            setCreateValue('')
          },
        },
        {
          label: 'New folder',
          action: () => {
            setIsCreating('folder')
            setCreateValue('')
          },
        },
      ]
    : []

  if (!activeProject) {
    return (
      <div className="file-explorer-empty">
        Sélectionnez un projet pour voir ses fichiers.
      </div>
    )
  }

  const sortedEntries = sortEntries(entries, sortField)

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <div className="file-explorer-header-top">
          <span className="file-explorer-title">{activeProject.name}</span>
          <select
            className="file-explorer-sort"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="date">Date</option>
          </select>
        </div>
        <span className="file-explorer-path" title={activeProject.path}>
          {activeProject.path}
        </span>
      </div>
      <div className="file-explorer-tree" onContextMenu={handleRootContextMenu}>
        {loading ? (
          <div className="file-explorer-loading">Chargement...</div>
        ) : (
          <>
            {isCreating && (
              <div className="file-tree-row file-tree-row--creating" style={{ paddingLeft: '8px' }}>
                <span className="file-tree-icon">
                  {isCreating === 'folder' ? <FolderIcon /> : getFileIcon(createValue)}
                </span>
                <input
                  className="file-tree-rename"
                  value={createValue}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onBlur={handleRootCreateSubmit}
                  onKeyDown={handleRootCreateKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={isCreating === 'folder' ? 'Folder name...' : 'File name...'}
                  autoFocus
                />
              </div>
            )}
            {sortedEntries.map((entry) => (
              <FileTreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                sortField={sortField}
                onRename={handleRename}
                onRefreshParent={refreshEntries}
              />
            ))}
          </>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={rootContextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
