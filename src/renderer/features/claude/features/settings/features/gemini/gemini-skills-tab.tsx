import { useState, useCallback, useEffect } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AgentCard } from '../../components/agent-card'
import { AddCard } from '../../components/add-card'
import { AgentSkillEditorModal } from '../../components/agent-skill-editor-modal'
import { parseAgentFrontmatter, type EnrichedAgent } from '../../components/parse-agent-frontmatter'

interface SkillEntry {
  name: string
  dirname: string
}

interface Props {
  projectPath: string
}

export function GeminiSkillsTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [enrichedSkills, setEnrichedSkills] = useState<EnrichedAgent[]>([])
  const [editing, setEditing] = useState<{
    skill: EnrichedAgent | null
  } | null>(null)

  const loadAll = useCallback(async () => {
    const skillList: SkillEntry[] = await window.kanbai.geminiSkills.list(projectPath)
    const enriched = await Promise.all(
      skillList.map(async (s) => {
        const content = await window.kanbai.geminiSkills.read(projectPath, s.dirname)
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
    await window.kanbai.geminiSkills.write(projectPath, dirname, content)
    if (editing.skill && editing.skill.name && editing.skill.name !== dirname) {
      await window.kanbai.geminiSkills.delete(projectPath, editing.skill.name)
    }
    setEditing(null)
    await loadAll()
  }, [editing, projectPath, loadAll])

  const handleDuplicate = useCallback(async (skill: EnrichedAgent) => {
    const content = await window.kanbai.geminiSkills.read(projectPath, skill.name)
    const newDirname = `${skill.name}-copy`
    await window.kanbai.geminiSkills.write(projectPath, newDirname, content ?? '')
    await loadAll()
  }, [projectPath, loadAll])

  const handleDelete = useCallback(async (dirname: string) => {
    await window.kanbai.geminiSkills.delete(projectPath, dirname)
    await loadAll()
  }, [projectPath, loadAll])

  return (
    <div className="cs-agents-skills">
      <div className="cs-agents-section">
        <div className="claude-profile-section-header">
          <span className="claude-profile-section-title">{t('gemini.skillsTitle')}</span>
        </div>
        <div className="cs-toggle-desc" style={{ marginBottom: 12 }}>
          {t('gemini.skillsDesc')}
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
            label={t('gemini.addSkill')}
            onClick={() => setEditing({ skill: null })}
          />
        </div>
        {enrichedSkills.length === 0 && (
          <div className="cs-toggle-desc" style={{ marginTop: 8 }}>
            {t('gemini.noSkills')}
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
