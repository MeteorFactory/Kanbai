// Rules tree types

export interface RuleEntry {
  relativePath: string    // "conventions/core.md"
  filename: string        // "core.md"
  fullPath: string
  paths: string[]         // depuis frontmatter YAML
  content: string
  isSymlink: boolean
  symlinkTarget: string
  author?: string
  authorUrl?: string
  coAuthors?: string[]
}

export interface RuleTreeNode {
  name: string
  relativePath: string    // "lang/typescript"
  type: 'file' | 'directory'
  children?: RuleTreeNode[]
  rule?: RuleEntry
}

export interface TemplateRuleEntry {
  relativePath: string    // "react/rules/components.md"
  filename: string
  framework: string       // "_shared", "react", "nextjs"...
  content: string
  author: string
  authorUrl: string
}
