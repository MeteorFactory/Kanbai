import { useState, useEffect, useCallback } from 'react'
import { RuleEntry, TemplateRuleEntry } from '../../../../shared/types'
import { updateAuthorFrontmatter } from './treeUtils'

export interface SharedRule {
  filename: string
  fullPath: string
  content: string
}

export interface Selection {
  relativePath: string
  source: 'local' | 'available' | 'template'
}

export function useRulesState(projectPath: string) {
  const [rules, setRules] = useState<RuleEntry[]>([])
  const [directories, setDirectories] = useState<string[]>([])
  const [sharedRules, setSharedRules] = useState<SharedRule[]>([])
  const [templates, setTemplates] = useState<TemplateRuleEntry[]>([])
  const [selected, setSelected] = useState<Selection | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingDir, setCreatingDir] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)
  const [confirmOverwriteShared, setConfirmOverwriteShared] = useState<{
    filename: string
    content: string
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [gitUserName, setGitUserName] = useState<string>('')

  // Get git user name for co-authoring
  useEffect(() => {
    if (window.mirehub.gitConfig) {
      // Use empty namespaceId to get global config
      window.mirehub.gitConfig.get('').then((config: { userName: string }) => {
        if (config.userName) setGitUserName(config.userName.trim())
      }).catch(() => { /* ignore */ })
    }
  }, [])

  const load = useCallback(async () => {
    const [listResult, shared, templateList] = await Promise.all([
      window.mirehub.claudeMemory.listRules(projectPath),
      window.mirehub.claudeMemory.listSharedRules(),
      window.mirehub.claudeMemory.listTemplates(),
    ])
    setRules(listResult.rules)
    setDirectories(listResult.directories)
    setSharedRules(shared)
    setTemplates(templateList)
    return listResult.rules
  }, [projectPath])

  // Initial load + auto-check ai-rules for updates (respects 24h debounce)
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      await load()
      setSyncing(true)
      try {
        await window.mirehub.claudeMemory.checkAiRules(projectPath)
        if (!cancelled) await load()
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [load, projectPath])

  // Auto-select first rule if none selected
  useEffect(() => {
    if (!selected && rules.length > 0) {
      setSelected({ relativePath: rules[0]!.relativePath, source: 'local' })
    }
  }, [rules, selected])

  const selectedRule = selected?.source === 'local'
    ? rules.find((r) => r.relativePath === selected.relativePath)
    : null

  const selectedAvailable = selected?.source === 'available'
    ? sharedRules.find((s) => s.filename === selected.relativePath)
    : null

  const selectedTemplate = selected?.source === 'template'
    ? templates.find((t) => t.relativePath === selected.relativePath)
    : null

  const localRules = rules.filter((r) => !r.isSymlink)
  const linkedRules = rules.filter((r) => r.isSymlink)

  const availableShared = sharedRules.filter(
    (s) => !rules.some((r) => r.filename === s.filename && r.isSymlink),
  )

  const conflictingLocals = new Set(
    localRules
      .filter((r) => sharedRules.some((s) => s.filename === r.filename))
      .map((r) => r.relativePath),
  )

  // Determine the parent directory for creating new items based on selection
  const getParentDir = useCallback((): string => {
    if (!selected || selected.source !== 'local') return ''
    const rule = rules.find((r) => r.relativePath === selected.relativePath)
    if (rule) {
      const parts = rule.relativePath.split('/')
      return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    }
    // Might be a directory itself
    if (directories.includes(selected.relativePath)) return selected.relativePath
    return ''
  }, [selected, rules, directories])

  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    const filename = name.endsWith('.md') ? name : name + '.md'
    const parentDir = getParentDir()
    const relativePath = parentDir ? parentDir + '/' + filename : filename
    await window.mirehub.claudeMemory.writeRule(projectPath, relativePath, `# ${name.replace('.md', '')}\n\n`)
    setCreating(false)
    setNewName('')
    setSelected({ relativePath, source: 'local' })
    await load()
  }, [newName, projectPath, load, getParentDir])

  const handleCreateDir = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    const parentDir = getParentDir()
    const dirPath = parentDir ? parentDir + '/' + name : name
    await window.mirehub.claudeMemory.createRuleDir(projectPath, dirPath)
    setCreatingDir(false)
    setNewName('')
    await load()
  }, [newName, projectPath, load, getParentDir])

  const handleSave = useCallback(async (content: string) => {
    if (!selectedRule) return
    let finalContent = content
    // If rule has an author and content changed, add current user as co-author
    if (selectedRule.author && gitUserName && content !== selectedRule.content) {
      finalContent = updateAuthorFrontmatter(content, gitUserName)
    }
    if (selectedRule.isSymlink) {
      await window.mirehub.claudeMemory.writeSharedRule(selectedRule.filename, finalContent)
    } else {
      await window.mirehub.claudeMemory.writeRule(projectPath, selectedRule.relativePath, finalContent)
    }
    await load()
  }, [selectedRule, projectPath, load, gitUserName])

  const handleDelete = useCallback(async (relativePath: string) => {
    const rule = rules.find((r) => r.relativePath === relativePath)
    if (!rule) return
    if (rule.isSymlink) {
      await window.mirehub.claudeMemory.unlinkSharedRule(projectPath, rule.filename)
    } else {
      await window.mirehub.claudeMemory.deleteRule(projectPath, rule.relativePath)
    }
    if (selected?.relativePath === relativePath && selected.source === 'local') setSelected(null)
    await load()
  }, [rules, selected, projectPath, load])

  const handleDeleteDir = useCallback(async (dirPath: string) => {
    await window.mirehub.claudeMemory.deleteRuleDir(projectPath, dirPath)
    if (selected?.source === 'local' && selected.relativePath.startsWith(dirPath + '/')) {
      setSelected(null)
    }
    await load()
  }, [selected, projectPath, load])

  const handleRename = useCallback(async (oldRelativePath: string) => {
    const newFilename = renameValue.trim()
    if (!newFilename || newFilename === oldRelativePath.split(/[\\/]/).pop()) {
      setRenaming(null)
      return
    }
    const finalName = newFilename.endsWith('.md') ? newFilename : newFilename + '.md'
    const parts = oldRelativePath.split('/')
    const newRelativePath = parts.length > 1
      ? parts.slice(0, -1).join('/') + '/' + finalName
      : finalName
    await window.mirehub.claudeMemory.moveRule(projectPath, oldRelativePath, newRelativePath)
    setRenaming(null)
    setSelected({ relativePath: newRelativePath, source: 'local' })
    await load()
  }, [renameValue, projectPath, load])

  const handleRenameDir = useCallback(async (oldDirPath: string) => {
    const newDirName = renameValue.trim()
    if (!newDirName) { setRenaming(null); return }
    const parts = oldDirPath.split('/')
    const newDirPath = parts.length > 1
      ? parts.slice(0, -1).join('/') + '/' + newDirName
      : newDirName
    await window.mirehub.claudeMemory.renameRuleDir(projectPath, oldDirPath, newDirPath)
    setRenaming(null)
    await load()
  }, [renameValue, projectPath, load])

  const handleMoveRule = useCallback(async (oldPath: string, newPath: string) => {
    await window.mirehub.claudeMemory.moveRule(projectPath, oldPath, newPath)
    if (selected?.relativePath === oldPath) {
      setSelected({ relativePath: newPath, source: 'local' })
    }
    await load()
  }, [projectPath, load, selected])

  const handleLinkShared = useCallback(async (filename: string) => {
    await window.mirehub.claudeMemory.linkSharedRule(projectPath, filename)
    setSelected({ relativePath: filename, source: 'local' })
    await load()
  }, [projectPath, load])

  const handleReplaceWithShared = useCallback(async (filename: string) => {
    const rule = rules.find((r) => r.filename === filename && !r.isSymlink)
    if (rule) {
      await window.mirehub.claudeMemory.deleteRule(projectPath, rule.relativePath)
    }
    await window.mirehub.claudeMemory.linkSharedRule(projectPath, filename)
    setConfirmReplace(null)
    await load()
  }, [rules, projectPath, load])

  const handleConvertToShared = useCallback(async (relativePath: string) => {
    const rule = rules.find((r) => r.relativePath === relativePath)
    if (!rule || rule.isSymlink) return
    // Check if a shared rule with same name already exists
    const existingShared = sharedRules.find((s) => s.filename === rule.filename)
    if (existingShared) {
      // Show overwrite confirmation
      setConfirmOverwriteShared({ filename: rule.filename, content: rule.content })
      return
    }
    await window.mirehub.claudeMemory.writeSharedRule(rule.filename, rule.content)
    await window.mirehub.claudeMemory.deleteRule(projectPath, rule.relativePath)
    await window.mirehub.claudeMemory.linkSharedRule(projectPath, rule.filename)
    await load()
  }, [rules, sharedRules, projectPath, load])

  const confirmConvertToShared = useCallback(async () => {
    if (!confirmOverwriteShared) return
    const { filename, content } = confirmOverwriteShared
    await window.mirehub.claudeMemory.writeSharedRule(filename, content)
    // Delete local rule (find it by filename)
    const rule = rules.find((r) => r.filename === filename && !r.isSymlink)
    if (rule) {
      await window.mirehub.claudeMemory.deleteRule(projectPath, rule.relativePath)
    }
    await window.mirehub.claudeMemory.linkSharedRule(projectPath, filename)
    setConfirmOverwriteShared(null)
    await load()
  }, [confirmOverwriteShared, rules, projectPath, load])

  const handleExport = useCallback(async () => {
    await window.mirehub.claudeMemory.exportRules(projectPath)
  }, [projectPath])

  const handleImport = useCallback(async () => {
    const result = await window.mirehub.claudeMemory.importRules(projectPath)
    if (result.success) await load()
  }, [projectPath, load])

  const handleImportTemplates = useCallback(async (relativePaths: string[]) => {
    const result = await window.mirehub.claudeMemory.importTemplates(projectPath, relativePaths)
    if (result.success) await load()
  }, [projectPath, load])

  return {
    // State
    rules,
    directories,
    sharedRules,
    templates,
    selected,
    creating,
    creatingDir,
    newName,
    renaming,
    renameValue,
    confirmReplace,
    confirmOverwriteShared,
    syncing,

    // Derived
    selectedRule,
    selectedAvailable,
    selectedTemplate,
    localRules,
    linkedRules,
    availableShared,
    conflictingLocals,

    // Setters
    setSelected,
    setCreating,
    setCreatingDir,
    setNewName,
    setRenaming,
    setRenameValue,
    setConfirmReplace,
    setConfirmOverwriteShared,

    // Handlers
    handleCreate,
    handleCreateDir,
    handleSave,
    handleDelete,
    handleDeleteDir,
    handleRename,
    handleRenameDir,
    handleMoveRule,
    handleLinkShared,
    handleReplaceWithShared,
    handleConvertToShared,
    confirmConvertToShared,
    handleExport,
    handleImport,
    handleImportTemplates,
    load,
  }
}
