import { useCodeAnalysis, SEVERITY_ORDER, formatDuration } from './use-code-analysis'
import type { TicketGroupBy } from './use-code-analysis'
import './analysis.css'

export function CodeAnalysisPanel() {
  const {
    t,
    workspaceProjects,
    selectedProjectId,
    setSelectedProjectId,
    collapsedProjects,
    toggleProjectCollapse,
    relevantToolsByProject,
    detectAllTools,
    detectingTools,
    installedCount,
    reportsByProject,
    currentReports,
    allReportsFlat,
    aggregatedReport,
    activeReport,
    activeReportId,
    setActiveReportId,
    projectGrade,
    findingsCountByProject,
    totalFindingsAllProjects,
    runningTools,
    isAnyRunning,
    runningToolName,
    isToolRunningForProject,
    runAll,
    runAllForProject,
    runToolForProject,
    cancelTool,
    deleteReport,
    reanalyze,
    installingTools,
    installOutput,
    activeInstallTool,
    setActiveInstallTool,
    copiedInstallOutput,
    installTool,
    copyInstallOutput,
    installBufferRef,
    filteredFindings,
    grouped,
    severityFilter,
    setSeverityFilter,
    selectedFindings,
    toggleFinding,
    selectAll,
    deselectAll,
    collapsedGroups,
    toggleGroup,
    selectedFinding,
    setSelectedFinding,
    handleClickFinding,
    handleNavigateToFile,
    copiedError,
    copyError,
    showTicketModal,
    setShowTicketModal,
    ticketGroupBy,
    setTicketGroupBy,
    ticketPriority,
    setTicketPriority,
    ticketPreviewCount,
    handleCreateTickets,
    toastMessage,
    ALL_REPORTS_ID,
    ALL_PROJECTS_ID,
    toolsByProject,
  } = useCodeAnalysis()

  if (workspaceProjects.length === 0) {
    return <div className="analysis-panel-empty">{t('analysis.noProject')}</div>
  }

  return (
    <div className="analysis-panel">
      {/* Header */}
      <div className="analysis-header">
        <h3>{t('analysis.title')}</h3>
        {activeReport && (
          <span className="analysis-header-count">
            {activeReport.summary.total} {t('analysis.findings')}
          </span>
        )}
        {projectGrade && (
          <span className="analysis-grade-badge" data-grade={projectGrade}>
            {projectGrade}
          </span>
        )}
        <button
          className="analysis-refresh-btn"
          onClick={detectAllTools}
          disabled={detectingTools}
          title={t('common.refresh')}
        >
          {detectingTools ? '...' : '\u21BB'}
        </button>
      </div>

      {/* Panel body: sidebar + content */}
      <div className="analysis-panel-body">
        {/* Sidebar */}
        <div className="analysis-sidebar">
          <div className="analysis-sidebar-header">
            <span>{t('analysis.projects')}</span>
          </div>

          {/* Run All button at top */}
          {workspaceProjects.length > 0 && (
            <button
              className="analysis-run-all-btn analysis-run-all-btn--top"
              onClick={runAll}
              disabled={isAnyRunning}
            >
              {isAnyRunning ? t('analysis.running') : `\u25B6 ${t('analysis.runAllProjects')}`}
            </button>
          )}

          <div className="analysis-sidebar-list">
            {detectingTools && toolsByProject.size === 0 && (
              <div className="analysis-loading">
                <span className="analysis-spinner" />
                {t('analysis.detectingTools')}
              </div>
            )}

            {/* Project tree */}
            {workspaceProjects.map((project) => {
              const projectTools = relevantToolsByProject.get(project.id) ?? []
              const projectReports = reportsByProject.get(project.id) ?? []
              const reportsByToolForProject = new Map<string, (typeof projectReports)[0]>()
              for (const r of projectReports) reportsByToolForProject.set(r.toolId, r)
              const isCollapsed = collapsedProjects.has(project.id)
              const projectFindingsCount = findingsCountByProject.get(project.id) ?? 0
              const isProjectSelected = selectedProjectId === project.id && activeReportId === ALL_REPORTS_ID

              return (
                <div key={project.id} className="analysis-project-node">
                  {/* Project header */}
                  <div
                    className={`analysis-project-header${isProjectSelected ? ' analysis-project-header--active' : ''}`}
                    onClick={() => {
                      setSelectedProjectId(project.id)
                      setActiveReportId(ALL_REPORTS_ID)
                      setSelectedFinding(null)
                    }}
                  >
                    <button
                      className="analysis-project-chevron"
                      onClick={(e) => { e.stopPropagation(); toggleProjectCollapse(project.id) }}
                    >
                      <span style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', display: 'inline-block', transition: 'transform 0.15s ease', fontSize: '8px' }}>
                        {'\u25B6'}
                      </span>
                    </button>
                    <span className="analysis-project-name">{project.name}</span>
                    {projectFindingsCount > 0 && (
                      <span className="analysis-tool-count">{projectFindingsCount}</span>
                    )}
                    <button
                      className="analysis-project-run-btn"
                      onClick={(e) => { e.stopPropagation(); runAllForProject(project) }}
                      disabled={isAnyRunning}
                      title={t('analysis.runAll')}
                    >
                      {'\u25B6'}
                    </button>
                  </div>

                  {/* Tools under this project */}
                  {!isCollapsed && (
                    <div className="analysis-project-tools">
                      {projectTools.length === 0 && !detectingTools && (
                        <div className="analysis-project-tools-empty">
                          {t('analysis.notRelevant')}
                        </div>
                      )}
                      {projectTools.map((tool) => {
                        const toolReport = reportsByToolForProject.get(tool.id)
                        const isToolActive = selectedProjectId === project.id && activeReportId !== ALL_REPORTS_ID && toolReport?.id === activeReportId
                        const isRunning = isToolRunningForProject(project.id, tool.id) || runningTools.has(tool.id)

                        return (
                          <div
                            key={tool.id}
                            className={`analysis-tool-item analysis-tool-item--nested${isToolActive ? ' analysis-tool-item--active' : ''}`}
                            onClick={() => {
                              if (toolReport) {
                                setSelectedProjectId(project.id)
                                setActiveReportId(toolReport.id)
                                setSelectedFinding(null)
                              }
                            }}
                            style={toolReport ? { cursor: 'pointer' } : undefined}
                          >
                            <span className="analysis-tool-category-dot" data-category={tool.category} />
                            <span className="analysis-tool-name">{tool.name}</span>
                            {toolReport && (
                              <span className="analysis-tool-count">{toolReport.summary.total}</span>
                            )}
                            {tool.installed ? (
                              isRunning ? (
                                <button
                                  className="analysis-tool-cancel-btn"
                                  onClick={(e) => { e.stopPropagation(); cancelTool(tool.id) }}
                                  title={t('common.cancel')}
                                >
                                  {'\u25A0'}
                                </button>
                              ) : (
                                <button
                                  className="analysis-tool-run-btn"
                                  onClick={(e) => { e.stopPropagation(); runToolForProject(project, tool.id) }}
                                  title={t('analysis.runAll')}
                                >
                                  {'\u25B6'}
                                </button>
                              )
                            ) : installingTools.has(tool.id) ? (
                              <span className="analysis-tool-installing-spinner" />
                            ) : (
                              <button
                                className="analysis-tool-install-btn"
                                onClick={(e) => { e.stopPropagation(); installTool(tool.id) }}
                                title={t('analysis.installButton')}
                              >
                                {'\u2B07'} {t('analysis.installButton')}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* "All" entry at bottom */}
            {allReportsFlat.length > 0 && (
              <div
                className={`analysis-tool-item analysis-tool-item--tous${!selectedProjectId || selectedProjectId === ALL_PROJECTS_ID ? (activeReportId === ALL_REPORTS_ID ? ' analysis-tool-item--active' : '') : ''}`}
                onClick={() => {
                  setSelectedProjectId(null)
                  setActiveReportId(ALL_REPORTS_ID)
                  setSelectedFinding(null)
                }}
              >
                <span className="analysis-tool-name">{t('common.all')}</span>
                {totalFindingsAllProjects > 0 && (
                  <span className="analysis-tool-count">{totalFindingsAllProjects}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="analysis-content">
          {/* Install buffer view */}
          {activeInstallTool && (
            <div className="analysis-install-buffer">
              <div className="analysis-install-buffer-header">
                <span>
                  {installingTools.has(activeInstallTool)
                    ? t('analysis.installing')
                    : t('analysis.installButton')}
                  {' '}{activeInstallTool}
                </span>
                <div className="analysis-install-buffer-actions">
                  <button
                    className={`analysis-install-buffer-copy${copiedInstallOutput ? ' analysis-install-buffer-copy--copied' : ''}`}
                    onClick={copyInstallOutput}
                    title={t('common.copy')}
                  >
                    {copiedInstallOutput ? '\u2713' : '\u2398'}
                  </button>
                  <button
                    className="analysis-install-buffer-close"
                    onClick={() => setActiveInstallTool(null)}
                  >
                    {'\u00D7'}
                  </button>
                </div>
              </div>
              <pre ref={installBufferRef}>
                {installOutput[activeInstallTool] || t('analysis.installing')}
              </pre>
            </div>
          )}

          {/* Reports view (when not viewing install buffer) */}
          {!activeInstallTool && (
            <>
              {/* Running indicator */}
              {isAnyRunning && (
                <div className="analysis-running-indicator">
                  <span className="analysis-spinner" />
                  <span>{t('analysis.runningTool', { tool: runningToolName ?? '' })}</span>
                </div>
              )}

              {/* Empty state: no reports yet, nothing running */}
              {allReportsFlat.length === 0 && !isAnyRunning && (
                <div className="analysis-content-empty">
                  <span className="analysis-content-empty-icon">{'\u{1F50D}'}</span>
                  <span>{t('analysis.emptyTitle')}</span>
                  <span className="analysis-content-empty-hint">{t('analysis.emptyHint')}</span>
                  {installedCount > 0 && (
                    <button
                      className="analysis-launch-btn"
                      onClick={runAll}
                    >
                      {'\u25B6'} {t('analysis.launchAnalysis')}
                    </button>
                  )}
                </div>
              )}

              {/* Success state: individual report with 0 findings and nothing running */}
              {activeReport && activeReportId !== ALL_REPORTS_ID && activeReport.summary.total === 0 && !activeReport.error && !isAnyRunning && (
                <div className="analysis-success-message">
                  <span className="analysis-success-icon">{'\u2713'}</span>
                  <span>{t('analysis.allClear')}</span>
                </div>
              )}

              {currentReports.length > 0 && (
                <div className="analysis-reports">
                  {activeReport && (
                    <>
                      {/* Grade panel for All view */}
                      {activeReportId === ALL_REPORTS_ID && projectGrade && (
                        <div className="analysis-grade-panel">
                          <span className="analysis-grade-large" data-grade={projectGrade}>
                            {projectGrade}
                          </span>
                          <div className="analysis-grade-info">
                            <span className="analysis-grade-label">{t('analysis.projectGrade')}</span>
                            <span className="analysis-grade-detail">
                              {aggregatedReport?.summary.critical ?? 0} critical {'\u00B7'} {aggregatedReport?.summary.high ?? 0} high {'\u00B7'} {aggregatedReport?.summary.medium ?? 0} medium
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Error display */}
                      {activeReport.error && (
                        <div className="analysis-report-error">
                          <span className="analysis-report-error-text">
                            {t('analysis.error')}: {activeReport.error}
                          </span>
                          <button
                            className={`analysis-report-error-copy${copiedError ? ' analysis-report-error-copy--copied' : ''}`}
                            onClick={copyError}
                            title={t('common.copy')}
                          >
                            {copiedError ? '\u2713' : '\u2398'}
                          </button>
                        </div>
                      )}

                      {/* Duration + Re-analyze */}
                      {activeReport.duration > 0 && (
                        <span className="analysis-report-duration">
                          {t('analysis.duration')}: {formatDuration(activeReport.duration)} {t('analysis.seconds')}
                        </span>
                      )}
                      {!isAnyRunning && (
                        <button
                          className="analysis-reanalyze-btn"
                          onClick={reanalyze}
                        >
                          {'\u21BB'} {t('analysis.reanalyze')}
                        </button>
                      )}

                      {/* Summary badges */}
                      <div className="analysis-summary">
                        <button
                          className={`analysis-severity-badge${severityFilter === 'all' ? ' analysis-severity-badge--active' : ''}`}
                          data-severity="all"
                          onClick={() => setSeverityFilter('all')}
                        >
                          {t('common.all')} {activeReport.summary.total}
                        </button>
                        {SEVERITY_ORDER.map((sev) => {
                          const count = activeReport.summary[sev]
                          if (count === 0) return null
                          return (
                            <button
                              key={sev}
                              className={`analysis-severity-badge${severityFilter === sev ? ' analysis-severity-badge--active' : ''}`}
                              data-severity={sev}
                              onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}
                            >
                              {sev} {count}
                            </button>
                          )
                        })}
                      </div>

                      {/* Findings list */}
                      <div className="analysis-findings">
                        {filteredFindings.length === 0 && (
                          <div className="analysis-findings-empty">{t('analysis.noFindings')}</div>
                        )}
                        {grouped.map(([group, items]) => (
                          <div key={group} className="analysis-group">
                            <button
                              className="analysis-group-header"
                              onClick={() => toggleGroup(group)}
                            >
                              <span
                                className="analysis-group-chevron"
                                style={{ transform: collapsedGroups.has(group) ? 'rotate(0deg)' : 'rotate(90deg)' }}
                              >
                                {'\u25B6'}
                              </span>
                              <span className="analysis-group-name">{group}</span>
                              <span className="analysis-group-count">{items.length}</span>
                            </button>
                            {!collapsedGroups.has(group) && (
                              <div className="analysis-entries">
                                {items.map((finding) => (
                                  <div key={finding.id}>
                                    <div
                                      className={`analysis-entry${selectedFinding?.id === finding.id ? ' analysis-entry--selected' : ''}`}
                                      onClick={() => handleClickFinding(finding)}
                                    >
                                      <input
                                        type="checkbox"
                                        className="analysis-entry-checkbox"
                                        checked={selectedFindings.has(finding.id)}
                                        onChange={() => toggleFinding(finding.id)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <span
                                        className="analysis-entry-severity"
                                        data-severity={finding.severity}
                                      >
                                        {finding.severity}
                                      </span>
                                      <button
                                        className="analysis-entry-location"
                                        onClick={(e) => { e.stopPropagation(); handleNavigateToFile(finding) }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                      >
                                        {finding.file}:{finding.line}
                                      </button>
                                      <span className="analysis-entry-message">{finding.message}</span>
                                      {finding.rule && (
                                        <span className="analysis-entry-rule">{finding.rule}</span>
                                      )}
                                    </div>
                                    {selectedFinding?.id === finding.id && (
                                      <div className="analysis-finding-detail">
                                        <div className="analysis-finding-detail-row">
                                          <span className="analysis-finding-detail-label">{t('analysis.detailSeverity')}</span>
                                          <span className="analysis-entry-severity" data-severity={finding.severity}>
                                            {finding.severity}
                                          </span>
                                        </div>
                                        <div className="analysis-finding-detail-row">
                                          <span className="analysis-finding-detail-label">{t('analysis.detailFile')}</span>
                                          <button
                                            className="analysis-finding-detail-link"
                                            onClick={() => handleNavigateToFile(finding)}
                                          >
                                            {finding.file}:{finding.line}
                                            {finding.column ? `:${finding.column}` : ''}
                                            {finding.endLine ? ` - ${finding.endLine}${finding.endColumn ? `:${finding.endColumn}` : ''}` : ''}
                                          </button>
                                        </div>
                                        <div className="analysis-finding-detail-row">
                                          <span className="analysis-finding-detail-label">{t('analysis.detailMessage')}</span>
                                          <span className="analysis-finding-detail-value">{finding.message}</span>
                                        </div>
                                        {finding.rule && (
                                          <div className="analysis-finding-detail-row">
                                            <span className="analysis-finding-detail-label">{t('analysis.detailRule')}</span>
                                            <span className="analysis-finding-detail-value">
                                              {finding.ruleUrl ? (
                                                <button
                                                  className="analysis-finding-detail-link"
                                                  onClick={() => finding.ruleUrl && window.open(finding.ruleUrl)}
                                                >
                                                  {finding.rule}
                                                </button>
                                              ) : finding.rule}
                                            </span>
                                          </div>
                                        )}
                                        {finding.cwe && (
                                          <div className="analysis-finding-detail-row">
                                            <span className="analysis-finding-detail-label">CWE</span>
                                            <span className="analysis-finding-detail-value">{finding.cwe}</span>
                                          </div>
                                        )}
                                        {finding.snippet && (
                                          <div className="analysis-finding-detail-snippet">
                                            <span className="analysis-finding-detail-label">{t('analysis.detailSnippet')}</span>
                                            <pre>{finding.snippet}</pre>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Footer */}
                      {activeReport.summary.total > 0 && (
                        <div className="analysis-footer">
                          <div className="analysis-footer-left">
                            <div className="analysis-select-btns">
                              <button className="analysis-select-btn" onClick={selectAll}>
                                {t('analysis.selectAll')}
                              </button>
                              <button className="analysis-select-btn" onClick={deselectAll}>
                                {t('analysis.deselectAll')}
                              </button>
                            </div>
                            <span className="analysis-footer-count">
                              {t('analysis.selectedFindings', { count: String(selectedFindings.size) })}
                            </span>
                          </div>
                          <div className="analysis-footer-right">
                            {activeReportId !== ALL_REPORTS_ID && (
                              <button
                                className="analysis-delete-report-btn"
                                onClick={() => deleteReport(activeReport.id)}
                                title={t('common.delete')}
                              >
                                {'\u00D7'}
                              </button>
                            )}
                            <button
                              className="analysis-create-tickets-btn"
                              disabled={selectedFindings.size === 0}
                              onClick={() => setShowTicketModal(true)}
                            >
                              {t('analysis.createTickets')}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ticket creation modal */}
      {showTicketModal && (
        <div className="analysis-modal-overlay" onClick={() => setShowTicketModal(false)}>
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="analysis-modal-header">
              <h3>{t('analysis.createTickets')}</h3>
              <button className="analysis-modal-close" onClick={() => setShowTicketModal(false)}>
                {'\u00D7'}
              </button>
            </div>
            <div className="analysis-modal-body">
              <div className="analysis-modal-field">
                <span className="analysis-modal-label">
                  {t('analysis.selectedFindings', { count: String(selectedFindings.size) })}
                </span>
              </div>

              <div className="analysis-modal-field">
                <span className="analysis-modal-label">{t('analysis.ticketGroupBy')}</span>
                <select
                  className="analysis-modal-select"
                  value={ticketGroupBy}
                  onChange={(e) => setTicketGroupBy(e.target.value as TicketGroupBy)}
                >
                  <option value="individual">{t('analysis.ticketGroupIndividual')}</option>
                  <option value="file">{t('analysis.ticketGroupFile')}</option>
                  <option value="rule">{t('analysis.ticketGroupRule')}</option>
                  <option value="severity">{t('analysis.ticketGroupSeverity')}</option>
                </select>
              </div>

              <div className="analysis-modal-field">
                <span className="analysis-modal-label">{t('analysis.ticketPriority')}</span>
                <select
                  className="analysis-modal-select"
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as 'low' | 'medium' | 'high')}
                >
                  <option value="low">{t('kanban.low')}</option>
                  <option value="medium">{t('kanban.medium')}</option>
                  <option value="high">{t('kanban.high')}</option>
                </select>
              </div>

              <div className="analysis-modal-preview">
                {t('analysis.ticketPreview', { count: String(ticketPreviewCount) })}
              </div>
            </div>
            <div className="analysis-modal-actions">
              <button className="analysis-modal-cancel" onClick={() => setShowTicketModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="analysis-modal-submit"
                disabled={selectedFindings.size === 0}
                onClick={handleCreateTickets}
              >
                {t('analysis.createButton', { count: String(ticketPreviewCount) })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toastMessage && (
        <div className="analysis-toast">{toastMessage}</div>
      )}
    </div>
  )
}
