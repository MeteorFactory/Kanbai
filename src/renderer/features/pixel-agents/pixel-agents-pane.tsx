import { usePixelAgents } from './use-pixel-agents'

interface PixelAgentsPaneProps {
  isVisible: boolean
  workspaceId?: string
}

export function PixelAgentsPane({ isVisible, workspaceId }: PixelAgentsPaneProps) {
  const { iframeRef } = usePixelAgents({ workspaceId })

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
