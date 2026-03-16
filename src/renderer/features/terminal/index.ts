// Public API for the terminal feature
export { Terminal } from './terminal'
export { TerminalArea } from './terminal-area'
export { TabBar } from './tab-bar'
export { useTerminal } from './use-terminal'
export {
  useTerminalTabStore,
  countLeaves,
  collectLeafIds,
  computePaneRects,
  findPaneComponentType,
  computeSplitDividers,
} from './terminal-store'
export type {
  PaneLeaf,
  PaneSplit,
  PaneNode,
  TerminalTabData,
  PaneRect,
  SplitDividerInfo,
} from './terminal-store'
