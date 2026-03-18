import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Workspace, Project, DbEnvironmentTag } from '../../../shared/types/index'
import { useWorkspaceStore } from './workspace-store'
import { useClaudeStore } from '../claude'
import { useViewStore } from '../../lib/stores/viewStore'
import { useDatabaseStore } from '../../lib/stores/databaseStore'
import { useI18n } from '../../lib/i18n'
import { ProjectItem } from './features/project/project-item'
import { ContextMenu, type ContextMenuItem } from '../../shared/ui/context-menu'

const ENV_TAG_COLORS: Record<DbEnvironmentTag, string> = {
  local: '#20D4A0',
  dev: '#4B9CFF',
  int: '#F5A623',
  qua: '#a78bfa',
  prd: '#F4585B',
  custom: 'var(--text-muted)',
}

const ENGINE_ICONS: Record<string, string> = {
  postgresql: 'PG',
  mysql: 'MY',
  mssql: 'MS',
  mongodb: 'MG',
  sqlite: 'SQ',
}

interface WorkspaceItemProps {
  workspace: Workspace
  projects: Project[]
  isActive: boolean
}

const WORKSPACE_COLORS = [
  '#9747FF', // purple
  '#20D4A0', // green
  '#F4585B', // red
  '#F5A623', // peach
  '#a78bfa', // mauve
  '#fbbf24', // yellow
  '#22d3ee', // teal
  '#ec4899', // pink
]

const WORKSPACE_ICON_KEYS = [
  { icon: '\u25CF', key: 'icon.circle' },       // filled circle
  { icon: '\u2605', key: 'icon.star' },          // star
  { icon: '\u2665', key: 'icon.heart' },         // heart
  { icon: '\u26A1', key: 'icon.lightning' },     // lightning
  { icon: '\u2699', key: 'icon.gear' },          // gear
  { icon: '\u2702', key: 'icon.scissors' },      // scissors
  { icon: '\u270E', key: 'icon.pencil' },        // pencil
  { icon: '\u2764', key: 'icon.code' },          // code bracket
]

export function WorkspaceItem({ workspace, projects, isActive }: WorkspaceItemProps) {
  const { t } = useI18n()

  // Load DB connections for this workspace (every workspace loads its own)
  const {
    connectionsByWorkspace,
    connectionStatuses,
    loadConnections,
    setActiveConnection,
    connectDb,
    disconnectDb,
    deleteConnection: deleteDbConnection,
  } = useDatabaseStore()
  const wsConnections = connectionsByWorkspace[workspace.id] ?? []

  useEffect(() => {
    loadConnections(workspace.id)
  }, [workspace.id, loadConnections])

  const [expanded, setExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(workspace.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createProjectName, setCreateProjectName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  const {
    setActiveWorkspace,
    activeProjectId,
    deleteWorkspace,
    updateWorkspace,
    addProject,
    moveProject,
    refreshWorkspace,
    namespaces,
  } = useWorkspaceStore()

  const flashingWorkspaceId = useClaudeStore((s) => s.flashingWorkspaceId)
  const isFlashing = workspace.id === flashingWorkspaceId
  const workspaceClaudeStatus = useClaudeStore((s) => s.workspaceClaudeStatus[workspace.id])

  // Native kanban-based working ticket detection (independent of AI hooks)
  const [workingTickets, setWorkingTickets] = useState<Array<{
    ticketNumber: number | null; isCtoTicket: boolean; type?: string; title: string
  }>>([])
  const [showWorkingTooltip, setShowWorkingTooltip] = useState(false)

  const fetchWorkingTickets = useCallback(() => {
    window.kanbai.kanban.getWorkingTickets(workspace.id).then((result) => {
      setWorkingTickets(result ?? [])
    }).catch(() => setWorkingTickets([]))
  }, [workspace.id])

  // Fetch on mount + listen to kanban file changes
  useEffect(() => {
    fetchWorkingTickets()
    const unsubscribe = window.kanbai.kanban.onFileChanged(({ workspaceId }) => {
      if (workspaceId === workspace.id) {
        fetchWorkingTickets()
      }
    })
    return () => { unsubscribe() }
  }, [workspace.id, fetchWorkingTickets])

  // Also keep the single working ticket info for hook-based statuses (ask, waiting, failed)
  const [workingTicketInfo, setWorkingTicketInfo] = useState<{
    ticketNumber: number | null; isCtoTicket: boolean; type?: string
  } | null>(null)

  useEffect(() => {
    if (workspaceClaudeStatus === 'ask' || workspaceClaudeStatus === 'waiting' || workspaceClaudeStatus === 'failed') {
      window.kanbai.kanban.getWorkingTicket(workspace.id).then((result) => {
        setWorkingTicketInfo(result ? { ticketNumber: result.ticketNumber, isCtoTicket: result.isCtoTicket, type: result.type } : null)
      }).catch(() => setWorkingTicketInfo(null))
    } else {
      setWorkingTicketInfo(null)
    }
  }, [workspace.id, workspaceClaudeStatus])

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleClick = useCallback(() => {
    setActiveWorkspace(workspace.id)
  }, [workspace.id, setActiveWorkspace])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleStartRename = useCallback(() => {
    setIsRenaming(true)
    setRenameValue(workspace.name)
  }, [workspace.name])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== workspace.name) {
      updateWorkspace(workspace.id, { name: trimmed })
    }
    setIsRenaming(false)
  }, [renameValue, workspace.id, workspace.name, updateWorkspace])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameSubmit()
      } else if (e.key === 'Escape') {
        setIsRenaming(false)
      }
    },
    [handleRenameSubmit],
  )

  const handleAddProject = useCallback(() => {
    addProject(workspace.id)
  }, [workspace.id, addProject])

  const handleCreateProject = useCallback(async () => {
    const name = createProjectName.trim()
    if (!name) return
    setCreateError(null)

    // Pick parent directory
    const parentDir = await window.kanbai.project.selectDir()
    if (!parentDir) return

    const projectPath = parentDir + '/' + name
    // Check if directory already exists
    const exists = await window.kanbai.fs.exists(projectPath)
    if (exists) {
      setCreateError(t('workspace.folderExists'))
      return
    }

    // Create directory
    await window.kanbai.fs.mkdir(projectPath)

    // Add as project
    const project = await window.kanbai.project.add({
      workspaceId: workspace.id,
      path: projectPath,
    })

    if (project) {
      const { projects: allProjects, workspaces } = useWorkspaceStore.getState()
      useWorkspaceStore.setState({
        projects: [...allProjects, project],
        activeProjectId: project.id,
        workspaces: workspaces.map((w) =>
          w.id === workspace.id ? { ...w, projectIds: [...w.projectIds, project.id] } : w,
        ),
      })
      await useWorkspaceStore.getState().setupWorkspaceEnv(workspace.id)
    }

    setShowCreateModal(false)
    setCreateProjectName('')
  }, [createProjectName, workspace.id, t])

  // Focus create input when modal opens
  useEffect(() => {
    if (showCreateModal && createInputRef.current) {
      createInputRef.current.focus()
    }
  }, [showCreateModal])

  const handleExportWorkspace = useCallback(async () => {
    await window.kanbai.workspace.export(workspace.id)
  }, [workspace.id])

  const handleImportWorkspace = useCallback(async () => {
    const result = await window.kanbai.workspace.import()
    if (result.success) {
      // Reload workspaces to pick up the imported one
      const { loadWorkspaces } = useWorkspaceStore.getState()
      await loadWorkspaces()
    }
  }, [])

  const handleColorChange = useCallback(
    (color: string) => {
      updateWorkspace(workspace.id, { color })
      setShowColorPicker(false)
    },
    [workspace.id, updateWorkspace],
  )

  const handleIconChange = useCallback(
    (icon: string) => {
      updateWorkspace(workspace.id, { icon })
      setShowIconPicker(false)
    },
    [workspace.id, updateWorkspace],
  )

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/kanbai-project')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const projectId = e.dataTransfer.getData('application/kanbai-project')
      if (projectId) {
        moveProject(projectId, workspace.id)
      }
    },
    [workspace.id, moveProject],
  )

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  const { setViewMode, setPendingDbProjectPath } = useViewStore()

  // DB context menu state
  const [dbContextMenu, setDbContextMenu] = useState<{ x: number; y: number; connId: string } | null>(null)

  const handleAddDbConnection = useCallback(() => {
    // Activate this workspace first so the modal targets the right workspace
    setActiveWorkspace(workspace.id)
    setPendingDbProjectPath(workspace.id)
    setViewMode('database')
  }, [workspace.id, setActiveWorkspace, setPendingDbProjectPath, setViewMode])

  const moveToNamespaceChildren: ContextMenuItem[] = namespaces
    .filter((ns) => ns.id !== workspace.namespaceId)
    .map((ns) => ({
      label: ns.name,
      action: () => updateWorkspace(workspace.id, { namespaceId: ns.id }),
    }))

  const contextMenuItems: ContextMenuItem[] = [
    { label: t('workspace.rename'), action: handleStartRename },
    { label: t('workspace.changeColor'), action: () => { setShowColorPicker(true); setShowIconPicker(false) } },
    { label: t('workspace.changeIcon'), action: () => { setShowIconPicker(true); setShowColorPicker(false) } },
    { separator: true, label: '', action: () => {} },
    { label: t('workspace.addExistingProject'), action: handleAddProject },
    { label: t('workspace.createNewProject'), action: () => { setCreateProjectName(''); setCreateError(null); setShowCreateModal(true) } },
    { label: t('workspace.addDbConnection'), action: handleAddDbConnection },
    { separator: true, label: '', action: () => {} },
    ...(moveToNamespaceChildren.length > 0
      ? [{ label: t('workspace.moveToNamespace'), action: () => {}, children: moveToNamespaceChildren }]
      : []),
    { label: t('workspace.refresh'), action: () => refreshWorkspace(workspace.id) },
    { separator: true, label: '', action: () => {} },
    { label: t('workspace.export'), action: handleExportWorkspace },
    { label: t('workspace.import'), action: handleImportWorkspace },
    { separator: true, label: '', action: () => {} },
    { label: t('workspace.delete'), action: () => deleteWorkspace(workspace.id), danger: true },
  ]

  return (
    <div
      className={`workspace-item${isActive ? ' workspace-item--active' : ''}${isDragOver ? ' workspace-item--dragover' : ''}${isFlashing ? ' workspace-item--flashing' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="workspace-item-header" onClick={handleClick} onDoubleClick={handleStartRename} onContextMenu={handleContextMenu}>
        <button
          className={`workspace-item-chevron${expanded ? ' workspace-item-chevron--expanded' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            handleToggle()
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {workspace.icon ? (
          <span className="workspace-item-icon-badge" style={{ color: workspace.color }}>
            {workspace.icon}
          </span>
        ) : (
          <span
            className="workspace-item-color-badge"
            style={{ backgroundColor: workspace.color }}
          >
            {workspace.name.charAt(0).toUpperCase()}
          </span>
        )}

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="workspace-item-rename"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="workspace-item-name">{workspace.name}</span>
        )}

        {/* Native kanban-based Working tag (independent of AI hooks) */}
        {workingTickets.length === 1 && workingTickets[0] && (() => {
          const ticket = workingTickets[0]
          const prefix = ({'bug':'B','feature':'F','test':'T','doc':'D','ia':'A','refactor':'R'}[ticket.type ?? 'feature'] ?? 'F')
          return (
            <>
              <span className={`workspace-ia-tag workspace-ia-tag--working${ticket.isCtoTicket ? ' workspace-ia-tag--cto' : ''}`}>
                {ticket.isCtoTicket ? t('workspace.ctoMode') : t('workspace.aiWorking')}
              </span>
              {ticket.ticketNumber != null && (
                <span className="workspace-ia-tag workspace-ia-tag--ticket">
                  {prefix}-{String(ticket.ticketNumber).padStart(2, '0')}
                </span>
              )}
            </>
          )
        })()}
        {workingTickets.length > 1 && (
          <span
            className="workspace-ia-tag workspace-ia-tag--working workspace-ia-tag--multi"
            onMouseEnter={() => setShowWorkingTooltip(true)}
            onMouseLeave={() => setShowWorkingTooltip(false)}
          >
            {t('workspace.aiWorking')} {workingTickets.length}T
            {showWorkingTooltip && (
              <span className="workspace-working-tooltip">
                {workingTickets.map((ticket, index) => {
                  const prefix = ({'bug':'B','feature':'F','test':'T','doc':'D','ia':'A','refactor':'R'}[ticket.type ?? 'feature'] ?? 'F')
                  const label = ticket.ticketNumber != null
                    ? `${prefix}-${String(ticket.ticketNumber).padStart(2, '0')}`
                    : ticket.title
                  return <span key={index} className="workspace-working-tooltip-item">{label}</span>
                })}
              </span>
            )}
          </span>
        )}

        {/* Hook-based AI statuses (ask, waiting, failed, finished) */}
        {workspaceClaudeStatus === 'ask' && (
          <>
            <span className="workspace-ia-tag workspace-ia-tag--ask">{t('workspace.aiAsk')}</span>
            {workingTicketInfo?.ticketNumber != null && (
              <span className="workspace-ia-tag workspace-ia-tag--ticket">{({'bug':'B','feature':'F','test':'T','doc':'D','ia':'A','refactor':'R'}[workingTicketInfo.type ?? 'feature'] ?? 'F')}-{String(workingTicketInfo.ticketNumber).padStart(2, '0')}</span>
            )}
          </>
        )}
        {workspaceClaudeStatus === 'waiting' && (
          <>
            <span className="workspace-ia-tag workspace-ia-tag--waiting">{t('workspace.aiWaiting')}</span>
            {workingTicketInfo?.ticketNumber != null && (
              <span className="workspace-ia-tag workspace-ia-tag--ticket">{({'bug':'B','feature':'F','test':'T','doc':'D','ia':'A','refactor':'R'}[workingTicketInfo.type ?? 'feature'] ?? 'F')}-{String(workingTicketInfo.ticketNumber).padStart(2, '0')}</span>
            )}
          </>
        )}
        {workspaceClaudeStatus === 'failed' && workingTickets.length === 0 && (
          <>
            <span className="workspace-ia-tag workspace-ia-tag--failed">{t('workspace.aiFailed')}</span>
            {workingTicketInfo?.ticketNumber != null && (
              <span className="workspace-ia-tag workspace-ia-tag--ticket">{({'bug':'B','feature':'F','test':'T','doc':'D','ia':'A','refactor':'R'}[workingTicketInfo.type ?? 'feature'] ?? 'F')}-{String(workingTicketInfo.ticketNumber).padStart(2, '0')}</span>
            )}
          </>
        )}
        {workspaceClaudeStatus === 'finished' && workingTickets.length === 0 && (
          <span className="workspace-ia-tag workspace-ia-tag--finished">{t('workspace.aiFinish')}</span>
        )}

      </div>

      {showColorPicker && (
        <div className="workspace-picker">
          {WORKSPACE_COLORS.map((color) => (
            <button
              key={color}
              className={`workspace-color-swatch${color === workspace.color ? ' workspace-color-swatch--active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => handleColorChange(color)}
            />
          ))}
        </div>
      )}

      {showIconPicker && (
        <div className="workspace-picker">
          <button
            className={`workspace-icon-swatch${!workspace.icon ? ' workspace-icon-swatch--active' : ''}`}
            onClick={() => handleIconChange('')}
            title={t('workspace.noIcon')}
          >
            <span className="workspace-item-color" style={{ backgroundColor: workspace.color, width: 10, height: 10 }} />
          </button>
          {WORKSPACE_ICON_KEYS.map(({ icon, key }) => (
            <button
              key={icon}
              className={`workspace-icon-swatch${workspace.icon === icon ? ' workspace-icon-swatch--active' : ''}`}
              onClick={() => handleIconChange(icon)}
              title={t(key)}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      <div
        className={`workspace-item-projects${expanded ? ' workspace-item-projects--expanded' : ''}`}
      >
        {projects.length === 0 && wsConnections.length === 0 ? (
          <div className="workspace-item-empty">
            <button className="workspace-item-empty-btn" onClick={handleAddProject}>
              {t('workspace.addExisting')}
            </button>
            <button className="workspace-item-empty-btn" onClick={() => { setCreateProjectName(''); setCreateError(null); setShowCreateModal(true) }}>
              {t('workspace.createNewShort')}
            </button>
          </div>
        ) : (
          <>
            {projects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={activeProjectId === project.id}
              />
            ))}
            {wsConnections.map((conn) => {
              const status = connectionStatuses[conn.id] ?? 'disconnected'
              const tagColor = conn.environmentTag === 'custom'
                ? 'var(--text-muted)'
                : ENV_TAG_COLORS[conn.environmentTag]
              const tagLabel = conn.environmentTag === 'custom'
                ? (conn.customTagName ?? 'custom')
                : conn.environmentTag

              return (
                <div
                  key={conn.id}
                  className="workspace-db-item"
                  onClick={() => {
                    setActiveWorkspace(workspace.id)
                    setActiveConnection(conn.id)
                    useViewStore.getState().setViewMode('database')
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDbContextMenu({ x: e.clientX, y: e.clientY, connId: conn.id })
                  }}
                  title={`${conn.engine} — ${conn.name} (${tagLabel})`}
                >
                  <span className={`db-status-dot db-status-dot--sidebar db-status-dot--${status}`} />
                  <span className="workspace-db-engine">{ENGINE_ICONS[conn.engine] ?? conn.engine.slice(0, 2).toUpperCase()}</span>
                  <span className="workspace-db-name">{conn.name}</span>
                  <span
                    className="workspace-db-tag"
                    style={{ background: tagColor, color: '#0E0D0B' }}
                  >
                    {tagLabel}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{t('workspace.createProjectTitle')}</div>
            <div className="modal-body">
              <p style={{ marginBottom: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                {t('workspace.chooseNameSelectParent')}
              </p>
              <input
                ref={createInputRef}
                className="workspace-create-project-input"
                type="text"
                placeholder={t('sidebar.projectNamePlaceholder')}
                value={createProjectName}
                onChange={(e) => { setCreateProjectName(e.target.value); setCreateError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && createProjectName.trim()) handleCreateProject(); if (e.key === 'Escape') setShowCreateModal(false) }}
              />
              {createError && <div className="workspace-create-project-error">{createError}</div>}
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn--secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="modal-btn modal-btn--primary"
                onClick={handleCreateProject}
                disabled={!createProjectName.trim()}
              >
                {t('sidebar.chooseLocationAndCreate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {dbContextMenu && (() => {
        const conn = wsConnections.find((c) => c.id === dbContextMenu.connId)
        if (!conn) return null
        const status = connectionStatuses[conn.id] ?? 'disconnected'
        const isConnected = status === 'connected'

        const dbMenuItems: ContextMenuItem[] = [
          ...(isConnected
            ? [{ label: t('db.disconnect'), action: () => disconnectDb(conn.id) }]
            : [{ label: t('db.connect'), action: () => connectDb(conn.id) }]
          ),
          { separator: true, label: '', action: () => {} },
          {
            label: t('db.editConnection'),
            action: () => {
              setActiveWorkspace(workspace.id)
              setActiveConnection(conn.id)
              setPendingDbProjectPath(null)
              useViewStore.getState().setViewMode('database')
              // Signal edit via a small delay so the explorer is mounted
              setTimeout(() => {
                useDatabaseStore.getState().setActiveConnection(conn.id)
                // The DatabaseExplorer's sidebar has an edit button; for now, navigate there
              }, 50)
            },
          },
          { separator: true, label: '', action: () => {} },
          {
            label: t('db.deleteConnection'),
            action: () => deleteDbConnection(conn.id),
            danger: true,
          },
        ]

        return (
          <ContextMenu
            x={dbContextMenu.x}
            y={dbContextMenu.y}
            items={dbMenuItems}
            onClose={() => setDbContextMenu(null)}
          />
        )
      })()}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  )
}
