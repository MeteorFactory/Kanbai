import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useI18n } from '../lib/i18n'
import { usePackagesStore } from '../lib/stores/packagesStore'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { AI_PROVIDERS } from '../../shared/types/ai-provider'
import type { AiProviderId } from '../../shared/types/ai-provider'
import type { PackageManagerType } from '../../shared/types'

interface PackagesChatProps {
  projectPath: string
  manager: PackageManagerType
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function PackagesChat({ projectPath, manager }: PackagesChatProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    nlMessages,
    nlLoading,
    addNlMessage,
    setNlLoading,
    clearNlMessages,
    updatePackage,
    loadPackages,
    selectedProjectId,
  } = usePackagesStore()
  const { activeProjectId, projects } = useWorkspaceStore()
  const packagesProvider: AiProviderId = useMemo(() => {
    const p = projects.find((proj) => proj.id === activeProjectId)
    return p?.aiDefaults?.packages ?? p?.aiProvider ?? 'claude'
  }, [activeProjectId, projects])
  const providerConfig = AI_PROVIDERS[packagesProvider]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nlMessages.length, nlLoading])

  const handleCopy = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Clipboard API not available
    }
  }, [])

  const handleCancel = useCallback(async () => {
    try {
      await window.kanbai.packages.nlCancel()
    } catch {
      // Ignore cancel errors
    }
    setNlLoading(false)
  }, [setNlLoading])

  const handleSend = useCallback(async () => {
    if (!input.trim() || nlLoading) return
    const userQuestion = input.trim()
    addNlMessage({
      id: generateId(),
      role: 'user',
      content: userQuestion,
      timestamp: Date.now(),
    })
    setInput('')
    setNlLoading(true)
    try {
      const { activeProjectId, projects } = useWorkspaceStore.getState()
      const activeProject = projects.find((p) => p.id === activeProjectId)
      const packagesProvider = activeProject?.aiDefaults?.packages ?? activeProject?.aiProvider ?? 'claude'
      const result = await window.kanbai.packages.nlAsk(
        projectPath,
        manager,
        userQuestion,
        nlMessages,
        packagesProvider,
      )
      addNlMessage({
        id: generateId(),
        role: 'assistant',
        content: result.answer,
        timestamp: Date.now(),
      })

      // Execute update action if the AI suggested it
      const action = result.action as
        | { type: string; packages: string[] }
        | undefined
      if (
        action?.type === 'update' &&
        Array.isArray(action.packages) &&
        action.packages.length > 0
      ) {
        const updateResults: Array<{
          name: string
          success: boolean
          error?: string
        }> = []

        for (const name of action.packages) {
          const res = await updatePackage(projectPath, manager, name)
          updateResults.push({ name, ...res })
        }

        const successes = updateResults.filter((r) => r.success)
        const failures = updateResults.filter((r) => !r.success)

        let feedbackContent = ''
        if (successes.length > 0) {
          feedbackContent += `\u2713 ${t('packages.updated', { name: successes.map((r) => r.name).join(', ') })}`
        }
        if (failures.length > 0) {
          if (feedbackContent) feedbackContent += '\n'
          feedbackContent += failures
            .map(
              (r) =>
                `\u2717 ${t('packages.failedUpdate', { name: r.name, error: r.error ?? '' })}`,
            )
            .join('\n')
        }

        addNlMessage({
          id: generateId(),
          role: failures.length === 0 ? 'assistant' : 'error',
          content: feedbackContent,
          timestamp: Date.now(),
        })

        // Reload package list after successful updates
        if (successes.length > 0 && selectedProjectId) {
          loadPackages(selectedProjectId, projectPath, manager)
        }
      }
    } catch (err) {
      addNlMessage({
        id: generateId(),
        role: 'error',
        content: String(err),
        timestamp: Date.now(),
      })
    } finally {
      setNlLoading(false)
    }
  }, [
    input,
    nlLoading,
    projectPath,
    manager,
    nlMessages,
    addNlMessage,
    setNlLoading,
    updatePackage,
    loadPackages,
    selectedProjectId,
    t,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="packages-chat">
      <div className="packages-chat-messages">
        {nlMessages.length === 0 && !nlLoading && (
          <div className="packages-chat-empty">{t('packages.chatEmpty')}</div>
        )}
        {nlMessages.map((msg) => {
          const isAssistant = msg.role === 'assistant'
          const msgStyle = isAssistant
            ? { borderLeftColor: providerConfig.detectionColor, background: `${providerConfig.detectionColor}0a` } as React.CSSProperties
            : undefined
          return (
          <div
            key={msg.id}
            className={`packages-chat-message packages-chat-message--${msg.role}`}
            style={msgStyle}
          >
            <div className="packages-chat-message-header">
              <span className="packages-chat-message-role">
                {msg.role === 'user'
                  ? 'You'
                  : msg.role === 'error'
                    ? 'Error'
                    : providerConfig.displayName}
              </span>
              <span className="packages-chat-message-time">
                {new Date(msg.timestamp).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <button
                className={`packages-chat-copy-btn${copiedId === msg.id ? ' packages-chat-copy-btn--copied' : ''}`}
                onClick={() => handleCopy(msg.id, msg.content)}
                title={t('common.copy')}
              >
                {copiedId === msg.id ? '\u2713' : t('common.copy')}
              </button>
            </div>
            <div className="packages-chat-message-content">{msg.content}</div>
          </div>
          )
        })}
        {nlLoading && (
          <div className="packages-chat-message packages-chat-message--loading">
            <div className="packages-chat-message-content">
              <span className="packages-chat-spinner" />
              {t('packages.chatThinking')}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="packages-chat-input-area">
        {nlMessages.length > 0 && (
          <button
            className="packages-chat-clear-btn"
            onClick={clearNlMessages}
            title="Clear"
          >
            &times;
          </button>
        )}
        <input
          className="packages-chat-input"
          type="text"
          placeholder={t('packages.chatPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={nlLoading}
        />
        {nlLoading ? (
          <button
            className="packages-chat-send-btn packages-chat-send-btn--cancel"
            onClick={handleCancel}
          >
            {t('packages.chatCancel')}
          </button>
        ) : (
          <button
            className="packages-chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            {t('packages.chatSend')}
          </button>
        )}
      </div>
    </div>
  )
}
