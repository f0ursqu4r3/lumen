# Rendered Title & Description with Edit/Preview Toggle — Design

**Date:** 2026-06-02
**Status:** Approved design, pre-implementation

## Overview

The issue detail view currently shows the title as an always-on text input and the
description as an always-on textarea. This change makes both fields **start
rendered** (title as a heading, description as rendered markdown) with a per-field
**Edit/Preview** toggle button. The buffered draft + Save/Cancel model is
unchanged — this is a view-mode layer on top.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Toggle granularity | Per-field, independent (title and description toggle separately) |
| Title behavior | Plain-text heading rendered; toggle swaps to a text input (no markdown) |
| After Save | Edited fields return to their rendered view (only on a successful save) |
| Enter-edit affordance | Explicit Edit/Preview button only (clicking the rendered text does nothing) |
| Architecture | Extract a reusable `EditableField.vue` wrapper |

## Architecture

### `src/components/EditableField.vue` (new)

A small presentational wrapper that owns the rendered/edit toggle.

- **Props:** `editing: boolean` (used with `v-model:editing`), `label: string` (the
  field name, for the toggle's accessible label/title, e.g. "Title").
- **Emits:** `update:editing: [value: boolean]`.
- **Slots:** `view` (rendered content), `edit` (editing content).
- **Renders:** a small toggle button —
  - when `!editing`: an **Edit** affordance (pencil icon, label "Edit") that emits
    `update:editing = true`;
  - when `editing`: a **Preview** affordance (eye icon, label "Preview") that emits
    `update:editing = false`.
  Shows the `view` slot when `!editing`, the `edit` slot when `editing`. Pressing
  Escape while editing returns to view (emits `update:editing = false`).
- Testid `editable-toggle` on the button (kept generic; the parent scopes by
  context). The accessible label includes `label` (e.g. "Edit Title").

### `src/views/IssueDetail.vue` wiring

- Two local refs: `editingTitle` and `editingDescription`, both default `false`
  (rendered). They are fresh per issue because the view re-keys on `iid` (full
  page route param; drawer passes `:key="iid"`).
- **Title** via `EditableField` (`v-model:editing="editingTitle"`, label "Title"):
  - `view` slot: the title text as a heading reading `draft.title`.
  - `edit` slot: the existing `<Input v-model="draft.title" data-testid="edit-title">`.
- **Description** via `EditableField` (`v-model:editing="editingDescription"`,
  label "Description"):
  - `view` slot: `<MarkdownText :source="draft.description" :project-path="fullPath">`
    when `draft.description` is non-empty; otherwise a muted "No description"
    placeholder.
  - `edit` slot: the existing `<Textarea v-model="draft.description">`.
- Rendered views read from the **draft**, so Preview reflects in-progress unsaved
  edits, and the dirty buffer drives Save/Cancel exactly as today.
- **Return to rendered on Save:** the sticky footer's Save calls a local
  `onSave()` wrapper: `await save()`, then if `!dirty.value` (save succeeded and
  the buffer cleared) set `editingTitle = false` and `editingDescription = false`.
  If the save failed (dirty still true, error surfaced via the existing
  `ErrorNotice`), the fields stay in edit mode so unsaved changes are not hidden.
- **Cancel** calls a local `onCancel()` wrapper: `reset()` then set both editing
  refs to `false` (the discard returns to rendered).
- Everything else — `#iid`, `StateBadge`, Close/Reopen, `LabelPicker`,
  `AssigneeEditor`/`QuickAssign`, the comment textarea, `Scratchpad`, the
  route-leave / drawer dirty guards — is unchanged.

## Behavior details

- Default on load: both fields rendered.
- Title is plain text — its "Preview" is simply the heading; no markdown is applied
  to the title.
- Empty description renders a muted "No description" with the Edit toggle still
  available.
- Toggling a field's mode is pure view state; it does not touch the draft, dirty,
  or saving state.

## Testing (TDD)

**New — `src/components/EditableField.test.ts`:**
- Shows the `view` slot and hides `edit` when `editing` is false.
- Shows the `edit` slot when `editing` is true.
- Clicking the toggle emits `update:editing` with the flipped value.

**Updated — `src/views/IssueDetail.test.ts`:**
- Title and description render by default: the rendered title text shows and the
  `edit-title` input / description textarea are NOT present initially.
- Clicking the title's Edit toggle reveals the `edit-title` input bound to
  `draft.title`; clicking the description's Edit toggle reveals the textarea.
- After a successful Save, fields return to rendered (inputs no longer present).
- The comment-textarea binding, no-Comment-button, system-note hiding,
  toggle-state, and Save/Cancel-footer cases remain (adjusted only for the new
  default-rendered state where they interact with title/description).

## Out of scope

- Markdown rendering / preview for the title (plain text only).
- Click-to-edit on the rendered text (button only).
- Any change to the draft/Save/Cancel/dirty model, mutations, or GraphQL.
- Persisting the edit/preview mode across navigations.

## Risks / verification

- **Test churn:** `IssueDetail.test.ts` currently assumes the title input is
  always present; it must be updated to drive the new toggle. Low risk, covered by
  the updated tests above.
- **Save-failure path:** ensure fields stay in edit mode when a save fails
  (guard on `!dirty.value`), so unsaved edits aren't hidden behind a rendered view.
