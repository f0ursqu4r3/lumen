# Issue Details Rail — Progressive Disclosure

**Date:** 2026-06-08
**Status:** Approved (brainstorming) → ready for implementation plan
**Component:** `src/features/issues/components/IssueDetailsRail.vue`

## Problem

The Details Rail renders a fixed set of eight fields, all always visible
regardless of whether they hold a value. Empty fields (no due date, no weight,
no estimate) take up space and add noise. We want the rail to read as a clean
summary of what an issue *has*, and to grow to cover the full set of GitLab
issue attributes without becoming a wall of empty inputs.

## Goal

Show only populated (and a few pinned) fields. Empty fields are hidden behind an
**Add field** menu: to set a value on an unset field, you first *add* it to the
issue (revealing its editor), then fill and save. This mirrors GitLab's own
sidebar mental model while staying far cleaner.

The mechanism must scale to the full GitLab attribute set, so it is built on a
field-descriptor registry rather than hand-maintained per-field branches.

## Interaction model (decisions)

- **Field scope:** ultimately every GitLab-exposed attribute. This spec covers
  the fields that fit the buffered draft/save model (see Field set). The
  non-draft subsystems are deferred to a follow-on spec (see Out of scope).
- **Pinned (always visible, never in the Add menu):** Status, Labels, Assignees.
  These anchor every issue. (Status always carries a value anyway.)
- **Everything else** follows: populated → visible; empty → hidden, available in
  the Add menu.
- **Removal:** clearing a field's value and saving collapses it back to hidden.
  An explicit `×` on a visible field clears its value and collapses it
  immediately (buffered until save, like every other edit).
- **Add affordance:** a single muted `+ Add field` button at the rail bottom
  opens a menu listing the currently-hidden fields; picking one reveals it,
  focused and ready to fill.

## Architecture

### Descriptor registry (pure, testable)

The rail's fields render with heterogeneous bespoke markup (`StatusPicker`,
`LabelPicker`, `AssigneeEditor`, `Select`, date/number `Input`, `Checkbox`).
Forcing them behind one uniform component contract is not worth it, so the
registry is **metadata-only** — it owns visibility/ordering/menu/removal, not
rendering.

```ts
// src/features/issues/lib/railFields.ts  (pure, unit-testable)
export type RailFieldKey =
  | 'status' | 'labels' | 'assignees'        // pinned
  | 'milestone' | 'dueDate' | 'weight' | 'estimate'
  | 'healthStatus' | 'iteration' | 'parent'
  | 'confidential' | 'locked'

export interface RailFieldDescriptor {
  key: RailFieldKey
  label: string                  // 'Due date'
  addLabel?: string              // menu override, e.g. 'Mark confidential', 'Lock issue'
  pinned?: boolean               // status/labels/assignees → always render, never in Add menu
  order: number                  // canonical render + menu order
  isPopulated: (d: IssueDraft) => boolean
  clear: (d: IssueDraft) => void // the × action: reset this field to empty
}

export const RAIL_FIELDS: RailFieldDescriptor[] = [ /* … */ ]
```

### Visibility composable

```ts
// src/features/issues/composables/useRailFields.ts
export function useRailFields(draft: Ref<IssueDraft>, original: Ref<IssueDraft>) {
  // transient, this-session intent — never persisted
  const revealed = ref(new Set<RailFieldKey>())
  const removed  = ref(new Set<RailFieldKey>())

  const visibleKeys: ComputedRef<Set<RailFieldKey>>      // gates each bespoke field block
  const hiddenFields: ComputedRef<RailFieldDescriptor[]> // the Add menu list, canonical order

  function reveal(key: RailFieldKey): void   // revealed.add
  function remove(key: RailFieldKey): void   // removed.add + descriptor.clear(draft) + revealed.delete
  function resetReveal(): void               // clear both sets — called on save + cancel

  return { visibleKeys, hiddenFields, reveal, remove, resetReveal }
}
```

The rail **template keeps each field's existing bespoke markup**, wrapped:

```html
<template v-if="visibleKeys.has('dueDate')"> … existing date Input … </template>
```

The Add menu `v-for`s over `hiddenFields`. Result: one source of truth for
visibility/ordering/menu/removal (pure + testable), rendering stays where it
belongs. A future field = one `RAIL_FIELDS` entry + one template block.

### Visibility state machine

Per non-pinned field, visibility is fully derived from four inputs — no
per-field UI flags scattered around the component:

- `original` populated? — server value at last sync
- `draft` populated? — buffered value now
- `revealed: Set` — fields the user added this session via the Add menu
- `removed: Set` — fields the user explicitly `×`'d this session

```
visible(key) = pinned(key) ||
  ( !removed.has(key) && ( revealed.has(key)
                           || isPopulated(draft)
                           || isPopulated(original) ) )

inAddMenu(key) = !pinned(key) && !visible(key)
```

`revealed` and `removed` are transient component state, cleared on **save** and
**cancel** only. Nothing new persists to GitLab or localStorage — visibility is
a pure function of issue values plus this-session intent.

### Walk-through (covers the corners)

- **Add Due date from menu** → `revealed.add('dueDate')` → visible, empty,
  focused. No longer in the menu.
- **Fill + Save** → mutation persists; buffer re-syncs (`original` now
  populated); `resetReveal()` clears both sets → field stays visible via
  `isPopulated(original)`.
- **Clear value inline (no ×) + Save** → while dirty it stays visible
  (`isPopulated(original)` still true); after save `original` is empty → next
  render it is hidden. ← "leave empty + save → disappears."
- **× a populated field** → `removed.add` + `clear(draft)` → hidden immediately
  (buffered); Save persists the cleared value. Cancel/`reset` restores it.
- **× then re-add from menu** → `removed.delete` + `revealed.add` → visible,
  empty again.

### Booleans (Confidential, Locked)

Ride the same model: `isPopulated = (d) => d.<flag> === true`,
`clear = (d) => { d.<flag> = false }`. So `true` renders a removable row, and
`false` lives in the Add menu as "Mark confidential" / "Lock issue" (via
`addLabel`).

## Add menu UX & layout

- **Trigger:** a muted `+ Add field` button pinned at the rail bottom, styled
  like `LabelPicker`'s trigger (bordered, `bg-muted/40`, hover→foreground).
  Hidden entirely when `hiddenFields` is empty.
- **Panel:** bespoke popover following the existing pattern (`open` ref +
  `onClickOutside` + absolutely-positioned panel — same as `LabelPicker`; no new
  UI primitive). Lists `hiddenFields` in canonical order; each row is an icon +
  `addLabel ?? label`. ~9 items max, so a plain list (no search box).
- **Reveal flow:** selecting a row → `reveal(key)`, close panel, then on next
  tick focus the field's primary input and `scrollIntoView`.
- **Per-field ×:** each visible non-pinned field gets a hover-revealed `×`
  (matching the existing label/assignee `×` affordance) calling `remove(key)`.
- **Layout change:** today Due date + Weight share a fixed two-column grid. With
  fields appearing/disappearing independently that pairing breaks, so **all
  fields stack full-width in a single column**. (Reads cleaner in the narrow
  drawer too. Intentional small visual change.)

## Field set & data layer

| Field | Kind | Persistence | New work |
|---|---|---|---|
| Status, Labels, Assignees | pinned | existing | none |
| Milestone, Due date, Weight, Estimate | value | existing `updateIssue` | descriptor only |
| Confidential | boolean | existing `updateIssue` | move into model as addable |
| **Health status** (`onTrack` / `needsAttention` / `atRisk`) | value (enum → Select) | `updateIssue.healthStatus` | draft + diff + raw `useIssue` read; **no codegen** |
| **Locked** | boolean | `updateIssue.locked` | draft + diff + raw read (`discussionLocked`); **no codegen** |
| **Parent (Epic)** | value | `updateIssue.epicId` | draft + diff + raw read (`epic{…}`); **no codegen** |
| **Iteration** | value | work-item widget (like Status) — `workItemUpdate.iterationWidget.iterationId` | own query + mutation, raw strings; **no codegen** |

> **Schema confirmed (2026-06-08, live instance).** Health/Locked/Parent are all
> fields on `UpdateIssueInput` (`healthStatus`, `locked`, `epicId`) and on the
> `Issue` read type, so they ride the existing `updateIssue` mutation + the raw
> `useIssue` query with **no codegen**. Only Iteration lacks an `updateIssue`
> field and needs the work-item widget mutation (raw strings, like Status — also
> no codegen). See `docs/reference/gitlab-issue-field-shapes.md`. This supersedes
> the earlier "codegen gate" — nothing here changes a typed `graphql()` document.

### Changes

- `IssueDraft` (`src/features/issues/lib/issueEdit.ts`) gains `healthStatus`,
  `locked`, `iterationId`, `parentEpicId`. `draftFromIssue`, `isDirty`,
  `diffIssueEdit` extended in lockstep.
- `useIssue` query (a raw string) gains `healthStatus`, `discussionLocked`,
  `epic { id title }`, `iteration { id title }`. No codegen.
- `useUpdateIssue`'s hand-written input type gains `healthStatus`, `locked`,
  `epicId` (all already on `UpdateIssueInput` in the generated types). No codegen.
- Iteration buffers into the draft and applies in `save()` through its own
  work-item query + mutation (`workItemUpdate.iterationWidget.iterationId`),
  raw strings — the exact precedent the work-item **Status** field set
  (`useWorkItemStatus` / `useSetWorkItemStatus`, buffered via `useIssueDraft.save()`).

### Gates

- **No codegen required.** Confirmed against the live schema (2026-06-08): the
  read query is a raw string and the `updateIssue` input fields already exist in
  the generated types, so `src/gitlab/generated` is untouched. See
  `docs/reference/gitlab-issue-field-shapes.md`.
- **Schema availability:** confirmed present on this instance — `healthStatus`,
  `locked`, `epicId` on `UpdateIssueInput`; `epic`/`iteration` on `Issue`;
  `WorkItemWidgetIterationInput { iterationId }`. No field is deferred for
  availability.

## Out of scope (follow-on specs)

These GitLab attributes do not fit the buffered draft/save model — they have
different persistence semantics and no "empty = hide" meaning — and get their
own design:

- **Time spent** — additive timelog entries (`timelogCreate`), not a settable
  value. (Estimate stays in scope; only *spent* is deferred.)
- **Notifications / subscription** — a per-*user* toggle, not a per-issue value.
- **CRM contacts**, **linked items** — separate subsystems/mutations.

## Testing

- **Pure unit (the bulk):**
  - `railFields` descriptors — `isPopulated` / `clear` per field.
  - Visibility derivation — table-driven over the four inputs
    (`original` / `draft` / `revealed` / `removed`), covering every walk-through
    case including clear-inline-then-save collapse and `×`-then-re-add.
- **Component (`IssueDetailsRail`):**
  - Add from menu → field appears + focused, menu shrinks.
  - `×` → field disappears + value cleared.
  - Boolean: `true` → removable row; `false` → menu entry.
- Run with `bunx vitest run` (project convention; not `bun test`).

## Phasing

1. **Plan 1** (`docs/superpowers/plans/2026-06-08-details-rail-progressive-disclosure.md`)
   — registry + visibility composable + progressive-disclosure UI over the
   existing fields (Status/Labels/Assignees pinned; Milestone, Due date, Weight,
   Estimate, Confidential addable). No GraphQL changes.
2. **Plan 2** — the EE value fields (Health status, Locked, Parent/Epic via
   `updateIssue`; Iteration via the work-item widget). All shapes confirmed; no
   codegen. Layers onto the Plan 1 mechanism.
3. **Phase 3 (separate spec)** — the non-draft subsystems listed in Out of scope.
