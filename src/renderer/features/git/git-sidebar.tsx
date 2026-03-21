import { useRef, useEffect } from 'react'
import type { GitStatus, GitTag, GitRemote, Project } from '../../../shared/types'
import type { StashEntry, BranchInfo } from './git-types'
import { ALL_PROJECTS_ID } from './git-types'
import { BranchSection, relativeDate } from './git-ui-components'
import { useI18n } from '../../lib/i18n'

interface GitSidebarProps {
  workspaceProjects: Project[]
  statusByProject: Map<string, GitStatus>
  loadingProjects: Set<string>
  selectedProjectId: string | null
  collapsedProjects: Set<string>
  isAllProjectsView: boolean
  selectedProject: Project | null
  status: GitStatus | null
  localBranches: BranchInfo[]
  remoteBranches: BranchInfo[]
  currentStashes: StashEntry[]
  currentTags: GitTag[]
  currentRemotes: GitRemote[]
  // Sidebar collapse state
  localCollapsed: boolean
  remoteCollapsed: boolean
  stashCollapsed: boolean
  tagsCollapsed: boolean
  remotesCollapsed: boolean
  setLocalCollapsed: (v: boolean) => void
  setRemoteCollapsed: (v: boolean) => void
  setStashCollapsed: (v: boolean) => void
  setTagsCollapsed: (v: boolean) => void
  setRemotesCollapsed: (v: boolean) => void
  // New branch
  showNewBranch: boolean
  newBranchName: string
  setShowNewBranch: (v: boolean) => void
  setNewBranchName: (v: string) => void
  handleCreateBranch: () => void
  // New tag
  showNewTag: boolean
  newTagName: string
  newTagMessage: string
  setShowNewTag: (v: boolean) => void
  setNewTagName: (v: string) => void
  setNewTagMessage: (v: string) => void
  handleCreateTag: () => void
  handleDeleteTag: (name: string) => void
  scrollToTagCommit: (tag: GitTag) => void
  // New remote
  showNewRemote: boolean
  newRemoteName: string
  newRemoteUrl: string
  setShowNewRemote: (v: boolean) => void
  setNewRemoteName: (v: string) => void
  setNewRemoteUrl: (v: string) => void
  handleAddRemote: () => void
  handleRemoveRemote: (name: string) => void
  // Branch actions
  handleCheckout: (branch: string) => void
  renamingBranch: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  setRenamingBranch: (v: string | null) => void
  handleRenameBranch: () => void
  setBranchCtx: (ctx: { x: number; y: number; branch: string } | null) => void
  // Project actions
  setSelectedProjectId: (id: string | null) => void
  toggleProjectCollapse: (id: string) => void
}

export function GitSidebar(props: GitSidebarProps) {
  const { t } = useI18n()
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (props.renamingBranch && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [props.renamingBranch])

  return (
    <div className="git-sidebar">
      {/* Project list */}
      <div className="git-project-list">
        {/* All projects entry */}
        <div
          className={`git-project-all${props.isAllProjectsView ? ' git-project-all--active' : ''}`}
          onClick={() => props.setSelectedProjectId(ALL_PROJECTS_ID)}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity={0.6}>
            <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zM9 2.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zM9 10.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
          </svg>
          {t('git.allProjects')}
        </div>

        {/* Project nodes */}
        {props.workspaceProjects.map((project) => {
          const projectStatus = props.statusByProject.get(project.id)
          const isLoading = props.loadingProjects.has(project.id)
          const isSelected = props.selectedProjectId === project.id
          const isGitRepo = !!projectStatus
          const projectChanges = projectStatus
            ? projectStatus.staged.length + projectStatus.modified.length + projectStatus.untracked.length
            : 0

          return (
            <div key={project.id} className="git-project-node">
              <div
                className={`git-project-header${isSelected ? ' git-project-header--active' : ''}`}
                onClick={() => props.setSelectedProjectId(project.id)}
              >
                <button
                  className="git-project-chevron"
                  onClick={(e) => { e.stopPropagation(); props.toggleProjectCollapse(project.id) }}
                >
                  <span style={{
                    transform: props.collapsedProjects.has(project.id) ? 'rotate(0deg)' : 'rotate(90deg)',
                    display: 'inline-block',
                    transition: 'transform 0.15s ease',
                    fontSize: '8px',
                  }}>
                    {'\u25B6'}
                  </span>
                </button>
                <span className="git-project-name" title={project.path}>{project.name}</span>
                <div className="git-project-badges">
                  {isLoading ? (
                    <span className="git-project-loading">...</span>
                  ) : isGitRepo ? (
                    <>
                      <span className="git-project-branch-badge">{projectStatus.branch}</span>
                      {(projectStatus.ahead > 0 || projectStatus.behind > 0) && (
                        <span className="git-project-sync">
                          {projectStatus.ahead > 0 && <span className="git-ahead">{projectStatus.ahead}</span>}
                          {projectStatus.behind > 0 && <span className="git-behind">{projectStatus.behind}</span>}
                        </span>
                      )}
                      {projectChanges > 0 && (
                        <span className="git-project-changes-badge">{projectChanges}</span>
                      )}
                    </>
                  ) : (
                    <span className="git-project-no-git">no git</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Branch/Tag/Stash/Remote sidebar — only when a project is selected */}
      {props.selectedProject && props.status && (
        <>
          {/* New branch button */}
          <div className="git-sidebar-newbranch">
            {props.showNewBranch ? (
              <div className="git-sidebar-newbranch-form">
                <input
                  className="git-sidebar-input"
                  placeholder="Nom..."
                  value={props.newBranchName}
                  onChange={(e) => props.setNewBranchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') props.handleCreateBranch()
                    if (e.key === 'Escape') props.setShowNewBranch(false)
                  }}
                  autoFocus
                />
                <button className="git-sidebar-btn" onClick={props.handleCreateBranch}>OK</button>
                <button className="git-sidebar-btn" onClick={() => props.setShowNewBranch(false)}>x</button>
              </div>
            ) : (
              <button className="git-sidebar-btn git-sidebar-btn--full" onClick={() => props.setShowNewBranch(true)}>
                {t('git.newBranch')}
              </button>
            )}
          </div>

          {/* Local branches */}
          <BranchSection title={t('git.local', { count: String(props.localBranches.length) })} collapsed={props.localCollapsed} onToggle={() => props.setLocalCollapsed(!props.localCollapsed)}>
            {props.localBranches.map((branch) => (
              <div
                key={branch.name}
                className={`git-sidebar-branch${branch.name === props.status!.branch ? ' git-sidebar-branch--active' : ''}`}
                onClick={() => branch.name !== props.status!.branch && props.handleCheckout(branch.name)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  props.setBranchCtx({ x: e.clientX, y: e.clientY, branch: branch.name })
                }}
              >
                {props.renamingBranch === branch.name ? (
                  <input
                    ref={renameInputRef}
                    className="git-sidebar-rename-input"
                    value={props.renameValue}
                    onChange={(e) => props.setRenameValue(e.target.value)}
                    onBlur={props.handleRenameBranch}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') props.handleRenameBranch()
                      if (e.key === 'Escape') props.setRenamingBranch(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="git-sidebar-branch-name">
                      {branch.name === props.status!.branch && <span className="git-sidebar-dot" />}
                      {branch.name}
                    </span>
                    <span className="git-sidebar-branch-hash">{branch.hash}</span>
                  </>
                )}
              </div>
            ))}
          </BranchSection>

          {/* Remote branches */}
          {props.remoteBranches.length > 0 && (
            <BranchSection title={t('git.remote', { count: String(props.remoteBranches.length) })} collapsed={props.remoteCollapsed} onToggle={() => props.setRemoteCollapsed(!props.remoteCollapsed)}>
              {props.remoteBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="git-sidebar-branch git-sidebar-branch--remote"
                  onClick={() => props.handleCheckout(branch.name)}
                >
                  <span className="git-sidebar-branch-name">{branch.name}</span>
                  <span className="git-sidebar-branch-hash">{branch.hash}</span>
                </div>
              ))}
            </BranchSection>
          )}

          {/* Stashes */}
          <BranchSection title={t('git.stashes', { count: String(props.currentStashes.length) })} collapsed={props.stashCollapsed} onToggle={() => props.setStashCollapsed(!props.stashCollapsed)}>
            {props.currentStashes.length === 0 ? (
              <div className="git-sidebar-empty">{t('git.noStash')}</div>
            ) : (
              props.currentStashes.map((stash) => (
                <div key={stash.ref} className="git-sidebar-stash">
                  <span className="git-sidebar-stash-ref">{stash.ref}</span>
                  <span className="git-sidebar-stash-msg">{stash.message}</span>
                </div>
              ))
            )}
          </BranchSection>

          {/* Tags */}
          <BranchSection title={t('git.tags', { count: String(props.currentTags.length) })} collapsed={props.tagsCollapsed} onToggle={() => props.setTagsCollapsed(!props.tagsCollapsed)}>
            {props.showNewTag ? (
              <div className="git-sidebar-tag-form">
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.tagNamePlaceholder')}
                  value={props.newTagName}
                  onChange={(e) => props.setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') props.handleCreateTag()
                    if (e.key === 'Escape') props.setShowNewTag(false)
                  }}
                  autoFocus
                />
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.tagMessagePlaceholder')}
                  value={props.newTagMessage}
                  onChange={(e) => props.setNewTagMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') props.handleCreateTag()
                    if (e.key === 'Escape') props.setShowNewTag(false)
                  }}
                />
                <div className="git-sidebar-tag-form-actions">
                  <button className="git-sidebar-btn" onClick={props.handleCreateTag}>{t('common.create')}</button>
                  <button className="git-sidebar-btn" onClick={() => props.setShowNewTag(false)}>x</button>
                </div>
              </div>
            ) : (
              <div className="git-sidebar-tag-add">
                <button className="git-sidebar-btn git-sidebar-btn--full" onClick={() => props.setShowNewTag(true)}>{t('git.newTag')}</button>
              </div>
            )}
            {props.currentTags.length === 0 ? (
              <div className="git-sidebar-empty">{t('git.noTags')}</div>
            ) : (
              props.currentTags.map((tag) => (
                <div key={tag.name} className="git-sidebar-tag git-sidebar-tag--clickable" onClick={() => props.scrollToTagCommit(tag)} title={t('git.scrollToCommit')}>
                  <div className="git-sidebar-tag-info">
                    <span className="git-sidebar-tag-name">
                      {tag.isAnnotated && <span className="git-sidebar-tag-icon">@</span>}
                      {tag.name}
                    </span>
                    <span className="git-sidebar-tag-date">{relativeDate(tag.date)}</span>
                  </div>
                  <button
                    className="git-sidebar-tag-delete"
                    onClick={(e) => { e.stopPropagation(); props.handleDeleteTag(tag.name) }}
                    title={t('git.deleteTag')}
                  >x</button>
                </div>
              ))
            )}
          </BranchSection>

          {/* Remotes */}
          <BranchSection title={t('git.remotes', { count: String(props.currentRemotes.length) })} collapsed={props.remotesCollapsed} onToggle={() => props.setRemotesCollapsed(!props.remotesCollapsed)}>
            {props.showNewRemote ? (
              <div className="git-sidebar-remote-form">
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.remoteNamePlaceholder')}
                  value={props.newRemoteName}
                  onChange={(e) => props.setNewRemoteName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') props.setShowNewRemote(false)
                  }}
                  autoFocus
                />
                <input
                  className="git-sidebar-input"
                  placeholder={t('git.remoteUrlPlaceholder')}
                  value={props.newRemoteUrl}
                  onChange={(e) => props.setNewRemoteUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') props.handleAddRemote()
                    if (e.key === 'Escape') props.setShowNewRemote(false)
                  }}
                />
                <div className="git-sidebar-remote-form-actions">
                  <button className="git-sidebar-btn" onClick={props.handleAddRemote}>{t('common.add')}</button>
                  <button className="git-sidebar-btn" onClick={() => props.setShowNewRemote(false)}>x</button>
                </div>
              </div>
            ) : (
              <div className="git-sidebar-remote-add">
                <button className="git-sidebar-btn git-sidebar-btn--full" onClick={() => props.setShowNewRemote(true)}>{t('git.newRemote')}</button>
              </div>
            )}
            {props.currentRemotes.length === 0 ? (
              <div className="git-sidebar-empty">{t('git.noRemotes')}</div>
            ) : (
              props.currentRemotes.map((remote) => (
                <div key={remote.name} className="git-sidebar-remote">
                  <div className="git-sidebar-remote-info">
                    <span className="git-sidebar-remote-name">{remote.name}</span>
                    <span className="git-sidebar-remote-url" title={remote.fetchUrl}>{remote.fetchUrl}</span>
                  </div>
                  <button
                    className="git-sidebar-tag-delete"
                    onClick={(e) => { e.stopPropagation(); props.handleRemoveRemote(remote.name) }}
                    title={t('common.delete')}
                  >x</button>
                </div>
              ))
            )}
          </BranchSection>
        </>
      )}
    </div>
  )
}
