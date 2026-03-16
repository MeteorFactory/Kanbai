import { useState, useCallback, useMemo, useEffect, type FormEvent } from 'react'
import { MCP_CATALOG } from '../../../shared/constants/mcpCatalog'
import type { McpCatalogEntry } from '../../../shared/types'

type McpScope = 'project' | 'workspace'
type McpTransport = 'stdio' | 'http'
type McpView = 'catalog' | 'installed'

interface McpStdioConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface McpHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpStdioConfig | McpHttpConfig

interface UseMcpParams {
  mcpServers: Record<string, McpServerConfig>
  settings: Record<string, unknown>
  projectPath: string
  workspaceName?: string
  onServersChange: (servers: Record<string, McpServerConfig>, settings: Record<string, unknown>) => void
}

export function useMcp({ mcpServers, settings, projectPath, workspaceName, onServersChange }: UseMcpParams) {
  // Scope state
  const [scope, setScope] = useState<McpScope>(workspaceName ? 'workspace' : 'project')
  const [workspaceMcpServers, setWorkspaceMcpServers] = useState<Record<string, McpServerConfig>>({})
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)

  // Load workspace MCP servers when scope changes to workspace
  useEffect(() => {
    if (!workspaceName) return
    setLoadingWorkspace(true)
    window.kanbai.mcp.workspaceRead(workspaceName)
      .then((result) => {
        setWorkspaceMcpServers(result.mcpServers as Record<string, McpServerConfig>)
      })
      .catch(() => setWorkspaceMcpServers({}))
      .finally(() => setLoadingWorkspace(false))
  }, [workspaceName])

  // Active servers depend on scope
  const activeServers = scope === 'workspace' ? workspaceMcpServers : mcpServers

  // View state
  const [view, setView] = useState<McpView>('catalog')
  const [searchQuery, setSearchQuery] = useState('')

  // Manual add state
  const [mcpAddingNew, setMcpAddingNew] = useState(false)
  const [mcpNewName, setMcpNewName] = useState('')
  const [mcpNewTransport, setMcpNewTransport] = useState<McpTransport>('stdio')
  const [mcpNewCommand, setMcpNewCommand] = useState('')
  const [mcpNewArgs, setMcpNewArgs] = useState('')
  const [mcpNewEnv, setMcpNewEnv] = useState('')
  const [mcpNewUrl, setMcpNewUrl] = useState('')
  const [mcpNewHeaders, setMcpNewHeaders] = useState('')

  // Catalog install state (for env variable and args configuration)
  const [installingEntry, setInstallingEntry] = useState<McpCatalogEntry | null>(null)
  const [installEnvValues, setInstallEnvValues] = useState<Record<string, string>>({})
  const [installArgsValues, setInstallArgsValues] = useState<Record<string, string>>({})

  // Installed server IDs (match catalog entries by command+args pattern)
  const installedCatalogIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [name] of Object.entries(mcpServers)) {
      const match = MCP_CATALOG.find(e => e.id === name)
      if (match) ids.add(match.id)
    }
    for (const [name] of Object.entries(workspaceMcpServers)) {
      const match = MCP_CATALOG.find(e => e.id === name)
      if (match) ids.add(match.id)
    }
    return ids
  }, [mcpServers, workspaceMcpServers])

  // Save servers to the appropriate target (project or workspace)
  const saveServers = useCallback(async (newServers: Record<string, McpServerConfig>) => {
    if (scope === 'workspace' && workspaceName) {
      await window.kanbai.mcp.workspaceWrite(workspaceName, newServers as Record<string, { command: string; args?: string[]; env?: Record<string, string> }>)
      setWorkspaceMcpServers(newServers)
    } else {
      const newSettings = { ...settings, mcpServers: newServers }
      await window.kanbai.project.writeClaudeSettings(projectPath, newSettings)
      onServersChange(newServers, newSettings)
    }
  }, [scope, workspaceName, settings, projectPath, onServersChange])

  const doInstall = useCallback(async (entry: McpCatalogEntry, envValues: Record<string, string>, argsValues: Record<string, string>) => {
    const env: Record<string, string> = {}
    let hasEnv = false
    for (const [key, val] of Object.entries(envValues)) {
      if (val.trim()) {
        env[key] = val.trim()
        hasEnv = true
      }
    }
    const resolvedArgs = entry.args.map(arg => {
      let resolved = arg
      for (const [key, val] of Object.entries(argsValues)) {
        resolved = resolved.replace(`{{${key}}}`, val.trim() || entry.argsPlaceholders?.[key] || '')
      }
      return resolved
    })
    const newServer = {
      command: entry.command,
      args: resolvedArgs,
      ...(hasEnv ? { env } : entry.env ? { env: entry.env } : {}),
    }
    const newServers = { ...activeServers, [entry.id]: newServer }
    await saveServers(newServers)
    setInstallingEntry(null)
    setInstallEnvValues({})
    setInstallArgsValues({})
  }, [activeServers, saveServers])

  // Install from catalog
  const handleCatalogInstall = useCallback((entry: McpCatalogEntry) => {
    const hasEnvConfig = entry.envPlaceholders && Object.keys(entry.envPlaceholders).length > 0
    const hasArgsConfig = entry.argsPlaceholders && Object.keys(entry.argsPlaceholders).length > 0
    if (hasEnvConfig || hasArgsConfig) {
      setInstallingEntry(entry)
      setInstallEnvValues(entry.envPlaceholders ? { ...entry.envPlaceholders } : {})
      setInstallArgsValues(entry.argsPlaceholders ? { ...entry.argsPlaceholders } : {})
      return
    }
    doInstall(entry, {}, {})
  }, [doInstall])

  const handleConfirmInstall = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!installingEntry) return
    await doInstall(installingEntry, installEnvValues, installArgsValues)
  }, [installingEntry, installEnvValues, installArgsValues, doInstall])

  // Manual add
  const handleAddMcpServer = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!mcpNewName.trim()) return

    let newServer: McpServerConfig

    if (mcpNewTransport === 'http') {
      if (!mcpNewUrl.trim()) return
      let headers: Record<string, string> | undefined
      if (mcpNewHeaders.trim()) {
        headers = {}
        for (const line of mcpNewHeaders.trim().split('\n')) {
          const sep = line.indexOf(':')
          if (sep > 0) {
            headers[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
          }
        }
        if (Object.keys(headers).length === 0) headers = undefined
      }
      newServer = { type: 'http', url: mcpNewUrl.trim(), ...(headers ? { headers } : {}) }
    } else {
      if (!mcpNewCommand.trim()) return
      const args = mcpNewArgs.trim() ? mcpNewArgs.trim().split('\n').map(a => a.trim()).filter(Boolean) : undefined
      let env: Record<string, string> | undefined
      if (mcpNewEnv.trim()) {
        env = {}
        for (const line of mcpNewEnv.trim().split('\n')) {
          const eq = line.indexOf('=')
          if (eq > 0) {
            env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
          }
        }
        if (Object.keys(env).length === 0) env = undefined
      }
      newServer = { command: mcpNewCommand.trim(), ...(args ? { args } : {}), ...(env ? { env } : {}) }
    }

    const newServers = { ...activeServers, [mcpNewName.trim()]: newServer }
    await saveServers(newServers)
    setMcpNewName('')
    setMcpNewTransport('stdio')
    setMcpNewCommand('')
    setMcpNewArgs('')
    setMcpNewEnv('')
    setMcpNewUrl('')
    setMcpNewHeaders('')
    setMcpAddingNew(false)
  }, [mcpNewName, mcpNewTransport, mcpNewCommand, mcpNewArgs, mcpNewEnv, mcpNewUrl, mcpNewHeaders, activeServers, saveServers])

  // Remove server
  const handleRemoveMcpServer = useCallback(async (name: string) => {
    const newServers = { ...activeServers }
    delete newServers[name]
    await saveServers(newServers)
  }, [activeServers, saveServers])

  const installedCount = Object.keys(activeServers).length

  return {
    // Scope
    scope,
    setScope,
    workspaceName,
    loadingWorkspace,
    activeServers,

    // View
    view,
    setView,
    searchQuery,
    setSearchQuery,

    // Catalog
    installedCatalogIds,
    installingEntry,
    setInstallingEntry,
    installEnvValues,
    setInstallEnvValues,
    installArgsValues,
    setInstallArgsValues,
    handleCatalogInstall,
    handleConfirmInstall,

    // Manual add
    mcpAddingNew,
    setMcpAddingNew,
    mcpNewName,
    setMcpNewName,
    mcpNewTransport,
    setMcpNewTransport,
    mcpNewCommand,
    setMcpNewCommand,
    mcpNewArgs,
    setMcpNewArgs,
    mcpNewEnv,
    setMcpNewEnv,
    mcpNewUrl,
    setMcpNewUrl,
    mcpNewHeaders,
    setMcpNewHeaders,
    handleAddMcpServer,

    // Server management
    handleRemoveMcpServer,
    installedCount,
  }
}
