import { IpcMain } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { IPC_CHANNELS } from '../../shared/types'

export function registerCodexConfigHandlers(ipcMain: IpcMain): void {
  // Check if .codex/config.toml exists in a project
  ipcMain.handle(
    IPC_CHANNELS.CODEX_CHECK_CONFIG,
    async (_event, { projectPath }: { projectPath: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      const configPath = path.join(projectPath, '.codex', 'config.toml')
      return { exists: fs.existsSync(configPath) }
    },
  )

  // Read .codex/config.toml
  ipcMain.handle(
    IPC_CHANNELS.CODEX_READ_CONFIG,
    async (_event, { projectPath }: { projectPath: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      const configPath = path.join(projectPath, '.codex', 'config.toml')
      if (!fs.existsSync(configPath)) {
        return { success: true, content: '' }
      }
      try {
        const content = fs.readFileSync(configPath, 'utf-8')
        return { success: true, content }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Write .codex/config.toml
  ipcMain.handle(
    IPC_CHANNELS.CODEX_WRITE_CONFIG,
    async (_event, { projectPath, config }: { projectPath: string; config: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof config !== 'string') throw new Error('Invalid config content')
      const codexDir = path.join(projectPath, '.codex')
      try {
        if (!fs.existsSync(codexDir)) {
          fs.mkdirSync(codexDir, { recursive: true })
        }
        fs.writeFileSync(path.join(codexDir, 'config.toml'), config, 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Global config (~/.codex/config.toml) ---

  ipcMain.handle(IPC_CHANNELS.CODEX_CHECK_GLOBAL_CONFIG, async () => {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml')
    return { exists: fs.existsSync(configPath) }
  })

  ipcMain.handle(IPC_CHANNELS.CODEX_READ_GLOBAL_CONFIG, async () => {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml')
    if (!fs.existsSync(configPath)) {
      return { success: true, content: '' }
    }
    try {
      const content = fs.readFileSync(configPath, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CODEX_WRITE_GLOBAL_CONFIG,
    async (_event, { config }: { config: string }) => {
      if (typeof config !== 'string') throw new Error('Invalid config content')
      const codexDir = path.join(os.homedir(), '.codex')
      try {
        if (!fs.existsSync(codexDir)) {
          fs.mkdirSync(codexDir, { recursive: true })
        }
        fs.writeFileSync(path.join(codexDir, 'config.toml'), config, 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // --- Codex Rules (.codex/rules/*.rules) ---

  ipcMain.handle(
    IPC_CHANNELS.CODEX_LIST_RULES,
    async (_event, { projectPath }: { projectPath: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      const rulesDir = path.join(projectPath, '.codex', 'rules')
      if (!fs.existsSync(rulesDir)) return []
      const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.rules'))
      return files.map((f) => ({ name: f.replace(/\.rules$/, ''), filename: f }))
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_READ_RULE,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof filename !== 'string') throw new Error('Invalid filename')
      const filePath = path.join(projectPath, '.codex', 'rules', path.basename(filename))
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_WRITE_RULE,
    async (_event, { projectPath, filename, content }: { projectPath: string; filename: string; content: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof filename !== 'string') throw new Error('Invalid filename')
      if (typeof content !== 'string') throw new Error('Invalid content')
      const rulesDir = path.join(projectPath, '.codex', 'rules')
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, path.basename(filename)), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_DELETE_RULE,
    async (_event, { projectPath, filename }: { projectPath: string; filename: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof filename !== 'string') throw new Error('Invalid filename')
      const filePath = path.join(projectPath, '.codex', 'rules', path.basename(filename))
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    },
  )

  // --- Codex AGENTS.md (memory) ---

  ipcMain.handle(
    IPC_CHANNELS.CODEX_READ_AGENTS_MD,
    async (_event, { projectPath }: { projectPath: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      const filePath = path.join(projectPath, 'AGENTS.md')
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_WRITE_AGENTS_MD,
    async (_event, { projectPath, content }: { projectPath: string; content: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof content !== 'string') throw new Error('Invalid content')
      fs.writeFileSync(path.join(projectPath, 'AGENTS.md'), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_READ_GLOBAL_AGENTS_MD,
    async () => {
      const filePath = path.join(os.homedir(), '.codex', 'AGENTS.md')
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_WRITE_GLOBAL_AGENTS_MD,
    async (_event, { content }: { content: string }) => {
      if (typeof content !== 'string') throw new Error('Invalid content')
      const codexDir = path.join(os.homedir(), '.codex')
      if (!fs.existsSync(codexDir)) fs.mkdirSync(codexDir, { recursive: true })
      fs.writeFileSync(path.join(codexDir, 'AGENTS.md'), content, 'utf-8')
      return { success: true }
    },
  )

  // --- Codex Skills (.agents/skills/*/SKILL.md) ---

  ipcMain.handle(
    IPC_CHANNELS.CODEX_LIST_SKILLS,
    async (_event, { projectPath }: { projectPath: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      const skillsDir = path.join(projectPath, '.agents', 'skills')
      if (!fs.existsSync(skillsDir)) return []
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      return entries
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md')))
        .map((e) => ({ name: e.name, dirname: e.name }))
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_READ_SKILL,
    async (_event, { projectPath, dirname }: { projectPath: string; dirname: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof dirname !== 'string') throw new Error('Invalid dirname')
      const filePath = path.join(projectPath, '.agents', 'skills', path.basename(dirname), 'SKILL.md')
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_WRITE_SKILL,
    async (_event, { projectPath, dirname, content }: { projectPath: string; dirname: string; content: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof dirname !== 'string') throw new Error('Invalid dirname')
      if (typeof content !== 'string') throw new Error('Invalid content')
      const skillDir = path.join(projectPath, '.agents', 'skills', path.basename(dirname))
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CODEX_DELETE_SKILL,
    async (_event, { projectPath, dirname }: { projectPath: string; dirname: string }) => {
      if (typeof projectPath !== 'string') throw new Error('Invalid project path')
      if (typeof dirname !== 'string') throw new Error('Invalid dirname')
      const skillDir = path.join(projectPath, '.agents', 'skills', path.basename(dirname))
      if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true })
      return { success: true }
    },
  )
}
