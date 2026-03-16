import { useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'

interface CopyableErrorProps {
  error: string
  className?: string
}

export function CopyableError({ error, className }: CopyableErrorProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    try {
      window.kanbai.clipboard.writeText(error)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback to navigator.clipboard if preload API is unavailable
      navigator.clipboard.writeText(error).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => { /* clipboard access denied */ })
    }
  }, [error])

  return (
    <div className={`copyable-error ${className ?? ''}`}>
      <pre className="copyable-error-text">{error}</pre>
      <button
        className="copyable-error-btn"
        onClick={handleCopy}
        title={t('common.copy')}
      >
        {copied ? '\u2713' : '\u2398'}
      </button>
    </div>
  )
}
