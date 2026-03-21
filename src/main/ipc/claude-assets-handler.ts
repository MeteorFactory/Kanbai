import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'

import { IPC_CHANNELS } from '../../shared/types/index'

export function registerClaudeAssetsHandlers(ipcMain: IpcMain): void {
  // --- Claude Agents (.claude/agents/*.md) ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_LIST_AGENTS,
    async (_event, { projectPath }: { projectPath: string }) => {
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      if (!fs.existsSync(agentsDir)) return []
      try {
        const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') || f.endsWith('.md.disabled'))
        return files.map((f) => ({
          name: f.replace(/\.md(\.disabled)?$/, ''),
          filename: f,
        }))
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_READ_AGENT,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'agents', filename)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_WRITE_AGENT,
    async (_event, { projectPath, filename, content }: { projectPath: string; filename: string; content: string }) => {
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true })
      fs.writeFileSync(path.join(agentsDir, filename), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_DELETE_AGENT,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'agents', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    },
  )

  // Rename agent file (for enable/disable toggle)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_RENAME_AGENT,
    async (_event, { projectPath, oldFilename, newFilename }: { projectPath: string; oldFilename: string; newFilename: string }) => {
      try {
        const agentsDir = path.join(projectPath, '.claude', 'agents')
        fs.renameSync(path.join(agentsDir, oldFilename), path.join(agentsDir, newFilename))
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },
  )

  // --- Claude Skills (.claude/skills/*.md) ---

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_LIST_SKILLS,
    async (_event, { projectPath }: { projectPath: string }) => {
      const skillsDir = path.join(projectPath, '.claude', 'skills')
      if (!fs.existsSync(skillsDir)) return []
      try {
        const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md') || f.endsWith('.md.disabled'))
        return files.map((f) => ({
          name: f.replace(/\.md(\.disabled)?$/, ''),
          filename: f,
        }))
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_READ_SKILL,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'skills', filename)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_WRITE_SKILL,
    async (_event, { projectPath, filename, content }: { projectPath: string; filename: string; content: string }) => {
      const skillsDir = path.join(projectPath, '.claude', 'skills')
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true })
      fs.writeFileSync(path.join(skillsDir, filename), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_DELETE_SKILL,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      const filePath = path.join(projectPath, '.claude', 'skills', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    },
  )

  // Rename skill file (for enable/disable toggle)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_RENAME_SKILL,
    async (_event, { projectPath, oldFilename, newFilename }: { projectPath: string; oldFilename: string; newFilename: string }) => {
      try {
        const skillsDir = path.join(projectPath, '.claude', 'skills')
        fs.renameSync(path.join(skillsDir, oldFilename), path.join(skillsDir, newFilename))
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },
  )
}
