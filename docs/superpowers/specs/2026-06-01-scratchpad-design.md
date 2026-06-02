# Scratchpad — local-only notes per issue

## Summary

Add a free-form, browser-local note area to each GitLab issue. It is private,
never sent to GitLab, and persists in `localStorage`. The feature is called
**Scratchpad** to distinguish it from GitLab "Notes" (remote comments), which
already exist in the UI.

## Behavior

- One free-form text area per issue, labeled **Scratchpad**, rendered in its own
  section on `IssueDetail` below the GitLab Notes section.
- Because `IssueDrawer` embeds `IssueDetail`, the scratchpad appears in both the
  quick-peek drawer and the full detail page with no drawer-specific changes.
- Auto-saves to `localStorage` as the user types, debounced ~500ms. A subtle,
  transient "Saved" indicator confirms the write. No save button.
- Never sent to GitLab. Purely browser-local state.
- Empty/whitespace-only content removes the `localStorage` entry.

## Architecture

Two small, independently testable units plus one edit to an existing file.

### 1. `src/composables/useScratchpad.ts`

Wraps `useLocalStorage` from `@vueuse/core` (already a dependency).

- Signature: `useScratchpad(fullPath: Ref<string>, iid: Ref<string>): Ref<string>`
- Storage key: `lumen:scratchpad:${fullPath}#${iid}`
- Keying by `fullPath` + `iid` keeps every issue independent and mirrors the
  existing `issueKey(fullPath, iid)` convention in `src/gitlab/issueParams.ts`.
- Returns a reactive `Ref<string>` bound two-way to storage; default `''`, with
  no storage entry until content exists.
- When `fullPath`/`iid` change, the composable re-keys so the returned ref tracks
  the correct issue's notes.
- Depends on: `@vueuse/core`, Vue refs. No network, no GitLab client.

### 2. `src/components/Scratchpad.vue`

- Props: `{ fullPath: string; iid: string }`.
- Binds the existing `Textarea` ui component to the `useScratchpad` ref.
- Watches the value to flash a debounced (~500ms) "Saved" hint after edits.
- Placeholder copy for the empty state, e.g. "Private notes, stored only in this
  browser…".
- Depends on: `useScratchpad`, `Textarea`. Self-contained; no GitLab data.

### 3. `src/views/IssueDetail.vue` (edit)

- Import `Scratchpad` and render `<Scratchpad :full-path="fullPath" :iid="iid" />`
  in a new section after the existing Notes section.
- This is the only change to existing files.

## Reactivity

When `iid` changes — navigating between issues, or the drawer's `:key="iid"`
remount — the composable must re-key to the new issue's storage. `IssueDetail`
already passes reactive `toRef` props, and `IssueDrawer` forces a remount via
`:key="iid"`, so a fresh storage binding is guaranteed in both paths.

## Testing

- `src/composables/useScratchpad.test.ts`
  - Reads an existing `localStorage` value on init.
  - Writes to the ref persist to `localStorage` under the expected key.
  - Two different `iid`s do not collide.
- `src/components/Scratchpad.test.ts`
  - Renders a previously saved value into the textarea.
  - Typing updates `localStorage`.
  - The "Saved" indicator appears after an edit.

## Out of scope (YAGNI)

- Multiple/timestamped note entries (single scratchpad only).
- Markdown rendering of the scratchpad.
- List/card indicators for issues that have notes.
- Cross-device sync or export.
