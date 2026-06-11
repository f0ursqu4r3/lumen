import { Marked, type TokenizerAndRendererExtension } from 'marked'
import DOMPurify from 'dompurify'
import { needsAssetResolution } from './media'

export interface RenderOptions {
  /**
   * Project path (`group/sub/repo`) used to resolve project-relative
   * `/uploads/...` image URLs. Optional: omit for content with no relative
   * attachments (e.g. notes rendered without project context).
   */
  projectPath?: string
}

// Slideshow-eligible media only — audio and file attachments are deliberately
// excluded, so `kind` is narrower than UploadKind.
export interface MediaItem {
  kind: 'image' | 'video'
  src: string // resolved upload path; swapped to a blob URL after render (matches data-media-src on the rendered element)
  href: string // original href
  alt: string
  title: string
}

export type UploadKind = 'image' | 'video' | 'audio' | 'file'

const EXT_KIND: Record<string, UploadKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  svg: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  ogv: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  oga: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
}

export function classifyUpload(href: string): UploadKind {
  const path = href.split(/[?#]/)[0]
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
  return EXT_KIND[ext] ?? 'file'
}

// GitLab upload secrets are 32 hex chars; matching the shape keeps the rewrite
// from touching unrelated URLs (and blocks path-traversal into the API :id).
const SECRET = '[0-9a-f]{32}'
const RELATIVE_UPLOAD = new RegExp(`^/uploads/${SECRET}/.+`, 'i')
const PROJECT_UPLOAD = new RegExp(`^/-/project/(\\d+)(/uploads/${SECRET}/.+)$`, 'i')

// GitLab serves attachment uploads behind auth, so a bare `/uploads/...` <img>
// 404s and a direct GitLab URL is cross-origin + unauthenticated. Uploads are
// fetched through the Bun RPC asset handler (`rpc.gitlabAsset`), which attaches
// the token and builds `${url}/api/v4/projects/.../uploads/...`. We rewrite to a
// `/v4/projects/...` path here; it is later swapped to a blob URL in the webview.
// The REST uploads endpoint accepts a URL-encoded project path — or numeric id —
// as `:id`.
function rewriteUploadSrc(href: string, projectPath?: string): string {
  const byId = PROJECT_UPLOAD.exec(href)
  if (byId) {
    const [, id, uploadPath] = byId
    return `/v4/projects/${id}${uploadPath}`
  }
  if (projectPath && RELATIVE_UPLOAD.test(href)) {
    return `/v4/projects/${encodeURIComponent(projectPath)}${href}`
  }
  return href
}

// Pull width/height out of GitLab's `{width=1308 height=559}` attribute list.
// Accepts plain numbers, px, or percentages; ignores other attrs (e.g. `.class`).
function parseDimensions(attrs: string): { width?: string; height?: string } {
  const out: { width?: string; height?: string } = {}
  const re = /(?:^|\s)(width|height)\s*=\s*"?([\d.]+%?(?:px)?)"?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs))) {
    out[m[1].toLowerCase() as 'width' | 'height'] = m[2]
  }
  return out
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function uploadFilename(href: string): string {
  const path = href.split(/[?#]/)[0]
  const last = path.slice(path.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

// Inline tokenizer for images that also consumes GitLab's trailing
// `{width=.. height=..}` attribute list — which standard Markdown leaves as
// literal text. Running at the inline-token level (not a regex over the raw
// source) means it correctly skips code spans and fenced blocks.
function gitlabImageExtension(projectPath?: string): TokenizerAndRendererExtension {
  const rule = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)(?:\{([^}]*)\})?/
  return {
    name: 'gitlabImage',
    level: 'inline',
    start(src: string) {
      const i = src.indexOf('![')
      return i < 0 ? undefined : i
    },
    tokenizer(src: string) {
      const m = rule.exec(src)
      if (!m) return undefined
      return {
        type: 'gitlabImage',
        raw: m[0],
        alt: m[1] ?? '',
        href: m[2],
        title: m[3] ?? m[4] ?? '',
        attrs: m[5] ?? '',
      }
    },
    renderer(token) {
      const kind = classifyUpload(token.href)
      const src = rewriteUploadSrc(token.href, projectPath)
      const { width, height } = parseDimensions(token.attrs)
      const dim =
        (width ? ` width="${escapeAttr(width)}"` : '') +
        (height ? ` height="${escapeAttr(height)}"` : '')
      const titleAttr = token.title ? ` title="${escapeAttr(token.title)}"` : ''

      // A rewritten upload path 404s under the views:// origin until
      // applyResolvedMedia() swaps in a blob URL. For those, withhold the src so the
      // browser never attempts that doomed load — no broken-image icon flashes — and
      // tag the element data-media-loading for the CSS placeholder, carrying the path
      // in data-media-src for the resolver. Scheme-qualified URLs (http(s):, data:,
      // blob:) load directly: keep their src and skip the resolver entirely.
      const deferred = needsAssetResolution(src)
      const srcAttr = deferred ? '' : ` src="${escapeAttr(src)}"`
      const loadingAttr = deferred ? ' data-media-loading' : ''
      const mediaSrcAttr = deferred ? ` data-media-src="${escapeAttr(src)}"` : ''

      if (kind === 'video') {
        return (
          `<span class="media-frame">` +
          `<video controls preload="metadata"${srcAttr}` +
          `${mediaSrcAttr} data-media-kind="video"${loadingAttr}${dim}${titleAttr}></video>` +
          `<button type="button" class="media-expand" data-media-trigger` +
          `${mediaSrcAttr} aria-label="Open in viewer">⤢</button>` +
          `</span>`
        )
      }
      if (kind === 'audio') {
        return `<audio controls${srcAttr}${mediaSrcAttr}${titleAttr}></audio>`
      }
      if (kind === 'file') {
        return `<a class="file-card" href="${escapeAttr(src)}"${mediaSrcAttr} download>${escapeAttr(uploadFilename(token.href))}</a>`
      }
      let html = `<img${srcAttr} alt="${escapeAttr(token.alt)}"`
      html += `${mediaSrcAttr} data-media-kind="image" data-media-trigger${loadingAttr}`
      if (token.title) html += ` title="${escapeAttr(token.title)}"`
      if (width) html += ` width="${escapeAttr(width)}"`
      if (height) html += ` height="${escapeAttr(height)}"`
      return html + '>'
    },
  }
}

// GitLab's upload API returns a PLAIN markdown link `[name](/uploads/<secret>/x)`
// for NON-IMAGE files (only images get the `![...]` embed form). The default link
// renderer would leave that as a bare `<a href="/uploads/...">` — which 404s under
// the views:// origin and never gets the authenticated blob URL. Override `link` to
// emit the same downloadable file-card the image extension produces for files, so
// applyResolvedMedia() resolves it and MarkdownText's download anchor handling
// triggers a download instead of an in-place navigation. Non-upload links return
// `false`, which marked falls back to its default link rendering.
function gitlabUploadLinkRenderer(projectPath?: string) {
  return {
    link(token: { href: string; text: string }): string | false {
      const href = token.href
      const isUpload = PROJECT_UPLOAD.test(href) || RELATIVE_UPLOAD.test(href)
      if (!isUpload) return false
      const src = rewriteUploadSrc(href, projectPath)
      const deferred = needsAssetResolution(src)
      const mediaSrcAttr = deferred ? ` data-media-src="${escapeAttr(src)}"` : ''
      const label = token.text || uploadFilename(href)
      return `<a class="file-card" href="${escapeAttr(src)}"${mediaSrcAttr} download>${escapeAttr(label)}</a>`
    },
  }
}

// GitLab descriptions/notes are Markdown that may contain attacker-authored raw
// HTML. marked does not sanitize, so an unsanitized `<img onerror=...>` could run
// arbitrary script in the webview. The token now lives in the Bun process (not the
// webview), and upload URLs are resolved to blob URLs via RPC — but raw HTML is
// still dangerous, so every rendered fragment goes through DOMPurify.
export function renderMarkdown(src: string | null | undefined, opts: RenderOptions = {}): string {
  if (!src) return ''
  const marked = new Marked()
  marked.use({
    extensions: [gitlabImageExtension(opts.projectPath)],
    renderer: gitlabUploadLinkRenderer(opts.projectPath),
  })
  const html = marked.parse(src, { async: false }) as string
  // video/audio are in DOMPurify's current default allow-list; ADD_TAGS pins them
  // so a future DOMPurify tightening can't silently break rendering. ADD_ATTR is
  // load-bearing — controls/preload/download are NOT default-allowed and would be
  // stripped otherwise. data-* is allowed by default (ALLOW_DATA_ATTR), carrying
  // data-media-src/-kind/-trigger.
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['video', 'audio'],
    ADD_ATTR: ['controls', 'preload', 'download'],
  })
}

// Server-rendered HTML (e.g. GitLab's `descriptionHtml`) arrives pre-rendered, so
// it skips the Markdown pipeline — but it is still attacker-authored and must not
// reach `v-html` unsanitized. Run it through the same DOMPurify config as rendered
// Markdown so both paths share one allow-list (no second sanitization approach).
export function sanitizeHtml(src: string | null | undefined): string {
  if (!src) return ''
  return DOMPurify.sanitize(src, {
    ADD_TAGS: ['video', 'audio'],
    ADD_ATTR: ['controls', 'preload', 'download'],
  })
}

// Collect slideshow-eligible media (images + videos) in document order, reusing
// the same tokenizer as rendering so code spans/fences are skipped identically.
export function extractMedia(
  src: string | null | undefined,
  opts: RenderOptions = {},
): MediaItem[] {
  if (!src) return []
  const marked = new Marked()
  marked.use({ extensions: [gitlabImageExtension(opts.projectPath)] })
  const items: MediaItem[] = []
  marked.walkTokens(marked.lexer(src), (token) => {
    if (token.type !== 'gitlabImage') return
    const t = token as unknown as { href: string; alt?: string; title?: string }
    const kind = classifyUpload(t.href)
    if (kind !== 'image' && kind !== 'video') return
    items.push({
      kind,
      src: rewriteUploadSrc(t.href, opts.projectPath),
      href: t.href,
      alt: t.alt ?? '',
      title: t.title ?? '',
    })
  })
  return items
}
