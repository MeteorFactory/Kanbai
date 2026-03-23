import { useEffect, useState, useCallback } from 'react'
import { useInstallerStore } from './installer-store'
import { useI18n } from '../../lib/i18n'
import { useWorkspaceStore } from '../workspace'
import { Terminal } from '../terminal'
import type { PrerequisiteInfo, PrerequisiteId, PrerequisiteStatus } from '../../../shared/types'

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
}

/** Shell commands to install each prerequisite */
const INSTALL_COMMANDS: Record<PrerequisiteId, string> = {
  brew: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  node: 'brew install node',
  npm: 'brew install node',
}

function PrerequisiteRow({
  item,
  onInstall,
  disabled,
}: {
  item: PrerequisiteInfo
  onInstall: (id: PrerequisiteId) => void
  disabled: boolean
}) {
  const { t } = useI18n()
  const statusClass =
    item.status === 'installed' ? 'installer-status--ok'
    : item.status === 'installing' ? 'installer-status--progress'
    : item.status === 'failed' ? 'installer-status--error'
    : item.status === 'skipped' ? 'installer-status--skipped'
    : 'installer-status--missing'

  return (
    <div className={`installer-row ${statusClass}`}>
      <span className="installer-row-icon">{STATUS_ICONS[item.status]}</span>
      <span className="installer-row-name">{PREREQUISITE_LABELS[item.id] || item.id}</span>
      <span className="installer-row-version">
        {item.version || (item.status === 'skipped' ? t('installer.skipped') : t('installer.notDetected'))}
      </span>
      {(item.status === 'missing' || item.status === 'failed') && (
        <button
          className="installer-row-btn"
          onClick={() => onInstall(item.id)}
          disabled={disabled}
        >
          {t('updates.install')}
        </button>
      )}
    </div>
  )
}

export function SetupWizard() {
  const { t } = useI18n()
  const {
    prerequisites,
    isChecking,
    dismissed,
    checkPrerequisites,
    dismiss,
  } = useInstallerStore()

  // Terminal state: which command is running in the embedded terminal
  const [terminalCommand, setTerminalCommand] = useState<string | null>(null)
  const [terminalDone, setTerminalDone] = useState(false)

  useEffect(() => {
    checkPrerequisites()
  }, [checkPrerequisites])

  const handleInstall = useCallback((id: PrerequisiteId) => {
    const command = INSTALL_COMMANDS[id]
    if (!command) return
    setTerminalCommand(command)
    setTerminalDone(false)
  }, [])

  const handleInstallAll = useCallback(() => {
    const missing = prerequisites.filter((p) => p.status === 'missing' || p.status === 'failed')
    if (missing.length === 0) return
    const commands = missing.map((p) => INSTALL_COMMANDS[p.id]).filter(Boolean)
    setTerminalCommand(commands.join(' && '))
    setTerminalDone(false)
  }, [prerequisites])

  const handleTerminalClose = useCallback(() => {
    setTerminalDone(true)
  }, [])

  const handleRecheck = useCallback(() => {
    setTerminalCommand(null)
    setTerminalDone(false)
    checkPrerequisites()
  }, [checkPrerequisites])

  // Don't show if dismissed or still checking
  if (dismissed) return null
  if (isChecking && prerequisites.length === 0) return null

  // Don't show if all prerequisites are installed or skipped
  const hasMissing = prerequisites.some((p) => p.status === 'missing' || p.status === 'failed')
  if (!hasMissing && !terminalCommand) return null

  const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId || ''
  const isTerminalActive = terminalCommand !== null

  return (
    <div className="modal-overlay">
      <div className={`modal-dialog installer-dialog${isTerminalActive ? ' installer-dialog--terminal' : ''}`}>
        <div className="modal-header">{t('installer.title')}</div>
        <div className="modal-body">
          {!isTerminalActive && (
            <>
              <p className="installer-description">{t('installer.description')}</p>
              <div className="installer-list">
                {prerequisites.map((item) => (
                  <PrerequisiteRow key={item.id} item={item} onInstall={handleInstall} disabled={false} />
                ))}
              </div>
            </>
          )}
          {isTerminalActive && (
            <div className="installer-terminal">
              <Terminal
                initialCommand={terminalCommand}
                workspaceId={activeWorkspaceId}
                isVisible={true}
                fontSize={12}
                isSplit={true}
                onClose={handleTerminalClose}
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          {!isTerminalActive && (
            <>
              <button className="modal-btn modal-btn--secondary" onClick={dismiss}>
                {t('installer.skip')}
              </button>
              <button className="modal-btn modal-btn--primary" onClick={handleInstallAll}>
                {t('installer.installAll')}
              </button>
            </>
          )}
          {isTerminalActive && terminalDone && (
            <button className="modal-btn modal-btn--primary" onClick={handleRecheck}>
              {t('installer.recheck')}
            </button>
          )}
          {isTerminalActive && !terminalDone && (
            <span className="installer-hint">{t('installer.waitingForTerminal')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
