import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { useDatabaseStore } from '../../database-store'
import { useWorkspaceStore } from '../../../../lib/stores/workspaceStore'
import { AI_PROVIDERS } from '../../../../../shared/types/ai-provider'
import type { AiProviderId } from '../../../../../shared/types/ai-provider'
import { resolveFeatureProvider } from '../../../../../shared/utils/ai-provider-resolver'
import type {
  DbConnection,
  DbConnectionStatus,
  DbNlMessage,
  DbNlPermissions,
  DbNlHistoryEntry,
  DbQueryResult,
} from '../../../../../shared/types'

interface DatabaseNLChatProps {
  connection: DbConnection | null
  connectionStatus: DbConnectionStatus
  onCopyToEditor: (sql: string) => void
  onExecuteFromChat: (sql: string) => Promise<DbQueryResult | null>
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function DatabaseNLChat({
  connection,
  connectionStatus,
  onCopyToEditor,
  onExecuteFromChat,
}: DatabaseNLChatProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    nlMessages,
    nlLoading,
    addNlMessage,
    setNlLoading,
    clearNlMessages,
  } = useDatabaseStore()

  const connectionId = connection?.id ?? ''
  const messages = useMemo(() => nlMessages[connectionId] ?? [], [nlMessages, connectionId])
  const isLoading = nlLoading[connectionId] ?? false
  const { activeProjectId, activeWorkspaceId, projects, workspaces } = useWorkspaceStore()
  const dbProvider: AiProviderId = useMemo(() => {
    const p = projects.find((proj) => proj.id === activeProjectId)
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    return resolveFeatureProvider('database', p, ws)
  }, [activeProjectId, activeWorkspaceId, projects, workspaces])
  const dbProviderConfig = AI_PROVIDERS[dbProvider]

  // Get permissions from connection (default: read-only)
  const permissions: DbNlPermissions = useMemo(() => connection?.nlPermissions ?? {
    canRead: true,
    canUpdate: false,
    canDelete: false,
  }, [connection?.nlPermissions])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isLoading])

  const handleCancel = useCallback(async () => {
    if (!connectionId) return
    try {
      await window.kanbai.database.nlCancel(connectionId)
    } catch {
      // Ignore cancel errors
    }
    setNlLoading(connectionId, false)
  }, [connectionId, setNlLoading])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !connection || connectionStatus !== 'connected' || isLoading) return

    const userQuestion = input.trim()
    const userMessage: DbNlMessage = {
      id: generateId(),
      role: 'user',
      content: userQuestion,
      timestamp: Date.now(),
    }
    addNlMessage(connectionId, userMessage)
    setInput('')
    setNlLoading(connectionId, true)

    try {
      // Build conversation history from existing messages (exclude errors)
      const history: DbNlHistoryEntry[] = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          sql: m.sql,
        }))

      // Resolve AI provider from project/workspace defaults
      const { activeProjectId, activeWorkspaceId, projects, workspaces } = useWorkspaceStore.getState()
      const activeProject = projects.find((p) => p.id === activeProjectId)
      const ws = workspaces.find((w) => w.id === activeWorkspaceId)
      const dbProvider = resolveFeatureProvider('database', activeProject, ws)

      // Step 1: Generate SQL
      const genResponse = await window.kanbai.database.nlGenerateSql(
        connectionId,
        userQuestion,
        permissions,
        history,
        dbProvider,
      )

      if (!genResponse.success || !genResponse.sql) {
        addNlMessage(connectionId, {
          id: generateId(),
          role: 'error',
          content: genResponse.error || t('db.nlError'),
          timestamp: Date.now(),
        })
        return
      }

      // Step 2: Execute SQL
      let sql = genResponse.sql
      let result = await onExecuteFromChat(sql)

      // Step 2b: Retry on execution error (syntax, column not found, etc.)
      if (result?.error) {
        const retryHistory: DbNlHistoryEntry[] = [
          ...history,
          { role: 'user', content: userQuestion },
          { role: 'assistant', content: genResponse.explanation || '', sql },
        ]

        const retryResponse = await window.kanbai.database.nlGenerateSql(
          connectionId,
          `The previous query failed with error: "${result.error}". Fix the SQL query. Original question: ${userQuestion}`,
          permissions,
          retryHistory,
          dbProvider,
        )

        if (retryResponse.success && retryResponse.sql) {
          sql = retryResponse.sql
          result = await onExecuteFromChat(sql)
        }
      }

      // If still error after retry, show error
      if (!result || result.error) {
        addNlMessage(connectionId, {
          id: generateId(),
          role: 'error',
          content: result?.error || 'Erreur lors de l\'execution de la requete.',
          sql,
          timestamp: Date.now(),
        })
        return
      }

      // Step 3: Interpret results (human answer or refinement)
      const interpretResponse = await window.kanbai.database.nlInterpret({
        connectionId,
        question: userQuestion,
        sql,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        history,
        provider: dbProvider,
      })

      // Step 3b: Claude suggested a refined query — execute it and re-interpret
      if (interpretResponse.success && interpretResponse.refinedSql) {
        const refinedSql = interpretResponse.refinedSql
        const refinedResult = await onExecuteFromChat(refinedSql)

        if (refinedResult && !refinedResult.error) {
          sql = refinedSql

          const reinterpret = await window.kanbai.database.nlInterpret({
            connectionId,
            question: userQuestion,
            sql: refinedSql,
            columns: refinedResult.columns,
            rows: refinedResult.rows,
            rowCount: refinedResult.rowCount,
            history,
            provider: dbProvider,
          })

          addNlMessage(connectionId, {
            id: generateId(),
            role: 'assistant',
            content: reinterpret.answer || `${refinedResult.rowCount} resultat(s).`,
            sql,
            timestamp: Date.now(),
          })
          return
        }
      }

      // Normal case: Claude gave a direct answer
      addNlMessage(connectionId, {
        id: generateId(),
        role: 'assistant',
        content: interpretResponse.answer || `${result.rowCount} resultat(s).`,
        sql,
        timestamp: Date.now(),
      })
    } catch (err) {
      addNlMessage(connectionId, {
        id: generateId(),
        role: 'error',
        content: String(err),
        timestamp: Date.now(),
      })
    } finally {
      setNlLoading(connectionId, false)
    }
  }, [input, connection, connectionId, connectionStatus, isLoading, permissions, messages, addNlMessage, setNlLoading, onExecuteFromChat, t])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // Not connected state
  if (!connection) {
    return (
      <div className="db-nl-chat">
        <div className="db-nl-empty">{t('db.selectConnection')}</div>
      </div>
    )
  }

  if (connectionStatus !== 'connected') {
    return (
      <div className="db-nl-chat">
        <div className="db-nl-empty">{t('db.connectFirst')}</div>
      </div>
    )
  }

  return (
    <div className="db-nl-chat">
      {/* Messages area */}
      <div className="db-nl-messages">
        {messages.length === 0 && !isLoading && (
          <div className="db-nl-empty">{t('db.nlNoMessages')}</div>
        )}

        {messages.map((msg) => (
          <NLChatMessage
            key={msg.id}
            message={msg}
            providerName={dbProviderConfig.displayName}
            providerColor={dbProviderConfig.detectionColor}
            onCopyToEditor={onCopyToEditor}
          />
        ))}

        {isLoading && (
          <div className="db-nl-message db-nl-message--loading">
            <div className="db-nl-message-content">
              <span className="db-nl-spinner" />
              {t('db.nlGenerating')}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="db-nl-input-area">
        {messages.length > 0 && (
          <button
            className="db-nl-clear-btn"
            onClick={() => clearNlMessages(connectionId)}
            title="Clear"
          >
            &times;
          </button>
        )}
        <input
          ref={inputRef}
          className="db-nl-input"
          type="text"
          placeholder={t('db.nlPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        {isLoading ? (
          <button
            className="db-nl-send-btn db-nl-send-btn--cancel"
            onClick={handleCancel}
          >
            {t('db.nlCancel')}
          </button>
        ) : (
          <button
            className="db-nl-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            {t('db.nlSend')}
          </button>
        )}
      </div>
    </div>
  )
}

function NLChatMessage({
  message,
  providerName,
  providerColor,
  onCopyToEditor,
}: {
  message: DbNlMessage
  providerName: string
  providerColor: string
  onCopyToEditor: (sql: string) => void
}) {
  const isAssistant = message.role === 'assistant'
  const roleClass = message.role === 'user'
    ? 'db-nl-message--user'
    : message.role === 'error'
      ? 'db-nl-message--error'
      : 'db-nl-message--assistant'
  const msgStyle = isAssistant
    ? { borderLeftColor: providerColor, background: `${providerColor}0a` } as React.CSSProperties
    : undefined

  return (
    <div className={`db-nl-message ${roleClass}`} style={msgStyle}>
      <div className="db-nl-message-header">
        <span className="db-nl-message-role">
          {message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : providerName}
        </span>
        <span className="db-nl-message-time">
          {new Date(message.timestamp).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="db-nl-message-content">{message.content}</div>

      {/* Small SQL reference link (not the full block) */}
      {message.sql && message.role === 'assistant' && (
        <button
          className="db-nl-sql-link"
          onClick={() => onCopyToEditor(message.sql!)}
          title="Voir la requete dans l'editeur"
        >
          SQL
        </button>
      )}
    </div>
  )
}
