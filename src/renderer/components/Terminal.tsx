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
  workspaceId?: string
  tabId?: string
  isVisible: boolean
  fontSize: number
  isSplit?: boolean
  onActivity?: () => void
  onClose?: () => void
  onSessionCreated?: (sessionId: string) => void
  onUserInput?: (message: string) => void
}

export function Terminal({ cwd, shell, initialCommand, externalSessionId, workspaceId, tabId, isVisible, fontSize, isSplit, onActivity, onClose, onSessionCreated, onUserInput }: TerminalProps) {
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
  const onUserInputRef = useRef(onUserInput)
  const inputBufferRef = useRef('')

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
  onUserInputRef.current = onUserInput

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
        background: '#0B0D0F',
        foreground: '#F0F2F4',
        cursor: '#f5e0dc',
        selectionBackground: '#1F232880',
        selectionForeground: '#F0F2F4',
        black: '#1F2328',
        red: '#F47067',
        green: '#3DD68C',
        yellow: '#fbbf24',
        blue: '#6C8CFF',
        magenta: '#ec4899',
        cyan: '#22d3ee',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#F47067',
        brightGreen: '#3DD68C',
        brightYellow: '#fbbf24',
        brightBlue: '#6C8CFF',
        brightMagenta: '#ec4899',
        brightCyan: '#22d3ee',
        brightWhite: '#8B929A',
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
        if (e.type !== 'keydown') return true

        // Shift+Enter → kitty keyboard protocol soft newline
        if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (sessionIdRef.current) {
            window.kanbai.terminal.write(sessionIdRef.current, '\x1b[13;2u')
          }
          return false
        }

        const isMac = navigator.platform.startsWith('Mac')
        const modKey = isMac ? e.metaKey : e.ctrlKey

        // Copy: Cmd+C (macOS) or Ctrl+Shift+C (Windows/Linux)
        // On Windows, plain Ctrl+C sends SIGINT — only copy with Ctrl+Shift+C
        // Use toLowerCase() because Shift makes e.key uppercase on Windows
        if (e.key.toLowerCase() === 'c' && ((isMac && modKey) || (!isMac && e.ctrlKey && e.shiftKey))) {
          const selection = xterm.getSelection()
          if (selection) {
            window.kanbai.clipboard.writeText(selection)
            return false
          }
          // No selection on macOS Cmd+C: let xterm handle (no-op)
          // No selection on Windows Ctrl+Shift+C: let xterm handle (no-op)
          return isMac ? false : true
        }

        // Paste: Cmd+V (macOS) or Ctrl+Shift+V (Windows/Linux)
        // Use toLowerCase() because Shift makes e.key uppercase on Windows
        if (e.key.toLowerCase() === 'v' && ((isMac && modKey) || (!isMac && e.ctrlKey && e.shiftKey))) {
          const text = window.kanbai.clipboard.readText()
          if (text && sessionIdRef.current) {
            // Use bracketed paste mode for safe pasting
            window.kanbai.terminal.write(sessionIdRef.current, text)
          }
          return false
        }

        return true
      })

      // Handle user keyboard input
      xterm.onData((data: string) => {
        if (sessionIdRef.current) {
          window.kanbai.terminal.write(sessionIdRef.current, data)
          // Only trigger reactivation on message submission (Enter key),
          // not on every keystroke. This prevents DONE tickets from being
          // reactivated to WORKING by accidental keystrokes.
          if (data.includes('\r') || data.includes('\n')) {
            const message = inputBufferRef.current.trim()
            inputBufferRef.current = ''
            onUserInputRef.current?.(message)
          } else if (data === '\x7f') {
            // Backspace: remove last character from buffer
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
          } else if (data.length === 1 && data >= ' ') {
            // Printable character: accumulate in buffer
            inputBufferRef.current += data
          }
        }
      })

      // Detect AI provider from the initial command for pixel-agents tracking
      let provider: string | undefined
      if (initialCommand) {
        if (initialCommand === 'codex' || initialCommand.startsWith('codex ')) provider = 'codex'
        else if (initialCommand === 'copilot' || initialCommand.startsWith('copilot ')) provider = 'copilot'
        else if (initialCommand === 'claude' || initialCommand.startsWith('claude ')) provider = 'claude'
        else if (initialCommand === 'gemini' || initialCommand.startsWith('gemini ')) provider = 'gemini'
      }

      // Show banner everywhere except AI terminals in split view (banner already shows on the plain side)
      const showBanner = !(initialCommand && isSplit)
      if (showBanner) {
        const TC = '\x1b[38;2;204;108;72m' // terracotta
        const WH = '\x1b[38;2;255;255;255m' // white
        const DM = '\x1b[90m' // dim
        const RS = '\x1b[0m' // reset
        window.kanbai.app.version().then(({ version }) => {
          const banner = [
            `${TC}██╗  ██╗ █████╗ ███╗   ██╗██████╗ ${WH}  █████╗ ██╗${RS}`,
            `${TC}██║ ██╔╝██╔══██╗████╗  ██║██╔══██╗${WH} ██╔══██╗██║${RS}`,
            `${TC}█████╔╝ ███████║██╔██╗ ██║██████╔╝${WH} ███████║██║${RS}`,
            `${TC}██╔═██╗ ██╔══██║██║╚██╗██║██╔══██╗${WH} ██╔══██║██║${RS}`,
            `${TC}██║  ██╗██║  ██║██║ ╚████║██████╔╝${WH} ██║  ██║██║${RS}`,
            `${TC}╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ${WH} ╚═╝  ╚═╝╚═╝${RS}`,
            `${DM}v${version}${RS}`,
          ]
          xterm.write('\r\n' + banner.join('\r\n') + '\r\n\r\n')
        })
      }

      // Create PTY session
      window.kanbai.terminal.create({ cwd, shell, workspaceId, tabId, provider }).then(
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
  }, [cwd, shell, initialCommand, externalSessionId, workspaceId, tabId, fitTerminal])

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
