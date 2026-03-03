import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import { ContextMenu, ContextMenuItem } from './ContextMenu'
import type { GitStatus, GitLogEntry, GitTag, GitBlameLine, GitRemote } from '../../shared/types'
import '../styles/git.css'

// --- Types ---

interface StashEntry {
  ref: string
  message: string
  date: string
}

interface CommitFileInfo {
  status: string
  file: string
}

// --- Commit graph computation ---

interface GraphLane {
  color: string
}

interface GraphCommitInfo {
  entry: GitLogEntry
  lanes: (GraphLane | null)[]
  dotLane: number
  connections: Array<{
    fromLane: number
    toLane: number
    color: string
    type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right'
  }>
}

const GRAPH_COLORS = [
  '#89b4fa', '#a6e3a1', '#f38ba8', '#fab387', '#f9e2af',
  '#cba6f7', '#94e2d5', '#f5c2e7', '#74c7ec', '#b4befe',
]

function computeGraph(entries: GitLogEntry[]): GraphCommitInfo[] {
  const result: GraphCommitInfo[] = []
  let activeLanes: (string | null)[] = []

  // Pre-build a set of all hashes for quick lookup (detect orphaned parents)
  const allHashes = new Set(entries.map((e) => e.hash))

  for (const entry of entries) {
    const connections: GraphCommitInfo['connections'] = []

    // Find which lane this commit occupies
    let dotLane = activeLanes.indexOf(entry.hash)
    if (dotLane === -1) {
      // New branch head — prefer the first empty slot, closest to lane 0
      dotLane = activeLanes.indexOf(null)
      if (dotLane === -1) {
        dotLane = activeLanes.length
        activeLanes.push(entry.hash)
      } else {
        activeLanes[dotLane] = entry.hash
      }
    }

    const dotColor = GRAPH_COLORS[dotLane % GRAPH_COLORS.length]!

    // Snapshot lanes for rendering (before we modify them)
    const lanesSnapshot: (GraphLane | null)[] = activeLanes.map((hash, i) =>
      hash === null ? null : { color: GRAPH_COLORS[i % GRAPH_COLORS.length]! },
    )

    // Free the current lane
    const parents = entry.parents
    activeLanes[dotLane] = null

    if (parents.length === 0) {
      // Root commit — no connections downward
    } else if (parents.length === 1) {
      const parentHash = parents[0]!
      const existingLane = activeLanes.indexOf(parentHash)
      if (existingLane !== -1) {
        // Parent already tracked in another lane — merge into it
        connections.push({
          fromLane: dotLane, toLane: existingLane, color: dotColor,
          type: existingLane < dotLane ? 'merge-left' : existingLane > dotLane ? 'merge-right' : 'straight',
        })
      } else if (allHashes.has(parentHash)) {
        // Parent exists in this log — continue in the same lane
        activeLanes[dotLane] = parentHash
        connections.push({ fromLane: dotLane, toLane: dotLane, color: dotColor, type: 'straight' })
      }
      // else: parent is outside the visible log window — don't reserve a lane
    } else {
      // Merge commit — multiple parents
      for (let pi = 0; pi < parents.length; pi++) {
        const parentHash = parents[pi]!
        const existingLane = activeLanes.indexOf(parentHash)
        if (existingLane !== -1) {
          // Parent already tracked in another lane
          connections.push({
            fromLane: dotLane, toLane: existingLane,
            color: GRAPH_COLORS[existingLane % GRAPH_COLORS.length]!,
            type: existingLane < dotLane ? 'merge-left' : existingLane > dotLane ? 'merge-right' : 'straight',
          })
        } else if (!allHashes.has(parentHash)) {
          // Parent outside the visible log — skip
          continue
        } else if (pi === 0) {
          // First parent continues in the same lane
          activeLanes[dotLane] = parentHash
          connections.push({ fromLane: dotLane, toLane: dotLane, color: dotColor, type: 'straight' })
        } else {
          // Additional parents fork to new lanes — find nearest available slot
          let newLane = -1
          // Search outward from dotLane: right first, then left
          for (let s = dotLane + 1; s < activeLanes.length; s++) {
            if (activeLanes[s] === null) { newLane = s; break }
          }
          if (newLane === -1) {
            for (let s = dotLane - 1; s >= 0; s--) {
              if (activeLanes[s] === null) { newLane = s; break }
            }
          }
          if (newLane === -1) {
            newLane = activeLanes.length
            activeLanes.push(parentHash)
          } else {
            activeLanes[newLane] = parentHash
          }
          connections.push({
            fromLane: dotLane, toLane: newLane,
            color: GRAPH_COLORS[newLane % GRAPH_COLORS.length]!,
            type: newLane > dotLane ? 'fork-right' : 'fork-left',
          })
        }
      }
    }

    // Draw pass-through lines for lanes that are still active
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] !== null && i !== dotLane && !connections.some((c) => c.toLane === i)) {
        connections.push({
          fromLane: i, toLane: i,
          color: GRAPH_COLORS[i % GRAPH_COLORS.length]!,
          type: 'straight',
        })
      }
    }

    // Trim trailing empty lanes to prevent the graph from growing infinitely wide
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop()
    }

    result.push({ entry, lanes: lanesSnapshot, dotLane, connections })
  }
  return result
}

// --- Continuous Git Graph ---

const LANE_WIDTH = 20
const ROW_HEIGHT = 28
const DOT_RADIUS = 5
const MERGE_DOT_RADIUS = 6

interface BranchSegment {
  lane: number
  startRow: number
  endRow: number
  color: string
}

interface CurveConnection {
  fromLane: number
  toLane: number
  row: number
  color: string
}

interface CherryPickConnection {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  color: string
}

interface CommitDot {
  row: number
  lane: number
  color: string
  isMerge: boolean
}

interface GraphPaths {
  segments: BranchSegment[]
  curves: CurveConnection[]
  cherryPicks: CherryPickConnection[]
  dots: CommitDot[]
}

function buildGraphPaths(data: GraphCommitInfo[]): GraphPaths {
  const segments: BranchSegment[] = []
  const curves: CurveConnection[] = []
  const cherryPicks: CherryPickConnection[] = []
  const dots: CommitDot[] = []

  // Track active lane spans: lane -> startRow
  const laneSpans = new Map<number, { startRow: number; color: string }>()

  // Build hash -> row index for cherry-pick lookup
  const hashToRow = new Map<string, number>()
  for (let i = 0; i < data.length; i++) {
    hashToRow.set(data[i]!.entry.hash, i)
  }

  for (let row = 0; row < data.length; row++) {
    const info = data[row]!
    const isMerge = info.entry.parents.length > 1

    // Collect which lanes are active in this row (from connections)
    const activeLanesThisRow = new Set<number>()

    for (const conn of info.connections) {
      if (conn.type === 'straight') {
        activeLanesThisRow.add(conn.fromLane)
      } else {
        // Curve: from dotLane to another lane
        curves.push({
          fromLane: conn.fromLane,
          toLane: conn.toLane,
          row,
          color: conn.color,
        })
        // The source lane is active up to this row
        activeLanesThisRow.add(conn.fromLane)
        // The target lane starts from this row
        activeLanesThisRow.add(conn.toLane)
      }
    }

    // Finalize lane spans that are no longer active
    for (const [lane, span] of laneSpans) {
      if (!activeLanesThisRow.has(lane)) {
        segments.push({ lane, startRow: span.startRow, endRow: row - 1, color: span.color })
        laneSpans.delete(lane)
      }
    }

    // Start or extend lane spans
    for (const lane of activeLanesThisRow) {
      if (!laneSpans.has(lane)) {
        const color = GRAPH_COLORS[lane % GRAPH_COLORS.length]!
        laneSpans.set(lane, { startRow: row, color })
      }
    }

    // Commit dot
    dots.push({
      row,
      lane: info.dotLane,
      color: GRAPH_COLORS[info.dotLane % GRAPH_COLORS.length]!,
      isMerge,
    })

    // Cherry-pick connection
    if (info.entry.cherryPickOf) {
      const targetRow = hashToRow.get(info.entry.cherryPickOf)
      if (targetRow !== undefined) {
        const targetInfo = data[targetRow]!
        cherryPicks.push({
          fromRow: row,
          fromLane: info.dotLane,
          toRow: targetRow,
          toLane: targetInfo.dotLane,
          color: GRAPH_COLORS[info.dotLane % GRAPH_COLORS.length]!,
        })
      }
    }
  }

  // Finalize remaining open spans
  for (const [lane, span] of laneSpans) {
    segments.push({ lane, startRow: span.startRow, endRow: data.length - 1, color: span.color })
  }

  return { segments, curves, cherryPicks, dots }
}

function GitGraph({ data, maxLane, rowHeight, laneWidth }: {
  data: GraphCommitInfo[]
  maxLane: number
  rowHeight: number
  laneWidth: number
}) {
  const { segments, curves, cherryPicks, dots } = useMemo(
    () => buildGraphPaths(data), [data],
  )
  const svgHeight = data.length * rowHeight
  const svgWidth = (maxLane + 1) * laneWidth + 12

  const laneX = (lane: number) => lane * laneWidth + laneWidth / 2
  const rowY = (row: number) => row * rowHeight + rowHeight / 2

  return (
    <svg width={svgWidth} height={svgHeight} className="git-graph-svg">
      {/* 1. Branch segments (continuous vertical lines) */}
      {segments.map((seg, i) => (
        <line
          key={`seg-${i}`}
          x1={laneX(seg.lane)} y1={seg.startRow * rowHeight}
          x2={laneX(seg.lane)} y2={(seg.endRow + 1) * rowHeight}
          stroke={seg.color} strokeWidth={2} strokeLinecap="round"
        />
      ))}

      {/* 2. Fork/merge curves */}
      {curves.map((c, i) => {
        const x1 = laneX(c.fromLane)
        const x2 = laneX(c.toLane)
        const y1 = c.row * rowHeight
        const y2 = (c.row + 1) * rowHeight
        const mid = (y1 + y2) / 2
        return (
          <path
            key={`curve-${i}`}
            d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
            stroke={c.color} strokeWidth={2} fill="none" strokeLinecap="round"
          />
        )
      })}

      {/* 3. Cherry-pick connections (dashed) */}
      {cherryPicks.map((cp, i) => {
        const x1 = laneX(cp.fromLane)
        const y1 = rowY(cp.fromRow)
        const x2 = laneX(cp.toLane)
        const y2 = rowY(cp.toRow)
        const midY = (y1 + y2) / 2
        return (
          <path
            key={`cp-${i}`}
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            stroke={cp.color} strokeWidth={1.5} fill="none"
            strokeDasharray="4 3" opacity={0.7}
          />
        )
      })}

      {/* 4. Commit dots (on top of everything) */}
      {dots.map((d, i) => (
        <circle
          key={`dot-${i}`}
          cx={laneX(d.lane)} cy={rowY(d.row)}
          r={d.isMerge ? MERGE_DOT_RADIUS : DOT_RADIUS}
          fill={d.color} stroke="var(--bg-primary)" strokeWidth={2.5}
        />
      ))}
    </svg>
  )
}

// --- Ref badges ---

function RefBadge({ refName }: { refName: string }) {
  const isHead = refName.startsWith('HEAD')
  const isRemote = refName.startsWith('origin/')
  const isTag = refName.startsWith('tag:')
  let className = 'git-ref-badge'
  if (isHead) className += ' git-ref-badge--head'
  else if (isRemote) className += ' git-ref-badge--remote'
  else if (isTag) className += ' git-ref-badge--tag'
  else className += ' git-ref-badge--branch'
  return <span className={className}>{refName}</span>
}

// --- Diff viewer ---

function DiffViewer({ diff }: { diff: string }) {
  const { t } = useI18n()
  if (!diff) return <div className="git-diff-empty">{t('git.noChanges')}</div>
  const lines = diff.split('\n')
  return (
    <div className="git-diff-viewer">
      {lines.map((line, i) => {
        let className = 'git-diff-line'
        if (line.startsWith('+') && !line.startsWith('+++')) className += ' git-diff-line--add'
        else if (line.startsWith('-') && !line.startsWith('---')) className += ' git-diff-line--del'
        else if (line.startsWith('@@')) className += ' git-diff-line--hunk'
        else if (line.startsWith('diff ')) className += ' git-diff-line--header'
        return <div key={i} className={className}>{line}</div>
      })}
    </div>
  )
}

// --- Relative date helper ---

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "a l'instant"
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}j`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}sem`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mois`
  return `${Math.floor(months / 12)}a`
}

// --- Extract per-file diff from full diff ---

function extractFileDiff(fullDiff: string, fileName: string): string {
  const sections = fullDiff.split(/(?=^diff --git )/m)
  for (const section of sections) {
    // Match the file name in the diff header: diff --git a/path b/path
    // Also handle renames where the file may appear as b/path
    if (section.includes(`a/${fileName}`) || section.includes(`b/${fileName}`)) {
      return section
    }
  }
  return ''
}

// --- File status icon ---

function fileStatusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case 'A': return { label: 'A', className: 'git-fstatus--added' }
    case 'M': return { label: 'M', className: 'git-fstatus--modified' }
    case 'D': return { label: 'D', className: 'git-fstatus--deleted' }
    case 'R': return { label: 'R', className: 'git-fstatus--renamed' }
    case 'C': return { label: 'C', className: 'git-fstatus--copied' }
    default: return { label: '?', className: 'git-fstatus--untracked' }
  }
}

// --- Branch sidebar section ---

function BranchSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="git-sidebar-section">
      <div className="git-sidebar-section-header" onClick={onToggle}>
        <span className={`git-sidebar-chevron${collapsed ? '' : ' git-sidebar-chevron--open'}`}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="git-sidebar-section-title">{title}</span>
      </div>
      {!collapsed && <div className="git-sidebar-section-content">{children}</div>}
    </div>
  )
}

// === MAIN PANEL ===

export function GitPanel() {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Data state
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<GitLogEntry[]>([])
  const [branches, setBranches] = useState<Array<{ name: string; hash: string; upstream: string }>>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [tags, setTags] = useState<GitTag[]>([])
  const [remotes, setRemotes] = useState<GitRemote[]>([])
  const [loading, setLoading] = useState(false)

  // UI state
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
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Tag state
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagMessage, setNewTagMessage] = useState('')

  // Remote state
  const [showNewRemote, setShowNewRemote] = useState(false)
  const [newRemoteName, setNewRemoteName] = useState('')
  const [newRemoteUrl, setNewRemoteUrl] = useState('')

  // Branch comparison state
  const [showBranchCompare, setShowBranchCompare] = useState(false)
  const [compareBranch1, setCompareBranch1] = useState('')
  const [compareBranch2, setCompareBranch2] = useState('')
  const [branchDiffResult, setBranchDiffResult] = useState('')

  // Blame state
  const [blameFile, setBlameFile] = useState<string | null>(null)
  const [blameData, setBlameData] = useState<GitBlameLine[]>([])

  // Sidebar collapse state
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const [remoteCollapsed, setRemoteCollapsed] = useState(false)
  const [stashCollapsed, setStashCollapsed] = useState(false)
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [remotesCollapsed, setRemotesCollapsed] = useState(true)

  // --- Data loading ---

  const refresh = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const [s, l, b, st, tg, rm] = await Promise.all([
        window.kanbai.git.status(activeProject.path),
        window.kanbai.git.log(activeProject.path, 200),
        window.kanbai.git.branches(activeProject.path),
        window.kanbai.git.stashList(activeProject.path),
        window.kanbai.git.tags(activeProject.path),
        window.kanbai.git.remotes(activeProject.path),
      ])
      setStatus(s)
      setLog(l || [])
      setBranches(b || [])
      setStashes(st || [])
      setTags(tg || [])
      setRemotes(rm || [])
    } catch {
      setStatus(null)
      setLog([])
      setBranches([])
      setStashes([])
      setTags([])
      setRemotes([])
    }
    setLoading(false)
  }, [activeProject])

  useEffect(() => {
    refresh()
  }, [refresh])

  const graphData = useMemo(() => computeGraph(log), [log])
  const graphMaxLane = useMemo(() => {
    let max = 0
    for (const info of graphData) {
      max = Math.max(max, info.dotLane, ...info.connections.map((c) => Math.max(c.fromLane, c.toLane)))
    }
    return max
  }, [graphData])

  // --- Commit selection ---

  const handleSelectCommit = useCallback(async (entry: GitLogEntry) => {
    if (selectedCommit?.hash === entry.hash) {
      setSelectedCommit(null)
      setCommitDetail(null)
      setSelectedCommitFile(null)
      return
    }
    setSelectedCommit(entry)
    setSelectedCommitFile(null)
    if (!activeProject) return
    try {
      const detail = await window.kanbai.git.show(activeProject.path, entry.hash)
      setCommitDetail(detail)
      // Auto-select the first file
      if (detail.files.length > 0) {
        setSelectedCommitFile(detail.files[0]!.file)
      }
    } catch {
      setCommitDetail(null)
    }
  }, [selectedCommit, activeProject])

  // --- File diff ---

  const handleFileDiff = useCallback(async (file: string, staged: boolean) => {
    if (!activeProject) return
    // Toggle: re-click closes the diff
    if (selectedFile === file) {
      setSelectedFile(null)
      setDiffContent('')
      useViewStore.getState().setHighlightedFilePath(null)
      return
    }
    setSelectedFile(file)
    setSelectedCommit(null)
    setCommitDetail(null)
    const diff = await window.kanbai.git.diff(activeProject.path, file, staged)
    setDiffContent(diff || '')
    // Highlight the file in the sidebar file tree
    useViewStore.getState().setHighlightedFilePath(activeProject.path + '/' + file)
  }, [activeProject, selectedFile])

  // --- Stage / Unstage / Discard ---

  const handleStageFile = useCallback(async (file: string) => {
    if (!activeProject) return
    await window.kanbai.git.stage(activeProject.path, [file])
    refresh()
  }, [activeProject, refresh])

  const handleStageAll = useCallback(async () => {
    if (!activeProject || !status) return
    const files = [...status.modified, ...status.untracked]
    if (files.length === 0) return
    await window.kanbai.git.stage(activeProject.path, files)
    refresh()
  }, [activeProject, status, refresh])

  const handleUnstageFile = useCallback(async (file: string) => {
    if (!activeProject) return
    await window.kanbai.git.unstage(activeProject.path, [file])
    refresh()
  }, [activeProject, refresh])

  const handleUnstageAll = useCallback(async () => {
    if (!activeProject || !status) return
    if (status.staged.length === 0) return
    await window.kanbai.git.unstage(activeProject.path, status.staged)
    refresh()
  }, [activeProject, status, refresh])

  const handleDiscardFile = useCallback(async (file: string) => {
    if (!activeProject) return
    const confirmed = window.confirm(`Abandonner les modifications de "${file}" ?`)
    if (!confirmed) return
    await window.kanbai.git.discard(activeProject.path, [file])
    refresh()
  }, [activeProject, refresh])

  // --- Commit ---

  const handleCommit = useCallback(async () => {
    if (!activeProject || !status || !commitMessage.trim()) return
    if (status.staged.length === 0) return
    try {
      await window.kanbai.git.commit(activeProject.path, commitMessage.trim(), status.staged)
      setCommitMessage('')
      refresh()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Commit failed:', err)
    }
  }, [activeProject, status, commitMessage, refresh])

  // --- Branch operations ---

  const handleCheckout = useCallback(async (branch: string) => {
    if (!activeProject) return
    await window.kanbai.git.checkout(activeProject.path, branch)
    refresh()
  }, [activeProject, refresh])

  const handleCreateBranch = useCallback(async () => {
    if (!activeProject || !newBranchName.trim()) return
    await window.kanbai.git.createBranch(activeProject.path, newBranchName.trim())
    setNewBranchName('')
    setShowNewBranch(false)
    refresh()
  }, [activeProject, newBranchName, refresh])

  const handleDeleteBranch = useCallback(async (name: string) => {
    if (!activeProject) return
    const confirmed = window.confirm(`Supprimer la branche "${name}" ?`)
    if (!confirmed) return
    await window.kanbai.git.deleteBranch(activeProject.path, name)
    refresh()
  }, [activeProject, refresh])

  const handleMerge = useCallback(async (branch: string) => {
    if (!activeProject) return
    await window.kanbai.git.merge(activeProject.path, branch)
    refresh()
  }, [activeProject, refresh])

  const handleRenameBranch = useCallback(async () => {
    if (!activeProject || !renamingBranch || !renameValue.trim()) return
    await window.kanbai.git.renameBranch(activeProject.path, renamingBranch, renameValue.trim())
    setRenamingBranch(null)
    setRenameValue('')
    refresh()
  }, [activeProject, renamingBranch, renameValue, refresh])

  // --- Actions ---

  const handlePush = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.git.push(activeProject.path)
    refresh()
  }, [activeProject, refresh])

  const handlePull = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.git.pull(activeProject.path)
    refresh()
  }, [activeProject, refresh])

  const handleFetch = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.git.fetch(activeProject.path)
    refresh()
  }, [activeProject, refresh])

  const handleStash = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.git.stash(activeProject.path)
    refresh()
  }, [activeProject, refresh])

  const handleStashPop = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.git.stashPop(activeProject.path)
    refresh()
  }, [activeProject, refresh])

  const handleGitInit = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.git.init(activeProject.path)
    refresh()
  }, [activeProject, refresh])

  const handleUndo = useCallback(async () => {
    if (!activeProject) return
    const confirmed = window.confirm(t('git.undoCommit'))
    if (!confirmed) return
    const result = await window.kanbai.git.resetSoft(activeProject.path)
    if (!result.success) {
      window.alert(result.error)
    }
    refresh()
  }, [activeProject, refresh, t])

  const handleSwitchToTerminal = useCallback(() => {
    useViewStore.getState().setViewMode('terminal')
  }, [])

  // --- Tag operations ---

  const handleCreateTag = useCallback(async () => {
    if (!activeProject || !newTagName.trim()) return
    await window.kanbai.git.createTag(activeProject.path, newTagName.trim(), newTagMessage.trim() || undefined)
    setNewTagName('')
    setNewTagMessage('')
    setShowNewTag(false)
    refresh()
  }, [activeProject, newTagName, newTagMessage, refresh])

  const handleDeleteTag = useCallback(async (name: string) => {
    if (!activeProject) return
    const confirmed = window.confirm(`Supprimer le tag "${name}" ?`)
    if (!confirmed) return
    await window.kanbai.git.deleteTag(activeProject.path, name)
    refresh()
  }, [activeProject, refresh])

  // --- Cherry-pick ---

  const handleCherryPick = useCallback(async (hash: string) => {
    if (!activeProject) return
    const confirmed = window.confirm(`Cherry-pick le commit ${hash.slice(0, 7)} ?`)
    if (!confirmed) return
    const result = await window.kanbai.git.cherryPick(activeProject.path, hash)
    if (!result.success) {
      window.alert(`Cherry-pick echoue: ${result.error}`)
    }
    refresh()
  }, [activeProject, refresh])

  // --- Branch comparison ---

  const handleCompareBranches = useCallback(async () => {
    if (!activeProject || !compareBranch1 || !compareBranch2) return
    const result = await window.kanbai.git.diffBranches(activeProject.path, compareBranch1, compareBranch2)
    setBranchDiffResult(result || 'Aucune difference')
  }, [activeProject, compareBranch1, compareBranch2])

  // --- Blame ---

  const handleBlame = useCallback(async (file: string) => {
    if (!activeProject) return
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
    const data = await window.kanbai.git.blame(activeProject.path, file)
    setBlameData(data || [])
  }, [activeProject, blameFile])

  // --- Remote operations ---

  const handleAddRemote = useCallback(async () => {
    if (!activeProject || !newRemoteName.trim() || !newRemoteUrl.trim()) return
    await window.kanbai.git.addRemote(activeProject.path, newRemoteName.trim(), newRemoteUrl.trim())
    setNewRemoteName('')
    setNewRemoteUrl('')
    setShowNewRemote(false)
    refresh()
  }, [activeProject, newRemoteName, newRemoteUrl, refresh])

  const handleRemoveRemote = useCallback(async (name: string) => {
    if (!activeProject) return
    const confirmed = window.confirm(`Supprimer le remote "${name}" ?`)
    if (!confirmed) return
    await window.kanbai.git.removeRemote(activeProject.path, name)
    refresh()
  }, [activeProject, refresh])

  // Branch rename focus
  useEffect(() => {
    if (renamingBranch && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingBranch])

  // Branch context menu items
  const getBranchContextItems = (branchName: string): ContextMenuItem[] => {
    const isCurrent = branchName === status?.branch
    const items: ContextMenuItem[] = []
    if (!isCurrent) {
      items.push({ label: t('git.checkout'), action: () => handleCheckout(branchName) })
      items.push({
        label: t('git.mergeInto', { branch: status?.branch ?? '...' }),
        action: () => handleMerge(branchName),
      })
    }
    items.push({
      label: t('common.rename'),
      action: () => {
        setRenamingBranch(branchName)
        setRenameValue(branchName)
      },
    })
    if (!isCurrent) {
      items.push({ separator: true, label: '', action: () => {} })
      items.push({
        label: t('common.delete'),
        action: () => handleDeleteBranch(branchName),
        danger: true,
      })
    }
    return items
  }

  // Commit context menu items
  const getCommitContextItems = (entry: GitLogEntry): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: t('git.viewDetails'),
        action: () => handleSelectCommit(entry),
      },
      {
        label: t('git.copyHash'),
        action: () => navigator.clipboard.writeText(entry.hash),
      },
      { separator: true, label: '', action: () => {} },
      {
        label: t('git.cherryPickLabel'),
        action: () => handleCherryPick(entry.hash),
      },
      {
        label: t('git.createBranchFrom'),
        action: async () => {
          const name = window.prompt(t('git.newBranch').replace('+ ', ''))
          if (name && activeProject) {
            await window.kanbai.git.checkout(activeProject.path, entry.hash)
            await window.kanbai.git.createBranch(activeProject.path, name.trim())
            refresh()
          }
        },
      },
      {
        label: t('git.createTagFrom'),
        action: async () => {
          const name = window.prompt(t('git.newTag').replace('+ ', ''))
          if (name && activeProject) {
            await window.kanbai.git.createTag(activeProject.path, name.trim())
            refresh()
          }
        },
      },
    ]
    return items
  }

  // --- Guard: no project ---

  if (!activeProject) {
    return <div className="git-empty">{t('git.selectProject')}</div>
  }

  // --- Guard: not a git repo ---

  if (!status) {
    return (
      <div className="git-empty">
        {loading ? t('common.loading') : (
          <div style={{ textAlign: 'center' }}>
            <p>{t('git.notGitRepo')}</p>
            <button className="git-action-btn" style={{ marginTop: 12, height: 32, padding: '0 20px', fontSize: 13 }} onClick={handleGitInit}>
              {t('git.initGit')}
            </button>
          </div>
        )}
      </div>
    )
  }

  const totalChanges = status.staged.length + status.modified.length + status.untracked.length
  const localBranches = branches.filter((b) => !b.name.startsWith('origin/'))
  const remoteBranches = branches.filter((b) => b.name.startsWith('origin/'))

  return (
    <div className="git-panel">
      {/* ===== Header ===== */}
      <div className="git-header">
        <div className="git-branch-info">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="git-icon">
            <path d="M15.698 7.287L8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.548 1.56l1.773 1.774a1.224 1.224 0 1 1-.733.68L8.535 5.908v4.27a1.224 1.224 0 1 1-1.008-.036V5.822a1.224 1.224 0 0 1-.664-1.605L5.04 2.394.302 7.13a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.03 1.03 0 0 0 0-1.457" />
          </svg>
          <span className="git-branch-name">{status.branch}</span>
          {(status.ahead > 0 || status.behind > 0) && (
            <span className="git-sync-status">
              {status.ahead > 0 && <span className="git-ahead">{status.ahead}</span>}
              {status.behind > 0 && <span className="git-behind">{status.behind}</span>}
            </span>
          )}
        </div>

        <div className="git-toolbar">
          {/* Undo */}
          <button className="git-toolbar-btn" onClick={handleUndo} title={t('git.undoCommit')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
            </svg>
            <span>{t('git.undo')}</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Pull */}
          <button className="git-toolbar-btn" onClick={handlePull} title="Pull">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
            </svg>
            <span>Pull</span>
          </button>

          {/* Push */}
          <button className="git-toolbar-btn" onClick={handlePush} title="Push">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
            </svg>
            <span>Push</span>
          </button>

          {/* Fetch */}
          <button className="git-toolbar-btn" onClick={handleFetch} title="Fetch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span>Fetch</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Branch */}
          <button className="git-toolbar-btn" onClick={() => setShowNewBranch(true)} title={t('git.newBranch')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span>{t('git.branch')}</span>
          </button>

          {/* Stash */}
          <button className="git-toolbar-btn" onClick={handleStash} title="Stash">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M4 12h16" />
            </svg>
            <span>Stash</span>
          </button>

          {/* Pop */}
          <button className="git-toolbar-btn" onClick={handleStashPop} title="Pop stash">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M12 8v8" /><path d="M8 12l4-4 4 4" />
            </svg>
            <span>Pop</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Compare */}
          <button
            className={`git-toolbar-btn${showBranchCompare ? ' git-toolbar-btn--active' : ''}`}
            onClick={() => { setShowBranchCompare(!showBranchCompare); setBlameFile(null); setBlameData([]) }}
            title={t('common.compare')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>{t('common.compare')}</span>
          </button>

          {/* Terminal */}
          <button className="git-toolbar-btn" onClick={handleSwitchToTerminal} title={t('git.terminal')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span>{t('git.terminal')}</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Refresh */}
          <button className="git-toolbar-btn" onClick={refresh} title={t('common.refresh')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            </svg>
            <span />
          </button>
        </div>
      </div>

      {/* ===== Body: sidebar + center + right panel ===== */}
      <div className="git-body">
        {/* --- Branch Sidebar --- */}
        <div className="git-sidebar">
          {/* New branch button */}
          <div className="git-sidebar-newbranch">
            {showNewBranch ? (
              <div className="git-sidebar-newbranch-form">
                <input
                  className="git-sidebar-input"
                  placeholder="Nom..."
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBranch()
                    if (e.key === 'Escape') setShowNewBranch(false)
                  }}
                  autoFocus
                />
                <button className="git-sidebar-btn" onClick={handleCreateBranch}>OK</button>
                <button className="git-sidebar-btn" onClick={() => setShowNewBranch(false)}>x</button>
              </div>
            ) : (
              <button className="git-sidebar-btn git-sidebar-btn--full" onClick={() => setShowNewBranch(true)}>
                {t('git.newBranch')}
              </button>
            )}
          </div>

          {/* Local branches */}
          <BranchSection title={t('git.local', { count: String(localBranches.length) })} collapsed={localCollapsed} onToggle={() => setLocalCollapsed(!localCollapsed)}>
            {localBranches.map((branch) => (
              <div
                key={branch.name}
                className={`git-sidebar-branch${branch.name === status.branch ? ' git-sidebar-branch--active' : ''}`}
                onClick={() => branch.name !== status.branch && handleCheckout(branch.name)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setBranchCtx({ x: e.clientX, y: e.clientY, branch: branch.name })
                }}
              >
                {renamingBranch === branch.name ? (
                  <input
                    ref={renameInputRef}
                    className="git-sidebar-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameBranch}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameBranch()
                      if (e.key === 'Escape') setRenamingBranch(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="git-sidebar-branch-name">
                      {branch.name === status.branch && <span className="git-sidebar-dot" />}
                      {branch.name}
                    </span>
                    <span className="git-sidebar-branch-hash">{branch.hash}</span>
                  </>
                )}
              </div>
            ))}
          </BranchSection>

          {/* Remote branches */}
          {remoteBranches.length > 0 && (
            <BranchSection title={t('git.remote', { count: String(remoteBranches.length) })} collapsed={remoteCollapsed} onToggle={() => setRemoteCollapsed(!remoteCollapsed)}>
              {remoteBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="git-sidebar-branch git-sidebar-branch--remote"
                  onClick={() => handleCheckout(branch.name)}
                >
                  <span className="git-sidebar-branch-name">{branch.name}</span>
                  <span className="git-sidebar-branch-hash">{branch.hash}</span>
                </div>
              ))}
            </BranchSection>
          )}

          {/* Stashes */}
          <BranchSection title={t('git.stashes', { count: String(stashes.length) })} collapsed={stashCollapsed} onToggle={() => setStashCollapsed(!stashCollapsed)}>
            {stashes.length === 0 ? (
              <div className="git-sidebar-empty">{t('git.noStash')}</div>
            ) : (
              stashes.map((stash) => (
                <div key={stash.ref} className="git-sidebar-stash">
                  <span className="git-sidebar-stash-ref">{stash.ref}</span>
                  <span className="git-sidebar-stash-msg">{stash.message}</span>
                </div>
              ))
            )}
          </BranchSection>

          {/* Tags */}
          <BranchSection title={t('git.tags', { count: String(tags.length) })} collapsed={tagsCollapsed} onToggle={() => setTagsCollapsed(!tagsCollapsed)}>
            {showNewTag ? (
              <div className="git-sidebar-tag-form">
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.tagNamePlaceholder')}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateTag()
                    if (e.key === 'Escape') setShowNewTag(false)
                  }}
                  autoFocus
                />
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.tagMessagePlaceholder')}
                  value={newTagMessage}
                  onChange={(e) => setNewTagMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateTag()
                    if (e.key === 'Escape') setShowNewTag(false)
                  }}
                />
                <div className="git-sidebar-tag-form-actions">
                  <button className="git-sidebar-btn" onClick={handleCreateTag}>{t('common.create')}</button>
                  <button className="git-sidebar-btn" onClick={() => setShowNewTag(false)}>x</button>
                </div>
              </div>
            ) : (
              <div className="git-sidebar-tag-add">
                <button className="git-sidebar-btn git-sidebar-btn--full" onClick={() => setShowNewTag(true)}>{t('git.newTag')}</button>
              </div>
            )}
            {tags.length === 0 ? (
              <div className="git-sidebar-empty">{t('git.noTags')}</div>
            ) : (
              tags.map((tag) => (
                <div key={tag.name} className="git-sidebar-tag">
                  <div className="git-sidebar-tag-info">
                    <span className="git-sidebar-tag-name">
                      {tag.isAnnotated && <span className="git-sidebar-tag-icon">@</span>}
                      {tag.name}
                    </span>
                    <span className="git-sidebar-branch-hash">{tag.hash}</span>
                  </div>
                  <button
                    className="git-sidebar-tag-delete"
                    onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.name) }}
                    title={t('git.deleteTag')}
                  >x</button>
                </div>
              ))
            )}
          </BranchSection>

          {/* Remotes */}
          <BranchSection title={t('git.remotes', { count: String(remotes.length) })} collapsed={remotesCollapsed} onToggle={() => setRemotesCollapsed(!remotesCollapsed)}>
            {showNewRemote ? (
              <div className="git-sidebar-remote-form">
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.remoteNamePlaceholder')}
                  value={newRemoteName}
                  onChange={(e) => setNewRemoteName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowNewRemote(false)
                  }}
                  autoFocus
                />
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.remoteUrlPlaceholder')}
                  value={newRemoteUrl}
                  onChange={(e) => setNewRemoteUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRemote()
                    if (e.key === 'Escape') setShowNewRemote(false)
                  }}
                />
                <div className="git-sidebar-remote-form-actions">
                  <button className="git-sidebar-btn" onClick={handleAddRemote}>{t('common.add')}</button>
                  <button className="git-sidebar-btn" onClick={() => setShowNewRemote(false)}>x</button>
                </div>
              </div>
            ) : (
              <div className="git-sidebar-remote-add">
                <button className="git-sidebar-btn git-sidebar-btn--full" onClick={() => setShowNewRemote(true)}>{t('git.newRemote')}</button>
              </div>
            )}
            {remotes.length === 0 ? (
              <div className="git-sidebar-empty">{t('git.noRemotes')}</div>
            ) : (
              remotes.map((remote) => (
                <div key={remote.name} className="git-sidebar-remote">
                  <div className="git-sidebar-remote-info">
                    <span className="git-sidebar-remote-name">{remote.name}</span>
                    <span className="git-sidebar-remote-url" title={remote.fetchUrl}>{remote.fetchUrl}</span>
                  </div>
                  <button
                    className="git-sidebar-tag-delete"
                    onClick={(e) => { e.stopPropagation(); handleRemoveRemote(remote.name) }}
                    title={t('common.delete')}
                  >x</button>
                </div>
              ))
            )}
          </BranchSection>
        </div>

        {/* --- Center Area: Graph OR Diff OR Commit Detail OR Blame OR Branch Compare --- */}
        <div className="git-center">
          {/* Branch comparison view */}
          {showBranchCompare ? (
            <div className="git-branch-compare">
              <div className="git-diff-panel-header">
                <span>{t('git.branchComparison')}</span>
                <button onClick={() => { setShowBranchCompare(false); setBranchDiffResult('') }}>&times;</button>
              </div>
              <div className="git-branch-compare-controls">
                <select
                  className="git-branch-compare-select"
                  value={compareBranch1}
                  onChange={(e) => setCompareBranch1(e.target.value)}
                >
                  <option value="">{t('git.branch1')}</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <span className="git-branch-compare-sep">...</span>
                <select
                  className="git-branch-compare-select"
                  value={compareBranch2}
                  onChange={(e) => setCompareBranch2(e.target.value)}
                >
                  <option value="">{t('git.branch2')}</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <button
                  className="git-action-btn"
                  onClick={handleCompareBranches}
                  disabled={!compareBranch1 || !compareBranch2}
                >
                  {t('common.compare')}
                </button>
              </div>
              {branchDiffResult && (
                <div className="git-branch-compare-result">
                  <pre className="git-branch-compare-output">{branchDiffResult}</pre>
                </div>
              )}
            </div>
          ) : blameFile && blameData.length > 0 ? (
            /* Blame view */
            <div className="git-blame-view">
              <div className="git-diff-panel-header">
                <span>{t('git.blame', { file: blameFile! })}</span>
                <button onClick={() => { setBlameFile(null); setBlameData([]) }}>&times;</button>
              </div>
              <div className="git-blame-scroll">
                {blameData.map((line, i) => (
                  <div key={i} className="git-blame-line">
                    <span className="git-blame-hash">{line.hash}</span>
                    <span className="git-blame-author">{line.author}</span>
                    <span className="git-blame-date">{relativeDate(line.date)}</span>
                    <span className="git-blame-lineno">{line.lineNumber}</span>
                    <span className="git-blame-content">{line.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedFile && !selectedCommit ? (
            /* Inline file diff (replaces graph when a file is selected) */
            <div className="git-inline-diff">
              <div className="git-diff-panel-header">
                <span>{selectedFile}</span>
                <button onClick={() => { setSelectedFile(null); setDiffContent(''); useViewStore.getState().setHighlightedFilePath(null) }}>&times;</button>
              </div>
              <DiffViewer diff={diffContent} />
            </div>
          ) : selectedCommit && commitDetail ? (
            /* Commit Detail (replaces graph when a commit is selected) */
            <div className="git-commit-detail">
              <div className="git-commit-detail-header">
                <span className="git-commit-detail-hash">{selectedCommit.shortHash}</span>
                <span className="git-commit-detail-msg">{selectedCommit.message}</span>
                <button className="git-commit-detail-close" onClick={() => { setSelectedCommit(null); setCommitDetail(null) }}>&times;</button>
              </div>
              <div className="git-commit-detail-meta">
                <span>{selectedCommit.author}</span>
                <span>{new Date(selectedCommit.date).toLocaleString('fr-FR')}</span>
                {selectedCommit.parents.length > 0 && (
                  <span className="git-commit-detail-parents">
                    Parents: {selectedCommit.parents.map((p) => p.slice(0, 7)).join(', ')}
                  </span>
                )}
                <button
                  className="git-action-btn git-cherry-pick-btn"
                  onClick={() => handleCherryPick(selectedCommit.hash)}
                  title="Cherry-pick ce commit"
                >
                  Cherry-pick
                </button>
              </div>
              {selectedCommit.refs.length > 0 && (
                <div className="git-commit-detail-refs">
                  {selectedCommit.refs.map((ref) => <RefBadge key={ref} refName={ref} />)}
                </div>
              )}
              <div className="git-commit-files-diff">
                <div className="git-commit-files">
                  {commitDetail.files.map((f) => {
                    const st = fileStatusLabel(f.status)
                    return (
                      <div
                        key={f.file}
                        className={`git-commit-file git-commit-file--clickable${selectedCommitFile === f.file ? ' git-commit-file--selected' : ''}`}
                        onClick={() => setSelectedCommitFile(f.file)}
                      >
                        <span className={`git-fstatus ${st.className}`}>{st.label}</span>
                        <span className="git-commit-file-name">{f.file}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="git-commit-diff-area">
                  <DiffViewer diff={selectedCommitFile ? extractFileDiff(commitDetail.diff, selectedCommitFile) : commitDetail.diff} />
                </div>
              </div>
            </div>
          ) : (
            /* Commit Graph (default view) — continuous SVG */
            <div className="git-graph-area">
              <div className="git-graph-scroll">
                {graphData.length === 0 ? (
                  <div className="git-graph-empty">{t('git.noCommits')}</div>
                ) : (
                  <div className="git-graph-canvas" style={{ position: 'relative', height: graphData.length * ROW_HEIGHT }}>
                    <GitGraph data={graphData} maxLane={graphMaxLane} rowHeight={ROW_HEIGHT} laneWidth={LANE_WIDTH} />
                    <div className="git-graph-rows" style={{ marginLeft: (graphMaxLane + 1) * LANE_WIDTH + 12 }}>
                      {graphData.map((info, idx) => (
                        <div
                          key={info.entry.hash}
                          className={`git-graph-row${selectedCommit?.hash === info.entry.hash ? ' git-graph-row--selected' : ''}`}
                          style={{ height: ROW_HEIGHT, top: idx * ROW_HEIGHT, position: 'absolute', left: 0, right: 0 }}
                          onClick={() => handleSelectCommit(info.entry)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setCommitCtx({ x: e.clientX, y: e.clientY, entry: info.entry })
                          }}
                        >
                          <div className="git-graph-info">
                            <span className="git-graph-message">{info.entry.message}</span>
                            {info.entry.refs.length > 0 && (
                              <span className="git-graph-refs">
                                {info.entry.refs.map((ref) => <RefBadge key={ref} refName={ref} />)}
                              </span>
                            )}
                          </div>
                          <span className="git-graph-author" title={info.entry.authorEmail}>{info.entry.author}</span>
                          <span className="git-graph-date">{relativeDate(info.entry.date)}</span>
                          <span className="git-graph-hash">{info.entry.shortHash}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* --- Right Panel: File groups + Commit form --- */}
        <div className="git-right-panel">
          {totalChanges === 0 ? (
            <div className="git-changes-clean">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M5 8l2 2 4-4" />
              </svg>
              {t('git.clean')}
            </div>
          ) : (
            <>
              <div className="git-right-files">
                {/* Staged */}
                {status.staged.length > 0 && (
                  <div className="git-file-group">
                    <div className="git-file-group-header">
                      <span>{t('git.staged', { count: String(status.staged.length) })}</span>
                      <button className="git-file-group-action" onClick={handleUnstageAll} title={t('git.unstageAll')}>Unstage all</button>
                    </div>
                    {status.staged.map((file) => (
                      <div
                        key={`s-${file}`}
                        className={`git-file git-file--staged${selectedFile === file ? ' git-file--selected' : ''}`}
                        onClick={() => handleFileDiff(file, true)}
                      >
                        <span className="git-file-badge git-file-badge--staged">S</span>
                        <span className="git-file-name">{file}</span>
                        <button className="git-file-action" onClick={(e) => { e.stopPropagation(); handleUnstageFile(file) }} title="Unstage">-</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Modified */}
                {status.modified.length > 0 && (
                  <div className="git-file-group">
                    <div className="git-file-group-header">
                      <span>{t('git.modified', { count: String(status.modified.length) })}</span>
                      <button className="git-file-group-action" onClick={handleStageAll} title={t('git.stageAll')}>Stage all</button>
                    </div>
                    {status.modified.map((file) => (
                      <div
                        key={`m-${file}`}
                        className={`git-file git-file--modified${selectedFile === file ? ' git-file--selected' : ''}`}
                        onClick={() => handleFileDiff(file, false)}
                      >
                        <span className="git-file-badge git-file-badge--modified">M</span>
                        <span className="git-file-name">{file}</span>
                        <span className="git-file-actions">
                          <button className="git-file-action" onClick={(e) => { e.stopPropagation(); handleBlame(file) }} title="Blame">B</button>
                          <button className="git-file-action" onClick={(e) => { e.stopPropagation(); handleStageFile(file) }} title="Stage">+</button>
                          <button className="git-file-action git-file-action--danger" onClick={(e) => { e.stopPropagation(); handleDiscardFile(file) }} title="Discard">x</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Untracked */}
                {status.untracked.length > 0 && (
                  <div className="git-file-group">
                    <div className="git-file-group-header">
                      <span>Untracked ({status.untracked.length})</span>
                    </div>
                    {status.untracked.map((file) => (
                      <div
                        key={`u-${file}`}
                        className={`git-file git-file--untracked${selectedFile === file ? ' git-file--selected' : ''}`}
                        onClick={() => handleFileDiff(file, false)}
                      >
                        <span className="git-file-badge git-file-badge--untracked">?</span>
                        <span className="git-file-name">{file}</span>
                        <button className="git-file-action" onClick={(e) => { e.stopPropagation(); handleStageFile(file) }} title="Stage">+</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Commit form */}
              <div className="git-commit-area">
                <textarea
                  className="git-commit-input"
                  placeholder={t('git.commitMessage')}
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) handleCommit()
                  }}
                  rows={2}
                />
                <button
                  className="git-commit-btn"
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || status.staged.length === 0}
                  title={status.staged.length === 0 ? t('git.addFilesToStaging') : 'Cmd+Enter'}
                >
                  {t('git.commit', { count: String(status.staged.length) })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="git-statusbar">
        <span>{t('git.filesChanged', { count: String(totalChanges) })}</span>
        <span>{t('git.stagedCount', { count: String(status.staged.length) })}</span>
        <span>{t('git.untrackedCount', { count: String(status.untracked.length) })}</span>
        <span>{t('git.commitCount', { count: String(log.length) })}</span>
        <span>{t('git.tagCount', { count: String(tags.length) })}</span>
      </div>

      {/* Branch context menu */}
      {branchCtx && (
        <ContextMenu
          x={branchCtx.x}
          y={branchCtx.y}
          items={getBranchContextItems(branchCtx.branch)}
          onClose={() => setBranchCtx(null)}
        />
      )}

      {/* Commit context menu */}
      {commitCtx && (
        <ContextMenu
          x={commitCtx.x}
          y={commitCtx.y}
          items={getCommitContextItems(commitCtx.entry)}
          onClose={() => setCommitCtx(null)}
        />
      )}
    </div>
  )
}
