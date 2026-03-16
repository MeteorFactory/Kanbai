import { useCallback } from 'react'

interface ResizeDividerProps {
  onResize: (deltaY: number) => void
}

export function ResizeDivider({ onResize }: ResizeDividerProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      let lastY = e.clientY

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - lastY
        lastY = moveEvent.clientY
        onResize(delta)
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onResize],
  )

  return (
    <div
      className="split-divider split-divider--vertical db-resize-divider"
      onMouseDown={handleMouseDown}
    />
  )
}
