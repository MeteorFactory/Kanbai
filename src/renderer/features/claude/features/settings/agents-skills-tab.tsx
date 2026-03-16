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

export function AgentsSkillsTab({ projectPath, onDeploySuccess }: Props) {
  const { t } = useI18n()
  const [enrichedAgents, setEnrichedAgents] = useState<EnrichedAgent[]>([])
  const [enrichedSkills, setEnrichedSkills] = useState<EnrichedAgent[]>([])
  const [editing, setEditing] = useState<{
    type: 'agent' | 'skill'
    agent: EnrichedAgent | null
    isDefault?: boolean
    defaultContent?: string
  } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // suppress unused var warning
  void onDeploySuccess

  const loadAll = useCallback(async () => {
    const [agentList, skillList] = await Promise.all([
      window.kanbai.claudeAgents.list(projectPath),
      window.kanbai.claudeSkills.list(projectPath),
    ])

    const enrichedA = await Promise.all(
      agentList.map(async (a: AgentFile) => {
        const content = await window.kanbai.claudeAgents.read(projectPath, a.filename)
        return parseAgentFrontmatter(a.filename, content ?? '')
      })
    )
    setEnrichedAgents(enrichedA)

    const enrichedS = await Promise.all(
      skillList.map(async (s: AgentFile) => {
        const content = await window.kanbai.claudeSkills.read(projectPath, s.filename)
        return parseAgentFrontmatter(s.filename, content ?? '')
      })
    )
    setEnrichedSkills(enrichedS)
  }, [projectPath])

  useEffect(() => { loadAll() }, [loadAll])

  const handleSave = useCallback(async (filename: string, content: string) => {
    if (!editing) return
    const api = editing.type === 'agent' ? window.kanbai.claudeAgents : window.kanbai.claudeSkills
    await api.write(projectPath, filename, content)
    if (editing.agent && editing.agent.filename && editing.agent.filename !== filename) {
      await api.delete(projectPath, editing.agent.filename)
    }
    setEditing(null)
    await loadAll()
  }, [editing, projectPath, loadAll])

  const handleDuplicate = useCallback(async (type: 'agent' | 'skill', agent: EnrichedAgent) => {
    const api = type === 'agent' ? window.kanbai.claudeAgents : window.kanbai.claudeSkills
    const content = await api.read(projectPath, agent.filename)
    const newFilename = agent.name + '-copy.md'
    await api.write(projectPath, newFilename, content ?? '')
    await loadAll()
  }, [projectPath, loadAll])

  const handleDelete = useCallback(async (type: 'agent' | 'skill', filename: string) => {
    const api = type === 'agent' ? window.kanbai.claudeAgents : window.kanbai.claudeSkills
    await api.delete(projectPath, filename)
    await loadAll()
  }, [projectPath, loadAll])

  const handleToggle = useCallback(async (type: 'agent' | 'skill', agent: EnrichedAgent) => {
    const api = type === 'agent' ? window.kanbai.claudeAgents : window.kanbai.claudeSkills
    const isDisabled = agent.disabled ?? false
    const newFilename = isDisabled
      ? agent.filename.replace(/\.md\.disabled$/, '.md')
      : agent.filename.replace(/\.md$/, '.md.disabled')
    await api.rename(projectPath, agent.filename, newFilename)
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
      {/* Default agents */}
      <DefaultAgentsSection
        projectPath={projectPath}
        onCustomize={handleCustomizeDefault}
        onRefresh={loadAll}
      />

      {/* Custom agents */}
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
              onDuplicate={() => handleDuplicate('agent', agent)}
              onDelete={() => handleDelete('agent', agent.filename)}
              onToggle={() => handleToggle('agent', agent)}
            />
          ))}
          <AddCard label={t('claude.addAgent')} onClick={() => setShowAddModal(true)} />
        </div>
      </div>

      {/* Skills */}
      <div className="cs-agents-section">
        <div className="claude-profile-section-header">
          <span className="claude-profile-section-title">{t('claude.skillsSection')}</span>
        </div>
        <div className="cs-agents-grid">
          {enrichedSkills.map((skill) => (
            <AgentCard
              key={skill.filename}
              agent={skill}
              type="skill"
              onEdit={() => setEditing({ type: 'skill', agent: skill })}
              onDuplicate={() => handleDuplicate('skill', skill)}
              onDelete={() => handleDelete('skill', skill.filename)}
              onToggle={() => handleToggle('skill', skill)}
            />
          ))}
          <AddCard label={t('claude.addSkill')} onClick={() => setEditing({ type: 'skill', agent: null })} />
        </div>
      </div>

      {/* Add agent modal */}
      {showAddModal && (
        <AddAgentModal
          onCreateBlank={handleCreateBlank}
          onCreateFromTemplate={handleCreateFromTemplate}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Editor modal */}
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
