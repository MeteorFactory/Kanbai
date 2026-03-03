import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useDatabaseStore } from '../lib/stores/databaseStore'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import { DatabaseSidebar } from './DatabaseSidebar'
import { DatabaseQueryArea } from './DatabaseQueryArea'
import { DatabaseConnectionModal } from './DatabaseConnectionModal'
import type { DbConnection, DbTable, DbBackupEntry, DbBackupLogEntry } from '../../shared/types'

export function DatabaseExplorer() {
  const { t } = useI18n()
  const { activeWorkspaceId } = useWorkspaceStore()
  const { pendingDbProjectPath, setPendingDbProjectPath } = useViewStore()

  const {
    connectionsByWorkspace,
    activeConnectionId,
    connectionStatuses,
    loading,
    loadConnections,
    addConnection,
    updateConnection,
    deleteConnection,
    setActiveConnection,
    connectDb,
    disconnectDb,
    reorderConnections,
  } = useDatabaseStore()

  // Get connections for the active workspace
  const connections = useMemo(
    () => (activeWorkspaceId ? connectionsByWorkspace[activeWorkspaceId] ?? [] : []),
    [activeWorkspaceId, connectionsByWorkspace],
  )

  // Modal state
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [editingConnection, setEditingConnection] = useState<DbConnection | null>(null)

  // Query state (lifted to share with sidebar table clicks)
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)

  // Log panel state
  const [logPanelOpen, setLogPanelOpen] = useState(false)
  const { backupLogs, appendBackupLog, clearBackupLogs } = useDatabaseStore()

  // Load connections when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return
    loadConnections(activeWorkspaceId)
  }, [activeWorkspaceId, loadConnections])

  // Auto-open modal if pending DB project path is set
  useEffect(() => {
    if (pendingDbProjectPath && activeWorkspaceId) {
      setShowConnectionModal(true)
      setEditingConnection(null)
      setPendingDbProjectPath(null)
    }
  }, [pendingDbProjectPath, activeWorkspaceId, setPendingDbProjectPath])

  // Subscribe to backup log events
  useEffect(() => {
    const unsubscribe = window.kanbai.database.onBackupLog((entry: DbBackupLogEntry) => {
      appendBackupLog(entry)
      setLogPanelOpen(true)
    })
    return () => { unsubscribe() }
  }, [appendBackupLog])

  // Connection management
  const handleAddConnection = useCallback(() => {
    setEditingConnection(null)
    setShowConnectionModal(true)
  }, [])

  const handleEditConnection = useCallback((connection: DbConnection) => {
    setEditingConnection(connection)
    setShowConnectionModal(true)
  }, [])

  const handleSaveConnection = useCallback(
    (connection: DbConnection) => {
      if (editingConnection) {
        updateConnection(connection)
      } else {
        addConnection(connection)
      }
      setShowConnectionModal(false)
      setEditingConnection(null)
    },
    [editingConnection, addConnection, updateConnection],
  )

  const handleSelectTable = useCallback(
    (table: DbTable, schema?: string) => {
      if (!activeConnectionId) return
      const conn = connections.find((c) => c.id === activeConnectionId)
      if (!conn) return

      let query: string
      if (conn.engine === 'mongodb') {
        query = `db.${table.name}.find().limit(100)`
      } else {
        const quotedTable = schema
          ? `"${schema}"."${table.name}"`
          : `"${table.name}"`
        query = `SELECT * FROM ${quotedTable}`
      }
      setPendingQuery(query)
    },
    [activeConnectionId, connections],
  )

  const handleBackup = useCallback(
    async (id: string) => {
      const conn = connections.find((c) => c.id === id)
      if (!conn) return
      try {
        const result = await window.kanbai.database.backup(id, conn.name, conn.config, undefined, conn.environmentTag)
        if (result.success) {
          window.kanbai.notify(t('db.backup'), t('db.backupSuccess').replace('{path}', result.filePath || ''))
        } else {
          window.kanbai.notify(t('db.backup'), t('db.backupError').replace('{error}', result.error || ''))
        }
      } catch (err) {
        window.kanbai.notify(t('db.backup'), t('db.backupError').replace('{error}', String(err)))
      }
    },
    [connections, t],
  )

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!activeWorkspaceId) return
      reorderConnections(activeWorkspaceId, fromIndex, toIndex)
    },
    [activeWorkspaceId, reorderConnections],
  )

  const handleDeleteBackup = useCallback(
    async (connectionId: string, backupId: string) => {
      try {
        await window.kanbai.database.backupDelete(connectionId, backupId)
      } catch {
        // Delete error handled silently
      }
    },
    [],
  )

  const handleRestoreBackup = useCallback(
    async (entry: DbBackupEntry, targetConnection: DbConnection) => {
      try {
        const result = await window.kanbai.database.restore(entry, targetConnection.config)
        if (result.success) {
          const msg = result.warnings
            ? t('db.restoreSuccessWarnings').replace('{count}', String(result.warnings))
            : t('db.restoreSuccess')
          window.kanbai.notify(t('common.restore'), msg)
        } else {
          window.kanbai.notify(t('common.restore'), t('db.restoreError').replace('{error}', result.error || ''))
        }
      } catch (err) {
        window.kanbai.notify(t('common.restore'), t('db.restoreError').replace('{error}', String(err)))
      }
    },
    [t],
  )

  // Get the active connection object
  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? null
  const activeStatus = activeConnectionId
    ? connectionStatuses[activeConnectionId] ?? 'disconnected'
    : 'disconnected'

  // No workspace state
  if (!activeWorkspaceId) {
    return (
      <div className="db-panel">
        <div className="db-no-project">{t('db.selectProject')}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="db-panel">
        <div className="db-no-project">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="db-panel">
      <div className="db-panel-body">
        <DatabaseSidebar
          connections={connections}
          activeConnectionId={activeConnectionId}
          connectionStatuses={connectionStatuses}
          onSelectConnection={setActiveConnection}
          onAddConnection={handleAddConnection}
          onEditConnection={handleEditConnection}
          onDeleteConnection={deleteConnection}
          onConnect={connectDb}
          onDisconnect={disconnectDb}
          onSelectTable={handleSelectTable}
          onBackup={handleBackup}
          onDeleteBackup={handleDeleteBackup}
          onRestoreBackup={handleRestoreBackup}
          onReorder={handleReorder}
        />

        <DatabaseQueryArea
          connection={activeConnection}
          connectionStatus={activeStatus}
          pendingQuery={pendingQuery}
          onPendingQueryConsumed={() => setPendingQuery(null)}
        />
      </div>

      {/* Log toggle bar */}
      <div
        className="db-log-toggle"
        onClick={() => setLogPanelOpen((v) => !v)}
      >
        <span className={`db-tree-toggle${logPanelOpen ? ' db-tree-toggle--open' : ''}`}>&#9654;</span>
        <span>{t('db.logs')}</span>
        {backupLogs.length > 0 && (
          <span className="db-tree-count">{backupLogs.length}</span>
        )}
        {backupLogs.length > 0 && (
          <button
            className="db-log-clear-btn"
            onClick={(e) => { e.stopPropagation(); clearBackupLogs() }}
            title="Clear"
          >
            &times;
          </button>
        )}
      </div>

      {/* Log panel */}
      {logPanelOpen && (
        <DatabaseLogPanel logs={backupLogs} emptyMessage={t('db.logEmpty')} />
      )}

      {showConnectionModal && activeWorkspaceId && (
        <DatabaseConnectionModal
          connection={editingConnection}
          workspaceId={activeWorkspaceId}
          onSave={handleSaveConnection}
          onClose={() => {
            setShowConnectionModal(false)
            setEditingConnection(null)
          }}
        />
      )}
    </div>
  )
}

function DatabaseLogPanel({ logs, emptyMessage }: { logs: DbBackupLogEntry[]; emptyMessage: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length])

  const logTypeClass = (type: DbBackupLogEntry['type']): string => {
    switch (type) {
      case 'command': return 'db-log-entry db-log-entry--command'
      case 'stderr': return 'db-log-entry db-log-entry--stderr'
      case 'error': return 'db-log-entry db-log-entry--error'
      case 'success': return 'db-log-entry db-log-entry--success'
      default: return 'db-log-entry'
    }
  }

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  if (logs.length === 0) {
    return (
      <div className="db-log-panel" ref={scrollRef}>
        <div className="db-log-empty">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="db-log-panel" ref={scrollRef}>
      {logs.map((entry, i) => (
        <div key={i} className={logTypeClass(entry.type)}>
          <span className="db-log-time">{formatTime(entry.timestamp)}</span>
          <span className="db-log-op">[{entry.operation}]</span>
          {entry.connectionName && <span className="db-log-conn">{entry.connectionName}</span>}
          <span className="db-log-msg">{entry.message}</span>
        </div>
      ))}
    </div>
  )
}
