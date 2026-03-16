import { useState, useEffect, useCallback } from 'react'
import type { AiProviderId } from '../../../shared/types/ai-provider'
import { AI_PROVIDER_IDS, AI_PROVIDERS } from '../../../shared/types/ai-provider'
import { useI18n } from '../../lib/i18n'

interface AiProviderSelectorProps {
  value: AiProviderId
  onChange: (provider: AiProviderId) => void
  showInstall?: boolean
}

export function AiProviderSelector({ value, onChange, showInstall = true }: AiProviderSelectorProps) {
  const { t } = useI18n()
  const [installStatus, setInstallStatus] = useState<Record<string, boolean>>({})
  const [installing, setInstalling] = useState<string | null>(null)
  const [installResult, setInstallResult] = useState<Record<string, 'success' | 'failed'>>({})

  useEffect(() => {
    if (showInstall) {
      window.kanbai.aiProvider.checkInstalled().then(setInstallStatus)
    }
  }, [showInstall])

  // Listen for install status updates
  useEffect(() => {
    const unsubscribe = window.kanbai.updates.onStatus((data: unknown) => {
      const status = data as { tool: string; status: string }
      if (AI_PROVIDER_IDS.includes(status.tool as AiProviderId)) {
        if (status.status === 'completed') {
          setInstalling(null)
          setInstallResult((prev) => ({ ...prev, [status.tool]: 'success' }))
          setInstallStatus((prev) => ({ ...prev, [status.tool]: true }))
        } else if (status.status === 'failed') {
          setInstalling(null)
          setInstallResult((prev) => ({ ...prev, [status.tool]: 'failed' }))
        }
      }
    })
    return () => { unsubscribe() }
  }, [])

  const handleInstall = useCallback(async (providerId: AiProviderId, e: React.MouseEvent) => {
    e.stopPropagation()
    setInstalling(providerId)
    setInstallResult((prev) => {
      const next = { ...prev }
      delete next[providerId]
      return next
    })
    const result = await window.kanbai.updates.install(providerId, 'global')
    if (!result.success) {
      setInstalling(null)
      setInstallResult((prev) => ({ ...prev, [providerId]: 'failed' }))
    }
  }, [])

  return (
    <div className="settings-radio-group">
      {AI_PROVIDER_IDS.map((id) => {
        const config = AI_PROVIDERS[id]
        const isInstalled = installStatus[id]
        const isChecked = installStatus[id] === undefined
        const isInstallingThis = installing === id
        const result = installResult[id]

        return (
          <div key={id} className="ai-provider-option">
            <button
              className={`settings-radio-btn${value === id ? ' settings-radio-btn--active' : ''}`}
              onClick={() => onChange(id)}
            >
              {config.displayName}
            </button>
            {showInstall && !isChecked && !isInstalled && !isInstallingThis && !result && (
              <button
                className="ai-provider-install-btn"
                onClick={(e) => handleInstall(id, e)}
                title={t('ai.install')}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v6M3 5l2 2 2-2M2 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('ai.install')}
              </button>
            )}
            {showInstall && isInstallingThis && (
              <span className="ai-provider-status ai-provider-status--installing">
                {t('ai.installing')}
              </span>
            )}
            {showInstall && result === 'success' && (
              <span className="ai-provider-status ai-provider-status--success">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            {showInstall && result === 'failed' && (
              <span className="ai-provider-status ai-provider-status--failed">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
