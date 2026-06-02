# Issue Composer — Design

**Date:** 2026-06-02
**Status:** Approved, ready for implementation plan

## Problem

Creating an issue today goes through a persistent "Quick create" bar — a dashed-border
`<form>` parked permanently between the filters and the issue list (`IssueList.vue:415–438`).
It is wrong for three reasons:

1. **Always occupies space** whether or not you intend to create anything.
2. **Title-only** — no description, labels, or assignee, so every new issue needs a
   follow-up triage pass in the drawer.
3. **Awkward placement** — it sits mid-page and visually competes with the toolbar above it.

## Solution

Replace the bar with an **on-demand slide-over composer**: a right-side `Sheet` that
opens from a header button or the `C` key, offers full-fidelity creation
(title, description, labels, assignee) with progressive disclosure, and closes on success
with a quiet flash-highlight on the new issue.

The composer deliberately mirrors the existing `IssueDrawer` so reading and creating an
issue feel like one family of surfaces.

## What gets removed

Delete from `IssueList.vue`:

- The dashed quick-create `<form>` (`:415–438`).
- Its state: `newTitle`, `justCreated`, `createdTimer`, `submitNew()` (`:196–214`).
- The now-unused imports it pulled in (`Check`, `LoaderCircle` if not used elsewhere).

## Components and units

### `IssueComposer.vue` (new)

A right-side slide-over built on the existing `Sheet`, matching `IssueDrawer`'s shape
(`side="right"`, `sm:max-w-[480px]`, header + scrollable body).

- **Props:** `open: boolean`, `fullPath: string`
- **Emits:** `update:open` (closing), `created: [iid: string]` (so the list can highlight)
- **Self-contained form state** — resets when reopened.

**Layout (progressive disclosure):**

- Always visible: **Title** (autofocused on open), **Description** (textarea, markdown body).
- Behind an **"Add details"** toggle: **Labels** and **Assignee**.
- Footer: `Cancel` · `Create`.
  - `Create` disabled until title is non-empty.
  - Spinner while the mutation is pending.
  - On success: emit `created`, close the sheet, reset state.
- Errors render with `ErrorNotice` **inside** the composer, not on the page.

### Label picker

- Backed by the existing `useProjectLabels(fullPath)` catalog.
- A small multi-select popover rendering `LabelChip`s from the catalog; selected labels
  shown as removable chips in the field.
- Submit passes `labels: string[]` (titles). `createIssue` accepts label **names**
  directly — no ID resolution needed.

### Assignee picker + `useProjectMembers.ts` (new composable)

The app has no users query today (assignees are only known from loaded issues), so add:

- **`useProjectMembers(fullPath: Ref<string>)`** — `useQuery` mirroring `useProjectLabels`:
  queries `project.projectMembers { nodes { user { id username name avatarUrl } } }`,
  filters nulls, normalizes errors via `normalizeError`, `staleTime` ~5 min.
- Picker is **single-assignee** (matches how the app reads assignees today; extensible later).
- Submit passes `assigneeIds: [UserID]`.

## Triggers

1. **Header button** — a primary "New issue" button (`Plus` icon) top-right of the header
   row (`IssueList.vue:239–255`), beside the issue count.
2. **Keyboard `C`** — a `keydown` listener on the list view opens the composer. Ignored
   when:
   - focus is in an `input` / `textarea` / contenteditable, or
   - the composer or the issue drawer (`openIid`) is already open.
3. **Empty state** — the empty-state card (`IssueList.vue:576–588`) gets a "Create issue"
   button wired to the same open handler.

## Create flow and confirmation

- Reuse `useCreateIssue(fullPath)`; it already invalidates `['issues', fullPath]` on success.
- **Extend its input type** to `{ title: string; description?: string; labels?: string[];
  assigneeIds?: string[] }` and forward those fields into `CreateIssueInput`
  (all supported in one mutation).
- The `CreateIssue` mutation currently returns only `issue { iid }`. Keep that — the
  returned `iid` drives the highlight.
- **Confirmation = flash-highlight**, preserving today's quiet no-toast feel: after the
  invalidated list refetches, briefly highlight the row/card whose `iid` matches the
  newly created issue, then fade. A small `highlightIid` ref on `IssueList`, set from the
  `created` event and cleared on a timer, passed down to `IssueRow`/`IssueCard`.

## Error handling

- Transport and GraphQL payload errors already normalize to `GitLabError` via the
  `run()` helper in `useIssueMutations.ts` — no change.
- Surface them with `ErrorNotice` inside the composer so the form stays put and the user
  can retry without losing input.

## Testing

- **`IssueComposer.test.ts`** — title-required gating; "Add details" toggle reveals
  labels/assignee; submit payload shape (labels as names, `assigneeIds`); close + reset
  on success; error renders inside the composer.
- **`useProjectMembers.test.ts`** — successful query maps nodes; error normalization;
  mirrors `useProjectLabels.test.ts`.
- **`IssueList.test.ts`** (update) — persistent bar is gone; header button opens composer;
  `C` opens it (and is ignored while typing / while drawer open); empty-state button opens
  it; new-issue flash-highlight applied to the matching row.

## Judgment calls

- **Single assignee** at create, not multi — matches how the app reads assignees today.
  The picker and payload are trivially extendable to multi later.
- **Flash-highlight** requires the list to locate the new `iid` after invalidation. Small
  bit of transient state on `IssueList`, justified by keeping the established no-toast
  confirmation aesthetic.

## Out of scope

- Milestone, due date, confidential, weight (the "Full" composer depth) — deferred; the
  mutation supports them, so they are additive later.
- Multi-assignee.
- Editing the create surface into an update surface (the drawer already handles edits).
