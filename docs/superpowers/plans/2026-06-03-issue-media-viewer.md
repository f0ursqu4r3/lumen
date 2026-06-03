# Issue Media — All Media Types + Popout Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every GitLab upload type inline (image/video/audio/file) and add a fullscreen popout viewer that pages through all images/videos in an issue.

**Architecture:** A shared extension-based classifier in `src/lib/markdown.ts` decides how each `![…](…)` upload renders and is reused by a pure `extractMedia()`. A `useIssueMedia` composable assembles description + comment media into a source-tagged collection. `MediaViewer.vue` (reka-ui Dialog) is the lightbox; `IssueDetail.vue` wires it via a "View all media" button and a delegated click on inline triggers.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, marked v18, DOMPurify, reka-ui Dialog, @vueuse/core, @lucide/vue, Vitest + @vue/test-utils.

**Test runner:** single file via `bunx vitest run <path>`. Typecheck via `bun run typecheck`.

---

## File Structure

- **Modify** `src/lib/markdown.ts` — add `classifyUpload`, `MediaItem`, `extractMedia`; switch the image renderer on kind; explicit DOMPurify allowlist.
- **Modify** `src/lib/markdown.test.ts` — classification, video/audio/file rendering, `extractMedia`, sanitizer regression.
- **Modify** `src/components/MarkdownText.vue` — styles for `<video>`/`<audio>`/`.file-card`/`.media-frame`/`.media-expand` and the zoom cursor.
- **Create** `src/composables/useIssueMedia.ts` — `ViewerItem`, `commentCaption`, `buildIssueMedia`.
- **Create** `src/composables/useIssueMedia.test.ts`.
- **Create** `src/components/MediaViewer.vue` — fullscreen lightbox.
- **Create** `src/components/MediaViewer.test.ts`.
- **Modify** `src/views/IssueDetail.vue` — `media` computed, viewer state, delegated click, gallery button, mount `<MediaViewer>`.

---

## Task 1: Upload classifier + MediaItem type

**Files:**
- Modify: `src/lib/markdown.ts`
- Test: `src/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/markdown.test.ts`. First change the import on line 2 from `import { renderMarkdown } from './markdown'` to:

```ts
import { renderMarkdown, classifyUpload, extractMedia } from './markdown'
```

Then append:

```ts
describe('classifyUpload', () => {
  it('classifies uploads by extension, case-insensitively', () => {
    expect(classifyUpload('/uploads/x/a.PNG')).toBe('image')
    expect(classifyUpload('/uploads/x/clip.mp4')).toBe('video')
    expect(classifyUpload('/uploads/x/sound.mp3')).toBe('audio')
    expect(classifyUpload('/uploads/x/report.pdf')).toBe('file')
  })

  it('ignores query/hash and treats extensionless paths as files', () => {
    expect(classifyUpload('/uploads/x/a.png?ref=main')).toBe('image')
    expect(classifyUpload('/uploads/x/noext')).toBe('file')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/markdown.test.ts`
Expected: FAIL — `classifyUpload is not a function` / import error.

- [ ] **Step 3: Add the classifier and types**

In `src/lib/markdown.ts`, after the `RenderOptions` interface (line 11), add:

```ts
export interface MediaItem {
  kind: 'image' | 'video'
  src: string // rewritten proxy URL (matches data-media-src on the rendered element)
  href: string // original href
  alt: string
  title: string
}

export type UploadKind = 'image' | 'video' | 'audio' | 'file'

const EXT_KIND: Record<string, UploadKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
}

export function classifyUpload(href: string): UploadKind {
  const path = href.split(/[?#]/)[0]
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
  return EXT_KIND[ext] ?? 'file'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/lib/markdown.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "feat: classify GitLab uploads by media type"
```

---

## Task 2: Render video / audio / file inline

**Files:**
- Modify: `src/lib/markdown.ts:60-103` (the `gitlabImageExtension` renderer + `renderMarkdown` sanitize)
- Test: `src/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/markdown.test.ts` (the `const secret = (c: string) => c.repeat(32)` helper already exists in the `renderMarkdown` describe block — these tests use their own local secrets so add them inside the existing `describe('renderMarkdown', …)` block, before its closing `})` on line 68):

```ts
  it('renders video uploads as a <video> with a viewer trigger', () => {
    const s = secret('f')
    const out = renderMarkdown(`![clip](/uploads/${s}/scroll.mp4)`, { projectPath: 'g/r' })
    expect(out).toContain('<video')
    expect(out).toContain('controls')
    expect(out).toContain(`data-media-src="/gitlab/v4/projects/g%2Fr/uploads/${s}/scroll.mp4"`)
    expect(out).toContain('data-media-trigger')
    expect(out).not.toContain('<img')
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/markdown.test.ts`
Expected: FAIL — the mp4/mp3/pdf cases still emit `<img>`.

- [ ] **Step 3: Add a filename helper**

In `src/lib/markdown.ts`, after `classifyUpload` (from Task 1), add:

```ts
function uploadFilename(href: string): string {
  const path = href.split(/[?#]/)[0]
  const last = path.slice(path.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}
```

- [ ] **Step 4: Switch the renderer on kind**

Replace the entire `renderer(token) { … }` body in `gitlabImageExtension` (lines 81-89) with:

```ts
    renderer(token) {
      const kind = classifyUpload(token.href)
      const src = rewriteUploadSrc(token.href, projectPath)
      const { width, height } = parseDimensions(token.attrs)
      const dim =
        (width ? ` width="${escapeAttr(width)}"` : '') +
        (height ? ` height="${escapeAttr(height)}"` : '')
      const titleAttr = token.title ? ` title="${escapeAttr(token.title)}"` : ''

      if (kind === 'video') {
        return (
          `<span class="media-frame">` +
          `<video controls preload="metadata" src="${escapeAttr(src)}"` +
          ` data-media-src="${escapeAttr(src)}" data-media-kind="video"${dim}${titleAttr}></video>` +
          `<button type="button" class="media-expand" data-media-trigger` +
          ` data-media-src="${escapeAttr(src)}" aria-label="Open in viewer">⤢</button>` +
          `</span>`
        )
      }
      if (kind === 'audio') {
        return `<audio controls src="${escapeAttr(src)}"${titleAttr}></audio>`
      }
      if (kind === 'file') {
        return `<a class="file-card" href="${escapeAttr(src)}" download>${escapeAttr(uploadFilename(token.href))}</a>`
      }
      let html = `<img src="${escapeAttr(src)}" alt="${escapeAttr(token.alt)}"`
      html += ` data-media-src="${escapeAttr(src)}" data-media-kind="image" data-media-trigger`
      if (token.title) html += ` title="${escapeAttr(token.title)}"`
      if (width) html += ` width="${escapeAttr(width)}"`
      if (height) html += ` height="${escapeAttr(height)}"`
      return html + '>'
    },
```

- [ ] **Step 5: Add the explicit DOMPurify allowlist**

In `renderMarkdown`, replace the final `return DOMPurify.sanitize(html)` (line 102) with:

```ts
  // Explicitly allow the media tags/attrs the renderer relies on so a future
  // DOMPurify default change can't silently drop them. data-* is allowed by
  // default (ALLOW_DATA_ATTR), which carries data-media-src/-kind/-trigger.
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['video', 'audio'],
    ADD_ATTR: ['controls', 'preload', 'download'],
  })
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/markdown.test.ts`
Expected: PASS — all new and pre-existing tests green (the existing `{width= height=}` and proxy-rewrite tests still hold for images).

- [ ] **Step 7: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "feat: render video, audio, and file uploads inline"
```

---

## Task 3: extractMedia collection

**Files:**
- Modify: `src/lib/markdown.ts`
- Test: `src/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/markdown.test.ts` as a new top-level describe block (uses its own secret helper):

```ts
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
    expect(items[0].src).toBe(`/gitlab/v4/projects/g%2Fr/uploads/${s}/a.png`)
    expect(items[1].alt).toBe('two')
  })

  it('skips media inside code fences', () => {
    const s = sec('b')
    const md = '```\n' + `![x](/uploads/${s}/a.png)` + '\n```'
    expect(extractMedia(md, { projectPath: 'g/r' })).toEqual([])
  })

  it('returns an empty array for empty/null input', () => {
    expect(extractMedia('')).toEqual([])
    expect(extractMedia(null)).toEqual([])
    expect(extractMedia(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/markdown.test.ts`
Expected: FAIL — `extractMedia` is exported but undefined / returns nothing.

- [ ] **Step 3: Implement extractMedia**

In `src/lib/markdown.ts`, after `renderMarkdown` (end of file), add:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no errors from `src/lib/markdown.ts` (pre-existing generated-graphql errors per project setup are unrelated — see CLAUDE.md memory; ensure no *new* errors in markdown.ts).

- [ ] **Step 6: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "feat: add extractMedia to collect issue images and videos"
```

---

## Task 4: MarkdownText media styles

**Files:**
- Modify: `src/components/MarkdownText.vue:86-88` (style block)

No behavioral test — pure CSS. Verified visually later.

- [ ] **Step 1: Replace the `:deep(img)` rule with media styles**

In `src/components/MarkdownText.vue`, replace lines 86-88:

```css
.markdown :deep(img) {
  max-width: 100%;
}
```

with:

```css
.markdown :deep(img),
.markdown :deep(video),
.markdown :deep(audio) {
  max-width: 100%;
}
.markdown :deep(img[data-media-trigger]) {
  cursor: zoom-in;
}
.markdown :deep(.media-frame) {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.markdown :deep(.media-expand) {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  background: rgb(0 0 0 / 0.6);
  color: #fff;
  font-size: 0.9rem;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease;
  cursor: pointer;
}
.markdown :deep(.media-frame:hover) .media-expand,
.markdown :deep(.media-frame:focus-within) .media-expand {
  opacity: 1;
}
.markdown :deep(.file-card) {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--muted);
  color: var(--foreground);
  text-decoration: none;
  font-size: 0.85em;
}
.markdown :deep(.file-card:hover) {
  border-color: var(--primary);
}
```

- [ ] **Step 2: Run the MarkdownText test to confirm nothing broke**

Run: `bunx vitest run src/components/MarkdownText.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/MarkdownText.vue
git commit -m "feat: style inline video, audio, file chips, and media expand"
```

---

## Task 5: useIssueMedia composable

**Files:**
- Create: `src/composables/useIssueMedia.ts`
- Create: `src/composables/useIssueMedia.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/composables/useIssueMedia.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildIssueMedia, commentCaption } from './useIssueMedia'

const s = (c: string) => c.repeat(32)

describe('commentCaption', () => {
  it('strips embeds and collapses whitespace', () => {
    expect(commentCaption(`See this ![x](/uploads/${s('a')}/a.png) here`)).toBe('See this here')
  })

  it('returns undefined when only an embed (or nothing) remains', () => {
    expect(commentCaption(`![x](/uploads/${s('a')}/a.png)`)).toBeUndefined()
    expect(commentCaption('')).toBeUndefined()
    expect(commentCaption(null)).toBeUndefined()
  })
})

describe('buildIssueMedia', () => {
  it('orders description media before comment media and tags the source', () => {
    const items = buildIssueMedia(
      `![d](/uploads/${s('a')}/d.png)`,
      [{ body: `look ![c](/uploads/${s('b')}/c.mp4)` }],
      'g/r',
    )
    expect(items.map((i) => i.source)).toEqual(['description', 'comment'])
    expect(items[1].kind).toBe('video')
    expect(items[1].caption).toBe('look')
  })

  it('captions description media from its title or alt', () => {
    const [item] = buildIssueMedia(`![the alt](/uploads/${s('a')}/d.png)`, [], 'g/r')
    expect(item.caption).toBe('the alt')
  })

  it('returns an empty array when there is no media', () => {
    expect(buildIssueMedia('plain text', [{ body: 'no media' }], 'g/r')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/composables/useIssueMedia.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composable module**

Create `src/composables/useIssueMedia.ts`:

```ts
import { extractMedia, type MediaItem } from '@/lib/markdown'

export interface ViewerItem extends MediaItem {
  source: 'description' | 'comment'
  caption?: string
}

/** Minimal shape we need from a GitLab note. */
export interface MediaNote {
  body?: string | null
}

// Embed tokens (optionally followed by GitLab's {width= height=} attr list).
const EMBED = /!\[[^\]]*\]\([^)]*\)(?:\{[^}]*\})?/g

/** A comment's prose, with media embeds removed, as a viewer caption. */
export function commentCaption(body: string | null | undefined): string | undefined {
  if (!body) return undefined
  const text = body.replace(EMBED, ' ').replace(/\s+/g, ' ').trim()
  return text || undefined
}

/** Description media first, then each comment's media, in document order. */
export function buildIssueMedia(
  description: string | null | undefined,
  notes: MediaNote[],
  projectPath?: string,
): ViewerItem[] {
  const fromDesc = extractMedia(description, { projectPath }).map(
    (m): ViewerItem => ({ ...m, source: 'description', caption: m.title || m.alt || undefined }),
  )
  const fromNotes = notes.flatMap((n) =>
    extractMedia(n.body, { projectPath }).map(
      (m): ViewerItem => ({ ...m, source: 'comment', caption: commentCaption(n.body) }),
    ),
  )
  return [...fromDesc, ...fromNotes]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/composables/useIssueMedia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueMedia.ts src/composables/useIssueMedia.test.ts
git commit -m "feat: assemble source-tagged issue media collection"
```

---

## Task 6: MediaViewer component

**Files:**
- Create: `src/components/MediaViewer.vue`
- Create: `src/components/MediaViewer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/MediaViewer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MediaViewer from './MediaViewer.vue'
import type { ViewerItem } from '@/composables/useIssueMedia'

const items: ViewerItem[] = [
  { kind: 'image', src: '/a.png', href: '/a.png', alt: 'A', title: '', source: 'description', caption: 'A' },
  { kind: 'video', src: '/b.mp4', href: '/b.mp4', alt: 'B', title: '', source: 'comment', caption: 'B' },
  { kind: 'image', src: '/c.png', href: '/c.png', alt: 'C', title: '', source: 'comment' },
]

function counterText() {
  return document.querySelector('[data-testid="media-counter"]')?.textContent ?? ''
}

function mountViewer(props: Record<string, unknown> = {}) {
  return mount(MediaViewer, {
    attachTo: document.body,
    props: { items, open: true, startIndex: 0, ...props },
  })
}

describe('MediaViewer', () => {
  it('shows the start item and a 1-based counter', async () => {
    const w = mountViewer({ startIndex: 1 })
    await nextTick()
    expect(counterText()).toContain('2 / 3')
    expect(document.querySelector('video[src="/b.mp4"]')).toBeTruthy()
    w.unmount()
  })

  it('navigates with the next/prev buttons and clamps at the bounds', async () => {
    const w = mountViewer({ startIndex: 0 })
    await nextTick()
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Previous"]')!.disabled).toBe(true)
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    await nextTick()
    expect(counterText()).toContain('2 / 3')
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    await nextTick()
    expect(counterText()).toContain('3 / 3')
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.disabled).toBe(true)
    w.unmount()
  })

  it('jumps to a thumbnail on click', async () => {
    const w = mountViewer()
    await nextTick()
    document.querySelector<HTMLButtonElement>('[aria-label="Media 3"]')!.click()
    await nextTick()
    expect(counterText()).toContain('3 / 3')
    w.unmount()
  })

  it('hides navigation and thumbnails for a single item', async () => {
    const w = mount(MediaViewer, {
      attachTo: document.body,
      props: { items: [items[0]], open: true, startIndex: 0 },
    })
    await nextTick()
    expect(document.querySelector('[aria-label="Next"]')).toBeNull()
    expect(document.querySelector('[aria-label="Media 1"]')).toBeNull()
    w.unmount()
  })

  it('marks the source of the current item', async () => {
    const w = mountViewer({ startIndex: 0 })
    await nextTick()
    expect(document.querySelector('[data-media-source="description"]')).toBeTruthy()
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    await nextTick()
    expect(document.querySelector('[data-media-source="comment"]')).toBeTruthy()
    w.unmount()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/components/MediaViewer.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/MediaViewer.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogTitle,
  VisuallyHidden,
} from 'reka-ui'
import { onKeyStroke } from '@vueuse/core'
import { Caption, MessageCircle, ChevronLeft, ChevronRight, X, Film } from '@lucide/vue'
import type { ViewerItem } from '@/composables/useIssueMedia'

const props = defineProps<{ items: ViewerItem[]; startIndex?: number }>()
const open = defineModel<boolean>('open', { default: false })

const index = ref(0)

function clamp(i: number) {
  const n = props.items.length
  if (n === 0) return 0
  return Math.min(Math.max(i, 0), n - 1)
}

// Re-anchor to startIndex each time the viewer opens.
watch(open, (isOpen) => {
  if (isOpen) index.value = clamp(props.startIndex ?? 0)
})

const current = computed<ViewerItem | undefined>(() => props.items[index.value])
const hasMany = computed(() => props.items.length > 1)

function go(delta: number) {
  index.value = clamp(index.value + delta)
}

onKeyStroke('ArrowLeft', () => {
  if (open.value) go(-1)
})
onKeyStroke('ArrowRight', () => {
  if (open.value) go(1)
})
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        data-testid="media-viewer"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 focus:outline-none"
      >
        <VisuallyHidden>
          <DialogTitle>Media viewer</DialogTitle>
        </VisuallyHidden>

        <DialogClose
          class="absolute right-4 top-4 rounded-md p-1.5 text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Close"
        >
          <X class="size-5" />
        </DialogClose>

        <!-- Stage -->
        <div class="flex min-h-0 w-full flex-1 items-center justify-center gap-4">
          <button
            v-if="hasMany"
            type="button"
            class="shrink-0 rounded-full p-2 text-white/70 transition-colors hover:text-white disabled:opacity-30"
            aria-label="Previous"
            :disabled="index === 0"
            @click="go(-1)"
          >
            <ChevronLeft class="size-7" />
          </button>

          <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            <img
              v-if="current?.kind === 'image'"
              :src="current.src"
              :alt="current.alt"
              class="max-h-full max-w-full object-contain"
            />
            <video
              v-else-if="current?.kind === 'video'"
              :key="current.src"
              :src="current.src"
              controls
              autoplay
              class="max-h-full max-w-full object-contain"
            />
          </div>

          <button
            v-if="hasMany"
            type="button"
            class="shrink-0 rounded-full p-2 text-white/70 transition-colors hover:text-white disabled:opacity-30"
            aria-label="Next"
            :disabled="index === items.length - 1"
            @click="go(1)"
          >
            <ChevronRight class="size-7" />
          </button>
        </div>

        <!-- Caption + source + counter -->
        <div
          v-if="current"
          :data-media-source="current.source"
          class="flex max-w-full items-center gap-2 text-sm text-white/80"
        >
          <component
            :is="current.source === 'description' ? Caption : MessageCircle"
            class="size-4 shrink-0"
          />
          <span v-if="current.caption" class="truncate">{{ current.caption }}</span>
          <span class="ml-2 shrink-0 font-mono text-xs text-white/50" data-testid="media-counter">
            {{ index + 1 }} / {{ items.length }}
          </span>
        </div>

        <!-- Thumbnails -->
        <div v-if="hasMany" class="flex max-w-full gap-2 overflow-x-auto px-2 pb-1">
          <button
            v-for="(item, i) in items"
            :key="i"
            type="button"
            class="relative size-14 shrink-0 overflow-hidden rounded border-2 transition"
            :class="i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'"
            :aria-label="`Media ${i + 1}`"
            :aria-current="i === index"
            @click="index = i"
          >
            <img
              v-if="item.kind === 'image'"
              :src="item.src"
              :alt="item.alt"
              class="size-full object-cover"
            />
            <span v-else class="grid size-full place-items-center bg-white/10 text-white/70">
              <Film class="size-5" />
            </span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/components/MediaViewer.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no new errors from `MediaViewer.vue` or `useIssueMedia.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/MediaViewer.vue src/components/MediaViewer.test.ts
git commit -m "feat: add popout MediaViewer lightbox"
```

---

## Task 7: Wire the viewer into IssueDetail

**Files:**
- Modify: `src/views/IssueDetail.vue` (imports ~16-24; script ~61-64; template lines 268, 270, 407)

This task is wiring; its behavior is covered by Tasks 1-6 unit tests. Verify via typecheck + the existing IssueDetail-related suite, then a manual smoke in Task 8.

- [ ] **Step 1: Add imports**

In `src/views/IssueDetail.vue`, change line 16 from:

```ts
import { ExternalLink } from '@lucide/vue'
```

to:

```ts
import { ExternalLink, Images } from '@lucide/vue'
```

And after line 24 (`import Scratchpad from '@/components/Scratchpad.vue'`), add:

```ts
import MediaViewer from '@/components/MediaViewer.vue'
import { buildIssueMedia } from '@/composables/useIssueMedia'
```

- [ ] **Step 2: Add media state, computed, and the delegated click handler**

In the `<script setup>`, immediately after the `notes` computed (ends line 64), add:

```ts
const media = computed(() => buildIssueMedia(draft.value?.description, notes.value, props.fullPath))
const viewerOpen = ref(false)
const viewerIndex = ref(0)

function openViewer(i: number) {
  viewerIndex.value = i
  viewerOpen.value = true
}

// Inline media is rendered via v-html, so intercept clicks by delegation: an
// image's <img> carries the trigger; a video's expand button carries it (the
// <video> body keeps native controls). Match data-media-src to the collection.
function onBodyMediaClick(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest('[data-media-trigger]')
  const src = el?.getAttribute('data-media-src')
  if (!src) return
  const i = media.value.findIndex((m) => m.src === src)
  if (i >= 0) {
    e.preventDefault()
    openViewer(i)
  }
}
```

(`ref` and `computed` are already imported on line 2.)

- [ ] **Step 3: Attach the delegated click and add the gallery button**

In the template, change the body wrapper on line 268 from:

```html
    <div class="issue__body mt-8">
```

to:

```html
    <div class="issue__body mt-8" @click="onBodyMediaClick">
```

Then, inside the description `<section>` (line 270), insert the gallery button as its first child — directly after the `<section …>` opening tag and before `<EditableField`:

```html
        <button
          v-if="media.length"
          type="button"
          data-testid="view-all-media"
          class="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          @click="openViewer(0)"
        >
          <Images class="size-3.5" />
          View all media ({{ media.length }})
        </button>
```

- [ ] **Step 4: Mount the viewer**

In the template, after the closing `</Transition>` of the save bar (line 407) and before `</article>` (line 408), add:

```html
    <MediaViewer v-model:open="viewerOpen" :items="media" :start-index="viewerIndex" />
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no new errors in `IssueDetail.vue` (pre-existing generated-graphql errors unrelated, per CLAUDE.md memory).

- [ ] **Step 6: Run the full test suite**

Run: `bunx vitest run`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
git add src/views/IssueDetail.vue
git commit -m "feat: wire popout media viewer into the issue detail view"
```

---

## Task 8: Manual verification

**Files:** none (smoke test).

- [ ] **Step 1: Build/typecheck gate**

Run: `bun run typecheck && bunx vitest run`
Expected: typecheck clean of new errors; all tests pass.

- [ ] **Step 2: Manual smoke (against the live instance)**

Open an issue whose comments include the `scroll_wheel.mp4` upload (the one in the bug screenshot). Confirm:
- The mp4 renders as an inline `<video>` with controls (no broken-image `?`).
- Hovering the video reveals the expand (⤢) button; clicking it opens the viewer on that video; the `<video>` body itself still plays on click.
- Clicking an inline image opens the viewer on that image.
- "View all media (N)" appears under the description when the issue has media; clicking opens the viewer at the first item.
- `←`/`→` and the arrow buttons page through all images/videos across description + comments; the counter and thumbnails track; `Esc` closes.
- The caption row shows the Caption icon for description media and the MessageCircle icon + comment text for comment media.
- A non-image/non-AV attachment (e.g. a `.pdf`) renders as a download chip.

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch to merge / open a PR.

---

## Notes for the implementer

- **marked instance reuse:** `extractMedia` and `renderMarkdown` each build their own `new Marked()` with the same `gitlabImage` extension. Do not share a module-level instance — the extension closes over `projectPath`, which varies per call.
- **DOMPurify data-* attrs:** `ALLOW_DATA_ATTR` defaults `true`, so `data-media-src/-kind/-trigger` survive without listing them. The Task 2 video test asserts this; don't remove it.
- **Why the video body is not a trigger:** making the whole `<video>` open the viewer would swallow play/scrub clicks. Only the expand button gets `data-media-trigger`.
- **Duplicate srcs:** `findIndex` on `src` returns the first match; identical uploads referenced twice open the first occurrence — acceptable.
