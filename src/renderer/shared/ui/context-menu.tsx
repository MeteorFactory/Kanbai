import { useState, useEffect, useRef, useCallback } from 'react'

export interface ContextMenuItem {
  label: string
  action: () => void
  danger?: boolean
  separator?: boolean
  children?: ContextMenuItem[]
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

function SubMenu({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)

  // Position submenu to avoid overflow
  useEffect(() => {
    if (!open || !itemRef.current || !subRef.current) return
    const parentRect = itemRef.current.getBoundingClientRect()
    const sub = subRef.current
    const subRect = sub.getBoundingClientRect()

    // Default: open to the right
    let left = parentRect.width
    if (parentRect.right + subRect.width > window.innerWidth) {
      left = -subRect.width
    }
    sub.style.left = `${left}px`

    if (parentRect.top + subRect.height > window.innerHeight) {
      sub.style.top = `${-(subRect.height - parentRect.height)}px`
    }
  }, [open])

  return (
    <div
      ref={itemRef}
      className="context-menu-submenu-wrapper"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="context-menu-item context-menu-item--submenu">
        {item.label}
        <svg className="context-menu-submenu-chevron" width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2.5 1L5.5 4L2.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && item.children && (
        <div ref={subRef} className="context-menu context-menu--sub">
          {item.children.map((child, i) =>
            child.separator ? (
              <div key={i} className="context-menu-separator" />
            ) : (
              <button
                key={i}
                className={`context-menu-item${child.danger ? ' context-menu-item--danger' : ''}`}
                onClick={() => {
                  child.action()
                  onClose()
                }}
              >
                {child.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const menu = menuRef.current

    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`
    }
  }, [x, y])

  return (
    <div className="context-menu-overlay" onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={menuRef}
        className="context-menu"
        style={{ left: x, top: y }}
      >
        {items.map((item, index) =>
          item.separator ? (
            <div key={index} className="context-menu-separator" />
          ) : item.children ? (
            <SubMenu key={index} item={item} onClose={onClose} />
          ) : (
            <button
              key={index}
              className={`context-menu-item${item.danger ? ' context-menu-item--danger' : ''}`}
              onClick={() => {
                item.action()
                onClose()
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
