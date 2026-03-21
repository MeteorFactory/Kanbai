import React from 'react'

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const [copied, setCopied] = React.useState(false)

  const fullError = error
    ? `${error.message}\n\n${error.stack ?? '(no stack trace)'}`
    : 'Unknown error'

  const handleCopy = () => {
    try {
      window.kanbai.clipboard.writeText(fullError)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback to navigator.clipboard if preload API is unavailable
      navigator.clipboard.writeText(fullError).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => { /* clipboard access denied */ })
    }
  }

  const handleReload = () => {
    window.location.reload()
  }

  return (
    <div style={{
      padding: 32,
      color: '#E0DCE8',
      background: '#0E0D0B',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }}>
      <p style={{ fontSize: 16, color: '#F4585B', fontWeight: 600 }}>
        Une erreur est survenue
      </p>

      <pre style={{
        fontSize: 11,
        fontFamily: 'SF Mono, Menlo, monospace',
        color: '#A5A49E',
        maxWidth: '80%',
        maxHeight: '50vh',
        overflow: 'auto',
        padding: 16,
        background: '#181715',
        borderRadius: 8,
        border: '1px solid #201F1C',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        userSelect: 'text',
        cursor: 'text',
        lineHeight: 1.5,
      }}>
        {fullError}
      </pre>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleCopy}
          style={{
            padding: '8px 16px',
            background: '#201F1C',
            color: '#E0DCE8',
            border: '1px solid #201F1C',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {copied ? '\u2713 Copié' : 'Copier l\'erreur'}
        </button>
        <button
          onClick={onReset}
          style={{
            padding: '8px 16px',
            background: '#201F1C',
            color: '#E0DCE8',
            border: '1px solid #585b70',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Réessayer
        </button>
        <button
          onClick={handleReload}
          style={{
            padding: '8px 16px',
            background: '#9747FF',
            color: '#0E0D0B',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Recharger la page
        </button>
      </div>
    </div>
  )
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('React Error Boundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}
