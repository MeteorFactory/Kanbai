import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { MemoryEditor } from '../../../../../../components/claude-settings/MemoryEditor'

interface Props {
  projectPath: string
}

type SubTab = 'project' | 'global'

const PROJECT_TEMPLATE = `# Project Context (GEMINI.md)

## Overview
<!-- Describe your project here for Gemini -->

## Code Conventions
<!-- Add your coding standards -->

## Important Files
<!-- List key files and their purposes -->
`

const GLOBAL_TEMPLATE = `# Global Context (GEMINI.md)

<!-- Your personal preferences for Gemini CLI across all projects -->
`

export function GeminiMemoryTab({ projectPath }: Props) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SubTab>('project')
  const [projectMd, setProjectMd] = useState<string | null>(null)
  const [globalMd, setGlobalMd] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [proj, global] = await Promise.all([
      window.kanbai.geminiMemory.readMemory(projectPath),
      window.kanbai.geminiMemory.readGlobalMemory(),
    ])
    setProjectMd(proj)
    setGlobalMd(global)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const handleSaveProject = useCallback(async (content: string) => {
    await window.kanbai.geminiMemory.writeMemory(projectPath, content)
    setProjectMd(content)
  }, [projectPath])

  const handleSaveGlobal = useCallback(async (content: string) => {
    await window.kanbai.geminiMemory.writeGlobalMemory(content)
    setGlobalMd(content)
  }, [])

  const handleCreateProject = useCallback(async () => {
    await window.kanbai.geminiMemory.writeMemory(projectPath, PROJECT_TEMPLATE)
    setProjectMd(PROJECT_TEMPLATE)
  }, [projectPath])

  const handleCreateGlobal = useCallback(async () => {
    await window.kanbai.geminiMemory.writeGlobalMemory(GLOBAL_TEMPLATE)
    setGlobalMd(GLOBAL_TEMPLATE)
  }, [])

  const tabs: { key: SubTab; label: string; exists: boolean }[] = [
    { key: 'project', label: t('gemini.memoryProject'), exists: projectMd !== null },
    { key: 'global', label: t('gemini.memoryGlobal'), exists: globalMd !== null },
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
          <div className="cs-memory-empty-file-desc">{t('gemini.memoryNotFound')}</div>
          <button
            className="modal-btn modal-btn--primary"
            style={{ marginTop: 12 }}
            onClick={onCreate}
          >
            {t('gemini.createMemory')}
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
          `${projectPath}/GEMINI.md`,
          handleSaveProject,
          handleCreateProject,
        )}
        {activeTab === 'global' && renderFileTab(
          globalMd,
          '~/.gemini/GEMINI.md',
          handleSaveGlobal,
          handleCreateGlobal,
        )}
      </div>
    </div>
  )
}
