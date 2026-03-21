import type { PipelineStatus, StageStatus } from '../../../shared/types'

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '-'
  const date = new Date(isoString)
  const now = Date.now()
  const diffSec = Math.floor((now - date.getTime()) / 1000)

  const pad = (n: number): string => String(n).padStart(2, '0')
  const dateStr = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`

  let relative: string
  if (diffSec < 60) relative = `${diffSec}s`
  else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m`
  else if (diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h`
  else if (diffSec < 2592000) relative = `${Math.floor(diffSec / 86400)}j`
  else relative = `${Math.floor(diffSec / 2592000)} mois`

  return `${dateStr} (${relative})`
}

export function formatStageDateTime(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDuration(startTime: string | null, finishTime: string | null): string {
  if (!startTime) return '-'
  const start = new Date(startTime).getTime()
  const end = finishTime ? new Date(finishTime).getTime() : Date.now()
  const diffSec = Math.floor((end - start) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) {
    const minutes = Math.floor(diffSec / 60)
    const seconds = diffSec % 60
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  const hours = Math.floor(diffSec / 3600)
  const minutes = Math.floor((diffSec % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

export function statusIcon(status: PipelineStatus): string {
  switch (status) {
    case 'succeeded': return '\u2705'
    case 'failed': return '\u274C'
    case 'canceled': return '\u26D4'
    case 'running': return '\u23F3'
    case 'notStarted': return '\u23F8\uFE0F'
    default: return '\u2753'
  }
}

export function stageStatusIcon(status: StageStatus): string {
  switch (status) {
    case 'succeeded': return '\u2705'
    case 'failed': return '\u274C'
    case 'canceled': return '\u26D4'
    case 'running': return '\u23F3'
    case 'pending': return '\u23F8\uFE0F'
    case 'notStarted': return '\u2B58'
    default: return '\u2753'
  }
}
