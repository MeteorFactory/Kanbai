import { useState, useCallback } from 'react'
import { Terminal } from '../features/terminal'
import { useClaudeStore } from '../lib/stores/claudeStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import '../styles/multiagent.css'

interface AgentPane {
  id: string
  label: string
  prompt: string
  sessionId: string | null
  status: 'idle' | 'running' | 'completed' | 'failed'
}

const MAX_AGENTS = 4

export function MultiAgentView() {
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

  const getLayoutClass = () => {
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
  }

  if (!activeProject) {
    return (
      <div className="multiagent-empty">
        Sélectionnez un projet pour utiliser le mode multi-agents.
      </div>
    )
  }

  return (
    <div className="multiagent">
      <div className="multiagent-toolbar">
        <div className="multiagent-tabs">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`multiagent-tab${activeAgentId === agent.id ? ' multiagent-tab--active' : ''}`}
              onClick={() => setActiveAgentId(agent.id)}
            >
              <span
                className={`multiagent-tab-dot multiagent-tab-dot--${agent.status}`}
              />
              {agent.label}
              <button
                className="multiagent-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveAgent(agent.id)
                }}
              >
                ×
              </button>
            </button>
          ))}
        </div>
        {agents.length < MAX_AGENTS && (
          <button className="multiagent-add" onClick={handleAddAgent}>
            + Agent
          </button>
        )}
      </div>

      {showPromptInput && (
        <div className="multiagent-prompt-bar">
          <input
            className="multiagent-prompt-input"
            placeholder="Prompt pour l'agent (optionnel)..."
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmAgent()}
            autoFocus
          />
          <button className="multiagent-prompt-go" onClick={handleConfirmAgent}>
            Lancer
          </button>
          <button
            className="multiagent-prompt-cancel"
            onClick={() => setShowPromptInput(false)}
          >
            Annuler
          </button>
        </div>
      )}

      <div className={`multiagent-grid ${getLayoutClass()}`}>
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`multiagent-pane${activeAgentId === agent.id ? ' multiagent-pane--active' : ''}`}
            onClick={() => setActiveAgentId(agent.id)}
          >
            <div className="multiagent-pane-header">
              <span className={`multiagent-pane-status multiagent-pane-status--${agent.status}`}>
                ●
              </span>
              <span className="multiagent-pane-label">{agent.label}</span>
              {agent.prompt && (
                <span className="multiagent-pane-prompt" title={agent.prompt}>
                  {agent.prompt.slice(0, 40)}...
                </span>
              )}
            </div>
            <div className="multiagent-pane-terminal">
              <Terminal cwd={activeProject.path} isVisible={true} fontSize={14} />
            </div>
          </div>
        ))}

        {agents.length === 0 && (
          <div className="multiagent-placeholder">
            <p>Mode Multi-Agents</p>
            <p className="multiagent-placeholder-sub">
              Ajoutez jusqu'à 4 agents Claude simultanés sur ce projet.
            </p>
            <button className="multiagent-start-btn" onClick={handleAddAgent}>
              + Ajouter un agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
