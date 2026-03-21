import { useCallback, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { AzureDevOpsIcon, GitHubIcon } from './devops-icons'
import type {
  DevOpsConnection,
  DevOpsAuth,
  DevOpsAuthMethod,
  DevOpsProvider,
} from '../../../shared/types'

export function ConnectionFormModal({
  onSave,
  onClose,
  onBack,
  initial,
  provider,
}: {
  onSave: (data: { name: string; organizationUrl: string; projectName: string; auth: DevOpsAuth; provider?: DevOpsProvider }) => void
  onClose: () => void
  onBack?: () => void
  initial?: DevOpsConnection
  provider?: DevOpsProvider
}) {
  const { t } = useI18n()
  const currentProvider = initial?.provider ?? provider ?? 'azure-devops'
  const isGitHub = currentProvider === 'github'

  const [name, setName] = useState(initial?.name ?? '')
  const [organizationUrl, setOrganizationUrl] = useState(initial?.organizationUrl ?? '')
  const [projectName, setProjectName] = useState(initial?.projectName ?? '')

  // Determine default auth method based on provider
  const defaultAuthMethod: DevOpsAuthMethod = initial?.auth.method ?? (isGitHub ? 'github-pat' : 'pat')
  const [authMethod, setAuthMethod] = useState<DevOpsAuthMethod>(defaultAuthMethod)

  // Azure DevOps auth fields
  const [pat, setPat] = useState(initial?.auth.method === 'pat' ? initial.auth.token : '')
  const [clientId, setClientId] = useState(initial?.auth.method === 'oauth2' ? initial.auth.clientId : '')
  const [clientSecret, setClientSecret] = useState(initial?.auth.method === 'oauth2' ? initial.auth.clientSecret : '')
  const [tenantId, setTenantId] = useState(initial?.auth.method === 'oauth2' ? initial.auth.tenantId : '')

  // GitHub auth fields
  const [githubPat, setGithubPat] = useState(initial?.auth.method === 'github-pat' ? initial.auth.token : '')
  const [appId, setAppId] = useState(initial?.auth.method === 'github-app' ? initial.auth.appId : '')
  const [installationId, setInstallationId] = useState(initial?.auth.method === 'github-app' ? initial.auth.installationId : '')
  const [privateKey, setPrivateKey] = useState(initial?.auth.method === 'github-app' ? initial.auth.privateKey : '')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const buildAuth = useCallback((): DevOpsAuth => {
    if (authMethod === 'pat') {
      return { method: 'pat', token: pat }
    }
    if (authMethod === 'oauth2') {
      return { method: 'oauth2', clientId, clientSecret, tenantId }
    }
    if (authMethod === 'github-pat') {
      return { method: 'github-pat', token: githubPat }
    }
    return { method: 'github-app', appId, installationId, privateKey }
  }, [authMethod, pat, clientId, clientSecret, tenantId, githubPat, appId, installationId, privateKey])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    const auth = buildAuth()
    const connection: DevOpsConnection = {
      id: 'test',
      name,
      provider: currentProvider,
      organizationUrl: organizationUrl.replace(/\/$/, ''),
      projectName,
      auth,
      createdAt: 0,
      updatedAt: 0,
    }
    const result = await window.kanbai.devops.testConnection(connection)
    setTestResult(result)
    setTesting(false)
  }, [name, organizationUrl, projectName, buildAuth, currentProvider])

  const handleSubmit = useCallback(() => {
    onSave({
      name: name.trim(),
      organizationUrl: organizationUrl.replace(/\/$/, '').trim(),
      projectName: projectName.trim(),
      auth: buildAuth(),
      provider: currentProvider,
    })
  }, [name, organizationUrl, projectName, buildAuth, onSave, currentProvider])

  const isValid = (() => {
    if (!name.trim()) return false
    if (isGitHub) {
      if (!organizationUrl.trim() || !projectName.trim()) return false
      if (authMethod === 'github-pat') return !!githubPat.trim()
      if (authMethod === 'github-app') return !!(appId.trim() && installationId.trim() && privateKey.trim())
      return false
    }
    if (!organizationUrl.trim() || !projectName.trim()) return false
    if (authMethod === 'pat') return !!pat.trim()
    if (authMethod === 'oauth2') return !!(clientId.trim() && clientSecret.trim() && tenantId.trim())
    return false
  })()

  const ProviderIcon = isGitHub ? GitHubIcon : AzureDevOpsIcon

  return (
    <div className="devops-modal-overlay" onClick={onClose}>
      <div className="devops-modal-container devops-modal-container--form" onClick={(e) => e.stopPropagation()}>
        <div className="devops-modal-header">
          <div className="devops-modal-header-left">
            {onBack && (
              <button className="devops-modal-back" onClick={onBack} title={t('devops.back')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <ProviderIcon size={22} />
            <h3>{initial ? t('devops.editConnection') : t('devops.addConnection')}</h3>
          </div>
          <button className="devops-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="devops-modal-body">
          <div className="devops-field">
            <label className="devops-field-label">{t('devops.connectionName')}</label>
            <input
              className="devops-field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isGitHub ? 'My GitHub' : 'My Azure DevOps'}
            />
          </div>

          <div className="devops-field">
            <label className="devops-field-label">{isGitHub ? t('devops.owner') : t('devops.organizationUrl')}</label>
            <input
              className="devops-field-input"
              value={organizationUrl}
              onChange={(e) => setOrganizationUrl(e.target.value)}
              placeholder={isGitHub ? 'my-org' : 'https://dev.azure.com/myorg'}
            />
          </div>

          <div className="devops-field">
            <label className="devops-field-label">{isGitHub ? t('devops.repository') : t('devops.projectName')}</label>
            <input
              className="devops-field-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={isGitHub ? 'my-repo' : 'MyProject'}
            />
          </div>

          <div className="devops-field">
            <label className="devops-field-label">{t('devops.authMethod')}</label>
            <div className="devops-auth-toggle">
              {isGitHub ? (
                <>
                  <button
                    className={`devops-auth-btn${authMethod === 'github-pat' ? ' devops-auth-btn--active' : ''}`}
                    onClick={() => setAuthMethod('github-pat')}
                  >
                    PAT
                  </button>
                  <button
                    className={`devops-auth-btn${authMethod === 'github-app' ? ' devops-auth-btn--active' : ''}`}
                    onClick={() => setAuthMethod('github-app')}
                  >
                    GitHub App
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`devops-auth-btn${authMethod === 'pat' ? ' devops-auth-btn--active' : ''}`}
                    onClick={() => setAuthMethod('pat')}
                  >
                    PAT
                  </button>
                  <button
                    className={`devops-auth-btn${authMethod === 'oauth2' ? ' devops-auth-btn--active' : ''}`}
                    onClick={() => setAuthMethod('oauth2')}
                  >
                    OAuth2
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Azure DevOps auth fields */}
          {!isGitHub && authMethod === 'pat' && (
            <div className="devops-field">
              <label className="devops-field-label">Personal Access Token</label>
              <input
                className="devops-field-input"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          )}
          {!isGitHub && authMethod === 'oauth2' && (
            <>
              <div className="devops-field">
                <label className="devops-field-label">Tenant ID</label>
                <input
                  className="devops-field-input"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="devops-field">
                <label className="devops-field-label">Client ID</label>
                <input
                  className="devops-field-input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="devops-field">
                <label className="devops-field-label">Client Secret</label>
                <input
                  className="devops-field-input"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="..."
                />
              </div>
            </>
          )}

          {/* GitHub auth fields */}
          {isGitHub && authMethod === 'github-pat' && (
            <div className="devops-field">
              <label className="devops-field-label">Personal Access Token</label>
              <input
                className="devops-field-input"
                type="password"
                value={githubPat}
                onChange={(e) => setGithubPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          )}
          {isGitHub && authMethod === 'github-app' && (
            <>
              <div className="devops-field">
                <label className="devops-field-label">App ID</label>
                <input
                  className="devops-field-input"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="123456"
                />
              </div>
              <div className="devops-field">
                <label className="devops-field-label">Installation ID</label>
                <input
                  className="devops-field-input"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                  placeholder="12345678"
                />
              </div>
              <div className="devops-field">
                <label className="devops-field-label">{t('devops.privateKey')}</label>
                <textarea
                  className="devops-field-input devops-field-textarea"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----"
                  rows={4}
                />
              </div>
            </>
          )}

          {testResult && (
            <div className={`devops-test-result devops-test-result--${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? t('devops.connectionSuccess') : `${t('devops.connectionFailed')}: ${testResult.error}`}
            </div>
          )}
        </div>
        <div className="devops-modal-footer">
          <button
            className="devops-modal-btn devops-modal-btn--test"
            onClick={handleTest}
            disabled={!isValid || testing}
          >
            {testing ? t('devops.testing') : t('devops.testConnection')}
          </button>
          <div className="devops-modal-footer-right">
            <button className="devops-modal-btn devops-modal-btn--secondary" onClick={onClose}>
              {t('devops.cancel')}
            </button>
            <button
              className="devops-modal-btn devops-modal-btn--primary"
              onClick={handleSubmit}
              disabled={!isValid}
            >
              {t('devops.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
