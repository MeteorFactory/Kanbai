import { useState, useCallback, useEffect, useMemo } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { AgentCard } from './components/agent-card'
import { AddCard } from './components/add-card'
import { AgentSkillEditorModal } from './components/agent-skill-editor-modal'
import { SkillsStoreSection } from './components/skills-store-section'
import { parseAgentFrontmatter, type EnrichedAgent } from './components/parse-agent-frontmatter'

interface AgentFile {
  name: string
  filename: string
}

interface Props {
  projectPath: string
}

export function SkillsTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [enrichedSkills, setEnrichedSkills] = useState<EnrichedAgent[]>([])
  const [editing, setEditing] = useState<{
    type: 'skill'
    agent: EnrichedAgent | null
  } | null>(null)

  const loadAll = useCallback(async () => {
    const skillList = await window.kanbai.claudeSkills.list(projectPath)
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
    await window.kanbai.claudeSkills.write(projectPath, filename, content)
    if (editing.agent && editing.agent.filename && editing.agent.filename !== filename) {
      await window.kanbai.claudeSkills.delete(projectPath, editing.agent.filename)
    }
    setEditing(null)
    await loadAll()
  }, [editing, projectPath, loadAll])

  const handleDuplicate = useCallback(async (skill: EnrichedAgent) => {
    const content = await window.kanbai.claudeSkills.read(projectPath, skill.filename)
    const newFilename = skill.name + '-copy.md'
    await window.kanbai.claudeSkills.write(projectPath, newFilename, content ?? '')
    await loadAll()
  }, [projectPath, loadAll])

  const handleDelete = useCallback(async (filename: string) => {
    await window.kanbai.claudeSkills.delete(projectPath, filename)
    await loadAll()
  }, [projectPath, loadAll])

  const handleToggle = useCallback(async (skill: EnrichedAgent) => {
    const isDisabled = skill.disabled ?? false
    const newFilename = isDisabled
      ? skill.filename.replace(/\.md\.disabled$/, '.md')
      : skill.filename.replace(/\.md$/, '.md.disabled')
    await window.kanbai.claudeSkills.rename(projectPath, skill.filename, newFilename)
    await loadAll()
  }, [projectPath, loadAll])

  const installedSkillNames = useMemo(
    () => new Set(enrichedSkills.map((s) => s.name)),
    [enrichedSkills],
  )

  return (
    <div className="cs-agents-skills">
      {/* Local project skills */}
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
              onDuplicate={() => handleDuplicate(skill)}
              onDelete={() => handleDelete(skill.filename)}
              onToggle={() => handleToggle(skill)}
            />
          ))}
          <AddCard label={t('claude.addSkill')} onClick={() => setEditing({ type: 'skill', agent: null })} />
        </div>
      </div>

      {/* Skills Store */}
      <SkillsStoreSection
        projectPath={projectPath}
        installedSkillNames={installedSkillNames}
        onInstalled={loadAll}
      />

      {/* Editor modal */}
      {editing && (
        <AgentSkillEditorModal
          type={editing.type}
          initial={editing.agent}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
