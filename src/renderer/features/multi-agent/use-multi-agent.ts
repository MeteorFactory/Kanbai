import { useState, useCallback } from 'react'
import { useClaudeStore } from '../../lib/stores/claudeStore'
import { useWorkspaceStore } from '../workspace'

interface AgentPane {
  id: string
  label: string
  prompt: string
  sessionId: string | null
  status: 'idle' | 'running' | 'completed' | 'failed'
}

const MAX_AGENTS = 4

export function useMultiAgent() {
  const { activeProjectId, projects } = useWorkspaceStore()
  const { startSession, stopSession } = useClaudeStore()
  const [agents, setAgents] = useState<AgentPane[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [showPromptInput, setShowPromptInput] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const handleAddAgent = useCallback(() => {
    if (agents.length >= MAX_AGENTS || !activeProject) return
    setShowPromptInput(true)
  }, [agents.length, activeProject])

  const handleConfirmAgent = useCallback(async () => {
    if (!activeProject) return

    const id = `agent-${Date.now()}`
    const newAgent: AgentPane = {
      id,
      label: `Agent ${agents.length + 1}`,
      prompt: newPrompt,
      sessionId: null,
      status: 'idle',
    }

    setAgents((prev) => [...prev, newAgent])
    setActiveAgentId(id)
    setShowPromptInput(false)
    setNewPrompt('')

    // Start Claude session for this agent
    const session = await startSession(
      activeProject.id,
      activeProject.path,
      id,
      newPrompt || undefined,
    )

    if (session) {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, sessionId: session.id, status: 'running' } : a)),
      )
    }
  }, [activeProject, newPrompt, agents.length, startSession])

  const handleRemoveAgent = useCallback(
    (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId)
      if (agent?.sessionId) {
        stopSession(agent.sessionId)
      }
      setAgents((prev) => prev.filter((a) => a.id !== agentId))
      if (activeAgentId === agentId) {
        setActiveAgentId(agents[0]?.id || null)
      }
    },
    [agents, activeAgentId, stopSession],
  )

  const getLayoutClass = useCallback((): string => {
    switch (agents.length) {
      case 1:
        return 'multiagent-grid--1'
      case 2:
        return 'multiagent-grid--2'
      case 3:
        return 'multiagent-grid--3'
      case 4:
        return 'multiagent-grid--4'
      default:
        return ''
    }
  }, [agents.length])

  return {
    agents,
    activeAgentId,
    setActiveAgentId,
    showPromptInput,
    newPrompt,
    setNewPrompt,
    setShowPromptInput,
    activeProject,
    handleAddAgent,
    handleConfirmAgent,
    handleRemoveAgent,
    getLayoutClass,
    maxAgents: MAX_AGENTS,
  }
}

export type { AgentPane }
