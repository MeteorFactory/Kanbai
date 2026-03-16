import { useCallback } from 'react'
import { useI18n } from '../../../../../lib/i18n'

const BUILT_IN_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit']

interface Props {
  allowList: string[]
  denyList: string[]
  mcpServerKeys: string[]
  onAllowChange: (tools: string[]) => void
  onDenyChange: (tools: string[]) => void
}

type ToolState = 'allow' | 'deny' | 'default'

export function ToolToggleGrid({ allowList, denyList, mcpServerKeys, onAllowChange, onDenyChange }: Props) {
  const { t } = useI18n()

  const getState = useCallback((tool: string): ToolState => {
    if (allowList.includes(tool)) return 'allow'
    if (denyList.includes(tool)) return 'deny'
    return 'default'
  }, [allowList, denyList])

  const cycle = useCallback((tool: string) => {
    const state = getState(tool)
    if (state === 'default') {
      // default → allow
      onAllowChange([...allowList, tool])
    } else if (state === 'allow') {
      // allow → deny
      onAllowChange(allowList.filter((t) => t !== tool))
      onDenyChange([...denyList, tool])
    } else {
      // deny → default
      onDenyChange(denyList.filter((t) => t !== tool))
    }
  }, [getState, allowList, denyList, onAllowChange, onDenyChange])

  const mcpTools = mcpServerKeys.map((key) => `mcp__${key}__*`)

  return (
    <div>
      <div className="claude-rules-section">
        <label className="claude-rules-label">{t('claude.builtInTools')}</label>
        <div className="cs-tool-toggle-grid">
          {BUILT_IN_TOOLS.map((tool) => {
            const state = getState(tool)
            return (
              <button
                key={tool}
                className={`cs-tool-toggle cs-tool-toggle--${state}`}
                onClick={() => cycle(tool)}
                title={t(`claude.tool${state.charAt(0).toUpperCase() + state.slice(1)}` as 'claude.toolAllow')}
              >
                {tool}
              </button>
            )
          })}
        </div>
      </div>
      {mcpTools.length > 0 && (
        <div className="claude-rules-section" style={{ marginTop: 12 }}>
          <label className="claude-rules-label">{t('claude.mcpToolsSection')}</label>
          <div className="cs-tool-toggle-grid">
            {mcpTools.map((tool) => {
              const state = getState(tool)
              return (
                <button
                  key={tool}
                  className={`cs-tool-toggle cs-tool-toggle--${state}`}
                  onClick={() => cycle(tool)}
                  title={t(`claude.tool${state.charAt(0).toUpperCase() + state.slice(1)}` as 'claude.toolAllow')}
                >
                  {tool.replace('mcp__', '').replace('__*', '')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
