import { useI18n } from '../../lib/i18n'
import { AzureDevOpsIcon, GitHubIcon } from './devops-icons'
import type { DevOpsProvider } from '../../../shared/types'

export function ProviderSelection({
  onSelect,
  onClose,
}: {
  onSelect: (provider: DevOpsProvider) => void
  onClose: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="devops-modal-overlay" onClick={onClose}>
      <div className="devops-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="devops-modal-header">
          <h3>{t('devops.selectProvider')}</h3>
          <button className="devops-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <p className="devops-modal-desc">{t('devops.selectProviderDesc')}</p>
        <div className="devops-provider-list">
          <button
            className="devops-provider-item"
            onClick={() => onSelect('azure-devops')}
          >
            <div className="devops-provider-item-icon">
              <AzureDevOpsIcon size={32} />
            </div>
            <div className="devops-provider-item-text">
              <span className="devops-provider-item-name">Azure DevOps</span>
              <span className="devops-provider-item-desc">{t('devops.azureDevOpsDesc')}</span>
            </div>
            <svg className="devops-provider-item-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="devops-provider-item"
            onClick={() => onSelect('github')}
          >
            <div className="devops-provider-item-icon">
              <GitHubIcon size={32} />
            </div>
            <div className="devops-provider-item-text">
              <span className="devops-provider-item-name">GitHub</span>
              <span className="devops-provider-item-desc">{t('devops.githubDesc')}</span>
            </div>
            <svg className="devops-provider-item-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="devops-modal-footer">
          <button className="devops-modal-btn devops-modal-btn--secondary" onClick={onClose}>
            {t('devops.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
