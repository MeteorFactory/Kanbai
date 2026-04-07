import { describe, it, expect, beforeEach } from 'vitest'
import { AgentProgressParser } from '../../src/main/services/agent-progress-parser'

function toolUseEvent(id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })
}

function thinkingEvent(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'thinking', thinking: text }] },
  })
}

function textEvent(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
  })
}

function resultEvent(): string {
  return JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 5000 })
}

describe('AgentProgressParser', () => {
  let parser: AgentProgressParser

  beforeEach(() => {
    parser = new AgentProgressParser()
    parser.register('term-1', 'task-abc')
  })

  it('returns null for non-JSON lines', () => {
    expect(parser.feed('term-1', 'some random terminal output\n')).toBeNull()
  })

  it('returns null for unregistered terminals', () => {
    expect(parser.feed('unknown', toolUseEvent('t1', 'TaskCreate', { subject: 'X' }) + '\n')).toBeNull()
  })

  it('extracts progress from TodoWrite with items', () => {
    const result = parser.feed('term-1', toolUseEvent('t1', 'TodoWrite', {
      todos: [
        { content: 'Setup project', status: 'completed' },
        { content: 'Write parser', status: 'in_progress' },
        { content: 'Add UI', status: 'pending' },
      ],
    }) + '\n')
    expect(result!.progress).toBe('1/3')
    expect(result!.items).toEqual([
      { label: 'Setup project', status: 'completed' },
      { label: 'Write parser', status: 'in_progress' },
      { label: 'Add UI', status: 'pending' },
    ])
    expect(result!.activity.type).toBe('tool')
  })

  it('extracts progress from TaskCreate with items', () => {
    parser.feed('term-1', toolUseEvent('t1', 'TaskCreate', { subject: 'First' }) + '\n')
    const result = parser.feed('term-1', toolUseEvent('t2', 'TaskCreate', { subject: 'Second' }) + '\n')
    expect(result!.progress).toBe('0/2')
    expect(result!.items).toHaveLength(2)
  })

  it('extracts progress from TaskUpdate completed', () => {
    parser.feed('term-1', toolUseEvent('t1', 'TaskCreate', { subject: 'Task A' }) + '\n')
    parser.feed('term-1', toolUseEvent('t2', 'TaskCreate', { subject: 'Task B' }) + '\n')
    const result = parser.feed('term-1', toolUseEvent('t3', 'TaskUpdate', { taskId: '1', status: 'completed', subject: 'Task A' }) + '\n')
    expect(result!.progress).toBe('1/2')
    expect(result!.items[0]!.status).toBe('completed')
  })

  it('handles partial lines across multiple feeds', () => {
    const fullLine = toolUseEvent('t1', 'TodoWrite', {
      todos: [{ content: 'Done', status: 'completed' }, { content: 'Next', status: 'in_progress' }],
    })
    expect(parser.feed('term-1', fullLine.slice(0, 50))).toBeNull()
    const result = parser.feed('term-1', fullLine.slice(50) + '\n')
    expect(result!.progress).toBe('1/2')
  })

  it('deduplicates tool_use IDs', () => {
    const line = toolUseEvent('same-id', 'TaskCreate', { subject: 'X' })
    parser.feed('term-1', line + '\n')
    expect(parser.feed('term-1', line + '\n')).toBeNull()
  })

  it('cleanup removes terminal state', () => {
    parser.unregister('term-1')
    expect(parser.feed('term-1', toolUseEvent('t1', 'TaskCreate', { subject: 'X' }) + '\n')).toBeNull()
  })

  // Activity tracking tests
  describe('activity tracking', () => {
    it('detects thinking activity', () => {
      const result = parser.feed('term-1', thinkingEvent('Let me analyze this...') + '\n')
      expect(result!.activity).toEqual({ type: 'thinking', label: 'Réflexion...' })
    })

    it('detects text output activity', () => {
      const result = parser.feed('term-1', textEvent('Here is my analysis...') + '\n')
      expect(result!.activity).toEqual({ type: 'text', label: 'Rédaction...' })
    })

    it('detects Read tool activity', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'Read', { file_path: '/src/main/index.ts' }) + '\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Lecture', detail: '.../main/index.ts' })
    })

    it('detects Edit tool activity', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'Edit', { file_path: '/a/b/c.ts' }) + '\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Modification', detail: '.../b/c.ts' })
    })

    it('detects Bash tool activity', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'Bash', { command: 'npm test' }) + '\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Commande', detail: 'npm test' })
    })

    it('detects Grep tool activity', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'Grep', { pattern: 'useEffect' }) + '\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Recherche', detail: 'useEffect' })
    })

    it('detects Agent (subagent) activity', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'Agent', {
        description: 'Find ProjectItem component',
        subagent_type: 'Explore',
      }) + '\n')
      expect(result!.activity).toEqual({
        type: 'subagent',
        label: 'Find ProjectItem component',
        detail: 'Explore',
      })
    })

    it('detects WebSearch activity', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'WebSearch', { query: 'react 19 new features' }) + '\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Recherche web', detail: 'react 19 new features' })
    })

    it('resets activity on session end', () => {
      parser.feed('term-1', thinkingEvent('thinking...') + '\n')
      const result = parser.feed('term-1', resultEvent() + '\n')
      expect(result!.activity).toEqual({ type: 'idle', label: '' })
    })

    it('truncates long bash commands', () => {
      const longCmd = 'find / -name "*.ts" -exec grep -l "something very very very very very very long" {} \\;'
      const result = parser.feed('term-1', toolUseEvent('t1', 'Bash', { command: longCmd }) + '\n')
      expect(result!.activity.detail!.length).toBeLessThanOrEqual(61)
      expect(result!.activity.detail!.endsWith('…')).toBe(true)
    })

    it('handles unknown tools gracefully', () => {
      const result = parser.feed('term-1', toolUseEvent('t1', 'SomeNewTool', { arg: 'val' }) + '\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'SomeNewTool' })
    })
  })
})
