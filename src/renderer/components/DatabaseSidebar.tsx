import { useState, useEffect, useCallback, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import type {
  DbConnection,
  DbConnectionStatus,
  DbTable,
  DbEnvironmentTag,
  DbBackupEntry,
} from '../../shared/types'

interface DatabaseSidebarProps {
  connections: DbConnection[]
  activeConnectionId: string | null
  connectionStatuses: Record<string, DbConnectionStatus>
  onSelectConnection: (id: string) => void
  onAddConnection: () => void
  onEditConnection: (connection: DbConnection) => void
  onDeleteConnection: (id: string) => void
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onSelectTable: (table: DbTable, schema?: string) => void
  onBackup: (id: string) => Promise<void>
  onDeleteBackup: (connectionId: string, backupId: string) => void
  onRestoreBackup: (entry: DbBackupEntry, targetConnection: DbConnection) => Promise<void>
  onReorder: (fromIndex: number, toIndex: number) => void
}

interface TreeNode {
  databases: string[]
  schemas: Map<string, DbTable[]>
  tables: DbTable[]
  loadingDatabases: boolean
  loadingSchemas: boolean
  loadingTables: boolean
}

const ENV_TAG_COLORS: Record<DbEnvironmentTag, string> = {
  local: '#a6e3a1',
  dev: '#89b4fa',
  int: '#fab387',
  qua: '#cba6f7',
  prd: '#f38ba8',
  custom: 'var(--text-muted)',
}

function getStatusDotClass(status: DbConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'db-status-dot db-status-dot--connected'
    case 'connecting':
      return 'db-status-dot db-status-dot--connecting'
    case 'error':
      return 'db-status-dot db-status-dot--error'
    default:
      return 'db-status-dot'
  }
}

function getEngineLabel(engine: string): string {
  const labels: Record<string, string> = {
    postgresql: 'PG',
    mysql: 'MY',
    mssql: 'MS',
    mongodb: 'MG',
    sqlite: 'SQ',
  }
  return labels[engine] ?? engine.toUpperCase().slice(0, 2)
}

export function DatabaseSidebar({
  connections,
  activeConnectionId,
  connectionStatuses,
  onSelectConnection,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
  onConnect,
  onDisconnect,
  onSelectTable,
  onBackup,
  onDeleteBackup,
  onRestoreBackup,
  onReorder,
}: DatabaseSidebarProps) {
  const { t } = useI18n()

  // Drag & drop state
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    const target = e.currentTarget as HTMLElement
    target.classList.add('db-connection-item--dragging')
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    target.classList.remove('db-connection-item--dragging')
    dragIndexRef.current = null
    setDragOverIndex(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
      setDragOverIndex(index)
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex)
    }
    dragIndexRef.current = null
    setDragOverIndex(null)
  }, [onReorder])

  // Tree state per connection
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set())
  const [expandedSchemas, setExpandedSchemas] = useState<Map<string, Set<string>>>(new Map())
  const [treeData, setTreeData] = useState<Map<string, TreeNode>>(new Map())

  // Backup state per connection
  const [backupsByConnection, setBackupsByConnection] = useState<Record<string, DbBackupEntry[]>>({})
  const [_expandedBackups, setExpandedBackups] = useState<Set<string>>(new Set())
  const [backingUp, setBackingUp] = useState<Set<string>>(new Set())
  const [restoring, setRestoring] = useState<string | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    connectionId: string
  } | null>(null)

  // Backup context menu state
  const [backupContextMenu, setBackupContextMenu] = useState<{
    x: number
    y: number
    entry: DbBackupEntry
  } | null>(null)

  // Load tree data when connection is expanded and connected
  const loadTreeForConnection = useCallback(
    async (connectionId: string) => {
      const status = connectionStatuses[connectionId]
      if (status !== 'connected') return

      // Initialize tree node
      setTreeData((prev) => {
        const next = new Map(prev)
        next.set(connectionId, {
          databases: [],
          schemas: new Map(),
          tables: [],
          loadingDatabases: true,
          loadingSchemas: false,
          loadingTables: false,
        })
        return next
      })

      try {
        // Try loading schemas first (PostgreSQL, MSSQL)
        const schemas = await window.kanbai.database.listSchemas(connectionId)
        if (schemas.length > 0) {
          setTreeData((prev) => {
            const next = new Map(prev)
            const node = next.get(connectionId)
            if (node) {
              next.set(connectionId, {
                ...node,
                loadingDatabases: false,
              })
            }
            return next
          })

          // Load tables for each schema
          for (const schema of schemas) {
            try {
              const tables = await window.kanbai.database.listTables(connectionId, schema)
              setTreeData((prev) => {
                const next = new Map(prev)
                const node = next.get(connectionId)
                if (node) {
                  const newSchemas = new Map(node.schemas)
                  newSchemas.set(schema, tables)
                  next.set(connectionId, { ...node, schemas: newSchemas })
                }
                return next
              })
            } catch {
              // Schema loading failed silently
            }
          }
        } else {
          // Flat table list (MySQL, SQLite, MongoDB)
          const tables = await window.kanbai.database.listTables(connectionId)
          setTreeData((prev) => {
            const next = new Map(prev)
            const node = next.get(connectionId)
            if (node) {
              next.set(connectionId, {
                ...node,
                tables,
                loadingDatabases: false,
              })
            }
            return next
          })
        }
      } catch {
        setTreeData((prev) => {
          const next = new Map(prev)
          const node = next.get(connectionId)
          if (node) {
            next.set(connectionId, { ...node, loadingDatabases: false })
          }
          return next
        })
      }
    },
    [connectionStatuses],
  )

  // Load backups for a connection
  const loadBackupsForConnection = useCallback(async (connectionId: string) => {
    try {
      const result = await window.kanbai.database.backupList(connectionId)
      if (result.success) {
        setBackupsByConnection((prev) => ({ ...prev, [connectionId]: result.entries }))
      }
    } catch {
      // Ignore backup list errors
    }
  }, [])

  // Toggle connection expansion
  const toggleConnection = useCallback(
    (connectionId: string) => {
      setExpandedConnections((prev) => {
        const next = new Set(prev)
        if (next.has(connectionId)) {
          next.delete(connectionId)
        } else {
          next.add(connectionId)
          // Load tree data if connected and not loaded yet
          if (!treeData.has(connectionId)) {
            loadTreeForConnection(connectionId)
          }
          // Auto-load backups
          if (!backupsByConnection[connectionId]) {
            loadBackupsForConnection(connectionId)
          }
        }
        return next
      })
    },
    [treeData, loadTreeForConnection, backupsByConnection, loadBackupsForConnection],
  )

  // Toggle schema expansion
  const toggleSchema = useCallback((connectionId: string, schema: string) => {
    setExpandedSchemas((prev) => {
      const next = new Map(prev)
      const connSchemas = new Set(next.get(connectionId) ?? [])
      if (connSchemas.has(schema)) {
        connSchemas.delete(schema)
      } else {
        connSchemas.add(schema)
      }
      next.set(connectionId, connSchemas)
      return next
    })
  }, [])

  // Reload tree data when connection status changes to connected
  useEffect(() => {
    for (const [id, status] of Object.entries(connectionStatuses)) {
      if (status === 'connected' && expandedConnections.has(id) && !treeData.has(id)) {
        loadTreeForConnection(id)
      }
    }
  }, [connectionStatuses, expandedConnections, treeData, loadTreeForConnection])

  // Backup context menu handler
  const handleBackupContextMenu = useCallback((e: React.MouseEvent, entry: DbBackupEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setBackupContextMenu({ x: e.clientX, y: e.clientY, entry })
  }, [])

  const getBackupContextMenuItems = useCallback(
    (entry: DbBackupEntry): ContextMenuItem[] => {
      const items: ContextMenuItem[] = []

      // List all connected databases as restore targets
      const connectedConns = connections.filter(
        (c) => (connectionStatuses[c.id] ?? 'disconnected') === 'connected',
      )

      if (connectedConns.length > 0) {
        for (const conn of connectedConns) {
          items.push({
            label: restoring ? t('db.restoreInProgress') : `${t('db.restoreTo')} ${conn.name}`,
            action: () => {
              if (restoring) return
              setRestoring(entry.id)
              onRestoreBackup(entry, conn).finally(() => setRestoring(null))
            },
          })
        }
      } else {
        items.push({
          label: t('db.restoreTo'),
          action: () => {},
        })
      }

      items.push({ label: '', action: () => {}, separator: true })

      items.push({
        label: t('db.deleteBackup'),
        action: () => {
          onDeleteBackup(entry.connectionId, entry.id)
          setBackupsByConnection((prev) => ({
            ...prev,
            [entry.connectionId]: (prev[entry.connectionId] || []).filter((e) => e.id !== entry.id),
          }))
        },
        danger: true,
      })

      return items
    },
    [t, connections, connectionStatuses, onRestoreBackup, onDeleteBackup, restoring],
  )

  // Format backup date
  const formatBackupDate = useCallback((timestamp: number): string => {
    const d = new Date(timestamp)
    return d.toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [])

  // Format file size
  const formatSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, connectionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, connectionId })
  }, [])

  const getContextMenuItems = useCallback(
    (connectionId: string): ContextMenuItem[] => {
      const conn = connections.find((c) => c.id === connectionId)
      if (!conn) return []

      const status = connectionStatuses[connectionId] ?? 'disconnected'
      const items: ContextMenuItem[] = []

      if (status === 'connected') {
        items.push({
          label: t('db.disconnect'),
          action: () => onDisconnect(connectionId),
        })
        items.push({
          label: t('db.refreshTables'),
          action: () => {
            setTreeData((prev) => {
              const next = new Map(prev)
              next.delete(connectionId)
              return next
            })
            loadTreeForConnection(connectionId)
          },
        })
      } else {
        items.push({
          label: t('db.connect'),
          action: () => onConnect(connectionId),
        })
      }

      items.push({ label: '', action: () => {}, separator: true })

      items.push({
        label: t('common.edit'),
        action: () => onEditConnection(conn),
      })

      if (status === 'connected') {
        items.push({
          label: backingUp.has(connectionId) ? t('db.backupInProgress') : t('db.backup'),
          action: () => {
            if (backingUp.has(connectionId)) return
            setBackingUp((prev) => new Set(prev).add(connectionId))
            onBackup(connectionId).finally(() => {
              setBackingUp((prev) => {
                const next = new Set(prev)
                next.delete(connectionId)
                return next
              })
              // Auto-open backups section and refresh
              setExpandedBackups((prev) => new Set(prev).add(connectionId))
              loadBackupsForConnection(connectionId)
            })
          },
        })
      }

      items.push({ label: '', action: () => {}, separator: true })

      items.push({
        label: t('common.delete'),
        action: () => onDeleteConnection(connectionId),
        danger: true,
      })

      return items
    },
    [
      connections,
      connectionStatuses,
      t,
      onConnect,
      onDisconnect,
      onEditConnection,
      onDeleteConnection,
      onBackup,
      backingUp,
      loadTreeForConnection,
      loadBackupsForConnection,
    ],
  )

  const handleTableClick = useCallback(
    (connectionId: string, table: DbTable, schema?: string) => {
      onSelectConnection(connectionId)
      onSelectTable(table, schema)
    },
    [onSelectConnection, onSelectTable],
  )

  return (
    <div className="db-sidebar">
      <div className="db-sidebar-header">
        <h3>{t('db.title')}</h3>
        <button
          className="db-sidebar-add-btn"
          onClick={onAddConnection}
          title={t('db.addConnection')}
        >
          +
        </button>
      </div>

      <div className="db-sidebar-content">
        {connections.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
            {t('db.noConnections')}
          </div>
        )}

        {connections.map((conn, index) => {
          const status = connectionStatuses[conn.id] ?? 'disconnected'
          const isExpanded = expandedConnections.has(conn.id)
          const isActive = activeConnectionId === conn.id
          const node = treeData.get(conn.id)
          const tagColor =
            conn.environmentTag === 'custom'
              ? 'var(--text-muted)'
              : ENV_TAG_COLORS[conn.environmentTag]
          const tagLabel =
            conn.environmentTag === 'custom'
              ? conn.customTagName ?? 'custom'
              : conn.environmentTag
          const isDragOver = dragOverIndex === index

          return (
            <div
              key={conn.id}
              className={`db-connection-item${isDragOver ? ' db-connection-item--dragover' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
            >
              {/* Connection header */}
              <div
                className={`db-connection-header${isActive ? ' db-connection-header--active' : ''}`}
                onClick={() => {
                  onSelectConnection(conn.id)
                  toggleConnection(conn.id)
                }}
                onContextMenu={(e) => handleContextMenu(e, conn.id)}
                onDoubleClick={() => {
                  if (status !== 'connected') {
                    onConnect(conn.id)
                  }
                }}
              >
                <span className="db-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>
                <span
                  className={`db-tree-toggle${isExpanded ? ' db-tree-toggle--open' : ''}`}
                >
                  &#9654;
                </span>
                <span className={getStatusDotClass(status)} />
                <span className="db-connection-name">{conn.name}</span>
                <span
                  className="db-engine-badge"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                >
                  {getEngineLabel(conn.engine)}
                </span>
                <span
                  className="db-env-badge"
                  style={{
                    background: tagColor,
                    color: '#1e1e2e',
                  }}
                >
                  {tagLabel}
                </span>
                {backingUp.has(conn.id) && (
                  <span className="db-backup-indicator">{t('db.backupInProgress')}</span>
                )}
              </div>

              {/* Tree content */}
              {isExpanded && status === 'connected' && node && (
                <div className="db-tree">
                  {node.loadingDatabases && (
                    <div className="db-tree-loading">{t('common.loading')}</div>
                  )}

                  {/* Schema-based tree (PostgreSQL, MSSQL) */}
                  {node.schemas.size > 0 &&
                    Array.from(node.schemas.entries()).map(([schema, tables]) => {
                      const schemaExpanded =
                        expandedSchemas.get(conn.id)?.has(schema) ?? false
                      return (
                        <div key={schema} className="db-tree-schema">
                          <div
                            className="db-tree-schema-header"
                            onClick={() => toggleSchema(conn.id, schema)}
                          >
                            <span
                              className={`db-tree-toggle${schemaExpanded ? ' db-tree-toggle--open' : ''}`}
                            >
                              &#9654;
                            </span>
                            <span className="db-tree-schema-name">{schema}</span>
                            <span className="db-tree-count">{tables.length}</span>
                          </div>
                          {schemaExpanded &&
                            tables.map((table) => (
                              <div
                                key={`${schema}.${table.name}`}
                                className="db-tree-table"
                                onClick={() => handleTableClick(conn.id, table, schema)}
                                title={`${table.type}: ${schema}.${table.name}${table.rowCount != null ? ` (${table.rowCount} rows)` : ''}`}
                              >
                                <span className="db-tree-table-icon">
                                  {table.type === 'view' ? 'V' : table.type === 'collection' ? 'C' : 'T'}
                                </span>
                                <span className="db-tree-table-name">{table.name}</span>
                                {table.rowCount != null && (
                                  <span className="db-tree-count">{table.rowCount}</span>
                                )}
                              </div>
                            ))}
                        </div>
                      )
                    })}

                  {/* Flat table list (MySQL, SQLite, MongoDB) */}
                  {node.schemas.size === 0 &&
                    !node.loadingDatabases &&
                    node.tables.map((table) => (
                      <div
                        key={table.name}
                        className="db-tree-table"
                        onClick={() => handleTableClick(conn.id, table)}
                        title={`${table.type}: ${table.name}${table.rowCount != null ? ` (${table.rowCount} rows)` : ''}`}
                      >
                        <span className="db-tree-table-icon">
                          {table.type === 'view' ? 'V' : table.type === 'collection' ? 'C' : 'T'}
                        </span>
                        <span className="db-tree-table-name">{table.name}</span>
                        {table.rowCount != null && (
                          <span className="db-tree-count">{table.rowCount}</span>
                        )}
                      </div>
                    ))}

                  {/* No tables found */}
                  {!node.loadingDatabases &&
                    node.schemas.size === 0 &&
                    node.tables.length === 0 && (
                      <div className="db-tree-empty">{t('db.noTables')}</div>
                    )}
                </div>
              )}

              {/* Backup list section — always visible when expanded */}
              {isExpanded && (backupsByConnection[conn.id] || []).length > 0 && (
                <div className="db-tree">
                  <div className="db-tree-schema-header">
                    <span className="db-tree-toggle db-tree-toggle--open">&#9654;</span>
                    <span className="db-tree-schema-name">{t('db.backups')}</span>
                    <span className="db-tree-count">
                      {(backupsByConnection[conn.id] || []).length}
                    </span>
                  </div>
                  {(backupsByConnection[conn.id] || []).map((entry) => {
                    const entryTag = entry.environmentTag ?? conn.environmentTag
                    const entryTagLabel = entryTag === 'custom' ? (conn.customTagName ?? 'custom') : entryTag
                    const entryTagColor = entryTag === 'custom' ? 'var(--text-muted)' : ENV_TAG_COLORS[entryTag]
                    return (
                      <div
                        key={entry.id}
                        className={`db-backup-entry${restoring === entry.id ? ' db-backup-entry--restoring' : ''}`}
                        onContextMenu={(e) => handleBackupContextMenu(e, entry)}
                        title={entry.filePath}
                      >
                        <span className="db-backup-entry-icon">B</span>
                        <span className="db-backup-entry-name">
                          {restoring === entry.id ? t('db.restoreInProgress') : formatBackupDate(entry.timestamp)}
                        </span>
                        <span
                          className="db-env-badge db-env-badge--sm"
                          style={{ background: entryTagColor, color: '#1e1e2e' }}
                        >
                          {entryTagLabel}
                        </span>
                        <span className="db-backup-entry-size">
                          {formatSize(entry.size)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Not connected message */}
              {isExpanded && status !== 'connected' && (
                <div className="db-tree">
                  <div className="db-tree-empty">
                    {status === 'connecting'
                      ? t('db.connecting')
                      : status === 'error'
                        ? t('db.connectionError')
                        : t('db.notConnected')}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.connectionId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Backup context menu */}
      {backupContextMenu && (
        <ContextMenu
          x={backupContextMenu.x}
          y={backupContextMenu.y}
          items={getBackupContextMenuItems(backupContextMenu.entry)}
          onClose={() => setBackupContextMenu(null)}
        />
      )}
    </div>
  )
}
