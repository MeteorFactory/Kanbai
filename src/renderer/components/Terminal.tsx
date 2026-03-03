import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

interface TerminalProps {
  cwd?: string
  shell?: string
  initialCommand?: string | null
  externalSessionId?: string | null
  isVisible: boolean
  fontSize: number
  onActivity?: () => void
  onClose?: () => void
  onSessionCreated?: (sessionId: string) => void
}

export function Terminal({ cwd, shell, initialCommand, externalSessionId, isVisible, fontSize, onActivity, onClose, onSessionCreated }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const cleanupDataRef = useRef<(() => void) | null>(null)
  const cleanupCloseRef = useRef<(() => void) | null>(null)
  const isVisibleRef = useRef(isVisible)
  const onActivityRef = useRef(onActivity)
  const onCloseRef = useRef(onClose)
  const onSessionCreatedRef = useRef(onSessionCreated)

  // Search bar state
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Scroll-to-bottom state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  isVisibleRef.current = isVisible
  onActivityRef.current = onActivity
  onCloseRef.current = onClose
  onSessionCreatedRef.current = onSessionCreated

  const fitTerminal = useCallback(() => {
    const fitAddon = fitAddonRef.current
    const xterm = xtermRef.current
    const sessionId = sessionIdRef.current
    if (!fitAddon || !xterm) return

    try {
      fitAddon.fit()
      if (sessionId) {
        window.kanbai.terminal.resize(sessionId, xterm.cols, xterm.rows)
      }
    } catch {
      // Ignore fit errors when terminal is not yet visible
    }
  }, [])

  // Refit when visibility changes
  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => fitTerminal())
    }
  }, [isVisible, fitTerminal])

  // Update font size when prop changes
  useEffect(() => {
    const xterm = xtermRef.current
    if (!xterm) return
    xterm.options.fontSize = fontSize
    requestAnimationFrame(() => fitTerminal())
  }, [fontSize, fitTerminal])

  useEffect(() => {
    if (!containerRef.current) return

    const xterm = new XTerm({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize,
      lineHeight: 1.2,
      scrollback: 10000,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#45475a80',
        selectionForeground: '#cdd6f4',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    const webLinksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(searchAddon)
    xterm.loadAddon(webLinksAddon)

    // Try loading WebGL addon, fall back to canvas
    import('@xterm/addon-webgl')
      .then(({ WebglAddon }) => {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon.dispose()
        })
        xterm.loadAddon(webglAddon)
      })
      .catch(() => {
        // WebGL not available, canvas2D renderer is the default fallback
      })

    xterm.open(containerRef.current)
    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Track scroll position for scroll-to-bottom button
    const viewport = containerRef.current.querySelector('.xterm-viewport')
    if (viewport) {
      const handleScroll = () => {
        const el = viewport as HTMLElement
        const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
        setShowScrollToBottom(!isAtBottom)
      }
      viewport.addEventListener('scroll', handleScroll)
      // Also listen for terminal writes that change scrollHeight
      xterm.onWriteParsed(() => {
        const el = viewport as HTMLElement
        const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
        setShowScrollToBottom(!isAtBottom)
      })
    }

    // Fit after opening
    requestAnimationFrame(() => fitTerminal())

    if (externalSessionId) {
      // View-only mode: listen to an external data stream (e.g., kanban Claude session)
      sessionIdRef.current = externalSessionId
      onSessionCreatedRef.current?.(externalSessionId)

      xterm.write('\x1b[90m[Session Claude - lecture seule]\x1b[0m\r\n\r\n')

      const unsubData = window.kanbai.terminal.onData(
        (payload: { id: string; data: string }) => {
          if (payload.id === externalSessionId) {
            xterm.write(payload.data)
            if (!isVisibleRef.current) {
              onActivityRef.current?.()
            }
          }
        },
      )
      cleanupDataRef.current = unsubData

      // Listen for Claude session end
      const unsubClose = window.kanbai.claude.onSessionEnd(
        (_data: { id: string; status: string }) => {
          // Session end detection handled by kanban store
        },
      )
      cleanupCloseRef.current = unsubClose

      fitTerminal()
    } else {
      // Normal mode: create a PTY session

      // Intercept Shift+Enter to send the kitty keyboard protocol sequence
      // instead of \r. xterm.js sends \r for both Enter and Shift+Enter.
      // Claude Code and modern CLI tools recognise \x1b[13;2u (CSI u encoding:
      // keycode 13 = Enter, modifier 2 = Shift) as a distinct "soft newline".
      xterm.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type === 'keydown' && e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (sessionIdRef.current) {
            window.kanbai.terminal.write(sessionIdRef.current, '\x1b[13;2u')
          }
          return false // prevent xterm from also sending \r
        }
        return true
      })

      // Handle user keyboard input
      xterm.onData((data: string) => {
        if (sessionIdRef.current) {
          window.kanbai.terminal.write(sessionIdRef.current, data)
        }
      })

      // Create PTY session
      window.kanbai.terminal.create({ cwd, shell }).then(
        (result: { id: string; pid: number }) => {
          sessionIdRef.current = result.id
          onSessionCreatedRef.current?.(result.id)

          // Listen for data from PTY
          const unsubData = window.kanbai.terminal.onData(
            (payload: { id: string; data: string }) => {
              if (payload.id === sessionIdRef.current) {
                xterm.write(payload.data)
                if (!isVisibleRef.current) {
                  onActivityRef.current?.()
                }
              }
            },
          )
          cleanupDataRef.current = unsubData

          // Listen for PTY close
          const unsubClose = window.kanbai.terminal.onClose(
            (payload: { id: string; exitCode: number; signal: number }) => {
              if (payload.id === sessionIdRef.current) {
                xterm.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
                sessionIdRef.current = null
                onCloseRef.current?.()
              }
            },
          )
          cleanupCloseRef.current = unsubClose

          // Send initial resize
          fitTerminal()

          // Execute initial command once the shell is ready.
          // We detect readiness by waiting for a pause in PTY output:
          // the shell prompt appears last, followed by silence.
          // Text and Enter are sent separately to mimic physical typing.
          if (initialCommand) {
            let commandSent = false
            let debounceTimer: ReturnType<typeof setTimeout> | null = null
            const sendCmd = () => {
              if (commandSent) return
              commandSent = true
              if (debounceTimer) clearTimeout(debounceTimer)
              unsubReady()
              // Send text first, then Enter separately (like a physical keypress)
              window.kanbai.terminal.write(result.id, initialCommand)
              setTimeout(() => {
                window.kanbai.terminal.write(result.id, '\r')
              }, 100)
            }
            const unsubReady = window.kanbai.terminal.onData(
              (payload: { id: string; data: string }) => {
                if (payload.id !== result.id || commandSent) return
                if (debounceTimer) clearTimeout(debounceTimer)
                debounceTimer = setTimeout(sendCmd, 300)
              },
            )
            // Fallback: send after 3s even if shell produces no output
            setTimeout(sendCmd, 3000)
          }
        },
      )
    }

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitTerminal())
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      cleanupDataRef.current?.()
      cleanupCloseRef.current?.()
      if (!externalSessionId && sessionIdRef.current) {
        window.kanbai.terminal.close(sessionIdRef.current)
      }
      xterm.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, shell, initialCommand, externalSessionId, fitTerminal])

  // Focus the terminal when it becomes visible
  useEffect(() => {
    if (isVisible && xtermRef.current) {
      xtermRef.current.focus()
    }
  }, [isVisible])

  // Keyboard shortcut: Cmd+F to open search, Cmd+K to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return

      // Cmd+F: toggle search bar
      if (e.metaKey && e.key === 'f') {
        e.preventDefault()
        setSearchVisible((prev) => {
          if (!prev) {
            // Opening: focus the input next frame
            setTimeout(() => searchInputRef.current?.focus(), 0)
          }
          return !prev
        })
        return
      }

      // Cmd+K: clear terminal
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        const xterm = xtermRef.current
        if (xterm) {
          xterm.clear()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible])

  // Search handlers
  const handleSearchNext = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery)
    }
  }, [searchQuery])

  const handleSearchPrev = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery)
    }
  }, [searchQuery])

  const handleSearchClose = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
    searchAddonRef.current?.clearDecorations()
    xtermRef.current?.focus()
  }, [])

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          handleSearchPrev()
        } else {
          handleSearchNext()
        }
      } else if (e.key === 'Escape') {
        handleSearchClose()
      }
    },
    [handleSearchNext, handleSearchPrev, handleSearchClose],
  )

  // Live search as user types
  useEffect(() => {
    if (searchVisible && searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findNext(searchQuery)
    }
  }, [searchQuery, searchVisible])

  const handleScrollToBottom = useCallback(() => {
    xtermRef.current?.scrollToBottom()
    setShowScrollToBottom(false)
  }, [])

  return (
    <div
      className="terminal-wrapper"
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      {searchVisible && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            className="terminal-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            autoFocus
          />
          <button
            className="terminal-search-btn"
            onClick={handleSearchPrev}
            title="Previous (Shift+Enter)"
          >
            &uarr;
          </button>
          <button
            className="terminal-search-btn"
            onClick={handleSearchNext}
            title="Next (Enter)"
          >
            &darr;
          </button>
          <button
            className="terminal-search-btn terminal-search-close"
            onClick={handleSearchClose}
            title="Close (Escape)"
          >
            &times;
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-container"
      />
      {showScrollToBottom && (
        <button
          className="terminal-scroll-to-bottom"
          onClick={handleScrollToBottom}
          title="Scroll to bottom"
        >
          &darr;
        </button>
      )}
    </div>
  )
}
