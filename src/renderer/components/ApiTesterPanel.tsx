import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useI18n } from '../lib/i18n'
import type {
  ApiTestFile,
  ApiCollection,
  ApiRequest,
  ApiResponse,
  ApiTestResult,
  ApiTestAssertion,
  ApiEnvironment,
  HttpMethod,
} from '../../shared/types'

type RequestTab = 'headers' | 'body' | 'tests' | 'chain'
type ResponseTab = 'body' | 'headers' | 'testResults'
type SidebarSelection =
  | { type: 'request'; collectionId: string; requestId: string }
  | { type: 'chain'; chainId: string }
  | null

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function getStatusBadgeClass(status: number): string {
  if (status === 0) return 'api-status-badge api-status-badge--error'
  if (status >= 200 && status < 300) return 'api-status-badge api-status-badge--2xx'
  if (status >= 300 && status < 400) return 'api-status-badge api-status-badge--3xx'
  if (status >= 400 && status < 500) return 'api-status-badge api-status-badge--4xx'
  return 'api-status-badge api-status-badge--5xx'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function tryPrettyPrint(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function defaultApiTestFile(): ApiTestFile {
  return {
    version: 1,
    environments: [],
    collections: [],
    chains: [],
    healthChecks: [],
  }
}

function createEmptyRequest(name: string): ApiRequest {
  return {
    id: generateId(),
    name,
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    bodyType: 'none',
    tests: [],
  }
}

export function ApiTesterPanel() {
  const { t } = useI18n()
  const { activeProjectId, projects } = useWorkspaceStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Data state
  const [data, setData] = useState<ApiTestFile>(defaultApiTestFile())
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<SidebarSelection>(null)
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set())

  // Request editing state
  const [requestTab, setRequestTab] = useState<RequestTab>('headers')
  const [responseTab, setResponseTab] = useState<ResponseTab>('body')
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [testResults, setTestResults] = useState<ApiTestResult[]>([])
  const [sending, setSending] = useState(false)

  // UI state
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [showDoc, setShowDoc] = useState(true)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load data when project changes
  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    window.kanbai.api.load(activeProject.path).then((loaded) => {
      setData(loaded)
      setLoading(false)
    })
  }, [activeProject])

  // Auto-save with debounce
  const saveData = useCallback(
    (newData: ApiTestFile) => {
      if (!activeProject) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        window.kanbai.api.save(activeProject.path, newData)
      }, 500)
    },
    [activeProject],
  )

  const updateData = useCallback(
    (updater: (prev: ApiTestFile) => ApiTestFile) => {
      setData((prev) => {
        const next = updater(prev)
        saveData(next)
        return next
      })
    },
    [saveData],
  )

  // Get active environment variables
  const getActiveVariables = useCallback((): Record<string, string> => {
    const env = data.environments.find((e) => e.isActive)
    return env?.variables ?? {}
  }, [data.environments])

  // Get the currently selected request
  const getSelectedRequest = useCallback((): {
    request: ApiRequest
    collectionId: string
  } | null => {
    if (!selection || selection.type !== 'request') return null
    const col = data.collections.find((c) => c.id === selection.collectionId)
    if (!col) return null
    const req = col.requests.find((r) => r.id === selection.requestId)
    if (!req) return null
    return { request: req, collectionId: col.id }
  }, [selection, data.collections])

  // Update a request within the data
  const updateRequest = useCallback(
    (collectionId: string, requestId: string, updater: (r: ApiRequest) => ApiRequest) => {
      updateData((prev) => ({
        ...prev,
        collections: prev.collections.map((col) =>
          col.id === collectionId
            ? {
                ...col,
                requests: col.requests.map((r) => (r.id === requestId ? updater(r) : r)),
              }
            : col,
        ),
      }))
    },
    [updateData],
  )

  // Send request
  const handleSend = useCallback(async () => {
    const selected = getSelectedRequest()
    if (!selected) return
    const { request } = selected
    setSending(true)
    setResponse(null)
    setTestResults([])
    try {
      const result = await window.kanbai.api.execute(
        {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
          bodyType: request.bodyType,
          tests: request.tests,
        },
        getActiveVariables(),
      )
      setResponse(result.response)
      setTestResults(result.testResults)
      setResponseTab('body')
    } catch (err) {
      setResponse({
        status: 0,
        statusText: String(err),
        headers: {},
        body: String(err),
        time: 0,
        size: 0,
      })
    } finally {
      setSending(false)
    }
  }, [getSelectedRequest, getActiveVariables])

  // Handle URL input Enter key
  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // Collection CRUD
  const addCollection = useCallback(() => {
    const col: ApiCollection = {
      id: generateId(),
      name: 'New Collection',
      requests: [],
    }
    updateData((prev) => ({ ...prev, collections: [...prev.collections, col] }))
    setExpandedCollections((prev) => new Set(prev).add(col.id))
  }, [updateData])

  const deleteCollection = useCallback(
    (colId: string) => {
      updateData((prev) => ({
        ...prev,
        collections: prev.collections.filter((c) => c.id !== colId),
      }))
      if (selection?.type === 'request' && selection.collectionId === colId) {
        setSelection(null)
      }
    },
    [updateData, selection],
  )

  const addRequest = useCallback(
    (colId: string) => {
      const req = createEmptyRequest('New Request')
      updateData((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === colId ? { ...c, requests: [...c.requests, req] } : c,
        ),
      }))
      setExpandedCollections((prev) => new Set(prev).add(colId))
      setSelection({ type: 'request', collectionId: colId, requestId: req.id })
      setResponse(null)
      setTestResults([])
    },
    [updateData],
  )

  const deleteRequest = useCallback(
    (colId: string, reqId: string) => {
      updateData((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === colId ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) } : c,
        ),
      }))
      if (selection?.type === 'request' && selection.requestId === reqId) {
        setSelection(null)
      }
    },
    [updateData, selection],
  )

  const duplicateRequest = useCallback(
    (colId: string, reqId: string) => {
      const col = data.collections.find((c) => c.id === colId)
      const req = col?.requests.find((r) => r.id === reqId)
      if (!req) return
      const newReq: ApiRequest = { ...req, id: generateId(), name: req.name + ' (copy)' }
      updateData((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === colId ? { ...c, requests: [...c.requests, newReq] } : c,
        ),
      }))
    },
    [data.collections, updateData],
  )

  // Environment management
  const addEnvironment = useCallback(() => {
    const env: ApiEnvironment = {
      id: generateId(),
      name: 'New Environment',
      variables: {},
    }
    updateData((prev) => ({ ...prev, environments: [...prev.environments, env] }))
  }, [updateData])

  const deleteEnvironment = useCallback(
    (envId: string) => {
      updateData((prev) => ({
        ...prev,
        environments: prev.environments.filter((e) => e.id !== envId),
      }))
    },
    [updateData],
  )

  const setActiveEnvironment = useCallback(
    (envId: string | null) => {
      updateData((prev) => ({
        ...prev,
        environments: prev.environments.map((e) => ({ ...e, isActive: e.id === envId })),
      }))
    },
    [updateData],
  )

  const updateEnvironment = useCallback(
    (envId: string, updater: (e: ApiEnvironment) => ApiEnvironment) => {
      updateData((prev) => ({
        ...prev,
        environments: prev.environments.map((e) => (e.id === envId ? updater(e) : e)),
      }))
    },
    [updateData],
  )

  // Import/Export
  const handleExport = useCallback(async () => {
    await window.kanbai.api.export(data)
  }, [data])

  const handleImport = useCallback(async () => {
    const result = await window.kanbai.api.import()
    if (result.success && result.data) {
      setData(result.data)
      if (activeProject) {
        window.kanbai.api.save(activeProject.path, result.data)
      }
    }
  }, [activeProject])

  // Toggle collection expand
  const toggleCollection = useCallback((colId: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      return next
    })
  }, [])

  // No project state
  if (!activeProject) {
    return (
      <div className="api-panel">
        <div className="api-no-project">{t('api.selectProject')}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="api-panel">
        <div className="api-no-project">{t('common.loading')}</div>
      </div>
    )
  }

  const selectedRequest = getSelectedRequest()
  const activeEnv = data.environments.find((e) => e.isActive)

  return (
    <div className="api-panel">
      {showDoc && (
        <div className="api-doc-banner">
          <span className="api-doc-banner-icon">i</span>
          <div className="api-doc-banner-text">
            <div className="api-doc-banner-title">{t('api.docTitle')}</div>
            <div className="api-doc-banner-body">{t('api.docBody')}</div>
          </div>
          <button className="api-doc-close" onClick={() => setShowDoc(false)}>
            x
          </button>
        </div>
      )}
      <div className="api-panel-body">
        {/* Sidebar */}
        <div className="api-sidebar">
          <div className="api-sidebar-header">
            <h3>{t('api.title')}</h3>
            <div className="api-sidebar-actions">
              <button className="api-sidebar-btn" onClick={handleImport} title={t('api.import')}>
                {t('api.import')}
              </button>
              <button className="api-sidebar-btn" onClick={handleExport} title={t('api.export')}>
                {t('api.export')}
              </button>
            </div>
          </div>

          {/* Environment selector */}
          <div style={{ padding: '6px 6px 0' }}>
            <select
              className="api-env-select"
              value={activeEnv?.id ?? ''}
              onChange={(e) => setActiveEnvironment(e.target.value || null)}
            >
              <option value="">{t('api.noActiveEnv')}</option>
              {data.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <button
              className="api-add-btn"
              style={{ width: '100%', marginTop: 2, marginBottom: 4 }}
              onClick={() => setShowEnvModal(true)}
            >
              {t('api.editEnvironments')}
            </button>
          </div>

          <div className="api-sidebar-content">
            {/* Collections */}
            <div className="api-sidebar-section">
              <div className="api-sidebar-section-header">
                <span>Collections</span>
                <button
                  className="api-collection-action-btn"
                  style={{ opacity: 1 }}
                  onClick={addCollection}
                  title={t('api.newCollection')}
                >
                  +
                </button>
              </div>

              {data.collections.length === 0 && (
                <div style={{ padding: '8px 6px', fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('api.noCollections')}
                </div>
              )}

              {data.collections.map((col) => (
                <div key={col.id} className="api-collection-item">
                  <div
                    className="api-collection-header"
                    onClick={() => toggleCollection(col.id)}
                  >
                    <span
                      className={`api-collection-toggle${expandedCollections.has(col.id) ? ' api-collection-toggle--open' : ''}`}
                    >
                      &#9654;
                    </span>
                    <span className="api-collection-name">{col.name}</span>
                    <span className="api-collection-count">{col.requests.length}</span>
                    <div className="api-collection-actions">
                      <button
                        className="api-collection-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          addRequest(col.id)
                        }}
                        title={t('api.newRequest')}
                      >
                        +
                      </button>
                      <button
                        className="api-collection-action-btn api-collection-action-btn--danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteCollection(col.id)
                        }}
                        title={t('api.deleteCollection')}
                      >
                        x
                      </button>
                    </div>
                  </div>
                  {expandedCollections.has(col.id) &&
                    col.requests.map((req) => (
                      <div
                        key={req.id}
                        className={`api-request-item${
                          selection?.type === 'request' && selection.requestId === req.id
                            ? ' api-request-item--active'
                            : ''
                        }`}
                        onClick={() => {
                          setSelection({
                            type: 'request',
                            collectionId: col.id,
                            requestId: req.id,
                          })
                          setResponse(null)
                          setTestResults([])
                        }}
                      >
                        <span className={`api-request-method api-request-method--${req.method}`}>
                          {req.method}
                        </span>
                        <span className="api-request-name">{req.name}</span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="api-main">
          {!selection && (
            <div className="api-main-empty">
              {t('api.noCollections')}
            </div>
          )}

          {/* Request Editor */}
          {selectedRequest && (
            <>
              {/* Request name editor */}
              <div style={{ padding: '6px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    outline: 'none',
                    flex: 1,
                    padding: '2px 0',
                  }}
                  value={selectedRequest.request.name}
                  onChange={(e) =>
                    updateRequest(selectedRequest.collectionId, selectedRequest.request.id, (r) => ({
                      ...r,
                      name: e.target.value,
                    }))
                  }
                />
                <button
                  className="api-collection-action-btn"
                  onClick={() =>
                    duplicateRequest(selectedRequest.collectionId, selectedRequest.request.id)
                  }
                  title={t('api.duplicateRequest')}
                  style={{ opacity: 0.7 }}
                >
                  &#x2398;
                </button>
                <button
                  className="api-collection-action-btn api-collection-action-btn--danger"
                  onClick={() =>
                    deleteRequest(selectedRequest.collectionId, selectedRequest.request.id)
                  }
                  title={t('api.deleteRequest')}
                  style={{ opacity: 0.7 }}
                >
                  x
                </button>
              </div>

              {/* Request bar */}
              <div className="api-request-bar">
                <select
                  className={`api-method-select api-method-select--${selectedRequest.request.method}`}
                  value={selectedRequest.request.method}
                  onChange={(e) =>
                    updateRequest(selectedRequest.collectionId, selectedRequest.request.id, (r) => ({
                      ...r,
                      method: e.target.value as HttpMethod,
                    }))
                  }
                >
                  {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as HttpMethod[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ),
                  )}
                </select>
                <input
                  className="api-url-input"
                  placeholder={t('api.urlPlaceholder')}
                  value={selectedRequest.request.url}
                  onChange={(e) =>
                    updateRequest(selectedRequest.collectionId, selectedRequest.request.id, (r) => ({
                      ...r,
                      url: e.target.value,
                    }))
                  }
                  onKeyDown={handleUrlKeyDown}
                />
                <button
                  className="api-send-btn"
                  onClick={handleSend}
                  disabled={sending || !selectedRequest.request.url}
                >
                  {sending ? t('api.sending') : t('api.send')}
                </button>
              </div>

              {/* Request tabs */}
              <div className="api-tabs">
                {(['headers', 'body', 'tests'] as RequestTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`api-tab${requestTab === tab ? ' api-tab--active' : ''}`}
                    onClick={() => setRequestTab(tab)}
                  >
                    {t(`api.${tab}` as 'api.headers' | 'api.body' | 'api.tests')}
                    {tab === 'headers' && selectedRequest.request.headers.length > 0 && (
                      <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-muted)' }}>
                        ({selectedRequest.request.headers.filter((h) => h.enabled).length})
                      </span>
                    )}
                    {tab === 'tests' && selectedRequest.request.tests.length > 0 && (
                      <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-muted)' }}>
                        ({selectedRequest.request.tests.length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="api-tab-content">
                {/* Headers tab */}
                {requestTab === 'headers' && (
                  <div>
                    {selectedRequest.request.headers.map((header, idx) => (
                      <div key={idx} className="api-header-row">
                        <input
                          type="checkbox"
                          className="api-header-toggle"
                          checked={header.enabled}
                          onChange={(e) =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                headers: r.headers.map((h, i) =>
                                  i === idx ? { ...h, enabled: e.target.checked } : h,
                                ),
                              }),
                            )
                          }
                        />
                        <input
                          className="api-header-input"
                          placeholder="Header name"
                          value={header.key}
                          onChange={(e) =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                headers: r.headers.map((h, i) =>
                                  i === idx ? { ...h, key: e.target.value } : h,
                                ),
                              }),
                            )
                          }
                        />
                        <input
                          className="api-header-input"
                          placeholder="Value"
                          value={header.value}
                          onChange={(e) =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                headers: r.headers.map((h, i) =>
                                  i === idx ? { ...h, value: e.target.value } : h,
                                ),
                              }),
                            )
                          }
                        />
                        <button
                          className="api-header-remove"
                          onClick={() =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                headers: r.headers.filter((_, i) => i !== idx),
                              }),
                            )
                          }
                        >
                          x
                        </button>
                      </div>
                    ))}
                    <button
                      className="api-add-btn"
                      onClick={() =>
                        updateRequest(
                          selectedRequest.collectionId,
                          selectedRequest.request.id,
                          (r) => ({
                            ...r,
                            headers: [...r.headers, { key: '', value: '', enabled: true }],
                          }),
                        )
                      }
                    >
                      {t('api.addHeader')}
                    </button>
                  </div>
                )}

                {/* Body tab */}
                {requestTab === 'body' && (
                  <div>
                    <div className="api-body-type-bar">
                      {(['json', 'form', 'text', 'none'] as const).map((bt) => (
                        <button
                          key={bt}
                          className={`api-body-type-btn${
                            selectedRequest.request.bodyType === bt
                              ? ' api-body-type-btn--active'
                              : ''
                          }`}
                          onClick={() =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({ ...r, bodyType: bt }),
                            )
                          }
                        >
                          {t(`api.${bt}` as 'api.json' | 'api.form' | 'api.text' | 'api.none')}
                        </button>
                      ))}
                    </div>
                    {selectedRequest.request.bodyType !== 'none' && (
                      <textarea
                        className="api-body-textarea"
                        placeholder={t('api.bodyPlaceholder')}
                        value={selectedRequest.request.body}
                        onChange={(e) =>
                          updateRequest(
                            selectedRequest.collectionId,
                            selectedRequest.request.id,
                            (r) => ({ ...r, body: e.target.value }),
                          )
                        }
                      />
                    )}
                  </div>
                )}

                {/* Tests tab */}
                {requestTab === 'tests' && (
                  <div>
                    {selectedRequest.request.tests.map((test, idx) => (
                      <div key={idx} className="api-test-row">
                        <select
                          className="api-test-type-select"
                          value={test.type}
                          onChange={(e) =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                tests: r.tests.map((t, i) =>
                                  i === idx
                                    ? {
                                        ...t,
                                        type: e.target.value as ApiTestAssertion['type'],
                                      }
                                    : t,
                                ),
                              }),
                            )
                          }
                        >
                          <option value="status">Status =</option>
                          <option value="body_contains">Body contains</option>
                          <option value="header_contains">Header contains</option>
                          <option value="json_path">JSON path</option>
                          <option value="response_time">Response time &lt;</option>
                        </select>
                        <input
                          className="api-test-expected"
                          placeholder={t('api.expected')}
                          value={test.expected}
                          onChange={(e) =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                tests: r.tests.map((t, i) =>
                                  i === idx ? { ...t, expected: e.target.value } : t,
                                ),
                              }),
                            )
                          }
                        />
                        <button
                          className="api-header-remove"
                          onClick={() =>
                            updateRequest(
                              selectedRequest.collectionId,
                              selectedRequest.request.id,
                              (r) => ({
                                ...r,
                                tests: r.tests.filter((_, i) => i !== idx),
                              }),
                            )
                          }
                        >
                          x
                        </button>
                      </div>
                    ))}
                    <button
                      className="api-add-btn"
                      onClick={() =>
                        updateRequest(
                          selectedRequest.collectionId,
                          selectedRequest.request.id,
                          (r) => ({
                            ...r,
                            tests: [...r.tests, { type: 'status', expected: '200' }],
                          }),
                        )
                      }
                    >
                      {t('api.addTest')}
                    </button>
                  </div>
                )}
              </div>

              {/* Response area */}
              <div className="api-response">
                {!response && (
                  <div className="api-response-no-content">{t('api.noResponse')}</div>
                )}
                {response && (
                  <>
                    <div className="api-response-header">
                      <h4>{t('api.response')}</h4>
                      <span className={getStatusBadgeClass(response.status)}>
                        {response.status} {response.statusText}
                      </span>
                      <span className="api-response-meta">
                        {t('api.time')}: {response.time}ms
                      </span>
                      <span className="api-response-meta">
                        {t('api.size')}: {formatBytes(response.size)}
                      </span>
                    </div>

                    {/* Response tabs */}
                    <div className="api-response-tabs">
                      {(['body', 'headers', 'testResults'] as ResponseTab[]).map((tab) => (
                        <button
                          key={tab}
                          className={`api-tab${responseTab === tab ? ' api-tab--active' : ''}`}
                          onClick={() => setResponseTab(tab)}
                        >
                          {tab === 'body'
                            ? t('api.body')
                            : tab === 'headers'
                              ? t('api.headers')
                              : t('api.testResults')}
                          {tab === 'testResults' && testResults.length > 0 && (
                            <span
                              style={{
                                marginLeft: 4,
                                fontSize: 9,
                                color: testResults.every((r) => r.passed)
                                  ? 'var(--success)'
                                  : 'var(--danger)',
                              }}
                            >
                              ({testResults.filter((r) => r.passed).length}/{testResults.length})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="api-response-body">
                      {responseTab === 'body' && (
                        <pre>{tryPrettyPrint(response.body)}</pre>
                      )}

                      {responseTab === 'headers' && (
                        <table className="api-response-headers-table">
                          <thead>
                            <tr>
                              <th>Header</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(response.headers).map(([key, val]) => (
                              <tr key={key}>
                                <td>{key}</td>
                                <td>{val}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {responseTab === 'testResults' && (
                        <div>
                          {testResults.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                              {t('api.noResponse')}
                            </div>
                          )}
                          {testResults.map((result, idx) => (
                            <div key={idx} className="api-test-result">
                              <span
                                className={`api-test-result-badge${
                                  result.passed
                                    ? ' api-test-result-badge--pass'
                                    : ' api-test-result-badge--fail'
                                }`}
                              >
                                {result.passed ? t('api.passed') : t('api.failed')}
                              </span>
                              <span className="api-test-result-type">
                                {result.assertion.type}
                              </span>
                              <span className="api-test-result-expected">
                                {result.assertion.expected}
                              </span>
                              <span className="api-test-result-actual">{result.actual}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Environment Modal */}
      {showEnvModal && (
        <div className="api-env-modal" onClick={() => setShowEnvModal(false)}>
          <div className="api-env-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="api-env-modal-header">
              <h3>{t('api.environments')}</h3>
              <button className="api-env-modal-close" onClick={() => setShowEnvModal(false)}>
                x
              </button>
            </div>
            <div className="api-env-modal-body">
              {data.environments.map((env) => (
                <div key={env.id} className="api-env-item">
                  <div className="api-env-item-header">
                    <input
                      className="api-env-name-input"
                      placeholder={t('api.envName')}
                      value={env.name}
                      onChange={(e) =>
                        updateEnvironment(env.id, (en) => ({ ...en, name: e.target.value }))
                      }
                    />
                    <button
                      className="api-env-delete-btn"
                      onClick={() => deleteEnvironment(env.id)}
                    >
                      x
                    </button>
                  </div>
                  {Object.entries(env.variables).map(([key, val], idx) => (
                    <div key={idx} className="api-env-var-row">
                      <input
                        className="api-env-var-input"
                        placeholder={t('api.varKey')}
                        value={key}
                        onChange={(e) => {
                          const newVars = { ...env.variables }
                          const oldVal = newVars[key]!
                          delete newVars[key]
                          newVars[e.target.value] = oldVal
                          updateEnvironment(env.id, (en) => ({ ...en, variables: newVars }))
                        }}
                      />
                      <input
                        className="api-env-var-input"
                        placeholder={t('api.varValue')}
                        value={val}
                        onChange={(e) => {
                          const newVars = { ...env.variables, [key]: e.target.value }
                          updateEnvironment(env.id, (en) => ({ ...en, variables: newVars }))
                        }}
                      />
                      <button
                        className="api-header-remove"
                        onClick={() => {
                          const newVars = { ...env.variables }
                          delete newVars[key]
                          updateEnvironment(env.id, (en) => ({ ...en, variables: newVars }))
                        }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <button
                    className="api-add-btn"
                    style={{ width: '100%' }}
                    onClick={() => {
                      const newVars = { ...env.variables, ['new_variable']: '' }
                      updateEnvironment(env.id, (en) => ({ ...en, variables: newVars }))
                    }}
                  >
                    {t('api.addVariable')}
                  </button>
                </div>
              ))}
              <button
                className="api-add-btn"
                style={{ width: '100%' }}
                onClick={addEnvironment}
              >
                {t('api.addEnvironment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
