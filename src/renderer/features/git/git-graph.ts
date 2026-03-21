import type { GitLogEntry } from '../../../shared/types'
import type { GraphCommitInfo } from './git-types'

export const GRAPH_COLORS = [
  '#9747FF', '#20D4A0', '#F4585B', '#F5A623', '#fbbf24',
  '#B78AFF', '#22d3ee', '#ec4899', '#B78AFF', '#B78AFF',
]

export function computeGraph(entries: GitLogEntry[]): GraphCommitInfo[] {
  const result: GraphCommitInfo[] = []
  let activeLanes: (string | null)[] = []

  // Pre-build a set of all hashes for quick lookup (detect orphaned parents)
  const allHashes = new Set(entries.map((e) => e.hash))

  for (const entry of entries) {
    const connections: GraphCommitInfo['connections'] = []

    // Find which lane this commit occupies
    let dotLane = activeLanes.indexOf(entry.hash)
    if (dotLane === -1) {
      // New branch head — prefer the first empty slot, closest to lane 0
      dotLane = activeLanes.indexOf(null)
      if (dotLane === -1) {
        dotLane = activeLanes.length
        activeLanes.push(entry.hash)
      } else {
        activeLanes[dotLane] = entry.hash
      }
    }

    const dotColor = GRAPH_COLORS[dotLane % GRAPH_COLORS.length]!

    // Snapshot lanes for rendering (before we modify them)
    const lanesSnapshot: GraphCommitInfo['lanes'] = activeLanes.map((hash, i) =>
      hash === null ? null : { color: GRAPH_COLORS[i % GRAPH_COLORS.length]! },
    )

    // Free the current lane
    const parents = entry.parents
    activeLanes[dotLane] = null

    if (parents.length === 0) {
      // Root commit — no connections downward
    } else if (parents.length === 1) {
      const parentHash = parents[0]!
      const existingLane = activeLanes.indexOf(parentHash)
      if (existingLane !== -1) {
        // Parent already tracked in another lane — merge into it
        connections.push({
          fromLane: dotLane, toLane: existingLane, color: dotColor,
          type: existingLane < dotLane ? 'merge-left' : existingLane > dotLane ? 'merge-right' : 'straight',
        })
      } else if (allHashes.has(parentHash)) {
        // Parent exists in this log — continue in the same lane
        activeLanes[dotLane] = parentHash
        connections.push({ fromLane: dotLane, toLane: dotLane, color: dotColor, type: 'straight' })
      }
      // else: parent is outside the visible log window — don't reserve a lane
    } else {
      // Merge commit — multiple parents
      for (let pi = 0; pi < parents.length; pi++) {
        const parentHash = parents[pi]!
        const existingLane = activeLanes.indexOf(parentHash)

        if (existingLane !== -1) {
          // Parent already tracked
          connections.push({
            fromLane: dotLane, toLane: existingLane,
            color: GRAPH_COLORS[existingLane % GRAPH_COLORS.length]!,
            type: existingLane < dotLane ? 'merge-left' : existingLane > dotLane ? 'merge-right' : 'straight',
          })
        } else if (allHashes.has(parentHash)) {
          // Assign parent to a lane
          let newLane: number
          if (pi === 0) {
            // First parent continues in dotLane
            newLane = dotLane
          } else {
            // Other parents need a new lane
            newLane = activeLanes.indexOf(null)
            if (newLane === -1) {
              newLane = activeLanes.length
              activeLanes.push(null)
            }
          }
          activeLanes[newLane] = parentHash
          if (newLane === dotLane) {
            connections.push({ fromLane: dotLane, toLane: dotLane, color: dotColor, type: 'straight' })
          } else {
            activeLanes[newLane] = parentHash
          }
          connections.push({
            fromLane: dotLane, toLane: newLane,
            color: GRAPH_COLORS[newLane % GRAPH_COLORS.length]!,
            type: newLane > dotLane ? 'fork-right' : 'fork-left',
          })
        }
      }
    }

    // Draw pass-through lines for lanes that are still active
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] !== null && i !== dotLane && !connections.some((c) => c.toLane === i)) {
        connections.push({
          fromLane: i, toLane: i,
          color: GRAPH_COLORS[i % GRAPH_COLORS.length]!,
          type: 'straight',
        })
      }
    }

    // Trim trailing empty lanes to prevent the graph from growing infinitely wide
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop()
    }

    result.push({ entry, lanes: lanesSnapshot, dotLane, connections })
  }
  return result
}
