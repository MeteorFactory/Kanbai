import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useViewStore } from '../lib/stores/viewStore'
import { useI18n } from '../lib/i18n'
import { CopyableError } from './CopyableError'

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'plaintext',
  '.xml': 'xml',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.svg': 'xml',
  '.scss': 'scss',
  '.less': 'less',
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svg'])
const PDF_EXTENSIONS = new Set(['.pdf'])

function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return ''
  return filePath.slice(dot).toLowerCase()
}

function getLanguage(filePath: string): string {
  const ext = getExtension(filePath)
  return EXT_TO_LANGUAGE[ext] || 'plaintext'
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filePath))
}

function isPdfFile(filePath: string): boolean {
  return PDF_EXTENSIONS.has(getExtension(filePath))
}

function isMarkdownFile(filePath: string): boolean {
  return getExtension(filePath) === '.md'
}

function isJsonFile(filePath: string): boolean {
  return getExtension(filePath) === '.json'
}

// Simple markdown to HTML converter
function markdownToHtml(md: string): string {
  let html = md
  // Escape HTML entities first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre class="md-code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>')

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>')

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr />')

  // Paragraphs - wrap remaining text blocks
  html = html.replace(/^(?!<[a-z]|<\/|$)(.+)$/gm, '<p>$1</p>')

  return html
}

// JSON validation helper
function validateJson(text: string): { valid: boolean; error?: string; line?: number } {
  try {
    JSON.parse(text)
    return { valid: true }
  } catch (err) {
    const message = String(err)
    const posMatch = message.match(/position\s+(\d+)/)
    if (posMatch) {
      const pos = parseInt(posMatch[1]!, 10)
      const line = text.slice(0, pos).split('\n').length
      return { valid: false, error: message.replace(/^SyntaxError:\s*/, ''), line }
    }
    return { valid: false, error: message.replace(/^SyntaxError:\s*/, '') }
  }
}

export function FileViewer() {
  const { t } = useI18n()
  const { selectedFilePath, setViewMode, isEditorDirty, setEditorDirty, bookmarks, toggleBookmark } = useViewStore()
  const [content, setContent] = useState<string | null>(null)
  const [binaryDataUrl, setBinaryDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mdPreview, setMdPreview] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const isImage = selectedFilePath ? isImageFile(selectedFilePath) : false
  const isPdf = selectedFilePath ? isPdfFile(selectedFilePath) : false
  const isBinary = isImage || isPdf
  const isMd = selectedFilePath ? isMarkdownFile(selectedFilePath) : false
  const isJson = selectedFilePath ? isJsonFile(selectedFilePath) : false
  const isBookmarked = selectedFilePath ? bookmarks.includes(selectedFilePath) : false

  useEffect(() => {
    if (!selectedFilePath) return
    setContent(null)
    setBinaryDataUrl(null)
    setLoading(true)
    setError(null)
    setEditorDirty(false)
    setMdPreview(false)
    setJsonError(null)

    if (isImageFile(selectedFilePath) || isPdfFile(selectedFilePath)) {
      window.mirehub.fs
        .readBase64(selectedFilePath)
        .then((result: { data: string | null; error: string | null }) => {
          if (result.error) {
            setError(result.error)
          } else {
            setBinaryDataUrl(result.data)
          }
        })
        .catch((err: unknown) => setError(String(err)))
        .finally(() => setLoading(false))
    } else {
      window.mirehub.fs
        .readFile(selectedFilePath)
        .then((result: { content: string | null; error: string | null }) => {
          if (result.error) {
            setError(result.error)
            setContent(null)
          } else {
            const text = result.content ?? ''
            setContent(text)
            setError(null)
            // Auto-validate JSON
            if (isJsonFile(selectedFilePath)) {
              const validation = validateJson(text)
              setJsonError(validation.valid ? null : validation.error ?? null)
            }
          }
        })
        .catch((err: unknown) => {
          setError(String(err))
          setContent(null)
        })
        .finally(() => setLoading(false))
    }
  }, [selectedFilePath, setEditorDirty])

  const handleSave = useCallback(async () => {
    if (!selectedFilePath || !editorRef.current) return
    const value = editorRef.current.getValue()
    setSaving(true)
    try {
      const result = await window.mirehub.fs.writeFile(selectedFilePath, value)
      if (result.success) {
        setEditorDirty(false)
        setContent(value)
      } else {
        setError(result.error || t('file.saveError'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [selectedFilePath, setEditorDirty, t])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor

    editor.addAction({
      id: 'save-file',
      label: 'Enregistrer',
      keybindings: [
        2048 | 49, // CtrlCmd | KeyS
      ],
      run: () => {
        handleSave()
      },
    })

    // Scroll to pending line number if set
    const line = useViewStore.getState().pendingLineNumber
    if (line != null) {
      editor.revealLineInCenter(line)
      editor.setPosition({ lineNumber: line, column: 1 })
      const decorations = editor.deltaDecorations([], [
        {
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: {
            isWholeLine: true,
            className: 'line-highlight-flash',
          },
        },
      ])
      setTimeout(() => {
        editor.deltaDecorations(decorations, [])
      }, 1500)
      useViewStore.setState({ pendingLineNumber: null })
    }
  }, [handleSave])

  const handleChange = useCallback((value: string | undefined) => {
    if (!isEditorDirty) {
      setEditorDirty(true)
    }
    // Re-validate JSON on change
    if (isJson && value !== undefined) {
      const validation = validateJson(value)
      setJsonError(validation.valid ? null : validation.error ?? null)
    }
  }, [isEditorDirty, setEditorDirty, isJson])

  const handleJsonFormat = useCallback(() => {
    if (!editorRef.current) return
    const value = editorRef.current.getValue()
    try {
      const parsed = JSON.parse(value)
      const formatted = JSON.stringify(parsed, null, 2)
      editorRef.current.setValue(formatted)
      setJsonError(null)
      setEditorDirty(true)
    } catch {
      // Already invalid, error shown in jsonError
    }
  }, [setEditorDirty])

  const handleJsonMinify = useCallback(() => {
    if (!editorRef.current) return
    const value = editorRef.current.getValue()
    try {
      const parsed = JSON.parse(value)
      const minified = JSON.stringify(parsed)
      editorRef.current.setValue(minified)
      setJsonError(null)
      setEditorDirty(true)
    } catch {
      // Already invalid
    }
  }, [setEditorDirty])

  const renderedMarkdown = useMemo(() => {
    if (!isMd || !mdPreview || content === null) return ''
    return markdownToHtml(content)
  }, [isMd, mdPreview, content])

  if (!selectedFilePath) {
    return (
      <div className="file-viewer-empty">
        {t('file.noFileSelected')}
      </div>
    )
  }

  const fileName = selectedFilePath.split(/[\\/]/).pop() ?? selectedFilePath
  const language = getLanguage(selectedFilePath)

  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <span className="file-viewer-name">{fileName}</span>
        {isEditorDirty && <span className="file-viewer-dirty-dot" title={t('file.modified')} />}
        <span className="file-viewer-path" title={selectedFilePath}>{selectedFilePath}</span>

        {/* Bookmark button */}
        <button
          className={`file-viewer-bookmark btn-icon${isBookmarked ? ' file-viewer-bookmark--active' : ''}`}
          onClick={() => toggleBookmark(selectedFilePath)}
          title={isBookmarked ? t('file.removeBookmark') : t('file.addBookmark')}
        >
          {isBookmarked ? '\u2605' : '\u2606'}
        </button>

        {/* Markdown preview toggle */}
        {isMd && !isBinary && (
          <button
            className={`file-viewer-toggle-btn${mdPreview ? ' file-viewer-toggle-btn--active' : ''}`}
            onClick={() => setMdPreview(!mdPreview)}
            title={mdPreview ? t('file.editMode') : t('file.markdownPreview')}
          >
            {mdPreview ? 'Edit' : 'Preview'}
          </button>
        )}

        {/* JSON tools */}
        {isJson && !isBinary && (
          <>
            <button
              className="file-viewer-json-btn"
              onClick={handleJsonFormat}
              title={t('file.formatJson')}
            >
              Format
            </button>
            <button
              className="file-viewer-json-btn"
              onClick={handleJsonMinify}
              title={t('file.minifyJson')}
            >
              Minify
            </button>
          </>
        )}

        {!isBinary && !mdPreview && (
          <button
            className="file-viewer-save-btn"
            onClick={handleSave}
            disabled={!isEditorDirty || saving}
            title={t('file.save')}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        )}
        <button
          className="file-viewer-close btn-icon"
          onClick={() => setViewMode('terminal')}
          title={t('common.close')}
        >
          &times;
        </button>
      </div>

      {/* JSON validation error */}
      {isJson && jsonError && (
        <div className="file-viewer-json-error">
          {t('file.invalidJson', { error: jsonError })}
        </div>
      )}

      <div className="file-viewer-editor">
        {loading && <div className="file-viewer-loading">{t('common.loading')}</div>}
        {error && <div className="file-viewer-error"><CopyableError error={error} /></div>}
        {/* Image preview */}
        {isImage && binaryDataUrl && !loading && (
          <div className="file-viewer-image">
            <img src={binaryDataUrl} alt={fileName} />
          </div>
        )}
        {/* PDF preview */}
        {isPdf && binaryDataUrl && !loading && (
          <div className="file-viewer-pdf">
            <object data={binaryDataUrl} type="application/pdf" width="100%" height="100%">
              <div className="file-viewer-pdf-fallback">
                {t('file.pdfError')}
              </div>
            </object>
          </div>
        )}
        {/* Markdown preview */}
        {isMd && mdPreview && content !== null && !loading && (
          <div
            className="file-viewer-md-preview"
            dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
          />
        )}
        {/* Code editor */}
        {!isBinary && content !== null && !loading && !(isMd && mdPreview) && (
          <Editor
            key={selectedFilePath}
            value={content}
            language={language}
            theme="catppuccin-mocha"
            onChange={handleChange}
            onMount={handleEditorMount}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('catppuccin-mocha', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
                  { token: 'keyword', foreground: 'cba6f7' },
                  { token: 'keyword.control', foreground: 'cba6f7' },
                  { token: 'string', foreground: 'a6e3a1' },
                  { token: 'number', foreground: 'fab387' },
                  { token: 'type', foreground: '89b4fa' },
                  { token: 'type.identifier', foreground: '89b4fa' },
                  { token: 'function', foreground: '89b4fa' },
                  { token: 'variable', foreground: 'cdd6f4' },
                  { token: 'variable.predefined', foreground: 'f38ba8' },
                  { token: 'operator', foreground: '89dceb' },
                  { token: 'delimiter', foreground: '9399b2' },
                  { token: 'delimiter.bracket', foreground: '9399b2' },
                  { token: 'delimiter.parenthesis', foreground: '9399b2' },
                  { token: 'delimiter.square', foreground: '9399b2' },
                  { token: 'delimiter.curly', foreground: '9399b2' },
                  { token: 'constant', foreground: 'fab387' },
                  { token: 'regexp', foreground: 'f38ba8' },
                  { token: 'annotation', foreground: 'f9e2af' },
                  { token: 'namespace', foreground: '94e2d5' },
                  { token: 'string.key.json', foreground: '89b4fa' },
                  { token: 'string.value.json', foreground: 'a6e3a1' },
                  { token: 'number.json', foreground: 'fab387' },
                  { token: 'keyword.json', foreground: 'fab387' },
                  { token: 'delimiter.bracket.json', foreground: 'f9e2af' },
                  { token: 'delimiter.colon.json', foreground: '9399b2' },
                  { token: 'delimiter.comma.json', foreground: '9399b2' },
                  { token: 'tag', foreground: 'f38ba8' },
                  { token: 'tag.id', foreground: 'f38ba8' },
                  { token: 'tag.class', foreground: 'f38ba8' },
                  { token: 'attribute.name', foreground: 'f9e2af' },
                  { token: 'attribute.value', foreground: 'a6e3a1' },
                  { token: 'selector', foreground: 'cba6f7' },
                  { token: 'property', foreground: '89b4fa' },
                  { token: 'markup.heading', foreground: 'f38ba8', fontStyle: 'bold' },
                  { token: 'markup.bold', foreground: 'fab387', fontStyle: 'bold' },
                  { token: 'markup.italic', foreground: 'f5c2e7', fontStyle: 'italic' },
                  { token: 'markup.inline', foreground: 'a6e3a1' },
                  { token: 'meta.content', foreground: 'cdd6f4' },
                ],
                colors: {
                  'editor.background': '#1e1e2e',
                  'editor.foreground': '#cdd6f4',
                  'editor.lineHighlightBackground': '#313244',
                  'editor.selectionBackground': '#45475a',
                  'editorCursor.foreground': '#f5e0dc',
                  'editorLineNumber.foreground': '#6c7086',
                  'editorLineNumber.activeForeground': '#cdd6f4',
                  'editor.inactiveSelectionBackground': '#31324480',
                  'editorBracketMatch.background': '#45475a',
                  'editorBracketMatch.border': '#89b4fa',
                  'editorIndentGuide.background': '#31324480',
                  'editorIndentGuide.activeBackground': '#45475a',
                  'editorWhitespace.foreground': '#31324480',
                  'editor.findMatchBackground': '#f9e2af40',
                  'editor.findMatchHighlightBackground': '#f9e2af20',
                  'editorGutter.background': '#1e1e2e',
                  'scrollbar.shadow': '#11111b',
                  'scrollbarSlider.background': '#45475a80',
                  'scrollbarSlider.hoverBackground': '#585b70',
                  'scrollbarSlider.activeBackground': '#6c7086',
                },
              })
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'Menlo, Monaco, "JetBrains Mono", "Fira Code", monospace',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
              renderLineHighlight: 'line',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              readOnly: false,
            }}
          />
        )}
      </div>
    </div>
  )
}
