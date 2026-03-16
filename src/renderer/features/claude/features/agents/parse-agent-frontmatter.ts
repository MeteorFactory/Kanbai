export interface EnrichedAgent {
  filename: string
  name: string
  description: string
  tools: string[]
  model?: string
  content: string
  disabled?: boolean
  userInvocable?: boolean
  disableModelInvocation?: boolean
  context?: string
  storeOrigin?: string
}

export function parseAgentFrontmatter(filename: string, raw: string): EnrichedAgent {
  const isDisabled = filename.endsWith('.md.disabled')
  const name = filename.replace(/\.md(\.disabled)?$/, '')
  let description = ''
  let tools: string[] = []
  let model: string | undefined
  let content = raw
  let userInvocable: boolean | undefined
  let disableModelInvocation: boolean | undefined
  let context: string | undefined
  let storeOrigin: string | undefined

  // Parse YAML frontmatter between --- delimiters
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (fmMatch) {
    const frontmatter = fmMatch[1]!
    content = fmMatch[2]!

    // Extract description
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    if (descMatch) description = descMatch[1]!.trim()

    // Extract tools (YAML array: [Read, Edit, ...] or multiline)
    const toolsInlineMatch = frontmatter.match(/^(?:tools|allowed-tools):\s*\[([^\]]*)\]$/m)
    if (toolsInlineMatch) {
      tools = toolsInlineMatch[1]!.split(',').map((t) => t.trim()).filter(Boolean)
    } else {
      const toolsMultiMatch = frontmatter.match(/^(?:tools|allowed-tools):\s*\n((?:\s+-\s+.+\n?)*)/m)
      if (toolsMultiMatch) {
        tools = toolsMultiMatch[1]!.split('\n')
          .map((l) => l.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean)
      }
    }

    // Extract model
    const modelMatch = frontmatter.match(/^model:\s*(.+)$/m)
    if (modelMatch) model = modelMatch[1]!.trim()

    // Extract user-invocable
    const uiMatch = frontmatter.match(/^user-invocable:\s*(.+)$/m)
    if (uiMatch) userInvocable = uiMatch[1]!.trim() === 'true'

    // Extract disable-model-invocation
    const dmiMatch = frontmatter.match(/^disable-model-invocation:\s*(.+)$/m)
    if (dmiMatch) disableModelInvocation = dmiMatch[1]!.trim() === 'true'

    // Extract context
    const ctxMatch = frontmatter.match(/^context:\s*(.+)$/m)
    if (ctxMatch) context = ctxMatch[1]!.trim()

    // Extract store-origin
    const originMatch = frontmatter.match(/^store-origin:\s*(.+)$/m)
    if (originMatch) storeOrigin = originMatch[1]!.trim()
  }

  return {
    filename, name, description, tools, model,
    content: content.trim(),
    disabled: isDisabled || undefined,
    userInvocable, disableModelInvocation, context, storeOrigin,
  }
}

export function buildAgentContent(agent: Partial<EnrichedAgent> & { content: string }): string {
  const parts: string[] = []
  const hasFrontmatter = agent.description || (agent.tools && agent.tools.length > 0) || agent.model
    || agent.userInvocable !== undefined || agent.disableModelInvocation !== undefined || agent.context || agent.storeOrigin
  if (hasFrontmatter) {
    parts.push('---')
    if (agent.description) parts.push(`description: ${agent.description}`)
    if (agent.tools && agent.tools.length > 0) parts.push(`tools: [${agent.tools.join(', ')}]`)
    if (agent.model) parts.push(`model: ${agent.model}`)
    if (agent.userInvocable !== undefined) parts.push(`user-invocable: ${agent.userInvocable}`)
    if (agent.disableModelInvocation !== undefined) parts.push(`disable-model-invocation: ${agent.disableModelInvocation}`)
    if (agent.context) parts.push(`context: ${agent.context}`)
    if (agent.storeOrigin) parts.push(`store-origin: ${agent.storeOrigin}`)
    parts.push('---')
    parts.push('')
  }
  parts.push(agent.content)
  return parts.join('\n')
}
