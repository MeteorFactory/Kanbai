import { describe, it, expect, beforeEach } from 'vitest'
import { AgentProgressParser } from '../../src/main/services/agent-progress-parser'

describe('AgentProgressParser', () => {
  let parser: AgentProgressParser

  beforeEach(() => {
    parser = new AgentProgressParser()
    parser.register('term-1', 'task-abc')
  })

  it('returns null for empty/non-matching lines', () => {
    expect(parser.feed('term-1', 'some random terminal output\n')).toBeNull()
  })

  it('returns null for unregistered terminals', () => {
    expect(parser.feed('unknown', '✶ Thinking…\n')).toBeNull()
  })

  it('cleanup removes terminal state', () => {
    parser.unregister('term-1')
    expect(parser.feed('term-1', '✶ Thinking…\n')).toBeNull()
  })

  describe('thinking/spinner detection', () => {
    it('detects spinner with unicode symbol', () => {
      const result = parser.feed('term-1', '✶ Hyperspacing…\n')
      expect(result!.activity.type).toBe('thinking')
      expect(result!.activity.label).toBe('Hyperspacing…')
    })

    it('detects spinner with extra info', () => {
      const result = parser.feed('term-1', '✻ Cerebrating… (2m24s · ↓ 4.1k tokens)\n')
      expect(result!.activity.type).toBe('thinking')
      expect(result!.activity.label).toBe('Cerebrating…')
    })

    it('detects standalone thinking word', () => {
      const result = parser.feed('term-1', 'Pollinating…\n')
      expect(result!.activity.type).toBe('thinking')
      expect(result!.activity.label).toBe('Pollinating…')
    })

    it('detects ANSI-wrapped spinner', () => {
      const result = parser.feed('term-1', '\x1b[38;2;215;119;87m✢\x1b[39m \x1b[38;2;235;159;127mMulling…\x1b[39m (thinking)\n')
      expect(result!.activity.type).toBe('thinking')
    })
  })

  describe('tool detection', () => {
    it('detects Read tool', () => {
      const result = parser.feed('term-1', '⏺ Read src/main/index.ts\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Lecture', detail: 'src/main/index.ts' })
    })

    it('detects Reading N files', () => {
      const result = parser.feed('term-1', 'Reading 3 files\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Lecture', detail: '3 fichiers' })
    })

    it('detects Read tool with ● bullet prefix', () => {
      const result = parser.feed('term-1', '● Reading 1 file… (ctrl+o to expand)\n')
      expect(result!.activity.type).toBe('tool')
      expect(result!.activity.label).toBe('Lecture')
    })

    it('detects Edit tool', () => {
      const result = parser.feed('term-1', '⏺ Edit src/renderer/App.tsx\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Modification', detail: 'src/renderer/App.tsx' })
    })

    it('detects Write tool', () => {
      const result = parser.feed('term-1', '⏺ Write src/new-file.ts\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Écriture', detail: 'src/new-file.ts' })
    })

    it('detects Bash tool', () => {
      const result = parser.feed('term-1', '⏺ Bash(npm test)\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Commande', detail: 'npm test' })
    })

    it('truncates long bash commands', () => {
      const longCmd = 'find / -name "*.ts" -exec grep -l "something very very very very very very long" {} \\;'
      const result = parser.feed('term-1', `⏺ Bash(${longCmd})\n`)
      expect(result!.activity.detail!.length).toBeLessThanOrEqual(61)
      expect(result!.activity.detail!.endsWith('…')).toBe(true)
    })

    it('detects Grep tool', () => {
      const result = parser.feed('term-1', '⏺ Grep useEffect\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Recherche', detail: 'useEffect' })
    })

    it('detects Searched for pattern', () => {
      const result = parser.feed('term-1', 'Searched for 2 patterns, read 5 files\n')
      expect(result!.activity.type).toBe('tool')
      expect(result!.activity.label).toBe('Recherche')
    })

    it('detects Agent (subagent)', () => {
      const result = parser.feed('term-1', '⏺ Agent(Find ProjectItem component)\n')
      expect(result!.activity).toEqual({ type: 'subagent', label: 'Find ProjectItem component' })
    })

    it('detects unknown tool calls via generic pattern', () => {
      const result = parser.feed('term-1', '⏺ Update(~/.kanbai/kanban/file.json)\n')
      expect(result!.activity).toEqual({ type: 'tool', label: 'Update' })
    })

    it('ignores permission/UI lines', () => {
      expect(parser.feed('term-1', '⏵⏵ bypass permissions on (shift+tab to cycle)\n')).toBeNull()
    })
  })

  describe('task items', () => {
    it('detects completed task', () => {
      const result = parser.feed('term-1', '✔ Register ColorPickerView\n')
      expect(result!.items).toEqual([{ label: 'Register ColorPickerView', status: 'completed' }])
      expect(result!.progress).toBe('1/1')
    })

    it('detects pending task', () => {
      const result = parser.feed('term-1', '◼ Build and test\n')
      expect(result!.items).toEqual([{ label: 'Build and test', status: 'pending' }])
      expect(result!.progress).toBe('0/1')
    })

    it('builds task list from multiple items', () => {
      parser.feed('term-1', '✔ Setup project\n')
      parser.feed('term-1', '✔ Write parser\n')
      const result = parser.feed('term-1', '◼ Add UI\n')
      expect(result!.items).toHaveLength(3)
      expect(result!.progress).toBe('2/3')
    })

    it('updates existing task status', () => {
      parser.feed('term-1', '◼ Setup project\n')
      const result = parser.feed('term-1', '✔ Setup project\n')
      expect(result!.items).toHaveLength(1)
      expect(result!.items[0]!.status).toBe('completed')
    })
  })

  describe('subagent tracking', () => {
    it('detects Running N agents header', () => {
      const result = parser.feed('term-1', '● Running 2 Explore agents…\n')
      expect(result!.activity.type).toBe('subagent')
      expect(result!.activity.label).toBe('2 Explore agents')
    })

    it('collects subagent details from tree lines', () => {
      parser.feed('term-1', '● Running 2 Explore agents…\n')
      parser.feed('term-1', '├─ Explore v2 workspace/project UI · 10 tool uses · 44.9k tokens\n')
      const result = parser.feed('term-1', '└─ Explore v1 workspace/project UI · 9 tool uses · 63.7k tokens\n')
      expect(result!.subagents).toEqual([
        { name: 'Explore v2 workspace/project UI', status: '10 tool uses · 44.9k tokens' },
        { name: 'Explore v1 workspace/project UI', status: '9 tool uses · 63.7k tokens' },
      ])
      expect(result!.activity.type).toBe('subagent')
      expect(result!.activity.label).toBe('2 agents')
    })
  })

  describe('text response', () => {
    it('detects text response with ● bullet', () => {
      const result = parser.feed('term-1', '● Good. Now let me read the key files.\n')
      expect(result!.activity).toEqual({ type: 'text', label: 'Réponse...' })
    })
  })

  describe('partial lines', () => {
    it('handles partial line for spinner', () => {
      const result = parser.feed('term-1', '✶ Thinking…')
      expect(result!.activity.type).toBe('thinking')
    })
  })
})
