import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import { IPC_CHANNELS, Note } from '../../shared/types'

const NOTES_DIR = path.join(os.homedir(), '.kanbai', 'notes-workspace')

function ensureNotesDir(): void {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true })
  }
}

function getNotesFilePath(workspaceId: string): string {
  return path.join(NOTES_DIR, `${workspaceId}.json`)
}

export function loadNotes(workspaceId: string): Note[] {
  const filePath = getNotesFilePath(workspaceId)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as Note[]
  } catch {
    return []
  }
}

export function saveNotes(workspaceId: string, notes: Note[]): void {
  ensureNotesDir()
  const filePath = getNotesFilePath(workspaceId)
  fs.writeFileSync(filePath, JSON.stringify(notes, null, 2), 'utf-8')
}

export function registerNotesHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.NOTES_LIST,
    async (_event, { workspaceId }: { workspaceId: string }): Promise<Note[]> => {
      const notes = loadNotes(workspaceId)
      return notes.sort((a, b) => b.updatedAt - a.updatedAt)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_CREATE,
    async (_event, { workspaceId, title, content }: { workspaceId: string; title: string; content: string }): Promise<Note> => {
      const notes = loadNotes(workspaceId)
      const note: Note = {
        id: uuid(),
        title: title || 'Untitled',
        content: content || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      notes.push(note)
      saveNotes(workspaceId, notes)
      return note
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_UPDATE,
    async (_event, { workspaceId, id, title, content }: { workspaceId: string; id: string; title?: string; content?: string }): Promise<Note | null> => {
      const notes = loadNotes(workspaceId)
      const idx = notes.findIndex((n) => n.id === id)
      if (idx < 0) return null
      if (title !== undefined) notes[idx]!.title = title
      if (content !== undefined) notes[idx]!.content = content
      notes[idx]!.updatedAt = Date.now()
      saveNotes(workspaceId, notes)
      return notes[idx]!
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTES_DELETE,
    async (_event, { workspaceId, id }: { workspaceId: string; id: string }): Promise<void> => {
      const notes = loadNotes(workspaceId)
      const filtered = notes.filter((n) => n.id !== id)
      saveNotes(workspaceId, filtered)
    },
  )
}
