import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNotesStore } from '../lib/stores/notesStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import '../styles/notes.css'

function formatRelativeDate(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function NotesPanel() {
  const { t } = useI18n()
  const { activeWorkspaceId } = useWorkspaceStore()
  const {
    notes,
    selectedNoteId,
    loadNotes,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
  } = useNotesStore()

  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  )

  // Load notes when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      loadNotes(activeWorkspaceId)
    }
  }, [activeWorkspaceId, loadNotes])

  // Sync edit fields when selecting a note
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title)
      setEditContent(selectedNote.content)
    }
  }, [selectedNote?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus title input when selecting a new empty note
  useEffect(() => {
    if (selectedNote && !selectedNote.title && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [selectedNoteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save with debounce
  const autoSave = useCallback(
    (title: string, content: string) => {
      if (!activeWorkspaceId || !selectedNoteId) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        updateNote(activeWorkspaceId, selectedNoteId, title, content)
      }, 500)
    },
    [activeWorkspaceId, selectedNoteId, updateNote],
  )

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleTitleChange = useCallback(
    (value: string) => {
      setEditTitle(value)
      autoSave(value, editContent)
    },
    [autoSave, editContent],
  )

  const handleContentChange = useCallback(
    (value: string) => {
      setEditContent(value)
      autoSave(editTitle, value)
    },
    [autoSave, editTitle],
  )

  const handleCreate = useCallback(async () => {
    if (!activeWorkspaceId) return
    await createNote(activeWorkspaceId)
  }, [activeWorkspaceId, createNote])

  const handleDelete = useCallback(
    async (id: string) => {
      if (!activeWorkspaceId) return
      await deleteNote(activeWorkspaceId, id)
      setConfirmDeleteId(null)
    },
    [activeWorkspaceId, deleteNote],
  )

  const handleNoteSelect = useCallback(
    (noteId: string) => {
      // Flush pending save before switching
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        if (activeWorkspaceId && selectedNoteId) {
          updateNote(activeWorkspaceId, selectedNoteId, editTitle, editContent)
        }
      }
      selectNote(noteId)
    },
    [selectNote, activeWorkspaceId, selectedNoteId, updateNote, editTitle, editContent],
  )

  if (!activeWorkspaceId) {
    return (
      <div className="notes-panel">
        <div className="notes-empty">
          <p>{t('notes.noWorkspace')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="notes-panel">
      {/* Header */}
      <div className="notes-header">
        <h3>{t('notes.title')}</h3>
        <span className="notes-header-count">{notes.length}</span>
        <button className="notes-add-btn" onClick={handleCreate} title={t('notes.create')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="notes-body">
        {/* Sidebar - notes list */}
        <div className="notes-sidebar">
          {notes.length === 0 ? (
            <div className="notes-sidebar-empty">
              <p>{t('notes.empty')}</p>
              <button className="notes-create-btn" onClick={handleCreate}>
                {t('notes.create')}
              </button>
            </div>
          ) : (
            <div className="notes-list">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className={`notes-list-item${note.id === selectedNoteId ? ' notes-list-item--active' : ''}`}
                  onClick={() => handleNoteSelect(note.id)}
                >
                  <div className="notes-list-item-title">
                    {note.title || t('notes.untitled')}
                  </div>
                  <div className="notes-list-item-preview">
                    {note.content.slice(0, 80).replace(/\n/g, ' ') || t('notes.noContent')}
                  </div>
                  <div className="notes-list-item-date">
                    {formatRelativeDate(note.updatedAt)}
                  </div>
                  {confirmDeleteId === note.id ? (
                    <div className="notes-list-item-confirm">
                      <button
                        className="notes-confirm-delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDelete(note.id) }}
                      >
                        {t('common.confirm')}
                      </button>
                      <button
                        className="notes-cancel-delete-btn"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="notes-list-item-delete"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(note.id) }}
                      title={t('common.delete')}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content area - always editable */}
        <div className="notes-content">
          {selectedNote ? (
            <div className="notes-editor">
              <input
                ref={titleInputRef}
                className="notes-editor-title"
                type="text"
                value={editTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={t('notes.titlePlaceholder')}
              />
              <textarea
                className="notes-editor-content"
                value={editContent}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder={t('notes.contentPlaceholder')}
              />
            </div>
          ) : (
            <div className="notes-content-empty">
              <p>{t('notes.selectOrCreate')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
