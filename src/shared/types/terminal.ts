// Terminal types

export interface TerminalSession {
  id: string
  projectId?: string
  title: string
  cwd: string
  shell: string
  pid?: number
  isActive: boolean
}

export interface TerminalTab {
  id: string
  label: string
  color?: string
  panes: TerminalPane[]
  activePane: string
}

export interface TerminalPane {
  id: string
  sessionId: string
  splitDirection?: 'horizontal' | 'vertical'
  size: number // percentage
}
