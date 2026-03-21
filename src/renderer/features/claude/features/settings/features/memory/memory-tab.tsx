import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { RulesManager } from '../../components/rules-manager'
import { MemoryEditor } from './memory-editor'

interface Props {
  projectPath: string
  rulesPath?: string
}

type SubTab = 'rules' | 'project' | 'user' | 'local' | 'managed'

const FILE_TEMPLATES: Record<string, string> = {
  project: `# Project Instructions

## Overview
<!-- Describe your project here -->

## Code Conventions
<!-- Add your coding standards -->

## Important Files
<!-- List key files and their purposes -->
`,
  user: `# User Instructions

<!-- Your personal preferences for Claude across all projects -->
`,
  local: `# Local Instructions

<!-- Project-specific local settings (not committed to git) -->
`,
}

export function MemoryTab({ projectPath, rulesPath }: Props) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SubTab>('rules')
  const [projectMd, setProjectMd] = useState<string | null>(null)
  const [userMd, setUserMd] = useState<string | null>(null)
  const [localMd, setLocalMd] = useState<string | null>(null)
  const [managedMd, setManagedMd] = useState<string | null>(null)

  const filePaths = useMemo(() => ({
    project: projectPath + '/CLAUDE.md',
    user: '~/.claude/CLAUDE.md',
    local: projectPath + '/CLAUDE.local.md',
  }), [projectPath])

  const load = useCallback(async () => {
    const [proj, user, local, managed] = await Promise.all([
      window.kanbai.claudeMemory.readFile(filePaths.project),
      window.kanbai.claudeMemory.readFile(filePaths.user),
      window.kanbai.claudeMemory.readFile(filePaths.local),
      window.kanbai.claudeMemory.readManaged(),
    ])
    setProjectMd(proj)
    setUserMd(user)
    setLocalMd(local)
    setManagedMd(managed)
  }, [filePaths])

  useEffect(() => { load() }, [load])

  const handleSaveProject = useCallback(async (content: string) => {
    await window.kanbai.claudeMemory.writeFile(filePaths.project, content)
    setProjectMd(content)
  }, [filePaths])

  const handleSaveUser = useCallback(async (content: string) => {
    await window.kanbai.claudeMemory.writeFile(filePaths.user, content)
    setUserMd(content)
  }, [filePaths])

  const handleSaveLocal = useCallback(async (content: string) => {
    await window.kanbai.claudeMemory.writeFile(filePaths.local, content)
    setLocalMd(content)
  }, [filePaths])

  const handleCreate = useCallback(async (tab: 'project' | 'user' | 'local') => {
    const template = FILE_TEMPLATES[tab] || ''
    const path = filePaths[tab]
    await window.kanbai.claudeMemory.writeFile(path, template)
    if (tab === 'project') setProjectMd(template)
    else if (tab === 'user') setUserMd(template)
    else if (tab === 'local') setLocalMd(template)
  }, [filePaths])

  const tabs: { key: SubTab; label: string; exists: boolean | null }[] = [
    { key: 'rules', label: t('claude.rulesTab'), exists: null },
    { key: 'project', label: t('claude.memorySubProject'), exists: projectMd !== null },
    { key: 'user', label: t('claude.memorySubUser'), exists: userMd !== null },
    { key: 'local', label: t('claude.memorySubLocal'), exists: localMd !== null },
    { key: 'managed', label: t('claude.memorySubManaged'), exists: managedMd !== null },
  ]

  const renderFileTab = (
    tab: 'project' | 'user' | 'local',
    title: string,
    content: string | null,
    onSave: (content: string) => Promise<void>,
  ) => {
    if (content === null) {
      return (
        <div className="cs-memory-empty-file">
          <div className="cs-memory-empty-file-icon">📄</div>
          <div className="cs-memory-empty-file-title">{title}</div>
          <div className="cs-memory-empty-file-desc">{t('claude.fileNotExists')}</div>
          <button
            className="modal-btn modal-btn--primary"
            style={{ marginTop: 12 }}
            onClick={() => handleCreate(tab)}
          >
            {t('claude.createFile')}
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
            {tab.exists !== null && (
              <span className={`cs-memory-subtab-badge cs-memory-subtab-badge--${tab.exists ? 'exists' : 'missing'}`} />
            )}
          </button>
        ))}
      </div>

      <div className="cs-memory-content">
        {activeTab === 'rules' && <RulesManager projectPath={rulesPath ?? projectPath} />}
        {activeTab === 'project' && renderFileTab('project', 'CLAUDE.md', projectMd, handleSaveProject)}
        {activeTab === 'user' && renderFileTab('user', '~/.claude/CLAUDE.md', userMd, handleSaveUser)}
        {activeTab === 'local' && renderFileTab('local', 'CLAUDE.local.md', localMd, handleSaveLocal)}

        {activeTab === 'managed' && (
          managedMd !== null ? (
            <MemoryEditor title="Managed CLAUDE.md" content={managedMd} readOnly />
          ) : (
            <div className="cs-memory-empty-file">
              <div className="cs-memory-empty-file-icon">🔒</div>
              <div className="cs-memory-empty-file-title">Managed CLAUDE.md</div>
              <div className="cs-memory-empty-file-desc">{t('claude.managedMissing')}</div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
