# Issue Media — All Media Types + Popout Viewer

**Date:** 2026-06-03
**Status:** Draft

## Summary

GitLab embeds every uploaded attachment with the `![label](…/file.ext)` Markdown
syntax regardless of type, but our renderer always emits `<img>`. A `.mp4` upload
therefore shows as a broken image (see the "scroll_wheel.mp4" comment). Two
changes:

1. **Render all media types** — classify each embedded upload by extension and
   render `<video>`, `<audio>`, an `<img>`, or a download chip accordingly.
2. **Popout media viewer** — a fullscreen lightbox that pages through every
   image/video in the issue (description + all comments), opened by clicking an
   image or via a "View all media (N)" button, with source attribution.

## Decisions

- **Inline media types:** video and audio render as native `<video controls>` /
  `<audio controls>`; non-media uploads (pdf, zip, etc.) render as a download
  chip rather than a broken image.
- **Viewer behavior:** manual gallery — `←`/`→` keys + arrow buttons, thumbnail
  strip, `n / N` counter, `Esc` to close. No auto-advance.
- **Collection:** images + videos across the description and all comments, in
  document order (description first, then comments top-to-bottom).
- **Audio + file chips are inline-only** — not part of the slideshow (audio has
  nothing to show; files just download).
- **Open triggers:**
  - **Images** open the viewer on body click.
  - **Videos** keep inline `controls` (body click = play); a hover "expand"
    overlay button opens them in the viewer, so play isn't hijacked.
  - **Gallery button** "View all media (N)" opens at index 0; shown only when
    `N > 0`.
- **Source attribution in the viewer:** each item shows a source icon +
  optional caption. `Caption` (lucide) for description media, `MessageCircle`
  for comment media. Comment items caption with the comment's text (embeds
  stripped, whitespace collapsed); description items caption with alt/title.
  Icon shows alone when there's no caption text.

## Architecture

### 1. `src/lib/markdown.ts`

**Classifier.** A pure `classifyUpload(href): 'image' | 'video' | 'audio' |
'file'` keyed off the file extension (lowercased, query/hash stripped):

| Kind  | Extensions                                   |
|-------|----------------------------------------------|
| image | png jpg jpeg gif webp avif svg               |
| video | mp4 webm mov m4v ogv                         |
| audio | mp3 wav ogg oga m4a aac flac                 |
| file  | anything else                                |

**Renderer.** The existing `gitlabImage` extension's `renderer` switches on the
kind (URL still rewritten through `rewriteUploadSrc`, dimensions still parsed):

- `image` → `<img>` as today, plus `data-media-src`, `data-media-kind="image"`,
  `data-media-trigger`, and a `markdown-media` class.
- `video` → `<video controls preload="metadata" data-media-src … data-media-kind="video"
  data-media-trigger>` (width/height applied when present).
- `audio` → `<audio controls>` (no trigger attrs — not a slideshow item).
- `file` → `<a href="…" download class="file-card">{filename}</a>`; filename is
  the last path segment, decoded. (Icon is added via CSS/markup in MarkdownText
  styling; the anchor itself is the sanitized output.)

`data-media-src` carries the **rewritten** proxy URL so the viewer and the
inline element load the identical resource, and the click handler matches on it.

**Extraction.** New export:

```ts
export interface MediaItem {
  kind: 'image' | 'video'
  src: string        // rewritten proxy URL (matches data-media-src)
  href: string       // original href
  alt: string
  title: string
}
export function extractMedia(src: string | null | undefined, opts?: RenderOptions): MediaItem[]
```

`extractMedia` runs the **same** `Marked` instance + `gitlabImage` tokenizer over
the source and collects image/video tokens in document order (walking the token
tree so code spans/fences are skipped, consistent with rendering). It does not
render HTML. Rendering and extraction share `classifyUpload` + `rewriteUploadSrc`
so they never drift.

**Sanitizer.** `renderMarkdown` passes an explicit DOMPurify config adding the
media tags and attributes it relies on, so a future DOMPurify default change
can't silently strip them:

- `ADD_TAGS`: `video`, `audio`, `source`
- `ADD_ATTR`: `controls`, `preload`, `download`
- `data-*` and the standard media attrs are already allowed by default; covered
  by a regression test regardless.

### 2. Collection (IssueDetail)

A decorated `ViewerItem` extends `MediaItem` with source metadata:

```ts
interface ViewerItem extends MediaItem {
  source: 'description' | 'comment'
  caption?: string
}
```

`extractMedia` stays pure; IssueDetail decorates:

```ts
const media = computed<ViewerItem[]>(() => [
  ...extractMedia(draft.description, { projectPath: fullPath })
    .map(m => ({ ...m, source: 'description' as const, caption: m.title || m.alt || undefined })),
  ...notes.flatMap(n =>
    extractMedia(n.body, { projectPath: fullPath })
      .map(m => ({ ...m, source: 'comment' as const, caption: commentCaption(n.body) }))),
])
```

`commentCaption(body)` strips embed tokens (`![…](…)`) from the body and
collapses whitespace; empty → `undefined`.

### 3. `src/components/MediaViewer.vue` (new)

- reka-ui `DialogRoot` (v-model `open`) rendering a fullscreen overlay via
  `DialogPortal` + `DialogOverlay` + `DialogContent`.
- Props: `items: ViewerItem[]`, `open` (v-model), `startIndex: number`.
- Internal `index`, clamped to `[0, items.length-1]`; reset to `startIndex` when
  opened.
- Stage renders `<img>` or `<video controls autoplay>` for the current item.
- Prev/next arrow buttons + `←`/`→` keydown (via `@vueuse/core` `onKeyStroke` or
  a scoped listener); arrows hidden/disabled when `items.length <= 1`.
- `n / N` counter; thumbnail strip (images show the image, videos show a video
  icon placeholder); clicking a thumb jumps to it; active thumb highlighted.
- Caption row: source icon (`Caption` / `MessageCircle` from `@lucide/vue`) +
  `caption` text; icon alone when no caption.
- `Esc` closes (Dialog default). Title for a11y via visually-hidden
  `DialogTitle`.

### 4. Wiring (IssueDetail)

- Import and mount `<MediaViewer v-model:open="viewerOpen" :items="media"
  :start-index="viewerIndex" />`.
- **Gallery button:** rendered when `media.length > 0` near the description
  header — `View all media ({{ media.length }})`; click sets `viewerIndex = 0`,
  `viewerOpen = true`.
- **Click-to-open:** a single delegated `@click` listener on the element
  wrapping the description + discussion. On a click whose target (or closest)
  matches `[data-media-trigger]`, read `data-media-src`, find its index in
  `media`, set `viewerIndex`/`viewerOpen`. For videos the trigger is the hover
  "expand" button (a child carrying `data-media-trigger` + the parent's
  `data-media-src`), not the `<video>` body. The expand affordance is added by
  MarkdownText styling/markup around trigger elements, or via the delegated
  handler recognizing an explicit expand button — see Open Questions resolved
  below.

## Data flow

```
draft.description ─┐
                   ├─ extractMedia ─→ ViewerItem[] (decorated) ─→ media (computed)
notes[].body ──────┘                                              │
                                                                  ├─→ "View all media (N)" button
inline render (v-html) ── data-media-src ──┐                     │
                                            └─ delegated click ──→ viewerIndex/open ─→ <MediaViewer>
```

## Edge cases

- **No media:** no gallery button, viewer never opens.
- **Single item:** arrows + thumbnail strip hidden; counter shows `1 / 1`.
- **Video play vs. open:** body click on a video plays it; only the expand
  overlay opens the viewer.
- **Duplicate src across blocks:** index lookup uses `findIndex` on `src`; the
  first match wins — acceptable (same media, same content).
- **Unknown/extensionless upload:** classified `file` → download chip, never a
  broken image.
- **SVG:** treated as image (already sanitized via the proxied `<img>`; not
  inlined as markup).

## Video expand affordance

The renderer emits each video inside a positioned wrapper alongside an explicit
expand button:

```html
<span class="media-frame">
  <video controls preload="metadata" data-media-kind="video" …>…</video>
  <button type="button" class="media-expand" data-media-trigger
          data-media-src="…" aria-label="Open in viewer">⤢</button>
</span>
```

DOMPurify keeps `button`/`span` (defaults) plus `type`/`class`/`aria-label`/
`data-*`. CSS reveals `.media-expand` on `.media-frame:hover`/focus-within. The
delegated click handler matches `[data-media-trigger]`, so images (the `<img>`
itself carries the trigger) and videos (the expand button carries it) flow
through one code path. The `<video>` body has no trigger, so clicking it plays
inline.

## Testing

**`src/lib/markdown.test.ts`** (extend):
- `classifyUpload` per extension table (incl. case-insensitivity, query strings).
- Video upload → `<video controls>` with `data-media-trigger`/`data-media-src`.
- Audio upload → `<audio controls>`, no trigger attrs.
- Non-media upload → `file-card` anchor with `download` + decoded filename.
- Image still renders with dimensions + trigger attrs.
- `extractMedia` returns image+video items in document order; excludes
  audio/files; skips media inside code fences.
- DOMPurify regression: `<video>`/`<audio>`/`controls`/`data-media-src` survive
  sanitization.

**`src/components/MediaViewer.test.ts`** (new):
- Renders current item; counter `n / N`.
- `←`/`→` and arrow buttons navigate; clamped at bounds.
- Thumbnail click jumps; active thumb marked.
- Single item: arrows/thumbs hidden.
- Source icon + caption: `Caption` for description, `MessageCircle` for comment;
  icon-only when caption empty.
- Opening sets index to `startIndex`.

## Out of scope

- Auto-advancing slideshow / timer.
- Pan/zoom within the viewer.
- Audio in the slideshow.
- Uploading new media (compose/edit attachment flow unchanged).
