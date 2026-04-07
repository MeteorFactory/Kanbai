import { describe, it, expect, beforeEach } from 'vitest'
import { AgentProgressParser } from '../../src/main/services/agent-progress-parser'

function toolUseEvent(id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })
}

describe('AgentProgressParser', () => {
  let parser: AgentProgressParser

  beforeEach(() => {
    parser = new AgentProgressParser()
    parser.register('term-1', 'task-abc')
  })

  it('returns null for non-JSON lines', () => {
    const result = parser.feed('term-1', 'some random terminal output\n')
    expect(result).toBeNull()
  })

  it('returns null for unregistered terminals', () => {
    const line = toolUseEvent('t1', 'TaskCreate', { subject: 'Do stuff' })
    const result = parser.feed('unknown-term', line + '\n')
    expect(result).toBeNull()
  })

  it('extracts progress from TodoWrite with items', () => {
    const line = toolUseEvent('t1', 'TodoWrite', {
      todos: [
        { content: 'Setup project', status: 'completed' },
        { content: 'Write parser', status: 'in_progress' },
        { content: 'Add UI', status: 'pending' },
      ],
    })
    const result = parser.feed('term-1', line + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '1/3',
      message: 'Write parser',
      items: [
        { label: 'Setup project', status: 'completed' },
        { label: 'Write parser', status: 'in_progress' },
        { label: 'Add UI', status: 'pending' },
      ],
    })
  })

  it('extracts progress from TaskCreate with items', () => {
    parser.feed('term-1', toolUseEvent('t1', 'TaskCreate', { subject: 'First task' }) + '\n')
    const result = parser.feed('term-1', toolUseEvent('t2', 'TaskCreate', { subject: 'Second task' }) + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '0/2',
      message: 'Second task',
      items: [
        { label: 'First task', status: 'pending' },
        { label: 'Second task', status: 'pending' },
      ],
    })
  })

  it('extracts progress from TaskUpdate completed with items', () => {
    parser.feed('term-1', toolUseEvent('t1', 'TaskCreate', { subject: 'Task A' }) + '\n')
    parser.feed('term-1', toolUseEvent('t2', 'TaskCreate', { subject: 'Task B' }) + '\n')

    const result = parser.feed('term-1', toolUseEvent('t3', 'TaskUpdate', { taskId: '1', status: 'completed', subject: 'Task A' }) + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '1/2',
      message: 'Task A',
      items: [
        { label: 'Task A', status: 'completed' },
        { label: 'Task B', status: 'pending' },
      ],
    })
  })

  it('extracts progress from TaskUpdate in_progress with items', () => {
    parser.feed('term-1', toolUseEvent('t1', 'TaskCreate', { subject: 'Task A' }) + '\n')

    const result = parser.feed('term-1', toolUseEvent('t4', 'TaskUpdate', { taskId: '1', status: 'in_progress', subject: 'Task A' }) + '\n')
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '0/1',
      message: 'Task A',
      items: [
        { label: 'Task A', status: 'in_progress' },
      ],
    })
  })

  it('handles partial lines across multiple feeds', () => {
    const fullLine = toolUseEvent('t1', 'TodoWrite', {
      todos: [
        { content: 'Done', status: 'completed' },
        { content: 'Next', status: 'in_progress' },
      ],
    })
    const half1 = fullLine.slice(0, 50)
    const half2 = fullLine.slice(50) + '\n'

    expect(parser.feed('term-1', half1)).toBeNull()
    const result = parser.feed('term-1', half2)
    expect(result).toEqual({
      taskId: 'task-abc',
      progress: '1/2',
      message: 'Next',
      items: [
        { label: 'Done', status: 'completed' },
        { label: 'Next', status: 'in_progress' },
      ],
    })
  })

  it('deduplicates tool_use IDs', () => {
    const line = toolUseEvent('same-id', 'TaskCreate', { subject: 'X' })
    parser.feed('term-1', line + '\n')
    const r2 = parser.feed('term-1', line + '\n')
    expect(r2).toBeNull()
  })

  it('cleanup removes terminal state', () => {
    parser.unregister('term-1')
    const line = toolUseEvent('t1', 'TaskCreate', { subject: 'X' })
    const result = parser.feed('term-1', line + '\n')
    expect(result).toBeNull()
  })
})
