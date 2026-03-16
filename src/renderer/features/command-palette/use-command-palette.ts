import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
<<<<<<<< HEAD:src/renderer/features/command-palette/use-command-palette.ts
import { useViewStore, ViewMode } from '../../lib/stores/viewStore'
========
import { useViewStore, ViewMode } from '../stores/view-store'
>>>>>>>> kanban/r-57:src/renderer/shared/ui/command-palette.tsx
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useI18n } from '../../lib/i18n'

export interface CommandAction {
  id: string
  label: string
  category: string
  shortcut?: string
  action: () => void
}

function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) qi++
  }
  return qi === lowerQuery.length
}

export function useCommandPalette(open: boolean, onClose: () => void) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { setViewMode } = useViewStore()
  const { projects, workspaces, setActiveProject, setActiveWorkspace } = useWorkspaceStore()

  const actions = useMemo<CommandAction[]>(() => {
    const items: CommandAction[] = []

    // View switching
    const views: Array<{ mode: ViewMode; label: string; shortcut?: string }> = [
      { mode: 'terminal', label: t('command.showTerminal'), shortcut: '' },
      { mode: 'git', label: t('command.showGit'), shortcut: '' },
      { mode: 'kanban', label: t('command.showKanban'), shortcut: '' },
      { mode: 'npm', label: t('command.showNpm'), shortcut: '' },
      { mode: 'ai' as ViewMode, label: t('command.showAi'), shortcut: '' },
      { mode: 'settings', label: t('command.showSettings'), shortcut: '' },
      { mode: 'search', label: t('command.globalSearch'), shortcut: 'Cmd+Shift+F' },
      { mode: 'todos', label: t('command.showTodos'), shortcut: '' },
      { mode: 'stats', label: t('command.showStats'), shortcut: '' },
      { mode: 'shortcuts', label: t('command.showShortcuts'), shortcut: '' },
      { mode: 'notes', label: t('command.showNotes'), shortcut: '' },
    ]

    for (const v of views) {
      items.push({
        id: `view-${v.mode}`,
        label: v.label,
        category: 'Views',
        shortcut: v.shortcut,
        action: () => {
          setViewMode(v.mode)
          onClose()
        },
      })
    }

    // Git operations
    const gitOps = [
      { id: 'git-commit', label: 'Git: Commit' },
      { id: 'git-push', label: 'Git: Push' },
      { id: 'git-pull', label: 'Git: Pull' },
      { id: 'git-stash', label: 'Git: Stash' },
      { id: 'git-stash-pop', label: 'Git: Stash Pop' },
      { id: 'git-fetch', label: 'Git: Fetch' },
    ]

    for (const op of gitOps) {
      items.push({
        id: op.id,
        label: op.label,
        category: 'Git',
        action: () => {
          setViewMode('git')
          onClose()
        },
      })
    }

    // Terminal actions
    items.push({
      id: 'terminal-new',
      label: 'Terminal: New Tab',
      category: 'Terminal',
      shortcut: 'Cmd+T',
      action: () => {
        setViewMode('terminal')
        onClose()
      },
    })

    // Project switching
    for (const project of projects) {
      const workspace = workspaces.find((w) => w.id === project.workspaceId)
      items.push({
        id: `project-${project.id}`,
        label: `Switch to: ${project.name}`,
        category: workspace ? `Project (${workspace.name})` : 'Project',
        action: () => {
          setActiveWorkspace(project.workspaceId)
          setActiveProject(project.id)
          onClose()
        },
      })
    }

    return items
  }, [t, setViewMode, onClose, projects, workspaces, setActiveProject, setActiveWorkspace])

  const filtered = useMemo(() => {
    if (!query.trim()) return actions
    return actions.filter(
      (a) => fuzzyMatch(query, a.label) || fuzzyMatch(query, a.category),
    )
  }, [query, actions])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1 >= filtered.length ? 0 : i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 < 0 ? filtered.length - 1 : i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[selectedIndex]
        if (item) item.action()
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIndex, onClose],
  )

  return {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    inputRef,
    listRef,
    filtered,
    handleKeyDown,
  }
}
