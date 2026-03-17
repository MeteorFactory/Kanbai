import type { AiProviderId } from '../types/ai-provider'
import type { AiDefaults } from '../types'

/**
 * Resolve the primary AI provider for a given context.
 * Resolution chain: project -> workspace -> fallback ('claude')
 */
export function resolveAiProvider(
  project?: { aiProvider?: AiProviderId | null } | null,
  workspace?: { aiProvider?: AiProviderId | null } | null,
): AiProviderId {
  return project?.aiProvider ?? workspace?.aiProvider ?? 'claude'
}

/**
 * Resolve a feature-specific AI provider from defaults.
 * Resolution chain: project feature default -> project primary -> workspace feature default -> workspace primary -> fallback ('claude')
 */
export function resolveFeatureProvider(
  feature: keyof Pick<AiDefaults, 'kanban' | 'packages' | 'database'>,
  project?: { aiProvider?: AiProviderId | null; aiDefaults?: AiDefaults } | null,
  workspace?: { aiProvider?: AiProviderId | null; aiDefaults?: AiDefaults } | null,
): AiProviderId {
  return (
    project?.aiDefaults?.[feature] ??
    project?.aiProvider ??
    workspace?.aiDefaults?.[feature] ??
    workspace?.aiProvider ??
    'claude'
  )
}

/**
 * Resolve the model for a feature-specific AI provider from defaults.
 * Resolution chain: project model -> workspace model -> empty string
 */
export function resolveFeatureModel(
  feature: 'packagesModel' | 'databaseModel',
  project?: { aiDefaults?: AiDefaults } | null,
  workspace?: { aiDefaults?: AiDefaults } | null,
): string {
  return project?.aiDefaults?.[feature] ?? workspace?.aiDefaults?.[feature] ?? ''
}
