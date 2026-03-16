import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useTerminalTabStore } from '../lib/stores/terminalTabStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useKanbanStore } from '../features/kanban'
import { useViewStore } from '../lib/stores/viewStore'
import { useUpdateStore } from '../lib/stores/updateStore'
import { useI18n } from '../lib/i18n'
import { AI_PROVIDERS } from '../../shared/types/ai-provider'
import { SplitContainer } from './SplitContainer'
import { ProjectToolbar } from './ProjectToolbar'

export function TerminalArea() {
  const { t } = useI18n()
  const {
    tabs: allTabs,
    activeTabId,
    createTab,
    closeTab,
    setActiveTab,
    renameTab,
    reorderTabs,
    activateNext,
    activatePrev,
    activateByIndex,
    splitPane,
    closePane,
    toggleZoomPane,
    focusDirection,
  } = useTerminalTabStore()

  const { activeWorkspaceId, activeProjectId, projects, workspaces } = useWorkspaceStore()

  // Filter tabs for the active workspace
  const tabs = useMemo(
    () => allTabs.filter((t) => t.workspaceId === activeWorkspaceId),
    [allTabs, activeWorkspaceId],
  )

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // Resolve workspace env path for new terminal cwd
  const [envCwd, setEnvCwd] = useState('')
  useEffect(() => {
    if (!activeWorkspace || !activeWorkspaceId) {
      setEnvCwd(activeProject?.path || '')
      return
    }
    const wsProjects = projects.filter((p) => p.workspaceId === activeWorkspaceId)
    if (wsProjects.length === 0) {
      setEnvCwd(activeProject?.path || '')
      return
    }
    window.kanbai.workspaceEnv.setup(activeWorkspace.name, wsProjects.map((p) => p.path), activeWorkspaceId)
      .then((result: { success: boolean; envPath?: string }) => {
        if (result?.success && result.envPath) {
          setEnvCwd(result.envPath)
        } else {
          setEnvCwd(activeProject?.path || '')
        }
      })
      .catch(() => setEnvCwd(activeProject?.path || ''))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, activeWorkspace?.name, activeProject?.path, projects.length])

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const dragTabIdRef = useRef<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  // Terminal font size (shared across all terminals)
  const [terminalFontSize, setTerminalFontSize] = useState(14)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey

      // Cmd+T: new tab
      if (isMeta && !e.shiftKey && e.key === 't') {
        e.preventDefault()
        if (activeWorkspaceId && envCwd) {
          createTab(activeWorkspaceId, envCwd)
        }
        return
      }

      // Cmd+W: close active pane (or tab if only one pane)
      if (isMeta && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === activeTabId)
          if (tab) {
            closePane(activeTabId, tab.activePaneId)
          }
        }
        return
      }

      // Cmd+Shift+[ : previous tab (workspace-scoped)
      if (isMeta && e.shiftKey && e.code === 'BracketLeft') {
        e.preventDefault()
        activatePrev(activeWorkspaceId ?? undefined)
        return
      }

      // Cmd+Shift+] : next tab (workspace-scoped)
      if (isMeta && e.shiftKey && e.code === 'BracketRight') {
        e.preventDefault()
        activateNext(activeWorkspaceId ?? undefined)
        return
      }

      // Cmd+1-9: switch to tab by index (workspace-scoped)
      if (isMeta && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key, 10) - 1
        activateByIndex(index, activeWorkspaceId ?? undefined)
        return
      }

      // Cmd+D: split horizontal
      if (isMeta && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        if (activeTabId) {
          const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === activeTabId)
          if (tab) {
            splitPane(activeTabId, tab.activePaneId, 'horizontal')
          }
        }
        return
      }

      // Cmd+Shift+D: split vertical
      if (isMeta && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        if (activeTabId) {
          const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === activeTabId)
          if (tab) {
            splitPane(activeTabId, tab.activePaneId, 'vertical')
          }
        }
        return
      }

      // Cmd+Shift+Enter: toggle zoom pane
      if (isMeta && e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        if (activeTabId) {
          const tab = useTerminalTabStore.getState().tabs.find((t) => t.id === activeTabId)
          if (tab) {
            toggleZoomPane(activeTabId, tab.activePaneId)
          }
        }
        return
      }

      // Cmd+Alt+Arrow: navigate between panes
      if (isMeta && e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        if (activeTabId) {
          const dirMap: Record<string, 'left' | 'right' | 'up' | 'down'> = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'up',
            ArrowDown: 'down',
          }
          focusDirection(activeTabId, dirMap[e.key]!)
        }
        return
      }

      // Cmd+Plus: increase terminal font size
      if (isMeta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setTerminalFontSize((prev) => Math.min(prev + 1, 32))
        return
      }

      // Cmd+Minus: decrease terminal font size
      if (isMeta && e.key === '-') {
        e.preventDefault()
        setTerminalFontSize((prev) => Math.max(prev - 1, 8))
        return
      }

      // Cmd+0: reset terminal font size
      if (isMeta && e.key === '0') {
        e.preventDefault()
        setTerminalFontSize(14)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeTabId,
    activeWorkspaceId,
    envCwd,
    createTab,
    closePane,
    activateNext,
    activatePrev,
    activateByIndex,
    splitPane,
    toggleZoomPane,
    focusDirection,
  ])

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingTabId])

  const handleDoubleClick = useCallback(
    (tabId: string, currentLabel: string) => {
      setEditingTabId(tabId)
      setEditingLabel(currentLabel)
      setTooltip(null)
    },
    [],
  )

  const commitRename = useCallback(() => {
    if (editingTabId) {
      const trimmed = editingLabel.trim()
      if (trimmed) {
        renameTab(editingTabId, trimmed)
      }
      setEditingTabId(null)
      setEditingLabel('')
    }
  }, [editingTabId, editingLabel, renameTab])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename()
      } else if (e.key === 'Escape') {
        setEditingTabId(null)
        setEditingLabel('')
      }
    },
    [commitRename],
  )

  // Drag & drop handlers — use tab IDs to avoid stale index issues
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    dragTabIdRef.current = tabId
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
    setTooltip(null)
    const target = e.currentTarget as HTMLElement
    target.classList.add('tab--dragging')
    tabBarRef.current?.classList.add('tabs--dragging')
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    target.classList.remove('tab--dragging')
    dragTabIdRef.current = null
    setDragOverTabId(null)
    // Keep close buttons disabled long enough to suppress any spurious
    // click/mouseup events that macOS Chromium may fire after drag ends
    setTimeout(() => {
      setIsDragging(false)
      tabBarRef.current?.classList.remove('tabs--dragging')
    }, 300)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTabId(tabId)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverTabId(null)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, toTabId: string) => {
      e.preventDefault()
      e.stopPropagation()
      const fromTabId = dragTabIdRef.current
      if (fromTabId && fromTabId !== toTabId) {
        // Read fresh state at drop time to get correct global indices
        const currentTabs = useTerminalTabStore.getState().tabs
        const fromGlobal = currentTabs.findIndex((t) => t.id === fromTabId)
        const toGlobal = currentTabs.findIndex((t) => t.id === toTabId)
        if (fromGlobal !== -1 && toGlobal !== -1) {
          reorderTabs(fromGlobal, toGlobal)
        }
      }
      dragTabIdRef.current = null
      setDragOverTabId(null)
    },
    [reorderTabs],
  )

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation()
      if (isDragging) return
      closeTab(tabId)
    },
    [closeTab, isDragging],
  )

  const handleTabMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault()
        if (isDragging) return
        closeTab(tabId)
      }
    },
    [closeTab, isDragging],
  )

  const isWindows = navigator.platform.startsWith('Win')

  const handleNewTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createTab(activeWorkspaceId, envCwd)
    }
  }, [activeWorkspaceId, envCwd, createTab])

  const handleNewCmdTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createTab(activeWorkspaceId, envCwd, 'Command Prompt', undefined, true, 'cmd.exe')
    }
  }, [activeWorkspaceId, envCwd, createTab])

  const handleNewPowershellTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createTab(activeWorkspaceId, envCwd, 'PowerShell', undefined, true, 'powershell.exe')
    }
  }, [activeWorkspaceId, envCwd, createTab])

  const kanbanTabIds = useKanbanStore((s) => s.kanbanTabIds)
  const kanbanTasks = useKanbanStore((s) => s.tasks)
  const navigateToKanbanTask = useViewStore((s) => s.navigateToKanbanTask)

  // Build reverse mapping: tabId -> taskId
  const tabToTaskId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [taskId, tabId] of Object.entries(kanbanTabIds)) {
      map[tabId] = taskId
    }
    return map
  }, [kanbanTabIds])

  const pixelAgentsInstalled = useUpdateStore((s) => s.updates.find((u) => u.tool === 'pixel-agents')?.installed ?? false)

  const { createSplitTab } = useTerminalTabStore()

  const handleNewClaudeTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createSplitTab(activeWorkspaceId, envCwd, 'Claude + Terminal', 'claude', null)
    }
  }, [activeWorkspaceId, envCwd, createSplitTab])

  const handleNewCodexTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createSplitTab(activeWorkspaceId, envCwd, 'Codex + Terminal', 'codex', null)
    }
  }, [activeWorkspaceId, envCwd, createSplitTab])

  const handleNewCopilotTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createSplitTab(activeWorkspaceId, envCwd, 'Copilot + Terminal', 'copilot', null)
    }
  }, [activeWorkspaceId, envCwd, createSplitTab])

  const { createPixelAgentsTab, createPixelAgentsSplitTab } = useTerminalTabStore()

  const handleNewPixelAgentsOnlyTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createPixelAgentsTab(activeWorkspaceId, envCwd)
    }
  }, [activeWorkspaceId, envCwd, createPixelAgentsTab])

  const handleNewPixelAgentsTab = useCallback(() => {
    if (activeWorkspaceId && envCwd) {
      createPixelAgentsSplitTab(activeWorkspaceId, envCwd)
    }
  }, [activeWorkspaceId, envCwd, createPixelAgentsSplitTab])

  const addWrapperRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const dropdownLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleAddWrapperEnter = useCallback(() => {
    if (dropdownLeaveTimer.current) {
      clearTimeout(dropdownLeaveTimer.current)
      dropdownLeaveTimer.current = null
    }
    if (addWrapperRef.current) {
      const rect = addWrapperRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [])

  const handleAddWrapperLeave = useCallback(() => {
    dropdownLeaveTimer.current = setTimeout(() => {
      setDropdownPos(null)
      dropdownLeaveTimer.current = null
    }, 1000)
  }, [])

  // Cleanup dropdown leave timer on unmount
  useEffect(() => {
    return () => {
      if (dropdownLeaveTimer.current) {
        clearTimeout(dropdownLeaveTimer.current)
      }
    }
  }, [])

  if (!activeWorkspaceId) {
    return (
      <main className="terminal-area">
        <div className="terminal-content">
          <div className="terminal-empty">
            <p>{t('terminal.noWorkspace')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('terminal.selectOrCreate')}
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="terminal-area">
      <div className="terminal-tabs" ref={tabBarRef}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${
              dragOverTabId === tab.id ? 'tab-drag-over' : ''
            }${tab.color === '#F5A623' ? ' tab--streaming' : ''}${tab.color ? ' tab--tinted' : ''}`}
            style={tab.color ? { '--tab-tint-color': tab.color } as React.CSSProperties : undefined}
            onClick={() => setActiveTab(tab.id)}
            onMouseDown={(e) => handleTabMouseDown(e, tab.id)}
            onDoubleClick={() => handleDoubleClick(tab.id, tab.label)}
            draggable={editingTabId !== tab.id}
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, tab.id)}
            onMouseEnter={(e) => {
              if (editingTabId !== tab.id) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({ text: tab.label, x: rect.left + rect.width / 2, y: rect.bottom })
              }
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {tab.color && (
              <span className="tab-color-dot" style={{ background: tab.color }} />
            )}
            {tab.hasActivity && tab.id !== activeTabId && (
              <span className="tab-activity-dot" />
            )}
            {editingTabId === tab.id ? (
              <input
                ref={editInputRef}
                className="tab-rename-input"
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-label">
                {tab.label}
              </span>
            )}
            <button
              className="tab-close"
              data-tooltip={isDragging ? undefined : t('common.close')}
              disabled={isDragging}
              style={isDragging ? { pointerEvents: 'none' } : undefined}
              onClick={isDragging ? undefined : (e) => handleTabClose(e, tab.id)}
              onMouseDown={isDragging ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
            >
              x
            </button>
          </div>
        ))}
        <div
          className="tab-add-wrapper"
          ref={addWrapperRef}
          onMouseEnter={handleAddWrapperEnter}
          onMouseLeave={handleAddWrapperLeave}
        >
          <button className="btn-icon tab-add" data-tooltip={t('terminal.newTerminal')} onClick={handleNewTab}>
            +
          </button>
          {dropdownPos && (
            <div
              className="tab-add-dropdown"
              style={{ display: 'block', top: dropdownPos.top, left: dropdownPos.left }}
              onMouseEnter={() => {
                if (dropdownLeaveTimer.current) {
                  clearTimeout(dropdownLeaveTimer.current)
                  dropdownLeaveTimer.current = null
                }
              }}
              onMouseLeave={handleAddWrapperLeave}
            >
              {isWindows ? (
                <>
                  <button className="tab-add-dropdown-item" onClick={handleNewCmdTab}>
                    <span className="tab-add-dropdown-icon">{'>'}_</span>
                    <span>Command Prompt</span>
                  </button>
                  <button className="tab-add-dropdown-item" onClick={handleNewPowershellTab}>
                    <span className="tab-add-dropdown-icon">PS</span>
                    <span>PowerShell</span>
                  </button>
                </>
              ) : (
                <button className="tab-add-dropdown-item" onClick={handleNewTab}>
                  <span className="tab-add-dropdown-icon">{'>'}_</span>
                  <span>{t('terminal.newTerminalShort')}</span>
                </button>
              )}
              <button className="tab-add-dropdown-item" onClick={handleNewClaudeTab}>
                <span className="tab-add-dropdown-icon tab-add-dropdown-icon--claude">C</span>
                <span>{t('terminal.newClaudeTerminal')}</span>
              </button>
              <button className="tab-add-dropdown-item" onClick={handleNewCodexTab}>
                <span className="tab-add-dropdown-icon tab-add-dropdown-icon--codex">X</span>
                <span>{t('terminal.newCodexTerminal')}</span>
              </button>
              <button className="tab-add-dropdown-item" onClick={handleNewCopilotTab}>
                <span className="tab-add-dropdown-icon tab-add-dropdown-icon--copilot">P</span>
                <span>{t('terminal.newCopilotTerminal')}</span>
              </button>
              {pixelAgentsInstalled && (
                <>
                  <button className="tab-add-dropdown-item" onClick={handleNewPixelAgentsTab}>
                    <span className="tab-add-dropdown-icon tab-add-dropdown-icon--pixel-agents">PA</span>
                    <span>{t('terminal.newPixelAgentsTerminal')}</span>
                  </button>
                  <button className="tab-add-dropdown-item" onClick={handleNewPixelAgentsOnlyTab}>
                    <span className="tab-add-dropdown-icon tab-add-dropdown-icon--pixel-agents">PA</span>
                    <span>{t('terminal.newPixelAgentsOnly')}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {tooltip && (
        <div
          className="tab-tooltip"
          style={{ top: tooltip.y + 6, left: tooltip.x }}
        >
          {tooltip.text}
        </div>
      )}
      <ProjectToolbar />
      <div className="terminal-content">
        {allTabs.map((tab) => {
          const linkedTaskId = tabToTaskId[tab.id]
          const linkedTask = linkedTaskId ? kanbanTasks.find((t) => t.id === linkedTaskId) : null
          return (
            <div
              key={tab.id}
              className="terminal-tab-content"
              style={{
                display:
                  tab.workspaceId === activeWorkspaceId && tab.id === activeTabId
                    ? 'flex'
                    : 'none',
              }}
            >
              {linkedTask && (
                <button
                  className="terminal-kanban-notch"
                  style={{ '--notch-color': AI_PROVIDERS[linkedTask.aiProvider ?? 'claude'].detectionColor } as React.CSSProperties}
                  data-tooltip={t('terminal.goToKanban')}
                  onClick={() => navigateToKanbanTask(linkedTask.id)}
                >
                  <span className="terminal-kanban-notch-text">Ticket {linkedTask.ticketNumber != null ? `${({'bug':'B','feature':'F','test':'T','doc':'D','ia':'A','refactor':'R'}[linkedTask.type ?? 'feature'])}-${linkedTask.ticketNumber}` : ''}</span>
                </button>
              )}
              <SplitContainer tabId={tab.id} fontSize={terminalFontSize} />
            </div>
          )
        })}
        {tabs.length === 0 && (
          <div className="terminal-empty">
            <p>{t('terminal.noTerminalOpen')}</p>
            <button className="terminal-empty-btn" onClick={handleNewTab}>
              {t('terminal.newTerminal')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
