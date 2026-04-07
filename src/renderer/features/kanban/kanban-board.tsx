import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useKanbanStore } from './kanban-store'
import { useTerminalTabStore } from '../terminal'
import { useViewStore } from '../../lib/stores/viewStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useI18n } from '../../lib/i18n'
import { ContextMenu } from '../../shared/ui/context-menu'
import type { ContextMenuItem } from '../../shared/ui/context-menu'
import type { KanbanStatus, KanbanTask, KanbanTaskType, KanbanConfig } from '../../../shared/types/index'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import { resolveFeatureProvider } from '../../../shared/utils/ai-provider-resolver'
import {
  COLUMNS,
  PRIORITIES,
  PREDEFINED_TASKS,
  getDismissedPredefined,
  dismissPredefined,
  buildDismissedKey,
  formatTicketNumber,
} from './kanban-constants'
import type { PendingClipboardImage, TemplateConditionResult, VisiblePredefinedEntry } from './kanban-constants'
import { TaskDetailPanel } from './task-detail-panel'
import { KanbanCreateModal } from './kanban-create-modal'
import { KanbanEditModal } from './kanban-edit-modal'
import { KanbanSettingsDrawer } from './kanban-settings-drawer'
import { KanbanColumns } from './kanban-columns'
import { KanbanHeader } from './kanban-header'
import './kanban.css'

export function KanbanBoard() {
  const { t } = useI18n()
  const { activeWorkspaceId, workspaces, projects } = useWorkspaceStore()
  const {
    tasks,
    loadTasks,
    syncTasksFromFile,
    createTask,
    updateTaskStatus,
    updateTask,
    deleteTask,
    duplicateTask,
    draggedTaskId,
    setDragged,
    sendToAi,
    attachFiles,
    attachFromClipboard,
    removeAttachment,
    kanbanTabIds,
    agentProgress,
  } = useKanbanStore()
  const terminalTabs = useTerminalTabStore((s) => s.tabs)
  const setActiveTerminalTab = useTerminalTabStore((s) => s.setActiveTab)
  const setViewMode = useViewStore((s) => s.setViewMode)
  const pendingKanbanTaskId = useViewStore((s) => s.pendingKanbanTaskId)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState<(typeof PRIORITIES)[number]>('medium')
  const [newType, setNewType] = useState<KanbanTaskType>('feature')
  const [newTargetProjectId, setNewTargetProjectId] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const [pendingClipboardImages, setPendingClipboardImages] = useState<PendingClipboardImage[]>([])
  const [newIsCtoMode, setNewIsCtoMode] = useState(false)
  const [newAiProvider, setNewAiProvider] = useState<AiProviderId | ''>('')
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)

  // Edit modal state
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPriority, setEditPriority] = useState<(typeof PRIORITIES)[number]>('medium')
  const [editType, setEditType] = useState<KanbanTaskType>('feature')
  const [editTargetProjectId, setEditTargetProjectId] = useState('')
  const [editAiProvider, setEditAiProvider] = useState<AiProviderId | ''>('')

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: KanbanTask } | null>(null)

  // Filter & search state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterScope, setFilterScope] = useState<string>('all')

  // Archive state
  const [archiveExpanded, setArchiveExpanded] = useState(false)

  // Kanban config state (per-workspace settings)
  const [showSettings, setShowSettings] = useState(false)
  const [kanbanConfig, setKanbanConfig] = useState<KanbanConfig | null>(null)

  // Predefined tasks state
  const [dismissedPredefined, setDismissedPredefined] = useState<string[]>([])
  const [conditionResults, setConditionResults] = useState<TemplateConditionResult[]>([])
  const [editingPredefinedId, setEditingPredefinedId] = useState<string | null>(null)

  const workspaceProjects = projects.filter((p) => p.workspaceId === activeWorkspaceId)

  // Load dismissed predefined tasks from localStorage
  useEffect(() => {
    if (activeWorkspaceId) {
      setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
    }
  }, [activeWorkspaceId])

  // Evaluate template conditions for project-scoped templates
  useEffect(() => {
    if (!activeWorkspaceId) return
    window.kanbai.kanban.evaluateTemplateConditions(activeWorkspaceId)
      .then(setConditionResults)
      .catch(() => setConditionResults([]))
  }, [activeWorkspaceId, workspaceProjects.length])

  // Listen for agent progress updates from main process
  useEffect(() => {
    const unsubscribe = window.kanbai.kanban.onTaskProgress((data) => {
      useKanbanStore.setState((s) => {
        if (!data.progress && !data.message) {
          const { [data.taskId]: _, ...rest } = s.agentProgress
          return { agentProgress: rest }
        }
        return {
          agentProgress: {
            ...s.agentProgress,
            [data.taskId]: { progress: data.progress, message: data.message, items: data.items },
          },
        }
      })
    })
    return () => { unsubscribe() }
  }, [])

  // Visible predefined tasks: condition-aware + project-scoped
  const visiblePredefined = useMemo((): VisiblePredefinedEntry[] => {
    if (!activeWorkspaceId) return []
    const entries: VisiblePredefinedEntry[] = []

    for (const template of PREDEFINED_TASKS) {
      if (template.projectScoped && template.condition) {
        // Project-scoped: one entry per matching project
        const matches = conditionResults.filter((cr) => cr.templateId === template.id)
        for (const match of matches) {
          const key = buildDismissedKey(template.id, match.projectId)
          if (!dismissedPredefined.includes(key)) {
            entries.push({
              template,
              projectId: match.projectId,
              projectName: match.projectName,
              projectPath: match.projectPath,
            })
          }
        }
      } else {
        // Workspace-scoped: single entry
        const key = buildDismissedKey(template.id)
        if (!dismissedPredefined.includes(key)) {
          entries.push({ template })
        }
      }
    }

    return entries
  }, [activeWorkspaceId, dismissedPredefined, conditionResults])

  const handleAddPredefined = useCallback(async (entry: VisiblePredefinedEntry) => {
    if (!activeWorkspaceId) return
    const { template, projectId, projectName, projectPath } = entry

    if (template.action && projectPath && projectId) {
      // Skip-AI template: create task as WORKING + disabled, execute action directly
      const titleWithProjectKey = `${template.titleKey}WithProject` as Parameters<typeof t>[0]
      const title = projectName ? t(titleWithProjectKey, { project: projectName }) : t(template.titleKey)
      const description = t(template.descriptionKey)

      const createResult = await window.kanbai.kanban.create({
        workspaceId: activeWorkspaceId,
        targetProjectId: projectId,
        title,
        description,
        status: 'WORKING' as KanbanStatus,
        priority: template.priority,
        type: template.type,
        disabled: true,
      })

      // Add to store immediately
      const newTasks = [createResult.task]
      if (createResult.memoryRefactorTask) newTasks.push(createResult.memoryRefactorTask)
      useKanbanStore.setState((state) => ({ tasks: [...state.tasks, ...newTasks] }))

      // Execute the action
      const result = await window.kanbai.kanban.executeTemplateAction(
        createResult.task.id, activeWorkspaceId, template.action, projectPath, projectId,
      )

      // Refresh tasks to pick up the status change made by the main process
      await loadTasks(activeWorkspaceId)

      // Re-evaluate conditions since the action may have changed project state
      window.kanbai.kanban.evaluateTemplateConditions(activeWorkspaceId)
        .then(setConditionResults)
        .catch(() => {})

      if (!result.success) {
        console.error('[kanban-board] Template action failed:', result.error)
      }
    } else {
      // Normal AI-driven template: create via store (triggers prequalify/auto-send)
      const titleWithProjectKey = `${template.titleKey}WithProject` as Parameters<typeof t>[0]
      const title = projectName ? t(titleWithProjectKey, { project: projectName }) : t(template.titleKey)
      await createTask(activeWorkspaceId, title, t(template.descriptionKey), template.priority, template.type, projectId || undefined)
    }

    // Dismiss this template entry
    const dismissKey = buildDismissedKey(template.id, projectId)
    dismissPredefined(activeWorkspaceId, dismissKey)
    setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
  }, [activeWorkspaceId, createTask, loadTasks, t])

  const handleDismissPredefined = useCallback((entry: VisiblePredefinedEntry) => {
    if (!activeWorkspaceId) return
    const dismissKey = buildDismissedKey(entry.template.id, entry.projectId)
    dismissPredefined(activeWorkspaceId, dismissKey)
    setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
  }, [activeWorkspaceId])

  const handleEditPredefined = useCallback((entry: VisiblePredefinedEntry) => {
    const { template, projectId, projectName } = entry
    const titleWithProjectKey = `${template.titleKey}WithProject` as Parameters<typeof t>[0]
    const title = projectName ? t(titleWithProjectKey, { project: projectName }) : t(template.titleKey)
    setNewTitle(title)
    setNewDesc(t(template.descriptionKey))
    setNewPriority(template.priority)
    setNewType(template.type)
    setNewTargetProjectId(projectId || '')
    setNewAiProvider('')
    setNewIsCtoMode(false)
    setEditingPredefinedId(buildDismissedKey(template.id, projectId))
    setShowCreateForm(true)
  }, [t])

  // Resolve the effective default AI provider for this workspace
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const workspaceDefaultAiProvider: AiProviderId = resolveFeatureProvider('kanban', workspaceProjects[0], activeWorkspace)

  useEffect(() => {
    if (activeWorkspaceId) {
      loadTasks(activeWorkspaceId)
      window.kanbai.kanban.getConfig(activeWorkspaceId).then(setKanbanConfig).catch(() => {})
    }
  }, [activeWorkspaceId, loadTasks])

  const updateKanbanConfig = useCallback(async (key: keyof KanbanConfig, value: boolean | number) => {
    if (!activeWorkspaceId || !kanbanConfig) return
    const updated = { ...kanbanConfig, [key]: value }
    setKanbanConfig(updated)
    try {
      await window.kanbai.kanban.setConfig(activeWorkspaceId, { [key]: value })
    } catch { /* best-effort */ }
  }, [activeWorkspaceId, kanbanConfig])

  // Consume pending kanban task selection (from terminal notch navigation)
  useEffect(() => {
    if (pendingKanbanTaskId && tasks.length > 0) {
      const task = tasks.find((t) => t.id === pendingKanbanTaskId)
      if (task) setSelectedTask(task)
      useViewStore.setState({ pendingKanbanTaskId: null })
    }
  }, [pendingKanbanTaskId, tasks])

  // File watcher: instant sync when kanban.json changes on disk
  useEffect(() => {
    if (!activeWorkspaceId) return
    window.kanbai.kanban.watch(activeWorkspaceId)
    const unsubscribe = window.kanbai.kanban.onFileChanged(({ workspaceId }) => {
      if (workspaceId === activeWorkspaceId) syncTasksFromFile()
    })
    const fallback = setInterval(() => syncTasksFromFile(), 30000)
    return () => {
      unsubscribe()
      clearInterval(fallback)
      window.kanbai.kanban.watchRemove(activeWorkspaceId)
    }
  }, [activeWorkspaceId, syncTasksFromFile])

  // Listen for prefill events from PromptTemplates
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { title: string; description: string }
      if (detail) {
        setNewTitle(detail.title)
        setNewDesc(detail.description)
        setShowCreateForm(true)
      }
    }
    window.addEventListener('kanban:prefill', handler)
    return () => window.removeEventListener('kanban:prefill', handler)
  }, [])

  // Sync selectedTask with store
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id)
      if (updated) setSelectedTask(updated)
      else setSelectedTask(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selectedTask?.id])

  // Sync editingTask with store
  useEffect(() => {
    if (editingTask) {
      const updated = tasks.find((t) => t.id === editingTask.id)
      if (!updated) setEditingTask(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, editingTask?.id])

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesTitle = (t.title ?? '').toLowerCase().includes(q)
        const matchesDescription = (t.description ?? '').toLowerCase().includes(q)
        const matchesTicketNumber =
          t.ticketNumber != null &&
          (String(t.ticketNumber).includes(q) ||
            formatTicketNumber(t.ticketNumber, t.type, t.isPrequalifying).toLowerCase().includes(q))
        if (!matchesTitle && !matchesDescription && !matchesTicketNumber) return false
      }
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (filterType !== 'all' && (t.type ?? 'feature') !== filterType) return false
      if (filterScope === 'workspace' && t.targetProjectId) return false
      if (filterScope !== 'all' && filterScope !== 'workspace' && t.targetProjectId !== filterScope) return false
      return true
    })
  }, [tasks, searchQuery, filterPriority, filterType, filterScope])

  const doneTasks = useMemo(() => filteredTasks.filter((t) => t.status === 'DONE'), [filteredTasks])
  const activeDoneTasks = useMemo(() => doneTasks.filter((t) => !t.archived), [doneTasks])
  const archivedTasks = useMemo(() => filteredTasks.filter((t) => t.archived), [filteredTasks])

  const sortTasks = useCallback(
    (taskList: KanbanTask[], newestFirst = false): KanbanTask[] => {
      return [...taskList].sort((a, b) => {
        const aOverdue = a.dueDate && a.dueDate < Date.now() ? 1 : 0
        const bOverdue = b.dueDate && b.dueDate < Date.now() ? 1 : 0
        if (aOverdue !== bOverdue) return bOverdue - aOverdue
        if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      })
    },
    [],
  )

  const handleCreate = useCallback(async () => {
    if (!activeWorkspaceId || !newTitle.trim()) return
    await createTask(activeWorkspaceId, newTitle.trim(), newDesc.trim(), newPriority, newType, newTargetProjectId || undefined, newIsCtoMode || undefined, newAiProvider || undefined)
    const createdTasks = useKanbanStore.getState().tasks
    const newest = createdTasks[createdTasks.length - 1]
    if (newest && pendingAttachments.length > 0) {
      for (const filePath of pendingAttachments) {
        try { await window.kanbai.kanban.attachFile(newest.id, activeWorkspaceId, filePath) } catch { /* best-effort */ }
      }
    }
    if (newest && pendingClipboardImages.length > 0) {
      for (const img of pendingClipboardImages) {
        try { await window.kanbai.kanban.attachFromClipboard(newest.id, activeWorkspaceId, img.dataBase64, img.filename, img.mimeType) } catch { /* best-effort */ }
      }
    }
    if (newest && (pendingAttachments.length > 0 || pendingClipboardImages.length > 0)) {
      await loadTasks(activeWorkspaceId)
    }
    if (editingPredefinedId && activeWorkspaceId) {
      dismissPredefined(activeWorkspaceId, editingPredefinedId)
      setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
    }
    setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setNewType('feature')
    setNewTargetProjectId(''); setNewIsCtoMode(false); setNewAiProvider('')
    setPendingAttachments([]); setPendingClipboardImages([]); setEditingPredefinedId(null); setShowCreateForm(false)
  }, [activeWorkspaceId, newTitle, newDesc, newPriority, newType, newTargetProjectId, newIsCtoMode, newAiProvider, pendingAttachments, pendingClipboardImages, editingPredefinedId, createTask, loadTasks])

  const handleDragStart = useCallback((taskId: string) => { setDragged(taskId) }, [setDragged])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])

  const handleDrop = useCallback(
    (status: KanbanStatus) => {
      if (draggedTaskId) {
        if (status === 'WORKING') {
          const task = tasks.find((t) => t.id === draggedTaskId)
          if (task) sendToAi(task)
        } else {
          updateTaskStatus(draggedTaskId, status)
        }
        setDragged(null)
      }
    },
    [draggedTaskId, tasks, updateTaskStatus, sendToAi, setDragged],
  )

  const handleSendToAi = useCallback((task: KanbanTask) => { sendToAi(task) }, [sendToAi])

  const hasActiveCtoTicket = useMemo(() => {
    return tasks.some((t) => t.isCtoTicket && !t.archived && (t.status === 'WORKING' || t.status === 'TODO'))
  }, [tasks])

  const handleContextMenu = useCallback((e: React.MouseEvent, task: KanbanTask) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, task })
  }, [])

  const getContextMenuItems = useCallback((task: KanbanTask): ContextMenuItem[] => {
    const statusItems: ContextMenuItem[] = COLUMNS.filter((c) => c.status !== task.status).map((col) => ({
      label: t(col.labelKey),
      action: () => updateTaskStatus(task.id, col.status),
    }))
    const hasExistingTab = !!useKanbanStore.getState().kanbanTabIds[task.id]
    return [
      { label: t('kanban.duplicateTask'), action: () => duplicateTask(task), separator: false },
      { label: task.disabled ? t('kanban.enableTask') : t('kanban.disableTask'), action: () => updateTask(task.id, { disabled: !task.disabled }) },
      { label: '', action: () => {}, separator: true },
      ...statusItems,
      { label: '', action: () => {}, separator: true },
      { label: t('kanban.sendToAi'), action: () => handleSendToAi(task) },
      ...(hasExistingTab || task.status === 'WORKING' ? [{ label: t('kanban.relaunchTask'), action: () => handleSendToAi(task) }] : []),
    ]
  }, [t, updateTaskStatus, updateTask, duplicateTask, handleSendToAi])

  const handleRestoreFromArchive = useCallback((task: KanbanTask) => { updateTask(task.id, { archived: false, status: 'TODO' as KanbanStatus }) }, [updateTask])
  const handleArchiveTask = useCallback((task: KanbanTask) => { updateTask(task.id, { archived: true }) }, [updateTask])

  const handleOpenEditModal = useCallback((task: KanbanTask) => {
    setEditingTask(task)
    setEditTitle(task.title); setEditDesc(task.description); setEditPriority(task.priority)
    setEditType(task.type ?? 'feature'); setEditTargetProjectId(task.targetProjectId || ''); setEditAiProvider(task.aiProvider || '')
  }, [])

  const handleCloseEditModal = useCallback(() => { setEditingTask(null) }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingTask || !editTitle.trim()) return
    const updates: Partial<KanbanTask> = {}
    if (editTitle.trim() !== editingTask.title) updates.title = editTitle.trim()
    if (editDesc !== editingTask.description) updates.description = editDesc
    if (editPriority !== editingTask.priority) updates.priority = editPriority
    if (editType !== (editingTask.type ?? 'feature')) updates.type = editType
    const newTargetProject = editTargetProjectId || undefined
    if (newTargetProject !== editingTask.targetProjectId) updates.targetProjectId = newTargetProject
    const newProvider = editAiProvider || undefined
    if (newProvider !== editingTask.aiProvider) updates.aiProvider = newProvider
    if (Object.keys(updates).length > 0) await updateTask(editingTask.id, updates)
    setEditingTask(null)
  }, [editingTask, editTitle, editDesc, editPriority, editType, editTargetProjectId, editAiProvider, updateTask])

  const hasActiveFilters = filterPriority !== 'all' || filterType !== 'all' || filterScope !== 'all' || searchQuery !== ''

  const getGoToTerminal = useCallback((taskId: string): (() => void) | null => {
    const tabId = kanbanTabIds[taskId]
    if (!tabId) return null
    const tabExists = terminalTabs.some((tab) => tab.id === tabId)
    if (!tabExists) return null
    return () => { setActiveTerminalTab(tabId); setViewMode('terminal') }
  }, [kanbanTabIds, terminalTabs, setActiveTerminalTab, setViewMode])

  if (!activeWorkspaceId) {
    return <div className="kanban-empty">{t('kanban.selectWorkspace')}</div>
  }

  const getTasksByStatus = (status: KanbanStatus): KanbanTask[] => {
    if (status === 'DONE') return sortTasks(activeDoneTasks, true)
    return sortTasks(filteredTasks.filter((t) => t.status === status && !t.archived))
  }

  return (
    <div className="kanban">
      <KanbanHeader
        filteredTasks={filteredTasks}
        filterPriority={filterPriority} setFilterPriority={setFilterPriority}
        filterType={filterType} setFilterType={setFilterType}
        filterScope={filterScope} setFilterScope={setFilterScope}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        hasActiveFilters={hasActiveFilters}
        showCreateForm={showCreateForm} setShowCreateForm={setShowCreateForm}
        kanbanConfig={kanbanConfig} showSettings={showSettings} setShowSettings={setShowSettings}
        workspaceProjects={workspaceProjects}
        onUpdateConfig={updateKanbanConfig}
      />

      {showSettings && kanbanConfig && (
        <KanbanSettingsDrawer kanbanConfig={kanbanConfig} onClose={() => setShowSettings(false)} onUpdateConfig={updateKanbanConfig} />
      )}

      {showCreateForm && (
        <KanbanCreateModal
          newTitle={newTitle} setNewTitle={setNewTitle} newDesc={newDesc} setNewDesc={setNewDesc}
          newPriority={newPriority} setNewPriority={setNewPriority} newType={newType} setNewType={setNewType}
          newTargetProjectId={newTargetProjectId} setNewTargetProjectId={setNewTargetProjectId}
          newAiProvider={newAiProvider} setNewAiProvider={setNewAiProvider}
          newIsCtoMode={newIsCtoMode} setNewIsCtoMode={setNewIsCtoMode}
          pendingAttachments={pendingAttachments} setPendingAttachments={setPendingAttachments}
          pendingClipboardImages={pendingClipboardImages} setPendingClipboardImages={setPendingClipboardImages}
          hasActiveCtoTicket={hasActiveCtoTicket} workspaceDefaultAiProvider={workspaceDefaultAiProvider}
          workspaceProjects={workspaceProjects} activeWorkspaceName={activeWorkspace?.name}
          editingPredefinedId={editingPredefinedId} setEditingPredefinedId={setEditingPredefinedId}
          onClose={() => setShowCreateForm(false)} onCreate={handleCreate}
        />
      )}

      {editingTask && (
        <KanbanEditModal
          editTitle={editTitle} setEditTitle={setEditTitle} editDesc={editDesc} setEditDesc={setEditDesc}
          editPriority={editPriority} setEditPriority={setEditPriority} editType={editType} setEditType={setEditType}
          editTargetProjectId={editTargetProjectId} setEditTargetProjectId={setEditTargetProjectId}
          editAiProvider={editAiProvider} setEditAiProvider={setEditAiProvider}
          workspaceDefaultAiProvider={workspaceDefaultAiProvider} workspaceProjects={workspaceProjects}
          activeWorkspaceId={activeWorkspaceId} workspaces={workspaces}
          onClose={handleCloseEditModal} onSave={handleSaveEdit}
        />
      )}

      {kanbanConfig?.paused && <div className="kanban-paused-banner">{t('kanban.pausedBanner')}</div>}

      <div className="kanban-main">
        <KanbanColumns
          getTasksByStatus={getTasksByStatus}
          sortTasks={sortTasks}
          activeDoneTasks={activeDoneTasks}
          doneTasks={doneTasks}
          archivedTasks={archivedTasks}
          selectedTaskId={selectedTask?.id}
          visiblePredefined={visiblePredefined}
          workspaceProjects={workspaceProjects}
          workspaceDefaultAiProvider={workspaceDefaultAiProvider}
          isPaused={!!kanbanConfig?.paused}
          archiveExpanded={archiveExpanded}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragStart={handleDragStart}
          onSelectTask={setSelectedTask}
          onDeleteTask={deleteTask}
          onContextMenu={handleContextMenu}
          onDoubleClickTask={handleOpenEditModal}
          onGoToTerminal={getGoToTerminal}
          onAddPredefined={handleAddPredefined}
          onDismissPredefined={handleDismissPredefined}
          onEditPredefined={handleEditPredefined}
          onArchiveTask={handleArchiveTask}
          onRestoreFromArchive={handleRestoreFromArchive}
          onToggleArchive={() => setArchiveExpanded(!archiveExpanded)}
          agentProgress={agentProgress}
        />

        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={(data) => updateTask(selectedTask.id, data)}
            onDelete={() => { deleteTask(selectedTask.id); setSelectedTask(null) }}
            onStatusChange={(status) => updateTaskStatus(selectedTask.id, status)}
            onSendToAi={() => handleSendToAi(selectedTask)}
            onAttachFiles={() => attachFiles(selectedTask.id)}
            onAttachFromClipboard={(dataBase64, filename, mimeType) => attachFromClipboard(selectedTask.id, dataBase64, filename, mimeType)}
            onRemoveAttachment={(attachmentId) => removeAttachment(selectedTask.id, attachmentId)}
            projects={workspaceProjects}
            agentProgress={agentProgress[selectedTask.id]}
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getContextMenuItems(contextMenu.task)} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
