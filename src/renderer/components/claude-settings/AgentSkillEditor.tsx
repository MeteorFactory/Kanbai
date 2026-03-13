import { useState, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { useI18n } from '../../lib/i18n'
import type { EnrichedAgent } from './parseAgentFrontmatter'
import { buildAgentContent } from './parseAgentFrontmatter'

const ALL_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit']

interface Props {
  type: 'agent' | 'skill'
  initial: EnrichedAgent | null // null = new
  onSave: (filename: string, content: string) => Promise<void>
  onCancel: () => void
}

export function AgentSkillEditor({ type, initial, onSave, onCancel }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tools, setTools] = useState<string[]>(initial?.tools ?? (type === 'agent' ? ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'] : []))
  const [model, setModel] = useState(initial?.model ?? '')
  const [body, setBody] = useState(initial?.content ?? (type === 'agent'
    ? 'You are a specialized agent.\n\nYour responsibilities:\n1. ...\n'
    : '# Skill Name\n\nInstructions for this skill.\n'))
  const [userInvocable, setUserInvocable] = useState(initial?.userInvocable ?? true)
  const [disableModelInvocation, setDisableModelInvocation] = useState(initial?.disableModelInvocation ?? false)
  const [context, setContext] = useState(initial?.context ?? '')
  const storeOrigin = initial?.storeOrigin

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setDescription(initial.description)
      setTools(initial.tools)
      setModel(initial.model ?? '')
      setBody(initial.content)
      setUserInvocable(initial.userInvocable ?? true)
      setDisableModelInvocation(initial.disableModelInvocation ?? false)
      setContext(initial.context ?? '')
    }
  }, [initial])

  const toggleTool = useCallback((tool: string) => {
    setTools((prev) => prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool])
  }, [])

  const handleSave = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const filename = trimmed.endsWith('.md') ? trimmed : trimmed + '.md'
    const content = buildAgentContent({
      description: description || undefined,
      tools: tools.length > 0 ? tools : undefined,
      model: model || undefined,
      content: body,
      ...(type === 'skill' ? {
        userInvocable,
        disableModelInvocation: disableModelInvocation || undefined,
        context: context || undefined,
        storeOrigin,
      } : {}),
    })
    await onSave(filename, content)
  }, [name, description, tools, model, body, type, userInvocable, disableModelInvocation, context, onSave])

  return (
    <div className="cs-agent-editor">
      <div className="cs-agent-editor-header">
        <span className="cs-agent-editor-title">
          {initial ? t('claude.editItem', { type: t(`claude.${type}`) }) : t('claude.newItem', { type: t(`claude.${type}`) })}
        </span>
        <button className="claude-profile-editor-close" onClick={onCancel}>&times;</button>
      </div>

      <div className="cs-agent-editor-body">
        <div className="cs-agent-editor-field">
          <label className="claude-rules-label">{t('claude.fileName')}</label>
          <div className="cs-agent-editor-name-row">
            <input
              className="claude-profile-editor-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'agent' ? 'architect' : 'review-code'}
            />
            <span className="claude-profile-editor-hint">.md</span>
          </div>
        </div>

        {storeOrigin && (
          <div className="cs-agent-editor-field">
            <label className="claude-rules-label">{t('claude.skillOrigin')}</label>
            <div className="cs-store-origin-row">
              <button
                className="cs-store-card-author-link"
                onClick={() => window.kanbai.shell.openExternal(storeOrigin)}
                title={storeOrigin}
              >
                {storeOrigin}
              </button>
            </div>
          </div>
        )}

        <div className="cs-agent-editor-field">
          <label className="claude-rules-label">{t('claude.agentDescription')}</label>
          <textarea
            className="claude-profile-editor-input cs-agent-editor-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('claude.agentDescPlaceholder')}
            rows={3}
          />
        </div>

        <div className="cs-agent-editor-field">
          <label className="claude-rules-label">{t('claude.agentTools')}</label>
          <div className="cs-model-chips">
            {ALL_TOOLS.map((tool) => (
              <button
                key={tool}
                className={`cs-model-chip${tools.includes(tool) ? ' cs-model-chip--active' : ''}`}
                onClick={() => toggleTool(tool)}
              >
                {tool}
              </button>
            ))}
          </div>
        </div>

        <div className="cs-agent-editor-field">
          <label className="claude-rules-label">{t('claude.agentModel')}</label>
          <select className="cs-select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">Default</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
            <option value="opusplan">Opus Plan</option>
            <option value="sonnet[1m]">Sonnet Extended 1M</option>
          </select>
        </div>

        {type === 'skill' && (
          <>
            <div className="cs-agent-editor-field">
              <div className="cs-toggle-row">
                <div>
                  <span>{t('claude.userInvocable')}</span>
                  <div className="cs-toggle-desc">{t('claude.userInvocableDesc')}</div>
                </div>
                <button className={`cs-switch${userInvocable ? ' cs-switch--on' : ''}`} onClick={() => setUserInvocable(!userInvocable)}>
                  <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
                </button>
              </div>
            </div>
            <div className="cs-agent-editor-field">
              <div className="cs-toggle-row">
                <div>
                  <span>{t('claude.disableModelInvocation')}</span>
                  <div className="cs-toggle-desc">{t('claude.disableModelInvocationDesc')}</div>
                </div>
                <button className={`cs-switch${disableModelInvocation ? ' cs-switch--on' : ''}`} onClick={() => setDisableModelInvocation(!disableModelInvocation)}>
                  <span className="cs-switch-track"><span className="cs-switch-thumb" /></span>
                </button>
              </div>
            </div>
            <div className="cs-agent-editor-field">
              <label className="claude-rules-label">{t('claude.contextMode')}</label>
              <select className="cs-select" value={context} onChange={(e) => setContext(e.target.value)}>
                <option value="">{t('claude.contextShared')}</option>
                <option value="fork">{t('claude.contextFork')}</option>
              </select>
            </div>
          </>
        )}

        <div className="cs-agent-editor-field cs-agent-editor-field--grow">
          <label className="claude-rules-label">{t('claude.content')}</label>
          <div className="cs-agent-editor-monaco">
            <Editor
              value={body}
              language="markdown"
              theme="catppuccin-mocha"
              onChange={(val) => setBody(val ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'Menlo',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
                wordWrap: 'on',
              }}
            />
          </div>
        </div>
      </div>

      <div className="claude-profile-editor-actions">
        <button className="modal-btn modal-btn--secondary" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="modal-btn modal-btn--primary" onClick={handleSave} disabled={!name.trim()}>{t('common.save')}</button>
      </div>
    </div>
  )
}
