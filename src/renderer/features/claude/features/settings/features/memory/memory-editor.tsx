import { useState, useCallback, useEffect, useRef } from 'react'
import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

interface Props {
  title: string
  content: string
  readOnly?: boolean
  onSave?: (content: string) => Promise<void>
}

export function MemoryEditor({ title, content, readOnly = false, onSave }: Props) {
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef<() => void>(() => {})

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monaco.editor.defineTheme('catppuccin-mocha', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '565C66', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'a78bfa' },
        { token: 'string', foreground: '3DD68C' },
      ],
      colors: {
        'editor.background': '#0B0D0F',
        'editor.foreground': '#F0F2F4',
        'editor.lineHighlightBackground': '#1A1D22',
        'editor.selectionBackground': '#1F2328',
        'editorCursor.foreground': '#f5e0dc',
        'editorLineNumber.foreground': '#565C66',
        'editorLineNumber.activeForeground': '#F0F2F4',
      },
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!onSave) return
    const val = editorRef.current?.getValue() ?? content
    setSaving(true)
    await onSave(val)
    setDirty(false)
    setSaving(false)
  }, [content, onSave])

  // Keep save ref in sync so the Monaco action always calls the latest version
  useEffect(() => { saveRef.current = handleSave })

  const handleMount: OnMount = useCallback((ed) => {
    editorRef.current = ed
    if (!readOnly) {
      ed.addAction({
        id: 'save-memory',
        label: 'Save',
        keybindings: [2048 | 49],
        run: () => { saveRef.current() },
      })
    }
  }, [readOnly])

  return (
    <div className="cs-memory-editor">
      <div className="claude-rules-editor-header" style={{ padding: '6px 12px' }}>
        <span className="claude-rules-editor-title" style={{ fontSize: 12 }}>{title}</span>
        {dirty && <span className="file-viewer-dirty-dot" />}
        {!readOnly && onSave && (
          <button className="file-viewer-save-btn" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? '...' : 'Save'}
          </button>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Editor
            key={title}
            height="100%"
            defaultValue={content}
            language="markdown"
            theme="catppuccin-mocha"
            onChange={() => { if (!dirty) setDirty(true) }}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: 'Menlo',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 6 },
              wordWrap: 'on',
              readOnly,
              domReadOnly: readOnly,
            }}
          />
        </div>
      </div>
    </div>
  )
}
