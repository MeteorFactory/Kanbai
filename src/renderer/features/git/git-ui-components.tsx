import React from 'react'
import { useI18n } from '../../lib/i18n'

export function RefBadge({ refName }: { refName: string }) {
  const isHead = refName === 'HEAD' || refName.startsWith('HEAD')
  const isRemote = refName.startsWith('origin/')
  const isTag = refName.startsWith('tag:')
  const isMain = refName === 'main' || refName === 'master'
  const isWorktree = refName.startsWith('worktree/') || refName.startsWith('worktree-')
  const isFix = refName.startsWith('fix/')
  let className = 'git-ref-badge'
  if (isHead) className += ' git-ref-badge--head'
  else if (isTag) className += ' git-ref-badge--tag'
  else if (isMain) className += ' git-ref-badge--main'
  else if (isWorktree) className += ' git-ref-badge--worktree'
  else if (isFix) className += ' git-ref-badge--fix'
  else if (isRemote) className += ' git-ref-badge--remote'
  else className += ' git-ref-badge--branch'
  return <span className={className}>{refName}</span>
}

export function DiffViewer({ diff }: { diff: string }) {
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

export function relativeDate(dateStr: string): string {
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

export function extractFileDiff(fullDiff: string, fileName: string): string {
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

export function fileStatusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case 'A': return { label: 'A', className: 'git-fstatus--added' }
    case 'M': return { label: 'M', className: 'git-fstatus--modified' }
    case 'D': return { label: 'D', className: 'git-fstatus--deleted' }
    case 'R': return { label: 'R', className: 'git-fstatus--renamed' }
    case 'C': return { label: 'C', className: 'git-fstatus--copied' }
    default: return { label: '?', className: 'git-fstatus--untracked' }
  }
}

export function BranchSection({
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
