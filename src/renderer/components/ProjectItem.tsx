import React, { useCallback, useEffect, useState } from 'react'
import type { Project } from '../../shared/types/index'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useTerminalTabStore } from '../lib/stores/terminalTabStore'
import { useI18n } from '../lib/i18n'
import { ContextMenu, ContextMenuItem } from './ContextMenu'
import { useViewStore } from '../lib/stores/viewStore'
import { ClaudeInfoPanel } from './ClaudeInfoPanel'
import { ConfirmModal } from './ConfirmModal'
import { SidebarFileTree } from './SidebarFileTree'

interface ProjectItemProps {
  project: Project
  isActive: boolean
}

export function ProjectItem({ project, isActive }: ProjectItemProps) {
  const { t } = useI18n()
  const { setActiveProject, removeProject, rescanClaude, clearPendingClaudeImport } = useWorkspaceStore()
  const pendingClaudeImport = useWorkspaceStore((s) => s.pendingClaudeImport)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showClaudeInfo, setShowClaudeInfo] = useState(false)
  const [showDeployConfirm, setShowDeployConfirm] = useState(false)
  const [expanded, setExpanded] = useState(isActive)
  const [showImportClaude, setShowImportClaude] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesLoaded, setNotesLoaded] = useState(false)

  useEffect(() => {
    if (isActive) {
      setExpanded(true)
    }
  }, [isActive])

  useEffect(() => {
    if (pendingClaudeImport === project.id) {
      setShowImportClaude(true)
      clearPendingClaudeImport()
    }
  }, [pendingClaudeImport, project.id, clearPendingClaudeImport])

  const handleClick = useCallback(() => {
    if (isActive) {
      setExpanded((prev) => !prev)
    } else {
      const { activeWorkspaceId } = useWorkspaceStore.getState()
      const isCrossWorkspace = project.workspaceId !== activeWorkspaceId
      setActiveProject(project.id)
      setExpanded(true)
      if (isCrossWorkspace) {
        useViewStore.getState().setViewMode('terminal')
      }
    }
  }, [isActive, project.id, project.workspaceId, setActiveProject])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/mirehub-project', project.id)
      e.dataTransfer.effectAllowed = 'move'
    },
    [project.id],
  )

  const handleClaudeBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowClaudeInfo((prev) => !prev)
  }, [])

  const launchClaudeInit = useCallback((projectPath: string) => {
    const { activeWorkspaceId } = useWorkspaceStore.getState()
    if (!activeWorkspaceId) return
    const termStore = useTerminalTabStore.getState()
    const initCommand = `unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT && claude --dangerously-skip-permissions -p "Lis et execute les instructions du fichier .claude/.init-prompt.md puis supprime ce fichier."`
    const tabId = termStore.createTab(activeWorkspaceId, projectPath, `[Init] ${project.name}`, initCommand)
    if (tabId) {
      termStore.setTabColor(tabId, '#89b4fa')
      useViewStore.getState().setViewMode('terminal')
    }
  }, [project.name])

  const handleDeployClaude = useCallback(async () => {
    const hasExisting = await window.mirehub.project.checkClaude(project.path)
    if (hasExisting) {
      setShowDeployConfirm(true)
    } else {
      const result = await window.mirehub.project.deployClaude(project.path, false)
      if (result.success) {
        rescanClaude(project.id)
        launchClaudeInit(project.path)
      }
    }
  }, [project.path, project.id, rescanClaude, launchClaudeInit])

  const handleImportClaude = useCallback(async () => {
    const result = await window.mirehub.project.deployClaude(project.path, false)
    setShowImportClaude(false)
    if (result.success) {
      rescanClaude(project.id)
      launchClaudeInit(project.path)
    }
  }, [project.path, project.id, rescanClaude, launchClaudeInit])

  const handleConfirmDeploy = useCallback(async () => {
    const result = await window.mirehub.project.deployClaude(project.path, true)
    setShowDeployConfirm(false)
    if (result.success) {
      rescanClaude(project.id)
      launchClaudeInit(project.path)
    }
  }, [project.path, project.id, rescanClaude, launchClaudeInit])

  const handleToggleNotes = useCallback(async () => {
    if (!showNotes && !notesLoaded) {
      try {
        const content = await window.mirehub.project.getNotes(project.id)
        setNotes(content)
        setNotesLoaded(true)
      } catch {
        // Ignore
      }
    }
    setShowNotes((prev) => !prev)
  }, [showNotes, notesLoaded, project.id])

  const handleNotesBlur = useCallback(async () => {
    await window.mirehub.project.saveNotes(project.id, notes)
  }, [project.id, notes])

  const handleCreateClaudeTerminal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const termStore = useTerminalTabStore.getState()
    termStore.createSplitTab(project.workspaceId, project.path, `Claude - ${project.path.split(/[\\/]/).pop() ?? project.name}`, 'claude', null)
    useViewStore.getState().setViewMode('terminal')
  }, [project.workspaceId, project.path, project.name])

  const folderName = project.path.split(/[\\/]/).pop() ?? project.name

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: t('project.deployClaude'),
      action: handleDeployClaude,
    },
    ...(project.hasClaude
      ? [
          {
            label: showClaudeInfo ? t('project.hideClaudeConfig') : t('project.showClaudeConfig'),
            action: () => setShowClaudeInfo((prev) => !prev),
          },
        ]
      : []),
    { separator: true, label: '', action: () => {} },
    {
      label: showNotes ? t('project.hideNotes') : t('project.showNotes'),
      action: handleToggleNotes,
    },
    {
      label: t('project.addDbConnection'),
      action: () => {
        const viewStore = useViewStore.getState()
        viewStore.setPendingDbProjectPath(project.workspaceId)
        viewStore.setViewMode('database')
      },
    },
    { separator: true, label: '', action: () => {} },
    {
      label: t('project.removeFromWorkspace'),
      action: () => removeProject(project.id),
      danger: true,
    },
  ]

  return (
    <div className="project-item-wrapper">
      <div
        className={`project-item${isActive ? ' project-item--active' : ''}${project.hasClaude ? ' project-item--claude' : ''}${project.hasGit ? ' project-item--git' : ''}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        title={project.path}
      >
        <span className={`project-item-chevron${expanded ? ' project-item-chevron--expanded' : ''}`}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M2.5 1L5.5 4L2.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="project-item-icon">
          {project.hasClaude ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z"
                stroke="var(--claude-color)"
                strokeWidth="1.2"
                fill="none"
              />
              <circle cx="8" cy="8" r="2" fill="var(--claude-color)" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4a2 2 0 012-2h3l1 1.5h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V4z"
                stroke="var(--text-muted)"
                strokeWidth="1.2"
                fill="none"
              />
            </svg>
          )}
        </span>
        <span className="project-item-name">{folderName}</span>
        <button
          className="project-item-claude-btn"
          onClick={handleCreateClaudeTerminal}
          title={t('project.openClaudeTerminal')}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 3l8 5-8 5V3z" fill="currentColor" />
          </svg>
        </button>
        {project.hasClaude && (
          <span
            className="project-item-claude-badge"
            onClick={handleClaudeBadgeClick}
            title={t('project.claudified')}
          >
            <span className="claude-dot" />
          </span>
        )}
        {!project.hasClaude && (
          <button
            className="project-item-deploy-btn"
            onClick={(e) => { e.stopPropagation(); handleDeployClaude() }}
            title={t('project.deployClaudeOnProject')}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z"
                stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {project.hasClaude && showClaudeInfo && (
        <ClaudeInfoPanel
          projectPath={project.path}
          onClose={() => setShowClaudeInfo(false)}
        />
      )}

      {expanded && (
        <div className="project-item-filetree">
          <SidebarFileTree projectPath={project.path} />
        </div>
      )}

      {showNotes && (
        <div className="project-notes">
          <div className="project-notes-header">
            <span>{t('project.notesTitle', { name: folderName })}</span>
            <button className="btn-icon" onClick={() => setShowNotes(false)}>&times;</button>
          </div>
          <textarea
            className="project-notes-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder={t('project.notesPlaceholder')}
            rows={6}
          />
        </div>
      )}

      {showDeployConfirm && (
        <ConfirmModal
          title={t('project.deployClaude')}
          message={t('project.deployClaudeReplace')}
          confirmLabel={t('project.replace')}
          onConfirm={handleConfirmDeploy}
          onCancel={() => setShowDeployConfirm(false)}
        />
      )}

      {showImportClaude && (
        <ConfirmModal
          title={t('project.importClaude')}
          message={t('project.noClaudeConfig', { name: project.name })}
          confirmLabel={t('project.deploy')}
          onConfirm={handleImportClaude}
          onCancel={() => setShowImportClaude(false)}
        />
      )}

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
