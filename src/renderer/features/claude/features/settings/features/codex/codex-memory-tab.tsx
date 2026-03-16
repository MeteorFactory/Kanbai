import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { MemoryEditor } from '../memory/memory-editor'

interface Props {
  projectPath: string
}

type SubTab = 'project' | 'global'

const PROJECT_TEMPLATE = `# Project Instructions (AGENTS.md)

## Overview
<!-- Describe your project here for Codex -->

## Code Conventions
<!-- Add your coding standards -->

## Important Files
<!-- List key files and their purposes -->
`

const GLOBAL_TEMPLATE = `# Global Instructions (AGENTS.md)

<!-- Your personal preferences for Codex across all projects -->
`

export function CodexMemoryTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SubTab>('project')
  const [projectMd, setProjectMd] = useState<string | null>(null)
  const [globalMd, setGlobalMd] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [proj, global] = await Promise.all([
      window.kanbai.codexMemory.readAgentsMd(projectPath),
      window.kanbai.codexMemory.readGlobalAgentsMd(),
    ])
    setProjectMd(proj)
    setGlobalMd(global)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const handleSaveProject = useCallback(async (content: string) => {
    await window.kanbai.codexMemory.writeAgentsMd(projectPath, content)
    setProjectMd(content)
  }, [projectPath])

  const handleSaveGlobal = useCallback(async (content: string) => {
    await window.kanbai.codexMemory.writeGlobalAgentsMd(content)
    setGlobalMd(content)
  }, [])

  const handleCreateProject = useCallback(async () => {
    await window.kanbai.codexMemory.writeAgentsMd(projectPath, PROJECT_TEMPLATE)
    setProjectMd(PROJECT_TEMPLATE)
  }, [projectPath])

  const handleCreateGlobal = useCallback(async () => {
    await window.kanbai.codexMemory.writeGlobalAgentsMd(GLOBAL_TEMPLATE)
    setGlobalMd(GLOBAL_TEMPLATE)
  }, [])

  const tabs: { key: SubTab; label: string; exists: boolean }[] = [
    { key: 'project', label: t('codex.memoryProject'), exists: projectMd !== null },
    { key: 'global', label: t('codex.memoryGlobal'), exists: globalMd !== null },
  ]

  const renderFileTab = (
    content: string | null,
    title: string,
    onSave: (content: string) => Promise<void>,
    onCreate: () => void,
  ) => {
    if (content === null) {
      return (
        <div className="cs-memory-empty-file">
          <div className="cs-memory-empty-file-icon">&#128196;</div>
          <div className="cs-memory-empty-file-title">{title}</div>
          <div className="cs-memory-empty-file-desc">{t('codex.agentsMdNotFound')}</div>
          <button
            className="modal-btn modal-btn--primary"
            style={{ marginTop: 12 }}
            onClick={onCreate}
          >
            {t('codex.createAgentsMd')}
          </button>
        </div>
      )
    }
    return <MemoryEditor title={title} content={content} onSave={onSave} />
  }

  return (
    <div className="cs-memory-tab">
      <div className="cs-memory-subtabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`cs-memory-subtab${activeTab === tab.key ? ' cs-memory-subtab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className={`cs-memory-subtab-badge cs-memory-subtab-badge--${tab.exists ? 'exists' : 'missing'}`} />
          </button>
        ))}
      </div>

      <div className="cs-memory-content">
        {activeTab === 'project' && renderFileTab(
          projectMd,
          `${projectPath}/AGENTS.md`,
          handleSaveProject,
          handleCreateProject,
        )}
        {activeTab === 'global' && renderFileTab(
          globalMd,
          '~/.codex/AGENTS.md',
          handleSaveGlobal,
          handleCreateGlobal,
        )}
      </div>
    </div>
  )
}
