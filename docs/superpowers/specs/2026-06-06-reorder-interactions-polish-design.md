# Reorder interactions & ghost polish

## Problem

Drag-reorder of issue list groups and board columns shipped, but the interaction
is rough:

- The drag ghost is the browser's **default** drag image — effectively the tiny
  grip icon floating. (Card DnD, by contrast, builds a bespoke "in-hand" pill.)
- The drop indicator is just a `ring` around the hovered **header** — it doesn't
  show *where* the column lands (before/after), and only the header band is a
  drop target, not the column.
- Only the dragged header dims (`opacity-50`); the column body stays fully
  opaque. No lift, no drop settle.
- It runs on native HTML5 DnD, which structurally caps ghost/indicator quality
  (a static drag image, no live insertion line, no edge auto-scroll).

We want a Linear/Notion-class reorder: a chip that follows the cursor, a live
insertion bar, whole-column lift, a drop settle, and edge auto-scroll.

## Decisions (from brainstorming)

- **Drop indicator:** a bright **insertion bar** in the gap where the item lands
  — vertical bar for board columns, horizontal line for list groups.
- **Ghost:** a **rich chip** following the cursor — color dot, label, issue
  count.
- **Extras (all in):** lift & dim the whole dragged column/group; drop settle
  animation; edge auto-scroll on the board; hover-reveal grips. All motion
  respects `prefers-reduced-motion`.
- **Mechanism:** **pointer events** (not native DnD, not a library). Native DnD
  cannot deliver a cursor-following custom ghost, a flicker-free live insertion
  bar, or edge auto-scroll. Only the *reorder* interaction changes; **card
  drag-and-drop stays native and untouched**.
- **Out of scope:** full keyboard-driven reorder (arrow keys). Grips remain
  focusable with aria labels; true keyboard reordering is a separate effort.

## Constraints & reuse

- Persistence is unchanged: `useGroupOrder` (per-project localStorage store) and
  `applyOrder` (pure ordering pass) stay as-is. Only how a new order is computed
  on drop changes.
- The codebase hand-rolls DnD (see `useIssueBoardDnd.ts`'s custom drag ghost) and
  avoids DnD libraries — pointer events fit that grain.
- The reorder is a self-contained, low-frequency interaction, so a bespoke
  pointer handler is well-bounded.

## Architecture

### 1. `useGroupReorder` — rewritten, pointer-based

`src/features/issues/composables/useGroupReorder.ts` (rewrite)

Presentation-free: owns drag state, geometry, and lifecycle only. No DOM
rendering — the components render the ghost and bar from their own data.

Reactive state (returned):

- `activeKey: Ref<string | null>` — the group/column being dragged (null = idle).
- `insertIndex: Ref<number | null>` — the index in the displayed order where the
  item will land (in the array **with the dragged item removed**; `0..len-1`).
- `pointer: Ref<{ x: number; y: number } | null>` — current cursor position, for
  positioning the chip.
- `barOffset: Ref<number | null>` — pixel offset of the insertion bar along the
  axis, **relative to the container's content box** (the component adds it as
  `left` for board / `top` for list, inside the scrolled track).
- `justReordered: Ref<string | null>` — the key that just landed, for the settle
  animation (cleared on a timer).

Method:

- `start(key: string, e: PointerEvent, ctx: ReorderContext): void`
  - `ReorderContext = { container: HTMLElement; axis: 'x' | 'y'; dimension: string; keys: string[] }`
  - Sets `activeKey`, captures the starting pointer, reads item rects from
    `container` (see geometry), and attaches `pointermove` / `pointerup` /
    `pointercancel` / `keydown` (Escape) listeners on `window`, plus starts the
    auto-scroll rAF loop.
  - `pointermove`: update `pointer`; recompute `{ index, barOffset }` via
    `insertionIndexFor`; update auto-scroll intent from cursor proximity to the
    container edges.
  - `pointerup`: if `insertIndex` is a real move, commit
    `store.setOrder(dimension, reorderToIndex(keys, activeKey, insertIndex))`,
    set `justReordered`, then clean up. A no-op (same position) just cleans up.
  - `keydown` Escape / `pointercancel`: clean up without committing.
  - Cleanup removes all listeners, stops the rAF loop, and nulls
    `activeKey`/`insertIndex`/`pointer`/`barOffset`.

The store dependency keeps its minimal shape: `interface OrderStore { setOrder(dimension: string, keys: string[]): void }`.

Items are discovered by a `data-reorder-key` attribute on each column/group
element inside `container`, so the composable never holds Vue refs:
`container.querySelectorAll('[data-reorder-key]')`, reading each element's
`getBoundingClientRect()` and its `data-reorder-key`.

### 2. `reorderGeometry.ts` — pure geometry (new, tested)

`src/features/issues/lib/reorderGeometry.ts`

```ts
export interface ReorderItemRect { key: string; rect: DOMRect }

export function insertionIndexFor(
  items: readonly ReorderItemRect[],
  pointer: { x: number; y: number },
  axis: 'x' | 'y',
  draggedKey: string,
  container: { rect: DOMRect; scroll: number },
): { index: number; barOffset: number }
```

- Picks the coordinate (`pointer.x` for `'x'`, `pointer.y` for `'y'`).
- `index` = number of non-dragged items whose midpoint along the axis is before
  the cursor — i.e. where the dragged item lands once removed (`0..len-1`).
- `barOffset` = the gap's pixel position relative to the container content box:
  derived from the neighbouring item edges and `container.scroll` so the bar sits
  correctly even when the track is scrolled.
- Pure: all inputs are plain data, so it unit-tests with synthetic `DOMRect`s on
  both axes (cursor before first, between, after last, near the dragged item).

### 3. `reorderToIndex` — pure commit helper (new, in `issueView.ts`)

```ts
export function reorderToIndex(
  keys: readonly string[],
  key: string,
  index: number,
): string[]
```

Removes `key`, clamps `index` to `0..len-1`, inserts `key` there, returns a fresh
array. Replaces the old over-key-based `reorderKeys`, which is **removed** along
with its tests (the pointer flow is index-based; `reorderKeys` has no remaining
caller).

### 4. `ReorderGhost.vue` — the chip (new, shared)

`src/features/issues/components/ReorderGhost.vue`

- `<Teleport to="body">` a `position: fixed`, `pointer-events-none` chip.
- Props: `label: string`, `color?: string`, `count: number`, `x: number`,
  `y: number`.
- Themed with the same tokens as the card drag-ghost (card surface, primary-tint
  ring, soft shadow). A color dot (when `color`), the label, and a muted count.
- Positioned at `translate(x, y)` with a small cursor offset; hidden when not
  mounted (the parent `v-if`s it on `activeKey`).
- Respects `prefers-reduced-motion` (no entrance scale when reduced).

### 5. Insertion bar (inline per component)

A themed bar absolutely positioned inside the track at `barOffset`:

- Board: a full column-height vertical bar (`w-0.5`, primary, soft glow) at
  `left: barOffset`.
- List: a full-width horizontal line at `top: barOffset`.

Inlined in each component (orientation and sizing differ; few lines each), shown
only while `activeKey` is set and `barOffset != null`.

### 6. Component changes

**`IssueBoard.vue`** (axis `'x'`):

- Add a `ref` to the columns track (`reorderContainer`); pass it as
  `ctx.container`.
- Each `<section>` gets `:data-reorder-key="g.key"`.
- Grip: replace `draggable` + `@dragstart`/`@dragend` with
  `@pointerdown.prevent="onGripDown(g.key, $event)"`, `touch-action: none`.
  `onGripDown` calls `reorder.start(g.key, e, { container, axis: 'x', dimension, keys })`.
- Lift/dim the source `<section>` when `activeKey === g.key`
  (`opacity` + `scale-[.98]`).
- Settle class on the landed `<section>` when `justReordered === g.key`.
- Hover-reveal grips: grip hidden at rest, shown on `group-hover` of the header
  and whenever `activeKey` is non-null.
- Render the insertion bar (vertical) and `<ReorderGhost>` (from the group whose
  key is `activeKey`).
- Existing card DnD on the column body is **untouched**.

**`IssueListGroups.vue`** (axis `'y'`): the same, with a horizontal insertion
line and the groups wrapper as the container. The `<TransitionGroup>` FLIP move
stays.

**`IssueList.vue`**: wiring keeps its shape. It passes the new state down
(`activeKey`, `insertIndex`, `pointer`, `barOffset`, `justReordered`) and the
`start` entry point. The `dimension` for the active view is unchanged
(`groupKey` for list, `boardScope` for board). The reorder for board vs list is
distinguished by which view is mounted, as today.

### 7. Auto-scroll

In the composable's rAF loop: when `pointer` is within ~48px of the container's
left/right edge (board) — or top/bottom (list, if it ever scrolls) — scroll the
container by a small per-frame step scaled by proximity. Stops when the cursor
leaves the edge zone or the drag ends. The board container is the existing
`overflow-x-auto` wrapper.

## Edge cases

- Single/empty group set → grip hidden (`reorderable()` unchanged), `start`
  never fires.
- Grouping `'none'` → no grips.
- Dropping at the same position → no `setOrder` call (no-op commit).
- Escape / pointercancel mid-drag → abort, no order change, full cleanup.
- New columns appended by `applyOrder` still land after custom order (unchanged).
- Reduced motion → lift/settle/ghost entrance animations are suppressed; the
  reorder still works.
- Pointer released outside any item → `insertIndex` is still computed from the
  nearest gap; if it equals the current position it's a no-op.

## Testing

- **`reorderToIndex`** (in `issueView.test.ts`): move forward, move backward,
  to-start, to-end, clamp out-of-range, no-op same index, returns fresh array.
- **`insertionIndexFor`** (`reorderGeometry.test.ts`): synthetic rects on both
  axes — cursor before first item, between two, after last, hovering the dragged
  item's own slot; correct `index` and a plausible `barOffset`; respects
  `container.scroll`.
- **`useGroupReorder`** (`useGroupReorder.test.ts`, rewritten): with
  `insertionIndexFor` stubbed and a fake container, simulate
  `start`→`pointermove`→`pointerup` and assert `setOrder` is called with
  `reorderToIndex(...)` output; `activeKey` lifecycle (set on start, null after
  end); Escape and `pointercancel` abort without `setOrder`; same-index drop is a
  no-op.
- **`ReorderGhost.vue`** (`ReorderGhost.test.ts`): renders label/count, shows the
  dot only when `color` is set, applies the `translate` from `x`/`y`.
- **Component** (`IssueBoard.test.ts`, `IssueListGroups.test.ts`, updated): grip
  `pointerdown` invokes `start`; grips hidden for single-group / `'none'`; the
  insertion bar and ghost render only while a drag is active.

## Out of scope

- Keyboard-driven reorder (arrow keys).
- Any change to card drag-and-drop (retag / status / assignee moves).
- Reordering within a group (card order) — already handled by sort.
