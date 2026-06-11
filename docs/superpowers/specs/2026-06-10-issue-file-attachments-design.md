# Issue File Attachments — Design

**Date:** 2026-06-10
**Status:** Approved, ready for implementation planning

## Summary

Add the ability to upload and attach files to issues across all body-editing
surfaces: new-issue creation, existing-issue description edits, top-level
comments, and inline comment replies. Files are uploaded immediately to GitLab's
project-scoped uploads endpoint and the returned markdown reference is inserted
into the editor at the caret. Images render inline (existing media resolution);
non-image files insert as download links that fetch through the authenticated
asset RPC.

Three trigger methods are supported: clipboard paste, drag-and-drop, and a
file-picker button. Any file type is allowed.

## Context

Lumen is a Vue + TS desktop UI (Bun host + webview) over a self-hosted GitLab
instance. Today there is **download/display** support for upload assets but **no
upload** path:

- Remote ops route renderer → Bun host via an `rpc.*` contract; the Bun handler
  attaches the PAT (`PRIVATE-TOKEN` header) and uses `rejectUnauthorized: false`
  for the internal-CA instance. See `src/bun/gitlab.ts` (`gitlabRest`,
  `gitlabAsset`) and `src/shared/lib/rpcContract.ts`.
- All issue/comment bodies are plain markdown entered via
  `src/features/issues/components/MentionTextarea.vue` (adds `@mention`
  autocomplete; no toolbar, no paste/drop).
- Rendered markdown images resolve via `data-media-src` markers →
  `rpc.gitlabAsset` → base64 → blob URL swap. See
  `src/shared/lib/media.ts`, `src/shared/lib/markdown.ts`,
  `src/shared/components/MarkdownText.vue`, `src/shared/composables/useGitlabAsset.ts`.
- Everything is scoped by `fullPath` (project path, e.g. `group/project`).
  GitLab's `POST /projects/:id/uploads` accepts a URL-encoded full path as
  `:id`, so every editing surface already has a valid upload target — no
  project picker is needed.

## Goals

- Upload files to issues from the composer, the description editor, top-level
  comments, and inline replies.
- Three triggers: paste, drag-and-drop, file-picker button.
- Any file type. Images render inline; non-images become authenticated download
  links.
- Leave draft buffering (`useIssueDraft`) and `@mention` autocomplete untouched.

## Non-Goals

- Editing/replacing attachments on existing rendered notes (GitLab note editing
  is already unsupported in this app).
- A rich-text/WYSIWYG editor or markdown formatting toolbar beyond the attach
  button.
- A hard client-side size cap (see Error Handling).

## Architecture

Five units, each single-purpose, communicating through existing seams:

1. **Bun upload handler** (`gitlabUpload`) — multipart POST to GitLab, PAT
   attached host-side.
2. **RPC contract entry** — typed renderer → host bridge for the handler.
3. **`useFileUpload(fullPath)` composable** — file → base64 → RPC → returns
   GitLab's markdown reference; maps errors.
4. **`AttachmentTextarea.vue`** — wraps `MentionTextarea`, adding paste/drop/
   picker + placeholder-and-swap insertion. Same `v-model` contract as the bare
   textarea.
5. **Non-image download interceptor** — extends the markdown render layer so
   `/uploads/...` links download through the authenticated asset RPC.

Then the four surfaces swap `MentionTextarea` → `AttachmentTextarea`.

### 1. Transport: Bun upload handler + RPC

New handler `gitlabUpload` in `src/bun/gitlab.ts`, alongside `gitlabRest` /
`gitlabAsset`:

- **Input:** `{ fullPath: string; filename: string; contentType: string; dataBase64: string }`
- Builds `POST ${gitlabUrl}/api/v4/projects/${encodeURIComponent(fullPath)}/uploads`.
- Decodes `dataBase64` to bytes; sends `multipart/form-data` with a single
  `file` part (`filename`, `contentType`).
- Attaches `PRIVATE-TOKEN` header; `rejectUnauthorized: false` (matches siblings).
- **Output:** GitLab's JSON `{ alt, url, markdown, ... }` plus `{ ok: boolean, status: number }`.
  - `url` example: `/uploads/<secret>/name.png`
  - `markdown` example: `![name](/uploads/<secret>/name.png)` for images,
    `[name](/uploads/<secret>/name.txt)` for non-images. GitLab emits the
    correct form per type; we pass it through verbatim.

Add the matching method to `rpcContract.ts` and the `rpc` client wrapper.

Rationale for base64 across the bridge: consistent with `gitlabAsset`, which
already returns base64. The renderer reads files to base64 via `FileReader`
before calling the RPC.

### 2. Upload composable

`src/features/issues/composables/useFileUpload.ts` → `useFileUpload(fullPath: string)`:

- `uploadFile(file: File): Promise<{ markdown: string; url: string; isImage: boolean }>`
  - Reads `file` → base64 (`FileReader.readAsDataURL`, strip prefix).
  - Calls `rpc.gitlabUpload({ fullPath, filename: file.name, contentType: file.type, dataBase64 })`.
  - On `ok`: returns `{ markdown, url, isImage: /^image\//.test(file.type) }`,
    using GitLab's `markdown` verbatim.
  - On `!ok`: throws an `Error` whose message is derived from `status`
    (413 → "File too large", 401/403 → auth error, else
    "Upload failed (<status>)").
- Soft size guard: if `file.size > 10 MB`, emit a warning toast but still
  attempt the upload (GitLab's real limit is server-configured).

### 3. Editor integration: `AttachmentTextarea.vue`

`src/features/issues/components/AttachmentTextarea.vue` wraps `MentionTextarea`
(does not modify it). Props/emits mirror `MentionTextarea` so it is a drop-in:
takes `v-model` (string), `fullPath`, and whatever placeholder/disabled props
the bare textarea exposes; emits the same submit/keyboard events.

Added behavior:

- **Paste:** on `paste`, if `event.clipboardData.files` is non-empty, prevent
  default and upload each file.
- **Drop:** `dragover` (prevent default to enable drop) + `drop` over the editor
  → upload `event.dataTransfer.files`. While a drag is over the editor, show a
  drop affordance (dashed ring / subtle overlay).
- **Picker:** a paperclip button in a **footer row** beneath the textarea; it
  triggers a hidden `<input type="file" multiple>`. Selected files are uploaded.
- **Placeholder → swap (the insertion protocol):**
  1. On upload start, generate a unique id and insert a placeholder token at the
     current caret offset:
     `![Uploading <name>… #<id>]()` (image-guess) or `[Uploading <name>… #<id>]()`.
     The `#<id>` makes the token an exact, collision-free string.
  2. On success, replace that **exact token string** with the returned markdown
     reference (string replace, not offset-based — so user typing elsewhere
     mid-upload cannot corrupt placement).
  3. On failure, remove the exact token string and show an error toast.
  - Multiple files (multi-paste, multi-drop, multi-select) each get their own
    id'd placeholder and upload in parallel; swaps are independent.
- **Model contract:** emits the same `v-model` string the bare textarea did, so
  `useIssueDraft` buffering and `@mention` autocomplete are unaffected.

### 4. Non-image download interceptor

Extend `src/shared/lib/media.ts` / `src/shared/components/MarkdownText.vue`:

- A rendered `<a>` whose href resolves to a `/uploads/...` path (or the
  normalized `/v4/projects/.../uploads/...` form produced by existing path
  rewriting) gets a click interceptor.
- On click: `preventDefault`, fetch via the existing `rpc.gitlabAsset({ path })`
  → base64 → `Blob` → object URL → programmatic anchor download using the link
  text as the filename; revoke the object URL afterward.
- Image links keep their current inline-resolution path; only non-image upload
  links get the download interceptor.

### 5. Surface wiring

Replace `MentionTextarea` with `AttachmentTextarea` (passing `fullPath`) in:

- `src/features/issues/components/IssueComposer.vue` — new-issue description.
- `src/views/IssueDetail.vue` — description editor (`EditableField` edit mode).
- `src/features/issues/components/IssueDiscussion.vue` — top-level comment form
  **and** inline reply forms (replies included).

Each surface already has `fullPath` available, so the upload target is always
concrete.

## Data Flow

```
User paste/drop/select file(s)
  └─ AttachmentTextarea: FileReader → base64, insert id'd placeholder at caret
       └─ useFileUpload.uploadFile()
            └─ rpc.gitlabUpload({ fullPath, filename, contentType, dataBase64 })
                 └─ Bun gitlabUpload: multipart POST /projects/:fullPath/uploads (PAT)
                      └─ returns { markdown, url, ok, status }
       └─ success: replace exact placeholder token with `markdown`
       └─ failure: remove token + error toast
  └─ v-model string flows into existing draft buffer / save path unchanged

Render of a saved body:
  image  ![..](/uploads/..) → existing media resolution → inline blob
  file   [..](/uploads/..)  → click interceptor → gitlabAsset → blob → download
```

## Error Handling & Edge Cases

- **Upload failure:** remove that file's placeholder, toast the mapped reason;
  other in-flight uploads are unaffected.
- **Size:** no hard client cap. Soft warn at 10 MB, proceed; rely on server
  rejection (413 → "File too large" toast) for the real limit.
- **Concurrent / multi-file:** each file has an independent id'd placeholder and
  parallel upload; swaps don't collide.
- **Caret integrity:** capture insertion offset only at placeholder-insert time;
  completion uses exact-string token replace, so typing mid-upload cannot
  misplace the reference.
- **Disallowed / zero-byte files:** server rejects → toast.
- **Auth errors (401/403):** mapped to an auth-specific toast message.

## Testing

Run with `bunx vitest run`.

- **`useFileUpload`:** mock `rpc.gitlabUpload`; assert base64 encoding of input,
  verbatim markdown passthrough, `isImage` detection, and error mapping
  (413 / 401 / generic).
- **Bun `gitlabUpload`:** mock fetch; assert request URL (encoded full path),
  multipart body with the file part, `PRIVATE-TOKEN` header, and base64→bytes
  decode.
- **`AttachmentTextarea`:** simulate paste, drop, and file-select; assert
  placeholder insert then swap-to-markdown; assert failure removes the
  placeholder; assert concurrent uploads each resolve to the correct reference
  without collision; assert `v-model` emissions match the bare textarea contract.
- **Non-image link:** assert click intercept fetches via `gitlabAsset` and
  triggers a download; assert image links still resolve inline (regression).

## Affected / New Files

New:
- `src/features/issues/composables/useFileUpload.ts`
- `src/features/issues/components/AttachmentTextarea.vue`

Modified:
- `src/bun/gitlab.ts` (add `gitlabUpload` handler)
- `src/shared/lib/rpcContract.ts` (+ `rpc` client wrapper) — add upload method
- `src/shared/lib/media.ts` and/or `src/shared/components/MarkdownText.vue`
  (non-image download interceptor)
- `src/features/issues/components/IssueComposer.vue`
- `src/views/IssueDetail.vue`
- `src/features/issues/components/IssueDiscussion.vue`

Out of scope: `MentionTextarea.vue` is wrapped, not modified.
