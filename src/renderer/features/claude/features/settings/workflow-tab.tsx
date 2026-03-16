import { useState, useCallback } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { useWorkspaceStore } from '../../../../lib/stores/workspaceStore'
import { DEFAULT_WORKFLOWS, WORKFLOW_MARKER, generateWorkflowMarkdown } from '../../../../../shared/constants/defaultWorkflows'

interface Props {
  projectPath: string
  claudeMd: string
  workflowDeployed: boolean
  onClaudeMdChange: (md: string) => void
  onWorkflowDeployedChange: (deployed: boolean) => void
}

export function WorkflowTab({ projectPath, claudeMd: _claudeMd, workflowDeployed, onClaudeMdChange, onWorkflowDeployedChange }: Props) {
  const { t, locale } = useI18n()
  const { projects, workspaces, activeProjectId } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const activeWorkspace = workspaces.find((w) => w.id === activeProject?.workspaceId)
  const [deploying, setDeploying] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const workflow = DEFAULT_WORKFLOWS[locale] ?? DEFAULT_WORKFLOWS.fr

  const claudeProjects = projects.filter((p) => p.workspaceId === activeWorkspace?.id && p.hasClaude)

  const handleDeploy = useCallback(async () => {
    setDeploying(true)
    try {
      const result = await window.kanbai.project.scanClaude(projectPath)
      const currentMd = result.claudeMd ?? ''
      if (!currentMd.includes(WORKFLOW_MARKER)) {
        const wf = DEFAULT_WORKFLOWS[locale] ?? DEFAULT_WORKFLOWS.fr
        const workflowMd = generateWorkflowMarkdown(wf)
        const newMd = currentMd.trim() ? currentMd.trim() + '\n\n' + workflowMd : workflowMd
        await window.kanbai.project.writeClaudeMd(projectPath, newMd)
        onClaudeMdChange(newMd)
        onWorkflowDeployedChange(true)
      }
    } catch { /* ignore */ }
    setDeploying(false)
  }, [projectPath, locale, onClaudeMdChange, onWorkflowDeployedChange])

  const handleRemove = useCallback(async () => {
    setDeploying(true)
    try {
      const result = await window.kanbai.project.scanClaude(projectPath)
      const currentMd = result.claudeMd ?? ''
      if (currentMd.includes(WORKFLOW_MARKER)) {
        const markerIdx = currentMd.indexOf(WORKFLOW_MARKER)
        const newMd = currentMd.slice(0, markerIdx).trimEnd()
        await window.kanbai.project.writeClaudeMd(projectPath, newMd)
        onClaudeMdChange(newMd)
        onWorkflowDeployedChange(false)
      }
    } catch { /* ignore */ }
    setDeploying(false)
  }, [projectPath, onClaudeMdChange, onWorkflowDeployedChange])

  const handleDeployAll = useCallback(async () => {
    setDeploying(true)
    const wf = DEFAULT_WORKFLOWS[locale] ?? DEFAULT_WORKFLOWS.fr
    const workflowMd = generateWorkflowMarkdown(wf)
    for (const proj of claudeProjects) {
      try {
        const result = await window.kanbai.project.scanClaude(proj.path)
        const currentMd = result.claudeMd ?? ''
        if (!currentMd.includes(WORKFLOW_MARKER)) {
          const newMd = currentMd.trim() ? currentMd.trim() + '\n\n' + workflowMd : workflowMd
          await window.kanbai.project.writeClaudeMd(proj.path, newMd)
        }
      } catch { /* continue */ }
    }
    // Refresh current project state
    const result = await window.kanbai.project.scanClaude(projectPath)
    const md = result.claudeMd ?? ''
    onClaudeMdChange(md)
    onWorkflowDeployedChange(md.includes(WORKFLOW_MARKER))
    setDeploying(false)
  }, [locale, claudeProjects, projectPath, onClaudeMdChange, onWorkflowDeployedChange])

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  return (
    <div className="claude-workflow">
      <div className="claude-workflow-header">
        <div className="claude-workflow-info">
          <h3 className="claude-workflow-title">{t('claude.workflowTitle')}</h3>
          <p className="claude-workflow-desc">{t('claude.workflowDesc')}</p>
        </div>
        <div className="claude-workflow-status">
          {workflowDeployed ? (
            <span className="claude-workflow-badge claude-workflow-badge--deployed">{t('claude.workflowDeployed')}</span>
          ) : (
            <span className="claude-workflow-badge claude-workflow-badge--not-deployed">{t('claude.workflowNotDeployed')}</span>
          )}
        </div>
      </div>

      <div className="claude-workflow-actions">
        {workflowDeployed ? (
          <button
            className="claude-workflow-action-btn claude-workflow-action-btn--remove"
            onClick={handleRemove}
            disabled={deploying}
          >
            {deploying ? t('claude.workflowDeploying') : t('claude.workflowRemove')}
          </button>
        ) : (
          <button
            className="claude-workflow-action-btn claude-workflow-action-btn--deploy"
            onClick={handleDeploy}
            disabled={deploying}
          >
            {deploying ? t('claude.workflowDeploying') : t('claude.workflowDeploy')}
          </button>
        )}
        {claudeProjects.length > 1 && (
          <button
            className="claude-workflow-action-btn claude-workflow-action-btn--deploy-all"
            onClick={handleDeployAll}
            disabled={deploying}
          >
            {t('claude.workflowDeployAll')}
          </button>
        )}
      </div>

      <div className="claude-workflow-sections">
        {workflow.sections.map((section) => (
          <div key={section.id} className="claude-workflow-section">
            <button
              className="claude-workflow-section-header"
              onClick={() => toggleSection(section.id)}
            >
              <span className={`claude-workflow-section-chevron${expandedSections.has(section.id) ? ' claude-workflow-section-chevron--open' : ''}`}>&#x25B6;</span>
              <span className="claude-workflow-section-title">{section.title}</span>
              <span className="claude-workflow-section-count">{t('claude.workflowSection', { count: String(section.items.length) })}</span>
            </button>
            {expandedSections.has(section.id) && (
              <ul className="claude-workflow-section-items">
                {section.items.map((item, i) => (
                  <li key={i} className="claude-workflow-section-item">{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
