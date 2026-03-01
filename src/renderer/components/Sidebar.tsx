import { useCallback, useEffect, useState, useRef } from 'react'
import { useWorkspaceStore, useFilteredWorkspaces } from '../lib/stores/workspaceStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import { WorkspaceItem } from './WorkspaceItem'
import type { Workspace } from '../../shared/types/index'

export function Sidebar() {
  const { t } = useI18n()
  const { projects, activeWorkspaceId, namespaces, activeNamespaceId, setActiveNamespace, createNamespace, updateNamespace, deleteNamespace, init, createWorkspaceFromPath, createWorkspaceFromNew, createWorkspaceFromNewInDir, checkDeletedWorkspace, restoreWorkspace, navigateWorkspace } =
    useWorkspaceStore()
  const workspaces = useFilteredWorkspaces()

  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const createMenuRef = useRef<HTMLDivElement>(null)
  const newProjectInputRef = useRef<HTMLInputElement>(null)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [deletedWorkspace, setDeletedWorkspace] = useState<Workspace | null>(null)
  const [pendingCreateAction, setPendingCreateAction] = useState<(() => Promise<void>) | null>(null)

  // Namespace dropdown state
  const [showNamespaceDropdown, setShowNamespaceDropdown] = useState(false)
  const [showNamespaceCreate, setShowNamespaceCreate] = useState(false)
  const [newNamespaceName, setNewNamespaceName] = useState('')
  const [renamingNamespaceId, setRenamingNamespaceId] = useState<string | null>(null)
  const [renameNamespaceValue, setRenameNamespaceValue] = useState('')
  const namespaceDropdownRef = useRef<HTMLDivElement>(null)
  const namespaceInputRef = useRef<HTMLInputElement>(null)
  const renameNamespaceInputRef = useRef<HTMLInputElement>(null)

  // Declare callbacks before useEffect hooks that reference them

  const handleCreateFromFolder = useCallback(async () => {
    // Select directory first to know the workspace name
    const dirPath = await window.mirehub.project.selectDir()
    if (!dirPath) return

    const folderName = dirPath.split(/[\\/]/).pop() || dirPath
    const deleted = await checkDeletedWorkspace(folderName)
    if (deleted) {
      setDeletedWorkspace(deleted)
      setPendingCreateAction(() => async () => {
        await createWorkspaceFromPath(dirPath)
      })
      setShowRestoreModal(true)
      return
    }
    await createWorkspaceFromPath(dirPath)
  }, [createWorkspaceFromPath, checkDeletedWorkspace])

  const handleCreateFromNew = useCallback(async () => {
    const name = newProjectName.trim()
    if (!name) return

    const deleted = await checkDeletedWorkspace(name)
    if (deleted) {
      setDeletedWorkspace(deleted)
      setPendingCreateAction(() => async () => {
        const parentDir = await window.mirehub.project.selectDir()
        if (!parentDir) return
        await createWorkspaceFromNewInDir(name, parentDir)
        setShowNewProjectModal(false)
        setNewProjectName('')
      })
      setShowRestoreModal(true)
      return
    }

    await createWorkspaceFromNew(name)
    setShowNewProjectModal(false)
    setNewProjectName('')
  }, [newProjectName, createWorkspaceFromNew, createWorkspaceFromNewInDir, checkDeletedWorkspace])

  const handleRestore = useCallback(async () => {
    if (!deletedWorkspace) return
    await restoreWorkspace(deletedWorkspace.id)
    setShowRestoreModal(false)
    setDeletedWorkspace(null)
    setPendingCreateAction(null)
    setShowNewProjectModal(false)
    setNewProjectName('')
  }, [deletedWorkspace, restoreWorkspace])

  const handleStartFresh = useCallback(async () => {
    if (!deletedWorkspace) return
    // Permanently delete the old workspace and env directory, then proceed with creation
    await window.mirehub.workspace.permanentDelete(deletedWorkspace.id)
    setShowRestoreModal(false)
    setDeletedWorkspace(null)
    if (pendingCreateAction) {
      await pendingCreateAction()
    }
    setPendingCreateAction(null)
  }, [deletedWorkspace, pendingCreateAction])

  useEffect(() => {
    init()
  }, [init])

  // Keyboard shortcuts: Cmd+Shift+[ / Cmd+Shift+] to navigate workspaces
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey) {
        if (e.key === '[') {
          e.preventDefault()
          navigateWorkspace('prev')
        } else if (e.key === ']') {
          e.preventDefault()
          navigateWorkspace('next')
        }
      }
      // Cmd+Shift+N for new workspace
      if (e.metaKey && e.shiftKey && e.key === 'n') {
        e.preventDefault()
        handleCreateFromFolder()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateWorkspace, handleCreateFromFolder])

  // Listen for menu actions from macOS app menu
  useEffect(() => {
    const handleMenuAction = (e: Event) => {
      const action = (e as CustomEvent).detail
      if (action === 'workspace:new') {
        setShowCreateMenu(true)
      } else if (action === 'workspace:newFromFolder') {
        handleCreateFromFolder()
      } else if (action === 'workspace:import') {
        window.mirehub.workspace.import().then((result) => {
          if (result.success) init()
        })
      } else if (action === 'workspace:export') {
        const ws = useWorkspaceStore.getState()
        if (ws.activeWorkspaceId) {
          window.mirehub.workspace.export(ws.activeWorkspaceId)
        }
      }
    }
    window.addEventListener('mirehub:menu-action', handleMenuAction)
    return () => window.removeEventListener('mirehub:menu-action', handleMenuAction)
  }, [handleCreateFromFolder, init])

  // Close create menu on click outside
  useEffect(() => {
    if (!showCreateMenu) return
    const handler = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCreateMenu])

  // Focus new project input when modal opens
  useEffect(() => {
    if (showNewProjectModal && newProjectInputRef.current) {
      newProjectInputRef.current.focus()
    }
  }, [showNewProjectModal])

  // Close namespace dropdown on click outside
  useEffect(() => {
    if (!showNamespaceDropdown) return
    const handler = (e: MouseEvent) => {
      if (namespaceDropdownRef.current && !namespaceDropdownRef.current.contains(e.target as Node)) {
        setShowNamespaceDropdown(false)
        setShowNamespaceCreate(false)
        setNewNamespaceName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNamespaceDropdown])

  // Focus namespace input when create mode opens
  useEffect(() => {
    if (showNamespaceCreate && namespaceInputRef.current) {
      namespaceInputRef.current.focus()
    }
  }, [showNamespaceCreate])

  // Focus namespace rename input
  useEffect(() => {
    if (renamingNamespaceId && renameNamespaceInputRef.current) {
      renameNamespaceInputRef.current.focus()
      renameNamespaceInputRef.current.select()
    }
  }, [renamingNamespaceId])

  const handleCreateNamespace = useCallback(async () => {
    const name = newNamespaceName.trim()
    if (!name) return
    const ns = await createNamespace(name)
    if (ns) {
      setActiveNamespace(ns.id)
    }
    setNewNamespaceName('')
    setShowNamespaceCreate(false)
    setShowNamespaceDropdown(false)
  }, [newNamespaceName, createNamespace, setActiveNamespace])

  const handleStartRenameNamespace = useCallback((id: string, currentName: string) => {
    setRenamingNamespaceId(id)
    setRenameNamespaceValue(currentName)
  }, [])

  const handleRenameNamespaceSubmit = useCallback(async () => {
    const trimmed = renameNamespaceValue.trim()
    if (renamingNamespaceId && trimmed && trimmed !== namespaces.find((n) => n.id === renamingNamespaceId)?.name) {
      await updateNamespace(renamingNamespaceId, { name: trimmed })
    }
    setRenamingNamespaceId(null)
  }, [renamingNamespaceId, renameNamespaceValue, namespaces, updateNamespace])

  const handleDeleteNamespace = useCallback(async (id: string, name: string) => {
    if (!confirm(t('namespace.deleteConfirm', { name }))) return
    await deleteNamespace(id)
    setShowNamespaceDropdown(false)
  }, [deleteNamespace, t])

  const activeNamespace = namespaces.find((n) => n.id === activeNamespaceId)

  const getProjectsForWorkspace = useCallback(
    (workspaceId: string) => {
      return projects.filter((p) => p.workspaceId === workspaceId)
    },
    [projects],
  )

  const { recentFiles, bookmarks, openFile } = useViewStore()
  const [showRecent, setShowRecent] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div ref={namespaceDropdownRef} style={{ position: 'relative' }}>
          <button
            className="sidebar-namespace-trigger"
            onClick={() => setShowNamespaceDropdown((v) => !v)}
          >
            {activeNamespace?.name ?? t('sidebar.title')}
            <span className={`namespace-chevron${showNamespaceDropdown ? ' namespace-chevron--open' : ''}`}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          {showNamespaceDropdown && (
            <div className="namespace-dropdown">
              {namespaces.map((ns) => (
                <div
                  key={ns.id}
                  className={`namespace-dropdown-item${ns.id === activeNamespaceId ? ' namespace-dropdown-item--active' : ''}`}
                >
                  {renamingNamespaceId === ns.id ? (
                    <input
                      ref={renameNamespaceInputRef}
                      className="namespace-rename-input"
                      value={renameNamespaceValue}
                      onChange={(e) => setRenameNamespaceValue(e.target.value)}
                      onBlur={handleRenameNamespaceSubmit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameNamespaceSubmit()
                        if (e.key === 'Escape') setRenamingNamespaceId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <button
                        style={{ display: 'contents' }}
                        onClick={() => {
                          setActiveNamespace(ns.id)
                          setShowNamespaceDropdown(false)
                        }}
                      >
                        <span className="namespace-item-name">{ns.name}</span>
                      </button>
                      {!ns.isDefault && (
                        <>
                          <button
                            className="namespace-rename-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartRenameNamespace(ns.id, ns.name)
                            }}
                            title={t('namespace.rename')}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M7 1L9 3M0.5 9.5L1 7L7.5 0.5C7.8 0.2 8.3 0.2 8.6 0.5L9.5 1.4C9.8 1.7 9.8 2.2 9.5 2.5L3 9L0.5 9.5Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            className="namespace-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteNamespace(ns.id, ns.name)
                            }}
                            title={t('common.delete')}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
              <div className="namespace-dropdown-separator" />
              {showNamespaceCreate ? (
                <div className="namespace-create-inline">
                  <input
                    ref={namespaceInputRef}
                    type="text"
                    placeholder={t('namespace.namePlaceholder')}
                    value={newNamespaceName}
                    onChange={(e) => setNewNamespaceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNamespace()
                      if (e.key === 'Escape') {
                        setShowNamespaceCreate(false)
                        setNewNamespaceName('')
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  className="namespace-dropdown-item"
                  onClick={() => setShowNamespaceCreate(true)}
                >
                  {t('namespace.create')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="sidebar-create-wrapper" ref={createMenuRef}>
          <button
            className="btn-icon"
            title={t('sidebar.newWorkspace')}
            onClick={() => setShowCreateMenu((prev) => !prev)}
          >
            +
          </button>
          {showCreateMenu && (
            <div className="workspace-add-menu">
              <button
                className="workspace-add-menu-item"
                onClick={() => {
                  setShowCreateMenu(false)
                  handleCreateFromFolder()
                }}
              >
                {t('sidebar.fromExisting')}
              </button>
              <button
                className="workspace-add-menu-item"
                onClick={() => {
                  setShowCreateMenu(false)
                  setNewProjectName('')
                  setShowNewProjectModal(true)
                }}
              >
                {t('sidebar.createNew')}
              </button>
            </div>
          )}
        </div>
      </div>

      {showNewProjectModal && (
        <div className="modal-overlay" onClick={() => setShowNewProjectModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{t('sidebar.newWorkspaceProject')}</div>
            <div className="modal-body">
              <p style={{ marginBottom: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                {t('sidebar.chooseNameThenFolder')}
              </p>
              <input
                ref={newProjectInputRef}
                className="workspace-create-project-input"
                type="text"
                placeholder={t('sidebar.projectNamePlaceholder')}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newProjectName.trim()) handleCreateFromNew()
                  if (e.key === 'Escape') setShowNewProjectModal(false)
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn--secondary" onClick={() => setShowNewProjectModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="modal-btn modal-btn--primary"
                onClick={handleCreateFromNew}
                disabled={!newProjectName.trim()}
              >
                {t('sidebar.chooseLocationAndCreate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRestoreModal && deletedWorkspace && (
        <div className="modal-overlay" onClick={() => { setShowRestoreModal(false); setDeletedWorkspace(null); setPendingCreateAction(null) }}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{t('workspace.restoreTitle')}</div>
            <div className="modal-body">
              <p>{t('workspace.restoreMessage', { name: deletedWorkspace.name })}</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn--secondary" onClick={() => { setShowRestoreModal(false); setDeletedWorkspace(null); setPendingCreateAction(null) }}>
                {t('common.cancel')}
              </button>
              <button className="modal-btn modal-btn--danger" onClick={handleStartFresh}>
                {t('workspace.startFresh')}
              </button>
              <button className="modal-btn modal-btn--primary" onClick={handleRestore}>
                {t('workspace.restoreBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {workspaces.length === 0 ? (
        <div className="sidebar-content">
          <p className="sidebar-empty">{t('sidebar.empty')}</p>
        </div>
      ) : (
        <div className="sidebar-workspaces">
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              projects={getProjectsForWorkspace(workspace.id)}
              isActive={activeWorkspaceId === workspace.id}
            />
          ))}
        </div>
      )}

      {/* Bookmarks section */}
      {bookmarks.length > 0 && (
        <div className="sidebar-section">
          <button className="sidebar-section-header" onClick={() => setShowBookmarks((v) => !v)}>
            <span className={`sidebar-section-chevron${showBookmarks ? ' sidebar-section-chevron--expanded' : ''}`}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M2.5 1L5.5 4L2.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="sidebar-section-title">{'\u2605'} {t('sidebar.favorites', { count: String(bookmarks.length) })}</span>
          </button>
          {showBookmarks && (
            <div className="sidebar-file-list">
              {bookmarks.map((filePath) => (
                <button
                  key={filePath}
                  className="sidebar-file-item"
                  onClick={() => openFile(filePath)}
                  title={filePath}
                >
                  {filePath.split(/[\\/]/).pop()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent files section */}
      {recentFiles.length > 0 && (
        <div className="sidebar-section">
          <button className="sidebar-section-header" onClick={() => setShowRecent((v) => !v)}>
            <span className={`sidebar-section-chevron${showRecent ? ' sidebar-section-chevron--expanded' : ''}`}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M2.5 1L5.5 4L2.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="sidebar-section-title">{t('sidebar.recentFiles', { count: String(recentFiles.length) })}</span>
          </button>
          {showRecent && (
            <div className="sidebar-file-list">
              {recentFiles.slice(0, 10).map((filePath) => (
                <button
                  key={filePath}
                  className="sidebar-file-item"
                  onClick={() => openFile(filePath)}
                  title={filePath}
                >
                  {filePath.split(/[\\/]/).pop()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
