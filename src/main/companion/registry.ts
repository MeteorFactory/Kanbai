import type { CompanionFeature, CompanionFeatureMeta } from '../../shared/types/companion'

class CompanionRegistry {
  private features = new Map<string, CompanionFeature>()

  register(feature: CompanionFeature): void {
    if (this.features.has(feature.id)) {
      console.warn(`[CompanionRegistry] Feature "${feature.id}" already registered, overwriting`)
    }
    this.features.set(feature.id, feature)
  }

  get(id: string): CompanionFeature | undefined {
    return this.features.get(id)
  }

  listFeatures(): CompanionFeatureMeta[] {
    const result: CompanionFeatureMeta[] = []
    for (const feature of this.features.values()) {
      result.push({
        id: feature.id,
        name: feature.name,
        workspaceScoped: feature.workspaceScoped,
        projectScoped: feature.projectScoped,
        commands: feature.getCommands(),
      })
    }
    return result
  }
}

export const companionRegistry = new CompanionRegistry()
