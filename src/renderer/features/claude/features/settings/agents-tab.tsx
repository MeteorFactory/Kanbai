import { useState, useCallback, useEffect } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { AgentCard } from './components/agent-card'
import { AddCard } from './components/add-card'
import { AddAgentModal } from './components/add-agent-modal'
import { AgentSkillEditorModal } from './components/agent-skill-editor-modal'
import { DefaultAgentsSection } from './components/default-agents-section'
import { parseAgentFrontmatter, type EnrichedAgent } from './components/parse-agent-frontmatter'

interface AgentFile {
  name: string
  filename: string
}

interface DefaultProfile {
  id: string
  name: string
  description: string
  category: string
  content: string
  filename: string
}

interface Props {
  projectPath: string
  onDeploySuccess: () => void
}

export function AgentsTab({ projectPath, onDeploySuccess }: Props) {
  const { t } = useI18n()
  const [enrichedAgents, setEnrichedAgents] = useState<EnrichedAgent[]>([])
  const [editing, setEditing] = useState<{
    type: 'agent'
    agent: EnrichedAgent | null
    isDefault?: boolean
    defaultContent?: string
  } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  void onDeploySuccess

  const loadAll = useCallback(async () => {
    const agentList = await window.kanbai.claudeAgents.list(projectPath)
    const enrichedA = await Promise.all(
      agentList.map(async (a: AgentFile) => {
        const content = await window.kanbai.claudeAgents.read(projectPath, a.filename)
        return parseAgentFrontmatter(a.filename, content ?? '')
      })
    )
    setEnrichedAgents(enrichedA)
  }, [projectPath])

  useEffect(() => { loadAll() }, [loadAll])

  const handleSave = useCallback(async (filename: string, content: string) => {
    if (!editing) return
    await window.kanbai.claudeAgents.write(projectPath, filename, content)
    if (editing.agent && editing.agent.filename && editing.agent.filename !== filename) {
      await window.kanbai.claudeAgents.delete(projectPath, editing.agent.filename)
    }
    setEditing(null)
    await loadAll()
  }, [editing, projectPath, loadAll])

  const handleDuplicate = useCallback(async (agent: EnrichedAgent) => {
    const content = await window.kanbai.claudeAgents.read(projectPath, agent.filename)
    const newFilename = agent.name + '-copy.md'
    await window.kanbai.claudeAgents.write(projectPath, newFilename, content ?? '')
    await loadAll()
  }, [projectPath, loadAll])

  const handleDelete = useCallback(async (filename: string) => {
    await window.kanbai.claudeAgents.delete(projectPath, filename)
    await loadAll()
  }, [projectPath, loadAll])

  const handleToggle = useCallback(async (agent: EnrichedAgent) => {
    const isDisabled = agent.disabled ?? false
    const newFilename = isDisabled
      ? agent.filename.replace(/\.md\.disabled$/, '.md')
      : agent.filename.replace(/\.md$/, '.md.disabled')
    await window.kanbai.claudeAgents.rename(projectPath, agent.filename, newFilename)
    await loadAll()
  }, [projectPath, loadAll])

  const handleCreateFromTemplate = useCallback((profile: DefaultProfile) => {
    const parsed = parseAgentFrontmatter(profile.filename, profile.content)
    setShowAddModal(false)
    setEditing({ type: 'agent', agent: { ...parsed, filename: '' } })
  }, [])

  const handleCreateBlank = useCallback(() => {
    setShowAddModal(false)
    setEditing({ type: 'agent', agent: null })
  }, [])

  const handleCustomizeDefault = useCallback(async (profile: DefaultProfile, isDeployed: boolean) => {
    let initial: EnrichedAgent | null = null
    if (isDeployed) {
      const content = await window.kanbai.claudeAgents.read(projectPath, profile.filename)
      if (content) initial = parseAgentFrontmatter(profile.filename, content)
    }
    if (!initial) {
      initial = parseAgentFrontmatter(profile.filename, profile.content)
    }
    setEditing({
      type: 'agent',
      agent: initial,
      isDefault: true,
      defaultContent: profile.content,
    })
  }, [projectPath])

  const handleRestoreDefault = useCallback(async () => {
    if (!editing?.defaultContent || !editing.agent) return
    await window.kanbai.claudeAgents.write(projectPath, editing.agent.filename, editing.defaultContent)
    setEditing(null)
    await loadAll()
  }, [editing, projectPath, loadAll])

  return (
    <div className="cs-agents-skills">
      <DefaultAgentsSection
        projectPath={projectPath}
        onCustomize={handleCustomizeDefault}
        onRefresh={loadAll}
      />

      <div className="cs-agents-section">
        <div className="claude-profile-section-header">
          <span className="claude-profile-section-title">{t('claude.agentsSection')}</span>
        </div>
        <div className="cs-agents-grid">
          {enrichedAgents.map((agent) => (
            <AgentCard
              key={agent.filename}
              agent={agent}
              type="agent"
              onEdit={() => setEditing({ type: 'agent', agent })}
              onDuplicate={() => handleDuplicate(agent)}
              onDelete={() => handleDelete(agent.filename)}
              onToggle={() => handleToggle(agent)}
            />
          ))}
          <AddCard label={t('claude.addAgent')} onClick={() => setShowAddModal(true)} />
        </div>
      </div>

      {showAddModal && (
        <AddAgentModal
          onCreateBlank={handleCreateBlank}
          onCreateFromTemplate={handleCreateFromTemplate}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editing && (
        <AgentSkillEditorModal
          type={editing.type}
          initial={editing.agent}
          isDefault={editing.isDefault}
          defaultContent={editing.defaultContent}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onRestore={editing.isDefault ? handleRestoreDefault : undefined}
        />
      )}
    </div>
  )
}
