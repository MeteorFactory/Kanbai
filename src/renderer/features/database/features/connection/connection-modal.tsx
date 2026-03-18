import { useState, useEffect, useCallback, useRef } from 'react'
import { useI18n } from '../../../../lib/i18n'
import { CopyableError } from '../../../../shared/ui/copyable-error'
import type {
  DbConnection,
  DbConnectionConfig,
  DbEngine,
  DbEnvironmentTag,
  DbNlPermissions,
} from '../../../../../shared/types'

interface DatabaseConnectionModalProps {
  connection: DbConnection | null // null = create mode
  workspaceId: string
  onSave: (connection: DbConnection) => void
  onClose: () => void
}

type ConnectionMode = 'uri' | 'params'

const ENGINE_OPTIONS: { value: DbEngine; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'sqlite', label: 'SQLite' },
]

const ENV_TAG_OPTIONS: { value: DbEnvironmentTag; labelKey: string; color: string }[] = [
  { value: 'local', labelKey: 'db.envLocal', color: '#20D4A0' },
  { value: 'dev', labelKey: 'db.envDev', color: '#4B9CFF' },
  { value: 'int', labelKey: 'db.envInt', color: '#F5A623' },
  { value: 'qua', labelKey: 'db.envQua', color: '#a78bfa' },
  { value: 'prd', labelKey: 'db.envPrd', color: '#F4585B' },
  { value: 'custom', labelKey: 'db.envCustom', color: 'var(--text-muted)' },
]

const DEFAULT_PORTS: Record<DbEngine, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  mongodb: 27017,
  sqlite: 0,
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function DatabaseConnectionModal({
  connection,
  workspaceId,
  onSave,
  onClose,
}: DatabaseConnectionModalProps) {
  const { t } = useI18n()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Form state
  const [name, setName] = useState(connection?.name ?? '')
  const [engine, setEngine] = useState<DbEngine>(connection?.config.engine ?? 'postgresql')
  const [environmentTag, setEnvironmentTag] = useState<DbEnvironmentTag>(
    connection?.environmentTag ?? 'local',
  )
  const [customTagName, setCustomTagName] = useState(connection?.customTagName ?? '')
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    connection?.config.connectionString ? 'uri' : 'params',
  )

  // Connection params
  const [connectionString, setConnectionString] = useState(
    connection?.config.connectionString ?? '',
  )
  const [host, setHost] = useState(connection?.config.host ?? 'localhost')
  const [port, setPort] = useState(connection?.config.port ?? DEFAULT_PORTS[engine])
  const [username, setUsername] = useState(connection?.config.username ?? '')
  const [password, setPassword] = useState(connection?.config.password ?? '')
  const [database, setDatabase] = useState(connection?.config.database ?? '')
  const [filePath, setFilePath] = useState(connection?.config.filePath ?? '')
  const [ssl, setSsl] = useState(connection?.config.ssl ?? false)

  // NL Permissions
  const [nlCanRead, setNlCanRead] = useState(connection?.nlPermissions?.canRead ?? true)
  const [nlCanUpdate, setNlCanUpdate] = useState(connection?.nlPermissions?.canUpdate ?? false)
  const [nlCanDelete, setNlCanDelete] = useState(connection?.nlPermissions?.canDelete ?? false)

  // Test state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    error?: string
  } | null>(null)

  // Update port when engine changes
  useEffect(() => {
    if (!connection) {
      setPort(DEFAULT_PORTS[engine])
    }
  }, [engine, connection])

  // Handle escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose],
  )

  const buildConfig = useCallback((): DbConnectionConfig => {
    const config: DbConnectionConfig = { engine }

    if (engine === 'sqlite') {
      config.filePath = filePath
      return config
    }

    if (connectionMode === 'uri') {
      config.connectionString = connectionString
    } else {
      config.host = host
      config.port = port
      config.username = username
      config.password = password
      config.database = database
      config.ssl = ssl
    }

    return config
  }, [engine, connectionMode, connectionString, host, port, username, password, database, filePath, ssl])

  const handleTestConnection = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.kanbai.database.testConnection(buildConfig())
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: String(err) })
    } finally {
      setTesting(false)
    }
  }, [buildConfig])

  const handleSave = useCallback(() => {
    const now = Date.now()
    const nlPermissions: DbNlPermissions = {
      canRead: nlCanRead,
      canUpdate: nlCanUpdate,
      canDelete: nlCanDelete,
    }
    const conn: DbConnection = {
      id: connection?.id ?? generateId(),
      name: name || t('db.untitledConnection'),
      engine,
      environmentTag,
      customTagName: environmentTag === 'custom' ? customTagName : undefined,
      config: buildConfig(),
      workspaceId,
      nlPermissions,
      createdAt: connection?.createdAt ?? now,
      updatedAt: now,
    }
    onSave(conn)
  }, [connection, name, engine, environmentTag, customTagName, buildConfig, workspaceId, nlCanRead, nlCanUpdate, nlCanDelete, onSave, t])

  const handleBrowseFile = useCallback(async () => {
    try {
      const selectedPath = await window.kanbai.project.selectDir()
      if (selectedPath) {
        setFilePath(selectedPath)
      }
    } catch {
      // Browse cancelled
    }
  }, [])

  const isFormValid = (): boolean => {
    if (!name.trim()) return false
    if (engine === 'sqlite') return !!filePath.trim()
    if (connectionMode === 'uri') return !!connectionString.trim()
    return !!host.trim()
  }

  const isSqlite = engine === 'sqlite'

  return (
    <div className="db-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <div className="db-modal-header">
          <h3>{connection ? t('db.editConnection') : t('db.newConnection')}</h3>
          <button className="db-modal-close" onClick={onClose}>
            x
          </button>
        </div>

        <div className="db-modal-body">
          {/* Name */}
          <div className="db-form-row">
            <label className="db-form-label">{t('db.connectionName')}</label>
            <input
              className="db-form-input"
              placeholder={t('db.connectionNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Engine */}
          <div className="db-form-row">
            <label className="db-form-label">{t('db.engine')}</label>
            <select
              className="db-form-select"
              value={engine}
              onChange={(e) => setEngine(e.target.value as DbEngine)}
            >
              {ENGINE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Environment tag */}
          <div className="db-form-row">
            <label className="db-form-label">{t('db.environment')}</label>
            <div className="db-env-tag-selector">
              {ENV_TAG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`db-env-tag-btn${environmentTag === opt.value ? ' db-env-tag-btn--active' : ''}`}
                  style={{
                    borderColor: environmentTag === opt.value ? opt.color : 'var(--border)',
                    color: environmentTag === opt.value ? opt.color : 'var(--text-secondary)',
                  }}
                  onClick={() => setEnvironmentTag(opt.value)}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom tag name */}
          {environmentTag === 'custom' && (
            <div className="db-form-row">
              <label className="db-form-label">{t('db.customTagName')}</label>
              <input
                className="db-form-input"
                placeholder={t('db.customTagNamePlaceholder')}
                value={customTagName}
                onChange={(e) => setCustomTagName(e.target.value)}
              />
            </div>
          )}

          {/* SQLite file path */}
          {isSqlite && (
            <div className="db-form-row">
              <label className="db-form-label">{t('db.filePath')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="db-form-input"
                  style={{ flex: 1 }}
                  placeholder={t('db.filePathPlaceholder')}
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                />
                <button className="db-form-browse-btn" onClick={handleBrowseFile}>
                  {t('db.browse')}
                </button>
              </div>
            </div>
          )}

          {/* Connection mode toggle (non-SQLite) */}
          {!isSqlite && (
            <>
              <div className="db-form-row">
                <label className="db-form-label">{t('db.connectionMode')}</label>
                <div className="db-mode-toggle">
                  <button
                    className={`db-mode-toggle-btn${connectionMode === 'uri' ? ' db-mode-toggle-btn--active' : ''}`}
                    onClick={() => setConnectionMode('uri')}
                  >
                    URI
                  </button>
                  <button
                    className={`db-mode-toggle-btn${connectionMode === 'params' ? ' db-mode-toggle-btn--active' : ''}`}
                    onClick={() => setConnectionMode('params')}
                  >
                    {t('db.parameters')}
                  </button>
                </div>
              </div>

              {/* URI mode */}
              {connectionMode === 'uri' && (
                <div className="db-form-row">
                  <label className="db-form-label">{t('db.connectionString')}</label>
                  <input
                    className="db-form-input db-form-input--mono"
                    placeholder={t('db.connectionStringPlaceholder')}
                    value={connectionString}
                    onChange={(e) => setConnectionString(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              )}

              {/* Parameters mode */}
              {connectionMode === 'params' && (
                <>
                  <div className="db-form-row-inline">
                    <div className="db-form-row" style={{ flex: 2 }}>
                      <label className="db-form-label">{t('db.host')}</label>
                      <input
                        className="db-form-input"
                        placeholder="localhost"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                      />
                    </div>
                    <div className="db-form-row" style={{ flex: 1 }}>
                      <label className="db-form-label">{t('db.port')}</label>
                      <input
                        className="db-form-input"
                        type="number"
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>

                  <div className="db-form-row-inline">
                    <div className="db-form-row" style={{ flex: 1 }}>
                      <label className="db-form-label">{t('db.username')}</label>
                      <input
                        className="db-form-input"
                        placeholder={t('db.usernamePlaceholder')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                    <div className="db-form-row" style={{ flex: 1 }}>
                      <label className="db-form-label">{t('db.password')}</label>
                      <input
                        className="db-form-input"
                        type="password"
                        placeholder={t('db.passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="db-form-row">
                    <label className="db-form-label">{t('db.database')}</label>
                    <input
                      className="db-form-input"
                      placeholder={t('db.databasePlaceholder')}
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                    />
                  </div>

                  <div className="db-form-row">
                    <label className="db-form-label db-form-label--inline">
                      <input
                        type="checkbox"
                        checked={ssl}
                        onChange={(e) => setSsl(e.target.checked)}
                      />
                      <span style={{ marginLeft: 6 }}>SSL</span>
                    </label>
                  </div>
                </>
              )}
            </>
          )}

          {/* Claude NL Permissions */}
          <div className="db-form-row">
            <label className="db-form-label">{t('db.nlPermissions')}</label>
            <div className="db-nl-perms">
              <label className="db-form-label db-form-label--inline db-nl-perm-item">
                <input
                  type="checkbox"
                  checked={nlCanRead}
                  onChange={(e) => setNlCanRead(e.target.checked)}
                />
                <span style={{ marginLeft: 6 }}>{t('db.nlPermRead')}</span>
              </label>
              <label className="db-form-label db-form-label--inline db-nl-perm-item">
                <input
                  type="checkbox"
                  checked={nlCanUpdate}
                  onChange={(e) => setNlCanUpdate(e.target.checked)}
                />
                <span style={{ marginLeft: 6 }}>{t('db.nlPermUpdate')}</span>
              </label>
              <label className="db-form-label db-form-label--inline db-nl-perm-item">
                <input
                  type="checkbox"
                  checked={nlCanDelete}
                  onChange={(e) => setNlCanDelete(e.target.checked)}
                />
                <span style={{ marginLeft: 6 }}>{t('db.nlPermDelete')}</span>
              </label>
            </div>
            {(nlCanUpdate || nlCanDelete) && (environmentTag === 'prd' || environmentTag === 'qua') && (
              <div className="db-nl-perm-warning">
                {t('db.nlPermWarning')}
              </div>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`db-test-result${testResult.success ? ' db-test-result--success' : ' db-test-result--error'}`}
            >
              {testResult.success
                ? t('db.testSuccess')
                : <CopyableError error={testResult.error ?? t('db.testError', { error: '' })} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="db-modal-footer">
          <button
            className="db-modal-btn db-modal-btn--test"
            onClick={handleTestConnection}
            disabled={testing || !isFormValid()}
          >
            {testing ? t('db.testing') : t('db.testConnection')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="db-modal-btn db-modal-btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="db-modal-btn db-modal-btn--primary"
            onClick={handleSave}
            disabled={!isFormValid()}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
