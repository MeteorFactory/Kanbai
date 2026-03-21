import { useState, useEffect, useCallback } from 'react'
import type { Namespace } from '../../../../shared/types'

interface UseGitConfigReturn {
  namespaces: Namespace[]
  selectedNamespaceId: string
  gitUserName: string
  setGitUserName: (value: string) => void
  gitUserEmail: string
  setGitUserEmail: (value: string) => void
  gitIsCustom: boolean
  gitLoading: boolean
  gitSaved: boolean
  setGitSaved: (value: boolean) => void
  handleGitNamespaceChange: (nsId: string) => void
  handleGitSave: () => Promise<void>
  handleGitReset: (confirmMessage: string) => Promise<void>
}

export function useGitConfig(): UseGitConfigReturn {
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<string>('')
  const [gitUserName, setGitUserName] = useState('')
  const [gitUserEmail, setGitUserEmail] = useState('')
  const [gitIsCustom, setGitIsCustom] = useState(false)
  const [gitLoading, setGitLoading] = useState(false)
  const [gitSaved, setGitSaved] = useState(false)

  const loadGitConfig = useCallback(async (nsId: string) => {
    if (!nsId) return
    setGitLoading(true)
    try {
      const config = await window.kanbai.gitConfig.get(nsId)
      setGitUserName(config.userName)
      setGitUserEmail(config.userEmail)
      setGitIsCustom(config.isCustom)
    } catch {
      setGitUserName('')
      setGitUserEmail('')
      setGitIsCustom(false)
    } finally {
      setGitLoading(false)
    }
  }, [])

  const handleGitNamespaceChange = useCallback((nsId: string) => {
    setSelectedNamespaceId(nsId)
    setGitSaved(false)
    loadGitConfig(nsId)
  }, [loadGitConfig])

  const handleGitSave = useCallback(async () => {
    if (!selectedNamespaceId) return
    setGitLoading(true)
    try {
      const result = await window.kanbai.gitConfig.set(selectedNamespaceId, gitUserName, gitUserEmail)
      setGitIsCustom(result.isCustom)
      setGitSaved(true)
      setTimeout(() => setGitSaved(false), 2000)
    } catch {
      // silently fail
    } finally {
      setGitLoading(false)
    }
  }, [selectedNamespaceId, gitUserName, gitUserEmail])

  const handleGitReset = useCallback(async (confirmMessage: string) => {
    if (!selectedNamespaceId || !confirm(confirmMessage)) return
    setGitLoading(true)
    try {
      await window.kanbai.gitConfig.delete(selectedNamespaceId)
      await loadGitConfig(selectedNamespaceId)
    } catch {
      // silently fail
    } finally {
      setGitLoading(false)
    }
  }, [selectedNamespaceId, loadGitConfig])

  useEffect(() => {
    window.kanbai.namespace.list().then((nsList) => {
      setNamespaces(nsList)
      const defaultNs = nsList.find((ns) => ns.isDefault)
      if (defaultNs) {
        setSelectedNamespaceId(defaultNs.id)
        loadGitConfig(defaultNs.id)
      }
    })
  }, [loadGitConfig])

  return {
    namespaces,
    selectedNamespaceId,
    gitUserName,
    setGitUserName,
    gitUserEmail,
    setGitUserEmail,
    gitIsCustom,
    gitLoading,
    gitSaved,
    setGitSaved,
    handleGitNamespaceChange,
    handleGitSave,
    handleGitReset,
  }
}
