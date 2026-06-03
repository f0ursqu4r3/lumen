import { describe, it, expect } from 'vitest'
import { renderMarkdown, classifyUpload, extractMedia } from './markdown'

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

  const secret = (c: string) => c.repeat(32)

  it('routes relative /uploads images through the authenticated proxy', () => {
    const s = secret('a')
    const out = renderMarkdown(`![img](/uploads/${s}/pic.png)`, {
      projectPath: 'group/sub/repo',
    })
    expect(out).toContain(`src="/gitlab/v4/projects/group%2Fsub%2Frepo/uploads/${s}/pic.png"`)
  })

  it('routes /-/project/<id>/uploads images through the proxy by numeric id', () => {
    const s = secret('b')
    const out = renderMarkdown(`![img](/-/project/42/uploads/${s}/pic.png)`)
    expect(out).toContain(`src="/gitlab/v4/projects/42/uploads/${s}/pic.png"`)
  })

  it('applies GitLab {width= height=} attributes instead of leaking them as text', () => {
    const s = secret('c')
    const out = renderMarkdown(`![img](/uploads/${s}/pic.png){width=1308 height=559}`, {
      projectPath: 'g/r',
    })
    expect(out).toContain('width="1308"')
    expect(out).toContain('height="559"')
    expect(out).not.toContain('{width=1308')
  })

  it('leaves external image URLs unchanged', () => {
    const out = renderMarkdown('![x](https://example.com/a.png)')
    expect(out).toContain('src="https://example.com/a.png"')
  })

  it('leaves relative uploads unresolved when no projectPath is given', () => {
    const s = secret('d')
    const out = renderMarkdown(`![img](/uploads/${s}/pic.png)`)
    expect(out).toContain(`src="/uploads/${s}/pic.png"`)
  })

  it('does not rewrite upload-looking text inside code spans', () => {
    const s = secret('e')
    const out = renderMarkdown(`\`![img](/uploads/${s}/pic.png)\``, {
      projectPath: 'g/r',
    })
    expect(out).toContain('<code>')
    expect(out).not.toContain('<img')
  })
})

describe('classifyUpload', () => {
  it('classifies uploads by extension, case-insensitively', () => {
    expect(classifyUpload('/uploads/x/a.PNG')).toBe('image')
    expect(classifyUpload('/uploads/x/clip.mp4')).toBe('video')
    expect(classifyUpload('/uploads/x/sound.mp3')).toBe('audio')
    expect(classifyUpload('/uploads/x/report.pdf')).toBe('file')
  })

  it('ignores query/hash and treats extensionless paths as files', () => {
    expect(classifyUpload('/uploads/x/a.png?ref=main')).toBe('image')
    expect(classifyUpload('/uploads/x/a.png#top')).toBe('image')
    expect(classifyUpload('/uploads/x/noext')).toBe('file')
  })
})
