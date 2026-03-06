import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useKanbanStore } from '../lib/stores/kanbanStore'
import { useTerminalTabStore } from '../lib/stores/terminalTabStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import type { KanbanStatus, KanbanTask, KanbanTaskType, KanbanComment, AiDefaults, KanbanConfig } from '../../shared/types/index'
import { AI_PROVIDERS } from '../../shared/types/ai-provider'
import type { AiProviderId } from '../../shared/types/ai-provider'
import '../styles/kanban.css'

interface PendingClipboardImage {
  dataBase64: string
  filename: string
  mimeType: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]!) // strip data:...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getClipboardImageMimeType(type: string): string {
  if (type === 'image/png') return 'image/png'
  if (type === 'image/jpeg') return 'image/jpeg'
  if (type === 'image/gif') return 'image/gif'
  if (type === 'image/webp') return 'image/webp'
  return 'image/png' // default
}

function getClipboardImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/webp') return '.webp'
  return '.png'
}

const TYPE_PREFIX: Record<KanbanTaskType, string> = {
  bug: 'B',
  feature: 'F',
  test: 'T',
  doc: 'D',
  ia: 'A',
  refactor: 'R',
}

function formatTicketNumber(n?: number, type?: KanbanTaskType, isPrequalifying?: boolean): string {
  if (n == null) return ''
  const prefix = isPrequalifying ? 'T' : TYPE_PREFIX[type ?? 'feature']
  return `${prefix}-${String(n).padStart(2, '0')}`
}

const COLUMNS: { status: KanbanStatus; labelKey: string; color: string }[] = [
  { status: 'TODO', labelKey: 'kanban.todo', color: '#89b4fa' },
  { status: 'WORKING', labelKey: 'kanban.working', color: '#fab387' },
  { status: 'PENDING', labelKey: 'kanban.pending', color: '#f9e2af' },
  { status: 'DONE', labelKey: 'kanban.done', color: '#a6e3a1' },
  { status: 'FAILED', labelKey: 'kanban.failed', color: '#f38ba8' },
]

// Columns displayed in the main board (DONE is handled via archive)
const ACTIVE_COLUMNS = COLUMNS.filter((c) => c.status !== 'DONE')

const PRIORITIES = ['low', 'medium', 'high'] as const

const TASK_TYPES: KanbanTaskType[] = ['bug', 'feature', 'test', 'doc', 'ia', 'refactor']

const TYPE_CONFIG: Record<KanbanTaskType, { color: string; labelFr: string; labelEn: string }> = {
  bug:      { color: '#f38ba8', labelFr: 'Bug',      labelEn: 'Bug' },
  feature:  { color: '#89b4fa', labelFr: 'Feature',  labelEn: 'Feature' },
  test:     { color: '#94e2d5', labelFr: 'Test',     labelEn: 'Test' },
  doc:      { color: '#a6e3a1', labelFr: 'Doc',      labelEn: 'Doc' },
  ia:       { color: '#cba6f7', labelFr: 'IA',       labelEn: 'AI' },
  refactor: { color: '#f5c2e7', labelFr: 'Refactor', labelEn: 'Refactor' },
}

// --- Predefined task templates ---
interface PredefinedTaskTemplate {
  id: string
  titleKey: string
  descriptionKey: string
  priority: 'low' | 'medium' | 'high'
  type: KanbanTaskType
}

const PREDEFINED_TASKS: PredefinedTaskTemplate[] = [
  {
    id: 'predefined-git',
    titleKey: 'kanban.predefined.git.title',
    descriptionKey: 'kanban.predefined.git.description',
    priority: 'high',
    type: 'feature',
  },
  {
    id: 'predefined-makefile',
    titleKey: 'kanban.predefined.makefile.title',
    descriptionKey: 'kanban.predefined.makefile.description',
    priority: 'medium',
    type: 'feature',
  },
  {
    id: 'predefined-readme',
    titleKey: 'kanban.predefined.readme.title',
    descriptionKey: 'kanban.predefined.readme.description',
    priority: 'medium',
    type: 'doc',
  },
  {
    id: 'predefined-testing',
    titleKey: 'kanban.predefined.testing.title',
    descriptionKey: 'kanban.predefined.testing.description',
    priority: 'medium',
    type: 'test',
  },
  {
    id: 'predefined-linting',
    titleKey: 'kanban.predefined.linting.title',
    descriptionKey: 'kanban.predefined.linting.description',
    priority: 'medium',
    type: 'feature',
  },
  {
    id: 'predefined-ci',
    titleKey: 'kanban.predefined.ci.title',
    descriptionKey: 'kanban.predefined.ci.description',
    priority: 'low',
    type: 'feature',
  },
]

function getPredefinedDismissedKey(workspaceId: string): string {
  return `kanbai-predefined-dismissed-${workspaceId}`
}

function getDismissedPredefined(workspaceId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(getPredefinedDismissedKey(workspaceId)) || '[]')
  } catch {
    return []
  }
}

function dismissPredefined(workspaceId: string, predefinedId: string): void {
  const dismissed = getDismissedPredefined(workspaceId)
  if (!dismissed.includes(predefinedId)) {
    dismissed.push(predefinedId)
    localStorage.setItem(getPredefinedDismissedKey(workspaceId), JSON.stringify(dismissed))
  }
}

export function KanbanBoard() {
  const { t, locale } = useI18n()
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
  const [editingPredefinedId, setEditingPredefinedId] = useState<string | null>(null)

  const workspaceProjects = projects.filter((p) => p.workspaceId === activeWorkspaceId)

  // Load dismissed predefined tasks from localStorage
  useEffect(() => {
    if (activeWorkspaceId) {
      setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
    }
  }, [activeWorkspaceId])

  // Visible predefined tasks (not dismissed)
  const visiblePredefined = useMemo(() => {
    if (!activeWorkspaceId) return []
    return PREDEFINED_TASKS.filter((pt) => !dismissedPredefined.includes(pt.id))
  }, [activeWorkspaceId, dismissedPredefined])

  const handleAddPredefined = useCallback(async (template: PredefinedTaskTemplate) => {
    if (!activeWorkspaceId) return
    await createTask(
      activeWorkspaceId,
      t(template.titleKey),
      t(template.descriptionKey),
      template.priority,
      template.type,
    )
    dismissPredefined(activeWorkspaceId, template.id)
    setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
  }, [activeWorkspaceId, createTask, t])

  const handleDismissPredefined = useCallback((predefinedId: string) => {
    if (!activeWorkspaceId) return
    dismissPredefined(activeWorkspaceId, predefinedId)
    setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
  }, [activeWorkspaceId])

  const handleEditPredefined = useCallback((template: PredefinedTaskTemplate) => {
    setNewTitle(t(template.titleKey))
    setNewDesc(t(template.descriptionKey))
    setNewPriority(template.priority)
    setNewType(template.type)
    setNewTargetProjectId('')
    setNewAiProvider('')
    setNewIsCtoMode(false)
    setEditingPredefinedId(template.id)
    setShowCreateForm(true)
  }, [t])

  // Resolve the effective default AI provider for this workspace
  const [appDefaultAiProvider, setAppDefaultAiProvider] = useState<AiProviderId>('claude')
  useEffect(() => {
    window.kanbai.settings.get().then((s) => {
      if (s.defaultAiProvider) setAppDefaultAiProvider(s.defaultAiProvider as AiProviderId)
    }).catch(() => {})
  }, [])
  const workspaceDefaultAiProvider: AiProviderId = workspaceProjects[0]?.aiDefaults?.kanban ?? workspaceProjects[0]?.aiProvider ?? appDefaultAiProvider

  useEffect(() => {
    if (activeWorkspaceId) {
      loadTasks(activeWorkspaceId)
      window.kanbai.kanban.getConfig(activeWorkspaceId).then(setKanbanConfig).catch(() => {})
    }
  }, [activeWorkspaceId, loadTasks])

  const updateKanbanConfig = useCallback(async (key: keyof KanbanConfig, value: boolean) => {
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

  // File watcher: instant sync when kanban.json changes on disk (replaces 5s polling)
  const hasWorkingTasks = tasks.some((t) => t.status === 'WORKING')
  useEffect(() => {
    if (!activeWorkspaceId || !hasWorkingTasks) return
    // Start watching the kanban file for external changes (Claude, hooks)
    window.kanbai.kanban.watch(activeWorkspaceId)
    const unsubscribe = window.kanbai.kanban.onFileChanged(({ workspaceId }) => {
      if (workspaceId === activeWorkspaceId) {
        syncTasksFromFile()
      }
    })
    // Fallback polling at 30s in case fs.watch misses an event
    const fallback = setInterval(() => syncTasksFromFile(), 30000)
    return () => {
      unsubscribe()
      clearInterval(fallback)
      window.kanbai.kanban.watchRemove(activeWorkspaceId)
    }
  }, [activeWorkspaceId, hasWorkingTasks, syncTasksFromFile])

  // Load prompt templates when create form opens

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
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesTitle = t.title.toLowerCase().includes(q)
        const matchesDescription = t.description.toLowerCase().includes(q)
        const matchesTicketNumber =
          t.ticketNumber != null &&
          (String(t.ticketNumber).includes(q) ||
            formatTicketNumber(t.ticketNumber, t.type, t.isPrequalifying).toLowerCase().includes(q))
        if (!matchesTitle && !matchesDescription && !matchesTicketNumber) {
          return false
        }
      }
      // Priority filter
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      // Type filter
      if (filterType !== 'all' && (t.type ?? 'feature') !== filterType) return false
      // Scope filter
      if (filterScope === 'workspace' && t.targetProjectId) return false
      if (filterScope !== 'all' && filterScope !== 'workspace' && t.targetProjectId !== filterScope) return false
      return true
    })
  }, [tasks, searchQuery, filterPriority, filterType, filterScope])

  // Split DONE tasks into active vs manually archived
  const doneTasks = useMemo(() => filteredTasks.filter((t) => t.status === 'DONE'), [filteredTasks])
  const activeDoneTasks = useMemo(
    () => doneTasks.filter((t) => !t.archived),
    [doneTasks],
  )
  const archivedTasks = useMemo(
    () => doneTasks.filter((t) => t.archived),
    [doneTasks],
  )

  // Sort tasks within a column: overdue first, then by due date, then by creation
  // newestFirst: reverses creation date order (used for DONE column)
  const sortTasks = useCallback(
    (taskList: KanbanTask[], newestFirst = false): KanbanTask[] => {
      return [...taskList].sort((a, b) => {
        const aOverdue = a.dueDate && a.dueDate < Date.now() ? 1 : 0
        const bOverdue = b.dueDate && b.dueDate < Date.now() ? 1 : 0
        if (aOverdue !== bOverdue) return bOverdue - aOverdue // overdue first
        if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      })
    },
    [],
  )

  const handleSelectPendingFiles = useCallback(async () => {
    const files = await window.kanbai.kanban.selectFiles()
    if (files && files.length > 0) {
      setPendingAttachments((prev) => [...prev, ...files])
    }
  }, [])

  const handleCreateModalPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue
        const mimeType = getClipboardImageMimeType(item.type)
        const ext = getClipboardImageExtension(mimeType)
        const filename = `clipboard-${Date.now()}${ext}`
        const dataBase64 = await blobToBase64(blob)
        setPendingClipboardImages((prev) => [...prev, { dataBase64, filename, mimeType }])
      }
    }
  }, [])

  const [isDragOver, setIsDragOver] = useState(false)

  const handleCreateModalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    const paths: string[] = []
    for (const file of Array.from(files)) {
      try {
        const filePath = window.kanbai.getFilePathFromDrop(file)
        if (filePath) paths.push(filePath)
      } catch {
        // Fallback: try legacy file.path (non-sandbox environments)
        const legacyPath = (file as unknown as { path?: string }).path
        if (legacyPath) paths.push(legacyPath)
      }
    }
    if (paths.length > 0) {
      setPendingAttachments((prev) => [...prev, ...paths])
    }
  }, [])

  const handleCreateModalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleCreateModalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!activeWorkspaceId || !newTitle.trim()) return
    await createTask(
      activeWorkspaceId,
      newTitle.trim(),
      newDesc.trim(),
      newPriority,
      newType,
      newTargetProjectId || undefined,
      newIsCtoMode || undefined,
      newAiProvider || undefined,
    )
    // Attach pending files
    const createdTasks = useKanbanStore.getState().tasks
    const newest = createdTasks[createdTasks.length - 1]
    if (newest && pendingAttachments.length > 0) {
      for (const filePath of pendingAttachments) {
        try {
          await window.kanbai.kanban.attachFile(newest.id, activeWorkspaceId, filePath)
        } catch { /* best-effort */ }
      }
    }
    // Attach pending clipboard images
    if (newest && pendingClipboardImages.length > 0) {
      for (const img of pendingClipboardImages) {
        try {
          await window.kanbai.kanban.attachFromClipboard(newest.id, activeWorkspaceId, img.dataBase64, img.filename, img.mimeType)
        } catch { /* best-effort */ }
      }
    }
    // Reload tasks to get updated attachments
    if (newest && (pendingAttachments.length > 0 || pendingClipboardImages.length > 0)) {
      await loadTasks(activeWorkspaceId)
    }
    // Dismiss predefined task if this creation originated from one
    if (editingPredefinedId && activeWorkspaceId) {
      dismissPredefined(activeWorkspaceId, editingPredefinedId)
      setDismissedPredefined(getDismissedPredefined(activeWorkspaceId))
    }
    setNewTitle('')
    setNewDesc('')
    setNewPriority('medium')
    setNewType('feature')
    setNewTargetProjectId('')
    setNewIsCtoMode(false)
    setNewAiProvider('')
    setPendingAttachments([])
    setPendingClipboardImages([])
    setEditingPredefinedId(null)
    setShowCreateForm(false)
  }, [activeWorkspaceId, newTitle, newDesc, newPriority, newType, newTargetProjectId, newIsCtoMode, newAiProvider, pendingAttachments, pendingClipboardImages, editingPredefinedId, createTask, loadTasks])

  const handleDragStart = useCallback(
    (taskId: string) => {
      setDragged(taskId)
    },
    [setDragged],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (status: KanbanStatus) => {
      if (draggedTaskId) {
        if (status === 'WORKING') {
          // When dropping into "En cours", launch an AI terminal (sendToAi also sets WORKING status)
          const task = tasks.find((t) => t.id === draggedTaskId)
          if (task) {
            sendToAi(task)
          }
        } else {
          updateTaskStatus(draggedTaskId, status)
        }
        setDragged(null)
      }
    },
    [draggedTaskId, tasks, updateTaskStatus, sendToAi, setDragged],
  )

  const handleSendToAi = useCallback((task: KanbanTask) => {
    sendToAi(task)
  }, [sendToAi])

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

  const handleRestoreFromArchive = useCallback((task: KanbanTask) => {
    updateTask(task.id, { archived: false })
  }, [updateTask])

  const handleArchiveTask = useCallback((task: KanbanTask) => {
    updateTask(task.id, { archived: true })
  }, [updateTask])

  const handleOpenEditModal = useCallback((task: KanbanTask) => {
    setEditingTask(task)
    setEditTitle(task.title)
    setEditDesc(task.description)
    setEditPriority(task.priority)
    setEditType(task.type ?? 'feature')
    setEditTargetProjectId(task.targetProjectId || '')
    setEditAiProvider(task.aiProvider || '')
  }, [])

  const handleCloseEditModal = useCallback(() => {
    setEditingTask(null)
  }, [])

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
    if (Object.keys(updates).length > 0) {
      await updateTask(editingTask.id, updates)
    }
    setEditingTask(null)
  }, [editingTask, editTitle, editDesc, editPriority, editType, editTargetProjectId, editAiProvider, updateTask])

  const hasActiveFilters = filterPriority !== 'all' || filterType !== 'all' || filterScope !== 'all' || searchQuery !== ''

  const getGoToTerminal = useCallback((taskId: string): (() => void) | null => {
    const tabId = kanbanTabIds[taskId]
    if (!tabId) return null
    const tabExists = terminalTabs.some((tab) => tab.id === tabId)
    if (!tabExists) return null
    return () => {
      setActiveTerminalTab(tabId)
      setViewMode('terminal')
    }
  }, [kanbanTabIds, terminalTabs, setActiveTerminalTab, setViewMode])

  if (!activeWorkspaceId) {
    return (
      <div className="kanban-empty">
        {t('kanban.selectWorkspace')}
      </div>
    )
  }

  const getTasksByStatus = (status: KanbanStatus): KanbanTask[] => {
    if (status === 'DONE') return sortTasks(activeDoneTasks, true)
    return sortTasks(filteredTasks.filter((t) => t.status === status))
  }

  return (
    <div className="kanban">
      <div className="kanban-header">
        <h2>{t('kanban.title')}</h2>
        <div className="kanban-header-actions">
          {/* Search */}
          <input
            className="kanban-search-input"
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="kanban-task-count">{t('kanban.taskCount', { count: String(filteredTasks.length) })}</span>
          <button className="kanban-add-btn" onClick={() => setShowCreateForm(!showCreateForm)}>
            {t('kanban.newTask')}
          </button>
          <button
            className={`kanban-settings-btn${showSettings ? ' kanban-settings-btn--active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title={t('kanban.settings')}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Settings drawer */}
      {showSettings && kanbanConfig && (
        <div className="kanban-settings-drawer">
          <div className="kanban-settings-drawer-header">
            <span className="kanban-settings-drawer-title">{t('kanban.settingsTitle')}</span>
            <button className="kanban-settings-drawer-close" onClick={() => setShowSettings(false)}>&times;</button>
          </div>
          {([
            { key: 'autoCloseCompletedTerminals' as const, label: t('kanban.autoCloseCompletedTerminals'), hint: t('kanban.autoCloseCompletedTerminalsHint') },
            { key: 'autoCloseCtoTerminals' as const, label: t('kanban.autoCloseCtoTerminals'), hint: t('kanban.autoCloseCtoTerminalsHint') },
            { key: 'autoCreateAiMemoryRefactorTickets' as const, label: t('kanban.autoCreateAiMemoryRefactorTickets'), hint: t('kanban.autoCreateAiMemoryRefactorTicketsHint') },
            { key: 'autoPrequalifyTickets' as const, label: t('kanban.autoPrequalifyTickets'), hint: t('kanban.autoPrequalifyTicketsHint') },
            { key: 'autoPrioritizeBugs' as const, label: t('kanban.autoPrioritizeBugs'), hint: t('kanban.autoPrioritizeBugsHint') },
          ]).map(({ key, label, hint }) => (
            <div key={key} className="kanban-settings-row">
              <div className="kanban-settings-row-info">
                <span className="kanban-settings-label">{label}</span>
                <span className="kanban-settings-hint">{hint}</span>
              </div>
              <button
                className={`settings-toggle${kanbanConfig[key] ? ' settings-toggle--active' : ''}`}
                onClick={() => updateKanbanConfig(key, !kanbanConfig[key])}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="kanban-filter-bar">
        <select
          className="kanban-filter-select"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="all">{t('kanban.allPriorities')}</option>
          <option value="low">{t('kanban.low')}</option>
          <option value="medium">{t('kanban.medium')}</option>
          <option value="high">{t('kanban.high')}</option>
        </select>

        <select
          className="kanban-filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">{t('kanban.allTypes')}</option>
          {TASK_TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(`kanban.type.${tp}`)}</option>
          ))}
        </select>

        <select
          className="kanban-filter-select"
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value)}
        >
          <option value="all">{t('kanban.allScopes')}</option>
          <option value="workspace">{t('kanban.workspaceOnly')}</option>
          {workspaceProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            className="kanban-filter-clear"
            onClick={() => {
              setFilterPriority('all')
              setFilterType('all')
              setFilterScope('all')
              setSearchQuery('')
            }}
          >
            {t('kanban.clearFilters')}
          </button>
        )}
      </div>

      {showCreateForm && (() => {
        const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
        const resolvedProvider = newAiProvider || workspaceDefaultAiProvider
        const providerInfo = AI_PROVIDERS[resolvedProvider]
        return (
        <div className="modal-overlay" onClick={() => { setShowCreateForm(false); setNewIsCtoMode(false); setEditingPredefinedId(null) }}>
          <div
            className={`kanban-create-modal${newIsCtoMode ? ' kanban-create-modal--cto' : ''}${isDragOver ? ' kanban-create-modal--dragover' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onPaste={handleCreateModalPaste}
            onDrop={handleCreateModalDrop}
            onDragOver={handleCreateModalDragOver}
            onDragLeave={handleCreateModalDragLeave}
          >
            <button className="kanban-create-modal-close" onClick={() => { setShowCreateForm(false); setNewIsCtoMode(false); setEditingPredefinedId(null) }}>&times;</button>
            <div className="kanban-create-modal-body">
              {/* Type Selector — visual buttons */}
              <div className="kanban-create-type-bar">
                {TASK_TYPES.map((tp) => {
                  const conf = TYPE_CONFIG[tp]
                  const isActive = newType === tp
                  return (
                    <button
                      key={tp}
                      className={`kanban-create-type-btn${isActive ? ' kanban-create-type-btn--active' : ''}`}
                      style={isActive
                        ? { color: conf.color, borderColor: conf.color, background: `${conf.color}15` }
                        : { color: 'var(--text-muted)' }
                      }
                      onClick={() => setNewType(tp)}
                    >
                      {locale === 'en' ? conf.labelEn : conf.labelFr}
                    </button>
                  )
                })}
              </div>

              {/* Title */}
              <input
                className="kanban-create-modal-title-input"
                placeholder={t('kanban.taskTitlePlaceholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />

              {/* Description */}
              <textarea
                className="kanban-create-modal-desc"
                placeholder={t('kanban.descriptionPlaceholder')}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={4}
              />

              {/* Meta row: Priority, Scope, AI Provider */}
              <div className="kanban-create-modal-meta">
                {/* Priority pills */}
                <div className="kanban-create-meta-group">
                  <span className="kanban-create-meta-label">{t('kanban.priority')}</span>
                  <div className="kanban-create-pill-row">
                    {PRIORITIES.map((p) => {
                      const pColors: Record<string, string> = { low: '#6c7086', medium: '#89b4fa', high: '#fab387' }
                      const isActive = newPriority === p
                      return (
                        <button
                          key={p}
                          className={`kanban-create-pill${isActive ? ' kanban-create-pill--active' : ''}`}
                          style={isActive ? { color: pColors[p], borderColor: pColors[p], background: `${pColors[p]}15` } : undefined}
                          onClick={() => setNewPriority(p)}
                        >
                          {t(`kanban.${p}`)}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Scope */}
                <div className="kanban-create-meta-group">
                  <span className="kanban-create-meta-label">{t('kanban.scope')}</span>
                  <select
                    className="kanban-select"
                    value={newTargetProjectId}
                    onChange={(e) => setNewTargetProjectId(e.target.value)}
                  >
                    <option value="">Workspace{activeWs ? ` (${activeWs.name})` : ''}</option>
                    {workspaceProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* AI Provider pills */}
                <div className="kanban-create-meta-group">
                  <span className="kanban-create-meta-label">AI</span>
                  <div className="kanban-create-pill-row">
                    {Object.values(AI_PROVIDERS).map((p) => {
                      const isActive = resolvedProvider === p.id
                      const isDefault = p.id === workspaceDefaultAiProvider && !newAiProvider
                      return (
                        <button
                          key={p.id}
                          className={`kanban-create-pill kanban-create-pill--ai${isActive ? ' kanban-create-pill--active' : ''}`}
                          style={isActive ? { color: p.detectionColor, borderColor: p.detectionColor, background: `${p.detectionColor}15` } : undefined}
                          onClick={() => setNewAiProvider(isDefault ? '' : p.id)}
                        >
                          {p.displayName}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* CTO Mode */}
              <div className="kanban-create-modal-extras">
                <button
                  className="kanban-create-modal-attach"
                  onClick={handleSelectPendingFiles}
                  title={t('kanban.attachFiles')}
                >
                  {t('kanban.attachFiles')}{pendingAttachments.length + pendingClipboardImages.length > 0 ? ` (${pendingAttachments.length + pendingClipboardImages.length})` : ''}
                </button>
                <button
                  className={`kanban-create-cto-btn${newIsCtoMode ? ' kanban-create-cto-btn--active' : ''}`}
                  onClick={() => {
                    if (hasActiveCtoTicket && !newIsCtoMode) return
                    const next = !newIsCtoMode
                    setNewIsCtoMode(next)
                    if (next) setNewPriority('low')
                  }}
                  disabled={hasActiveCtoTicket && !newIsCtoMode}
                  title={hasActiveCtoTicket && !newIsCtoMode ? t('kanban.ctoModeAlreadyActive') : t('kanban.ctoModeToggle')}
                >
                  CTO
                </button>
              </div>

              {/* CTO Warning */}
              {newIsCtoMode && (
                <div className="kanban-cto-warning">
                  <div className="kanban-cto-warning-content">
                    <strong>{t('kanban.ctoModeWarningTitle')}</strong>
                    <p>{t('kanban.ctoModeWarning')}</p>
                  </div>
                </div>
              )}

              {/* Attachments */}
              {(pendingAttachments.length > 0 || pendingClipboardImages.length > 0) && (
                <div className="kanban-create-attachments">
                  {pendingAttachments.map((fp, i) => (
                    <span key={`file-${i}`} className="kanban-attachment-chip">
                      {fp.split(/[\\/]/).pop()}
                      <button
                        className="kanban-attachment-chip-remove"
                        onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {pendingClipboardImages.map((img, i) => (
                    <span key={`clip-${i}`} className="kanban-attachment-chip kanban-attachment-chip--image">
                      <img
                        src={`data:${img.mimeType};base64,${img.dataBase64}`}
                        alt={img.filename}
                        className="kanban-attachment-chip-preview"
                      />
                      {img.filename}
                      <button
                        className="kanban-attachment-chip-remove"
                        onClick={() => setPendingClipboardImages((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Drag overlay */}
              {isDragOver && (
                <div className="kanban-create-drop-zone">
                  {t('kanban.dropFiles')}
                </div>
              )}
            </div>
            <div className="kanban-create-modal-footer">
              <button className="kanban-create-modal-cancel" onClick={() => { setShowCreateForm(false); setNewIsCtoMode(false); setEditingPredefinedId(null) }}>
                {t('common.cancel')}
              </button>
              <button
                className={`kanban-create-modal-submit${newIsCtoMode ? ' kanban-create-modal-submit--cto' : ''}`}
                style={!newIsCtoMode ? { background: providerInfo.detectionColor } : undefined}
                onClick={handleCreate}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {editingTask && (() => {
        const editResolvedProvider: AiProviderId = (editAiProvider as AiProviderId) || workspaceDefaultAiProvider
        const editProviderInfo = AI_PROVIDERS[editResolvedProvider]
        return (
        <div className="modal-overlay" onClick={handleCloseEditModal}>
          <div className="kanban-create-modal" onClick={(e) => e.stopPropagation()}>
            <button className="kanban-create-modal-close" onClick={handleCloseEditModal}>&times;</button>
            <div className="kanban-create-modal-body">
              {/* Type Selector — visual buttons */}
              <div className="kanban-create-type-bar">
                {TASK_TYPES.map((tp) => {
                  const conf = TYPE_CONFIG[tp]
                  const isActive = editType === tp
                  return (
                    <button
                      key={tp}
                      className={`kanban-create-type-btn${isActive ? ' kanban-create-type-btn--active' : ''}`}
                      style={isActive
                        ? { color: conf.color, borderColor: conf.color, background: `${conf.color}15` }
                        : { color: 'var(--text-muted)' }
                      }
                      onClick={() => setEditType(tp)}
                    >
                      {locale === 'en' ? conf.labelEn : conf.labelFr}
                    </button>
                  )
                })}
              </div>

              {/* Title */}
              <input
                className="kanban-create-modal-title-input"
                placeholder={t('kanban.taskTitlePlaceholder')}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                autoFocus
              />

              {/* Description */}
              <textarea
                className="kanban-create-modal-desc"
                placeholder={t('kanban.descriptionPlaceholder')}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
              />

              {/* Meta row: Priority, Scope, AI Provider */}
              <div className="kanban-create-modal-meta">
                {/* Priority pills */}
                <div className="kanban-create-meta-group">
                  <span className="kanban-create-meta-label">{t('kanban.priority')}</span>
                  <div className="kanban-create-pill-row">
                    {PRIORITIES.map((p) => {
                      const pColors: Record<string, string> = { low: '#6c7086', medium: '#89b4fa', high: '#fab387' }
                      const isActive = editPriority === p
                      return (
                        <button
                          key={p}
                          className={`kanban-create-pill${isActive ? ' kanban-create-pill--active' : ''}`}
                          style={isActive ? { color: pColors[p], borderColor: pColors[p], background: `${pColors[p]}15` } : undefined}
                          onClick={() => setEditPriority(p)}
                        >
                          {t(`kanban.${p}`)}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Scope */}
                <div className="kanban-create-meta-group">
                  <span className="kanban-create-meta-label">{t('kanban.scope')}</span>
                  <select
                    className="kanban-select"
                    value={editTargetProjectId}
                    onChange={(e) => setEditTargetProjectId(e.target.value)}
                  >
                    <option value="">Workspace{(() => { const ws = workspaces.find((w) => w.id === activeWorkspaceId); return ws ? ` (${ws.name})` : '' })()}</option>
                    {workspaceProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* AI Provider pills */}
                <div className="kanban-create-meta-group">
                  <span className="kanban-create-meta-label">AI</span>
                  <div className="kanban-create-pill-row">
                    {Object.values(AI_PROVIDERS).map((p) => {
                      const isActive = editResolvedProvider === p.id
                      const isDefault = p.id === workspaceDefaultAiProvider && !editAiProvider
                      return (
                        <button
                          key={p.id}
                          className={`kanban-create-pill kanban-create-pill--ai${isActive ? ' kanban-create-pill--active' : ''}`}
                          style={isActive ? { color: p.detectionColor, borderColor: p.detectionColor, background: `${p.detectionColor}15` } : undefined}
                          onClick={() => setEditAiProvider(isDefault ? '' : p.id)}
                        >
                          {p.displayName}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="kanban-create-modal-footer">
              <button className="kanban-create-modal-cancel" onClick={handleCloseEditModal}>
                {t('common.cancel')}
              </button>
              <button
                className="kanban-create-modal-submit"
                style={{ background: editProviderInfo.detectionColor }}
                onClick={handleSaveEdit}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      <div className="kanban-main">
        <div className="kanban-columns">
          {ACTIVE_COLUMNS.map((col) => (
            <div
              key={col.status}
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(col.status)}
            >
              <div className="kanban-column-header" style={{ borderColor: col.color }}>
                <span className="kanban-column-dot" style={{ backgroundColor: col.color }} />
                <span className="kanban-column-title">{t(col.labelKey)}</span>
                <span className="kanban-column-count">{getTasksByStatus(col.status).length}</span>
              </div>
              <div className="kanban-column-body">
                {getTasksByStatus(col.status).map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTask?.id === task.id}
                    onDragStart={() => handleDragStart(task.id)}
                    onClick={() => setSelectedTask(task)}
                    onDelete={() => deleteTask(task.id)}
                    onContextMenu={(e) => handleContextMenu(e, task)}
                    onDoubleClick={() => handleOpenEditModal(task)}
                    onGoToTerminal={getGoToTerminal(task.id)}
                    projects={workspaceProjects}
                    defaultAiProvider={workspaceDefaultAiProvider}
                  />
                ))}
                {col.status === 'TODO' && visiblePredefined.length > 0 && (
                  <>
                    {visiblePredefined.map((pt) => (
                      <PredefinedTaskCard
                        key={pt.id}
                        template={pt}
                        onAdd={() => handleAddPredefined(pt)}
                        onDismiss={() => handleDismissPredefined(pt.id)}
                        onDoubleClick={() => handleEditPredefined(pt)}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}

          {/* DONE column: recent done + archive */}
          <div
            className="kanban-column"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop('DONE')}
          >
            <div className="kanban-column-header" style={{ borderColor: '#a6e3a1' }}>
              <span className="kanban-column-dot" style={{ backgroundColor: '#a6e3a1' }} />
              <span className="kanban-column-title">{t('kanban.done')}</span>
              <span className="kanban-column-count">{doneTasks.length}</span>
            </div>
            <div className="kanban-column-body">
              {sortTasks(activeDoneTasks, true).map((task) => (
                <div key={task.id} className="kanban-done-card-wrapper">
                  <KanbanCard
                    task={task}
                    isSelected={selectedTask?.id === task.id}
                    onDragStart={() => handleDragStart(task.id)}
                    onClick={() => setSelectedTask(task)}
                    onDelete={() => deleteTask(task.id)}
                    onContextMenu={(e) => handleContextMenu(e, task)}
                    onDoubleClick={() => handleOpenEditModal(task)}
                    onGoToTerminal={getGoToTerminal(task.id)}
                    projects={workspaceProjects}
                    defaultAiProvider={workspaceDefaultAiProvider}
                  />
                  <button
                    className="kanban-archive-btn"
                    onClick={() => handleArchiveTask(task)}
                    title={t('kanban.archiveTask')}
                  >
                    {t('kanban.archiveTask')}
                  </button>
                </div>
              ))}

              {/* Archive section */}
              {archivedTasks.length > 0 && (
                <div className="kanban-archive">
                  <button
                    className="kanban-archive-toggle"
                    onClick={() => setArchiveExpanded(!archiveExpanded)}
                  >
                    <span className={`kanban-archive-arrow${archiveExpanded ? ' kanban-archive-arrow--open' : ''}`}>&#9654;</span>
                    {t('kanban.archives', { count: String(archivedTasks.length) })}
                  </button>
                  {archiveExpanded && (
                    <div className="kanban-archive-list">
                      {sortTasks(archivedTasks, true).map((task) => (
                        <div key={task.id} className="kanban-archive-item">
                          <span className="kanban-archive-item-title">
                            {task.ticketNumber != null && <span className="kanban-card-ticket-number">{formatTicketNumber(task.ticketNumber, task.type, task.isPrequalifying)}</span>}
                            {task.title}
                          </span>
                          <button
                            className="kanban-archive-restore-btn"
                            onClick={() => handleRestoreFromArchive(task)}
                            title={t('kanban.restoreToTodo')}
                          >
                            {t('common.restore')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail panel */}
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
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.task)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// --- Predefined Task Card ---

function PredefinedTaskCard({
  template,
  onAdd,
  onDismiss,
  onDoubleClick,
}: {
  template: PredefinedTaskTemplate
  onAdd: () => void
  onDismiss: () => void
  onDoubleClick: () => void
}) {
  const { t } = useI18n()

  const { locale } = useI18n()

  const priorityColors: Record<string, string> = {
    low: '#6c7086',
    medium: '#89b4fa',
    high: '#fab387',
  }

  const typeConf = TYPE_CONFIG[template.type] ?? TYPE_CONFIG.feature

  return (
    <div className="kanban-card kanban-card--predefined" onDoubleClick={onDoubleClick}>
      <div className="kanban-card-type-strip" style={{ backgroundColor: typeConf.color }} />
      <div className="kanban-card-header">
        <span
          className="kanban-card-priority"
          style={{ backgroundColor: priorityColors[template.priority] }}
        />
        <span className="kanban-card-title">{t(template.titleKey)}</span>
      </div>
      <span
        className="kanban-card-type-badge"
        style={{ color: typeConf.color, background: `${typeConf.color}1a` }}
      >
        {locale === 'en' ? typeConf.labelEn : typeConf.labelFr}
      </span>
      <p className="kanban-card-desc">{t(template.descriptionKey)}</p>
      <div className="kanban-predefined-actions">
        <button
          className="kanban-predefined-add"
          onClick={onAdd}
        >
          {t('kanban.predefined.add')}
        </button>
        <button
          className="kanban-predefined-dismiss"
          onClick={onDismiss}
        >
          {t('kanban.predefined.dismiss')}
        </button>
      </div>
    </div>
  )
}

// --- Card ---

function KanbanCard({
  task,
  isSelected,
  onDragStart,
  onClick,
  onDelete,
  onContextMenu,
  onDoubleClick,
  onGoToTerminal,
  projects,
  defaultAiProvider,
}: {
  task: KanbanTask
  isSelected: boolean
  onDragStart: () => void
  onClick: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onGoToTerminal: (() => void) | null
  projects: Array<{ id: string; name: string; aiProvider?: AiProviderId | null; aiDefaults?: AiDefaults }>
  defaultAiProvider: AiProviderId
}) {
  const { t, locale } = useI18n()
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delayed single-click: allows double-click to cancel opening the detail panel
  const handleCardClick = useCallback(() => {
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null
      onClick()
    }, 250)
  }, [onClick])

  const handleCardDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    onDoubleClick()
  }, [onDoubleClick])

  const priorityColors: Record<string, string> = {
    low: '#6c7086',
    medium: '#89b4fa',
    high: '#fab387',
  }

  const isWorking = task.status === 'WORKING'
  const typeConf = TYPE_CONFIG[task.type ?? 'feature'] ?? TYPE_CONFIG.feature

  const targetProject = projects.find((p) => p.id === task.targetProjectId)
  const resolvedProvider: AiProviderId = task.aiProvider
    ?? targetProject?.aiDefaults?.kanban
    ?? targetProject?.aiProvider
    ?? defaultAiProvider
  const workingColor = AI_PROVIDERS[resolvedProvider].detectionColor

  return (
    <div
      className={`kanban-card${isSelected ? ' kanban-card--selected' : ''}${isWorking ? ' kanban-card--working' : ''}${task.disabled ? ' kanban-card--disabled' : ''}${task.isCtoTicket ? ' kanban-card--cto' : ''}${task.isPrequalifying ? ' kanban-card--prequalifying' : ''}`}
      style={isWorking ? { '--working-color': workingColor } as React.CSSProperties : undefined}
      draggable={!task.disabled}
      onDragStart={onDragStart}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="kanban-card-type-strip" style={{ backgroundColor: typeConf.color }} />
      <div className="kanban-card-header">
        <span
          className="kanban-card-priority"
          style={{ backgroundColor: priorityColors[task.priority] }}
        />
        {task.ticketNumber != null && (
          <span className="kanban-card-ticket-number">{formatTicketNumber(task.ticketNumber, task.type, task.isPrequalifying)}</span>
        )}
        <span className="kanban-card-title">{task.title}</span>
        <button
          className="kanban-card-delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title={t('common.delete')}
        >
          &times;
        </button>
      </div>
      <span className="kanban-card-type-badge" style={{ color: typeConf.color, background: `${typeConf.color}1a` }}>
        {locale === 'en' ? typeConf.labelEn : typeConf.labelFr}
      </span>
      <span className="kanban-card-date">
        {new Date(task.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })}
        {', '}
        {new Date(task.createdAt).toLocaleTimeString(locale === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </span>
      {task.isPrequalifying && (
        <span className="kanban-card-prequalifying">{t('kanban.prequalifyRunning')}</span>
      )}
      <p className="kanban-card-desc">
        {task.description || t('kanban.noDescription')}
      </p>
      {onGoToTerminal && (
        <button
          className="kanban-card-terminal-btn"
          style={{ color: workingColor, background: `${workingColor}1a` }}
          onClick={(e) => { e.stopPropagation(); onGoToTerminal() }}
          title={t('kanban.goToTerminal')}
        >
          &#9002; {t('kanban.terminal')}
        </button>
      )}
    </div>
  )
}

// --- Reopen or Send to AI Section ---

function ReopenOrSendSection({
  task,
  onUpdate,
  onSendToAi,
}: {
  task: KanbanTask
  onUpdate: (data: Partial<KanbanTask>) => void
  onSendToAi: () => void
}) {
  const { t } = useI18n()
  const isCompleted = task.status === 'DONE' || task.status === 'FAILED'
  const [reopenMode, setReopenMode] = useState(false)
  const [reopenComment, setReopenComment] = useState('')

  const handleReopen = useCallback(() => {
    const text = reopenComment.trim()
    if (text) {
      const newComment: KanbanComment = {
        id: crypto.randomUUID(),
        text,
        createdAt: Date.now(),
      }
      onUpdate({ comments: [...(task.comments ?? []), newComment] })
    }
    setReopenComment('')
    setReopenMode(false)
    onSendToAi()
  }, [reopenComment, task.comments, onUpdate, onSendToAi])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        handleReopen()
      }
    },
    [handleReopen],
  )

  if (!isCompleted) {
    return (
      <div className="kanban-detail-section">
        <button className="kanban-detail-ai-btn" onClick={onSendToAi}>
          {t('kanban.sendToAi')}
        </button>
      </div>
    )
  }

  if (!reopenMode) {
    return (
      <div className="kanban-detail-section">
        <button className="kanban-detail-reopen-btn" onClick={() => setReopenMode(true)}>
          {t('kanban.reopenTicket')}
        </button>
      </div>
    )
  }

  return (
    <div className="kanban-detail-section">
      <span className="kanban-detail-section-title">{t('kanban.reopenComment')}</span>
      <div className="kanban-reopen-form">
        <textarea
          className="kanban-comment-input"
          placeholder={t('kanban.reopenPlaceholder')}
          value={reopenComment}
          onChange={(e) => setReopenComment(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          autoFocus
        />
        <div className="kanban-reopen-actions">
          <button
            className="kanban-reopen-cancel"
            onClick={() => { setReopenMode(false); setReopenComment('') }}
          >
            {t('common.cancel')}
          </button>
          <button
            className="kanban-reopen-confirm"
            onClick={handleReopen}
          >
            {t('kanban.reopenAndSend')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Task Detail Panel ---

function TaskDetailPanel({
  task,
  onClose,
  onUpdate,
  onDelete,
  onStatusChange,
  onSendToAi,
  onAttachFiles,
  onAttachFromClipboard,
  onRemoveAttachment,
  projects,
}: {
  task: KanbanTask
  onClose: () => void
  onUpdate: (data: Partial<KanbanTask>) => void
  onDelete: () => void
  onStatusChange: (status: KanbanStatus) => void
  onSendToAi: () => void
  onAttachFiles: () => void
  onAttachFromClipboard: (dataBase64: string, filename: string, mimeType: string) => void
  onRemoveAttachment: (attachmentId: string) => void
  projects: Array<{ id: string; name: string }>
}) {
  const { t, locale } = useI18n()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState(task.description)
  const titleRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTitleValue(task.title)
    setDescValue(task.description)
  }, [task.id, task.title, task.description])

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [editingTitle])

  useEffect(() => {
    if (editingDesc && descRef.current) {
      descRef.current.focus()
    }
  }, [editingDesc])

  const saveTitle = useCallback(() => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate({ title: trimmed })
    }
    setEditingTitle(false)
  }, [titleValue, task.title, onUpdate])

  const saveDesc = useCallback(() => {
    if (descValue !== task.description) {
      onUpdate({ description: descValue })
    }
    setEditingDesc(false)
  }, [descValue, task.description, onUpdate])

  const priorityColors: Record<string, string> = {
    low: '#6c7086',
    medium: '#89b4fa',
    high: '#fab387',
  }

  const priorityLabels: Record<string, string> = {
    low: t('kanban.low'),
    medium: t('kanban.medium'),
    high: t('kanban.high'),
  }

  const statusColumn = COLUMNS.find((c) => c.status === task.status)

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue
        const mimeType = getClipboardImageMimeType(item.type)
        const ext = getClipboardImageExtension(mimeType)
        const filename = `clipboard-${Date.now()}${ext}`
        const dataBase64 = await blobToBase64(blob)
        onAttachFromClipboard(dataBase64, filename, mimeType)
      }
    }
  }, [onAttachFromClipboard])

  return (
    <div className="kanban-detail" onPaste={handlePaste} tabIndex={-1}>
      <div className="kanban-detail-header">
        <span className="kanban-detail-id">{task.ticketNumber != null ? formatTicketNumber(task.ticketNumber, task.type, task.isPrequalifying) : `#${task.id.slice(0, 8)}`}</span>
        <button className="kanban-detail-close" onClick={onClose}>&times;</button>
      </div>

      {/* Title */}
      <div className="kanban-detail-section">
        {editingTitle ? (
          <input
            ref={titleRef}
            className="kanban-detail-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
          />
        ) : (
          <h3
            className="kanban-detail-title"
            onDoubleClick={() => setEditingTitle(true)}
          >
            {task.title}
          </h3>
        )}
      </div>

      {/* Status & Priority & Scope */}
      <div className="kanban-detail-meta">
        <div className="kanban-detail-meta-item">
          <span className="kanban-detail-meta-label">{t('kanban.status')}</span>
          <select
            className="kanban-detail-select"
            value={task.status}
            onChange={(e) => onStatusChange(e.target.value as KanbanStatus)}
            style={{ borderColor: statusColumn?.color }}
          >
            {COLUMNS.map((col) => (
              <option key={col.status} value={col.status}>{t(col.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="kanban-detail-meta-item">
          <span className="kanban-detail-meta-label">{t('kanban.priority')}</span>
          <select
            className="kanban-detail-select"
            value={task.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as KanbanTask['priority'] })}
            style={{ borderColor: priorityColors[task.priority] }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{priorityLabels[p]}</option>
            ))}
          </select>
        </div>
        <div className="kanban-detail-meta-item">
          <span className="kanban-detail-meta-label">{t('kanban.scope')}</span>
          <select
            className="kanban-detail-select"
            value={task.targetProjectId || ''}
            onChange={(e) => onUpdate({ targetProjectId: e.target.value || undefined })}
          >
            <option value="">{t('kanban.entireWorkspace')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>


      {/* Type */}
      <div className="kanban-detail-section">
        <span className="kanban-detail-section-title">{t('kanban.type')}</span>
        <div className="kanban-detail-labels">
          {TASK_TYPES.map((tp) => {
            const conf = TYPE_CONFIG[tp]
            const isActive = (task.type ?? 'feature') === tp
            return (
              <button
                key={tp}
                className={`kanban-label-chip${isActive ? ' kanban-label-chip--active' : ''}`}
                style={{ color: conf.color, background: isActive ? `${conf.color}25` : `${conf.color}10` }}
                onClick={() => onUpdate({ type: tp })}
              >
                {locale === 'en' ? conf.labelEn : conf.labelFr}
              </button>
            )
          })}
        </div>
      </div>

      {/* Attachments */}
      <div className="kanban-detail-section">
        <span className="kanban-detail-section-title">{t('kanban.attachedFiles')}</span>
        <div className="kanban-detail-attachments">
          {task.attachments && task.attachments.length > 0 ? (
            task.attachments.map((att) => (
              <div key={att.id} className="kanban-attachment-item">
                <span className="kanban-attachment-item-icon">
                  {att.mimeType.startsWith('image/') ? '🖼' : '📄'}
                </span>
                <span className="kanban-attachment-item-name" title={att.storedPath}>{att.filename}</span>
                <span className="kanban-attachment-item-size">
                  {att.size < 1024 ? `${att.size} o` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)} Ko` : `${(att.size / 1048576).toFixed(1)} Mo`}
                </span>
                <button
                  className="kanban-attachment-item-remove"
                  onClick={() => onRemoveAttachment(att.id)}
                  title={t('common.delete')}
                >
                  &times;
                </button>
              </div>
            ))
          ) : (
            <span className="kanban-detail-empty-hint">{t('kanban.noAttachments')}</span>
          )}
        </div>
        <button className="kanban-attach-btn" onClick={onAttachFiles}>
          {t('kanban.addFile')}
        </button>
      </div>

      {/* Description */}
      <div className="kanban-detail-section">
        <span className="kanban-detail-section-title">{t('kanban.description')}</span>
        {editingDesc ? (
          <textarea
            ref={descRef}
            className="kanban-detail-desc-edit"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={saveDesc}
            rows={4}
          />
        ) : (
          <div
            className="kanban-detail-desc"
            onDoubleClick={() => setEditingDesc(true)}
          >
            {task.description || t('kanban.noDescription')}
          </div>
        )}
      </div>

      {/* AI Agent info */}
      {task.agentId && (
        <div className="kanban-detail-section">
          <span className="kanban-detail-section-title">{t('kanban.aiAgent')}</span>
          <div className="kanban-detail-agent">
            <span className={`kanban-detail-agent-status${task.status === 'WORKING' ? ' kanban-detail-agent-status--active' : ''}`}>
              {task.status === 'WORKING' ? t('kanban.processing') : t('kanban.done')}
            </span>
            <span className="kanban-detail-agent-id">{task.agentId}</span>
          </div>
        </div>
      )}

      {/* Question */}
      {task.question && (
        <div className="kanban-detail-section">
          <span className="kanban-detail-section-title">{t('kanban.aiQuestion')}</span>
          <div className="kanban-detail-question">{task.question}</div>
        </div>
      )}

      {/* Result */}
      {task.result && (
        <div className="kanban-detail-section">
          <span className="kanban-detail-section-title">{t('kanban.result')}</span>
          <div className="kanban-detail-result">{task.result}</div>
        </div>
      )}

      {/* Error */}
      {task.error && (
        <div className="kanban-detail-section">
          <span className="kanban-detail-section-title">{t('kanban.error')}</span>
          <div className="kanban-detail-error">{task.error}</div>
        </div>
      )}

      {/* Comments */}
      {task.comments && task.comments.length > 0 && (
        <div className="kanban-detail-section">
          <span className="kanban-detail-section-title">{t('kanban.comments')} ({task.comments.length})</span>
          <div className="kanban-detail-comments">
            {task.comments.map((comment) => (
              <div key={comment.id} className="kanban-detail-comment">
                <span className="kanban-detail-comment-date">
                  {new Date(comment.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}
                </span>
                <p className="kanban-detail-comment-text">{comment.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversation History */}
      {task.conversationHistoryPath && (
        <div className="kanban-detail-section">
          <span className="kanban-detail-section-title">{t('kanban.conversationHistory')}</span>
          <div className="kanban-detail-conversation">
            <span className="kanban-detail-conversation-path" title={task.conversationHistoryPath}>
              {task.conversationHistoryPath.split(/[\\/]/).pop()}
            </span>
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="kanban-detail-timestamps">
        <span>{t('kanban.created')} {new Date(task.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}</span>
        <span>{t('kanban.modified')} {new Date(task.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}</span>
      </div>

      {/* Send to AI / Reopen */}
      {task.status !== 'WORKING' && (
        <ReopenOrSendSection task={task} onUpdate={onUpdate} onSendToAi={onSendToAi} />
      )}

      {/* Delete */}
      <div className="kanban-detail-actions">
        <button className="kanban-detail-delete-btn" onClick={onDelete}>
          {t('kanban.deleteTask')}
        </button>
      </div>
    </div>
  )
}
