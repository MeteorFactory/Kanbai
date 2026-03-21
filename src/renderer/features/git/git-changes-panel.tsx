import type { GitStatus } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'

interface GitChangesPanelProps {
  status: GitStatus
  selectedFile: string | null
  commitMessage: string
  setCommitMessage: (v: string) => void
  handleFileDiff: (file: string, staged: boolean) => void
  handleStageFile: (file: string) => void
  handleStageAll: () => void
  handleUnstageFile: (file: string) => void
  handleUnstageAll: () => void
  handleDiscardFile: (file: string) => void
  handleBlame: (file: string) => void
  handleCommit: () => void
}

export function GitChangesPanel(props: GitChangesPanelProps) {
  const { t } = useI18n()
  const totalChanges = props.status.staged.length + props.status.modified.length + props.status.untracked.length

  if (totalChanges === 0) {
    return (
      <div className="git-right-panel">
        <div className="git-changes-clean">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M5 8l2 2 4-4" />
          </svg>
          {t('git.clean')}
        </div>
      </div>
    )
  }

  return (
    <div className="git-right-panel">
      <div className="git-right-files">
        {/* Staged */}
        {props.status.staged.length > 0 && (
          <div className="git-file-group">
            <div className="git-file-group-header">
              <span>{t('git.staged', { count: String(props.status.staged.length) })}</span>
              <button className="git-file-group-action" onClick={props.handleUnstageAll} title={t('git.unstageAll')}>Unstage all</button>
            </div>
            {props.status.staged.map((file) => (
              <div
                key={`s-${file}`}
                className={`git-file git-file--staged${props.selectedFile === file ? ' git-file--selected' : ''}`}
                onClick={() => props.handleFileDiff(file, true)}
              >
                <span className="git-file-badge git-file-badge--staged">S</span>
                <span className="git-file-name">{file}</span>
                <button className="git-file-action" onClick={(e) => { e.stopPropagation(); props.handleUnstageFile(file) }} title="Unstage">-</button>
              </div>
            ))}
          </div>
        )}
        {/* Modified */}
        {props.status.modified.length > 0 && (
          <div className="git-file-group">
            <div className="git-file-group-header">
              <span>{t('git.modified', { count: String(props.status.modified.length) })}</span>
              <button className="git-file-group-action" onClick={props.handleStageAll} title={t('git.stageAll')}>Stage all</button>
            </div>
            {props.status.modified.map((file) => (
              <div
                key={`m-${file}`}
                className={`git-file git-file--modified${props.selectedFile === file ? ' git-file--selected' : ''}`}
                onClick={() => props.handleFileDiff(file, false)}
              >
                <span className="git-file-badge git-file-badge--modified">M</span>
                <span className="git-file-name">{file}</span>
                <span className="git-file-actions">
                  <button className="git-file-action" onClick={(e) => { e.stopPropagation(); props.handleBlame(file) }} title="Blame">B</button>
                  <button className="git-file-action" onClick={(e) => { e.stopPropagation(); props.handleStageFile(file) }} title="Stage">+</button>
                  <button className="git-file-action git-file-action--danger" onClick={(e) => { e.stopPropagation(); props.handleDiscardFile(file) }} title="Discard">x</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Untracked */}
        {props.status.untracked.length > 0 && (
          <div className="git-file-group">
            <div className="git-file-group-header">
              <span>Untracked ({props.status.untracked.length})</span>
            </div>
            {props.status.untracked.map((file) => (
              <div
                key={`u-${file}`}
                className={`git-file git-file--untracked${props.selectedFile === file ? ' git-file--selected' : ''}`}
                onClick={() => props.handleFileDiff(file, false)}
              >
                <span className="git-file-badge git-file-badge--untracked">?</span>
                <span className="git-file-name">{file}</span>
                <button className="git-file-action" onClick={(e) => { e.stopPropagation(); props.handleStageFile(file) }} title="Stage">+</button>
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
          value={props.commitMessage}
          onChange={(e) => props.setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) props.handleCommit()
          }}
          rows={2}
        />
        <button
          className="git-commit-btn"
          onClick={props.handleCommit}
          disabled={!props.commitMessage.trim() || props.status.staged.length === 0}
          title={props.status.staged.length === 0 ? t('git.addFilesToStaging') : 'Cmd+Enter'}
        >
          {t('git.commit', { count: String(props.status.staged.length) })}
        </button>
      </div>
    </div>
  )
}
