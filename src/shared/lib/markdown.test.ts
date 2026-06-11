import { describe, it, expect } from 'vitest'
import { renderMarkdown, classifyUpload, extractMedia, sanitizeHtml } from './markdown'

describe('sanitizeHtml', () => {
  it('strips script/event-handler XSS vectors from server HTML', () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).not.toContain('onerror')
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
    expect(sanitizeHtml('<script>alert(1)</script>')).not.toContain('<script')
  })
  it('keeps the same media allow-list as rendered markdown', () => {
    const out = sanitizeHtml('<video controls preload="none"><p>safe</p>')
    expect(out).toContain('<video')
    expect(out).toContain('controls')
    expect(out).toContain('safe')
  })
  it('returns an empty string for empty/null input', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })
})

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
    expect(out).toContain(`data-media-src="/v4/projects/group%2Fsub%2Frepo/uploads/${s}/pic.png"`)
  })

  it('routes /-/project/<id>/uploads images through the proxy by numeric id', () => {
    const s = secret('b')
    const out = renderMarkdown(`![img](/-/project/42/uploads/${s}/pic.png)`)
    expect(out).toContain(`data-media-src="/v4/projects/42/uploads/${s}/pic.png"`)
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
    expect(out).toContain(`data-media-src="/uploads/${s}/pic.png"`)
  })

  it('does not rewrite upload-looking text inside code spans', () => {
    const s = secret('e')
    const out = renderMarkdown(`\`![img](/uploads/${s}/pic.png)\``, {
      projectPath: 'g/r',
    })
    expect(out).toContain('<code>')
    expect(out).not.toContain('<img')
  })

  it('renders video uploads as a <video> with a viewer trigger', () => {
    const s = secret('f')
    const out = renderMarkdown(`![clip](/uploads/${s}/scroll.mp4)`, { projectPath: 'g/r' })
    expect(out).toContain('<video')
    expect(out).toContain('controls')
    expect(out).toContain(`data-media-src="/v4/projects/g%2Fr/uploads/${s}/scroll.mp4"`)
    expect(out).not.toContain('<img')
    // The viewer trigger lives on the expand button, not the <video> body, so
    // clicking the video plays it instead of opening the viewer.
    const videoClose = out.indexOf('</video>')
    const triggerPos = out.indexOf('data-media-trigger')
    expect(out.slice(0, videoClose)).not.toContain('data-media-trigger')
    expect(triggerPos).toBeGreaterThan(videoClose)
  })

  it('renders audio uploads as <audio> with no viewer trigger', () => {
    const s = secret('g')
    const out = renderMarkdown(`![sound](/uploads/${s}/clip.mp3)`, { projectPath: 'g/r' })
    expect(out).toContain('<audio')
    expect(out).toContain('controls')
    expect(out).not.toContain('data-media-trigger')
  })

  it('renders non-media uploads as a download chip', () => {
    const s = secret('h')
    const out = renderMarkdown(`![spec](/uploads/${s}/report.pdf)`, { projectPath: 'g/r' })
    expect(out).toContain('class="file-card"')
    expect(out).toContain('download')
    expect(out).toContain('report.pdf')
    expect(out).not.toContain('<img')
  })

  it('keeps image uploads as <img> with a viewer trigger', () => {
    const s = secret('i')
    const out = renderMarkdown(`![pic](/uploads/${s}/pic.png)`, { projectPath: 'g/r' })
    expect(out).toContain('<img')
    expect(out).toContain('data-media-kind="image"')
    expect(out).toContain('data-media-trigger')
  })

  it('defers upload src so no broken-image load is attempted before resolution', () => {
    const s = secret('j')
    const out = renderMarkdown(`![pic](/uploads/${s}/pic.png)`, { projectPath: 'g/r' })
    // The unresolvable proxy path lives only in data-media-src, never in src.
    expect(out).toContain('data-media-loading')
    expect(out).not.toContain('src="/v4/')
  })

  it('keeps the src on directly-loadable external images (no deferral)', () => {
    const out = renderMarkdown('![x](https://example.com/a.png)')
    expect(out).toContain('src="https://example.com/a.png"')
    expect(out).not.toContain('data-media-loading')
  })

  it('does not tag external images for RPC resolution', () => {
    // data-media-src drives applyResolvedMedia; omitting it for scheme-qualified
    // URLs keeps them off the asset RPC, which only understands upload paths.
    const out = renderMarkdown('![x](https://example.com/a.png)')
    expect(out).not.toContain('data-media-src')
  })
})

// Regression: non-image file attachments must render as a downloadable file-card
// anchor so users can retrieve their uploads. GitLab's upload API returns a PLAIN
// markdown link `[filename](/uploads/<32-hex-secret>/filename)` (no leading `!`)
// for non-image files — only IMAGES get the `![...]` embed form. Both must reach
// the same file-card: the gitlabImageExtension handles `![...]`, and a link
// renderer override turns plain upload links into the same downloadable anchor.
describe('non-image upload rendering', () => {
  const SECRET = '0123456789abcdef0123456789abcdef' // 32 hex chars — matches SECRET regex

  it('renders a PLAIN-link non-image upload (GitLab non-image form) as a downloadable file-card', () => {
    const html = renderMarkdown(`[report.pdf](/uploads/${SECRET}/report.pdf)`, {
      projectPath: 'group/app',
    })
    expect(html).toContain('class="file-card"')
    expect(html).toContain('download')
    expect(html).toContain('data-media-src=')
    expect(html).toContain('report.pdf')
  })

  it('still renders a ![..] non-image token as a downloadable file-card', () => {
    const html = renderMarkdown(`![report.pdf](/uploads/${SECRET}/report.pdf)`, {
      projectPath: 'group/app',
    })
    expect(html).toContain('class="file-card"')
    expect(html).toContain('download')
  })

  it('renders an image upload inline (not a file-card)', () => {
    const html = renderMarkdown(`![shot](/uploads/${SECRET}/shot.png)`, {
      projectPath: 'group/app',
    })
    expect(html).toContain('data-media-kind="image"')
    expect(html).not.toContain('file-card')
  })

  it('leaves a normal external link untouched (no file-card)', () => {
    const html = renderMarkdown('[docs](https://example.com/page)', {
      projectPath: 'group/app',
    })
    expect(html).toContain('href="https://example.com/page"')
    expect(html).not.toContain('file-card')
  })

  it('uses the link text as the file-card label, falling back to filename', () => {
    const html = renderMarkdown(`[Quarterly Report](/uploads/${SECRET}/q3.pdf)`, {
      projectPath: 'group/app',
    })
    expect(html).toContain('Quarterly Report')
  })

  it('renders a /-/project/<id>/uploads/ plain link as a file-card', () => {
    const html = renderMarkdown(`[report.pdf](/-/project/42/uploads/${SECRET}/report.pdf)`)
    expect(html).toContain('class="file-card"')
    expect(html).toContain('download')
    expect(html).toContain('/v4/projects/42/uploads/')
  })

  it('defers resolution for a plain upload link even without a projectPath', () => {
    const html = renderMarkdown(`[file.pdf](/uploads/${SECRET}/file.pdf)`)
    expect(html).toContain('class="file-card"')
    expect(html).toContain(`data-media-src="/uploads/${SECRET}/file.pdf"`)
  })

  it('keeps the download attribute through DOMPurify sanitization', () => {
    const html = renderMarkdown(`[report.pdf](/uploads/${SECRET}/report.pdf)`, {
      projectPath: 'group/app',
    })
    // download is load-bearing for the click-to-save path; assert it survives sanitize.
    expect(html).toContain('download')
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

describe('extractMedia', () => {
  const sec = (c: string) => c.repeat(32)

  it('collects images and videos in document order, excluding audio/files', () => {
    const s = sec('a')
    const md = [
      `![one](/uploads/${s}/a.png)`,
      `![two](/uploads/${s}/b.mp4)`,
      `![skip-audio](/uploads/${s}/c.mp3)`,
      `![skip-file](/uploads/${s}/d.pdf)`,
    ].join('\n\n')
    const items = extractMedia(md, { projectPath: 'g/r' })
    expect(items.map((i) => i.kind)).toEqual(['image', 'video'])
    expect(items[0].src).toBe(`/v4/projects/g%2Fr/uploads/${s}/a.png`)
    expect(items[1].alt).toBe('two')
    expect(items[0].href).toBe(`/uploads/${s}/a.png`)
  })

  it('skips media inside code fences', () => {
    const s = sec('b')
    const md = '```\n' + `![x](/uploads/${s}/a.png)` + '\n```'
    expect(extractMedia(md, { projectPath: 'g/r' })).toEqual([])
  })

  it('skips media inside inline code spans', () => {
    const s = sec('c')
    expect(extractMedia(`\`![x](/uploads/${s}/a.png)\``, { projectPath: 'g/r' })).toEqual([])
  })

  it('returns an empty array for empty/null input', () => {
    expect(extractMedia('')).toEqual([])
    expect(extractMedia(null)).toEqual([])
    expect(extractMedia(undefined)).toEqual([])
  })
})
