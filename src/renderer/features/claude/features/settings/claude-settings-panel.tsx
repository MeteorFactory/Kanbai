import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '../../../../lib/stores/workspaceStore'
import { useI18n } from '../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../shared/types/ai-provider'
import type { AiProviderId } from '../../../../../shared/types/ai-provider'
import { AiDefaultsTab } from './ai-defaults-tab'
import { GeneralTab } from './general-tab'
import { CodexGeneralTab } from './features/codex/codex-general-tab'
import { CodexRulesTab } from './features/codex/codex-rules-tab'
import { CodexSkillsTab } from './features/codex/codex-skills-tab'
import { CodexMemoryTab } from './features/codex/codex-memory-tab'
import { CodexMcpTab } from './features/codex/codex-mcp-tab'
import { CodexAgentsTab } from './features/codex/codex-agents-tab'
import { SecuritySandboxTab } from './features/security/security-sandbox-tab'
import { AgentsTab } from './agents-tab'
import { SkillsTab } from './skills-tab'
import { IntegrationsTab } from './integrations-tab'
import { MemoryTab } from './features/memory/memory-tab'
import { CopilotGeneralTab } from './features/copilot/copilot-general-tab'
import { CopilotRulesTab } from './features/copilot/copilot-rules-tab'
import { CopilotSkillsTab } from './features/copilot/copilot-skills-tab'
import { CopilotMemoryTab } from './features/copilot/copilot-memory-tab'
import { GeminiGeneralTab } from './features/gemini/gemini-general-tab'
import { GeminiUiTab } from './features/gemini/gemini-ui-tab'
import { GeminiToolsTab } from './features/gemini/gemini-tools-tab'
import { GeminiSecurityTab } from './features/gemini/gemini-security-tab'
import { GeminiAgentsTab } from './features/gemini/gemini-agents-tab'
import { GeminiSkillsTab } from './features/gemini/gemini-skills-tab'
import { GeminiMemoryTab } from './features/gemini/gemini-memory-tab'
import { useGeminiConfig } from './features/gemini/use-gemini-config'
import { WORKFLOW_MARKER } from '../../../../../shared/constants/defaultWorkflows'

type SidebarSection = 'general' | 'claude' | 'codex' | 'copilot' | 'gemini'
type ClaudeSubTab = 'general' | 'security' | 'agents' | 'skills' | 'integrations' | 'memory'
type CodexSubTab = 'general' | 'rules' | 'agents' | 'skills' | 'mcp' | 'memory'
type CopilotSubTab = 'general' | 'rules' | 'skills' | 'memory'
type GeminiSubTab = 'general' | 'ui' | 'tools' | 'security' | 'agents' | 'skills' | 'memory'

const SIDEBAR_ITEMS: { key: SidebarSection; providerId?: AiProviderId }[] = [
  { key: 'general' },
  { key: 'claude', providerId: 'claude' },
  { key: 'codex', providerId: 'codex' },
  { key: 'copilot', providerId: 'copilot' },
  { key: 'gemini', providerId: 'gemini' },
]

export function ClaudeSettingsPanel() {
  const { t } = useI18n()
  const { activeProjectId, activeWorkspaceId, projects, workspaces } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const activeWorkspace = workspaces.find((w) => w.id === (activeProject?.workspaceId ?? activeWorkspaceId))

  const [section, setSection] = useState<SidebarSection>('general')
  const [claudeSubTab, setClaudeSubTab] = useState<ClaudeSubTab>('general')
  const [codexSubTab, setCodexSubTab] = useState<CodexSubTab>('general')
  const [copilotSubTab, setCopilotSubTab] = useState<CopilotSubTab>('general')
  const [geminiSubTab, setGeminiSubTab] = useState<GeminiSubTab>('general')
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [localSettings, setLocalSettings] = useState<Record<string, unknown> | null>(null)
  const [userSettings, setUserSettings] = useState<Record<string, unknown> | null>(null)
  const [managedSettings, setManagedSettings] = useState<Record<string, unknown> | null>(null)
  const [claudeMd, setClaudeMd] = useState('')
  const [loading, setLoading] = useState(true)
  const [settingsErrors, setSettingsErrors] = useState<string[]>([])
  const [fixingSettings, setFixingSettings] = useState(false)
  const [hooksStatus, setHooksStatus] = useState<{ installed: boolean; upToDate: boolean }>({ installed: false, upToDate: false })
  const [installingHooks, setInstallingHooks] = useState(false)
  const [removingHooks, setRemovingHooks] = useState(false)
  const [workflowDeployed, setWorkflowDeployed] = useState(false)
  const [settingsTarget, setSettingsTarget] = useState<'project' | 'local'>('project')
  const [mcpServers, setMcpServers] = useState<Record<string, { command: string; args?: string[]; env?: Record<string, string> } | { type: 'http'; url: string; headers?: Record<string, string> }>>({})
  const [workspaceEnvPath, setWorkspaceEnvPath] = useState<string | null>(null)

  // Fetch workspace env path for workspace-level rules management
  useEffect(() => {
    if (!activeWorkspace) return
    window.kanbai.workspaceEnv.getPath(activeWorkspace.name).then((envPath) => {
      setWorkspaceEnvPath(envPath ?? null)
    })
  }, [activeWorkspace])

  const loadData = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const result = await window.kanbai.project.scanClaude(activeProject.path)
      if (result.settings) {
        const s = result.settings as Record<string, unknown>
        if (s._kanbaiMode && typeof s.permissions === 'object' && s.permissions !== null) {
          const perms = s.permissions as Record<string, unknown>
          if (!perms.defaultMode) {
            perms.defaultMode = s._kanbaiMode
            delete s._kanbaiMode
            await window.kanbai.project.writeClaudeSettings(activeProject.path, s)
          }
        }
        setSettings(s)
        const servers = s.mcpServers as Record<string, { command: string; args?: string[]; env?: Record<string, string> } | { type: 'http'; url: string; headers?: Record<string, string> }> | undefined
        setMcpServers(servers ?? {})
      } else {
        setSettings({})
        setMcpServers({})
      }
      setLocalSettings(result.localSettings ?? null)
      setUserSettings(result.userSettings ?? null)
      try {
        const managed = await window.kanbai.project.readManagedSettings()
        setManagedSettings(managed)
      } catch { setManagedSettings(null) }

      const md = result.claudeMd ?? ''
      setClaudeMd(md)
      setWorkflowDeployed(md.includes(WORKFLOW_MARKER))

      const wsName = activeWorkspace?.name
      const validation = await window.kanbai.claude.validateSettings(activeProject.path, wsName)
      setSettingsErrors(validation.errors)
      const hs = await window.kanbai.claude.checkHooksStatus(activeProject.path, wsName)
      setHooksStatus(hs)
    } catch {
      setSettings({})
      setClaudeMd('')
      setSettingsErrors([])
    }
    setLoading(false)
  }, [activeProject, activeWorkspace])

  useEffect(() => { loadData() }, [loadData])

  const writeSettings = useCallback(async (newSettings: Record<string, unknown>) => {
    if (!activeProject) return
    setSettings(newSettings)
    if (settingsTarget === 'local') {
      await window.kanbai.project.writeClaudeLocalSettings(activeProject.path, newSettings)
    } else {
      await window.kanbai.project.writeClaudeSettings(activeProject.path, newSettings)
    }
  }, [activeProject, settingsTarget])

  const handleFixSettings = useCallback(async () => {
    if (!activeProject) return
    setFixingSettings(true)
    await window.kanbai.claude.fixSettings(activeProject.path, activeWorkspace?.name)
    await loadData()
    setFixingSettings(false)
  }, [activeProject, activeWorkspace, loadData])

  const handleInstallHooks = useCallback(async () => {
    if (!activeProject) return
    setInstallingHooks(true)
    await window.kanbai.claude.installHooks(activeProject.path, activeWorkspace?.name)
    const hs = await window.kanbai.claude.checkHooksStatus(activeProject.path, activeWorkspace?.name)
    setHooksStatus(hs)
    setInstallingHooks(false)
  }, [activeProject, activeWorkspace])

  const handleUpdateHooks = useCallback(async () => {
    if (!activeProject) return
    setInstallingHooks(true)
    await window.kanbai.claude.installHooks(activeProject.path, activeWorkspace?.name)
    const hs = await window.kanbai.claude.checkHooksStatus(activeProject.path, activeWorkspace?.name)
    setHooksStatus(hs)
    setInstallingHooks(false)
  }, [activeProject, activeWorkspace])

  const handleRemoveHooks = useCallback(async () => {
    if (!activeProject) return
    setRemovingHooks(true)
    await window.kanbai.claude.removeHooks(activeProject.path, activeWorkspace?.name)
    const hs = await window.kanbai.claude.checkHooksStatus(activeProject.path, activeWorkspace?.name)
    setHooksStatus(hs)
    setRemovingHooks(false)
  }, [activeProject, activeWorkspace])

  const handleExportConfig = useCallback(async () => {
    if (!activeProject) return
    await window.kanbai.project.exportClaudeConfig(activeProject.path)
  }, [activeProject])

  const handleImportConfig = useCallback(async () => {
    if (!activeProject) return
    const result = await window.kanbai.project.importClaudeConfig(activeProject.path)
    if (result.success) await loadData()
  }, [activeProject, loadData])

  const handleMcpServersChange = useCallback((newServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> } | { type: 'http'; url: string; headers?: Record<string, string> }>, newSettings: Record<string, unknown>) => {
    setMcpServers(newServers)
    setSettings(newSettings)
  }, [])

  const handleSaveClaudeMd = useCallback(async (content: string) => {
    if (!activeProject) return
    await window.kanbai.project.writeClaudeMd(activeProject.path, content)
    setClaudeMd(content)
    setWorkflowDeployed(content.includes(WORKFLOW_MARKER))
  }, [activeProject])

  const mcpServerKeys = useMemo(() => Object.keys(mcpServers), [mcpServers])

  // suppress unused vars
  void handleSaveClaudeMd
  void localSettings
  void userSettings
  void managedSettings
  void settingsTarget
  void setSettingsTarget

  if (!activeProject) {
    // Workspace-only mode: show AI defaults at workspace level
    if (activeWorkspace) {
      return (
        <div className="claude-rules-panel">
          <div className="ai-panel-body">
            <div className="ai-sidebar">
              <div className="ai-sidebar-header">
                <h3>{t('ai.sidebar.title')}</h3>
              </div>
              <div className="ai-sidebar-content">
                <button className="ai-sidebar-item ai-sidebar-item--active">
                  <span className="ai-sidebar-icon">&#9881;</span>
                  <span className="ai-sidebar-item-label">{t('ai.sidebar.general')}</span>
                </button>
                {SIDEBAR_ITEMS.filter((i) => i.providerId).map((item) => (
                  <button
                    key={item.key}
                    className="ai-sidebar-item"
                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                    disabled
                    title={t('claude.noActiveProject')}
                  >
                    <span
                      className="ai-sidebar-dot"
                      style={{ background: AI_PROVIDERS[item.providerId!].detectionColor }}
                    />
                    <span className="ai-sidebar-item-label">
                      {AI_PROVIDERS[item.providerId!].displayName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ai-panel-content">
              <AiDefaultsTab workspaceId={activeWorkspace.id} />
            </div>
          </div>
        </div>
      )
    }
    return <div className="file-viewer-empty">{t('claude.noActiveProject')}</div>
  }
  if (loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  const claudeSubTabs: { key: ClaudeSubTab; label: string }[] = [
    { key: 'general', label: t('claude.generalTab') },
    { key: 'security', label: t('claude.securityTab') },
    { key: 'agents', label: t('claude.agentsTab') },
    { key: 'skills', label: t('claude.skillsTab') },
    { key: 'integrations', label: t('claude.integrationsTab') },
    { key: 'memory', label: t('claude.memoryTab') },
  ]

  return (
    <div className="claude-rules-panel">
      <div className="ai-panel-body">
        <div className="ai-sidebar">
          <div className="ai-sidebar-header">
            <h3>{t('ai.sidebar.title')}</h3>
          </div>
          <div className="ai-sidebar-content">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = section === item.key
              const providerColor = item.providerId ? AI_PROVIDERS[item.providerId].detectionColor : undefined
              const activeStyle = isActive && providerColor
                ? { borderColor: providerColor, background: `${providerColor}10` }
                : undefined
              return (
                <button
                  key={item.key}
                  className={`ai-sidebar-item${isActive ? ' ai-sidebar-item--active' : ''}`}
                  style={activeStyle}
                  onClick={() => setSection(item.key)}
                >
                  {item.providerId ? (
                    <span
                      className="ai-sidebar-dot"
                      style={{ background: AI_PROVIDERS[item.providerId].detectionColor }}
                    />
                  ) : (
                    <span className="ai-sidebar-icon">&#9881;</span>
                  )}
                  <span className="ai-sidebar-item-label">
                    {item.providerId ? AI_PROVIDERS[item.providerId].displayName : t('ai.sidebar.general')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="ai-panel-content">
          {section === 'general' && (
            <AiDefaultsTab projectId={activeProject.id} workspaceId={activeWorkspace?.id} />
          )}

          {section === 'claude' && (
            <>
              <div className="claude-rules-tabs">
                {claudeSubTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`claude-rules-tab${claudeSubTab === tab.key ? ' claude-rules-tab--active' : ''}`}
                    style={claudeSubTab === tab.key ? { borderColor: AI_PROVIDERS.claude.detectionColor, color: AI_PROVIDERS.claude.detectionColor } : undefined}
                    onClick={() => setClaudeSubTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="claude-rules-content">
                {claudeSubTab === 'general' && (
                  <GeneralTab
                    settings={settings}
                    settingsErrors={settingsErrors}
                    fixingSettings={fixingSettings}
                    hooksStatus={hooksStatus}
                    installingHooks={installingHooks}
                    removingHooks={removingHooks}
                    projectPath={activeProject.path}
                    onFixSettings={handleFixSettings}
                    onInstallHooks={handleInstallHooks}
                    onUpdateHooks={handleUpdateHooks}
                    onRemoveHooks={handleRemoveHooks}
                    onSettingsChange={writeSettings}
                    onExportConfig={handleExportConfig}
                    onImportConfig={handleImportConfig}
                  />
                )}
                {claudeSubTab === 'security' && (
                  <SecuritySandboxTab
                    settings={settings}
                    mcpServerKeys={mcpServerKeys}
                    onSettingsChange={writeSettings}
                  />
                )}
                {claudeSubTab === 'agents' && (
                  <AgentsTab
                    projectPath={activeProject.path}
                    onDeploySuccess={loadData}
                  />
                )}
                {claudeSubTab === 'skills' && (
                  <SkillsTab projectPath={activeProject.path} />
                )}
                {claudeSubTab === 'integrations' && (
                  <IntegrationsTab
                    settings={settings}
                    mcpServers={mcpServers}
                    projectPath={activeProject.path}
                    workspaceName={activeWorkspace?.name}
                    claudeMd={claudeMd}
                    workflowDeployed={workflowDeployed}
                    onSettingsChange={writeSettings}
                    onMcpServersChange={handleMcpServersChange}
                    onClaudeMdChange={setClaudeMd}
                    onWorkflowDeployedChange={setWorkflowDeployed}
                  />
                )}
                {claudeSubTab === 'memory' && (
                  <MemoryTab projectPath={activeProject.path} rulesPath={workspaceEnvPath ?? activeProject.path} />
                )}
              </div>
            </>
          )}

          {section === 'codex' && (
            <>
              <div className="claude-rules-tabs">
                {([
                  { key: 'general' as CodexSubTab, label: t('codex.generalTab') },
                  { key: 'rules' as CodexSubTab, label: t('codex.rulesTab') },
                  { key: 'agents' as CodexSubTab, label: t('codex.agentsTab') },
                  { key: 'skills' as CodexSubTab, label: t('codex.skillsTab') },
                  { key: 'mcp' as CodexSubTab, label: t('codex.mcpTab') },
                  { key: 'memory' as CodexSubTab, label: t('codex.memoryTab') },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    className={`claude-rules-tab${codexSubTab === tab.key ? ' claude-rules-tab--active' : ''}`}
                    style={codexSubTab === tab.key ? { borderColor: AI_PROVIDERS.codex.detectionColor, color: AI_PROVIDERS.codex.detectionColor } : undefined}
                    onClick={() => setCodexSubTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="claude-rules-content">
                {codexSubTab === 'general' && (
                  <CodexGeneralTab projectPath={activeProject.path} />
                )}
                {codexSubTab === 'rules' && (
                  <CodexRulesTab projectPath={workspaceEnvPath ?? activeProject.path} />
                )}
                {codexSubTab === 'agents' && (
                  <CodexAgentsTab projectPath={activeProject.path} />
                )}
                {codexSubTab === 'skills' && (
                  <CodexSkillsTab projectPath={activeProject.path} />
                )}
                {codexSubTab === 'mcp' && (
                  <CodexMcpTab projectPath={activeProject.path} />
                )}
                {codexSubTab === 'memory' && (
                  <CodexMemoryTab projectPath={activeProject.path} />
                )}
              </div>
            </>
          )}

          {section === 'copilot' && (
            <>
              <div className="claude-rules-tabs">
                {([
                  { key: 'general' as CopilotSubTab, label: t('copilot.generalTab') },
                  { key: 'rules' as CopilotSubTab, label: t('copilot.rulesTab') },
                  { key: 'skills' as CopilotSubTab, label: t('copilot.skillsTab') },
                  { key: 'memory' as CopilotSubTab, label: t('copilot.memoryTab') },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    className={`claude-rules-tab${copilotSubTab === tab.key ? ' claude-rules-tab--active' : ''}`}
                    style={copilotSubTab === tab.key ? { borderColor: AI_PROVIDERS.copilot.detectionColor, color: AI_PROVIDERS.copilot.detectionColor } : undefined}
                    onClick={() => setCopilotSubTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="claude-rules-content">
                {copilotSubTab === 'general' && (
                  <CopilotGeneralTab projectPath={activeProject.path} />
                )}
                {copilotSubTab === 'rules' && (
                  <CopilotRulesTab projectPath={workspaceEnvPath ?? activeProject.path} />
                )}
                {copilotSubTab === 'skills' && (
                  <CopilotSkillsTab projectPath={activeProject.path} />
                )}
                {copilotSubTab === 'memory' && (
                  <CopilotMemoryTab projectPath={activeProject.path} />
                )}
              </div>
            </>
          )}

          {section === 'gemini' && (
            <GeminiSettingsSection
              projectPath={activeProject.path}
              geminiSubTab={geminiSubTab}
              setGeminiSubTab={setGeminiSubTab}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function GeminiSettingsSection({
  projectPath,
  geminiSubTab,
  setGeminiSubTab,
}: {
  projectPath: string
  geminiSubTab: GeminiSubTab
  setGeminiSubTab: (tab: GeminiSubTab) => void
}) {
  const { t } = useI18n()
  const gemini = useGeminiConfig(projectPath)

  const tabs: { key: GeminiSubTab; label: string }[] = [
    { key: 'general', label: t('gemini.generalTab') },
    { key: 'ui', label: t('gemini.uiTab') },
    { key: 'tools', label: t('gemini.toolsTab') },
    { key: 'security', label: t('gemini.securityTab') },
    { key: 'agents', label: t('gemini.agentsTab') },
    { key: 'skills', label: t('gemini.skillsTab') },
    { key: 'memory', label: t('gemini.memoryTab') },
  ]

  if (gemini.loading) {
    return <div className="file-viewer-empty">{t('common.loading')}</div>
  }

  if (!gemini.exists) {
    return (
      <div className="cs-general-tab">
        <div className="cs-general-section">
          <div className="claude-rules-section">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{t('gemini.noConfig')}</p>
            <button className="modal-btn modal-btn--primary" onClick={gemini.createConfig}>
              {t('gemini.createConfig')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="claude-rules-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`claude-rules-tab${geminiSubTab === tab.key ? ' claude-rules-tab--active' : ''}`}
            style={geminiSubTab === tab.key ? { borderColor: AI_PROVIDERS.gemini.detectionColor, color: AI_PROVIDERS.gemini.detectionColor } : undefined}
            onClick={() => setGeminiSubTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="claude-rules-content">
        {geminiSubTab === 'general' && (
          <GeminiGeneralTab config={gemini.config} onUpdate={gemini.updateConfig} />
        )}
        {geminiSubTab === 'ui' && (
          <GeminiUiTab config={gemini.config} onUpdate={gemini.updateConfig} />
        )}
        {geminiSubTab === 'tools' && (
          <GeminiToolsTab config={gemini.config} onUpdate={gemini.updateConfig} />
        )}
        {geminiSubTab === 'security' && (
          <GeminiSecurityTab config={gemini.config} onUpdate={gemini.updateConfig} />
        )}
        {geminiSubTab === 'agents' && (
          <GeminiAgentsTab config={gemini.config} onUpdate={gemini.updateConfig} />
        )}
        {geminiSubTab === 'skills' && (
          <GeminiSkillsTab projectPath={projectPath} />
        )}
        {geminiSubTab === 'memory' && (
          <GeminiMemoryTab projectPath={projectPath} />
        )}
      </div>
      {gemini.saved && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--green)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, zIndex: 9999 }}>
          {t('gemini.saved')}
        </div>
      )}
    </>
  )
}
