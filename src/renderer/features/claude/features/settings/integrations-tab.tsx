import { useState, useCallback, useMemo } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { McpPanel } from '../../../../components/McpPanel'
import { WorkflowTab } from './workflow-tab'
import { EnvVarsEditor } from './components/env-vars-editor'

type McpServerConfig =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }

interface Props {
  settings: Record<string, unknown>
  mcpServers: Record<string, McpServerConfig>
  projectPath: string
  workspaceName?: string
  claudeMd: string
  workflowDeployed: boolean
  onSettingsChange: (settings: Record<string, unknown>) => void
  onMcpServersChange: (servers: Record<string, McpServerConfig>, settings: Record<string, unknown>) => void
  onClaudeMdChange: (md: string) => void
  onWorkflowDeployedChange: (deployed: boolean) => void
}

export function IntegrationsTab({
  settings,
  mcpServers,
  projectPath,
  workspaceName,
  claudeMd,
  workflowDeployed,
  onSettingsChange,
  onMcpServersChange,
  onClaudeMdChange,
  onWorkflowDeployedChange,
}: Props) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['mcp']))

  const envVars = useMemo(() => (settings.env as Record<string, string>) ?? {}, [settings.env])

  const toggleSection = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleEnvChange = useCallback((vars: Record<string, string>) => {
    const next = { ...settings }
    if (Object.keys(vars).length > 0) next.env = vars
    else delete next.env
    onSettingsChange(next)
  }, [settings, onSettingsChange])

  return (
    <div className="cs-model-config">
      <div className="cs-collapsible">
        <button className="cs-collapsible-header" onClick={() => toggleSection('mcp')}>
          <span className={`cs-collapsible-chevron${expanded.has('mcp') ? ' cs-collapsible-chevron--open' : ''}`}>&#x25B6;</span>
          {t('claude.mcpSection')}
        </button>
        {expanded.has('mcp') && (
          <div className="cs-collapsible-content">
            <McpPanel mcpServers={mcpServers} settings={settings} projectPath={projectPath} workspaceName={workspaceName} onServersChange={onMcpServersChange} />
          </div>
        )}
      </div>

      <div className="cs-collapsible">
        <button className="cs-collapsible-header" onClick={() => toggleSection('workflow')}>
          <span className={`cs-collapsible-chevron${expanded.has('workflow') ? ' cs-collapsible-chevron--open' : ''}`}>&#x25B6;</span>
          {t('claude.workflowSection2')}
        </button>
        {expanded.has('workflow') && (
          <div className="cs-collapsible-content">
            <WorkflowTab projectPath={projectPath} claudeMd={claudeMd} workflowDeployed={workflowDeployed} onClaudeMdChange={onClaudeMdChange} onWorkflowDeployedChange={onWorkflowDeployedChange} />
          </div>
        )}
      </div>

      <div className="cs-collapsible">
        <button className="cs-collapsible-header" onClick={() => toggleSection('envvars')}>
          <span className={`cs-collapsible-chevron${expanded.has('envvars') ? ' cs-collapsible-chevron--open' : ''}`}>&#x25B6;</span>
          {t('claude.envVarsSection')}
        </button>
        {expanded.has('envvars') && (
          <div className="cs-collapsible-content">
            <EnvVarsEditor envVars={envVars} onChange={handleEnvChange} />
          </div>
        )}
      </div>
    </div>
  )
}
