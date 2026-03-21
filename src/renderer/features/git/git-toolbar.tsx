import type { GitStatus, Project } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'

interface GitToolbarProps {
  isAllProjectsView: boolean
  status: GitStatus | null
  selectedProject: Project | null
  showBranchCompare: boolean
  // Handlers
  refreshAll: () => void
  refreshSelected: () => void
  handleUndo: () => void
  handlePull: () => void
  handlePush: () => void
  handleFetch: () => void
  handleStash: () => void
  handleStashPop: () => void
  handleSwitchToTerminal: () => void
  setShowNewBranch: (v: boolean) => void
  setShowBranchCompare: (v: boolean) => void
  setBlameFile: (v: string | null) => void
  setBlameData: (v: never[]) => void
}

export function GitToolbar(props: GitToolbarProps) {
  const { t } = useI18n()

  return (
    <div className="git-header">
      <div className="git-branch-info">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="git-icon">
          <path d="M15.698 7.287L8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.548 1.56l1.773 1.774a1.224 1.224 0 1 1-.733.68L8.535 5.908v4.27a1.224 1.224 0 1 1-1.008-.036V5.822a1.224 1.224 0 0 1-.664-1.605L5.04 2.394.302 7.13a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.03 1.03 0 0 0 0-1.457" />
        </svg>
        {props.isAllProjectsView ? (
          <span className="git-branch-name">{t('git.allProjects')}</span>
        ) : props.status ? (
          <>
            <span className="git-branch-name">{props.status.branch}</span>
            {(props.status.ahead > 0 || props.status.behind > 0) && (
              <span className="git-sync-status">
                {props.status.ahead > 0 && <span className="git-ahead">{props.status.ahead}</span>}
                {props.status.behind > 0 && <span className="git-behind">{props.status.behind}</span>}
              </span>
            )}
          </>
        ) : (
          <span className="git-branch-name">{props.selectedProject?.name ?? ''}</span>
        )}
      </div>

      {props.isAllProjectsView ? (
        <div className="git-toolbar">
          <button className="git-toolbar-btn" onClick={props.refreshAll} title={t('common.refresh')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            </svg>
            <span>{t('common.refresh')}</span>
          </button>
        </div>
      ) : (
        <div className="git-toolbar">
          {/* Undo */}
          <button className="git-toolbar-btn" onClick={props.handleUndo} title={t('git.undoCommit')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
            </svg>
            <span>{t('git.undo')}</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Pull */}
          <button className="git-toolbar-btn" onClick={props.handlePull} title="Pull">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
            </svg>
            <span>Pull</span>
          </button>

          {/* Push */}
          <button className="git-toolbar-btn" onClick={props.handlePush} title="Push">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
            </svg>
            <span>Push</span>
          </button>

          {/* Fetch */}
          <button className="git-toolbar-btn" onClick={props.handleFetch} title="Fetch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span>Fetch</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Branch */}
          <button className="git-toolbar-btn" onClick={() => props.setShowNewBranch(true)} title={t('git.newBranch')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span>{t('git.branch')}</span>
          </button>

          {/* Stash */}
          <button className="git-toolbar-btn" onClick={props.handleStash} title="Stash">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M4 12h16" />
            </svg>
            <span>Stash</span>
          </button>

          {/* Pop */}
          <button className="git-toolbar-btn" onClick={props.handleStashPop} title="Pop stash">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M12 8v8" /><path d="M8 12l4-4 4 4" />
            </svg>
            <span>Pop</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Compare */}
          <button
            className={`git-toolbar-btn${props.showBranchCompare ? ' git-toolbar-btn--active' : ''}`}
            onClick={() => { props.setShowBranchCompare(!props.showBranchCompare); props.setBlameFile(null); props.setBlameData([]) }}
            title={t('common.compare')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>{t('common.compare')}</span>
          </button>

          {/* Terminal */}
          <button className="git-toolbar-btn" onClick={props.handleSwitchToTerminal} title={t('git.terminal')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span>{t('git.terminal')}</span>
          </button>

          <div className="git-toolbar-sep" />

          {/* Refresh */}
          <button className="git-toolbar-btn" onClick={props.refreshSelected} title={t('common.refresh')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            </svg>
            <span />
          </button>
        </div>
      )}
    </div>
  )
}
