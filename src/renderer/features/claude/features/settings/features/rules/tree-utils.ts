import { RuleEntry, RuleTreeNode } from '../../../../../../../shared/types'

/**
 * Build a tree structure from flat rule entries and directory list.
 */
export function buildRuleTree(rules: RuleEntry[], directories: string[]): RuleTreeNode[] {
  const root: RuleTreeNode[] = []
  const dirMap = new Map<string, RuleTreeNode>()

  // Create directory nodes
  for (const dirPath of directories) {
    ensureDir(dirPath, root, dirMap)
  }

  // Place each rule in its parent directory
  for (const rule of rules) {
    const parts = rule.relativePath.split('/')
    if (parts.length === 1) {
      // Root-level file
      root.push({
        name: rule.filename,
        relativePath: rule.relativePath,
        type: 'file',
        rule,
      })
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = ensureDir(parentPath, root, dirMap)
      parent.children!.push({
        name: rule.filename,
        relativePath: rule.relativePath,
        type: 'file',
        rule,
      })
    }
  }

  return sortTree(root)
}

function ensureDir(
  dirPath: string,
  root: RuleTreeNode[],
  dirMap: Map<string, RuleTreeNode>,
): RuleTreeNode {
  if (dirMap.has(dirPath)) return dirMap.get(dirPath)!

  const parts = dirPath.split('/')
  let parent: RuleTreeNode[] = root
  let currentPath = ''

  for (let i = 0; i < parts.length; i++) {
    currentPath = currentPath ? currentPath + '/' + parts[i] : parts[i]!
    if (!dirMap.has(currentPath)) {
      const node: RuleTreeNode = {
        name: parts[i]!,
        relativePath: currentPath,
        type: 'directory',
        children: [],
      }
      dirMap.set(currentPath, node)
      parent.push(node)
    }
    parent = dirMap.get(currentPath)!.children!
  }

  return dirMap.get(dirPath)!
}

/**
 * Sort tree: directories first, then alphabetical.
 */
export function sortTree(nodes: RuleTreeNode[]): RuleTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of sorted) {
    if (node.children) {
      node.children = sortTree(node.children)
    }
  }
  return sorted
}

/**
 * Parse author info from YAML frontmatter.
 */
export function parseAuthorFrontmatter(content: string): {
  author?: string
  authorUrl?: string
  coAuthors?: string[]
} {
  const result: { author?: string; authorUrl?: string; coAuthors?: string[] } = {}
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch || !fmMatch[1]) return result

  const fm = fmMatch[1]
  const authorMatch = fm.match(/^author:\s*(.+)$/m)
  if (authorMatch && authorMatch[1]) result.author = authorMatch[1].trim().replace(/^["']|["']$/g, '')
  const authorUrlMatch = fm.match(/^authorUrl:\s*(.+)$/m)
  if (authorUrlMatch && authorUrlMatch[1]) result.authorUrl = authorUrlMatch[1].trim().replace(/^["']|["']$/g, '')
  const coAuthorsMatch = fm.match(/coAuthors:\s*\n((?:\s+-\s+.+\n?)*)/)
  if (coAuthorsMatch && coAuthorsMatch[1]) {
    result.coAuthors = coAuthorsMatch[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
  }
  return result
}

/**
 * Add a co-author to the frontmatter. If no frontmatter exists, creates one.
 */
export function updateAuthorFrontmatter(content: string, coAuthorName: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)

  if (!fmMatch || !fmMatch[1]) {
    // No frontmatter — add one with co-author
    return `---\ncoAuthors:\n  - ${coAuthorName}\n---\n\n${content}`
  }

  const fm = fmMatch[1]
  // Check if co-author already listed
  const coAuthorsMatch = fm.match(/coAuthors:\s*\n((?:\s+-\s+.+\n?)*)/)
  if (coAuthorsMatch && coAuthorsMatch[1]) {
    const existing = coAuthorsMatch[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    if (existing.includes(coAuthorName)) return content
    // Add to existing list
    const newList = coAuthorsMatch[0].trimEnd() + `\n  - ${coAuthorName}`
    return content.replace(coAuthorsMatch[0], newList)
  }

  // No coAuthors key yet — add it before closing ---
  const newFm = fm.trimEnd() + `\ncoAuthors:\n  - ${coAuthorName}`
  return content.replace(fmMatch[1], newFm)
}
