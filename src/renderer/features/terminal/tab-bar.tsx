import React, { useState, useRef, useCallback } from 'react'
import { useTerminalTabStore, type TerminalTabData } from './terminal-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'

export function TabBar() {
  const { tabs, activeTabId, createTab, closeTab, setActiveTab, renameTab, reorderTabs, closeOtherTabs, closeTabsToRight, duplicateTab } =
    useTerminalTabStore()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    tabId: string
  } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const handleDoubleClick = useCallback(
    (tab: TerminalTabData) => {
      setRenamingId(tab.id)
      setRenameValue(tab.label)
      setTimeout(() => renameInputRef.current?.select(), 0)
    },
    [],
  )

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameTab(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }, [renamingId, renameValue, renameTab])

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }, [])

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          label: 'Renommer',
          action: () => {
            const tab = tabs.find((t) => t.id === contextMenu.tabId)
            if (tab) handleDoubleClick(tab)
          },
        },
        {
          label: 'Dupliquer',
          action: () => duplicateTab(contextMenu.tabId),
        },
        { label: '', action: () => {}, separator: true },
        {
          label: 'Fermer',
          action: () => closeTab(contextMenu.tabId),
        },
        {
          label: 'Fermer les autres',
          action: () => closeOtherTabs(contextMenu.tabId),
        },
        {
          label: 'Fermer a droite',
          action: () => closeTabsToRight(contextMenu.tabId),
        },
      ]
    : []

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Set a transparent drag image
    const ghost = document.createElement('div')
    ghost.style.opacity = '0'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dragIndex !== null && index !== dragIndex) {
        setDropTarget(index)
      }
    },
    [dragIndex],
  )

  const handleDrop = useCallback(
    (_e: React.DragEvent, toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        reorderTabs(dragIndex, toIndex)
      }
      setDragIndex(null)
      setDropTarget(null)
    },
    [dragIndex, reorderTabs],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropTarget(null)
  }, [])

  return (
    <div className="terminal-tabs">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId
        const isRenaming = tab.id === renamingId
        const isDragging = index === dragIndex
        const isDropTarget = index === dropTarget
        const isStreaming = tab.color === '#F5A623' // Orange = active kanban AI session

        return (
          <div
            key={tab.id}
            className={`tab${isActive ? ' active' : ''}${isDragging ? ' tab--dragging' : ''}${isDropTarget ? ' tab--drop-target' : ''}${isStreaming ? ' tab--streaming' : ''}${tab.color ? ' tab--tinted' : ''}`}
            style={tab.color ? { '--tab-tint-color': tab.color } as React.CSSProperties : undefined}
            onClick={() => !isRenaming && setActiveTab(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {tab.color && <span className="tab-color-dot" style={{ background: tab.color }} />}
            {tab.hasActivity && !isActive && <span className="tab-activity-dot" />}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="tab-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span
                className="tab-label"
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.title = el.scrollWidth > el.clientWidth ? tab.label : ''
                }}
              >
                {tab.label}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                title="Fermer l'onglet"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button className="btn-icon tab-add" title="Nouveau terminal (⌘T)" onClick={async () => {
        const { activeWorkspaceId, activeProjectId, projects, workspaces } = useWorkspaceStore.getState()
        const project = projects.find((p) => p.id === activeProjectId)
        const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
        let cwd = project?.path || ''
        if (workspace && activeWorkspaceId) {
          const wsProjects = projects.filter((p) => p.workspaceId === activeWorkspaceId)
          if (wsProjects.length > 0) {
            try {
              const result = await window.kanbai.workspaceEnv.setup(workspace.name, wsProjects.map((p) => p.path), activeWorkspaceId)
              if (result?.success && result.envPath) cwd = result.envPath
            } catch { /* fallback to project path */ }
          }
        }
        createTab(activeWorkspaceId || '', cwd)
      }}>
        +
      </button>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
