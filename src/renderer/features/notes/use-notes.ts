import { useNotesStore } from './notes-store'

/**
 * Convenience hook for the notes feature.
 * Returns commonly used notes state and actions.
 */
export function useNotes() {
  const {
    notes,
    selectedNoteId,
    loadNotes,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
  } = useNotesStore()

  return {
    // State
    notes,
    selectedNoteId,

    // Actions
    loadNotes,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
  }
}
