import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'

interface ClaudeInfoPanelProps {
  projectPath: string
  onClose: () => void
}

interface ScanResult {
  hasClaude: boolean
  claudeMd?: string | null
  settings?: Record<string, unknown> | null
}

function extractPermissionMode(settings: Record<string, unknown> | null | undefined): string | null {
  if (!settings) return null
  const permissions = settings['permissions'] as Record<string, unknown> | undefined
  if (permissions && typeof permissions === 'object') {
    const mode = permissions['defaultMode']
    if (typeof mode === 'string') return mode
  }
  return null
}

function getPermissionLabel(mode: string): { label: string; className: string } {
  switch (mode) {
    case 'bypassPermissions':
      return { label: 'Bypass (tout automatique)', className: 'claude-perm--bypass' }
    case 'acceptEdits':
      return { label: 'Accept Edits', className: 'claude-perm--accept' }
    case 'plan':
      return { label: 'Plan Mode', className: 'claude-perm--plan' }
    case 'deny':
      return { label: 'Deny', className: 'claude-perm--deny' }
    default:
      return { label: mode, className: 'claude-perm--default' }
  }
}

function extractAllowedTools(settings: Record<string, unknown> | null | undefined): string[] {
  if (!settings) return []
  const permissions = settings['permissions'] as Record<string, unknown> | undefined
  if (!permissions || typeof permissions !== 'object') return []
  const allow = permissions['allow'] as string[] | undefined
  return Array.isArray(allow) ? allow : []
}

function extractDeniedTools(settings: Record<string, unknown> | null | undefined): string[] {
  if (!settings) return []
  const permissions = settings['permissions'] as Record<string, unknown> | undefined
  if (!permissions || typeof permissions !== 'object') return []
  const deny = permissions['deny'] as string[] | undefined
  return Array.isArray(deny) ? deny : []
}

export function ClaudeInfoPanel({ projectPath, onClose }: ClaudeInfoPanelProps) {
  const { t } = useI18n()
  const [data, setData] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'claudemd'>('overview')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result: ScanResult = await window.kanbai.project.scanClaude(projectPath)
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectPath])

  const permMode = extractPermissionMode(data?.settings)
  const permInfo = permMode ? getPermissionLabel(permMode) : null
  const allowedTools = extractAllowedTools(data?.settings)
  const deniedTools = extractDeniedTools(data?.settings)
  const hasClaudeMd = !!data?.claudeMd
  const hasSettings = !!data?.settings

  return (
    <div className="claude-info-panel">
      <div className="claude-info-header">
        <span className="claude-info-title">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="claude-info-icon">
            <path
              d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z"
              stroke="var(--claude-color)"
              strokeWidth="1.2"
              fill="none"
            />
            <circle cx="8" cy="8" r="2" fill="var(--claude-color)" />
          </svg>
          {t('claudeInfo.title')}
        </span>
        <button className="claude-info-close btn-icon" onClick={onClose} title={t('common.close')}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="claude-info-body">
          <span className="claude-info-loading">{t('common.loading')}</span>
        </div>
      ) : !data?.hasClaude ? (
        <div className="claude-info-body">
          <span className="claude-info-empty">
            {t('claudeInfo.detected')}
          </span>
        </div>
      ) : (
        <>
          <div className="claude-info-tabs">
            <button
              className={`claude-info-tab${activeTab === 'overview' ? ' claude-info-tab--active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              {t('claudeInfo.quickView')}
            </button>
            {hasClaudeMd && (
              <button
                className={`claude-info-tab${activeTab === 'claudemd' ? ' claude-info-tab--active' : ''}`}
                onClick={() => setActiveTab('claudemd')}
              >
                CLAUDE.md
              </button>
            )}
          </div>

          <div className="claude-info-body">
            {activeTab === 'overview' && (
              <div className="claude-info-overview">
                {/* Badges */}
                <div className="claude-info-badges">
                  {hasClaudeMd && <span className="claude-info-badge">CLAUDE.md</span>}
                  {hasSettings && <span className="claude-info-badge">settings.json</span>}
                </div>

                {/* Permission mode indicator */}
                {permInfo && (
                  <div className="claude-info-section">
                    <span className="claude-info-label">{t('claudeInfo.permissionMode')}</span>
                    <span className={`claude-info-perm ${permInfo.className}`}>
                      {permInfo.label}
                    </span>
                  </div>
                )}

                {/* Allowed tools */}
                {allowedTools.length > 0 && (
                  <div className="claude-info-section">
                    <span className="claude-info-label">{t('claudeInfo.allowedTools')}</span>
                    <div className="claude-info-tool-list">
                      {allowedTools.map((tool) => (
                        <span key={tool} className="claude-info-tool claude-info-tool--allow">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Denied tools */}
                {deniedTools.length > 0 && (
                  <div className="claude-info-section">
                    <span className="claude-info-label">{t('claudeInfo.blockedTools')}</span>
                    <div className="claude-info-tool-list">
                      {deniedTools.map((tool) => (
                        <span key={tool} className="claude-info-tool claude-info-tool--deny">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* No settings info */}
                {!hasSettings && !hasClaudeMd && (
                  <span className="claude-info-empty">
                    {t('claudeInfo.emptyFolder')}
                  </span>
                )}
              </div>
            )}

            {activeTab === 'claudemd' && hasClaudeMd && (
              <pre className="claude-info-content">{data?.claudeMd}</pre>
            )}
          </div>
        </>
      )}
    </div>
  )
}
