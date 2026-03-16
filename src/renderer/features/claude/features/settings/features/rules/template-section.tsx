import React, { useState, useMemo, useCallback } from 'react'
import { TemplateRuleEntry } from '../../../../../../../shared/types'
import { useI18n } from '../../../../../../lib/i18n'

interface TemplateTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TemplateTreeNode[]
  template?: TemplateRuleEntry
}

interface Props {
  templates: TemplateRuleEntry[]
  onSelect: (relativePath: string) => void
  onImport: (relativePaths: string[]) => void
  selectedPath: string | null
}

/** Get all file paths under a directory node (pure traversal, no reactive deps) */
function getFilesUnderDir(node: TemplateTreeNode): string[] {
  if (node.type === 'file') return [node.path]
  const files: string[] = []
  for (const child of node.children || []) {
    files.push(...getFilesUnderDir(child))
  }
  return files
}

export function TemplateSection({ templates, onSelect, onImport, selectedPath }: Props) {
  const { t } = useI18n()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Build tree from flat templates
  const tree = useMemo(() => {
    const root: TemplateTreeNode[] = []
    const dirMap = new Map<string, TemplateTreeNode>()

    function ensureDir(dirPath: string): TemplateTreeNode {
      if (dirMap.has(dirPath)) return dirMap.get(dirPath)!
      const parts = dirPath.split('/')
      let parent = root
      let currentPath = ''
      for (const part of parts) {
        currentPath = currentPath ? currentPath + '/' + part : part
        if (!dirMap.has(currentPath)) {
          const node: TemplateTreeNode = { name: part, path: currentPath, type: 'directory', children: [] }
          dirMap.set(currentPath, node)
          parent.push(node)
        }
        parent = dirMap.get(currentPath)!.children!
      }
      return dirMap.get(dirPath)!
    }

    for (const tmpl of templates) {
      const parts = tmpl.relativePath.split('/')
      if (parts.length === 1) {
        root.push({ name: tmpl.filename, path: tmpl.relativePath, type: 'file', template: tmpl })
      } else {
        const parentPath = parts.slice(0, -1).join('/')
        const parent = ensureDir(parentPath)
        parent.children!.push({ name: tmpl.filename, path: tmpl.relativePath, type: 'file', template: tmpl })
      }
    }

    // Sort: directories first, then alphabetical
    function sortNodes(nodes: TemplateTreeNode[]): TemplateTreeNode[] {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      for (const n of nodes) {
        if (n.children) sortNodes(n.children)
      }
      return nodes
    }
    return sortNodes(root)
  }, [templates])

  const toggleCheck = useCallback((node: TemplateTreeNode) => {
    setChecked((prev) => {
      const next = new Set(prev)
      const files = node.type === 'directory' ? getFilesUnderDir(node) : [node.path]
      const allChecked = files.every((f) => next.has(f))
      for (const f of files) {
        if (allChecked) next.delete(f)
        else next.add(f)
      }
      return next
    })
  }, [])

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleImport = useCallback(() => {
    if (checked.size === 0) return
    onImport(Array.from(checked))
    setChecked(new Set())
  }, [checked, onImport])

  const renderNode = (node: TemplateTreeNode, depth: number): React.JSX.Element[] => {
    const elements: React.JSX.Element[] = []
    const isExp = expanded.has(node.path)
    const isDir = node.type === 'directory'
    const files = isDir ? getFilesUnderDir(node) : [node.path]
    const allChecked = files.length > 0 && files.every((f) => checked.has(f))
    const someChecked = !allChecked && files.some((f) => checked.has(f))

    elements.push(
      <div
        key={node.path}
        className={`cs-rules-tree-item${selectedPath === node.path ? ' cs-rules-tree-item--active' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => isDir ? toggleExpand(node.path) : onSelect(node.path)}
      >
        <label className="cs-rules-template-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked }}
            onChange={() => toggleCheck(node)}
          />
        </label>
        {isDir ? (
          <span className={`cs-rules-tree-chevron${isExp ? ' cs-rules-tree-chevron--expanded' : ''}`}>▶</span>
        ) : (
          <span className="cs-rules-tree-chevron cs-rules-tree-chevron--placeholder">▶</span>
        )}
        <span className="cs-rules-file-name" style={{ flex: 1 }}>{node.name}</span>
      </div>,
    )

    if (isDir && isExp && node.children) {
      for (const child of node.children) {
        elements.push(...renderNode(child, depth + 1))
      }
    }

    return elements
  }

  if (templates.length === 0) return null

  return (
    <div className="cs-rules-template-section">
      <div className="cs-rules-template-header">
        <div className="cs-rules-section-label" style={{ margin: 0 }}>{t('claude.templateRules')}</div>
        {checked.size > 0 && (
          <button
            className="modal-btn modal-btn--primary"
            style={{ fontSize: 10, padding: '2px 8px' }}
            onClick={handleImport}
          >
            {t('claude.addSelected')}
          </button>
        )}
      </div>
      {checked.size > 0 && (
        <div className="cs-rules-template-count">
          {t('claude.selectedCount').replace('{count}', String(checked.size))}
        </div>
      )}
      {tree.map((node) => renderNode(node, 0))}
    </div>
  )
}
