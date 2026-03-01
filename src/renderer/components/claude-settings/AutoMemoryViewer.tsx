import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import { MemoryEditor } from './MemoryEditor'

interface Props {
  projectPath: string
}

export function AutoMemoryViewer({ projectPath }: Props) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [topicFiles, setTopicFiles] = useState<{ name: string; path: string }[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [topicContent, setTopicContent] = useState('')

  const load = useCallback(async () => {
    const result = await window.mirehub.claudeMemory.readAuto(projectPath)
    setContent(result.content)
    setTopicFiles(result.topicFiles)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const handleSelectTopic = useCallback(async (topicPath: string) => {
    setSelectedTopic(topicPath)
    const c = await window.mirehub.claudeMemory.readFile(topicPath)
    setTopicContent(c ?? '')
  }, [])

  return (
    <div>
      {content ? (
        <MemoryEditor title="MEMORY.md" content={content} readOnly />
      ) : (
        <div className="cs-toggle-desc" style={{ padding: '8px 0' }}>{t('claude.noAutoMemory')}</div>
      )}

      {topicFiles.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <label className="claude-rules-label">{t('claude.autoMemoryTopics')}</label>
          <div className="cs-rules-list">
            {topicFiles.map((tf) => (
              <button
                key={tf.path}
                className={`cs-rule-item${selectedTopic === tf.path ? ' cs-rule-item--active' : ''}`}
                onClick={() => handleSelectTopic(tf.path)}
              >
                {tf.name}
              </button>
            ))}
          </div>
          {selectedTopic && topicContent && (
            <div style={{ marginTop: 6 }}>
              <MemoryEditor title={selectedTopic.split(/[\\/]/).pop() ?? ''} content={topicContent} readOnly />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
