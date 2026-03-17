import { describe, it, expect } from 'vitest'
import { resolveAiProvider, resolveFeatureProvider, resolveFeatureModel } from '../../src/shared/utils/ai-provider-resolver'

describe('resolveAiProvider', () => {
  it('returns project provider when set', () => {
    expect(resolveAiProvider({ aiProvider: 'codex' }, { aiProvider: 'gemini' })).toBe('codex')
  })

  it('falls back to workspace provider when project has none', () => {
    expect(resolveAiProvider({ aiProvider: null }, { aiProvider: 'gemini' })).toBe('gemini')
  })

  it('falls back to workspace provider when project is undefined', () => {
    expect(resolveAiProvider(undefined, { aiProvider: 'codex' })).toBe('codex')
  })

  it('falls back to claude when neither project nor workspace have a provider', () => {
    expect(resolveAiProvider(null, null)).toBe('claude')
    expect(resolveAiProvider(undefined, undefined)).toBe('claude')
  })

  it('falls back to claude when no arguments provided', () => {
    expect(resolveAiProvider()).toBe('claude')
  })
})

describe('resolveFeatureProvider', () => {
  it('returns project feature default when set', () => {
    expect(resolveFeatureProvider('kanban', { aiProvider: 'codex', aiDefaults: { kanban: 'gemini' } }, null)).toBe('gemini')
  })

  it('falls back to project primary provider when feature default is missing', () => {
    expect(resolveFeatureProvider('kanban', { aiProvider: 'codex', aiDefaults: {} }, null)).toBe('codex')
  })

  it('falls back to workspace feature default when project has none', () => {
    expect(resolveFeatureProvider('database', { aiProvider: null }, { aiProvider: 'codex', aiDefaults: { database: 'gemini' } })).toBe('gemini')
  })

  it('falls back to workspace primary provider when no feature defaults exist', () => {
    expect(resolveFeatureProvider('packages', null, { aiProvider: 'codex' })).toBe('codex')
  })

  it('falls back to claude when nothing is set', () => {
    expect(resolveFeatureProvider('kanban', null, null)).toBe('claude')
  })

  it('respects full resolution chain order', () => {
    const project = { aiProvider: 'codex' as const, aiDefaults: { kanban: 'gemini' as const } }
    const workspace = { aiProvider: 'copilot' as const, aiDefaults: { kanban: 'claude' as const } }
    expect(resolveFeatureProvider('kanban', project, workspace)).toBe('gemini')
  })
})

describe('resolveFeatureModel', () => {
  it('returns project model when set', () => {
    expect(resolveFeatureModel('packagesModel', { aiDefaults: { packagesModel: 'gpt-4' } }, null)).toBe('gpt-4')
  })

  it('falls back to workspace model when project has none', () => {
    expect(resolveFeatureModel('databaseModel', null, { aiDefaults: { databaseModel: 'gemini-pro' } })).toBe('gemini-pro')
  })

  it('returns empty string when no model set', () => {
    expect(resolveFeatureModel('packagesModel', null, null)).toBe('')
  })
})
