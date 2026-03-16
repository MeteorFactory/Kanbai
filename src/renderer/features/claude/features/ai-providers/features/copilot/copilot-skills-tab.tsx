import { useState, useCallback, useEffect } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AgentCard } from '../../../../../../components/claude-settings/AgentCard'
import { AddCard } from '../../../../../../components/claude-settings/AddCard'
import { AgentSkillEditorModal } from '../../../../../../components/claude-settings/AgentSkillEditorModal'
import { parseAgentFrontmatter, type EnrichedAgent } from '../../../../../../components/claude-settings/parseAgentFrontmatter'

interface SkillEntry {
  name: string
  dirname: string
}

interface Props {
  projectPath: string
}

export function CopilotSkillsTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [enrichedSkills, setEnrichedSkills] = useState<EnrichedAgent[]>([])
  const [editing, setEditing] = useState<{
    skill: EnrichedAgent | null
  } | null>(null)

  const loadAll = useCallback(async () => {
    const skillList: SkillEntry[] = await window.kanbai.copilotSkills.list(projectPath)
    const enriched = await Promise.all(
      skillList.map(async (s) => {
        const content = await window.kanbai.copilotSkills.read(projectPath, s.dirname)
        const parsed = parseAgentFrontmatter(`${s.dirname}/SKILL.md`, content ?? '')
        return { ...parsed, name: s.dirname }
      }),
    )
    setEnrichedSkills(enriched)
  }, [projectPath])

  useEffect(() => { loadAll() }, [loadAll])

  const handleSave = useCallback(async (filename: string, content: string) => {
    if (!editing) return
    const dirname = filename.replace(/\/SKILL\.md$/, '').replace(/\.md$/, '')
    await window.kanbai.copilotSkills.write(projectPath, dirname, content)
    if (editing.skill && editing.skill.name && editing.skill.name !== dirname) {
      await window.kanbai.copilotSkills.delete(projectPath, editing.skill.name)
    }
    setEditing(null)
    await loadAll()
  }, [editing, projectPath, loadAll])

  const handleDuplicate = useCallback(async (skill: EnrichedAgent) => {
    const content = await window.kanbai.copilotSkills.read(projectPath, skill.name)
    const newDirname = `${skill.name}-copy`
    await window.kanbai.copilotSkills.write(projectPath, newDirname, content ?? '')
    await loadAll()
  }, [projectPath, loadAll])

  const handleDelete = useCallback(async (dirname: string) => {
    await window.kanbai.copilotSkills.delete(projectPath, dirname)
    await loadAll()
  }, [projectPath, loadAll])

  return (
    <div className="cs-agents-skills">
      <div className="cs-agents-section">
        <div className="claude-profile-section-header">
          <span className="claude-profile-section-title">{t('copilot.skillsTitle')}</span>
        </div>
        <div className="cs-toggle-desc" style={{ marginBottom: 12 }}>
          {t('copilot.skillsDesc')}
        </div>
        <div className="cs-agents-grid">
          {enrichedSkills.map((skill) => (
            <AgentCard
              key={skill.name}
              agent={skill}
              type="skill"
              onEdit={() => setEditing({ skill })}
              onDuplicate={() => handleDuplicate(skill)}
              onDelete={() => handleDelete(skill.name)}
            />
          ))}
          <AddCard
            label={t('copilot.addSkill')}
            onClick={() => setEditing({ skill: null })}
          />
        </div>
        {enrichedSkills.length === 0 && (
          <div className="cs-toggle-desc" style={{ marginTop: 8 }}>
            {t('copilot.noSkills')}
          </div>
        )}
      </div>

      {editing && (
        <AgentSkillEditorModal
          type="skill"
          initial={editing.skill}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
