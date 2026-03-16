import { useState, useEffect, useCallback } from 'react'

/**
 * Full Gemini CLI settings.json schema.
 * All fields are optional — only non-default values are persisted.
 */
export interface GeminiFullConfig {
  general?: {
    vimMode?: boolean
    defaultApprovalMode?: string
    enableAutoUpdate?: boolean
    enableNotifications?: boolean
    plan?: {
      directory?: string
      modelRouting?: boolean
    }
    maxAttempts?: number
    debugKeystrokeLogging?: boolean
    sessionRetention?: {
      enabled?: boolean
      maxAge?: string
    }
  }
  output?: {
    format?: string
  }
  ui?: {
    autoThemeSwitching?: boolean
    terminalBackgroundPollingInterval?: number
    hideWindowTitle?: boolean
    inlineThinkingMode?: string
    showStatusInTitle?: boolean
    dynamicWindowTitle?: boolean
    showHomeDirectoryWarning?: boolean
    showCompatibilityWarnings?: boolean
    hideTips?: boolean
    showShortcutsHint?: boolean
    hideBanner?: boolean
    hideContextSummary?: boolean
    footer?: {
      hideCWD?: boolean
      hideSandboxStatus?: boolean
      hideModelInfo?: boolean
      hideContextPercentage?: boolean
    }
    hideFooter?: boolean
    showMemoryUsage?: boolean
    showLineNumbers?: boolean
    showCitations?: boolean
    showModelInfoInChat?: boolean
    showUserIdentity?: boolean
    useAlternateBuffer?: boolean
    useBackgroundColor?: boolean
    incrementalRendering?: boolean
    showSpinner?: boolean
    loadingPhrases?: string
    errorVerbosity?: string
    accessibility?: {
      screenReader?: boolean
    }
  }
  ide?: {
    enabled?: boolean
  }
  billing?: {
    overageStrategy?: string
  }
  model?: {
    name?: string
    maxSessionTurns?: number
    compressionThreshold?: number
    disableLoopDetection?: boolean
    skipNextSpeakerCheck?: boolean
  }
  context?: {
    discoveryMaxDirs?: number
    loadMemoryFromIncludeDirectories?: boolean
    fileFiltering?: {
      respectGitIgnore?: boolean
      respectGeminiIgnore?: boolean
      enableRecursiveFileSearch?: boolean
      enableFuzzySearch?: boolean
      customIgnoreFilePaths?: string[]
    }
  }
  tools?: {
    shell?: {
      enableInteractiveShell?: boolean
      showColor?: boolean
    }
    useRipgrep?: boolean
    truncateToolOutputThreshold?: number
    disableLLMCorrection?: boolean
  }
  security?: {
    disableYoloMode?: boolean
    enablePermanentToolApproval?: boolean
    blockGitExtensions?: boolean
    allowedExtensions?: string[]
    folderTrust?: {
      enabled?: boolean
    }
    environmentVariableRedaction?: {
      enabled?: boolean
    }
    enableConseca?: boolean
  }
  advanced?: {
    autoConfigureMemory?: boolean
  }
  experimental?: {
    toolOutputMasking?: {
      enabled?: boolean
    }
    useOSC52Paste?: boolean
    useOSC52Copy?: boolean
    plan?: boolean
    modelSteering?: boolean
    directWebFetch?: boolean
    gemmaModelRouter?: {
      enabled?: boolean
    }
    enableAgents?: boolean
  }
  skills?: {
    enabled?: boolean
  }
  hooksConfig?: {
    enabled?: boolean
    notifications?: boolean
  }
}

interface UseGeminiConfigReturn {
  config: GeminiFullConfig
  rawContent: string
  exists: boolean
  loading: boolean
  saved: boolean
  updateConfig: (patch: Partial<GeminiFullConfig>) => Promise<void>
  updateSection: <K extends keyof GeminiFullConfig>(section: K, value: GeminiFullConfig[K]) => Promise<void>
  saveRaw: (content: string) => Promise<void>
  createConfig: () => Promise<void>
  reload: () => Promise<void>
}

export function useGeminiConfig(projectPath: string): UseGeminiConfigReturn {
  const [config, setConfig] = useState<GeminiFullConfig>({})
  const [rawContent, setRawContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const flash = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const check = await window.kanbai.geminiConfig.check(projectPath)
      setExists(check.exists)
      if (check.exists) {
        const result = await window.kanbai.geminiConfig.read(projectPath)
        if (result.success && result.content) {
          setRawContent(result.content)
          try {
            setConfig(JSON.parse(result.content))
          } catch {
            setConfig({})
          }
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const writeConfig = useCallback(async (newConfig: GeminiFullConfig) => {
    const json = JSON.stringify(newConfig, null, 2)
    setConfig(newConfig)
    setRawContent(json)
    await window.kanbai.geminiConfig.write(projectPath, json)
    setExists(true)
    flash()
  }, [projectPath, flash])

  const updateConfig = useCallback(async (patch: Partial<GeminiFullConfig>) => {
    const merged = { ...config, ...patch }
    await writeConfig(merged)
  }, [config, writeConfig])

  const updateSection = useCallback(async <K extends keyof GeminiFullConfig>(
    section: K,
    value: GeminiFullConfig[K],
  ) => {
    const merged = { ...config, [section]: value }
    await writeConfig(merged)
  }, [config, writeConfig])

  const saveRaw = useCallback(async (content: string) => {
    await window.kanbai.geminiConfig.write(projectPath, content)
    setRawContent(content)
    try {
      setConfig(JSON.parse(content))
    } catch {
      setConfig({})
    }
    setExists(true)
    flash()
  }, [projectPath, flash])

  const createConfig = useCallback(async () => {
    await writeConfig({})
  }, [writeConfig])

  return { config, rawContent, exists, loading, saved, updateConfig, updateSection, saveRaw, createConfig, reload: load }
}
