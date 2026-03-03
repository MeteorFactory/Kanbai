import { useEffect, useCallback, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useI18n } from '../lib/i18n'
import { DatabaseResultsTable } from './DatabaseResultsTable'
import { DatabaseNLChat } from './DatabaseNLChat'
import { ResizeDivider } from './ResizeDivider'
import { DatabaseTabBar } from './DatabaseTabBar'
import { CopyableError } from './CopyableError'
import { useDatabaseTabStore } from '../lib/stores/databaseTabStore'
import type {
  DbConnection,
  DbConnectionStatus,
  DbQueryResult,
  DbEnvironmentTag,
} from '../../shared/types'

interface DatabaseQueryAreaProps {
  connection: DbConnection | null
  connectionStatus: DbConnectionStatus
  pendingQuery: string | null
  onPendingQueryConsumed: () => void
}

const ENV_TAG_COLORS: Record<DbEnvironmentTag, string> = {
  local: '#a6e3a1',
  dev: '#89b4fa',
  int: '#fab387',
  qua: '#cba6f7',
  prd: '#f38ba8',
  custom: 'var(--text-muted)',
}

const LIMIT_OPTIONS = [50, 100, 250, 500, 1000]

const PANEL_MIN_HEIGHT = 80
const PANEL_MAX_RATIO = 0.6
const PANEL_FALLBACK_MAX = 400

export function clampPanelHeight(
  current: number,
  delta: number,
  containerHeight: number | null,
): number {
  const maxH = containerHeight ? containerHeight * PANEL_MAX_RATIO : PANEL_FALLBACK_MAX
  return Math.min(Math.max(current + delta, PANEL_MIN_HEIGHT), maxH)
}

function getStatusLabel(status: DbConnectionStatus, t: (key: string) => string): string {
  switch (status) {
    case 'connected':
      return t('db.statusConnected')
    case 'connecting':
      return t('db.connecting')
    case 'error':
      return t('db.connectionError')
    default:
      return t('db.statusDisconnected')
  }
}

function getStatusColor(status: DbConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'var(--success)'
    case 'connecting':
      return 'var(--warning)'
    case 'error':
      return 'var(--danger)'
    default:
      return 'var(--text-muted)'
  }
}

function exportToCsv(result: DbQueryResult): void {
  if (!result || result.columns.length === 0) return

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const header = result.columns.map(escape).join(',')
  const rows = result.rows.map((row) =>
    result.columns.map((col) => escape(row[col])).join(','),
  )
  const csv = [header, ...rows].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `query-results-${Date.now()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function DatabaseQueryArea({
  connection,
  connectionStatus,
  pendingQuery,
  onPendingQueryConsumed,
}: DatabaseQueryAreaProps) {
  const { t } = useI18n()

  const {
    tabsByConnection,
    activeTabByConnection,
    ensureTab,
    createTab,
    updateTabQuery,
    updateTabResults,
    updateTabExecuting,
    updateTabLimit,
    updateTabPage,
  } = useDatabaseTabStore()

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [editorHeight, setEditorHeight] = useState(150)
  const [chatHeight, setChatHeight] = useState(200)

  const handleEditorResize = useCallback(
    (deltaY: number) => {
      const ch = containerRef.current?.clientHeight ?? null
      setEditorHeight((h) => clampPanelHeight(h, deltaY, ch))
    },
    [],
  )

  const handleChatResize = useCallback(
    (deltaY: number) => {
      const ch = containerRef.current?.clientHeight ?? null
      setChatHeight((h) => clampPanelHeight(h, -deltaY, ch))
    },
    [],
  )

  const connectionId = connection?.id ?? ''
  const tabs = tabsByConnection[connectionId] ?? []
  const activeTabId = activeTabByConnection[connectionId] ?? ''
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Ensure a default tab exists when connection is set
  useEffect(() => {
    if (connectionId) {
      ensureTab(connectionId)
    }
  }, [connectionId, ensureTab])

  // Handle pending query from sidebar table click — create a new tab
  useEffect(() => {
    if (pendingQuery && connectionId) {
      const newTabId = createTab(connectionId)
      updateTabQuery(connectionId, newTabId, pendingQuery)
      onPendingQueryConsumed()
      if (connectionStatus === 'connected' && connection) {
        executeWithParams(pendingQuery, 100, 0, newTabId)
      }
    }
  }, [pendingQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const executeWithParams = useCallback(
    async (sql: string, queryLimit: number, queryOffset: number, tabId?: string) => {
      if (!connection || connectionStatus !== 'connected' || !sql.trim()) return
      const tid = tabId ?? activeTabId
      if (!tid) return

      updateTabExecuting(connectionId, tid, true)
      try {
        const result = await window.kanbai.database.executeQuery(
          connection.id,
          sql,
          queryLimit,
          queryOffset,
        )
        updateTabResults(connectionId, tid, result)
      } catch (err) {
        updateTabResults(connectionId, tid, {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: 0,
          error: String(err),
        })
      } finally {
        updateTabExecuting(connectionId, tid, false)
      }
    },
    [connection, connectionStatus, connectionId, activeTabId, updateTabExecuting, updateTabResults],
  )

  const handleExecute = useCallback(() => {
    if (!activeTab) return
    updateTabPage(connectionId, activeTabId, 0)
    executeWithParams(activeTab.query, activeTab.limit, 0)
  }, [activeTab, connectionId, activeTabId, updateTabPage, executeWithParams])

  const handleCancelQuery = useCallback(async () => {
    if (!connection) return
    try {
      await window.kanbai.database.cancelQuery(connection.id)
    } catch {
      // Ignore cancel errors
    }
    if (activeTabId) {
      updateTabExecuting(connectionId, activeTabId, false)
    }
  }, [connection, connectionId, activeTabId, updateTabExecuting])

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (!activeTab) return
      updateTabPage(connectionId, activeTabId, newPage)
      executeWithParams(activeTab.query, activeTab.limit, newPage * activeTab.limit)
    },
    [activeTab, connectionId, activeTabId, updateTabPage, executeWithParams],
  )

  const handleExportCsv = useCallback(() => {
    if (activeTab?.results) {
      exportToCsv(activeTab.results)
    }
  }, [activeTab])

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance

      // Add Cmd+Enter shortcut
      editorInstance.addCommand(
        2048 | 3, // KeyMod.CtrlCmd | KeyCode.Enter
        () => {
          handleExecute()
        },
      )
    },
    [handleExecute],
  )

  // Handle NL chat copy to editor: paste SQL and focus editor
  const handleCopyToEditor = useCallback(
    (sql: string) => {
      if (!connectionId) return
      const tid = activeTabId || ensureTab(connectionId)
      updateTabQuery(connectionId, tid, sql)
      setTimeout(() => {
        editorRef.current?.focus()
      }, 50)
    },
    [connectionId, activeTabId, ensureTab, updateTabQuery],
  )

  // Handle NL chat execute: place SQL in editor, execute, and return results
  const handleExecuteFromChat = useCallback(
    async (sql: string): Promise<DbQueryResult | null> => {
      if (!connection || connectionStatus !== 'connected' || !sql.trim()) return null
      const tid = activeTabId || ensureTab(connectionId)
      updateTabQuery(connectionId, tid, sql)
      updateTabExecuting(connectionId, tid, true)
      try {
        const result = await window.kanbai.database.executeQuery(connection.id, sql, 100, 0)
        updateTabResults(connectionId, tid, result)
        return result
      } catch (err) {
        const errorResult: DbQueryResult = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: 0,
          error: String(err),
        }
        updateTabResults(connectionId, tid, errorResult)
        return errorResult
      } finally {
        updateTabExecuting(connectionId, tid, false)
      }
    },
    [connection, connectionStatus, connectionId, activeTabId, ensureTab, updateTabQuery, updateTabExecuting, updateTabResults],
  )

  // Determine editor language based on engine
  const editorLanguage = connection?.engine === 'mongodb' ? 'json' : 'sql'

  // No connection selected
  if (!connection) {
    return (
      <div className="db-query-area">
        <div className="db-query-empty">{t('db.selectConnection')}</div>
      </div>
    )
  }

  const tagColor =
    connection.environmentTag === 'custom'
      ? 'var(--text-muted)'
      : ENV_TAG_COLORS[connection.environmentTag]
  const tagLabel =
    connection.environmentTag === 'custom'
      ? connection.customTagName ?? 'custom'
      : connection.environmentTag

  const query = activeTab?.query ?? ''
  const results = activeTab?.results ?? null
  const executing = activeTab?.executing ?? false
  const limit = activeTab?.limit ?? 100
  const page = activeTab?.page ?? 0

  return (
    <div className="db-query-area" ref={containerRef}>
      {/* Toolbar */}
      <div className="db-query-toolbar">
        <div className="db-query-toolbar-left">
          <span className="db-query-conn-name">{connection.name}</span>
          <span
            className="db-query-status-badge"
            style={{
              color: getStatusColor(connectionStatus),
              borderColor: getStatusColor(connectionStatus),
            }}
          >
            {getStatusLabel(connectionStatus, t)}
          </span>
          <span
            className="db-env-badge"
            style={{ background: tagColor, color: '#1e1e2e' }}
          >
            {tagLabel}
          </span>
        </div>
        <div className="db-query-toolbar-right">
          <select
            className="db-limit-select"
            value={limit}
            onChange={(e) => {
              if (activeTabId) updateTabLimit(connectionId, activeTabId, Number(e.target.value))
            }}
          >
            {LIMIT_OPTIONS.map((l) => (
              <option key={l} value={l}>
                LIMIT {l}
              </option>
            ))}
          </select>
          {executing ? (
            <button className="db-execute-btn db-execute-btn--cancel" onClick={handleCancelQuery}>
              {t('db.cancel')}
            </button>
          ) : (
            <button
              className="db-execute-btn"
              onClick={handleExecute}
              disabled={connectionStatus !== 'connected' || !query.trim()}
              title="Cmd+Enter"
            >
              {t('db.execute')}
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <DatabaseTabBar connectionId={connectionId} />

      {/* Row 1: SQL Editor */}
      <div className="db-editor-container" style={{ height: editorHeight }}>
        <Editor
          key={activeTabId}
          height={editorHeight + 'px'}
          language={editorLanguage}
          value={query}
          onChange={(value) => {
            if (activeTabId) updateTabQuery(connectionId, activeTabId, value ?? '')
          }}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'line',
            suggestOnTriggerCharacters: true,
            tabSize: 2,
          }}
        />
      </div>

      <ResizeDivider onResize={handleEditorResize} />

      {/* Row 2: Results */}
      <div className="db-results-container">
        {executing && (
          <div className="db-results-loading">{t('db.executing')}</div>
        )}

        {!executing && results?.error && (
          <div className="db-results-error">
            <span className="db-results-error-label">{t('db.queryError')}</span>
            <div className="db-results-error-message">
              <CopyableError error={results.error} />
            </div>
          </div>
        )}

        {!executing && results && !results.error && (
          <DatabaseResultsTable
            result={results}
            page={page}
            limit={limit}
            onPageChange={handlePageChange}
            onExportCsv={handleExportCsv}
          />
        )}

        {!executing && !results && (
          <div className="db-results-placeholder">
            {connectionStatus === 'connected'
              ? t('db.writeQuery')
              : t('db.connectFirst')}
          </div>
        )}
      </div>

      <ResizeDivider onResize={handleChatResize} />

      {/* Row 3: NL Chat */}
      <div style={{ height: chatHeight, flexShrink: 0 }}>
        <DatabaseNLChat
          connection={connection}
          connectionStatus={connectionStatus}
          onCopyToEditor={handleCopyToEditor}
          onExecuteFromChat={handleExecuteFromChat}
        />
      </div>
    </div>
  )
}
