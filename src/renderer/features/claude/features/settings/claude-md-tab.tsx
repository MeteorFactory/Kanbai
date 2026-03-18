import { useState, useCallback, useRef } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useI18n } from '../../../../lib/i18n'

interface Props {
  claudeMd: string
  projectPath: string
  onSave: (content: string) => Promise<void>
}

export function ClaudeMdTab({ claudeMd, projectPath, onSave }: Props) {
  const { t } = useI18n()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleSave = useCallback(async () => {
    const content = editorRef.current?.getValue() ?? claudeMd
    setSaving(true)
    await onSave(content)
    setDirty(false)
    setSaving(false)
  }, [claudeMd, onSave])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    editor.addAction({
      id: 'save-claude-md',
      label: t('claude.saveMd'),
      keybindings: [2048 | 49], // Cmd+S
      run: () => { handleSave() },
    })
  }, [handleSave, t])

  return (
    <div className="claude-rules-editor-wrap">
      <div className="claude-rules-editor-header">
        <span className="claude-rules-editor-title">CLAUDE.md</span>
        {dirty && <span className="file-viewer-dirty-dot" />}
        <button
          className="file-viewer-save-btn"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
      <div className="claude-rules-editor">
        <Editor
          key={projectPath + '/CLAUDE.md'}
          defaultValue={claudeMd}
          language="markdown"
          theme="catppuccin-mocha"
          onChange={() => { if (!dirty) setDirty(true) }}
          onMount={handleEditorMount}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme('catppuccin-mocha', {
              base: 'vs-dark',
              inherit: true,
              rules: [
                { token: 'comment', foreground: '565C66', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'a78bfa' },
                { token: 'string', foreground: '3DD68C' },
              ],
              colors: {
                'editor.background': '#0E0D0B',
                'editor.foreground': '#E0DCE8',
                'editor.lineHighlightBackground': '#201F1C',
                'editor.selectionBackground': '#201F1C',
                'editorCursor.foreground': '#f5e0dc',
                'editorLineNumber.foreground': '#6B6A65',
                'editorLineNumber.activeForeground': '#E0DCE8',
              },
            })
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'Menlo',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8 },
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  )
}
