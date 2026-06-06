# Reorder Interactions & Ghost Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native-DnD group/column reorder with a pointer-events interaction featuring a cursor-following rich-chip ghost, a live insertion bar, column lift, drop settle, and edge auto-scroll.

**Architecture:** A pure geometry helper turns a cursor position into an insertion index + bar offset; a pure `reorderToIndex` computes the new key order; `useGroupReorder` is rewritten on pointer events to own drag state, geometry, auto-scroll, and commit; a shared `ReorderGhost` chip and an inline insertion bar render in `IssueBoard`/`IssueListGroups`. Persistence (`useGroupOrder`/`applyOrder`) and card drag-and-drop are unchanged.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, pointer events, `@vueuse/core`, Vitest + `@vue/test-utils`. Run tests with `bunx vitest run` (NOT `bun test`).

---

## File Structure

- `src/features/issues/lib/issueView.ts` — add pure `reorderToIndex`; remove the now-dead `reorderKeys` (Tasks 1, 4).
- `src/features/issues/lib/reorderGeometry.ts` — pure `insertionIndexFor` + DOM wrapper `computeInsertion` (Task 2, new).
- `src/features/issues/components/ReorderGhost.vue` — teleported cursor chip (Task 3, new).
- `src/features/issues/composables/useGroupReorder.ts` — rewritten pointer-based (Task 4).
- `src/views/IssueList.vue` — wire the new composable API down to the views (Task 5).
- `src/features/issues/components/IssueBoard.vue` — pointer grips, ghost, vertical bar, lift/settle/hover (Task 6).
- `src/features/issues/components/IssueListGroups.vue` — pointer grips, ghost, horizontal bar, lift/settle/hover (Task 7).
- Tests alongside each.

**Mid-plan typecheck note:** After Task 4 the composable's public API changes; `IssueList.vue` and the two view components are updated in Tasks 5–7. Between those tasks `bun run typecheck` will show errors in the not-yet-updated files and the views will pass unknown props (Vue warnings, not failures). This is expected; the **test suites stay green** at every task (verify per task). Pre-existing typecheck errors in untouched files (`useIssueBoardDnd.ts`, `useIssueSavedViews.ts`, `StatusPicker.vue`, `PipelineRow.vue`) are unrelated — ignore them.

---

### Task 1: `reorderToIndex` pure helper

**Files:**
- Modify: `src/features/issues/lib/issueView.ts`
- Test: `src/features/issues/lib/issueView.test.ts`

This is additive — `reorderKeys` stays for now (the old composable still imports it); Task 4 removes it.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/issues/lib/issueView.test.ts`:

```ts
import { reorderToIndex } from './issueView'

describe('reorderToIndex', () => {
  it('moves a key forward to a later index', () => {
    expect(reorderToIndex(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a key backward to an earlier index', () => {
    expect(reorderToIndex(['a', 'b', 'c', 'd'], 'd', 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves a key to the start', () => {
    expect(reorderToIndex(['a', 'b', 'c', 'd'], 'c', 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves a key to the end', () => {
    expect(reorderToIndex(['a', 'b', 'c', 'd'], 'a', 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('clamps an out-of-range index to the end', () => {
    expect(reorderToIndex(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a'])
  })

  it('is a no-op when the index matches the current position', () => {
    expect(reorderToIndex(['a', 'b', 'c', 'd'], 'b', 1)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns a fresh array', () => {
    const keys = ['a', 'b', 'c']
    expect(reorderToIndex(keys, 'a', 1)).not.toBe(keys)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/issues/lib/issueView.test.ts`
Expected: FAIL — `reorderToIndex is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/features/issues/lib/issueView.ts`, add right after the existing `reorderKeys` function:

```ts
/**
 * Move `key` to `index` within `keys` (index is in the array with `key`
 * removed; clamped to a valid slot). Used by the pointer-driven reorder, which
 * thinks in terms of a landing index rather than an over-key. Pure — returns a
 * fresh array.
 */
export function reorderToIndex(keys: readonly string[], key: string, index: number): string[] {
  const without = keys.filter((k) => k !== key)
  const clamped = Math.max(0, Math.min(index, without.length))
  without.splice(clamped, 0, key)
  return without
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/issues/lib/issueView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/lib/issueView.ts src/features/issues/lib/issueView.test.ts
git commit -m "feat(issues): add reorderToIndex pure helper"
```

---

### Task 2: `reorderGeometry` — insertion math

**Files:**
- Create: `src/features/issues/lib/reorderGeometry.ts`
- Test: `src/features/issues/lib/reorderGeometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/issues/lib/reorderGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { insertionIndexFor, type ReorderItemRect } from './reorderGeometry'

// Three 100px-wide items at x=[0,100],[110,210],[220,320]; midpoints 50/160/270.
const rect = (left: number, width: number): DOMRect =>
  ({ left, right: left + width, top: 0, bottom: 100, width, height: 100, x: left, y: 0 }) as DOMRect
const itemsX: ReorderItemRect[] = [
  { key: 'a', rect: rect(0, 100) },
  { key: 'b', rect: rect(110, 100) },
  { key: 'c', rect: rect(220, 100) },
]
const container = { rect: rect(0, 320), scroll: 0 }

describe('insertionIndexFor (x axis)', () => {
  it('drops at the end when the cursor is past the last midpoint', () => {
    const r = insertionIndexFor(itemsX, { x: 300, y: 50 }, 'x', 'a', container)
    expect(r.index).toBe(2)
    expect(r.isNoOp).toBe(false)
    expect(r.barOffset).toBeCloseTo(320)
  })

  it('drops between two items', () => {
    const r = insertionIndexFor(itemsX, { x: 165, y: 50 }, 'x', 'a', container)
    expect(r.index).toBe(1)
    expect(r.isNoOp).toBe(false)
    expect(r.barOffset).toBeCloseTo(215)
  })

  it('flags a no-op when dropping the item onto its own slot', () => {
    const before = insertionIndexFor(itemsX, { x: 40, y: 50 }, 'x', 'a', container)
    expect(before.isNoOp).toBe(true)
    const after = insertionIndexFor(itemsX, { x: 80, y: 50 }, 'x', 'a', container)
    expect(after.isNoOp).toBe(true)
  })

  it('computes index relative to the dragged item being removed', () => {
    const r = insertionIndexFor(itemsX, { x: 40, y: 50 }, 'x', 'b', container)
    expect(r.index).toBe(0)
    expect(r.isNoOp).toBe(false)
  })

  it('adds container scroll to the bar offset', () => {
    const r = insertionIndexFor(itemsX, { x: 165, y: 50 }, 'x', 'a', { rect: rect(0, 320), scroll: 30 })
    expect(r.barOffset).toBeCloseTo(245)
  })
})

// Vertical variant: stack three 40px-tall rows at y=[0,40],[50,90],[100,140].
const rectY = (top: number, height: number): DOMRect =>
  ({ left: 0, right: 200, top, bottom: top + height, width: 200, height, x: 0, y: top }) as DOMRect
const itemsY: ReorderItemRect[] = [
  { key: 'a', rect: rectY(0, 40) },
  { key: 'b', rect: rectY(50, 40) },
  { key: 'c', rect: rectY(100, 40) },
]
const containerY = { rect: rectY(0, 140), scroll: 0 }

describe('insertionIndexFor (y axis)', () => {
  it('drops between rows by vertical midpoint', () => {
    // midpoints 20/70/120; cursor at 75 is past a(20) and b(70) → gap 2
    const r = insertionIndexFor(itemsY, { x: 10, y: 75 }, 'y', 'a', containerY)
    expect(r.index).toBe(1)
    expect(r.isNoOp).toBe(false)
    expect(r.barOffset).toBeCloseTo(95) // between b.bottom(90) and c.top(100)
  })

  it('drops at the top', () => {
    const r = insertionIndexFor(itemsY, { x: 10, y: 5 }, 'y', 'c', containerY)
    expect(r.index).toBe(0)
    expect(r.barOffset).toBeCloseTo(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/issues/lib/reorderGeometry.test.ts`
Expected: FAIL — cannot find module `./reorderGeometry`.

- [ ] **Step 3: Implement the geometry**

Create `src/features/issues/lib/reorderGeometry.ts`:

```ts
// Pure geometry for pointer-driven group/column reordering, plus a thin DOM
// wrapper. The pure function turns a cursor position + item rects into the
// landing index, the insertion-bar offset (in container content coordinates),
// and whether the drop would change nothing.

export interface ReorderItemRect {
  key: string
  rect: DOMRect
}

export interface InsertionResult {
  /** Landing index in the key array with the dragged key removed (0..len-1). */
  index: number
  /** Insertion-bar offset along the axis, in container content coords (px). */
  barOffset: number
  /** True when the drop lands the item back in its current position. */
  isNoOp: boolean
}

/**
 * Compute the insertion for dragging `draggedKey` to `pointer` among `items`
 * (in DOM order, including the dragged item). `axis` is 'x' for the board's
 * horizontal columns, 'y' for the list's stacked groups. `container.scroll` is
 * the scroll offset along the axis, added so the bar tracks scrolled content.
 */
export function insertionIndexFor(
  items: readonly ReorderItemRect[],
  pointer: { x: number; y: number },
  axis: 'x' | 'y',
  draggedKey: string,
  container: { rect: DOMRect; scroll: number },
): InsertionResult {
  const lead = (r: DOMRect) => (axis === 'x' ? r.left : r.top)
  const trail = (r: DOMRect) => (axis === 'x' ? r.right : r.bottom)
  const mid = (r: DOMRect) => (lead(r) + trail(r)) / 2
  const cursor = axis === 'x' ? pointer.x : pointer.y
  const origin = axis === 'x' ? container.rect.left : container.rect.top

  // gap = how many items sit (by midpoint) before the cursor, in the rendered
  // layout (dragged item included).
  let gap = 0
  for (const it of items) if (mid(it.rect) < cursor) gap++

  const draggedIndex = items.findIndex((it) => it.key === draggedKey)
  const index = gap > draggedIndex ? gap - 1 : gap
  const isNoOp = gap === draggedIndex || gap === draggedIndex + 1

  // Bar sits at the leading edge of the gap: before the first item, after the
  // last, else midway between the neighbouring item edges.
  let pos: number
  if (gap <= 0) pos = lead(items[0].rect)
  else if (gap >= items.length) pos = trail(items[items.length - 1].rect)
  else pos = (trail(items[gap - 1].rect) + lead(items[gap].rect)) / 2

  return { index, barOffset: pos - origin + container.scroll, isNoOp }
}

/** Read item rects + container box from the DOM and compute the insertion. */
export function computeInsertion(
  container: HTMLElement,
  pointer: { x: number; y: number },
  axis: 'x' | 'y',
  draggedKey: string,
): InsertionResult {
  const items: ReorderItemRect[] = Array.from(
    container.querySelectorAll<HTMLElement>('[data-reorder-key]'),
  ).map((el) => ({ key: el.dataset.reorderKey ?? '', rect: el.getBoundingClientRect() }))
  const scroll = axis === 'x' ? container.scrollLeft : container.scrollTop
  return insertionIndexFor(items, pointer, axis, draggedKey, {
    rect: container.getBoundingClientRect(),
    scroll,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/issues/lib/reorderGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/lib/reorderGeometry.ts src/features/issues/lib/reorderGeometry.test.ts
git commit -m "feat(issues): add reorder insertion geometry"
```

---

### Task 3: `ReorderGhost.vue` — cursor chip

**Files:**
- Create: `src/features/issues/components/ReorderGhost.vue`
- Test: `src/features/issues/components/ReorderGhost.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/components/ReorderGhost.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ReorderGhost from './ReorderGhost.vue'

afterEach(() => {
  document.querySelectorAll('[data-testid="reorder-ghost"]').forEach((n) => n.remove())
})

const ghost = () => document.body.querySelector('[data-testid="reorder-ghost"]') as HTMLElement | null

describe('ReorderGhost', () => {
  it('renders the label and count, teleported to body', () => {
    const wrapper = mount(ReorderGhost, {
      props: { label: 'Doing', color: '#3b82f6', count: 12, x: 40, y: 60 },
      attachTo: document.body,
    })
    const el = ghost()
    expect(el?.textContent).toContain('Doing')
    expect(el?.textContent).toContain('12')
    wrapper.unmount()
  })

  it('positions itself at the cursor with an offset', () => {
    const wrapper = mount(ReorderGhost, {
      props: { label: 'X', color: null, count: 0, x: 100, y: 200 },
      attachTo: document.body,
    })
    expect(ghost()?.style.transform).toContain('translate(112px, 214px)')
    wrapper.unmount()
  })

  it('omits the color dot when no color is given', () => {
    const wrapper = mount(ReorderGhost, {
      props: { label: 'X', color: null, count: 0, x: 0, y: 0 },
      attachTo: document.body,
    })
    expect(ghost()?.querySelector('[data-testid="ghost-dot"]')).toBeNull()
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/components/ReorderGhost.test.ts`
Expected: FAIL — cannot find module `./ReorderGhost.vue`.

- [ ] **Step 3: Implement the component**

Create `src/features/issues/components/ReorderGhost.vue`:

```vue
<script setup lang="ts">
defineProps<{
  label: string
  color?: string | null
  count: number
  x: number
  y: number
}>()
</script>

<template>
  <Teleport to="body">
    <div
      data-testid="reorder-ghost"
      aria-hidden="true"
      class="reorder-ghost pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-2 rounded-lg border border-primary/55 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-pop"
      :style="{ transform: `translate(${x + 12}px, ${y + 14}px)` }"
    >
      <span
        v-if="color"
        data-testid="ghost-dot"
        class="size-2 shrink-0 rounded-full"
        :style="{ backgroundColor: color }"
      />
      <span class="max-w-44 truncate">{{ label }}</span>
      <span
        class="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-muted-foreground/80"
      >
        {{ count }}
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
.reorder-ghost {
  animation: reorder-ghost-in 120ms ease-out;
}
@keyframes reorder-ghost-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reorder-ghost {
    animation: none;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/components/ReorderGhost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/components/ReorderGhost.vue src/features/issues/components/ReorderGhost.test.ts
git commit -m "feat(issues): add ReorderGhost cursor chip"
```

---

### Task 4: Rewrite `useGroupReorder` (pointer-based)

**Files:**
- Modify (rewrite): `src/features/issues/composables/useGroupReorder.ts`
- Modify (rewrite test): `src/features/issues/composables/useGroupReorder.test.ts`
- Modify: `src/features/issues/lib/issueView.ts` (remove dead `reorderKeys`)
- Modify: `src/features/issues/lib/issueView.test.ts` (remove `reorderKeys` tests)

After this task the old `reorderKeys` has no caller, so it and its tests are removed.

- [ ] **Step 1: Rewrite the test**

Replace the ENTIRE contents of `src/features/issues/composables/useGroupReorder.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useGroupReorder } from './useGroupReorder'
import { computeInsertion } from '@/features/issues/lib/reorderGeometry'

vi.mock('@/features/issues/lib/reorderGeometry', () => ({
  computeInsertion: vi.fn(() => ({ index: 2, barOffset: 100, isNoOp: false })),
}))
const mockedCompute = vi.mocked(computeInsertion)

beforeEach(() => {
  mockedCompute.mockReturnValue({ index: 2, barOffset: 100, isNoOp: false })
  // jsdom has no rAF by default; make it a no-op so the auto-scroll loop never runs.
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

// A fake container; geometry is mocked, so only getBoundingClientRect is read
// (by the auto-scroll proximity check).
const container = {
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 300 }) as DOMRect,
  scrollLeft: 0,
  scrollTop: 0,
} as unknown as HTMLElement

const ctx = (keys: string[]) => ({ container, axis: 'x' as const, dimension: 'status', keys })
const move = (x = 50, y = 50) =>
  window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y }))
const up = () => window.dispatchEvent(new Event('pointerup'))
const down = () => Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10 }) as unknown as PointerEvent

describe('useGroupReorder', () => {
  it('sets activeKey on start and clears it after drop', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c', 'd']))
    expect(r.activeKey.value).toBe('a')
    move()
    up()
    expect(r.activeKey.value).toBeNull()
  })

  it('commits the reordered keys on drop', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c', 'd']))
    move()
    up()
    // computeInsertion → index 2; reorderToIndex(['a','b','c','d'],'a',2) = ['b','c','a','d']
    expect(store.setOrder).toHaveBeenCalledWith('status', ['b', 'c', 'a', 'd'])
    expect(r.justReordered.value).toBe('a')
  })

  it('does not commit a no-op drop', () => {
    mockedCompute.mockReturnValue({ index: 0, barOffset: 0, isNoOp: true })
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    move()
    up()
    expect(store.setOrder).not.toHaveBeenCalled()
    expect(r.activeKey.value).toBeNull()
  })

  it('aborts on Escape without committing', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    move()
    window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
    expect(store.setOrder).not.toHaveBeenCalled()
    expect(r.activeKey.value).toBeNull()
    // A late pointerup must not commit either.
    up()
    expect(store.setOrder).not.toHaveBeenCalled()
  })

  it('aborts on pointercancel', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    window.dispatchEvent(new Event('pointercancel'))
    expect(r.activeKey.value).toBeNull()
    expect(store.setOrder).not.toHaveBeenCalled()
  })

  it('tracks the cursor and bar offset on move', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    move(123, 45)
    expect(r.pointer.value).toEqual({ x: 123, y: 45 })
    expect(r.barOffset.value).toBe(100)
    expect(r.insertIndex.value).toBe(2)
    up()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/composables/useGroupReorder.test.ts`
Expected: FAIL — the current composable has no `start`/`activeKey`/`pointer`.

- [ ] **Step 3: Rewrite the composable**

Replace the ENTIRE contents of `src/features/issues/composables/useGroupReorder.ts` with:

```ts
import { onUnmounted, ref } from 'vue'
import { reorderToIndex } from '@/features/issues/lib/issueView'
import { computeInsertion } from '@/features/issues/lib/reorderGeometry'

interface OrderStore {
  setOrder: (dimension: string, keys: string[]) => void
}

export interface ReorderContext {
  container: HTMLElement
  axis: 'x' | 'y'
  dimension: string
  keys: string[]
}

// Cursor distance from a container edge that triggers auto-scroll, and the max
// per-frame scroll step.
const EDGE = 48
const MAX_STEP = 18

/**
 * Pointer-driven reordering of list groups / board columns. Owns drag state,
 * geometry, edge auto-scroll, and commit; renders nothing — the components draw
 * the ghost chip and insertion bar from this state. Card drag-and-drop is a
 * separate, native interaction and is unaffected.
 */
export function useGroupReorder(store: OrderStore) {
  const activeKey = ref<string | null>(null)
  const insertIndex = ref<number | null>(null)
  const pointer = ref<{ x: number; y: number } | null>(null)
  const barOffset = ref<number | null>(null)
  const justReordered = ref<string | null>(null)

  let ctx: ReorderContext | null = null
  let isNoOp = true
  let raf = 0
  let scrollDir = 0
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  function recompute() {
    if (!ctx || !pointer.value || !activeKey.value) return
    const r = computeInsertion(ctx.container, pointer.value, ctx.axis, activeKey.value)
    insertIndex.value = r.index
    barOffset.value = r.barOffset
    isNoOp = r.isNoOp
  }

  function onMove(e: PointerEvent) {
    if (!ctx) return
    pointer.value = { x: e.clientX, y: e.clientY }
    recompute()
    const box = ctx.container.getBoundingClientRect()
    const c = ctx.axis === 'x' ? e.clientX : e.clientY
    const lo = (ctx.axis === 'x' ? box.left : box.top) + EDGE
    const hi = (ctx.axis === 'x' ? box.right : box.bottom) - EDGE
    scrollDir = c < lo ? -1 : c > hi ? 1 : 0
  }

  function tick() {
    if (ctx && scrollDir !== 0) {
      if (ctx.axis === 'x') ctx.container.scrollLeft += scrollDir * MAX_STEP
      else ctx.container.scrollTop += scrollDir * MAX_STEP
      recompute()
    }
    raf = requestAnimationFrame(tick)
  }

  function onUp() {
    const c = ctx
    const key = activeKey.value
    const idx = insertIndex.value
    const noop = isNoOp
    cleanup()
    if (!c || !key || idx == null || noop) return
    store.setOrder(c.dimension, reorderToIndex(c.keys, key, idx))
    justReordered.value = key
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => (justReordered.value = null), 400)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') cleanup()
  }

  function cleanup() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cleanup)
    window.removeEventListener('keydown', onKey)
    cancelAnimationFrame(raf)
    raf = 0
    scrollDir = 0
    ctx = null
    isNoOp = true
    activeKey.value = null
    insertIndex.value = null
    pointer.value = null
    barOffset.value = null
  }

  function start(key: string, e: PointerEvent, context: ReorderContext) {
    if (activeKey.value) return
    ctx = context
    activeKey.value = key
    pointer.value = { x: e.clientX, y: e.clientY }
    isNoOp = true
    insertIndex.value = null
    barOffset.value = null
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('keydown', onKey)
    raf = requestAnimationFrame(tick)
  }

  onUnmounted(() => {
    cleanup()
    clearTimeout(settleTimer)
  })

  return { activeKey, insertIndex, pointer, barOffset, justReordered, start }
}
```

- [ ] **Step 4: Run the composable test**

Run: `bunx vitest run src/features/issues/composables/useGroupReorder.test.ts`
Expected: PASS.

- [ ] **Step 5: Remove the dead `reorderKeys`**

In `src/features/issues/lib/issueView.ts`, delete the entire `reorderKeys` function (the one with the JSDoc "Compute the new key sequence after dragging `dragKey` onto `overKey`…"). Leave `reorderToIndex` and `applyOrder` in place.

In `src/features/issues/lib/issueView.test.ts`, delete the whole `describe('reorderKeys', …)` block and remove `reorderKeys` from the import (keep `applyOrder`, `reorderToIndex`).

- [ ] **Step 6: Verify the lib + composable suites are green**

Run: `bunx vitest run src/features/issues/lib/issueView.test.ts src/features/issues/composables/useGroupReorder.test.ts`
Expected: PASS (no reference to `reorderKeys` remains).

- [ ] **Step 7: Commit**

```bash
git add src/features/issues/composables/useGroupReorder.ts src/features/issues/composables/useGroupReorder.test.ts src/features/issues/lib/issueView.ts src/features/issues/lib/issueView.test.ts
git commit -m "feat(issues): rewrite useGroupReorder on pointer events; drop reorderKeys"
```

---

### Task 5: Wire the new API into `IssueList.vue`

**Files:**
- Modify: `src/views/IssueList.vue`

The view owns the composable instance and passes its state + the `start` entry point down to whichever view is mounted. Card DnD wiring is untouched.

- [ ] **Step 1: Update the composable destructure**

In `src/views/IssueList.vue`, replace the reorder destructure block (the one reading `dragKey: reorderDragKey, overKey: reorderOverKey, onReorderStart, onReorderOver, onReorderDrop, clearReorder` from `useGroupReorder`) with:

```ts
// --- drag to reorder groups / columns (pointer-driven) ----------------------
const { activeKey, insertIndex, pointer, barOffset, justReordered, start } = useGroupReorder({
  setOrder,
})

// The grouping dimension the active view arranges (list groups vs board cols).
const activeDimension = computed(() => (view.value === 'list' ? groupKey.value : boardScope.value))
const hasCustomOrder = computed(() => hasOrder(activeDimension.value))
const resetOrder = () => reset(activeDimension.value)
```

(If `activeDimension`/`hasCustomOrder`/`resetOrder` already exist immediately below the old block, keep a single copy — do not duplicate them.)

- [ ] **Step 2: Update the `<IssueListGroups>` bindings**

Replace the reorder-related attributes on `<IssueListGroups …>` (the old `:reorder-drag-key`, `:reorder-over-key`, `@reorder-start`, `@reorder-over`, `@reorder-drop`, `@reorder-end`) with:

```html
          :active-key="activeKey"
          :insert-index="insertIndex"
          :bar-offset="barOffset"
          :pointer="pointer"
          :just-reordered="justReordered"
          :dimension="groupKey"
          :start="start"
```

Keep the existing `:groups`, `:group-key`, `:full-path`, `:highlight-iid`, `:vt-name-for`, and `@filter` bindings.

- [ ] **Step 3: Update the `<IssueBoard>` bindings**

Replace the reorder-related attributes on `<IssueBoard …>` (the old `:reorder-drag-key`, `:reorder-over-key`, `@reorder-start`, `@reorder-over`, `@reorder-drop`, `@reorder-end`) with:

```html
          :active-key="activeKey"
          :insert-index="insertIndex"
          :bar-offset="barOffset"
          :pointer="pointer"
          :just-reordered="justReordered"
          :dimension="boardScope"
          :start="start"
```

Keep all existing card-DnD bindings (`@drag-start`, `@drag-end`, `@drop`, `@drag-over`, `:dragging-iid`, `:just-dropped`, `:dragging`, `:is-drop-target`, `:ghost-index`, etc.) unchanged.

- [ ] **Step 4: Verify the view suite stays green**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS. (The child components don't yet declare the new props/`start` — Vue emits fallthrough warnings; that's expected until Tasks 6–7. No test should fail. `bun run typecheck` will be red on the views until Task 7 — do not chase it here.)

- [ ] **Step 5: Commit**

```bash
git add src/views/IssueList.vue
git commit -m "feat(issues): wire pointer reorder state into IssueList"
```

---

### Task 6: Pointer reorder in `IssueBoard.vue`

**Files:**
- Modify (rewrite): `src/features/issues/components/IssueBoard.vue`
- Modify (rewrite test): `src/features/issues/components/IssueBoard.test.ts`

- [ ] **Step 1: Rewrite the test**

Replace the ENTIRE contents of `src/features/issues/components/IssueBoard.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueBoard from './IssueBoard.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const boardGroups: IssueGroup[] = [
  { key: 'todo', label: 'To do', issues: [] },
  { key: 'doing', label: 'Doing', color: '#3b82f6', issues: [] },
]

function makeProps(over: Record<string, unknown> = {}) {
  return {
    boardGroups,
    fullPath: 'grp/proj',
    highlightIid: null,
    selectMode: false,
    draggingIid: null,
    justDropped: null,
    dragging: null,
    vtNameFor: () => undefined,
    isDropTarget: () => false,
    ghostIndex: () => 0,
    activeKey: null,
    insertIndex: null,
    barOffset: null,
    pointer: null,
    justReordered: null,
    dimension: 'status',
    start: vi.fn(),
    ...over,
  }
}
const stubs = { IssueCard: true }

afterEach(() => {
  document.querySelectorAll('[data-testid="reorder-ghost"]').forEach((n) => n.remove())
})

describe('IssueBoard reorder', () => {
  it('starts a reorder on grip pointerdown', async () => {
    const start = vi.fn()
    const wrapper = mount(IssueBoard, {
      props: makeProps({ start }),
      global: { stubs },
      attachTo: document.body,
    })
    const grips = wrapper.findAll('[data-testid="column-grip"]')
    expect(grips).toHaveLength(2)
    await grips[1].trigger('pointerdown')
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toBe('doing')
    expect(start.mock.calls[0][2]).toMatchObject({ axis: 'x', dimension: 'status', keys: ['todo', 'doing'] })
    wrapper.unmount()
  })

  it('hides grips when there is a single column', () => {
    const wrapper = mount(IssueBoard, {
      props: makeProps({ boardGroups: [boardGroups[0]] }),
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="column-grip"]').exists()).toBe(false)
  })

  it('renders the insertion bar and ghost while dragging', () => {
    const wrapper = mount(IssueBoard, {
      props: makeProps({ activeKey: 'doing', insertIndex: 0, barOffset: 120, pointer: { x: 50, y: 60 } }),
      global: { stubs },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-testid="reorder-bar"]').exists()).toBe(true)
    const g = document.body.querySelector('[data-testid="reorder-ghost"]')
    expect(g?.textContent).toContain('Doing')
    wrapper.unmount()
  })

  it('shows no bar when idle', () => {
    const wrapper = mount(IssueBoard, { props: makeProps(), global: { stubs } })
    expect(wrapper.find('[data-testid="reorder-bar"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/components/IssueBoard.test.ts`
Expected: FAIL — grip uses `pointerdown`/`start` and bar/ghost don't exist yet.

- [ ] **Step 3: Rewrite the component**

Replace the ENTIRE contents of `src/features/issues/components/IssueBoard.vue` with:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementBounding } from '@vueuse/core'
import { GripVertical } from '@lucide/vue'
import IssueCard from '@/features/issues/components/IssueCard.vue'
import ReorderGhost from '@/features/issues/components/ReorderGhost.vue'
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import type { IssueGroup, Facet } from '@/features/issues/lib/issueView'
import type { ReorderContext } from '@/features/issues/composables/useGroupReorder'

const props = defineProps<{
  boardGroups: IssueGroup[]
  fullPath: string
  highlightIid: string | null
  selectMode: boolean
  draggingIid: string | null
  justDropped: string | null
  dragging: IssueListItem | null
  vtNameFor: (iid: string) => string | undefined
  isDropTarget: (g: IssueGroup) => boolean
  ghostIndex: (g: IssueGroup) => number
  // reorder (pointer-driven)
  activeKey: string | null
  insertIndex: number | null
  barOffset: number | null
  pointer: { x: number; y: number } | null
  justReordered: string | null
  dimension: string
  start: (key: string, e: PointerEvent, ctx: ReorderContext) => void
}>()
const emit = defineEmits<{
  filter: [f: Facet]
  'drag-start': [issue: IssueListItem, e: DragEvent]
  'drag-end': []
  drop: [g: IssueGroup]
  'drag-over': [key: string]
}>()

const reorderable = () => props.boardGroups.length > 1

// The scroll container doubles as the reorder geometry container: sections carry
// data-reorder-key, and the insertion bar is positioned within it.
const reorderContainer = ref<HTMLElement | null>(null)
function onGripDown(key: string, e: PointerEvent) {
  if (!reorderContainer.value) return
  props.start(key, e, {
    container: reorderContainer.value,
    axis: 'x',
    dimension: props.dimension,
    keys: props.boardGroups.map((g) => g.key),
  })
}
// The column being dragged, for the cursor ghost chip.
const activeGroup = computed(() => props.boardGroups.find((g) => g.key === props.activeKey) ?? null)

// board sizing — owns the sentinel it measures (moved from the view)
const boardTopEl = ref<HTMLElement | null>(null)
const { top: boardTop } = useElementBounding(boardTopEl)
const boardStyle = computed(() => ({
  height: `calc(100dvh - ${Math.max(0, Math.round(boardTop.value))}px)`,
}))
</script>

<template>
  <!-- Board view: full-bleed, bounded height, columns scroll on their own; the
       container is also the reorder geometry/scroll container. -->
  <div
    ref="reorderContainer"
    :style="boardStyle"
    class="relative left-1/2 -mb-6 w-screen -translate-x-1/2 overflow-x-auto pb-4"
  >
    <span ref="boardTopEl" aria-hidden="true" class="absolute top-0 left-0 h-0 w-0" />

    <!-- Insertion bar: a vertical primary bar at the gap where the dragged
         column lands. barOffset is in container content coords, so it scrolls
         with the columns. -->
    <div
      v-if="activeKey && barOffset != null"
      data-testid="reorder-bar"
      aria-hidden="true"
      class="pointer-events-none absolute top-0 bottom-4 z-10 w-0.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
      :style="{ left: `${barOffset}px` }"
    />

    <TransitionGroup tag="div" name="col" class="mx-auto flex h-full min-h-80 w-max gap-3 px-6">
      <section
        v-for="g in boardGroups"
        :key="g.key"
        :data-reorder-key="g.key"
        class="group/col relative flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl ring-1 ring-inset outline outline-offset-2 outline-transparent transition-[background-color,box-shadow,outline-color,transform,opacity] duration-150 motion-reduce:transition-none"
        :class="[
          isDropTarget(g)
            ? 'bg-primary/12 shadow-pop ring-primary/55 outline-primary/45'
            : 'bg-card/55 shadow-card ring-border/70',
          activeKey === g.key ? 'scale-[.98] opacity-50 motion-reduce:scale-100' : '',
          justReordered === g.key ? 'reorder-settle' : '',
        ]"
        @dragover.prevent="emit('drag-over', g.key)"
        @dragenter.prevent="emit('drag-over', g.key)"
        @drop.prevent="emit('drop', g)"
      >
        <span
          v-if="g.color"
          aria-hidden="true"
          class="col-signal"
          :style="{ '--signal-color': g.color }"
        />
        <header class="relative flex shrink-0 items-center gap-2 px-3 pt-3 pb-2.5">
          <span
            v-if="reorderable()"
            data-testid="column-grip"
            aria-label="Reorder column"
            class="-ml-1 touch-none cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
            :class="activeKey ? 'opacity-100' : 'opacity-0 group-hover/col:opacity-100'"
            @pointerdown.prevent="onGripDown(g.key, $event)"
          >
            <GripVertical class="size-3.5" />
          </span>
          <span
            v-if="g.color"
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: g.color, boxShadow: `0 0 0 3px ${g.color}2e` }"
          />
          <h2 class="truncate text-sm font-semibold tracking-tight text-foreground">
            {{ g.label }}
          </h2>
          <span
            class="ml-auto rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-2xs font-medium tabular-nums text-muted-foreground/80"
          >
            {{ g.issues.length }}
          </span>
        </header>
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-2.5">
          <div
            v-for="(issue, i) in g.issues"
            :key="issue.iid"
            :draggable="!selectMode"
            class="group/card transition-opacity"
            :class="[
              selectMode ? '' : 'cursor-grab active:cursor-grabbing',
              draggingIid === issue.iid ? 'opacity-40' : '',
              justDropped === issue.iid ? 'animate-drop-in' : '',
            ]"
            :style="{ order: i * 2, viewTransitionName: vtNameFor(issue.iid) }"
            @dragstart="!selectMode && emit('drag-start', issue, $event)"
            @dragend="emit('drag-end')"
          >
            <IssueCard
              :issue="issue"
              :full-path="fullPath"
              :highlight="issue.iid === highlightIid"
              @filter="emit('filter', $event)"
            >
              <GripVertical
                class="size-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover/card:opacity-100"
              />
            </IssueCard>
          </div>
          <div
            v-if="isDropTarget(g)"
            :style="{ order: ghostIndex(g) * 2 - 1 }"
            class="ghost-card pointer-events-none flex items-start gap-2 rounded-lg border border-dashed border-primary/60 bg-primary/8 px-3 py-2.5"
          >
            <span class="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-primary/90">
                {{ dragging?.title }}
              </span>
              <span class="mt-0.5 block text-2xs text-primary/55">Move here</span>
            </span>
          </div>
          <div
            v-if="!g.issues.length && !isDropTarget(g)"
            class="grid flex-1 place-items-center px-2 py-6 text-center"
          >
            <span class="font-mono text-2xs tracking-wide text-muted-foreground/35">
              drop here
            </span>
          </div>
        </div>
      </section>
    </TransitionGroup>

    <ReorderGhost
      v-if="activeGroup && pointer"
      :label="activeGroup.label"
      :color="activeGroup.color"
      :count="activeGroup.issues.length"
      :x="pointer.x"
      :y="pointer.y"
    />
  </div>
</template>

<style scoped>
/* FLIP the columns into place when their order changes. */
.col-move {
  transition: transform 200ms ease;
}
/* Brief settle on the column that just landed. */
.reorder-settle {
  animation: reorder-settle 360ms ease;
}
@keyframes reorder-settle {
  0% {
    transform: scale(0.96);
  }
  60% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reorder-settle {
    animation: none;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/components/IssueBoard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/components/IssueBoard.vue src/features/issues/components/IssueBoard.test.ts
git commit -m "feat(issues): pointer reorder + ghost/bar/lift in board columns"
```

---

### Task 7: Pointer reorder in `IssueListGroups.vue`

**Files:**
- Modify (rewrite): `src/features/issues/components/IssueListGroups.vue`
- Modify (rewrite test): `src/features/issues/components/IssueListGroups.test.ts`

- [ ] **Step 1: Rewrite the test**

Replace the ENTIRE contents of `src/features/issues/components/IssueListGroups.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueListGroups from './IssueListGroups.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const groups: IssueGroup[] = [
  { key: 'a', label: 'A', issues: [] },
  { key: 'b', label: 'B', color: '#22c55e', issues: [] },
]

function makeProps(over: Record<string, unknown> = {}) {
  return {
    groups,
    groupKey: 'status',
    fullPath: 'grp/proj',
    highlightIid: null,
    vtNameFor: () => undefined,
    activeKey: null,
    insertIndex: null,
    barOffset: null,
    pointer: null,
    justReordered: null,
    dimension: 'status',
    start: vi.fn(),
    ...over,
  }
}
const stubs = { IssueRow: true, Card: true }

afterEach(() => {
  document.querySelectorAll('[data-testid="reorder-ghost"]').forEach((n) => n.remove())
})

describe('IssueListGroups reorder', () => {
  it('starts a reorder on grip pointerdown', async () => {
    const start = vi.fn()
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ start }),
      global: { stubs },
      attachTo: document.body,
    })
    const grips = wrapper.findAll('[data-testid="group-grip"]')
    expect(grips).toHaveLength(2)
    await grips[0].trigger('pointerdown')
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toBe('a')
    expect(start.mock.calls[0][2]).toMatchObject({ axis: 'y', dimension: 'status', keys: ['a', 'b'] })
    wrapper.unmount()
  })

  it('hides grips when there is a single group', () => {
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ groups: [groups[0]] }),
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })

  it('hides grips for ungrouped (none)', () => {
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ groupKey: 'none' }),
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })

  it('renders the insertion bar and ghost while dragging', () => {
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ activeKey: 'b', insertIndex: 0, barOffset: 40, pointer: { x: 20, y: 30 } }),
      global: { stubs },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-testid="reorder-bar"]').exists()).toBe(true)
    expect(document.body.querySelector('[data-testid="reorder-ghost"]')?.textContent).toContain('B')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/components/IssueListGroups.test.ts`
Expected: FAIL — grip uses `pointerdown`/`start`; bar/ghost don't exist yet.

- [ ] **Step 3: Rewrite the component**

Replace the ENTIRE contents of `src/features/issues/components/IssueListGroups.vue` with:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { GripVertical } from '@lucide/vue'
import IssueRow from '@/features/issues/components/IssueRow.vue'
import ReorderGhost from '@/features/issues/components/ReorderGhost.vue'
import { Card } from '@/shared/ui/card'
import type { Facet, IssueGroup } from '@/features/issues/lib/issueView'
import type { ReorderContext } from '@/features/issues/composables/useGroupReorder'

const props = defineProps<{
  groups: IssueGroup[]
  groupKey: string
  fullPath: string
  highlightIid: string | null
  vtNameFor: (iid: string) => string | undefined
  // reorder (pointer-driven)
  activeKey: string | null
  insertIndex: number | null
  barOffset: number | null
  pointer: { x: number; y: number } | null
  justReordered: string | null
  dimension: string
  start: (key: string, e: PointerEvent, ctx: ReorderContext) => void
}>()
defineEmits<{ filter: [f: Facet] }>()

// Reorder only makes sense with real, multiple groups — not the single "all"
// lane that 'none' grouping produces.
const reorderable = () => props.groupKey !== 'none' && props.groups.length > 1

const reorderContainer = ref<HTMLElement | null>(null)
function onGripDown(key: string, e: PointerEvent) {
  if (!reorderContainer.value) return
  props.start(key, e, {
    container: reorderContainer.value,
    axis: 'y',
    dimension: props.dimension,
    keys: props.groups.map((g) => g.key),
  })
}
const activeGroup = computed(() => props.groups.find((g) => g.key === props.activeKey) ?? null)
</script>

<template>
  <!-- List view; the wrapper is the reorder geometry container (sections carry
       data-reorder-key; the horizontal insertion line is positioned within). -->
  <div ref="reorderContainer" class="relative">
    <div
      v-if="activeKey && barOffset != null"
      data-testid="reorder-bar"
      aria-hidden="true"
      class="pointer-events-none absolute right-0 left-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
      :style="{ top: `${barOffset}px` }"
    />
    <TransitionGroup tag="div" name="grp" class="space-y-5">
      <section v-for="g in groups" :key="g.key" :data-reorder-key="g.key" class="space-y-2">
        <header
          v-if="groupKey !== 'none'"
          class="group/grp flex items-center gap-2 rounded-md px-1 py-0.5 transition-[box-shadow,opacity,transform] duration-150 motion-reduce:transition-none"
          :class="[
            activeKey === g.key ? 'scale-[.99] opacity-50 motion-reduce:scale-100' : '',
            justReordered === g.key ? 'reorder-settle' : '',
          ]"
        >
          <span
            v-if="reorderable()"
            data-testid="group-grip"
            aria-label="Reorder group"
            class="-ml-0.5 touch-none cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
            :class="activeKey ? 'opacity-100' : 'opacity-0 group-hover/grp:opacity-100'"
            @pointerdown.prevent="onGripDown(g.key, $event)"
          >
            <GripVertical class="size-3.5" />
          </span>
          <span v-if="g.color" class="size-2 rounded-full" :style="{ backgroundColor: g.color }" />
          <h2 class="text-sm font-medium text-foreground">{{ g.label }}</h2>
          <span class="font-mono text-xs tabular-nums text-muted-foreground/60">
            {{ g.issues.length }}
          </span>
        </header>
        <Card class="gap-0 divide-y divide-border/60 overflow-hidden p-0 shadow-pop">
          <IssueRow
            v-for="(issue, i) in g.issues"
            :key="issue.iid"
            :issue="issue"
            :full-path="fullPath"
            :index="i"
            :highlight="issue.iid === highlightIid"
            :vt-name="vtNameFor(issue.iid)"
            @filter="$emit('filter', $event)"
          />
        </Card>
      </section>
    </TransitionGroup>

    <ReorderGhost
      v-if="activeGroup && pointer"
      :label="activeGroup.label"
      :color="activeGroup.color"
      :count="activeGroup.issues.length"
      :x="pointer.x"
      :y="pointer.y"
    />
  </div>
</template>

<style scoped>
/* FLIP the sections into place when their order changes. */
.grp-move {
  transition: transform 200ms ease;
}
.reorder-settle {
  animation: reorder-settle 360ms ease;
}
@keyframes reorder-settle {
  0% {
    transform: scale(0.97);
  }
  60% {
    transform: scale(1.01);
  }
  100% {
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reorder-settle {
    animation: none;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/components/IssueListGroups.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole feature**

Run: `bun run typecheck`
Expected: No errors in `src/views/IssueList.vue`, `src/features/issues/components/IssueBoard.vue`, `src/features/issues/components/IssueListGroups.vue`, `src/features/issues/components/ReorderGhost.vue`, or `src/features/issues/composables/useGroupReorder.ts`. (Pre-existing errors confined to `useIssueBoardDnd.ts`, `useIssueSavedViews.ts`, `StatusPicker.vue`, `PipelineRow.vue`, and `src/gitlab/generated/**` are unrelated — ignore them. If you see a NEW error in a feature file above, fix it.)

- [ ] **Step 6: Run the full issue suite**

Run: `bunx vitest run src/features/issues src/views/IssueList.test.ts`
Expected: PASS (all green).

- [ ] **Step 7: Commit**

```bash
git add src/features/issues/components/IssueListGroups.vue src/features/issues/components/IssueListGroups.test.ts
git commit -m "feat(issues): pointer reorder + ghost/bar/lift in list groups"
```

---

## Manual verification (after Task 7)

Run the app (`bun run dev` or the project's run skill) and confirm:

1. **Board:** grab a column grip — a rich chip (dot + label + count) follows the cursor; the source column dims and shrinks slightly.
2. A bright vertical bar appears in the gap where the column will land, tracking the cursor between columns.
3. Drop — the column animates into place and does a brief settle.
4. Drag a column toward the left/right edge of the board — it auto-scrolls to reach off-screen columns.
5. Press **Esc** mid-drag — the drag cancels, nothing moves.
6. Grips are hidden until you hover a column header (and all show while a drag is active).
7. **List:** the same, with a horizontal insertion line between groups.
8. Reload — custom order persists (shared per dimension across list/board, unchanged from before).
9. Dragging a **card** within a column still retags/moves it (card DnD unaffected).
10. With OS "reduce motion" on, the settle/ghost-entrance animations are suppressed; reordering still works.

---

## Self-Review notes

- **Spec coverage:** mechanism rewrite (spec §1) → Task 4; geometry (§2) → Task 2; `reorderToIndex` (§3) → Tasks 1 & 4; `ReorderGhost` (§4) → Task 3; insertion bar (§5) → Tasks 6–7; extras lift/settle/auto-scroll/hover-reveal (§6) → Tasks 4 (auto-scroll in composable), 6, 7; components (§7) → Tasks 5–7; auto-scroll (§7 detail) → Task 4 `tick`. All spec sections mapped. Persistence reused (`useGroupOrder`/`applyOrder` untouched).
- **Type consistency:** `start(key, e, ctx)` and `ReorderContext { container, axis, dimension, keys }` are identical across Tasks 4–7; the prop set `activeKey/insertIndex/barOffset/pointer/justReordered/dimension/start` matches between `IssueList.vue` (Task 5) and both components (Tasks 6–7); `InsertionResult { index, barOffset, isNoOp }` is consistent between Task 2 and Task 4; `reorderToIndex(keys, key, index)` matches between Tasks 1 and 4.
- **No placeholders:** every code step shows complete code; full-file rewrites given for the composable and both components.
- **Out of scope honored:** card DnD untouched; no keyboard reorder added (grips keep `aria-label`, remain focusable via being interactive spans).
