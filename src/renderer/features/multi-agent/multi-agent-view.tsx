import { Terminal } from '../../components/Terminal'
import { useMultiAgent } from './use-multi-agent'
import './multiagent.css'

export function MultiAgentView() {
  const {
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
    maxAgents,
  } = useMultiAgent()

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
        {agents.length < maxAgents && (
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
