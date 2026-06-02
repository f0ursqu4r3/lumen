# Issue Editing, Filtering & Editable Tags — Design

**Date:** 2026-06-02
**Status:** Approved design, pre-implementation

## Overview

Three related changes to the issue workspace:

1. **Buffered editing** — the issue detail view becomes an editable form whose
   changes are held locally and committed with an explicit **Save**, with
   **Cancel** to revert. Leaving with unsaved edits prompts for confirmation.
2. **Comprehensive filtering** — the list and board views gain a proper filter
   panel (labels, assignee, author) on top of the existing state + search, with
   filter state persisted in the URL.
3. **Editable tags** — labels become add/removable on an issue, folded into the
   same buffered Save/Cancel model.

Features 1 and 3 are one feature (tags are a buffered field). Feature 2 is
independent.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Buffered edit scope | title, description, state, assignees, labels (no milestone) |
| Filter dimensions | labels (multi), assignee, author (state + search already exist) |
| Filter UI | single "Filters" popover panel + inline active-filter token row |
| Filter persistence | URL query params (matches the `?issue=` drawer pattern) |
| Dirty guard | confirm-before-discard |
| QuickAssign | kept, converted to controlled (writes into the draft) |
| Confirm dialog | built on shadcn-vue `alert-dialog` |
| Codegen for `authorUsername` | user runs `bun codegen` (instance only reachable from their machine) |

## Architecture

### Feature 1 + 3 — Buffered edit model

Logic split following the existing idiom (pure logic in `lib/`, orchestration in
a composable, thin components).

**New `src/lib/issueEdit.ts` (pure, fully unit-tested):**

```ts
interface IssueDraft {
  title: string;
  description: string;
  state: string;                 // "opened" | "closed"
  labelIds: string[];
  assigneeUsernames: string[];
}

function draftFromIssue(issue): IssueDraft
function isDirty(original: IssueDraft, draft: IssueDraft): boolean
function diffIssueEdit(original: IssueDraft, draft: IssueDraft): {
  update?: {                     // → useUpdateIssue (single mutation)
    title?: string;
    description?: string;
    stateEvent?: "CLOSE" | "REOPEN";
    addLabelIds?: string[];
    removeLabelIds?: string[];
  };
  assignees?: string[];          // → useSetAssignees (only when changed)
}
```

- Label diff computes `addLabelIds` / `removeLabelIds` from the id-set delta.
- State diff maps `opened→closed` to `CLOSE`, `closed→opened` to `REOPEN`.
- Assignee diff is order-insensitive (set comparison); emits the full next list
  because `issueSetAssignees` uses REPLACE semantics.
- A clean diff returns `{}` (no `update`, no `assignees`).

**New `src/composables/useIssueDraft.ts`:**

- Holds a reactive `draft` seeded via `draftFromIssue`.
- Re-syncs from the server issue when it refetches **only while the buffer is
  clean** — never clobbers in-flight edits.
- Exposes `dirty` (computed via `isDirty`), `saving`, `save()`, `reset()`.
- `save()` runs `diffIssueEdit`; fires `useUpdateIssue` with `update` (when
  present) and `useSetAssignees` with `assignees` (when present); existing
  `invalidateQueries` in those mutations refresh the issue. On success the buffer
  becomes clean (re-sync from the refetched issue). Errors bubble to the existing
  `ErrorNotice` path.

**`IssueDetail.vue` (controlled form):**

- Title → inline-editable text input bound to `draft.title`.
- Description → `Textarea` bound to `draft.description`.
- State → existing Close/Reopen button now toggles `draft.state` (no immediate
  mutation).
- Labels → `LabelPicker` (existing component) bound to `draft.labelIds`, catalog
  from `useProjectLabels`. **(Feature 3.)**
- Assignees → `AssigneeEditor` + `QuickAssign`, both converted to controlled.
- Sticky **Save / Cancel** footer, rendered only when `dirty`; Save disabled
  while `saving`. Cancel calls `reset()`.
- Comments remain a separate action (the existing Comment button / `useAddNote`),
  outside the buffer.

**`AssigneeEditor.vue` / `QuickAssign.vue` → controlled:**

- Remove direct `useSetAssignees` calls.
- Accept the current assignee usernames as a prop and emit changes
  (`update:assignees`) into the parent draft.
- AssigneeEditor: add/remove toggles the emitted list. QuickAssign: sets the list
  to `[username]`.

**Dirty guard (confirm-before-discard):**

- New `src/components/ui/alert-dialog/*` via shadcn-vue, plus a small
  `src/components/ConfirmDialog.vue` wrapper (title, body, confirm/cancel labels,
  resolves a promise).
- Full-page route: `onBeforeRouteLeave` in `IssueDetail` → confirm when `dirty`.
- Drawer close + issue-switch: the close handler / iid change in `IssueList`
  (or `IssueDrawer`) routes through the same confirm when the embedded detail is
  dirty. Dirty state is surfaced from the detail to its host (event or exposed
  ref) so the host can intercept before closing/switching.

### Feature 2 — Comprehensive filtering

**Server vars:**

- Extend `IssueFilters` with `author?: string`.
- Extend `toIssuesVars` to map `author` → `authorUsername`.
- Add `$authorUsername` to the Issues GraphQL query in `useIssues.ts`.
- **User runs `bun codegen`** (`NODE_TLS_REJECT_UNAUTHORIZED=0 graphql-codegen
  --config codegen.ts`) to regenerate types after the query change. Implementation
  provides the exact command and the diff is written so types compile once
  regenerated.

**New `src/composables/useIssueFilters.ts`:**

- Single source of truth for `{ state, search, labels[], assignee, author }`,
  serialized to / hydrated from the route query (search debounced).
- Returns the `IssueFilters` computed that drives `useIssues` (shared by both
  list and board, so both views filter identically).
- Replaces the ad-hoc `labelFilters` / `assignee` refs currently in
  `IssueList.vue`.

**New `src/components/IssueFilterPanel.vue`:**

- A "Filters" trigger button with an active-count badge.
- Popover content:
  - Labels — multi-select from `useProjectLabels`.
  - Assignee — select from `useProjectMembers`, with Any / Unassigned options.
  - Author — select from `useProjectMembers`.
- Writes into the shared filter state from `useIssueFilters`.

**`IssueList.vue` integration:**

- Use `useIssueFilters` for filter state.
- Render the `IssueFilterPanel` button in the toolbar.
- Click-to-filter facets (`applyFacet`) keep working by writing into the same
  shared state.
- Active-filter token row stays inline; gains an author token alongside the
  existing label/assignee tokens and "Clear all".

**Author option source:** project members (same as assignee). Authors outside the
member list will not appear in the dropdown — acceptable for a personal tool.

## Testing (TDD)

**New unit tests:**

- `src/lib/issueEdit.test.ts` — `diffIssueEdit`, `isDirty`, `draftFromIssue`
  across every field (title, description, state both directions, label add/remove,
  assignee set changes, clean case).
- `src/composables/useIssueDraft.test.ts` — dirty derivation, save dispatch
  (correct mutations for a given diff), clean re-sync, no-clobber while dirty.
- `src/composables/useIssueFilters.test.ts` — URL round-trip, debounced search,
  clear-all.
- `src/components/IssueFilterPanel.test.ts` — renders dimensions, writes state.
- `src/components/ConfirmDialog.test.ts` — confirm/cancel resolution.

**Updated tests (were asserting immediate mutation / old filter refs):**

- `AssigneeEditor.test.ts`, `QuickAssign.test.ts` — now controlled (emit, don't
  mutate).
- `IssueDetail.test.ts` — buffered save/cancel, dirty footer.
- `IssueList.test.ts` — filter panel + URL-driven filters.
- `issueParams.test.ts` — `author` → `authorUsername` mapping.

## Out of scope

- Milestone editing / milestone filter.
- Editing comments.
- Server-side sort/group (still client-side, unchanged).
- Date-range filters.

## Risks / verification

- **`UpdateIssueInput` title/description support** — must be verified against the
  generated schema before relying on it. If the instance's schema lacks these
  fields, title/description stay read-only and that gets flagged; the rest of the
  design is unaffected.
- **Codegen reachability** — `authorUsername` work depends on the user running
  `bun codegen` against the self-hosted instance.
