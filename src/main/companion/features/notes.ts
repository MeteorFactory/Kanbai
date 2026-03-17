import { v4 as uuid } from 'uuid'
import { loadNotes, saveNotes } from '../../ipc/notes'
import type { CompanionFeature, CompanionContext, CompanionResult, CompanionCommandDef } from '../../../shared/types/companion'

export const notesFeature: CompanionFeature = {
  id: 'notes',
  name: 'Notes',
  workspaceScoped: true,
  projectScoped: false,

  async getState(ctx: CompanionContext): Promise<CompanionResult> {
    const notes = loadNotes(ctx.workspaceId)
    return { success: true, data: notes.sort((a, b) => b.updatedAt - a.updatedAt) }
  },

  getCommands(): CompanionCommandDef[] {
    return [
      {
        name: 'get',
        description: 'Get a note by ID',
        params: {
          id: { type: 'string', required: true, description: 'Note ID' },
        },
      },
      {
        name: 'create',
        description: 'Create a new note',
        params: {
          title: { type: 'string', required: false, description: 'Note title' },
          content: { type: 'string', required: false, description: 'Note content' },
        },
      },
      {
        name: 'update',
        description: 'Update a note',
        params: {
          id: { type: 'string', required: true, description: 'Note ID' },
          title: { type: 'string', required: false, description: 'New title' },
          content: { type: 'string', required: false, description: 'New content' },
        },
      },
      {
        name: 'delete',
        description: 'Delete a note',
        params: {
          id: { type: 'string', required: true, description: 'Note ID' },
        },
      },
    ]
  },

  async execute(command: string, params: Record<string, unknown>, ctx: CompanionContext): Promise<CompanionResult> {
    const notes = loadNotes(ctx.workspaceId)

    if (command === 'get') {
      const id = params.id as string
      if (!id) return { success: false, error: 'Missing note id' }
      const note = notes.find((n) => n.id === id)
      if (!note) return { success: false, error: `Note not found: ${id}` }
      return { success: true, data: note }
    }

    if (command === 'create') {
      const note = {
        id: uuid(),
        title: (params.title as string) || 'Untitled',
        content: (params.content as string) || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      notes.push(note)
      saveNotes(ctx.workspaceId, notes)
      return { success: true, data: note }
    }

    if (command === 'update') {
      const id = params.id as string
      if (!id) return { success: false, error: 'Missing note id' }
      const idx = notes.findIndex((n) => n.id === id)
      if (idx < 0) return { success: false, error: `Note not found: ${id}` }

      const note = notes[idx]!
      if (params.title !== undefined) note.title = params.title as string
      if (params.content !== undefined) note.content = params.content as string
      note.updatedAt = Date.now()
      saveNotes(ctx.workspaceId, notes)
      return { success: true, data: note }
    }

    if (command === 'delete') {
      const id = params.id as string
      if (!id) return { success: false, error: 'Missing note id' }
      const filtered = notes.filter((n) => n.id !== id)
      if (filtered.length === notes.length) return { success: false, error: `Note not found: ${id}` }
      saveNotes(ctx.workspaceId, filtered)
      return { success: true }
    }

    return { success: false, error: `Unknown command: ${command}` }
  },
}
