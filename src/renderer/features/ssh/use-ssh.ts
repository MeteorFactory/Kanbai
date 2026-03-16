import { useState, useCallback } from 'react'
import type { SshKeyInfo, SshKeyType } from '../../../shared/types'

interface UseSshReturn {
  // State
  keys: SshKeyInfo[]
  loading: boolean
  error: string | null
  showGenerateForm: boolean
  showImportForm: boolean
  genName: string
  genType: SshKeyType
  genComment: string
  genLoading: boolean
  importName: string
  importPrivateKey: string
  importPublicKey: string
  copiedKeyId: string | null

  // Setters
  setShowGenerateForm: (show: boolean) => void
  setShowImportForm: (show: boolean) => void
  setGenName: (name: string) => void
  setGenType: (type: SshKeyType) => void
  setGenComment: (comment: string) => void
  setImportName: (name: string) => void
  setImportPrivateKey: (key: string) => void
  setImportPublicKey: (key: string) => void

  // Actions
  loadKeys: () => Promise<void>
  generateKey: () => Promise<void>
  importKey: () => Promise<void>
  selectKeyFile: () => Promise<void>
  copyPublicKey: (key: SshKeyInfo) => Promise<void>
  deleteKey: (key: SshKeyInfo) => Promise<void>
  openDirectory: () => void
}

export function useSsh(): UseSshReturn {
  const [keys, setKeys] = useState<SshKeyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [genName, setGenName] = useState('id_ed25519')
  const [genType, setGenType] = useState<SshKeyType>('ed25519')
  const [genComment, setGenComment] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [importName, setImportName] = useState('')
  const [importPrivateKey, setImportPrivateKey] = useState('')
  const [importPublicKey, setImportPublicKey] = useState('')
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.kanbai.ssh.listKeys()
      if (result.success) {
        setKeys(result.keys)
      } else {
        setError(result.error || 'Failed to load SSH keys')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const generateKey = useCallback(async () => {
    if (!genName.trim()) return
    setGenLoading(true)
    setError(null)
    try {
      const result = await window.kanbai.ssh.generateKey(genName.trim(), genType, genComment.trim())
      if (result.success) {
        setShowGenerateForm(false)
        setGenName('id_ed25519')
        setGenType('ed25519')
        setGenComment('')
        await loadKeys()
      } else {
        setError(result.error || 'Generation failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setGenLoading(false)
    }
  }, [genName, genType, genComment, loadKeys])

  const importKey = useCallback(async () => {
    if (!importName.trim() || !importPrivateKey.trim()) return
    setError(null)
    try {
      const result = await window.kanbai.ssh.importKey(
        importName.trim(),
        importPrivateKey,
        importPublicKey || undefined,
      )
      if (result.success) {
        setShowImportForm(false)
        setImportName('')
        setImportPrivateKey('')
        setImportPublicKey('')
        await loadKeys()
      } else {
        setError(result.error || 'Import failed')
      }
    } catch (err) {
      setError(String(err))
    }
  }, [importName, importPrivateKey, importPublicKey, loadKeys])

  const selectKeyFile = useCallback(async () => {
    setError(null)
    try {
      const result = await window.kanbai.ssh.selectKeyFile()
      if (result.success && result.content && result.fileName) {
        setImportName(result.fileName)
        setImportPrivateKey(result.content)
        setShowImportForm(true)
      }
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const copyPublicKey = useCallback(async (key: SshKeyInfo) => {
    if (!key.publicKeyPath) return
    try {
      const result = await window.kanbai.ssh.readPublicKey(key.publicKeyPath)
      if (result.success) {
        await navigator.clipboard.writeText(result.content)
        setCopiedKeyId(key.id)
        setTimeout(() => setCopiedKeyId(null), 2000)
      }
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const deleteKey = useCallback(async (key: SshKeyInfo) => {
    setError(null)
    try {
      const result = await window.kanbai.ssh.deleteKey(key.name)
      if (result.success) {
        await loadKeys()
      } else {
        setError(result.error || 'Delete failed')
      }
    } catch (err) {
      setError(String(err))
    }
  }, [loadKeys])

  const openDirectory = useCallback(() => {
    window.kanbai.ssh.openDirectory()
  }, [])

  return {
    keys,
    loading,
    error,
    showGenerateForm,
    showImportForm,
    genName,
    genType,
    genComment,
    genLoading,
    importName,
    importPrivateKey,
    importPublicKey,
    copiedKeyId,
    setShowGenerateForm,
    setShowImportForm,
    setGenName,
    setGenType,
    setGenComment,
    setImportName,
    setImportPrivateKey,
    setImportPublicKey,
    loadKeys,
    generateKey,
    importKey,
    selectKeyFile,
    copyPublicKey,
    deleteKey,
    openDirectory,
  }
}
