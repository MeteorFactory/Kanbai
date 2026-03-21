import { useState, useEffect } from 'react'
import type { AiDefaults } from '../../../../shared/types'

interface UseAiDefaultsReturn {
  aiGlobalDefaults: AiDefaults | null
  setAiGlobalDefaults: (defaults: AiDefaults | null) => void
  aiProjectDefaults: AiDefaults | null
  setAiProjectDefaults: (defaults: AiDefaults | null) => void
  aiProjectLoading: boolean
}

export function useAiDefaults(
  activeProjectId: string | null,
): UseAiDefaultsReturn {
  const [aiGlobalDefaults, setAiGlobalDefaults] = useState<AiDefaults | null>(null)
  const [aiProjectDefaults, setAiProjectDefaults] = useState<AiDefaults | null>(null)
  const [aiProjectLoading, setAiProjectLoading] = useState(false)

  useEffect(() => {
    window.kanbai.aiDefaults.getGlobal().then(setAiGlobalDefaults).catch(() => {})
    if (activeProjectId) {
      setAiProjectLoading(true)
      window.kanbai.aiDefaults.get(activeProjectId).then((d: AiDefaults) => {
        setAiProjectDefaults(d ?? {})
      }).catch(() => {
        setAiProjectDefaults(null)
      }).finally(() => {
        setAiProjectLoading(false)
      })
    }
  }, [activeProjectId])

  return {
    aiGlobalDefaults,
    setAiGlobalDefaults,
    aiProjectDefaults,
    setAiProjectDefaults,
    aiProjectLoading,
  }
}
