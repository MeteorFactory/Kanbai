import { useState, useCallback } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

const DEFAULT_CLAUDE_MD = `# Project Configuration

## Language
- Code: English
- Comments: English

## Standards
- TypeScript strict mode
- ESLint + Prettier
- Tests required for all features
`

const DEFAULT_SETTINGS = {
  permissions: {
    defaultMode: 'acceptEdits',
  },
}

interface Template {
  id: string
  name: string
  claudeMd: string
  settings: Record<string, unknown>
}

const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'default',
    name: 'Standard',
    claudeMd: DEFAULT_CLAUDE_MD,
    settings: DEFAULT_SETTINGS,
  },
  {
    id: 'fullstack',
    name: 'Fullstack',
    claudeMd: `# Fullstack Project

## Stack
- Backend: Node.js / Express / TypeScript
- Frontend: React / TypeScript
- Database: PostgreSQL

## Standards
- REST API conventions
- TypeScript strict mode
- Unit + Integration tests
`,
    settings: DEFAULT_SETTINGS,
  },
  {
    id: 'frontend',
    name: 'Frontend',
    claudeMd: `# Frontend Project

## Stack
- React / TypeScript
- CSS Modules or Tailwind
- Vitest for testing

## Standards
- Accessibility (WCAG 2.1 AA)
- Responsive design
- Component-based architecture
`,
    settings: DEFAULT_SETTINGS,
  },
]

export function AutoClauder() {
  const { projects } = useWorkspaceStore()
  const [selectedTemplate, setSelectedTemplate] = useState('default')
  const [showPreview, setShowPreview] = useState(false)
  const [applying, setApplying] = useState(false)

  const nonClaudeProjects = projects.filter((p) => !p.hasClaude)

  const template = BUILT_IN_TEMPLATES.find((t) => t.id === selectedTemplate) || BUILT_IN_TEMPLATES[0]

  const handleApply = useCallback(
    async (_projectId: string) => {
      if (!template) return
      setApplying(true)
      try {
        await window.kanbai.settings.set({
          autoClauderEnabled: true,
          defaultAutoClauderTemplateId: template.id,
        })
        // The actual file writing would be done via IPC
        // For now we trigger the autoclaude:apply channel
        // This would need an IPC handler in the main process
      } finally {
        setApplying(false)
      }
    },
    [template],
  )

  return (
    <div className="autoclaude-panel">
      <div className="autoclaude-header">
        <h3>Auto-Clauder</h3>
        <span className="autoclaude-count">
          {nonClaudeProjects.length} projet{nonClaudeProjects.length !== 1 ? 's' : ''} sans .claude
        </span>
      </div>

      <div className="autoclaude-template-selector">
        <label>Template :</label>
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="autoclaude-select"
        >
          {BUILT_IN_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="autoclaude-preview-btn"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? 'Masquer' : 'Aperçu'}
        </button>
      </div>

      {showPreview && template && (
        <pre className="autoclaude-preview">{template.claudeMd}</pre>
      )}

      <div className="autoclaude-projects">
        {nonClaudeProjects.length === 0 ? (
          <p className="autoclaude-empty">Tous les projets ont déjà une configuration .claude.</p>
        ) : (
          nonClaudeProjects.map((project) => (
            <div key={project.id} className="autoclaude-project-item">
              <span className="autoclaude-project-name">{project.name}</span>
              <button
                className="autoclaude-apply-btn"
                onClick={() => handleApply(project.id)}
                disabled={applying}
              >
                {applying ? '...' : 'Appliquer'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
