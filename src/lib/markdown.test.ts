import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders markdown to HTML', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
    expect(renderMarkdown('- a\n- b')).toContain('<li>a</li>')
  })

  it('strips dangerous HTML and javascript: URLs', () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))')
    expect(out).not.toContain('onerror')
    expect(out.toLowerCase()).not.toContain('javascript:')
    expect(out).not.toContain('<script')
  })

  it('returns an empty string for empty/null input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
  })
})
