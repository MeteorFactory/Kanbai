import { useCallback } from 'react'
import { ModelSelector } from './model-selector'
import { EffortSlider } from './effort-slider'
import { ModelPinningSection } from './model-pinning-section'
import { PromptCachingSection } from '../../components/prompt-caching-section'
import { ExtendedContextSection } from '../../components/extended-context-section'

interface Props {
  settings: Record<string, unknown>
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export function ModelPerformanceTab({ settings, onSettingsChange }: Props) {
  const model = (settings.model as string) ?? ''
  const effortLevel = (settings.effortLevel as 'low' | 'medium' | 'high') ?? 'high'

  const handleModelChange = useCallback((m: string) => {
    const next = { ...settings }
    if (m) next.model = m
    else delete next.model
    onSettingsChange(next)
  }, [settings, onSettingsChange])

  const handleEffortChange = useCallback((level: 'low' | 'medium' | 'high') => {
    const next = { ...settings, effortLevel: level }
    onSettingsChange(next)
  }, [settings, onSettingsChange])

  return (
    <div className="cs-model-config">
      <ModelSelector
        model={model}
        onModelChange={handleModelChange}
      />
      <EffortSlider value={effortLevel} onChange={handleEffortChange} />
      <ModelPinningSection settings={settings} onSettingsChange={onSettingsChange} />
      <PromptCachingSection settings={settings} onSettingsChange={onSettingsChange} />
      <ExtendedContextSection settings={settings} onSettingsChange={onSettingsChange} />
    </div>
  )
}
