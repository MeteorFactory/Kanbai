import { describe, it, expect } from 'vitest'
import { markdownToHtml } from '../../src/renderer/lib/markdown-to-html'

describe('markdownToHtml', () => {
  describe('HTML entity escaping', () => {
    it('should escape < > & characters', () => {
      const result = markdownToHtml('<script>alert(1)</script> & "quotes"')
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('&amp;')
    })

    it('should escape double quotes to &quot;', () => {
      const result = markdownToHtml('He said "hello"')
      expect(result).toContain('&quot;hello&quot;')
      expect(result).not.toContain('"hello"')
    })
  })

  describe('XSS: attribute injection via unescaped quote in href', () => {
    it('should neutralize attribute injection with " in link href', () => {
      const malicious = '[click](test" onmouseover="alert(document.cookie))'
      const result = markdownToHtml(malicious)
      // Quotes in href must be escaped to &quot; so they cannot break out of the attribute
      expect(result).toContain('&quot;')
      // The output must NOT contain a raw unescaped onmouseover attribute
      // (i.e. onmouseover=" with an actual quote, not &quot;)
      expect(result).not.toMatch(/onmouseover="[^&]/)
    })

    it('should escape quotes inside href attribute value', () => {
      const malicious = '[click](test" onclick="alert(1))'
      const result = markdownToHtml(malicious)
      // onclick must not appear as an actual HTML attribute (with real quote delimiter)
      expect(result).not.toMatch(/onclick="alert/)
      expect(result).toContain('&quot;')
    })
  })

  describe('XSS: dangerous protocol filtering in links', () => {
    it('should block javascript: protocol links', () => {
      const result = markdownToHtml('[click me](javascript:alert(1))')
      expect(result).not.toContain('href="javascript:')
      expect(result).toContain('md-link--blocked')
      expect(result).toContain('click me')
    })

    it('should block JavaScript: with mixed case', () => {
      const result = markdownToHtml('[click](JaVaScRiPt:alert(1))')
      expect(result).not.toContain('href=')
      expect(result).toContain('md-link--blocked')
    })

    it('should block javascript: with whitespace obfuscation', () => {
      const result = markdownToHtml('[click](java\tscript:alert(1))')
      expect(result).not.toContain('href="java')
      expect(result).toContain('md-link--blocked')
    })

    it('should block data: protocol links', () => {
      const result = markdownToHtml('[click](data:text/html,<script>alert(1)</script>)')
      expect(result).not.toContain('href="data:')
      expect(result).toContain('md-link--blocked')
    })

    it('should block vbscript: protocol links', () => {
      const result = markdownToHtml('[click](vbscript:MsgBox("XSS"))')
      expect(result).not.toContain('href="vbscript:')
      expect(result).toContain('md-link--blocked')
    })
  })

  describe('safe links remain functional', () => {
    it('should allow https: links', () => {
      const result = markdownToHtml('[example](https://example.com)')
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('class="md-link"')
      expect(result).toContain('rel="noopener noreferrer"')
    })

    it('should allow http: links', () => {
      const result = markdownToHtml('[example](http://example.com)')
      expect(result).toContain('href="http://example.com"')
    })

    it('should allow mailto: links', () => {
      const result = markdownToHtml('[email](mailto:user@example.com)')
      expect(result).toContain('href="mailto:user@example.com"')
    })

    it('should allow anchor links', () => {
      const result = markdownToHtml('[section](#my-section)')
      expect(result).toContain('href="#my-section"')
    })

    it('should allow relative paths', () => {
      const result = markdownToHtml('[file](./docs/readme.md)')
      expect(result).toContain('href="./docs/readme.md"')
    })
  })

  describe('standard markdown rendering (regression)', () => {
    it('should render headers', () => {
      expect(markdownToHtml('# Title')).toContain('<h1>Title</h1>')
      expect(markdownToHtml('## Subtitle')).toContain('<h2>Subtitle</h2>')
      expect(markdownToHtml('### H3')).toContain('<h3>H3</h3>')
    })

    it('should render bold text', () => {
      expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>')
    })

    it('should render italic text', () => {
      expect(markdownToHtml('*italic*')).toContain('<em>italic</em>')
    })

    it('should render inline code', () => {
      expect(markdownToHtml('use `npm install`')).toContain('<code class="md-inline-code">npm install</code>')
    })

    it('should render code blocks', () => {
      const md = '```js\nconst x = 1\n```'
      const result = markdownToHtml(md)
      expect(result).toContain('<pre class="md-code-block"')
      expect(result).toContain('const x = 1')
    })

    it('should render blockquotes', () => {
      const result = markdownToHtml('> This is a quote')
      expect(result).toContain('<blockquote')
      expect(result).toContain('This is a quote')
    })

    it('should render unordered lists', () => {
      const result = markdownToHtml('- item one\n- item two')
      expect(result).toContain('<li>item one</li>')
      expect(result).toContain('<ul>')
    })

    it('should render horizontal rules', () => {
      expect(markdownToHtml('---')).toContain('<hr />')
    })
  })
})
