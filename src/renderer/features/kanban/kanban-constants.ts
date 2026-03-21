import type { KanbanTaskType } from '../../../shared/types/index'

export interface PendingClipboardImage {
  dataBase64: string
  filename: string
  mimeType: string
}

export function blobToBase64(blob: Blob): Promise<string> {
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

export function getClipboardImageMimeType(type: string): string {
  if (type === 'image/png') return 'image/png'
  if (type === 'image/jpeg') return 'image/jpeg'
  if (type === 'image/gif') return 'image/gif'
  if (type === 'image/webp') return 'image/webp'
  return 'image/png' // default
}

export function getClipboardImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/webp') return '.webp'
  return '.png'
}

export const TYPE_PREFIX: Record<KanbanTaskType, string> = {
  bug: 'B',
  feature: 'F',
  test: 'T',
  doc: 'D',
  ia: 'A',
  refactor: 'R',
}

export function formatTicketNumber(n?: number, type?: KanbanTaskType, isPrequalifying?: boolean): string {
  if (n == null) return ''
  const prefix = isPrequalifying ? 'T' : TYPE_PREFIX[type ?? 'feature']
  return `${prefix}-${String(n).padStart(2, '0')}`
}

export const COLUMNS: { status: import('../../../shared/types/index').KanbanStatus; labelKey: string; color: string }[] = [
  { status: 'TODO', labelKey: 'kanban.todo', color: '#6B6A65' },
  { status: 'WORKING', labelKey: 'kanban.working', color: '#F5A623' },
  { status: 'PENDING', labelKey: 'kanban.pending', color: '#9747FF' },
  { status: 'DONE', labelKey: 'kanban.done', color: '#20D4A0' },
  { status: 'FAILED', labelKey: 'kanban.failed', color: '#F4585B' },
]

// Columns displayed in the main board (DONE is handled via archive)
export const ACTIVE_COLUMNS = COLUMNS.filter((c) => c.status !== 'DONE')

export const PRIORITIES = ['low', 'medium', 'high'] as const

export const TASK_TYPES: KanbanTaskType[] = ['bug', 'feature', 'test', 'doc', 'ia', 'refactor']

export const TYPE_CONFIG: Record<KanbanTaskType, { color: string; labelFr: string; labelEn: string }> = {
  bug:      { color: '#F4585B', labelFr: 'Bug',      labelEn: 'Bug' },
  feature:  { color: '#9747FF', labelFr: 'Feature',  labelEn: 'Feature' },
  test:     { color: '#22D3EE', labelFr: 'Test',     labelEn: 'Test' },
  doc:      { color: '#20D4A0', labelFr: 'Doc',      labelEn: 'Doc' },
  ia:       { color: '#B78AFF', labelFr: 'IA',       labelEn: 'AI' },
  refactor: { color: '#4B9CFF', labelFr: 'Refactor', labelEn: 'Refactor' },
}

// --- Predefined task templates ---
export interface PredefinedTaskTemplate {
  id: string
  titleKey: string
  descriptionKey: string
  priority: 'low' | 'medium' | 'high'
  type: KanbanTaskType
}

export const PREDEFINED_TASKS: PredefinedTaskTemplate[] = [
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

export function getPredefinedDismissedKey(workspaceId: string): string {
  return `kanbai-predefined-dismissed-${workspaceId}`
}

export function getDismissedPredefined(workspaceId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(getPredefinedDismissedKey(workspaceId)) || '[]')
  } catch {
    return []
  }
}

export function dismissPredefined(workspaceId: string, predefinedId: string): void {
  const dismissed = getDismissedPredefined(workspaceId)
  if (!dismissed.includes(predefinedId)) {
    dismissed.push(predefinedId)
    localStorage.setItem(getPredefinedDismissedKey(workspaceId), JSON.stringify(dismissed))
  }
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#6B6A65',
  medium: '#9747FF',
  high: '#F5A623',
}
