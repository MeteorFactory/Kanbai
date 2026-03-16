import { useEffect, useRef, useCallback } from 'react'
import { useTerminalTabStore } from '../features/terminal'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'

interface PixelAgentsPaneProps {
  isVisible: boolean
  workspaceId?: string
}

/** Map string-based session IDs from the service to numeric IDs expected by the webview */
function createAgentIdMapper() {
  const map = new Map<string, number>()
  let nextId = 1
  return {
    get(stringId: string): number {
      let numId = map.get(stringId)
      if (numId === undefined) {
        numId = nextId++
        map.set(stringId, numId)
      }
      return numId
    },
    /** Reverse lookup: numeric ID → string session ID */
    findString(numericId: number): string | undefined {
      for (const [str, num] of map) {
        if (num === numericId) return str
      }
      return undefined
    },
  }
}

/** Translate a raw Claude Code tool name using i18n. Falls back to the raw name. */
function translateTool(toolName: string): string {
  const t = useI18n.getState().t
  const key = `pixelAgents.tool.${toolName}`
  const translated = t(key)
  // t() returns the key itself when no translation exists
  return translated === key ? toolName : translated
}

export function PixelAgentsPane({ isVisible, workspaceId }: PixelAgentsPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const agentIdRef = useRef(createAgentIdMapper())
  /** Maps numeric webview agent ID → terminal tab ID for focus navigation */
  const agentTabMapRef = useRef(new Map<number, string>())
  /** Tracks which numeric IDs are currently displayed in the webview (for workspace switching) */
  const displayedAgentsRef = useRef(new Set<number>())
  const workspaceIdRef = useRef(workspaceId)
  /** Generation counter to discard stale sendInitData responses on rapid workspace switches */
  const initGenRef = useRef(0)

  const postToIframe = useCallback((data: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(data, '*')
  }, [])

  const sendInitData = useCallback(() => {
    const gen = ++initGenRef.current
    window.kanbai.pixelAgents.webviewReady().then((data) => {
      if (gen !== initGenRef.current) return // stale response from a previous workspace
      const assets = data.assets as { layout?: unknown; assetsAvailable?: boolean } | undefined
      const t = useI18n.getState().t
      postToIframe({
        type: 'layoutLoaded',
        layout: assets?.layout ?? null,
        locale: {
          needsApproval: t('pixelAgents.needsApproval'),
          waiting: t('pixelAgents.waiting'),
          subtask: t('pixelAgents.subtask'),
        },
      })

      const agents = data.agents as Array<{ id: string; ticket?: string; workspaceId?: string; tabId?: string; provider?: string }> | undefined
      if (agents && agents.length > 0) {
        // Strict workspace filtering — only show agents that belong to this workspace
        const filtered = workspaceIdRef.current
          ? agents.filter((a) => a.workspaceId === workspaceIdRef.current)
          : agents

        const numericIds = filtered.map((a) => agentIdRef.current.get(a.id))
        const ticketLabels: Record<number, string> = {}
        const providerLabels: Record<number, string> = {}
        for (const a of filtered) {
          const numId = agentIdRef.current.get(a.id)
          if (a.ticket) ticketLabels[numId] = a.ticket
          if (a.provider) providerLabels[numId] = a.provider
          if (a.tabId) agentTabMapRef.current.set(numId, a.tabId)
        }

        displayedAgentsRef.current = new Set(numericIds)
        postToIframe({ type: 'existingAgents', agents: numericIds, ticketLabels, providerLabels })
      }
    })
  }, [postToIframe])

  // Handle workspace changes: close old agents, show new ones
  useEffect(() => {
    const prevWorkspace = workspaceIdRef.current
    workspaceIdRef.current = workspaceId

    if (prevWorkspace === workspaceId) return

    // Close all currently displayed agents
    for (const numId of displayedAgentsRef.current) {
      postToIframe({ type: 'agentClosed', id: numId })
    }
    displayedAgentsRef.current.clear()
    agentTabMapRef.current.clear()

    // Re-init with new workspace's agents
    sendInitData()
  }, [workspaceId, postToIframe, sendInitData])

  useEffect(() => {
    window.kanbai.pixelAgents.start()

    unsubscribeRef.current = window.kanbai.pixelAgents.onEvent((event) => {
      const raw = event as { type: string; agentId?: string; tool?: string; status?: string; ticket?: string; workspaceId?: string; tabId?: string; provider?: string }
      const mapper = agentIdRef.current

      // Strict workspace filtering — skip events from other workspaces or without workspace
      if (workspaceIdRef.current && raw.workspaceId !== workspaceIdRef.current) return

      if (raw.type === 'agentJoined' && raw.agentId) {
        const numId = mapper.get(raw.agentId)
        if (raw.tabId) agentTabMapRef.current.set(numId, raw.tabId)
        displayedAgentsRef.current.add(numId)
        postToIframe({ type: 'agentCreated', id: numId, ticketLabel: raw.ticket, providerLabel: raw.provider })
      } else if (raw.type === 'agentToolStart' && raw.agentId) {
        postToIframe({ type: 'agentToolStart', id: mapper.get(raw.agentId), toolId: raw.tool, status: translateTool(raw.tool || '') })
      } else if (raw.type === 'agentToolDone' && raw.agentId) {
        postToIframe({ type: 'agentToolDone', id: mapper.get(raw.agentId), toolId: raw.tool })
      } else if (raw.type === 'agentStatus' && raw.agentId) {
        postToIframe({ type: 'agentStatus', id: mapper.get(raw.agentId), status: raw.status })
      } else if (raw.type === 'agentClosed' && raw.agentId) {
        const numId = mapper.get(raw.agentId)
        displayedAgentsRef.current.delete(numId)
        agentTabMapRef.current.delete(numId)
        postToIframe({ type: 'agentClosed', id: numId })
      } else if (raw.type === 'agentToolsClear' && raw.agentId) {
        postToIframe({ type: 'agentToolsClear', id: mapper.get(raw.agentId) })
      }
    })

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.source === 'pixel-agents-webview') {
        const payload = e.data.payload as { type?: string; layout?: unknown; id?: number } | undefined
        if (payload?.type === 'webviewReady') {
          sendInitData()
        } else if (payload?.type === 'saveLayout') {
          window.kanbai.pixelAgents.saveLayout(payload.layout)
        } else if (payload?.type === 'focusAgent') {
          const numericId = payload.id
          if (numericId != null) {
            const tabId = agentTabMapRef.current.get(numericId)
            if (tabId) {
              useTerminalTabStore.getState().setActiveTab(tabId)
              useViewStore.getState().setViewMode('terminal')
            }
          }
        }
      }
    }
    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      window.kanbai.pixelAgents.stop()
    }
  }, [postToIframe, sendInitData])

  return (
    <div
      className="pixel-agents-pane"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        visibility: isVisible ? 'visible' : 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        src="pixel-agents://app/"
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#1a1a2e',
        }}
      />
    </div>
  )
}
