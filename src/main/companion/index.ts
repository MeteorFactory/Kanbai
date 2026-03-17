import { companionRegistry } from './registry'
import { workspaceFeature } from './features/workspace'
import { projectFeature } from './features/project'
import { kanbanFeature } from './features/kanban'
import { notesFeature } from './features/notes'
import { gitFeature } from './features/git'
import { healthcheckFeature } from './features/healthcheck'
import { terminalFeature } from './features/terminal'
import { claudeFeature } from './features/claude'
import { databaseFeature } from './features/database'
import { devopsFeature } from './features/devops'
import { packagesFeature } from './features/packages'
import { settingsFeature } from './features/settings'

export function initCompanionFeatures(): void {
  companionRegistry.register(workspaceFeature)
  companionRegistry.register(projectFeature)
  companionRegistry.register(kanbanFeature)
  companionRegistry.register(notesFeature)
  companionRegistry.register(gitFeature)
  companionRegistry.register(healthcheckFeature)
  companionRegistry.register(terminalFeature)
  companionRegistry.register(claudeFeature)
  companionRegistry.register(databaseFeature)
  companionRegistry.register(devopsFeature)
  companionRegistry.register(packagesFeature)
  companionRegistry.register(settingsFeature)
  console.log(`[Companion] ${companionRegistry.listFeatures().length} features registered`)
}

export { companionRegistry } from './registry'
