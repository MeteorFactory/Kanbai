import { useCallback, useState } from 'react'
import { useI18n } from '../../lib/i18n'

export function ErrorActions({
  message,
  location,
  pipelineName,
  onCreateTicket,
}: {
  message: string
  location: string
  pipelineName?: string
  onCreateTicket: (title: string, description: string) => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const handleCreateTicket = useCallback(() => {
    const title = `[Pipeline${pipelineName ? ` ${pipelineName}` : ''}] ${location}`
    const description = `**Source:** ${location}\n\n**Error:**\n\`\`\`\n${message}\n\`\`\``
    onCreateTicket(title, description)
  }, [message, location, pipelineName, onCreateTicket])

  return (
    <span className="devops-error-actions">
      <button
        className="devops-btn devops-btn--icon"
        onClick={(e) => { e.stopPropagation(); handleCopy() }}
        title={t('devops.copyError')}
      >
        {copied ? '\u2705' : '\uD83D\uDCCB'}
      </button>
      <button
        className="devops-btn devops-btn--icon"
        onClick={(e) => { e.stopPropagation(); handleCreateTicket() }}
        title={t('devops.createTicket')}
      >
        {'\uD83C\uDFAB'}
      </button>
    </span>
  )
}
