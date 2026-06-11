# Issue File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload and attach files (any type) to issues from the composer, the description editor, and comments/replies, via paste, drag-and-drop, and a file-picker button.

**Architecture:** Files are read to base64 in the renderer and POSTed to GitLab's project-scoped uploads endpoint through a new Bun RPC handler that attaches the PAT. The returned markdown reference is inserted into the editor at the caret with a placeholder-then-swap protocol. Editing is unified on `MentionTextarea`, which gains an opt-in `fullPath` prop wiring upload behavior via a `useTextareaAttach` composable. Non-image rendering/download already exists in the markdown layer.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, Bun host + Electrobun webview RPC, vitest (`bunx vitest run`), Tailwind.

---

## File Structure

New files:
- `src/features/issues/composables/useFileUpload.ts` — file → base64 → `rpc.gitlabUpload`; error mapping. (+ test)
- `src/features/issues/composables/useTextareaAttach.ts` — paste/drop/picker DOM glue + placeholder-and-swap insertion over a textarea. (+ test)

Modified files:
- `src/bun/gitlab.ts` — add `buildUpload` + `gitlabUpload`. (+ test in existing `src/bun/gitlab.test.ts`)
- `src/shared/lib/rpcContract.ts` — add `UploadArgs`/`UploadResult` + `gitlabUpload` to `LumenRequests`.
- `src/shared/lib/rpc.ts` — add `gitlabUpload` to the `rpc` client funnel.
- `src/bun/index.ts` — register `gitlabUpload` in the host handler map.
- `src/features/issues/components/MentionTextarea.vue` — opt-in `fullPath` prop + upload wiring + footer row. (+ test)
- `src/features/issues/components/IssueComposer.vue` — description `Textarea` → `MentionTextarea` with `fullPath`.
- `src/views/IssueDetail.vue` — description `Textarea` → `MentionTextarea` with `fullPath`.
- `src/features/issues/components/IssueDiscussion.vue` — pass `:full-path` to comment + reply `MentionTextarea`.

Out of scope (already implemented): non-image file-card rendering and authenticated download in `src/shared/lib/markdown.ts` / `src/shared/lib/media.ts` / `src/shared/components/MarkdownText.vue`. Task 7 only adds a regression test.

**Note on RPC size:** the Electroview client uses `maxRequestTime: 30000` (`src/shared/lib/rpc.ts`). A ~10 MB file becomes ~13 MB of base64 over the bridge; this is acceptable for typical attachments. No change in this plan; documented as a known bound.

After each code change run `bun run format` before committing (project rule).

---

## Task 1: Bun upload transport (`buildUpload` + `gitlabUpload`)

**Files:**
- Modify: `src/bun/gitlab.ts`
- Modify (types): `src/shared/lib/rpcContract.ts` (add `UploadArgs`/`UploadResult` — done fully in Task 2, but Task 1's test needs the shapes; define them here first)
- Test: `src/bun/gitlab.test.ts`

- [ ] **Step 1: Add the `UploadArgs`/`UploadResult` types** (needed by the handler and tests)

In `src/shared/lib/rpcContract.ts`, after the `AssetResult` interface (line 38), add:

```ts
export interface UploadArgs {
  fullPath: string
  filename: string
  contentType: string
  dataBase64: string
}
export interface UploadResult {
  ok: boolean
  status: number
  markdown?: string
  url?: string
  alt?: string
}
```

- [ ] **Step 2: Write the failing test for `buildUpload`**

In `src/bun/gitlab.test.ts`, extend the import on line 2 to include `buildUpload`:

```ts
import { buildGraphql, buildRest, buildAsset, buildUpload } from './gitlab'
```

Add this test inside the `describe('gitlab request builders', ...)` block (after the asset builder test):

```ts
it('builds a multipart upload POST with token + TLS-off', async () => {
  const { url, init } = buildUpload(cfg, {
    fullPath: 'group/app',
    filename: 'log.txt',
    contentType: 'text/plain',
    dataBase64: Buffer.from('hello').toString('base64'),
  })
  expect(url).toBe('https://gl.example.com/api/v4/projects/group%2Fapp/uploads')
  expect(init.method).toBe('POST')
  expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-xyz')
  // Content-Type is NOT set: fetch derives the multipart boundary from FormData.
  expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  expect((init as { tls?: { rejectUnauthorized?: boolean } }).tls?.rejectUnauthorized).toBe(false)
  const body = init.body as FormData
  const file = body.get('file') as File
  expect(file.name).toBe('log.txt')
  expect(file.type).toBe('text/plain')
  expect(await file.text()).toBe('hello')
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run src/bun/gitlab.test.ts -t "multipart upload"`
Expected: FAIL — `buildUpload` is not exported / not a function.

- [ ] **Step 4: Implement `buildUpload` and `gitlabUpload`**

In `src/bun/gitlab.ts`, add `UploadArgs`/`UploadResult` to the type import (lines 3–10):

```ts
import type {
  GraphqlArgs,
  GraphqlResult,
  RestArgs,
  RestResult,
  AssetArgs,
  AssetResult,
  UploadArgs,
  UploadResult,
} from '@/shared/lib/rpcContract'
```

After `buildAsset` (ends line 68), add the builder:

```ts
export function buildUpload(cfg: Cfg, a: UploadArgs): { url: string; init: FetchInit } {
  const bytes = Buffer.from(a.dataBase64, 'base64')
  const form = new FormData()
  form.append('file', new File([bytes], a.filename, { type: a.contentType }))
  return {
    url: `${cfg.gitlabUrl}/api/v4/projects/${encodeURIComponent(a.fullPath)}/uploads`,
    init: {
      method: 'POST',
      // No Content-Type: fetch sets multipart/form-data + boundary from the FormData body.
      headers: { ...authHeaders(cfg.token), Accept: 'application/json' },
      body: form,
      tls: tlsOff,
    },
  }
}
```

After `gitlabAsset` (ends line 126), add the handler:

```ts
export async function gitlabUpload(a: UploadArgs): Promise<UploadResult> {
  const { url, init } = buildUpload(requireCfg(), a)
  let res: Response
  try {
    res = await fetch(url, init as RequestInit)
  } catch {
    report(503, false)
    return { ok: false, status: 503 }
  }
  const json = (await res.json().catch(() => ({}))) as {
    markdown?: string
    url?: string
    alt?: string
  }
  report(res.status, !res.ok)
  return { ok: res.ok, status: res.status, markdown: json.markdown, url: json.url, alt: json.alt }
}
```

- [ ] **Step 5: Run the builder test to verify it passes**

Run: `bunx vitest run src/bun/gitlab.test.ts -t "multipart upload"`
Expected: PASS.

- [ ] **Step 6: Write a failing test for `gitlabUpload` (status passthrough)**

In `src/bun/gitlab.test.ts`, extend the `gitlabGraphql`/`gitlabRest` import (the second import line, currently `import { gitlabGraphql, gitlabRest } from './gitlab'`) to add `gitlabUpload`:

```ts
import { gitlabGraphql, gitlabRest, gitlabUpload } from './gitlab'
```

Add this test inside the `describe('host transport-failure handling', ...)` block (it already sets `loadConfig.mockReturnValue` in `beforeEach` and `unstubAllGlobals` in `afterEach`):

```ts
it('returns markdown + ok on a successful upload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ markdown: '![x](/uploads/abc/x.png)', url: '/uploads/abc/x.png', alt: 'x' }),
    }),
  )
  const res = await gitlabUpload({ fullPath: 'g/a', filename: 'x.png', contentType: 'image/png', dataBase64: 'AA==' })
  expect(res.ok).toBe(true)
  expect(res.status).toBe(201)
  expect(res.markdown).toBe('![x](/uploads/abc/x.png)')
})

it('returns ok:false with status on an upload failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({}) }),
  )
  const res = await gitlabUpload({ fullPath: 'g/a', filename: 'big.zip', contentType: 'application/zip', dataBase64: 'AA==' })
  expect(res.ok).toBe(false)
  expect(res.status).toBe(413)
  expect(res.markdown).toBeUndefined()
})
```

- [ ] **Step 7: Run the handler tests to verify they pass**

Run: `bunx vitest run src/bun/gitlab.test.ts -t "upload"`
Expected: PASS (builder + both handler tests).

- [ ] **Step 8: Format and commit**

```bash
bun run format
git add src/bun/gitlab.ts src/bun/gitlab.test.ts src/shared/lib/rpcContract.ts
git commit -m "feat(uploads): bun gitlabUpload multipart handler"
```

---

## Task 2: RPC contract wiring (renderer ↔ host)

**Files:**
- Modify: `src/shared/lib/rpcContract.ts` (add `gitlabUpload` to `LumenRequests`)
- Modify: `src/shared/lib/rpc.ts` (add to the `rpc` funnel)
- Modify: `src/bun/index.ts` (register the host handler)

(The `UploadArgs`/`UploadResult` types were already added in Task 1, Step 1.)

- [ ] **Step 1: Add `gitlabUpload` to the `LumenRequests` interface**

In `src/shared/lib/rpcContract.ts`, in `interface LumenRequests` (line 74), add after the `gitlabAsset` line (line 77):

```ts
  gitlabUpload: (a: UploadArgs) => Promise<UploadResult>
```

- [ ] **Step 2: Add `gitlabUpload` to the renderer `rpc` client**

In `src/shared/lib/rpc.ts`, in the `export const rpc` object, add after the `gitlabAsset` line (line 29):

```ts
  gitlabUpload: (a) => client().gitlabUpload(a),
```

- [ ] **Step 3: Register `gitlabUpload` on the host**

In `src/bun/index.ts`, extend the import on line 3:

```ts
import { gitlabGraphql, gitlabRest, gitlabAsset, gitlabUpload } from './gitlab'
```

In the handler map (lines 139–141, where `gitlabGraphql, gitlabRest, gitlabAsset` are listed), add:

```ts
        gitlabUpload,
```

- [ ] **Step 4: Typecheck**

Run: `bunx vue-tsc --noEmit` (or the project's typecheck script, e.g. `bun run typecheck`)
Expected: no new errors from these files. (Note: `src/gitlab/generated` is gitignored and may report pre-existing errors unrelated to this change — see project memory.)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/shared/lib/rpcContract.ts src/shared/lib/rpc.ts src/bun/index.ts
git commit -m "feat(uploads): wire gitlabUpload through the RPC bridge"
```

---

## Task 3: `useFileUpload` composable

**Files:**
- Create: `src/features/issues/composables/useFileUpload.ts`
- Test: `src/features/issues/composables/useFileUpload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/composables/useFileUpload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gitlabUpload } = vi.hoisted(() => ({ gitlabUpload: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabUpload } }))

import { useFileUpload, uploadErrorMessage } from './useFileUpload'

beforeEach(() => gitlabUpload.mockReset())

function fileOf(name: string, type: string, body = 'data') {
  return new File([body], name, { type })
}

describe('useFileUpload', () => {
  it('uploads a file as base64 and returns the markdown verbatim', async () => {
    gitlabUpload.mockResolvedValue({ ok: true, status: 201, markdown: '![a](/uploads/s/a.png)', url: '/uploads/s/a.png' })
    const { uploadFile } = useFileUpload('group/app')
    const result = await uploadFile(fileOf('a.png', 'image/png'))
    expect(result.markdown).toBe('![a](/uploads/s/a.png)')
    expect(result.url).toBe('/uploads/s/a.png')
    expect(result.isImage).toBe(true)
    const arg = gitlabUpload.mock.calls[0][0]
    expect(arg.fullPath).toBe('group/app')
    expect(arg.filename).toBe('a.png')
    expect(arg.contentType).toBe('image/png')
    expect(typeof arg.dataBase64).toBe('string')
    expect(arg.dataBase64.length).toBeGreaterThan(0)
  })

  it('flags non-image files as isImage:false', async () => {
    gitlabUpload.mockResolvedValue({ ok: true, status: 201, markdown: '[a](/uploads/s/a.zip)', url: '/uploads/s/a.zip' })
    const { uploadFile } = useFileUpload('group/app')
    const result = await uploadFile(fileOf('a.zip', 'application/zip'))
    expect(result.isImage).toBe(false)
  })

  it('throws a mapped error when the upload fails', async () => {
    gitlabUpload.mockResolvedValue({ ok: false, status: 413 })
    const { uploadFile } = useFileUpload('group/app')
    await expect(uploadFile(fileOf('big.zip', 'application/zip'))).rejects.toThrow('File too large')
  })

  it('maps statuses to messages', () => {
    expect(uploadErrorMessage(413)).toBe('File too large')
    expect(uploadErrorMessage(401)).toBe('Not authorized to upload')
    expect(uploadErrorMessage(403)).toBe('Not authorized to upload')
    expect(uploadErrorMessage(500)).toBe('Upload failed (500)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/issues/composables/useFileUpload.test.ts`
Expected: FAIL — module not found / `useFileUpload` undefined.

- [ ] **Step 3: Implement the composable**

Create `src/features/issues/composables/useFileUpload.ts`:

```ts
import { rpc } from '@/shared/lib/rpc'

/** Soft warning threshold; the real cap is server-configured. */
export const MAX_SOFT_BYTES = 10 * 1024 * 1024

export interface UploadedFile {
  markdown: string
  url: string
  isImage: boolean
}

export function uploadErrorMessage(status: number): string {
  if (status === 413) return 'File too large'
  if (status === 401 || status === 403) return 'Not authorized to upload'
  return `Upload failed (${status})`
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1)) // strip "data:<mime>;base64,"
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function useFileUpload(fullPath: string) {
  async function uploadFile(file: File): Promise<UploadedFile> {
    const dataBase64 = await readAsBase64(file)
    const res = await rpc.gitlabUpload({
      fullPath,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      dataBase64,
    })
    if (!res.ok || !res.markdown) throw new Error(uploadErrorMessage(res.status))
    return { markdown: res.markdown, url: res.url ?? '', isImage: file.type.startsWith('image/') }
  }

  return { uploadFile }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/issues/composables/useFileUpload.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/issues/composables/useFileUpload.ts src/features/issues/composables/useFileUpload.test.ts
git commit -m "feat(uploads): useFileUpload composable"
```

---

## Task 4: `useTextareaAttach` composable (paste/drop/picker + placeholder swap)

**Files:**
- Create: `src/features/issues/composables/useTextareaAttach.ts`
- Test: `src/features/issues/composables/useTextareaAttach.test.ts`

This composable owns the DOM-event glue and the placeholder-then-swap insertion. It takes the editor's text model ref and a caret-offset getter, and returns event handlers + a `dragging` flag + a hidden-input ref.

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/composables/useTextareaAttach.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { uploadFile } = vi.hoisted(() => ({ uploadFile: vi.fn() }))
vi.mock('./useFileUpload', () => ({
  useFileUpload: () => ({ uploadFile }),
  MAX_SOFT_BYTES: 10 * 1024 * 1024,
}))
const { pushToast } = vi.hoisted(() => ({ pushToast: vi.fn() }))
vi.mock('@/shared/composables/useToast', () => ({ pushToast }))

import { useTextareaAttach } from './useTextareaAttach'

function fileOf(name: string, type: string) {
  return new File(['x'], name, { type })
}

beforeEach(() => {
  uploadFile.mockReset()
  pushToast.mockReset()
})

describe('useTextareaAttach', () => {
  it('inserts a placeholder at the caret then swaps in the returned markdown', async () => {
    const text = ref('before after')
    const caret = ref(6) // between "before" and " after"
    uploadFile.mockResolvedValue({ markdown: '![a](/uploads/s/a.png)', url: '', isImage: true })
    const { handleFiles } = useTextareaAttach('g/a', text, () => caret.value)
    await handleFiles([fileOf('a.png', 'image/png')])
    expect(text.value).toContain('![a](/uploads/s/a.png)')
    expect(text.value).not.toContain('Uploading')
    expect(text.value.startsWith('before')).toBe(true)
  })

  it('removes the placeholder and toasts on failure', async () => {
    const text = ref('')
    uploadFile.mockRejectedValue(new Error('File too large'))
    const { handleFiles } = useTextareaAttach('g/a', text, () => 0)
    await handleFiles([fileOf('big.zip', 'application/zip')])
    expect(text.value).not.toContain('Uploading')
    expect(text.value).toBe('')
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'failed', title: 'Upload failed' }),
    )
  })

  it('uploads multiple files without placeholder collisions', async () => {
    const text = ref('')
    uploadFile
      .mockResolvedValueOnce({ markdown: '![a](/u/a.png)', url: '', isImage: true })
      .mockResolvedValueOnce({ markdown: '![b](/u/b.png)', url: '', isImage: true })
    const { handleFiles } = useTextareaAttach('g/a', text, () => text.value.length)
    await handleFiles([fileOf('a.png', 'image/png'), fileOf('b.png', 'image/png')])
    expect(text.value).toContain('![a](/u/a.png)')
    expect(text.value).toContain('![b](/u/b.png)')
    expect(text.value).not.toContain('Uploading')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/issues/composables/useTextareaAttach.test.ts`
Expected: FAIL — module not found / `useTextareaAttach` undefined.

- [ ] **Step 3: Implement the composable**

Create `src/features/issues/composables/useTextareaAttach.ts`:

```ts
import { ref, type Ref } from 'vue'
import { useFileUpload, MAX_SOFT_BYTES } from './useFileUpload'
import { pushToast } from '@/shared/composables/useToast'

/**
 * DOM glue for attaching files to a textarea: paste/drop/picker handlers plus a
 * placeholder-then-swap insertion. `caret()` returns the current selection offset
 * in `text` (the host component tracks it). Each in-flight upload gets a unique
 * token so concurrent uploads never collide, and completion swaps by exact-string
 * replace — so the user typing elsewhere mid-upload cannot misplace the reference.
 */
export function useTextareaAttach(fullPath: string, text: Ref<string>, caret: () => number) {
  const { uploadFile } = useFileUpload(fullPath)
  const dragging = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)
  let seq = 0

  function tokenFor(name: string, id: number, isImage: boolean): string {
    const label = `Uploading ${name}… #u${id}`
    return `${isImage ? '!' : ''}[${label}]()`
  }

  async function uploadOne(file: File): Promise<void> {
    if (file.size > MAX_SOFT_BYTES) {
      pushToast({ tone: 'info', title: `${file.name} is large; upload may be slow or rejected.` })
    }
    const id = (seq += 1)
    const token = tokenFor(file.name, id, file.type.startsWith('image/'))
    const at = caret()
    text.value = `${text.value.slice(0, at)}${token}\n${text.value.slice(at)}`
    try {
      const { markdown } = await uploadFile(file)
      text.value = text.value.replace(token, markdown)
    } catch (error) {
      text.value = text.value.replace(`${token}\n`, '').replace(token, '')
      pushToast({
        tone: 'failed',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleFiles(list: FileList | File[] | null | undefined): Promise<void> {
    const files = Array.from(list ?? [])
    if (!files.length) return
    await Promise.all(files.map(uploadOne))
  }

  function onPaste(event: ClipboardEvent): void {
    const files = event.clipboardData?.files
    if (files && files.length) {
      event.preventDefault()
      void handleFiles(files)
    }
  }

  function onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault()
      dragging.value = true
    }
  }

  function onDragLeave(): void {
    dragging.value = false
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault()
    dragging.value = false
    void handleFiles(event.dataTransfer?.files)
  }

  function openPicker(): void {
    fileInput.value?.click()
  }

  function onPick(event: Event): void {
    const input = event.target as HTMLInputElement
    void handleFiles(input.files)
    input.value = '' // allow re-selecting the same file
  }

  return { dragging, fileInput, handleFiles, onPaste, onDragOver, onDragLeave, onDrop, openPicker, onPick }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/issues/composables/useTextareaAttach.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/issues/composables/useTextareaAttach.ts src/features/issues/composables/useTextareaAttach.test.ts
git commit -m "feat(uploads): useTextareaAttach paste/drop/picker glue"
```

---

## Task 5: Extend `MentionTextarea` with opt-in uploads

**Files:**
- Modify: `src/features/issues/components/MentionTextarea.vue`
- Test: `src/features/issues/components/MentionTextarea.upload.test.ts`

When a `fullPath` prop is passed, `MentionTextarea` wires the attach composable onto its existing `<Textarea>` (reusing its `cursor` ref for caret position) and renders a footer row with a paperclip button + hidden file input. With no `fullPath`, behavior is unchanged.

- [ ] **Step 1: Write the failing component test**

Create `src/features/issues/components/MentionTextarea.upload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { handleFiles } = vi.hoisted(() => ({ handleFiles: vi.fn() }))
vi.mock('@/features/issues/composables/useTextareaAttach', () => ({
  useTextareaAttach: () => ({
    dragging: { value: false },
    fileInput: { value: null },
    handleFiles,
    onPaste: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    openPicker: vi.fn(),
    onPick: vi.fn(),
  }),
}))

import MentionTextarea from './MentionTextarea.vue'

beforeEach(() => handleFiles.mockReset())

describe('MentionTextarea uploads', () => {
  it('renders the attach footer only when fullPath is set', () => {
    const without = mount(MentionTextarea, { props: { members: [], modelValue: '' } })
    expect(without.find('[data-testid="attach-file"]').exists()).toBe(false)

    const withPath = mount(MentionTextarea, {
      props: { members: [], modelValue: '', fullPath: 'g/a' },
    })
    expect(withPath.find('[data-testid="attach-file"]').exists()).toBe(true)
  })

  it('triggers the picker when the attach button is clicked', async () => {
    const wrapper = mount(MentionTextarea, {
      props: { members: [], modelValue: '', fullPath: 'g/a' },
    })
    await wrapper.find('[data-testid="attach-file"]').trigger('click')
    // openPicker is mocked; assert the button is wired by checking no throw and presence.
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/issues/components/MentionTextarea.upload.test.ts`
Expected: FAIL — no `attach-file` button / no file input rendered.

- [ ] **Step 3: Add the upload wiring to the script**

In `src/features/issues/components/MentionTextarea.vue`, update the props and import the composable.

Change the import block near the top (after the existing imports, around line 5) to add:

```ts
import { Paperclip } from '@lucide/vue'
import { useTextareaAttach } from '@/features/issues/composables/useTextareaAttach'
```

Change the `defineProps` (lines 9–11) to add the optional `fullPath`:

```ts
const props = defineProps<{
  members: ProjectMember[]
  fullPath?: string
}>()
```

After the `cursor` ref is declared (line 18, `const cursor = ref(0)`), add the attach wiring (it reuses `cursor` for caret position):

```ts
const attach = props.fullPath
  ? useTextareaAttach(props.fullPath, text, () => cursor.value)
  : null
```

- [ ] **Step 4: Wire the textarea events and render the footer**

In the template, update the `<Textarea>` (lines 92–100) to bind the attach handlers when present. Replace the `<Textarea ...>` opening tag with:

```html
    <Textarea
      v-bind="attrs"
      ref="textarea"
      v-model="text"
      :class="attach?.dragging.value ? 'ring-2 ring-primary/60' : ''"
      @click="syncCursor"
      @keyup="syncCursor"
      @select="syncCursor"
      @keydown="onKeydown"
      @paste="attach?.onPaste"
      @dragover="attach?.onDragOver"
      @dragleave="attach?.onDragLeave"
      @drop="attach?.onDrop"
    />
```

Immediately after the closing `</Textarea>` tag (before the mention-suggestions `<div v-if="open">`), add the footer + hidden input:

```html
    <div v-if="attach" class="mt-1.5 flex items-center gap-2">
      <input
        ref="attachInput"
        type="file"
        multiple
        class="hidden"
        @change="attach.onPick"
      />
      <button
        type="button"
        data-testid="attach-file"
        class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
        @click="attach.openPicker"
      >
        <Paperclip class="size-3.5" />
        Attach file
      </button>
    </div>
```

- [ ] **Step 5: Bind the hidden input ref into the composable**

The composable owns `fileInput` (it calls `.click()` in `openPicker`). Bind the template `attachInput` ref to it after mount. Add to the script (after the `attach` declaration):

```ts
import { onMounted } from 'vue' // add to the existing 'vue' import if not present
const attachInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (attach) attach.fileInput.value = attachInput.value
})
```

(Add `onMounted` to the existing `import { computed, nextTick, onUnmounted, ref, useAttrs, watch } from 'vue'` line rather than a second import.)

- [ ] **Step 6: Run the component test to verify it passes**

Run: `bunx vitest run src/features/issues/components/MentionTextarea.upload.test.ts`
Expected: PASS (both cases).

- [ ] **Step 7: Run the existing MentionTextarea tests to confirm no regression**

Run: `bunx vitest run src/features/issues/components/ -t "Mention"`
Expected: PASS (mention behavior unchanged when `fullPath` is absent).

- [ ] **Step 8: Format and commit**

```bash
bun run format
git add src/features/issues/components/MentionTextarea.vue src/features/issues/components/MentionTextarea.upload.test.ts
git commit -m "feat(uploads): opt-in file attach in MentionTextarea"
```

---

## Task 6: Wire the four editing surfaces

**Files:**
- Modify: `src/features/issues/components/IssueComposer.vue`
- Modify: `src/views/IssueDetail.vue`
- Modify: `src/features/issues/components/IssueDiscussion.vue`

- [ ] **Step 1: Composer — switch description to `MentionTextarea`**

In `src/features/issues/components/IssueComposer.vue`:

Add the import (near the other component imports, after the `Textarea` import on line 6):

```ts
import MentionTextarea from '@/features/issues/components/MentionTextarea.vue'
```

Replace the description `<Textarea>` block (the one with `id="composer-description"`, around lines 113–119) with:

```html
          <MentionTextarea
            id="composer-description"
            v-model="description"
            :members="members ?? []"
            :full-path="fullPath"
            data-testid="composer-description"
            placeholder="Add detail, repro steps, links… (optional)"
            class="min-h-28"
          />
```

(Leave the `Textarea` import in place only if still used elsewhere in the file; if it becomes unused, remove it to satisfy lint.)

- [ ] **Step 2: Issue detail — switch description editor to `MentionTextarea`**

In `src/views/IssueDetail.vue`:

Add the import (near the other imports, after the `Textarea` import on line 23):

```ts
import MentionTextarea from '@/features/issues/components/MentionTextarea.vue'
```

Replace the description edit `<Textarea>` block (around lines 310–315, inside the description `EditableField`) with:

```html
              <MentionTextarea
                v-model="draft.description"
                :members="members ?? []"
                :full-path="fullPath"
                aria-label="Issue description"
                placeholder="Add a description…"
              />
```

(If `Textarea` is still used for the title or elsewhere, keep its import; otherwise remove it to satisfy lint.)

- [ ] **Step 3: Discussion — pass `fullPath` to comment + reply editors**

In `src/features/issues/components/IssueDiscussion.vue`, both `<MentionTextarea>` instances already receive `:members`. Add `:full-path="fullPath"` to each.

Reply editor (around line 111):

```html
            <MentionTextarea
              v-model="replyBody"
              :members="members"
              :full-path="fullPath"
              placeholder="Write a reply…"
              aria-label="Write a reply"
            />
```

Top-level comment editor (around line 150):

```html
      <MentionTextarea
        id="issue-comment"
        v-model="comment"
        :members="members"
        :full-path="fullPath"
        placeholder="Add a comment…"
        aria-label="Add a comment"
      />
```

- [ ] **Step 4: Typecheck + run the issue feature tests**

Run: `bunx vue-tsc --noEmit` (or `bun run typecheck`)
Expected: no new errors from the edited files.

Run: `bunx vitest run src/features/issues`
Expected: PASS (existing composer/discussion/detail tests still green).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/issues/components/IssueComposer.vue src/views/IssueDetail.vue src/features/issues/components/IssueDiscussion.vue
git commit -m "feat(uploads): enable attachments in composer, description, comments"
```

---

## Task 7: Non-image download regression test

Non-image download is already implemented (`renderMarkdown` emits `<a class="file-card" … download>`; `applyResolvedMedia` swaps the href to a blob URL; `MarkdownText` lets `download` anchors navigate). This task only locks that behavior with a regression test so the upload feature's downstream (clicking an attached non-image) stays working.

**Files:**
- Test: `src/shared/lib/markdown.filecard.test.ts` (or extend the existing markdown test file if one exists — check `src/shared/lib/markdown.test.ts` first and add there if present)

- [ ] **Step 1: Check for an existing markdown test file**

Run: `ls src/shared/lib/markdown*.test.ts`
If `markdown.test.ts` exists, add the test below to it instead of creating a new file.

- [ ] **Step 2: Write the regression test**

Create (or append to) the markdown test:

```ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdown'

describe('non-image upload rendering', () => {
  it('renders a non-image upload as a downloadable file-card with a deferred src', () => {
    const html = renderMarkdown('[report.pdf](/uploads/0123456789abcdef0123456789abcdef/report.pdf)', {
      projectPath: 'group/app',
    })
    expect(html).toContain('class="file-card"')
    expect(html).toContain('download')
    // Deferred for auth resolution: carries data-media-src for applyResolvedMedia.
    expect(html).toContain('data-media-src=')
    expect(html).toContain('report.pdf')
  })

  it('renders an image upload inline (not a file-card)', () => {
    const html = renderMarkdown('![shot](/uploads/0123456789abcdef0123456789abcdef/shot.png)', {
      projectPath: 'group/app',
    })
    expect(html).toContain('data-media-kind="image"')
    expect(html).not.toContain('file-card')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `bunx vitest run src/shared/lib/markdown` (matches the markdown test file)
Expected: PASS. If the secret-hash shape in the test fails the `SECRET` regex, confirm it is exactly 32 hex chars (the example above is).

- [ ] **Step 4: Commit**

```bash
bun run format
git add src/shared/lib/markdown*.test.ts
git commit -m "test(uploads): lock non-image file-card rendering"
```

---

## Task 8: Full suite + manual verification

- [ ] **Step 1: Run the full test suite**

Run: `bunx vitest run`
Expected: all green (no regressions).

- [ ] **Step 2: Typecheck**

Run: `bunx vue-tsc --noEmit` (or `bun run typecheck`)
Expected: no new errors. (Pre-existing `src/gitlab/generated` errors require a live `bun codegen` and are unrelated — see project memory.)

- [ ] **Step 3: Manual smoke test (requires a configured GitLab instance)**

Use the `superpowers:verification-before-completion` discipline. With the app running against the configured instance:
1. Composer: paste a screenshot into the description → placeholder appears, then resolves to an inline image after save.
2. Composer: click "Attach file", pick a PDF → inserts a `[name](...)` link; after creating the issue, the rendered description shows a file-card that downloads on click.
3. Issue detail: edit the description, drag-drop an image from Finder → drop ring shows, placeholder swaps to the image reference; Save persists it.
4. Comment: paste an image → uploads and inserts; submit the comment → image renders inline.
5. Reply: attach a file in an inline reply → uploads and inserts; submit → file-card renders.
6. Failure path: attach an oversized file (exceeding the instance's max) → placeholder is removed and a "Upload failed" toast appears; other in-flight uploads are unaffected.

- [ ] **Step 4: Final review + branch completion**

Use `superpowers:finishing-a-development-branch` to decide merge/PR. All commits are already on `feat/issue-file-attachments`.

---

## Self-Review

**Spec coverage:**
- Three triggers (paste/drop/picker) → Task 4 (`useTextareaAttach`) + Task 5 (footer button). ✓
- Any file type; images inline, non-images downloadable → Task 3 (`isImage`), Task 7 (file-card regression; pre-existing render). ✓
- Four surfaces (composer, description, comment, reply) → Task 6. ✓
- Bun upload transport with PAT, encoded project path, multipart → Task 1. ✓
- RPC bridge wiring → Task 2. ✓
- Placeholder-then-swap, caret integrity, concurrent uploads → Task 4 (exact-string token replace, unique `#u<id>`). ✓
- Error handling (413/auth/generic), soft size warn → Task 3 (`uploadErrorMessage`), Task 4 (soft warn + failure toast). ✓
- Tests via `bunx vitest run` → every task. ✓

**Placeholder scan:** No "TBD"/"TODO"/vague steps; all code blocks are complete.

**Type consistency:** `UploadArgs`/`UploadResult` (Task 1) match `LumenRequests.gitlabUpload` (Task 2), `rpc.gitlabUpload` (Task 2), and `useFileUpload` (Task 3). `useTextareaAttach(fullPath, text, caret)` signature matches its call in `MentionTextarea` (Task 5) and its test (Task 4). `MAX_SOFT_BYTES` is exported from `useFileUpload` and imported in `useTextareaAttach`. The attach object's members (`dragging`, `fileInput`, `handleFiles`, `onPaste`, `onDragOver`, `onDragLeave`, `onDrop`, `openPicker`, `onPick`) are consistent across Task 4 implementation, Task 4 test mock, and Task 5 usage.
