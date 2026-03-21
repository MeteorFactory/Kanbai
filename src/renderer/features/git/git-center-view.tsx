import React from 'react'
import type { GitLogEntry, GitStatus, GitBlameLine, Project } from '../../../shared/types'
import type { CommitFileInfo, BranchInfo, GraphCommitInfo } from './git-types'
import { useViewStore } from '../../lib/stores/viewStore'
import { useI18n } from '../../lib/i18n'
import { GitGraph, LANE_WIDTH, ROW_HEIGHT } from './git-graph-renderer'
import { RefBadge, DiffViewer, relativeDate, extractFileDiff, fileStatusLabel } from './git-ui-components'

interface GitDashboardProps {
  workspaceProjects: Project[]
  statusByProject: Map<string, GitStatus>
  loadingProjects: Set<string>
  setSelectedProjectId: (id: string | null) => void
  handleFetchProject: (project: Project) => void
  handlePullProject: (project: Project) => void
  handleGitInit: (project: Project) => void
}

export function GitDashboard(props: GitDashboardProps) {
  const { t } = useI18n()

  if (props.workspaceProjects.length === 0) {
    return <div className="git-dashboard-empty">{t('git.selectProject')}</div>
  }

  return (
    <div className="git-dashboard">
      <div className="git-dashboard-grid">
        {props.workspaceProjects.map((project) => {
          const projectStatus = props.statusByProject.get(project.id)
          const isLoading = props.loadingProjects.has(project.id)
          const isGitRepo = !!projectStatus

          return (
            <div
              key={project.id}
              className="git-dashboard-card"
              onClick={() => props.setSelectedProjectId(project.id)}
            >
              <div className="git-dashboard-card-header">
                <span className="git-dashboard-card-name">{project.name}</span>
                {isGitRepo && (
                  <span className="git-dashboard-card-branch">{projectStatus.branch}</span>
                )}
              </div>
              {isLoading ? (
                <div className="git-dashboard-card-stats">
                  <span>{t('common.loading')}</span>
                </div>
              ) : isGitRepo ? (
                <>
                  <div className="git-dashboard-card-stats">
                    {projectStatus.staged.length > 0 && (
                      <span className="git-dashboard-card-stat git-dashboard-card-stat--staged">
                        S: {projectStatus.staged.length}
                      </span>
                    )}
                    {projectStatus.modified.length > 0 && (
                      <span className="git-dashboard-card-stat git-dashboard-card-stat--modified">
                        M: {projectStatus.modified.length}
                      </span>
                    )}
                    {projectStatus.untracked.length > 0 && (
                      <span className="git-dashboard-card-stat git-dashboard-card-stat--untracked">
                        ?: {projectStatus.untracked.length}
                      </span>
                    )}
                    {projectStatus.staged.length === 0 && projectStatus.modified.length === 0 && projectStatus.untracked.length === 0 && (
                      <span style={{ color: 'var(--success)' }}>Clean</span>
                    )}
                  </div>
                  {(projectStatus.ahead > 0 || projectStatus.behind > 0) && (
                    <div className="git-dashboard-card-sync">
                      {projectStatus.ahead > 0 && <span className="git-ahead">{projectStatus.ahead}</span>}
                      {projectStatus.behind > 0 && <span className="git-behind">{projectStatus.behind}</span>}
                    </div>
                  )}
                  <div className="git-dashboard-card-actions">
                    <button
                      className="git-dashboard-card-btn"
                      onClick={(e) => { e.stopPropagation(); props.handleFetchProject(project) }}
                    >
                      Fetch
                    </button>
                    <button
                      className="git-dashboard-card-btn"
                      onClick={(e) => { e.stopPropagation(); props.handlePullProject(project) }}
                    >
                      Pull
                    </button>
                  </div>
                </>
              ) : (
                <div className="git-dashboard-no-git">
                  {t('git.notGitRepo')}
                  <button
                    className="git-dashboard-card-btn"
                    style={{ marginLeft: 8 }}
                    onClick={(e) => { e.stopPropagation(); props.handleGitInit(project) }}
                  >
                    {t('git.initGit')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GitCenterViewProps {
  status: GitStatus
  selectedProject: Project
  loadingProjects: Set<string>
  selectedProjectId: string | null
  // Branch compare
  showBranchCompare: boolean
  compareBranch1: string
  compareBranch2: string
  branchDiffResult: string
  currentBranches: BranchInfo[]
  setShowBranchCompare: (v: boolean) => void
  setCompareBranch1: (v: string) => void
  setCompareBranch2: (v: string) => void
  setBranchDiffResult: (v: string) => void
  handleCompareBranches: () => void
  // Blame
  blameFile: string | null
  blameData: GitBlameLine[]
  setBlameFile: (v: string | null) => void
  setBlameData: (v: GitBlameLine[]) => void
  // File diff
  selectedFile: string | null
  diffContent: string
  setSelectedFile: (v: string | null) => void
  setDiffContent: (v: string) => void
  // Commit detail
  selectedCommit: GitLogEntry | null
  commitDetail: { files: CommitFileInfo[]; diff: string } | null
  selectedCommitFile: string | null
  setSelectedCommit: (v: GitLogEntry | null) => void
  setCommitDetail: (v: { files: CommitFileInfo[]; diff: string } | null) => void
  setSelectedCommitFile: (v: string | null) => void
  handleCherryPick: (hash: string) => void
  handleSelectCommit: (entry: GitLogEntry) => void
  // Graph
  graphData: GraphCommitInfo[]
  graphMaxLane: number
  graphScrollRef: React.RefObject<HTMLDivElement | null>
  setCommitCtx: (ctx: { x: number; y: number; entry: GitLogEntry } | null) => void
  // Init
  handleGitInit: (project: Project) => void
  localeCode: string
}

export function GitCenterView(props: GitCenterViewProps) {
  const { t } = useI18n()

  if (!props.status) {
    return (
      <div className="git-center">
        <div className="git-empty">
          {props.loadingProjects.has(props.selectedProjectId!) ? t('common.loading') : (
            <div style={{ textAlign: 'center' }}>
              <p>{t('git.notGitRepo')}</p>
              <button className="git-action-btn" style={{ marginTop: 12, height: 32, padding: '0 20px', fontSize: 13 }} onClick={() => props.handleGitInit(props.selectedProject!)}>
                {t('git.initGit')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="git-center">
      {/* Branch comparison view */}
      {props.showBranchCompare ? (
        <div className="git-branch-compare">
          <div className="git-diff-panel-header">
            <span>{t('git.branchComparison')}</span>
            <button onClick={() => { props.setShowBranchCompare(false); props.setBranchDiffResult('') }}>&times;</button>
          </div>
          <div className="git-branch-compare-controls">
            <select
              className="git-branch-compare-select"
              value={props.compareBranch1}
              onChange={(e) => props.setCompareBranch1(e.target.value)}
            >
              <option value="">{t('git.branch1')}</option>
              {props.currentBranches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            <span className="git-branch-compare-sep">...</span>
            <select
              className="git-branch-compare-select"
              value={props.compareBranch2}
              onChange={(e) => props.setCompareBranch2(e.target.value)}
            >
              <option value="">{t('git.branch2')}</option>
              {props.currentBranches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            <button
              className="git-action-btn"
              onClick={props.handleCompareBranches}
              disabled={!props.compareBranch1 || !props.compareBranch2}
            >
              {t('common.compare')}
            </button>
          </div>
          {props.branchDiffResult && (
            <div className="git-branch-compare-result">
              <pre className="git-branch-compare-output">{props.branchDiffResult}</pre>
            </div>
          )}
        </div>
      ) : props.blameFile && props.blameData.length > 0 ? (
        /* Blame view */
        <div className="git-blame-view">
          <div className="git-diff-panel-header">
            <span>{t('git.blame', { file: props.blameFile! })}</span>
            <button onClick={() => { props.setBlameFile(null); props.setBlameData([]) }}>&times;</button>
          </div>
          <div className="git-blame-scroll">
            {props.blameData.map((line, i) => (
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
      ) : props.selectedFile && !props.selectedCommit ? (
        /* Inline file diff (replaces graph when a file is selected) */
        <div className="git-inline-diff">
          <div className="git-diff-panel-header">
            <span>{props.selectedFile}</span>
            <button onClick={() => { props.setSelectedFile(null); props.setDiffContent(''); useViewStore.getState().setHighlightedFilePath(null) }}>&times;</button>
          </div>
          <DiffViewer diff={props.diffContent} />
        </div>
      ) : props.selectedCommit && props.commitDetail ? (
        /* Commit Detail (replaces graph when a commit is selected) */
        <div className="git-commit-detail">
          <div className="git-commit-detail-header">
            <span className="git-commit-detail-hash">{props.selectedCommit.shortHash}</span>
            <span className="git-commit-detail-msg">{props.selectedCommit.message}</span>
            <button className="git-commit-detail-close" onClick={() => { props.setSelectedCommit(null); props.setCommitDetail(null) }}>&times;</button>
          </div>
          <div className="git-commit-detail-meta">
            <span>{props.selectedCommit.author}</span>
            <span>{new Date(props.selectedCommit.date).toLocaleString(props.localeCode)}</span>
            {props.selectedCommit.parents.length > 0 && (
              <span className="git-commit-detail-parents">
                Parents: {props.selectedCommit.parents.map((p) => p.slice(0, 7)).join(', ')}
              </span>
            )}
            <button
              className="git-action-btn git-cherry-pick-btn"
              onClick={() => props.handleCherryPick(props.selectedCommit!.hash)}
              title="Cherry-pick ce commit"
            >
              Cherry-pick
            </button>
          </div>
          {props.selectedCommit.refs.length > 0 && (
            <div className="git-commit-detail-refs">
              {props.selectedCommit.refs.map((ref) => <RefBadge key={ref} refName={ref} />)}
            </div>
          )}
          <div className="git-commit-files-diff">
            <div className="git-commit-files">
              {props.commitDetail.files.map((f) => {
                const st = fileStatusLabel(f.status)
                return (
                  <div
                    key={f.file}
                    className={`git-commit-file git-commit-file--clickable${props.selectedCommitFile === f.file ? ' git-commit-file--selected' : ''}`}
                    onClick={() => props.setSelectedCommitFile(f.file)}
                  >
                    <span className={`git-fstatus ${st.className}`}>{st.label}</span>
                    <span className="git-commit-file-name">{f.file}</span>
                  </div>
                )
              })}
            </div>
            <div className="git-commit-diff-area">
              <DiffViewer diff={props.selectedCommitFile ? extractFileDiff(props.commitDetail.diff, props.selectedCommitFile) : props.commitDetail.diff} />
            </div>
          </div>
        </div>
      ) : (
        /* Commit Graph (default view) — continuous SVG */
        <div className="git-graph-area">
          <div className="git-graph-scroll" ref={props.graphScrollRef}>
            {props.graphData.length === 0 ? (
              <div className="git-graph-empty">{t('git.noCommits')}</div>
            ) : (
              <div className="git-graph-canvas" style={{ position: 'relative', height: props.graphData.length * ROW_HEIGHT }}>
                <GitGraph data={props.graphData} maxLane={props.graphMaxLane} rowHeight={ROW_HEIGHT} laneWidth={LANE_WIDTH} />
                <div className="git-graph-rows" style={{ marginLeft: (props.graphMaxLane + 1) * LANE_WIDTH + 12 }}>
                  {props.graphData.map((info, idx) => (
                    <div
                      key={info.entry.hash}
                      className={`git-graph-row${props.selectedCommit?.hash === info.entry.hash ? ' git-graph-row--selected' : ''}`}
                      style={{ height: ROW_HEIGHT, top: idx * ROW_HEIGHT, position: 'absolute', left: 0, right: 0 }}
                      onClick={() => props.handleSelectCommit(info.entry)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        props.setCommitCtx({ x: e.clientX, y: e.clientY, entry: info.entry })
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
  )
}
