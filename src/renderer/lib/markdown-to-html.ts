/**
 * Converts markdown text to sanitized HTML.
 * Escapes all HTML entities including quotes, and blocks dangerous protocols in links.
 */
export function markdownToHtml(md: string): string {
  let html = md
  // Escape HTML entities first (including quotes to prevent attribute injection)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre class="md-code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links — sanitize href to block dangerous protocols (javascript:, data:, vbscript:)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, href: string) => {
    const decoded = href.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    const trimmed = decoded.replace(/\s/g, '').toLowerCase()
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      return `<span class="md-link md-link--blocked">${text}</span>`
    }
    return `<a href="${href}" class="md-link" rel="noopener noreferrer">${text}</a>`
  })

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>')

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr />')

  // Paragraphs - wrap remaining text blocks
  html = html.replace(/^(?!<[a-z]|<\/|$)(.+)$/gm, '<p>$1</p>')

  return html
}
