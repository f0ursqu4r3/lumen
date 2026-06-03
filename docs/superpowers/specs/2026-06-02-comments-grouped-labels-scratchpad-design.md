# Comments-in-Save, Grouped Label Menus, Collapsible Scratchpad — Design

**Date:** 2026-06-02
**Status:** Approved design, pre-implementation

## Overview

Three follow-on refinements to the issue workspace:

1. **Comments folded into Save/Cancel** — posting a comment is no longer a
   separate action; comment text becomes part of the issue's "dirty" state and is
   committed by the existing **Save**, reverted by **Cancel**.
2. **Labels grouped by scope (nested flyout)** — both the add-label menu and the
   filter menu group labels by their `scope::` prefix, presented as nested
   sub-menus (top-level scope → value flyout). The add-label menu enforces
   scoped-label exclusivity (one value per scope).
3. **Collapsible scratchpad** — the per-issue scratchpad collapses, defaulting to
   collapsed, with a marker when it holds content and a remembered open state.

These build directly on the just-merged buffered-edit + filtering work.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Comment dirty scope | A pending comment alone marks the issue dirty (footer + discard guard) |
| Comment architecture | Folded into `useIssueDraft` (single dirty/save/footer/guard) |
| Label menu style | Nested flyout sub-menus (top-level scope → value flyout) |
| Add-label selection | Scoped-label exclusivity: one value per scope; unscoped multi-select |
| Filter label selection | Plain multi-toggle (grouping is visual only; filters can span scopes) |
| Scratchpad default | Collapsed, with a content marker |
| Scratchpad persistence | Open/closed state remembered per issue (localStorage) |

## Architecture

### Feature 1 — Comments as part of Save/Cancel

The comment is a new *note*, not an issue field, so it stays out of the pure
`IssueDraft`/`diffIssueEdit` (those map to issue-field mutations). It is owned by
the orchestration composable instead.

**`src/composables/useIssueDraft.ts`:**
- Add a `comment` ref (string, default `""`).
- Add `useAddNote(fullPath, iid)` alongside the existing `useUpdateIssue` /
  `useSetAssignees`.
- `dirty` = `isDirty(original, draft) || comment.value.trim() !== ""`.
- `saving` = any of update / setAssignees / addNote pending.
- `error` = first of update / setAssignees / addNote error.
- `save()`:
  1. field update mutation (when `diff.update`),
  2. assignee mutation (when `diff.assignees`),
  3. **if `comment.value.trim()`**, `addNote.mutateAsync({ noteableId:
     issue.value.id, body: comment.value })`,
  4. on success: `original = cloneDraft(draft.value)` **and** `comment.value =
     ""`.
- `reset()`: re-sync from server **and** `comment.value = ""`.

**`src/views/IssueDetail.vue`:**
- The Notes section keeps rendering existing notes and the comment `Textarea`, now
  `v-model="draft.comment"`.
- Remove the standalone **Comment** button, the `submitComment` handler, the
  `posted` acknowledgement, and the direct `useAddNote` import/usage.
- `actionError` simplifies to the draft's `error` (which now includes addNote).
- The existing sticky **Save changes** footer posts the comment; a pending
  comment alone shows the footer and triggers the discard-confirm on
  close/expand/navigation (the guard already keys off `dirty`).

### Feature 2 — Labels grouped by scope (nested flyout)

**`src/lib/labelGroups.ts` (pure, fully unit-tested):**
```ts
interface LabelLike { id: string; title: string; color: string }
interface ScopeGroup {
  key: string;          // scope lowercased, or "__none"
  label: string;        // display name: the scope text, or "Other"
  scope: string | null; // null for the unscoped group
  options: LabelLike[];
}
// Group by parseLabel(title).scope; preferred scopes first (priority, type,
// workflow/status/assigned, team…), then alpha; the unscoped "Other" group last.
function groupLabelsByScope(labels: LabelLike[]): ScopeGroup[]
// Toggle with scoped-label exclusivity: selecting a scoped value removes any
// other selected title in the same scope; unscoped labels plain-toggle.
function toggleScoped(selected: string[], title: string): string[]
```
Scope ordering reuses the preferred-scope idea already in `issueView.ts`
(`labelScopes`); `labelGroups.ts` may import that helper or replicate the small
ordered list — implementation chooses the DRY option.

**`src/components/LabelGroupMenu.vue` (presentational):**
- Props: `groups: ScopeGroup[]`, `selected: string[]`.
- Emits: `toggle: [title: string]`.
- Renders top-level scope rows (`Priority ▸`, `Type ▸`, … `Other ▸`). Opening a
  row (hover, click, or keyboard) reveals a side flyout listing that scope's
  values with a check for selected titles. Clicking a value emits `toggle(title)`.
- Accessibility: rows are buttons with `aria-haspopup`/`aria-expanded`; flyout
  items are buttons; Escape closes the open flyout.

**`src/components/LabelPicker.vue` (add-label):**
- Its popover hosts `LabelGroupMenu` (built from `groupLabelsByScope(catalog)`).
- `@toggle` runs `toggleScoped(modelValue, title)` and emits
  `update:modelValue` — **single value per scope**, unscoped multi.
- Selected-chip row (with remove) is unchanged.

**`src/components/IssueFilterPanel.vue` (filter):**
- The Labels section hosts `LabelGroupMenu` (built from
  `groupLabelsByScope(catalog)`), `selected` = current label titles.
- `@toggle` runs the existing plain multi-toggle (no exclusivity) and emits
  `update:labels`. Assignee/Author sections unchanged.

**Flyout positioning:** the value flyout opens to the right of its scope row
(absolutely positioned), with a left-side fallback when it would overflow the
viewport. Targeted at a desktop daily-driver.

### Feature 3 — Collapsible scratchpad

**`src/components/Scratchpad.vue`:**
- Header becomes a disclosure toggle (button with a chevron that rotates).
- `open` state via `useStorage` keyed per issue (e.g.
  `scratchpad-open:<fullPath>:<iid>`), **default `false`** (collapsed).
- A small dot/marker next to "Scratchpad" when `note.trim() !== ""` (content
  present), visible regardless of open state.
- The `Textarea` is `v-show`-hidden when collapsed (preserves value/focus). The
  existing debounced "Saved" flag is unchanged.

## Testing (TDD)

**New:**
- `src/lib/labelGroups.test.ts` — `groupLabelsByScope` ordering + Other-last +
  unscoped handling; `toggleScoped` exclusivity (scoped replace, scoped toggle-off,
  unscoped multi).
- `src/components/LabelGroupMenu.test.ts` — renders scope rows, opens a flyout,
  emits `toggle` with the value title, reflects `selected` checks.

**Updated:**
- `src/composables/useIssueDraft.test.ts` — comment makes dirty; `save` posts the
  note and clears comment; comment-only save skips update/setAssignees; `reset`
  clears comment; dirty stays on a failed note post.
- `src/views/IssueDetail.test.ts` — comment `Textarea` bound to `draft.comment`;
  no standalone Comment button; Save (footer) invokes `draft.save`.
- `src/components/LabelPicker.test.ts` — grouped flyout; scoped exclusivity on
  pick.
- `src/components/IssueFilterPanel.test.ts` — labels render grouped; toggling a
  label still emits `update:labels` (multi).
- `src/components/Scratchpad.test.ts` — collapsed by default; toggle expands;
  marker shows when content present; open state persists.

## Out of scope

- Editing/deleting existing comments.
- Multi-value-per-scope filtering UX beyond plain multi-toggle.
- Changing how scoped labels render as chips elsewhere (unchanged).
- Server-side label/scope changes (purely client-side grouping).

## Risks / verification

- **Flyout-in-popover positioning** (filter panel): nested absolutely-positioned
  flyout; verify it doesn't clip and closes correctly. Desktop-first.
- **Comment + field save ordering**: a failed note post must leave the buffer
  dirty (comment retained) without corrupting already-applied field updates —
  covered by a test.
