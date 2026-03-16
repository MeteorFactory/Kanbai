import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTerminalTabStore, type PaneNode } from '../terminal'
import { useViewStore } from '../../lib/stores/viewStore'
import type { PromptTemplate } from '../../../shared/types/index'

function findClaudeSession(tree: PaneNode): string | null {
  if (tree.type === 'leaf') return tree.initialCommand === 'claude' ? tree.sessionId : null
  return findClaudeSession(tree.children[0]) || findClaudeSession(tree.children[1])
}

function findAnyTerminalSession(tree: PaneNode): string | null {
  if (tree.type === 'leaf') return tree.sessionId
  return findAnyTerminalSession(tree.children[0]) || findAnyTerminalSession(tree.children[1])
}

/**
 * Hook that provides prompt template state and CRUD operations.
 * Manages loading, filtering, selection, draft editing, and form state.
 */
export function usePrompts() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Draft content for the right panel
  const [draftContent, setDraftContent] = useState('')
  const [sent, setSent] = useState(false)

  // Create/Edit form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('General')

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.kanbai.prompts.list()
      setTemplates(result)
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Derive categories from templates
  const categories = useMemo(() => {
    const counts: Record<string, number> = {}
    templates.forEach((t) => {
      counts[t.category] = (counts[t.category] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }))
  }, [templates])

  // Filter templates
  const filteredTemplates = useMemo(() => {
    let result = templates
    if (activeCategory !== 'all') {
      result = result.filter((t) => t.category === activeCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q),
      )
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [templates, activeCategory, searchQuery])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  )

  // All categories for the form dropdown
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    templates.forEach((t) => cats.add(t.category))
    cats.add('General')
    cats.add('Development')
    cats.add('Quality')
    cats.add('Documentation')
    cats.add('DevOps')
    return Array.from(cats).sort()
  }, [templates])

  // Selection
  const handleSelect = useCallback((template: PromptTemplate) => {
    setSelectedId(template.id)
    setDraftContent(template.content)
    setSent(false)
    setShowForm(false)
  }, [])

  // Send draft content to the AI pane in the active terminal
  const handleSendToAi = useCallback(() => {
    const content = draftContent.trim()
    if (!content) return
    const { tabs, activeTabId } = useTerminalTabStore.getState()
    if (!activeTabId) return
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    const sessionId = findClaudeSession(tab.paneTree)
      || findAnyTerminalSession(tab.paneTree)
    if (sessionId) {
      window.kanbai.terminal.write(sessionId, content + '\r')
      useViewStore.getState().setViewMode('terminal')
      setSent(true)
      setTimeout(() => setSent(false), 2000)
    }
  }, [draftContent])

  const handleCopy = useCallback(() => {
    const content = draftContent.trim()
    if (content) navigator.clipboard.writeText(content)
  }, [draftContent])

  const handleCreateTicket = useCallback(() => {
    if (!selectedTemplate) return
    useViewStore.getState().setViewMode('kanban')
    window.dispatchEvent(new CustomEvent('kanban:prefill', {
      detail: { title: selectedTemplate.name, description: draftContent },
    }))
  }, [selectedTemplate, draftContent])

  // CRUD
  const handleStartCreate = useCallback(() => {
    setEditingId(null)
    setFormName('')
    setFormContent('')
    setFormCategory(activeCategory !== 'all' ? activeCategory : 'General')
    setShowForm(true)
    setSelectedId(null)
  }, [activeCategory])

  const handleStartEdit = useCallback(() => {
    if (!selectedTemplate) return
    setEditingId(selectedTemplate.id)
    setFormName(selectedTemplate.name)
    setFormContent(selectedTemplate.content)
    setFormCategory(selectedTemplate.category)
    setShowForm(true)
  }, [selectedTemplate])

  const handleSubmitForm = useCallback(async () => {
    const name = formName.trim()
    const content = formContent.trim()
    if (!name) return

    if (editingId) {
      const updated = await window.kanbai.prompts.update({
        id: editingId,
        name,
        content,
        category: formCategory,
      })
      if (updated) {
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)))
        setDraftContent(content)
      }
    } else {
      const created = await window.kanbai.prompts.create({ name, content, category: formCategory })
      if (created) {
        setTemplates((prev) => [...prev, created])
        setSelectedId(created.id)
        setDraftContent(content)
      }
    }
    setShowForm(false)
  }, [formName, formContent, formCategory, editingId])

  const handleDelete = useCallback(async () => {
    if (!selectedTemplate) return
    await window.kanbai.prompts.delete(selectedTemplate.id)
    setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplate.id))
    setSelectedId(null)
    setDraftContent('')
    setShowForm(false)
  }, [selectedTemplate])

  const handleCancelForm = useCallback(() => {
    setShowForm(false)
    setEditingId(null)
  }, [])

  return {
    // State
    templates,
    loading,
    selectedId,
    activeCategory,
    searchQuery,
    draftContent,
    sent,
    showForm,
    editingId,
    formName,
    formContent,
    formCategory,
    categories,
    filteredTemplates,
    selectedTemplate,
    allCategories,

    // Setters
    setActiveCategory,
    setSearchQuery,
    setDraftContent,
    setFormName,
    setFormContent,
    setFormCategory,

    // Actions
    handleSelect,
    handleSendToAi,
    handleCopy,
    handleCreateTicket,
    handleStartCreate,
    handleStartEdit,
    handleSubmitForm,
    handleDelete,
    handleCancelForm,
  }
}
