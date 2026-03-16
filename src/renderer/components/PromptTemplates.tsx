import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTerminalTabStore, type PaneNode } from '../features/terminal'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import type { PromptTemplate } from '../../shared/types/index'

function findClaudeSession(tree: PaneNode): string | null {
  if (tree.type === 'leaf') return tree.initialCommand === 'claude' ? tree.sessionId : null
  return findClaudeSession(tree.children[0]) || findClaudeSession(tree.children[1])
}

function findAnyTerminalSession(tree: PaneNode): string | null {
  if (tree.type === 'leaf') return tree.sessionId
  return findAnyTerminalSession(tree.children[0]) || findAnyTerminalSession(tree.children[1])
}

const CATEGORY_ICONS: Record<string, string> = {
  Development: '\u2699',
  Quality: '\u2714',
  Documentation: '\u2709',
  DevOps: '\u26A1',
  General: '\u2605',
}

const CATEGORY_I18N_KEYS: Record<string, string> = {
  Development: 'prompts.catDevelopment',
  Quality: 'prompts.catQuality',
  Documentation: 'prompts.catDocumentation',
  DevOps: 'prompts.catDevOps',
  General: 'prompts.catGeneral',
}

export function PromptTemplates() {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Edit mode for the right panel content
  const [draftContent, setDraftContent] = useState('')
  const [sent, setSent] = useState(false)

  // Create/Edit form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('General')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // When selecting a template, load its content into the draft
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

  return (
    <div className="pt-layout">
      {/* Left panel: categories + template list */}
      <div className="pt-sidebar">
        <div className="pt-sidebar-header">
          <h3 className="pt-sidebar-title">{t('prompts.title')}</h3>
          <button className="pt-sidebar-add" onClick={handleStartCreate} title={t('prompts.newTemplate')}>+</button>
        </div>

        <div className="pt-search-wrap">
          <input
            className="pt-search"
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category pills */}
        <div className="pt-categories">
          <button
            className={`pt-cat-pill${activeCategory === 'all' ? ' pt-cat-pill--active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            {t('prompts.allCount', { count: String(templates.length) })}
          </button>
          {categories.map(({ name, count }) => (
            <button
              key={name}
              className={`pt-cat-pill${activeCategory === name ? ' pt-cat-pill--active' : ''}`}
              onClick={() => setActiveCategory(name)}
            >
              <span className="pt-cat-icon">{CATEGORY_ICONS[name] ?? '\u25CF'}</span>
              {CATEGORY_I18N_KEYS[name] ? t(CATEGORY_I18N_KEYS[name]!) : name} ({count})
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="pt-list">
          {loading ? (
            <div className="pt-empty">{t('common.loading')}</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="pt-empty">
              {searchQuery ? t('prompts.noResults') : t('prompts.noCategoryTemplates')}
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <button
                key={template.id}
                className={`pt-list-item${selectedId === template.id ? ' pt-list-item--active' : ''}`}
                onClick={() => handleSelect(template)}
              >
                <span className="pt-list-item-name">{template.name}</span>
                <span className="pt-list-item-cat">{CATEGORY_I18N_KEYS[template.category] ? t(CATEGORY_I18N_KEYS[template.category]!) : template.category}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: template preview/editor + actions */}
      <div className="pt-main">
        {showForm ? (
          /* Create / Edit form */
          <div className="pt-form">
            <div className="pt-form-header">
              <h3>{editingId ? t('prompts.editTemplate') : t('prompts.newTemplate')}</h3>
              <button className="pt-form-close" onClick={handleCancelForm}>&times;</button>
            </div>
            <div className="pt-form-body">
              <label className="pt-form-label">{t('prompts.name')}</label>
              <input
                className="pt-form-input"
                type="text"
                placeholder={t('prompts.namePlaceholder')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
              <label className="pt-form-label">{t('prompts.category')}</label>
              <select
                className="pt-form-select"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              >
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_I18N_KEYS[cat] ? t(CATEGORY_I18N_KEYS[cat]!) : cat}</option>
                ))}
              </select>
              <label className="pt-form-label">{t('prompts.promptContent')}</label>
              <textarea
                className="pt-form-textarea"
                placeholder={t('prompts.promptPlaceholder')}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={12}
              />
            </div>
            <div className="pt-form-footer">
              <button className="pt-btn pt-btn--secondary" onClick={handleCancelForm}>{t('common.cancel')}</button>
              <button className="pt-btn pt-btn--primary" onClick={handleSubmitForm} disabled={!formName.trim()}>
                {editingId ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        ) : selectedTemplate ? (
          /* Template selected — editable content + actions */
          <div className="pt-preview">
            <div className="pt-preview-header">
              <div className="pt-preview-title-row">
                <h3 className="pt-preview-title">{selectedTemplate.name}</h3>
                <span className="pt-preview-cat">{CATEGORY_I18N_KEYS[selectedTemplate.category] ? t(CATEGORY_I18N_KEYS[selectedTemplate.category]!) : selectedTemplate.category}</span>
              </div>
              <p className="pt-preview-hint">
                {t('prompts.customizeContent')}
              </p>
            </div>

            <div className="pt-preview-editor">
              <textarea
                ref={textareaRef}
                className="pt-preview-textarea"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder={t('prompts.contentPlaceholder')}
              />
            </div>

            <div className="pt-preview-actions">
              <div className="pt-preview-actions-primary">
                <button className="pt-btn pt-btn--ai" onClick={handleSendToAi}>
                  {sent ? '\u2713 ' + t('common.sent') : '\u25B6 ' + t('prompts.sendToAi')}
                </button>
                <button className="pt-btn pt-btn--ticket" onClick={handleCreateTicket}>
                  {t('prompts.createTicket')}
                </button>
                <button className="pt-btn pt-btn--ghost" onClick={handleCopy}>
                  {t('common.copy')}
                </button>
              </div>
              <div className="pt-preview-actions-secondary">
                <button className="pt-btn pt-btn--ghost" onClick={handleStartEdit}>
                  {t('common.edit')}
                </button>
                <button className="pt-btn pt-btn--ghost pt-btn--danger-text" onClick={handleDelete}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* No template selected — empty state */
          <div className="pt-empty-state">
            <div className="pt-empty-state-icon">{'\u2709'}</div>
            <h3 className="pt-empty-state-title">{t('prompts.emptyTitle')}</h3>
            <p className="pt-empty-state-desc">
              {t('prompts.emptyDesc1')}<br />
              {t('prompts.emptyDesc2')}
            </p>
            <button className="pt-btn pt-btn--primary" onClick={handleStartCreate}>
              {t('prompts.createFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
