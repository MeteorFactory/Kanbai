import type { GitLogEntry } from '../../../shared/types'
import { ContextMenu, type ContextMenuItem } from '../../shared/ui/context-menu'
import { useGitPanel } from './use-git-panel'
import { GitToolbar } from './git-toolbar'
import { GitSidebar } from './git-sidebar'
import { GitDashboard, GitCenterView } from './git-center-view'
import { GitChangesPanel } from './git-changes-panel'
import './git.css'

export function GitPanel() {
  const g = useGitPanel()

  // Branch context menu items
  const getBranchContextItems = (branchName: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    const isCurrent = branchName === g.status?.branch
    if (!isCurrent) {
      items.push({ label: g.t('git.checkout'), action: () => g.handleCheckout(branchName) })
      items.push({
        label: g.t('git.mergeInto', { branch: g.status?.branch ?? '...' }),
        action: () => g.handleMerge(branchName),
      })
    }
    items.push({
      label: g.t('common.rename'),
      action: () => {
        g.setRenamingBranch(branchName)
        g.setRenameValue(branchName)
      },
    })
    if (!isCurrent) {
      items.push({ separator: true, label: '', action: () => {} })
      items.push({
        label: g.t('common.delete'),
        action: () => g.handleDeleteBranch(branchName),
        danger: true,
      })
    }
    return items
  }

  // Commit context menu items
  const getCommitContextItems = (entry: GitLogEntry): ContextMenuItem[] => [
    {
      label: g.t('git.viewDetails'),
      action: () => g.handleSelectCommit(entry),
    },
    {
      label: g.t('git.copyHash'),
      action: () => navigator.clipboard.writeText(entry.hash),
    },
    { separator: true, label: '', action: () => {} },
    {
      label: g.t('git.cherryPickLabel'),
      action: () => g.handleCherryPick(entry.hash),
    },
    {
      label: g.t('git.createBranchFrom'),
      action: async () => {
        const name = window.prompt(g.t('git.newBranch').replace('+ ', ''))
        if (name && g.selectedProject) {
          await window.kanbai.git.checkout(g.selectedProject.path, entry.hash)
          await window.kanbai.git.createBranch(g.selectedProject.path, name.trim())
          g.refreshProject(g.selectedProject)
        }
      },
    },
    {
      label: g.t('git.createTagFrom'),
      action: async () => {
        const name = window.prompt(g.t('git.newTag').replace('+ ', ''))
        if (name && g.selectedProject) {
          await window.kanbai.git.createTag(g.selectedProject.path, name.trim())
          g.refreshProject(g.selectedProject)
        }
      },
    },
  ]

  if (g.workspaceProjects.length === 0) {
    return <div className="git-empty">{g.t('git.selectProject')}</div>
  }

  return (
    <div className="git-panel">
      <GitToolbar
        isAllProjectsView={g.isAllProjectsView}
        status={g.status}
        selectedProject={g.selectedProject}
        showBranchCompare={g.showBranchCompare}
        refreshAll={g.refreshAll}
        refreshSelected={g.refreshSelected}
        handleUndo={g.handleUndo}
        handlePull={g.handlePull}
        handlePush={g.handlePush}
        handleFetch={g.handleFetch}
        handleStash={g.handleStash}
        handleStashPop={g.handleStashPop}
        handleSwitchToTerminal={g.handleSwitchToTerminal}
        setShowNewBranch={g.setShowNewBranch}
        setShowBranchCompare={g.setShowBranchCompare}
        setBlameFile={g.setBlameFile}
        setBlameData={g.setBlameData}
      />

      <div className="git-body">
        <GitSidebar
          workspaceProjects={g.workspaceProjects}
          statusByProject={g.statusByProject}
          loadingProjects={g.loadingProjects}
          selectedProjectId={g.selectedProjectId}
          collapsedProjects={g.collapsedProjects}
          isAllProjectsView={g.isAllProjectsView}
          selectedProject={g.selectedProject}
          status={g.status}
          localBranches={g.localBranches}
          remoteBranches={g.remoteBranches}
          currentStashes={g.currentStashes}
          currentTags={g.currentTags}
          currentRemotes={g.currentRemotes}
          localCollapsed={g.localCollapsed}
          remoteCollapsed={g.remoteCollapsed}
          stashCollapsed={g.stashCollapsed}
          tagsCollapsed={g.tagsCollapsed}
          remotesCollapsed={g.remotesCollapsed}
          setLocalCollapsed={g.setLocalCollapsed}
          setRemoteCollapsed={g.setRemoteCollapsed}
          setStashCollapsed={g.setStashCollapsed}
          setTagsCollapsed={g.setTagsCollapsed}
          setRemotesCollapsed={g.setRemotesCollapsed}
          showNewBranch={g.showNewBranch}
          newBranchName={g.newBranchName}
          setShowNewBranch={g.setShowNewBranch}
          setNewBranchName={g.setNewBranchName}
          handleCreateBranch={g.handleCreateBranch}
          showNewTag={g.showNewTag}
          newTagName={g.newTagName}
          newTagMessage={g.newTagMessage}
          setShowNewTag={g.setShowNewTag}
          setNewTagName={g.setNewTagName}
          setNewTagMessage={g.setNewTagMessage}
          handleCreateTag={g.handleCreateTag}
          handleDeleteTag={g.handleDeleteTag}
          scrollToTagCommit={g.scrollToTagCommit}
          showNewRemote={g.showNewRemote}
          newRemoteName={g.newRemoteName}
          newRemoteUrl={g.newRemoteUrl}
          setShowNewRemote={g.setShowNewRemote}
          setNewRemoteName={g.setNewRemoteName}
          setNewRemoteUrl={g.setNewRemoteUrl}
          handleAddRemote={g.handleAddRemote}
          handleRemoveRemote={g.handleRemoveRemote}
          handleCheckout={g.handleCheckout}
          renamingBranch={g.renamingBranch}
          renameValue={g.renameValue}
          setRenameValue={g.setRenameValue}
          setRenamingBranch={g.setRenamingBranch}
          handleRenameBranch={g.handleRenameBranch}
          setBranchCtx={g.setBranchCtx}
          setSelectedProjectId={g.setSelectedProjectId}
          toggleProjectCollapse={g.toggleProjectCollapse}
        />

        {g.isAllProjectsView ? (
          <GitDashboard
            workspaceProjects={g.workspaceProjects}
            statusByProject={g.statusByProject}
            loadingProjects={g.loadingProjects}
            setSelectedProjectId={g.setSelectedProjectId}
            handleFetchProject={g.handleFetchProject}
            handlePullProject={g.handlePullProject}
            handleGitInit={g.handleGitInit}
          />
        ) : !g.status ? (
          <div className="git-center">
            <div className="git-empty">
              {g.loadingProjects.has(g.selectedProjectId!) ? g.t('common.loading') : (
                <div style={{ textAlign: 'center' }}>
                  <p>{g.t('git.notGitRepo')}</p>
                  <button className="git-action-btn" style={{ marginTop: 12, height: 32, padding: '0 20px', fontSize: 13 }} onClick={() => g.handleGitInit(g.selectedProject!)}>
                    {g.t('git.initGit')}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <GitCenterView
              status={g.status}
              selectedProject={g.selectedProject!}
              loadingProjects={g.loadingProjects}
              selectedProjectId={g.selectedProjectId}
              showBranchCompare={g.showBranchCompare}
              compareBranch1={g.compareBranch1}
              compareBranch2={g.compareBranch2}
              branchDiffResult={g.branchDiffResult}
              currentBranches={g.currentBranches}
              setShowBranchCompare={g.setShowBranchCompare}
              setCompareBranch1={g.setCompareBranch1}
              setCompareBranch2={g.setCompareBranch2}
              setBranchDiffResult={g.setBranchDiffResult}
              handleCompareBranches={g.handleCompareBranches}
              blameFile={g.blameFile}
              blameData={g.blameData}
              setBlameFile={g.setBlameFile}
              setBlameData={g.setBlameData}
              selectedFile={g.selectedFile}
              diffContent={g.diffContent}
              setSelectedFile={g.setSelectedFile}
              setDiffContent={g.setDiffContent}
              selectedCommit={g.selectedCommit}
              commitDetail={g.commitDetail}
              selectedCommitFile={g.selectedCommitFile}
              setSelectedCommit={g.setSelectedCommit}
              setCommitDetail={g.setCommitDetail}
              setSelectedCommitFile={g.setSelectedCommitFile}
              handleCherryPick={g.handleCherryPick}
              handleSelectCommit={g.handleSelectCommit}
              graphData={g.graphData}
              graphMaxLane={g.graphMaxLane}
              graphScrollRef={g.graphScrollRef}
              setCommitCtx={g.setCommitCtx}
              handleGitInit={g.handleGitInit}
              localeCode={g.localeCode}
            />

            <GitChangesPanel
              status={g.status}
              selectedFile={g.selectedFile}
              commitMessage={g.commitMessage}
              setCommitMessage={g.setCommitMessage}
              handleFileDiff={g.handleFileDiff}
              handleStageFile={g.handleStageFile}
              handleStageAll={g.handleStageAll}
              handleUnstageFile={g.handleUnstageFile}
              handleUnstageAll={g.handleUnstageAll}
              handleDiscardFile={g.handleDiscardFile}
              handleBlame={g.handleBlame}
              handleCommit={g.handleCommit}
            />
          </>
        )}
      </div>

      {!g.isAllProjectsView && g.status && (
        <div className="git-statusbar">
          <span>{g.t('git.filesChanged', { count: String(g.totalChanges) })}</span>
          <span>{g.t('git.stagedCount', { count: String(g.status.staged.length) })}</span>
          <span>{g.t('git.untrackedCount', { count: String(g.status.untracked.length) })}</span>
          <span>{g.t('git.commitCount', { count: String(g.currentLog.length) })}</span>
          <span>{g.t('git.tagCount', { count: String(g.currentTags.length) })}</span>
        </div>
      )}

      {g.branchCtx && (
        <ContextMenu
          x={g.branchCtx.x}
          y={g.branchCtx.y}
          items={getBranchContextItems(g.branchCtx.branch)}
          onClose={() => g.setBranchCtx(null)}
        />
      )}

      {g.commitCtx && (
        <ContextMenu
          x={g.commitCtx.x}
          y={g.commitCtx.y}
          items={getCommitContextItems(g.commitCtx.entry)}
          onClose={() => g.setCommitCtx(null)}
        />
      )}
    </div>
  )
}
