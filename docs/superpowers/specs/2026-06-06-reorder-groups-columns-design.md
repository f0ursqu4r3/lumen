# Drag-reorder issue list groups & board columns

## Problem

The issue workspace groups issues into list sections and board columns by a
chosen dimension (status, assignee, label scope, priority). The order of those
groups/columns is fixed — derived deterministically in `issueView.ts` from
`STATUS_ORDER`, `categoryRank`, `priorityRank`, or alphabetically. Users can't
arrange the groups to match how they actually work (e.g. put their team's lane
first, push a noisy status to the end).

We want drag-to-reorder for both the list groups and the board columns.

## Constraints & key facts

- These groups/columns are **synthetic** — built client-side from labels and
  work-item statuses, not from GitLab board lists. GitLab has no API to persist
  an order for them. So custom order is a **local presentation preference**,
  stored per-project like filters and saved views.
- The codebase uses **native HTML5 drag-and-drop** throughout (card retag DnD in
  `useIssueBoardDnd.ts`, hand-rolled drag ghosts). New DnD should match this — no
  new drag library.
- Persistence idiom: `useLocalStorage` (vueuse), per-project storage key, silent
  degrade on quota/disabled. See `useSavedViews.ts` / `useIssueFilters.ts`.
- The board indexes groups by `boardScope`; the list indexes by `groupKey`. Both
  are plain dimension strings (`'status'`, `'assignee'`, `'label:team'`,
  `'priority'`). Indexing the order store by that same string makes the order
  **shared per dimension** across both views with no extra work.

## Decisions

- **Order scope:** shared per grouping dimension. Reordering status columns once
  applies to both the board grouped by status and the list grouped by status.
- **Drag handle:** a dedicated grip on each group/column header (reusing the
  existing `GripVertical` idiom), not the whole header — explicit, discoverable,
  no collision with card drag or header interactions.
- **`'__none'` / "No status" lanes** are freely reorderable like any other key.
  Their default trailing position is just the default; a user can drag them
  anywhere and that's persisted.
- Custom order is a standalone ambient preference — **not** captured by Saved
  Views (avoids coupling and snapshot bloat).

## Architecture

### 1. `useGroupOrder(fullPath)` — persistence (new)

`src/features/issues/composables/useGroupOrder.ts`

Wraps `useLocalStorage<Record<string, string[]>>` at key
`lumen:group-order:${fullPath}`, getter-keyed so it re-reads on project switch
(mirrors `useSavedViews`). Maps **grouping key → ordered array of group keys**:

- `status` → status ids
- `assignee` → usernames
- `label:<scope>` → label values
- `priority` → priority levels
- `'__none'` is included like any other key.

API:

- `orderFor(key: string): string[]` — the stored order for a dimension, or `[]`.
- `setOrder(key: string, keys: string[]): void` — persist a full key sequence.
- `reset(key: string): void` — drop the custom order for a dimension.

`useLocalStorage` already swallows storage failures, so degradation is silent.

### 2. `applyOrder(groups, order)` — pure reorder pass (new, in `issueView.ts`)

```ts
export function applyOrder(groups: IssueGroup[], order: readonly string[]): IssueGroup[]
```

Stable reordering:

- Groups whose `key` appears in `order` come first, in `order`'s sequence.
- Groups **not** in `order` keep their default relative order and append after.
- A key in `order` with no matching group is ignored.

Consequences (all desired): a newly-introduced status/label column appears at the
end (after custom-ordered ones); a deleted column's stale key is harmless; no
special-casing of `'__none'`. Pure and unit-tested.

### 3. Wiring in `IssueList.vue`

```ts
const { orderFor, setOrder, reset } = useGroupOrder(toRef(props, 'fullPath'))

const listGroups = computed(() =>
  applyOrder(groupIssues(sorted.value, groupKey.value), orderFor(groupKey.value)),
)
const boardGroups = computed(() =>
  applyOrder(
    boardColumns(sorted.value, boardScope.value, { labelCatalog, statusCatalog }),
    orderFor(boardScope.value),
  ),
)
```

### 4. `useGroupReorder(store)` — reorder interaction (new composable)

`src/features/issues/composables/useGroupReorder.ts`

Native HTML5 drag started from the header grip. Uses a custom dataTransfer type
`application/x-lumen-group` to stay distinct from card drags. Tracks `dragKey`
and `overKey` refs for the drop-indicator highlight.

On drop: take the currently-displayed key sequence (passed in from the rendered
groups), move `dragKey` to `overKey`'s slot, and persist the full new sequence
via `store.setOrder(dimensionKey, nextKeys)`.

Exposes: `dragKey`, `overKey`, `onReorderStart(key, e)`, `onReorderOver(key)`,
`onReorderDrop(dimensionKey, displayedKeys)`, `clearReorder()`,
`isReorderTarget(key)`.

**No collision with card DnD:** the board section's existing `@drop`→`onDrop`
and `isDropTarget` both early-return when `dragging.value` (a card in hand) is
null, so they already no-op during a column drag. The header grip lives outside
the draggable card `<div>`s, so a grip dragstart never starts a card drag.

### 5. Component changes

- `IssueListGroups.vue`: add a `GripVertical` handle to each `<header>` (hidden
  for `groupKey === 'none'` and when there's a single group). Wire
  `dragstart`/`dragover`/`drop` to emit a `reorder` event (vertical). Wrap the
  `v-for` sections in `<TransitionGroup>` for a FLIP move.
- `IssueBoard.vue`: add a grip to each column `<header>` (hidden when a single
  column). Wire the same reorder emits (horizontal). Wrap the columns track in
  `<TransitionGroup>`. The grip must not interfere with the column's existing
  card `@dragover`/`@drop`.
- `IssueList.vue`: handle the `reorder` events from both components by calling
  `useGroupReorder`'s drop with the active dimension key (`groupKey` for list,
  `boardScope` for board) and the displayed key list.

### 6. Reset affordance

Surface `reset(key)` as a subtle "Reset order" item, shown only when a custom
order exists for the active dimension. Lives in the existing grouping dropdown in
`IssueListToolbar.vue`.

### 7. Motion

Wrap the group/column lists in `<TransitionGroup>` with a `move` transition so a
reorder animates into place rather than hard-cutting — consistent with the
view-transition motion already used for list⇄board.

## Edge cases

- Single or empty group set → grip hidden (nothing to reorder).
- Grouping `'none'` → no grips (one combined group).
- New columns append after custom-ordered ones, in default order.
- Stale keys in stored order are ignored.
- Storage unavailable → falls back to default order silently.
- Project switch re-keys the store (getter key), so each project keeps its own
  arrangement.

## Testing

- **`applyOrder`** (in `issueView.test.ts`): respects the given order; appends
  groups absent from the order after, preserving default relative order; ignores
  order keys with no matching group; stable for an empty order.
- **`useGroupOrder`**: round-trips `setOrder`/`orderFor`; `reset` clears one
  dimension without touching others; isolates by project path.
- **`useGroupReorder`**: drop math produces the correct new key sequence
  (drag-before, drag-after, no-op onto self).
- **Component**: a header-grip drop in `IssueListGroups` / `IssueBoard` emits the
  expected reorder payload; grip is hidden for `'none'` / single-group cases.

## Out of scope

- Persisting order to GitLab (no API; intentionally local).
- Reordering within a group (card order) — already handled by sort + existing
  board DnD.
- Capturing order in Saved Views.
