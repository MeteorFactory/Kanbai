import { StatusDot } from './devops-icons'
import { formatRelativeTime } from './devops-utils'
import type { PipelineDefinition } from '../../../shared/types'

export function PipelineCard({
  pipeline,
  index,
  isSelected,
  onSelect,
  onRun,
  onOpenUrl,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}: {
  pipeline: PipelineDefinition
  index: number
  isSelected: boolean
  onSelect: () => void
  onRun: () => void
  onOpenUrl: () => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  isDragOver: boolean
}) {
  const latestRun = pipeline.latestRun
  const status = latestRun?.status ?? 'unknown'

  return (
    <div
      className={`devops-pipeline-card${isSelected ? ' devops-pipeline-card--selected' : ''}${isDragOver ? ' devops-pipeline-card--drag-over' : ''}`}
      data-status={status}
      onClick={onSelect}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <div className="devops-pipeline-card-header">
        <StatusDot status={status} size={10} />
        <span className="devops-pipeline-card-name">{pipeline.name}</span>
        {pipeline.folder !== '\\' && (
          <span className="devops-pipeline-card-folder">{pipeline.folder}</span>
        )}
        <div className="devops-pipeline-card-actions">
          <button className="devops-btn devops-btn--small" onClick={(e) => { e.stopPropagation(); onRun() }} title="Run pipeline">
            {'\u25B6'}
          </button>
          {pipeline.url && (
            <button className="devops-btn devops-btn--small" onClick={(e) => { e.stopPropagation(); onOpenUrl() }} title="Open in browser">
              {'\u2197'}
            </button>
          )}
        </div>
      </div>
      {latestRun && (
        <div className="devops-pipeline-card-info">
          <span className="devops-pipeline-card-branch">{latestRun.sourceBranch}</span>
          <span className="devops-pipeline-card-time">{formatRelativeTime(latestRun.finishTime ?? latestRun.startTime)}</span>
          <span className="devops-pipeline-card-by">{latestRun.requestedBy}</span>
        </div>
      )}
    </div>
  )
}
