import { useState, useCallback } from 'react'
import { useClaudeStore } from './claude-store'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

export function ClaudeSessionPanel() {
  const { sessions, flashingSessionId, startSession, stopSession } = useClaudeStore()
  const { activeProjectId, projects } = useWorkspaceStore()
  const [prompt, setPrompt] = useState('')
  const [loopMode, setLoopMode] = useState(false)
  const [loopDelay, setLoopDelay] = useState(5)
  const [showConfig, setShowConfig] = useState(false)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const handleStart = useCallback(async () => {
    if (!activeProject) return
    await startSession(
      activeProject.id,
      activeProject.path,
      `claude-${activeProject.id}-${Date.now()}`,
      prompt || undefined,
      loopMode,
      loopDelay * 1000,
    )
    setShowConfig(false)
  }, [activeProject, prompt, loopMode, loopDelay, startSession])

  const handleStop = useCallback(
    (sessionId: string) => {
      stopSession(sessionId)
    },
    [stopSession],
  )

  const projectSessions = activeProject
    ? sessions.filter((s) => s.projectId === activeProject.id)
    : []

  if (!activeProject) {
    return (
      <div className="claude-panel">
        <div className="claude-panel-empty">
          Sélectionnez un projet pour lancer une session Claude.
        </div>
      </div>
    )
  }

  return (
    <div className="claude-panel">
      <div className="claude-panel-header">
        <h3>Claude Sessions</h3>
        <button className="claude-launch-btn" onClick={() => setShowConfig(!showConfig)}>
          + Lancer Claude
        </button>
      </div>

      {showConfig && (
        <div className="claude-config">
          <textarea
            className="claude-prompt-input"
            placeholder="Prompt personnalisé (optionnel)..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <div className="claude-config-row">
            <label className="claude-toggle">
              <input
                type="checkbox"
                checked={loopMode}
                onChange={(e) => setLoopMode(e.target.checked)}
              />
              <span>Mode boucle</span>
            </label>
            {loopMode && (
              <div className="claude-delay-input">
                <label>Délai (s) :</label>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={loopDelay}
                  onChange={(e) => setLoopDelay(Number(e.target.value))}
                />
              </div>
            )}
          </div>
          <button className="claude-start-btn" onClick={handleStart}>
            Démarrer la session
          </button>
        </div>
      )}

      <div className="claude-sessions-list">
        {projectSessions.length === 0 ? (
          <div className="claude-sessions-empty">Aucune session active.</div>
        ) : (
          projectSessions.map((session) => (
            <div
              key={session.id}
              className={`claude-session-item${
                flashingSessionId === session.id ? ' claude-session-item--flashing' : ''
              }${session.status === 'running' ? ' claude-session-item--running' : ''}`}
            >
              <div className="claude-session-info">
                <span className={`claude-session-status claude-session-status--${session.status}`}>
                  {session.status === 'running' && '●'}
                  {session.status === 'completed' && '✓'}
                  {session.status === 'failed' && '✗'}
                  {session.status === 'paused' && '⏸'}
                </span>
                <span className="claude-session-label">
                  Session {session.id.slice(0, 8)}
                  {session.loopMode && ` (boucle: ${session.loopCount})`}
                </span>
              </div>
              <div className="claude-session-actions">
                {session.status === 'running' && (
                  <button
                    className="claude-stop-btn"
                    onClick={() => handleStop(session.id)}
                    title="Arrêter"
                  >
                    ■
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
