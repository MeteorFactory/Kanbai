import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Note } from '../../src/shared/types'

// Mock window.kanbai.notes API
const mockNotesApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.stubGlobal('window', {
  kanbai: {
    notes: mockNotesApi,
  },
})

const { useNotesStore } = await import(
  '../../src/renderer/features/notes/notes-store'
)

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Note de test',
    content: 'Contenu de test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Note
}

describe('useNotesStore', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notes: [],
      selectedNoteId: null,
    })
    vi.clearAllMocks()
  })

  describe('etat initial', () => {
    it('a un etat vide par defaut', () => {
      const state = useNotesStore.getState()
      expect(state.notes).toEqual([])
      expect(state.selectedNoteId).toBeNull()
    })
  })

  describe('loadNotes', () => {
    it('charge les notes depuis l API', async () => {
      const notes = [makeNote({ id: 'n-1' }), makeNote({ id: 'n-2' })]
      mockNotesApi.list.mockResolvedValue(notes)

      await useNotesStore.getState().loadNotes('ws-1')

      const state = useNotesStore.getState()
      expect(state.notes).toHaveLength(2)
      expect(mockNotesApi.list).toHaveBeenCalledWith('ws-1')
    })

    it('preserve selectedNoteId si la note existe toujours', async () => {
      useNotesStore.setState({ selectedNoteId: 'n-2' })
      const notes = [makeNote({ id: 'n-1' }), makeNote({ id: 'n-2' })]
      mockNotesApi.list.mockResolvedValue(notes)

      await useNotesStore.getState().loadNotes('ws-1')

      expect(useNotesStore.getState().selectedNoteId).toBe('n-2')
    })

    it('selectionne la premiere note si la note selectionnee n existe plus', async () => {
      useNotesStore.setState({ selectedNoteId: 'n-supprimee' })
      const notes = [makeNote({ id: 'n-1' }), makeNote({ id: 'n-2' })]
      mockNotesApi.list.mockResolvedValue(notes)

      await useNotesStore.getState().loadNotes('ws-1')

      expect(useNotesStore.getState().selectedNoteId).toBe('n-1')
    })

    it('definit selectedNoteId a null si aucune note', async () => {
      mockNotesApi.list.mockResolvedValue([])

      await useNotesStore.getState().loadNotes('ws-1')

      expect(useNotesStore.getState().selectedNoteId).toBeNull()
    })

    it('selectionne la premiere note si aucune n etait selectionnee', async () => {
      const notes = [makeNote({ id: 'n-first' })]
      mockNotesApi.list.mockResolvedValue(notes)

      await useNotesStore.getState().loadNotes('ws-1')

      expect(useNotesStore.getState().selectedNoteId).toBe('n-first')
    })
  })

  describe('createNote', () => {
    it('cree une note et la selectionne', async () => {
      const newNote = makeNote({ id: 'n-new', title: '', content: '' })
      const allNotes = [newNote, makeNote({ id: 'n-1' })]
      mockNotesApi.create.mockResolvedValue(newNote)
      mockNotesApi.list.mockResolvedValue(allNotes)

      const result = await useNotesStore.getState().createNote('ws-1')

      expect(result).toEqual(newNote)
      expect(useNotesStore.getState().selectedNoteId).toBe('n-new')
      expect(useNotesStore.getState().notes).toHaveLength(2)
      expect(mockNotesApi.create).toHaveBeenCalledWith('ws-1', '', '')
    })

    it('appelle notes.list apres la creation pour rafraichir', async () => {
      const newNote = makeNote({ id: 'n-new' })
      mockNotesApi.create.mockResolvedValue(newNote)
      mockNotesApi.list.mockResolvedValue([newNote])

      await useNotesStore.getState().createNote('ws-1')

      expect(mockNotesApi.list).toHaveBeenCalledWith('ws-1')
    })
  })

  describe('updateNote', () => {
    it('appelle notes.update avec les bons parametres', async () => {
      mockNotesApi.update.mockResolvedValue(undefined)
      mockNotesApi.list.mockResolvedValue([makeNote({ id: 'n-1', title: 'Mis a jour' })])

      await useNotesStore.getState().updateNote('ws-1', 'n-1', 'Mis a jour', 'Nouveau contenu')

      expect(mockNotesApi.update).toHaveBeenCalledWith('ws-1', 'n-1', 'Mis a jour', 'Nouveau contenu')
    })

    it('rafraichit la liste des notes apres la mise a jour', async () => {
      const updatedNotes = [makeNote({ id: 'n-1', title: 'Nouveau titre' })]
      mockNotesApi.update.mockResolvedValue(undefined)
      mockNotesApi.list.mockResolvedValue(updatedNotes)

      await useNotesStore.getState().updateNote('ws-1', 'n-1', 'Nouveau titre')

      expect(useNotesStore.getState().notes).toEqual(updatedNotes)
      expect(mockNotesApi.list).toHaveBeenCalledWith('ws-1')
    })
  })

  describe('deleteNote', () => {
    it('supprime la note et rafraichit la liste', async () => {
      useNotesStore.setState({
        notes: [makeNote({ id: 'n-1' }), makeNote({ id: 'n-2' })],
        selectedNoteId: 'n-2',
      })
      mockNotesApi.delete.mockResolvedValue(undefined)
      mockNotesApi.list.mockResolvedValue([makeNote({ id: 'n-1' })])

      await useNotesStore.getState().deleteNote('ws-1', 'n-2')

      expect(mockNotesApi.delete).toHaveBeenCalledWith('ws-1', 'n-2')
      expect(useNotesStore.getState().notes).toHaveLength(1)
    })

    it('reinitialise selectedNoteId si la note supprimee etait selectionnee', async () => {
      useNotesStore.setState({ selectedNoteId: 'n-1' })
      const remaining = [makeNote({ id: 'n-2' })]
      mockNotesApi.delete.mockResolvedValue(undefined)
      mockNotesApi.list.mockResolvedValue(remaining)

      await useNotesStore.getState().deleteNote('ws-1', 'n-1')

      expect(useNotesStore.getState().selectedNoteId).toBe('n-2')
    })

    it('preserve selectedNoteId si une autre note a ete supprimee', async () => {
      useNotesStore.setState({ selectedNoteId: 'n-1' })
      mockNotesApi.delete.mockResolvedValue(undefined)
      mockNotesApi.list.mockResolvedValue([makeNote({ id: 'n-1' })])

      await useNotesStore.getState().deleteNote('ws-1', 'n-2')

      expect(useNotesStore.getState().selectedNoteId).toBe('n-1')
    })

    it('definit selectedNoteId a null si plus aucune note', async () => {
      useNotesStore.setState({ selectedNoteId: 'n-1' })
      mockNotesApi.delete.mockResolvedValue(undefined)
      mockNotesApi.list.mockResolvedValue([])

      await useNotesStore.getState().deleteNote('ws-1', 'n-1')

      expect(useNotesStore.getState().selectedNoteId).toBeNull()
    })
  })

  describe('selectNote', () => {
    it('definit selectedNoteId', () => {
      useNotesStore.getState().selectNote('n-42')
      expect(useNotesStore.getState().selectedNoteId).toBe('n-42')
    })

    it('accepte null pour deselectioner', () => {
      useNotesStore.getState().selectNote('n-1')
      useNotesStore.getState().selectNote(null)
      expect(useNotesStore.getState().selectedNoteId).toBeNull()
    })
  })
})
