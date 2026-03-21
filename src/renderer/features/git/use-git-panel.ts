import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useViewStore } from '../../lib/stores/viewStore'
import { useI18n } from '../../lib/i18n'
import type { GitLogEntry, GitTag, GitBlameLine, GitStatus, GitRemote, Project } from '../../../shared/types'
import type { StashEntry, CommitFileInfo, BranchInfo } from './git-types'
import { ALL_PROJECTS_ID } from './git-types'
import { computeGraph } from './git-graph'
import { ROW_HEIGHT } from './git-graph-renderer'

export function useGitPanel() {
  const { t, localeCode } = useI18n()
  const { projects } = useWorkspaceStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const [statusByProject, setStatusByProject] = useState<Map<string, GitStatus>>(new Map())
  const [logByProject, setLogByProject] = useState<Map<string, GitLogEntry[]>>(new Map())
  const [branchesByProject, setBranchesByProject] = useState<Map<string, BranchInfo[]>>(new Map())
  const [stashesByProject, setStashesByProject] = useState<Map<string, StashEntry[]>>(new Map())
  const [tagsByProject, setTagsByProject] = useState<Map<string, GitTag[]>>(new Map())
  const [remotesByProject, setRemotesByProject] = useState<Map<string, GitRemote[]>>(new Map())
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [loadingProjects, setLoadingProjects] = useState<Set<string>>(new Set())
  const [selectedCommit, setSelectedCommit] = useState<GitLogEntry | null>(null)
  const [commitDetail, setCommitDetail] = useState<{ files: CommitFileInfo[]; diff: string } | null>(null)
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffContent, setDiffContent] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [branchCtx, setBranchCtx] = useState<{ x: number; y: number; branch: string } | null>(null)
  const [commitCtx, setCommitCtx] = useState<{ x: number; y: number; entry: GitLogEntry } | null>(null)
  const [renamingBranch, setRenamingBranch] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagMessage, setNewTagMessage] = useState('')
  const graphScrollRef = useRef<HTMLDivElement>(null)
  const [showNewRemote, setShowNewRemote] = useState(false)
  const [newRemoteName, setNewRemoteName] = useState('')
  const [newRemoteUrl, setNewRemoteUrl] = useState('')
  const [showBranchCompare, setShowBranchCompare] = useState(false)
  const [compareBranch1, setCompareBranch1] = useState('')
  const [compareBranch2, setCompareBranch2] = useState('')
  const [branchDiffResult, setBranchDiffResult] = useState('')
  const [blameFile, setBlameFile] = useState<string | null>(null)
  const [blameData, setBlameData] = useState<GitBlameLine[]>([])
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const [remoteCollapsed, setRemoteCollapsed] = useState(false)
  const [stashCollapsed, setStashCollapsed] = useState(false)
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [remotesCollapsed, setRemotesCollapsed] = useState(true)

  const workspaceProjects = useMemo(() => {
    if (!activeWorkspaceId) return []
    return projects.filter((p) => p.workspaceId === activeWorkspaceId)
  }, [projects, activeWorkspaceId])

  const selectedProject = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === ALL_PROJECTS_ID) return null
    return workspaceProjects.find((p) => p.id === selectedProjectId) ?? null
  }, [workspaceProjects, selectedProjectId])

  const currentStatus = useMemo(() => {
    if (!selectedProject) return null
    return statusByProject.get(selectedProject.id) ?? null
  }, [selectedProject, statusByProject])

  const currentLog = useMemo(() => {
    if (!selectedProject) return []
    return logByProject.get(selectedProject.id) ?? []
  }, [selectedProject, logByProject])

  const currentBranches = useMemo(() => {
    if (!selectedProject) return []
    return branchesByProject.get(selectedProject.id) ?? []
  }, [selectedProject, branchesByProject])

  const currentStashes = useMemo(() => {
    if (!selectedProject) return []
    return stashesByProject.get(selectedProject.id) ?? []
  }, [selectedProject, stashesByProject])

  const currentTags = useMemo(() => {
    if (!selectedProject) return []
    return tagsByProject.get(selectedProject.id) ?? []
  }, [selectedProject, tagsByProject])

  const currentRemotes = useMemo(() => {
    if (!selectedProject) return []
    return remotesByProject.get(selectedProject.id) ?? []
  }, [selectedProject, remotesByProject])

  // --- Data loading ---

  const refreshProject = useCallback(async (project: Project) => {
    setLoadingProjects((prev) => new Set(prev).add(project.id))
    try {
      const [s, l, b, st, tg, rm] = await Promise.all([
        window.kanbai.git.status(project.path),
        window.kanbai.git.log(project.path, 200),
        window.kanbai.git.branches(project.path),
        window.kanbai.git.stashList(project.path),
        window.kanbai.git.tags(project.path),
        window.kanbai.git.remotes(project.path),
      ])
      setStatusByProject((prev) => new Map(prev).set(project.id, s))
      setLogByProject((prev) => new Map(prev).set(project.id, l || []))
      setBranchesByProject((prev) => new Map(prev).set(project.id, b || []))
      setStashesByProject((prev) => new Map(prev).set(project.id, st || []))
      setTagsByProject((prev) => new Map(prev).set(project.id, tg || []))
      setRemotesByProject((prev) => new Map(prev).set(project.id, rm || []))
    } catch {
      setStatusByProject((prev) => { const m = new Map(prev); m.delete(project.id); return m })
      setLogByProject((prev) => new Map(prev).set(project.id, []))
      setBranchesByProject((prev) => new Map(prev).set(project.id, []))
      setStashesByProject((prev) => new Map(prev).set(project.id, []))
      setTagsByProject((prev) => new Map(prev).set(project.id, []))
      setRemotesByProject((prev) => new Map(prev).set(project.id, []))
    } finally {
      setLoadingProjects((prev) => {
        const next = new Set(prev)
        next.delete(project.id)
        return next
      })
    }
  }, [])

  const refreshAll = useCallback(async () => {
    if (workspaceProjects.length === 0) return
    await Promise.allSettled(workspaceProjects.map((p) => refreshProject(p)))
  }, [workspaceProjects, refreshProject])

  const refreshSelected = useCallback(async () => {
    if (selectedProject) {
      await refreshProject(selectedProject)
    } else {
      await refreshAll()
    }
  }, [selectedProject, refreshProject, refreshAll])

  useEffect(() => {
    if (workspaceProjects.length === 0) return
    setSelectedProjectId(null)
    setSelectedCommit(null)
    setCommitDetail(null)
    setSelectedFile(null)
    setDiffContent('')
    setShowBranchCompare(false)
    setBlameFile(null)
    setBlameData([])
    setCommitMessage('')
    refreshAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load on workspace change only
  }, [activeWorkspaceId])

  useEffect(() => {
    setSelectedCommit(null)
    setCommitDetail(null)
    setSelectedFile(null)
    setDiffContent('')
    setShowBranchCompare(false)
    setBlameFile(null)
    setBlameData([])
    setCommitMessage('')
  }, [selectedProjectId])

  // Graph data
  const graphData = useMemo(() => computeGraph(currentLog), [currentLog])
  const graphMaxLane = useMemo(() => {
    let max = 0
    for (const info of graphData) {
      max = Math.max(max, info.dotLane, ...info.connections.map((c) => Math.max(c.fromLane, c.toLane)))
    }
    return max
  }, [graphData])

  // --- Handlers ---

  const handleSelectCommit = useCallback(async (entry: GitLogEntry) => {
    if (selectedCommit?.hash === entry.hash) {
      setSelectedCommit(null)
      setCommitDetail(null)
      setSelectedCommitFile(null)
      return
    }
    setSelectedCommit(entry)
    setSelectedCommitFile(null)
    if (!selectedProject) return
    try {
      const detail = await window.kanbai.git.show(selectedProject.path, entry.hash)
      setCommitDetail(detail)
      if (detail.files.length > 0) {
        setSelectedCommitFile(detail.files[0]!.file)
      }
    } catch {
      setCommitDetail(null)
    }
  }, [selectedCommit, selectedProject])

  const handleFileDiff = useCallback(async (file: string, staged: boolean) => {
    if (!selectedProject) return
    if (selectedFile === file) {
      setSelectedFile(null)
      setDiffContent('')
      useViewStore.getState().setHighlightedFilePath(null)
      return
    }
    setSelectedFile(file)
    setSelectedCommit(null)
    setCommitDetail(null)
    const diff = await window.kanbai.git.diff(selectedProject.path, file, staged)
    setDiffContent(diff || '')
    useViewStore.getState().setHighlightedFilePath(selectedProject.path + '/' + file)
  }, [selectedProject, selectedFile])

  const handleStageFile = useCallback(async (file: string) => {
    if (!selectedProject) return
    await window.kanbai.git.stage(selectedProject.path, [file])
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleStageAll = useCallback(async () => {
    if (!selectedProject || !currentStatus) return
    const files = [...currentStatus.modified, ...currentStatus.untracked]
    if (files.length === 0) return
    await window.kanbai.git.stage(selectedProject.path, files)
    refreshProject(selectedProject)
  }, [selectedProject, currentStatus, refreshProject])

  const handleUnstageFile = useCallback(async (file: string) => {
    if (!selectedProject) return
    await window.kanbai.git.unstage(selectedProject.path, [file])
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleUnstageAll = useCallback(async () => {
    if (!selectedProject || !currentStatus) return
    if (currentStatus.staged.length === 0) return
    await window.kanbai.git.unstage(selectedProject.path, currentStatus.staged)
    refreshProject(selectedProject)
  }, [selectedProject, currentStatus, refreshProject])

  const handleDiscardFile = useCallback(async (file: string) => {
    if (!selectedProject) return
    const confirmed = window.confirm(`Abandonner les modifications de "${file}" ?`)
    if (!confirmed) return
    await window.kanbai.git.discard(selectedProject.path, [file])
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleCommit = useCallback(async () => {
    if (!selectedProject || !currentStatus || !commitMessage.trim()) return
    if (currentStatus.staged.length === 0) return
    try {
      await window.kanbai.git.commit(selectedProject.path, commitMessage.trim(), currentStatus.staged)
      setCommitMessage('')
      refreshProject(selectedProject)
    } catch (err) {
      console.error('Commit failed:', err)
    }
  }, [selectedProject, currentStatus, commitMessage, refreshProject])

  const handleCheckout = useCallback(async (branch: string) => {
    if (!selectedProject) return
    await window.kanbai.git.checkout(selectedProject.path, branch)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleCreateBranch = useCallback(async () => {
    if (!selectedProject || !newBranchName.trim()) return
    await window.kanbai.git.createBranch(selectedProject.path, newBranchName.trim())
    setNewBranchName('')
    setShowNewBranch(false)
    refreshProject(selectedProject)
  }, [selectedProject, newBranchName, refreshProject])

  const handleDeleteBranch = useCallback(async (name: string) => {
    if (!selectedProject) return
    const confirmed = window.confirm(`Supprimer la branche "${name}" ?`)
    if (!confirmed) return
    await window.kanbai.git.deleteBranch(selectedProject.path, name)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleMerge = useCallback(async (branch: string) => {
    if (!selectedProject) return
    await window.kanbai.git.merge(selectedProject.path, branch)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleRenameBranch = useCallback(async () => {
    if (!selectedProject || !renamingBranch || !renameValue.trim()) return
    await window.kanbai.git.renameBranch(selectedProject.path, renamingBranch, renameValue.trim())
    setRenamingBranch(null)
    setRenameValue('')
    refreshProject(selectedProject)
  }, [selectedProject, renamingBranch, renameValue, refreshProject])

  const handlePush = useCallback(async () => {
    if (!selectedProject) return
    await window.kanbai.git.push(selectedProject.path)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handlePull = useCallback(async () => {
    if (!selectedProject) return
    await window.kanbai.git.pull(selectedProject.path)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleFetch = useCallback(async () => {
    if (!selectedProject) return
    await window.kanbai.git.fetch(selectedProject.path)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleFetchProject = useCallback(async (project: Project) => {
    await window.kanbai.git.fetch(project.path)
    refreshProject(project)
  }, [refreshProject])

  const handlePullProject = useCallback(async (project: Project) => {
    await window.kanbai.git.pull(project.path)
    refreshProject(project)
  }, [refreshProject])

  const handleStash = useCallback(async () => {
    if (!selectedProject) return
    await window.kanbai.git.stash(selectedProject.path)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleStashPop = useCallback(async () => {
    if (!selectedProject) return
    await window.kanbai.git.stashPop(selectedProject.path)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleGitInit = useCallback(async (project: Project) => {
    await window.kanbai.git.init(project.path)
    refreshProject(project)
  }, [refreshProject])

  const handleUndo = useCallback(async () => {
    if (!selectedProject) return
    const confirmed = window.confirm(t('git.undoCommit'))
    if (!confirmed) return
    const result = await window.kanbai.git.resetSoft(selectedProject.path)
    if (!result.success) {
      window.alert(result.error)
    }
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject, t])

  const handleSwitchToTerminal = useCallback(() => {
    useViewStore.getState().setViewMode('terminal')
  }, [])

  const handleCreateTag = useCallback(async () => {
    if (!selectedProject || !newTagName.trim()) return
    await window.kanbai.git.createTag(selectedProject.path, newTagName.trim(), newTagMessage.trim() || undefined)
    setNewTagName('')
    setNewTagMessage('')
    setShowNewTag(false)
    refreshProject(selectedProject)
  }, [selectedProject, newTagName, newTagMessage, refreshProject])

  const handleDeleteTag = useCallback(async (name: string) => {
    if (!selectedProject) return
    const confirmed = window.confirm(`Supprimer le tag "${name}" ?`)
    if (!confirmed) return
    await window.kanbai.git.deleteTag(selectedProject.path, name)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const scrollToTagCommit = useCallback((tag: GitTag) => {
    const idx = graphData.findIndex((info) => info.entry.shortHash === tag.hash || info.entry.hash.startsWith(tag.hash))
    if (idx === -1 || !graphScrollRef.current) return
    const scrollTop = idx * ROW_HEIGHT - graphScrollRef.current.clientHeight / 2 + ROW_HEIGHT / 2
    graphScrollRef.current.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
    handleSelectCommit(graphData[idx]!.entry)
  }, [graphData, handleSelectCommit])

  const handleCherryPick = useCallback(async (hash: string) => {
    if (!selectedProject) return
    const confirmed = window.confirm(`Cherry-pick le commit ${hash.slice(0, 7)} ?`)
    if (!confirmed) return
    const result = await window.kanbai.git.cherryPick(selectedProject.path, hash)
    if (!result.success) {
      window.alert(`Cherry-pick echoue: ${result.error}`)
    }
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const handleCompareBranches = useCallback(async () => {
    if (!selectedProject || !compareBranch1 || !compareBranch2) return
    const result = await window.kanbai.git.diffBranches(selectedProject.path, compareBranch1, compareBranch2)
    setBranchDiffResult(result || 'Aucune difference')
  }, [selectedProject, compareBranch1, compareBranch2])

  const handleBlame = useCallback(async (file: string) => {
    if (!selectedProject) return
    if (blameFile === file) {
      setBlameFile(null)
      setBlameData([])
      return
    }
    setBlameFile(file)
    setSelectedCommit(null)
    setCommitDetail(null)
    setSelectedFile(null)
    setDiffContent('')
    setShowBranchCompare(false)
    const data = await window.kanbai.git.blame(selectedProject.path, file)
    setBlameData(data || [])
  }, [selectedProject, blameFile])

  const handleAddRemote = useCallback(async () => {
    if (!selectedProject || !newRemoteName.trim() || !newRemoteUrl.trim()) return
    await window.kanbai.git.addRemote(selectedProject.path, newRemoteName.trim(), newRemoteUrl.trim())
    setNewRemoteName('')
    setNewRemoteUrl('')
    setShowNewRemote(false)
    refreshProject(selectedProject)
  }, [selectedProject, newRemoteName, newRemoteUrl, refreshProject])

  const handleRemoveRemote = useCallback(async (name: string) => {
    if (!selectedProject) return
    const confirmed = window.confirm(`Supprimer le remote "${name}" ?`)
    if (!confirmed) return
    await window.kanbai.git.removeRemote(selectedProject.path, name)
    refreshProject(selectedProject)
  }, [selectedProject, refreshProject])

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }, [])

  // --- Derived view values ---

  const isAllProjectsView = !selectedProjectId || selectedProjectId === ALL_PROJECTS_ID
  const status = currentStatus
  const totalChanges = status ? status.staged.length + status.modified.length + status.untracked.length : 0
  const localBranches = currentBranches.filter((b) => !b.name.startsWith('origin/'))
  const remoteBranches = currentBranches.filter((b) => b.name.startsWith('origin/'))

  return {
    t, localeCode,
    workspaceProjects, selectedProject, selectedProjectId, setSelectedProjectId,
    statusByProject, loadingProjects, collapsedProjects,
    isAllProjectsView, status, totalChanges, localBranches, remoteBranches,
    currentBranches, currentStashes, currentTags, currentRemotes, currentLog,
    // UI state
    selectedCommit, setSelectedCommit, commitDetail, setCommitDetail,
    selectedCommitFile, setSelectedCommitFile, selectedFile, setSelectedFile,
    diffContent, setDiffContent, commitMessage, setCommitMessage,
    newBranchName, setNewBranchName, showNewBranch, setShowNewBranch,
    branchCtx, setBranchCtx, commitCtx, setCommitCtx,
    renamingBranch, setRenamingBranch, renameValue, setRenameValue,
    showNewTag, setShowNewTag, newTagName, setNewTagName, newTagMessage, setNewTagMessage,
    showNewRemote, setShowNewRemote, newRemoteName, setNewRemoteName, newRemoteUrl, setNewRemoteUrl,
    showBranchCompare, setShowBranchCompare,
    compareBranch1, setCompareBranch1, compareBranch2, setCompareBranch2,
    branchDiffResult, setBranchDiffResult,
    blameFile, setBlameFile, blameData, setBlameData,
    localCollapsed, setLocalCollapsed, remoteCollapsed, setRemoteCollapsed,
    stashCollapsed, setStashCollapsed, tagsCollapsed, setTagsCollapsed,
    remotesCollapsed, setRemotesCollapsed,
    graphScrollRef, graphData, graphMaxLane,
    // Handlers
    refreshAll, refreshSelected, refreshProject,
    handleSelectCommit, handleFileDiff,
    handleStageFile, handleStageAll, handleUnstageFile, handleUnstageAll,
    handleDiscardFile, handleCommit,
    handleCheckout, handleCreateBranch, handleDeleteBranch, handleMerge, handleRenameBranch,
    handlePush, handlePull, handleFetch, handleFetchProject, handlePullProject,
    handleStash, handleStashPop, handleGitInit, handleUndo, handleSwitchToTerminal,
    handleCreateTag, handleDeleteTag, scrollToTagCommit,
    handleCherryPick, handleCompareBranches, handleBlame,
    handleAddRemote, handleRemoveRemote, toggleProjectCollapse,
  }
}
