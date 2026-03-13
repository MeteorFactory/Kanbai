import { create } from 'zustand'
import type { Note } from '../../../shared/types'

interface NotesState {
  notes: Note[]
  selectedNoteId: string | null
  loadNotes: (workspaceId: string) => Promise<void>
  createNote: (workspaceId: string) => Promise<Note | null>
  updateNote: (workspaceId: string, id: string, title?: string, content?: string) => Promise<void>
  deleteNote: (workspaceId: string, id: string) => Promise<void>
  selectNote: (noteId: string | null) => void
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  selectedNoteId: null,

  loadNotes: async (workspaceId: string) => {
    const notes = await window.kanbai.notes.list(workspaceId)
    const { selectedNoteId } = get()
    set({
      notes,
      selectedNoteId: selectedNoteId && notes.some((n) => n.id === selectedNoteId)
        ? selectedNoteId
        : notes[0]?.id ?? null,
    })
  },

  createNote: async (workspaceId: string) => {
    const note = await window.kanbai.notes.create(workspaceId, '', '')
    const notes = await window.kanbai.notes.list(workspaceId)
    set({ notes, selectedNoteId: note.id })
    return note
  },

  updateNote: async (workspaceId: string, id: string, title?: string, content?: string) => {
    await window.kanbai.notes.update(workspaceId, id, title, content)
    const notes = await window.kanbai.notes.list(workspaceId)
    set({ notes })
  },

  deleteNote: async (workspaceId: string, id: string) => {
    await window.kanbai.notes.delete(workspaceId, id)
    const notes = await window.kanbai.notes.list(workspaceId)
    const { selectedNoteId } = get()
    set({
      notes,
      selectedNoteId: selectedNoteId === id ? (notes[0]?.id ?? null) : selectedNoteId,
    })
  },

  selectNote: (noteId) => set({ selectedNoteId: noteId }),
}))
