import { useEffect } from 'react'
import { useInstallerStore } from './installer-store'
import { useI18n } from '../../lib/i18n'
import type { PrerequisiteInfo, PrerequisiteStatus } from '../../../shared/types'

const STATUS_ICONS: Record<PrerequisiteStatus, string> = {
  installed: '\u2713',
  missing: '\u2717',
  installing: '\u21BB',
  failed: '\u26A0',
  skipped: '\u2014',
}

const PREREQUISITE_LABELS: Record<string, string> = {
  brew: 'Homebrew',
  node: 'Node.js',
  npm: 'npm',
  claude: 'Claude Code',
}

function PrerequisiteRow({ item }: { item: PrerequisiteInfo }) {
  const { t } = useI18n()
  const statusClass =
    item.status === 'installed' ? 'installer-status--ok'
    : item.status === 'installing' ? 'installer-status--progress'
    : item.status === 'failed' ? 'installer-status--error'
    : item.status === 'skipped' ? 'installer-status--skipped'
    : 'installer-status--missing'

  return (
    <div className={`installer-row ${statusClass}`}>
      <span className="installer-row-icon">
        {item.status === 'installing' ? (
          <span className="notification-spinner">{STATUS_ICONS[item.status]}</span>
        ) : (
          STATUS_ICONS[item.status]
        )}
      </span>
      <span className="installer-row-name">{PREREQUISITE_LABELS[item.id] || item.id}</span>
      <span className="installer-row-version">
        {item.version || (item.status === 'skipped' ? t('installer.skipped') : t('installer.notDetected'))}
      </span>
      {item.error && (
        <span className="installer-row-error" title={item.error}>
          {item.error.substring(0, 80)}
        </span>
      )}
    </div>
  )
}

export function SetupWizard() {
  const { t } = useI18n()
  const {
    prerequisites,
    isChecking,
    isInstalling,
    result,
    dismissed,
    checkPrerequisites,
    startCascadeInstall,
    dismiss,
    initProgressListener,
  } = useInstallerStore()

  useEffect(() => {
    checkPrerequisites()
  }, [checkPrerequisites])

  useEffect(() => {
    const cleanup = initProgressListener()
    return cleanup
  }, [initProgressListener])

  // Don't show if dismissed or still checking
  if (dismissed) return null
  if (isChecking && prerequisites.length === 0) return null

  // Don't show if all prerequisites are installed or skipped
  const hasMissing = prerequisites.some((p) => p.status === 'missing' || p.status === 'failed')
  if (!hasMissing && !isInstalling && !result) return null

  // All installed after successful cascade
  if (result?.success) {
    return (
      <div className="modal-overlay">
        <div className="modal-dialog installer-dialog">
          <div className="modal-header">{t('installer.title')}</div>
          <div className="modal-body">
            <p className="installer-success">{t('installer.allInstalled')}</p>
            <div className="installer-list">
              {prerequisites.map((item) => (
                <PrerequisiteRow key={item.id} item={item} />
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn modal-btn--primary" onClick={dismiss}>
              {t('installer.continue')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-dialog installer-dialog">
        <div className="modal-header">{t('installer.title')}</div>
        <div className="modal-body">
          <p className="installer-description">{t('installer.description')}</p>
          <div className="installer-list">
            {prerequisites.map((item) => (
              <PrerequisiteRow key={item.id} item={item} />
            ))}
          </div>
          {result && !result.success && (
            <p className="installer-error">{result.error}</p>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn--secondary" onClick={dismiss}>
            {t('installer.skip')}
          </button>
          <button
            className="modal-btn modal-btn--primary"
            onClick={startCascadeInstall}
            disabled={isInstalling}
          >
            {isInstalling ? t('installer.installing') : t('installer.installAll')}
          </button>
        </div>
      </div>
    </div>
  )
}
