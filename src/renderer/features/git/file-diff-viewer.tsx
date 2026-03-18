import { useEffect, useState, useCallback } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useViewStore } from '../../lib/stores/viewStore'
import { useI18n } from '../../lib/i18n'

export function FileDiffViewer() {
  const { t } = useI18n()
  const { diffFiles, clearSelection, setViewMode } = useViewStore()
  const [originalContent, setOriginalContent] = useState<string>('')
  const [modifiedContent, setModifiedContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!diffFiles) return
    setLoading(true)
    setError(null)
    Promise.all([
      window.kanbai.fs.readFile(diffFiles[0]),
      window.kanbai.fs.readFile(diffFiles[1]),
    ])
      .then(([left, right]) => {
        if (left.error) {
          setError(t('diff.readError', { file: diffFiles[0], error: left.error }))
          return
        }
        if (right.error) {
          setError(t('diff.readError', { file: diffFiles[1], error: right.error }))
          return
        }
        setOriginalContent(left.content ?? '')
        setModifiedContent(right.content ?? '')
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [diffFiles, t])

  const handleClose = useCallback(() => {
    clearSelection()
    setViewMode('terminal')
  }, [clearSelection, setViewMode])

  const getLanguage = (filePath: string): string => {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript',
      '.jsx': 'javascriptreact', '.json': 'json', '.css': 'css',
      '.html': 'html', '.md': 'markdown', '.py': 'python',
      '.rs': 'rust', '.go': 'go', '.sh': 'shell',
      '.yml': 'yaml', '.yaml': 'yaml',
    }
    return map[ext] || 'plaintext'
  }

  if (!diffFiles) {
    return <div className="file-viewer-empty">{t('diff.noFiles')}</div>
  }

  const leftName = diffFiles[0].split(/[\\/]/).pop() ?? diffFiles[0]
  const rightName = diffFiles[1].split(/[\\/]/).pop() ?? diffFiles[1]
  const language = getLanguage(diffFiles[0])

  return (
    <div className="file-diff-viewer">
      <div className="file-diff-header">
        <span className="file-diff-name">{leftName}</span>
        <span className="file-diff-vs">{t('common.vs')}</span>
        <span className="file-diff-name">{rightName}</span>
        <button
          className="file-viewer-close btn-icon"
          onClick={handleClose}
          title={t('common.close')}
        >
          &times;
        </button>
      </div>
      <div className="file-diff-editor">
        {loading && <div className="file-viewer-loading">{t('common.loading')}</div>}
        {error && <div className="file-viewer-error">{error}</div>}
        {!loading && !error && (
          <DiffEditor
            original={originalContent}
            modified={modifiedContent}
            language={language}
            theme="catppuccin-mocha"
            beforeMount={(monaco) => {
              if (!monaco.editor.getModel) return
              monaco.editor.defineTheme('catppuccin-mocha', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '565C66', fontStyle: 'italic' },
                  { token: 'keyword', foreground: 'a78bfa' },
                  { token: 'string', foreground: '3DD68C' },
                  { token: 'number', foreground: 'F5A623' },
                  { token: 'type', foreground: '6C8CFF' },
                  { token: 'function', foreground: '6C8CFF' },
                  { token: 'variable', foreground: 'F0F2F4' },
                  { token: 'operator', foreground: '89dceb' },
                ],
                colors: {
                  'editor.background': '#0E0D0B',
                  'editor.foreground': '#E0DCE8',
                  'editor.lineHighlightBackground': '#201F1C',
                  'editor.selectionBackground': '#201F1C',
                  'editorCursor.foreground': '#f5e0dc',
                  'editorLineNumber.foreground': '#6B6A65',
                  'editorLineNumber.activeForeground': '#E0DCE8',
                  'editor.inactiveSelectionBackground': '#201F1C80',
                },
              })
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'Menlo',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              renderSideBySide: true,
              readOnly: true,
            }}
          />
        )}
      </div>
    </div>
  )
}
