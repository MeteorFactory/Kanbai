import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock xterm and addons before importing the component
const mockDispose = vi.fn()
const mockOpen = vi.fn()
const mockLoadAddon = vi.fn()
const mockOnData = vi.fn().mockReturnValue({ dispose: vi.fn() })
const mockOnWriteParsed = vi.fn().mockReturnValue({ dispose: vi.fn() })
const mockWrite = vi.fn()
const mockAttachCustomKeyEventHandler = vi.fn()
const mockFocus = vi.fn()
const mockClear = vi.fn()
const mockScrollToBottom = vi.fn()

vi.mock('@xterm/xterm', () => ({
  Terminal: function MockTerminal() {
    this.open = mockOpen
    this.loadAddon = mockLoadAddon
    this.onData = mockOnData
    this.onWriteParsed = mockOnWriteParsed
    this.write = mockWrite
    this.dispose = mockDispose
    this.attachCustomKeyEventHandler = mockAttachCustomKeyEventHandler
    this.focus = mockFocus
    this.clear = mockClear
    this.scrollToBottom = mockScrollToBottom
    this.cols = 80
    this.rows = 24
    this.options = { fontSize: 13 }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: function MockFitAddon() {
    this.fit = vi.fn()
    this.dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: function MockSearchAddon() {
    this.findNext = vi.fn()
    this.findPrevious = vi.fn()
    this.clearDecorations = vi.fn()
    this.dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: function MockWebLinksAddon() {
    this.dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-webgl', () => {
  throw new Error('WebGL not available')
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('../../src/renderer/styles/terminal.css', () => ({}))

import { Terminal } from '../../src/renderer/components/Terminal'

describe('Terminal', () => {
  let addEventListenerSpy: ReturnType<typeof vi.fn>
  let removeEventListenerSpy: ReturnType<typeof vi.fn>
  let mockViewport: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a fake .xterm-viewport element that will be found by querySelector
    addEventListenerSpy = vi.fn()
    removeEventListenerSpy = vi.fn()
    mockViewport = document.createElement('div')
    mockViewport.className = 'xterm-viewport'
    mockViewport.addEventListener = addEventListenerSpy
    mockViewport.removeEventListener = removeEventListenerSpy

    // When xterm.open() is called, it populates the container.
    // We inject our mock viewport into the container so querySelector finds it.
    mockOpen.mockImplementation((container: HTMLElement) => {
      container.appendChild(mockViewport)
    })

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(function () {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      }
    }) as unknown as typeof ResizeObserver

    // Mock window.kanbai.terminal
    Object.defineProperty(window, 'mirehub', {
      value: {
        terminal: {
          create: vi.fn().mockResolvedValue({ id: 'test-session', pid: 1234 }),
          write: vi.fn(),
          resize: vi.fn(),
          close: vi.fn(),
          onData: vi.fn().mockReturnValue(() => {}),
          onClose: vi.fn().mockReturnValue(() => {}),
        },
        claude: {
          onSessionEnd: vi.fn().mockReturnValue(() => {}),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('should add scroll event listener on mount', () => {
    render(
      <Terminal isVisible={true} fontSize={13} />,
    )

    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('should remove scroll event listener on unmount', () => {
    const { unmount } = render(
      <Terminal isVisible={true} fontSize={13} />,
    )

    // Get the exact handler function that was passed to addEventListener
    const scrollHandler = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === 'scroll',
    )?.[1]
    expect(scrollHandler).toBeDefined()

    unmount()

    // Verify removeEventListener was called with the same handler
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', scrollHandler)
  })

  it('should dispose xterm on unmount', () => {
    const { unmount } = render(
      <Terminal isVisible={true} fontSize={13} />,
    )

    unmount()

    expect(mockDispose).toHaveBeenCalled()
  })

  it('should disconnect ResizeObserver on unmount', () => {
    const mockDisconnect = vi.fn()
    global.ResizeObserver = vi.fn().mockImplementation(function () {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: mockDisconnect,
      }
    }) as unknown as typeof ResizeObserver

    const { unmount } = render(
      <Terminal isVisible={true} fontSize={13} />,
    )

    unmount()

    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('should clean up keydown listener on unmount', () => {
    const windowAddSpy = vi.spyOn(window, 'addEventListener')
    const windowRemoveSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(
      <Terminal isVisible={true} fontSize={13} />,
    )

    const keydownHandler = windowAddSpy.mock.calls.find(
      (call) => call[0] === 'keydown',
    )?.[1]
    expect(keydownHandler).toBeDefined()

    unmount()

    expect(windowRemoveSpy).toHaveBeenCalledWith('keydown', keydownHandler)

    windowAddSpy.mockRestore()
    windowRemoveSpy.mockRestore()
  })
})
