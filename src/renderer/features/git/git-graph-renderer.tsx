import { useMemo } from 'react'
import type { GraphCommitInfo } from './git-types'
import { GRAPH_COLORS } from './git-graph'

export const LANE_WIDTH = 20
export const ROW_HEIGHT = 28
const DOT_RADIUS = 5
const MERGE_DOT_RADIUS = 6

interface BranchSegment {
  lane: number
  startRow: number
  endRow: number
  color: string
}

interface CurveConnection {
  fromLane: number
  toLane: number
  row: number
  color: string
}

interface CherryPickConnection {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  color: string
}

interface CommitDot {
  row: number
  lane: number
  color: string
  isMerge: boolean
}

interface GraphPaths {
  segments: BranchSegment[]
  curves: CurveConnection[]
  cherryPicks: CherryPickConnection[]
  dots: CommitDot[]
}

function buildGraphPaths(data: GraphCommitInfo[]): GraphPaths {
  const segments: BranchSegment[] = []
  const curves: CurveConnection[] = []
  const cherryPicks: CherryPickConnection[] = []
  const dots: CommitDot[] = []

  // Track active lane spans: lane -> startRow
  const laneSpans = new Map<number, { startRow: number; color: string }>()

  // Build hash -> row index for cherry-pick lookup
  const hashToRow = new Map<string, number>()
  for (let i = 0; i < data.length; i++) {
    hashToRow.set(data[i]!.entry.hash, i)
  }

  for (let row = 0; row < data.length; row++) {
    const info = data[row]!
    const isMerge = info.entry.parents.length > 1

    // Collect which lanes are active in this row (from connections)
    const activeLanesThisRow = new Set<number>()

    for (const conn of info.connections) {
      if (conn.type === 'straight') {
        activeLanesThisRow.add(conn.fromLane)
      } else {
        // Curve: from dotLane to another lane
        curves.push({
          fromLane: conn.fromLane,
          toLane: conn.toLane,
          row,
          color: conn.color,
        })
        // The source lane is active up to this row
        activeLanesThisRow.add(conn.fromLane)
        // The target lane starts from this row
        activeLanesThisRow.add(conn.toLane)
      }
    }

    // Finalize lane spans that are no longer active
    for (const [lane, span] of laneSpans) {
      if (!activeLanesThisRow.has(lane)) {
        segments.push({ lane, startRow: span.startRow, endRow: row - 1, color: span.color })
        laneSpans.delete(lane)
      }
    }

    // Start or extend lane spans
    for (const lane of activeLanesThisRow) {
      if (!laneSpans.has(lane)) {
        const color = GRAPH_COLORS[lane % GRAPH_COLORS.length]!
        laneSpans.set(lane, { startRow: row, color })
      }
    }

    // Commit dot
    dots.push({
      row,
      lane: info.dotLane,
      color: GRAPH_COLORS[info.dotLane % GRAPH_COLORS.length]!,
      isMerge,
    })

    // Cherry-pick connection
    if (info.entry.cherryPickOf) {
      const targetRow = hashToRow.get(info.entry.cherryPickOf)
      if (targetRow !== undefined) {
        const targetInfo = data[targetRow]!
        cherryPicks.push({
          fromRow: row,
          fromLane: info.dotLane,
          toRow: targetRow,
          toLane: targetInfo.dotLane,
          color: GRAPH_COLORS[info.dotLane % GRAPH_COLORS.length]!,
        })
      }
    }
  }

  // Finalize remaining open spans
  for (const [lane, span] of laneSpans) {
    segments.push({ lane, startRow: span.startRow, endRow: data.length - 1, color: span.color })
  }

  return { segments, curves, cherryPicks, dots }
}

export function GitGraph({ data, maxLane, rowHeight, laneWidth }: {
  data: GraphCommitInfo[]
  maxLane: number
  rowHeight: number
  laneWidth: number
}) {
  const { segments, curves, cherryPicks, dots } = useMemo(
    () => buildGraphPaths(data), [data],
  )
  const svgHeight = data.length * rowHeight
  const svgWidth = (maxLane + 1) * laneWidth + 12

  const laneX = (lane: number) => lane * laneWidth + laneWidth / 2
  const rowY = (row: number) => row * rowHeight + rowHeight / 2

  return (
    <svg width={svgWidth} height={svgHeight} className="git-graph-svg">
      {/* 1. Branch segments (continuous vertical lines) */}
      {segments.map((seg, i) => (
        <line
          key={`seg-${i}`}
          x1={laneX(seg.lane)} y1={seg.startRow * rowHeight}
          x2={laneX(seg.lane)} y2={(seg.endRow + 1) * rowHeight}
          stroke={seg.color} strokeWidth={2} strokeLinecap="round"
        />
      ))}

      {/* 2. Fork/merge curves */}
      {curves.map((c, i) => {
        const x1 = laneX(c.fromLane)
        const x2 = laneX(c.toLane)
        const y1 = c.row * rowHeight
        const y2 = (c.row + 1) * rowHeight
        const mid = (y1 + y2) / 2
        return (
          <path
            key={`curve-${i}`}
            d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
            stroke={c.color} strokeWidth={2} fill="none" strokeLinecap="round"
          />
        )
      })}

      {/* 3. Cherry-pick connections (dashed) */}
      {cherryPicks.map((cp, i) => {
        const x1 = laneX(cp.fromLane)
        const y1 = rowY(cp.fromRow)
        const x2 = laneX(cp.toLane)
        const y2 = rowY(cp.toRow)
        const midY = (y1 + y2) / 2
        return (
          <path
            key={`cp-${i}`}
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            stroke={cp.color} strokeWidth={1.5} fill="none"
            strokeDasharray="4 3" opacity={0.7}
          />
        )
      })}

      {/* 4. Commit dots (on top of everything) */}
      {dots.map((d, i) => (
        <circle
          key={`dot-${i}`}
          cx={laneX(d.lane)} cy={rowY(d.row)}
          r={d.isMerge ? MERGE_DOT_RADIUS : DOT_RADIUS}
          fill={d.color} stroke="var(--bg-primary)" strokeWidth={2.5}
        />
      ))}
    </svg>
  )
}
