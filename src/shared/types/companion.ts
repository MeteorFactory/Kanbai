export interface CompanionContext {
  workspaceId: string
  projectId?: string
  projectPath?: string
}

export interface CompanionCommandDef {
  name: string
  description: string
  params: Record<string, { type: string; required?: boolean; description: string }>
}

export interface CompanionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface CompanionFeature {
  readonly id: string
  readonly name: string
  readonly workspaceScoped: boolean
  readonly projectScoped: boolean
  getState(ctx: CompanionContext): Promise<CompanionResult>
  getCommands(): CompanionCommandDef[]
  execute(command: string, params: Record<string, unknown>, ctx: CompanionContext): Promise<CompanionResult>
}

export interface CompanionFeatureMeta {
  id: string
  name: string
  workspaceScoped: boolean
  projectScoped: boolean
  commands: CompanionCommandDef[]
}
