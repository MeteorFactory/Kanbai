import { useState, useEffect, useCallback } from 'react'
import type { SshKeyInfo, SshKeyType } from '../../../../shared/types'

interface UseSshKeysReturn {
  sshKeys: SshKeyInfo[]
  sshLoading: boolean
  sshError: string | null
  setSshError: (value: string | null) => void
  showGenerateForm: boolean
  setShowGenerateForm: (value: boolean) => void
  showImportForm: boolean
  setShowImportForm: (value: boolean) => void
  genName: string
  setGenName: (value: string) => void
  genType: SshKeyType
  setGenType: (value: SshKeyType) => void
  genComment: string
  setGenComment: (value: string) => void
  genLoading: boolean
  importName: string
  setImportName: (value: string) => void
  importPrivateKey: string
  setImportPrivateKey: (value: string) => void
  importPublicKey: string
  setImportPublicKey: (value: string) => void
  copiedKeyId: string | null
  handleGenerateKey: () => Promise<void>
  handleImportKey: () => Promise<void>
  handleSelectKeyFile: () => Promise<void>
  handleCopyPublicKey: (key: SshKeyInfo) => Promise<void>
  handleDeleteKey: (key: SshKeyInfo, confirmMessage: string) => Promise<void>
  handleOpenSshDir: () => void
}

export function useSshKeys(): UseSshKeysReturn {
  const [sshKeys, setSshKeys] = useState<SshKeyInfo[]>([])
  const [sshLoading, setSshLoading] = useState(false)
  const [sshError, setSshError] = useState<string | null>(null)
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

  const loadSshKeys = useCallback(async () => {
    setSshLoading(true)
    setSshError(null)
    try {
      const result = await window.kanbai.ssh.listKeys()
      if (result.success) {
        setSshKeys(result.keys)
      } else {
        setSshError(result.error || 'Failed to load SSH keys')
      }
    } catch (err) {
      setSshError(String(err))
    } finally {
      setSshLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSshKeys()
  }, [loadSshKeys])

  const handleGenerateKey = useCallback(async () => {
    if (!genName.trim()) return
    setGenLoading(true)
    setSshError(null)
    try {
      const result = await window.kanbai.ssh.generateKey(genName.trim(), genType, genComment.trim())
      if (result.success) {
        setShowGenerateForm(false)
        setGenName('id_ed25519')
        setGenType('ed25519')
        setGenComment('')
        await loadSshKeys()
      } else {
        setSshError(result.error || 'Generation failed')
      }
    } catch (err) {
      setSshError(String(err))
    } finally {
      setGenLoading(false)
    }
  }, [genName, genType, genComment, loadSshKeys])

  const handleImportKey = useCallback(async () => {
    if (!importName.trim() || !importPrivateKey.trim()) return
    setSshError(null)
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
        await loadSshKeys()
      } else {
        setSshError(result.error || 'Import failed')
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [importName, importPrivateKey, importPublicKey, loadSshKeys])

  const handleSelectKeyFile = useCallback(async () => {
    setSshError(null)
    try {
      const result = await window.kanbai.ssh.selectKeyFile()
      if (result.success && result.content && result.fileName) {
        setImportName(result.fileName)
        setImportPrivateKey(result.content)
        setShowImportForm(true)
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [])

  const handleCopyPublicKey = useCallback(async (key: SshKeyInfo) => {
    if (!key.publicKeyPath) return
    try {
      const result = await window.kanbai.ssh.readPublicKey(key.publicKeyPath)
      if (result.success) {
        await navigator.clipboard.writeText(result.content)
        setCopiedKeyId(key.id)
        setTimeout(() => setCopiedKeyId(null), 2000)
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [])

  const handleDeleteKey = useCallback(async (key: SshKeyInfo, confirmMessage: string) => {
    if (!confirm(confirmMessage)) return
    setSshError(null)
    try {
      const result = await window.kanbai.ssh.deleteKey(key.name)
      if (result.success) {
        await loadSshKeys()
      } else {
        setSshError(result.error || 'Delete failed')
      }
    } catch (err) {
      setSshError(String(err))
    }
  }, [loadSshKeys])

  const handleOpenSshDir = useCallback(() => {
    window.kanbai.ssh.openDirectory()
  }, [])

  return {
    sshKeys,
    sshLoading,
    sshError,
    setSshError,
    showGenerateForm,
    setShowGenerateForm,
    showImportForm,
    setShowImportForm,
    genName,
    setGenName,
    genType,
    setGenType,
    genComment,
    setGenComment,
    genLoading,
    importName,
    setImportName,
    importPrivateKey,
    setImportPrivateKey,
    importPublicKey,
    setImportPublicKey,
    copiedKeyId,
    handleGenerateKey,
    handleImportKey,
    handleSelectKeyFile,
    handleCopyPublicKey,
    handleDeleteKey,
    handleOpenSshDir,
  }
}
