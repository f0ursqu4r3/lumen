# Drag-reorder Groups & Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag-reorder issue list groups and board columns, persisting the arrangement locally per project, shared per grouping dimension.

**Architecture:** Keep the deterministic default ordering in `issueView.ts` untouched; add a pure `applyOrder` pass that re-sequences groups by a stored key order, a `useGroupOrder` localStorage store keyed by grouping dimension, and a `useGroupReorder` composable driving native-HTML5 grip-handle drag. The list and board read the same store entry (keyed by their dimension string), so order is shared across views.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, `@vueuse/core` `useLocalStorage`, native HTML5 drag-and-drop, Vitest + `@vue/test-utils`. Run tests with `bunx vitest run` (NOT `bun test`).

---

## File Structure

- `src/features/issues/lib/issueView.ts` — add pure `applyOrder` + `reorderKeys` helpers (Task 1).
- `src/features/issues/lib/issueView.test.ts` — tests for the two helpers (Task 1).
- `src/features/issues/composables/useGroupOrder.ts` — per-project order store (Task 2, new).
- `src/features/issues/composables/useGroupOrder.test.ts` — store tests (Task 2, new).
- `src/features/issues/composables/useGroupReorder.ts` — drag-state + drop math (Task 3, new).
- `src/features/issues/composables/useGroupReorder.test.ts` — composable tests (Task 3, new).
- `src/views/IssueList.vue` — wire order application + reorder handlers + reset (Task 4).
- `src/features/issues/components/IssueListGroups.vue` — header grips + reorder emits + FLIP (Task 5).
- `src/features/issues/components/IssueListGroups.test.ts` — grip emit test (Task 5, new).
- `src/features/issues/components/IssueBoard.vue` — column-header grips + reorder emits + FLIP (Task 6).
- `src/features/issues/components/IssueBoard.test.ts` — grip emit test (Task 6, new).
- `src/features/issues/components/IssueListToolbar.vue` — "Reset order" affordance (Task 7).

---

### Task 1: Pure order helpers (`applyOrder`, `reorderKeys`)

**Files:**
- Modify: `src/features/issues/lib/issueView.ts`
- Test: `src/features/issues/lib/issueView.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/issues/lib/issueView.test.ts`:

```ts
import { applyOrder, reorderKeys } from './issueView'

const g = (key: string): IssueGroup => ({ key, label: key, issues: [] })

describe('applyOrder', () => {
  it('returns groups unchanged when order is empty', () => {
    const groups = [g('a'), g('b'), g('c')]
    expect(applyOrder(groups, []).map((x) => x.key)).toEqual(['a', 'b', 'c'])
  })

  it('re-sequences groups to match the given order', () => {
    const groups = [g('a'), g('b'), g('c')]
    expect(applyOrder(groups, ['c', 'a', 'b']).map((x) => x.key)).toEqual(['c', 'a', 'b'])
  })

  it('appends groups absent from the order after, in default order', () => {
    const groups = [g('a'), g('b'), g('c'), g('d')]
    expect(applyOrder(groups, ['c', 'a']).map((x) => x.key)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('ignores order keys with no matching group', () => {
    const groups = [g('a'), g('b')]
    expect(applyOrder(groups, ['z', 'b', 'a']).map((x) => x.key)).toEqual(['b', 'a'])
  })
})

describe('reorderKeys', () => {
  it('moves a key forward to just after its target', () => {
    expect(reorderKeys(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a key backward to just before its target', () => {
    expect(reorderKeys(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when dragging onto itself', () => {
    expect(reorderKeys(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c'])
  })

  it('returns a copy when a key is missing', () => {
    expect(reorderKeys(['a', 'b'], 'x', 'a')).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/issues/lib/issueView.test.ts`
Expected: FAIL — `applyOrder is not a function` / `reorderKeys is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/features/issues/lib/issueView.ts` (after `boardColumns`, before the active-filters section):

```ts
/**
 * Re-sequence groups by a stored key order without losing any. Groups whose
 * `key` is in `order` come first, in that sequence; groups absent from `order`
 * keep their default relative order and append after (so a newly-appeared
 * status/label column lands at the end). Order keys with no matching group are
 * ignored. Stable; pure.
 */
export function applyOrder(groups: IssueGroup[], order: readonly string[]): IssueGroup[] {
  if (!order.length) return groups
  const rank = new Map(order.map((k, i) => [k, i] as const))
  return groups
    .map((group, i) => ({ group, i }))
    .sort((a, b) => {
      const ra = rank.get(a.group.key)
      const rb = rank.get(b.group.key)
      if (ra != null && rb != null) return ra - rb
      if (ra != null) return -1
      if (rb != null) return 1
      return a.i - b.i
    })
    .map((x) => x.group)
}

/**
 * Compute the new key sequence after dragging `dragKey` onto `overKey` within
 * `keys`. Dragging forward (down/right) drops just after the target; dragging
 * backward drops just before it. Pure — returns a fresh array.
 */
export function reorderKeys(
  keys: readonly string[],
  dragKey: string,
  overKey: string,
): string[] {
  if (dragKey === overKey) return [...keys]
  const from = keys.indexOf(dragKey)
  const to = keys.indexOf(overKey)
  if (from === -1 || to === -1) return [...keys]
  const without = keys.filter((k) => k !== dragKey)
  const target = without.indexOf(overKey)
  const insertAt = from < to ? target + 1 : target
  without.splice(insertAt, 0, dragKey)
  return without
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/issues/lib/issueView.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/lib/issueView.ts src/features/issues/lib/issueView.test.ts
git commit -m "feat(issues): add applyOrder + reorderKeys group-order helpers"
```

---

### Task 2: `useGroupOrder` persistence store

**Files:**
- Create: `src/features/issues/composables/useGroupOrder.ts`
- Test: `src/features/issues/composables/useGroupOrder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/composables/useGroupOrder.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useGroupOrder } from './useGroupOrder'

beforeEach(() => localStorage.clear())

describe('useGroupOrder', () => {
  it('returns an empty order for an unknown dimension', () => {
    const { orderFor, hasOrder } = useGroupOrder(ref('grp/proj'))
    expect(orderFor('status')).toEqual([])
    expect(hasOrder('status')).toBe(false)
  })

  it('round-trips an order per dimension', () => {
    const { orderFor, setOrder, hasOrder } = useGroupOrder(ref('grp/proj'))
    setOrder('status', ['c', 'a', 'b'])
    expect(orderFor('status')).toEqual(['c', 'a', 'b'])
    expect(hasOrder('status')).toBe(true)
    expect(orderFor('assignee')).toEqual([])
  })

  it('reset clears one dimension without touching others', () => {
    const { orderFor, setOrder, reset } = useGroupOrder(ref('grp/proj'))
    setOrder('status', ['a'])
    setOrder('assignee', ['x'])
    reset('status')
    expect(orderFor('status')).toEqual([])
    expect(orderFor('assignee')).toEqual(['x'])
  })

  it('isolates order by project path', () => {
    const fullPath = ref('grp/one')
    const a = useGroupOrder(fullPath)
    a.setOrder('status', ['a', 'b'])
    fullPath.value = 'grp/two'
    expect(a.orderFor('status')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/composables/useGroupOrder.test.ts`
Expected: FAIL — cannot find module `./useGroupOrder`.

- [ ] **Step 3: Implement the store**

Create `src/features/issues/composables/useGroupOrder.ts`:

```ts
import { useLocalStorage } from '@vueuse/core'
import type { Ref } from 'vue'

// Per-project, per-dimension custom ordering of list groups / board columns.
// The dimension key is the grouping string the list/board already use
// ('status', 'assignee', 'label:team', 'priority'), so a single entry is shared
// across both views. Values are the ordered group keys (status ids, usernames,
// label values, priority levels, including '__none'). Local-only: these columns
// are synthetic, so GitLab has no order to persist server-side.
const storageKey = (fullPath: string) => `lumen:group-order:${fullPath}`

export function useGroupOrder(fullPath: Ref<string>) {
  // Getter key re-reads storage on project switch (mirrors useSavedViews).
  const stored = useLocalStorage<Record<string, string[]>>(() => storageKey(fullPath.value), {})

  const orderFor = (dimension: string): string[] => stored.value[dimension] ?? []
  const hasOrder = (dimension: string): boolean => (stored.value[dimension]?.length ?? 0) > 0

  function setOrder(dimension: string, keys: string[]): void {
    stored.value = { ...stored.value, [dimension]: keys }
  }
  function reset(dimension: string): void {
    const next = { ...stored.value }
    delete next[dimension]
    stored.value = next
  }

  return { orderFor, hasOrder, setOrder, reset }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/composables/useGroupOrder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/composables/useGroupOrder.ts src/features/issues/composables/useGroupOrder.test.ts
git commit -m "feat(issues): add per-project useGroupOrder store"
```

---

### Task 3: `useGroupReorder` drag composable

**Files:**
- Create: `src/features/issues/composables/useGroupReorder.ts`
- Test: `src/features/issues/composables/useGroupReorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/composables/useGroupReorder.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { useGroupReorder } from './useGroupReorder'

// Minimal DragEvent stub carrying a dataTransfer.
const dragEvent = () =>
  ({ dataTransfer: { effectAllowed: '', setData: vi.fn() } }) as unknown as DragEvent

describe('useGroupReorder', () => {
  it('tracks drag and over keys', () => {
    const r = useGroupReorder({ setOrder: vi.fn() })
    r.onReorderStart('a', dragEvent())
    expect(r.dragKey.value).toBe('a')
    r.onReorderOver('b')
    expect(r.overKey.value).toBe('b')
    expect(r.isReorderTarget('b')).toBe(true)
    expect(r.isReorderTarget('a')).toBe(false)
  })

  it('ignores dragover onto the dragged key itself', () => {
    const r = useGroupReorder({ setOrder: vi.fn() })
    r.onReorderStart('a', dragEvent())
    r.onReorderOver('a')
    expect(r.overKey.value).toBeNull()
  })

  it('persists the reordered sequence on drop and clears state', () => {
    const setOrder = vi.fn()
    const r = useGroupReorder({ setOrder })
    r.onReorderStart('a', dragEvent())
    r.onReorderOver('c')
    r.onReorderDrop('status', ['a', 'b', 'c', 'd'])
    expect(setOrder).toHaveBeenCalledWith('status', ['b', 'c', 'a', 'd'])
    expect(r.dragKey.value).toBeNull()
    expect(r.overKey.value).toBeNull()
  })

  it('does nothing on drop without a target', () => {
    const setOrder = vi.fn()
    const r = useGroupReorder({ setOrder })
    r.onReorderStart('a', dragEvent())
    r.onReorderDrop('status', ['a', 'b'])
    expect(setOrder).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/composables/useGroupReorder.test.ts`
Expected: FAIL — cannot find module `./useGroupReorder`.

- [ ] **Step 3: Implement the composable**

Create `src/features/issues/composables/useGroupReorder.ts`:

```ts
import { ref } from 'vue'
import { reorderKeys } from '@/features/issues/lib/issueView'

// A dedicated drag type so a group/column reorder is never mistaken for a card
// drag (card DnD uses 'text/plain'); the board's card drop/dragover handlers
// already no-op when no card is in hand, so the two coexist.
const REORDER_MIME = 'application/x-lumen-group'

interface OrderStore {
  setOrder: (dimension: string, keys: string[]) => void
}

/**
 * Drives grip-handle reordering of list groups / board columns. The component
 * supplies the live displayed key order on drop; we compute the new sequence
 * (see reorderKeys) and persist it via the store.
 */
export function useGroupReorder(store: OrderStore) {
  const dragKey = ref<string | null>(null)
  const overKey = ref<string | null>(null)

  function onReorderStart(key: string, e: DragEvent) {
    dragKey.value = key
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(REORDER_MIME, key)
    }
  }
  function onReorderOver(key: string) {
    if (dragKey.value && key !== dragKey.value) overKey.value = key
  }
  function onReorderDrop(dimension: string, displayedKeys: string[]) {
    const from = dragKey.value
    const to = overKey.value
    clearReorder()
    if (!from || !to) return
    store.setOrder(dimension, reorderKeys(displayedKeys, from, to))
  }
  function clearReorder() {
    dragKey.value = null
    overKey.value = null
  }
  const isReorderTarget = (key: string): boolean =>
    !!dragKey.value && overKey.value === key && key !== dragKey.value

  return {
    dragKey,
    overKey,
    onReorderStart,
    onReorderOver,
    onReorderDrop,
    clearReorder,
    isReorderTarget,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/composables/useGroupReorder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/composables/useGroupReorder.ts src/features/issues/composables/useGroupReorder.test.ts
git commit -m "feat(issues): add useGroupReorder drag composable"
```

---

### Task 4: Wire order + reorder into `IssueList.vue`

**Files:**
- Modify: `src/views/IssueList.vue`

This is glue between the helpers/composables (Tasks 1–3) and the components (Tasks 5–6). The existing `IssueList.test.ts` suite must stay green; component-level reorder behavior is covered by Tasks 5–6.

- [ ] **Step 1: Add imports**

In `src/views/IssueList.vue`, add `applyOrder` and `reorderKeys` is not needed here, but add `applyOrder` to the existing `issueView` import and import the two composables. Change the `issueView` import block to include `applyOrder`:

```ts
import {
  sortIssues,
  groupIssues,
  boardColumns,
  applyOrder,
  labelScopes,
  type Facet,
} from '@/features/issues/lib/issueView'
import { useGroupOrder } from '@/features/issues/composables/useGroupOrder'
import { useGroupReorder } from '@/features/issues/composables/useGroupReorder'
```

- [ ] **Step 2: Instantiate the store and apply order to the computeds**

Replace the existing `listGroups` computed (currently at `src/views/IssueList.vue:120`):

```ts
const listGroups = computed(() => groupIssues(sorted.value, groupKey.value))
```

with the store + ordered computed:

```ts
const { orderFor, hasOrder, setOrder, reset } = useGroupOrder(toRef(props, 'fullPath'))

const listGroups = computed(() =>
  applyOrder(groupIssues(sorted.value, groupKey.value), orderFor(groupKey.value)),
)
```

Then replace the existing `boardGroups` computed (currently at `src/views/IssueList.vue:163-168`):

```ts
const boardGroups = computed(() =>
  boardColumns(sorted.value, boardScope.value, {
    labelCatalog: labelCatalog.value,
    statusCatalog: statusCatalog.value ?? [],
  }),
)
```

with:

```ts
const boardGroups = computed(() =>
  applyOrder(
    boardColumns(sorted.value, boardScope.value, {
      labelCatalog: labelCatalog.value,
      statusCatalog: statusCatalog.value ?? [],
    }),
    orderFor(boardScope.value),
  ),
)
```

- [ ] **Step 3: Instantiate the reorder composable + reset wiring**

Immediately after the `useIssueBoardDnd({ ... })` destructure block (currently ends at `src/views/IssueList.vue:189`), add:

```ts
// --- drag to reorder groups / columns ---------------------------------------
const {
  dragKey: reorderDragKey,
  overKey: reorderOverKey,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  clearReorder,
} = useGroupReorder({ setOrder })

// The grouping dimension the active view arranges (list groups vs board cols).
const activeDimension = computed(() => (view.value === 'list' ? groupKey.value : boardScope.value))
const hasCustomOrder = computed(() => hasOrder(activeDimension.value))
const resetOrder = () => reset(activeDimension.value)
```

- [ ] **Step 4: Pass props + handlers to the toolbar and the two views**

In the template, add to `<IssueListToolbar ... >` (after `@set-view="setView"`):

```html
      :has-custom-order="hasCustomOrder"
      @reset-order="resetOrder"
```

Update `<IssueListGroups ... />` to add the reorder props and handlers (after `@filter="applyFacet"`):

```html
          :reorder-drag-key="reorderDragKey"
          :reorder-over-key="reorderOverKey"
          @reorder-start="onReorderStart"
          @reorder-over="onReorderOver"
          @reorder-drop="() => onReorderDrop(groupKey, listGroups.map((g) => g.key))"
          @reorder-end="clearReorder"
```

Update `<IssueBoard ... />` to add the reorder props and handlers (after `@drag-over="dragOverKey = $event"`):

```html
          :reorder-drag-key="reorderDragKey"
          :reorder-over-key="reorderOverKey"
          @reorder-start="onReorderStart"
          @reorder-over="onReorderOver"
          @reorder-drop="() => onReorderDrop(boardScope, boardGroups.map((g) => g.key))"
          @reorder-end="clearReorder"
```

- [ ] **Step 5: Typecheck and run the existing view suite**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS (no regressions — new props on child components are additive).

Note: `vue-tsc` will report red until `IssueListGroups`/`IssueBoard`/`IssueListToolbar` accept the new props/emits (Tasks 5–7). That is expected mid-plan; do not chase it until Task 7 is done.

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue
git commit -m "feat(issues): apply custom group order + wire reorder in IssueList"
```

---

### Task 5: Grips + FLIP in `IssueListGroups.vue`

**Files:**
- Modify: `src/features/issues/components/IssueListGroups.vue`
- Test: `src/features/issues/components/IssueListGroups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/components/IssueListGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueListGroups from './IssueListGroups.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const groups: IssueGroup[] = [
  { key: 'a', label: 'A', issues: [] },
  { key: 'b', label: 'B', issues: [] },
]

const baseProps = {
  groups,
  groupKey: 'status',
  fullPath: 'grp/proj',
  highlightIid: null,
  vtNameFor: () => undefined,
  reorderDragKey: null,
  reorderOverKey: null,
}

const stubs = { IssueRow: true, Card: true }

describe('IssueListGroups reorder', () => {
  it('renders a grip per group and emits reorder-start on dragstart', async () => {
    const wrapper = mount(IssueListGroups, { props: baseProps, global: { stubs } })
    const grips = wrapper.findAll('[data-testid="group-grip"]')
    expect(grips).toHaveLength(2)
    await grips[0].trigger('dragstart')
    expect(wrapper.emitted('reorder-start')?.[0]?.[0]).toBe('a')
  })

  it('hides grips when there is a single group', () => {
    const wrapper = mount(IssueListGroups, {
      props: { ...baseProps, groups: [groups[0]] },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })

  it('hides headers and grips for ungrouped (none)', () => {
    const wrapper = mount(IssueListGroups, {
      props: { ...baseProps, groupKey: 'none' },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/components/IssueListGroups.test.ts`
Expected: FAIL — no `[data-testid="group-grip"]` elements found.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/features/issues/components/IssueListGroups.vue` with:

```vue
<script setup lang="ts">
import { GripVertical } from '@lucide/vue'
import IssueRow from '@/features/issues/components/IssueRow.vue'
import { Card } from '@/shared/ui/card'
import type { Facet, IssueGroup } from '@/features/issues/lib/issueView'

const props = defineProps<{
  groups: IssueGroup[]
  groupKey: string
  fullPath: string
  highlightIid: string | null
  vtNameFor: (iid: string) => string | undefined
  reorderDragKey: string | null
  reorderOverKey: string | null
}>()
defineEmits<{
  filter: [f: Facet]
  'reorder-start': [key: string, e: DragEvent]
  'reorder-over': [key: string]
  'reorder-drop': [key: string]
  'reorder-end': []
}>()

// Reorder only makes sense with real, multiple groups — not the single "all"
// lane that 'none' grouping produces.
const reorderable = () => props.groupKey !== 'none' && props.groups.length > 1
</script>

<template>
  <!-- List view -->
  <TransitionGroup tag="div" name="grp" class="space-y-5">
    <section v-for="g in groups" :key="g.key" class="space-y-2">
      <header
        v-if="groupKey !== 'none'"
        class="flex items-center gap-2 rounded-md px-1 py-0.5 transition-shadow"
        :class="[
          reorderDragKey === g.key ? 'opacity-50' : '',
          reorderOverKey === g.key && reorderDragKey !== g.key
            ? 'ring-1 ring-primary/50'
            : '',
        ]"
        @dragover.prevent="reorderable() && $emit('reorder-over', g.key)"
        @drop.prevent="$emit('reorder-drop', g.key)"
      >
        <span
          v-if="reorderable()"
          data-testid="group-grip"
          draggable="true"
          aria-label="Reorder group"
          class="-ml-0.5 cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
          @dragstart="$emit('reorder-start', g.key, $event)"
          @dragend="$emit('reorder-end')"
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
</template>

<style scoped>
/* FLIP the sections into place when their order changes. */
.grp-move {
  transition: transform 200ms ease;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/components/IssueListGroups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/components/IssueListGroups.vue src/features/issues/components/IssueListGroups.test.ts
git commit -m "feat(issues): drag-reorder grips + FLIP for list groups"
```

---

### Task 6: Grips + FLIP in `IssueBoard.vue`

**Files:**
- Modify: `src/features/issues/components/IssueBoard.vue`
- Test: `src/features/issues/components/IssueBoard.test.ts`

Reorder handlers go on the column **header** only — the column body keeps the existing card drop zone, so the two never compete. The header grip is the drag source.

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/components/IssueBoard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueBoard from './IssueBoard.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const boardGroups: IssueGroup[] = [
  { key: 'todo', label: 'To do', issues: [] },
  { key: 'doing', label: 'Doing', issues: [] },
]

const baseProps = {
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
  reorderDragKey: null,
  reorderOverKey: null,
}

const stubs = { IssueCard: true }

describe('IssueBoard reorder', () => {
  it('renders a grip per column and emits reorder-start on dragstart', async () => {
    const wrapper = mount(IssueBoard, { props: baseProps, global: { stubs } })
    const grips = wrapper.findAll('[data-testid="column-grip"]')
    expect(grips).toHaveLength(2)
    await grips[1].trigger('dragstart')
    expect(wrapper.emitted('reorder-start')?.[0]?.[0]).toBe('doing')
  })

  it('hides grips when there is a single column', () => {
    const wrapper = mount(IssueBoard, {
      props: { ...baseProps, boardGroups: [boardGroups[0]] },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="column-grip"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/components/IssueBoard.test.ts`
Expected: FAIL — no `[data-testid="column-grip"]` elements found.

- [ ] **Step 3: Edit the component — add props/emits**

In `src/features/issues/components/IssueBoard.vue`, replace the `defineProps` block (lines 9–20) by appending two props before the closing `}>()`:

```ts
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
  reorderDragKey: string | null
  reorderOverKey: string | null
}>()
```

Replace the `defineEmits` block (lines 21–27) with:

```ts
const emit = defineEmits<{
  filter: [f: Facet]
  'drag-start': [issue: IssueListItem, e: DragEvent]
  'drag-end': []
  drop: [g: IssueGroup]
  'drag-over': [key: string]
  'reorder-start': [key: string, e: DragEvent]
  'reorder-over': [key: string]
  'reorder-drop': [key: string]
  'reorder-end': []
}>()

// Columns reorder only when there's more than one.
const reorderable = () => props.boardGroups.length > 1
```

- [ ] **Step 4: Edit the component — wrap track in TransitionGroup**

Replace the inner track opening tag (line 47):

```html
    <div class="mx-auto flex h-full min-h-80 w-max gap-3 px-6">
```

with:

```html
    <TransitionGroup tag="div" name="col" class="mx-auto flex h-full min-h-80 w-max gap-3 px-6">
```

and its matching closing `</div>` (line 143) with `</TransitionGroup>`.

- [ ] **Step 5: Edit the component — grip + reorder handlers on the header**

Replace the `<header>` block (lines 70–84) with:

```html
        <header
          class="relative flex shrink-0 items-center gap-2 rounded-md px-3 pt-3 pb-2.5 transition-shadow"
          :class="[
            reorderDragKey === g.key ? 'opacity-50' : '',
            reorderOverKey === g.key && reorderDragKey !== g.key
              ? 'ring-1 ring-inset ring-primary/55'
              : '',
          ]"
          @dragover.prevent="reorderable() && emit('reorder-over', g.key)"
          @drop.prevent="emit('reorder-drop', g.key)"
        >
          <span
            v-if="reorderable()"
            data-testid="column-grip"
            draggable="true"
            aria-label="Reorder column"
            class="-ml-1 cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
            @dragstart="emit('reorder-start', g.key, $event)"
            @dragend="emit('reorder-end')"
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
```

(The `GripVertical` import already exists at line 4. The existing per-card `GripVertical` in the card slot stays unchanged.)

- [ ] **Step 6: Edit the component — add the move transition style**

Append a style block at the end of `src/features/issues/components/IssueBoard.vue`:

```vue
<style scoped>
/* FLIP the columns into place when their order changes. */
.col-move {
  transition: transform 200ms ease;
}
</style>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/components/IssueBoard.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/issues/components/IssueBoard.vue src/features/issues/components/IssueBoard.test.ts
git commit -m "feat(issues): drag-reorder grips + FLIP for board columns"
```

---

### Task 7: "Reset order" affordance in `IssueListToolbar.vue`

**Files:**
- Modify: `src/features/issues/components/IssueListToolbar.vue`

- [ ] **Step 1: Add the prop and emit**

In `src/features/issues/components/IssueListToolbar.vue`, add `RotateCcw` to the lucide import (line 2):

```ts
import { Search, RefreshCw, CheckSquare, List, Columns3, RotateCcw } from '@lucide/vue'
```

Add `hasCustomOrder` to the `defineProps` block (after `scopeOptions: string[]`):

```ts
defineProps<{
  catalog: ProjectLabel[]
  members: ProjectMember[]
  activeCount: number
  view: 'list' | 'board'
  selectMode: boolean
  isRefreshing: boolean
  scopeOptions: string[]
  hasCustomOrder: boolean
}>()
```

Add `reset-order` to `defineEmits` (line 46):

```ts
defineEmits<{
  refresh: []
  'toggle-select': []
  'set-view': [next: 'list' | 'board']
  'reset-order': []
}>()
```

- [ ] **Step 2: Add the reset button to both toolbar row-2 variants**

In the list row-2 block, immediately after the closing `</Select>` of the Group select (line 197) and before the closing `</div>` (line 198), add:

```html
    <button
      v-if="hasCustomOrder"
      type="button"
      data-testid="reset-group-order"
      class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
      @click="$emit('reset-order')"
    >
      <RotateCcw class="size-3.5" />
      Reset order
    </button>
```

In the board row-2 block, immediately after the `<span class="text-xs text-muted-foreground/60">Drag cards to update</span>` (line 234) and before the closing `</div>` (line 235), add the same button:

```html
    <button
      v-if="hasCustomOrder"
      type="button"
      data-testid="reset-column-order"
      class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
      @click="$emit('reset-order')"
    >
      <RotateCcw class="size-3.5" />
      Reset order
    </button>
```

- [ ] **Step 3: Typecheck the whole feature**

Run: `bun run typecheck`
Expected: PASS for the touched files (any pre-existing `src/gitlab/generated` red is unrelated — see codegen note).

- [ ] **Step 4: Run the full issue test suite**

Run: `bunx vitest run src/features/issues src/views/IssueList.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/components/IssueListToolbar.vue
git commit -m "feat(issues): reset-order control in issue toolbar"
```

---

## Manual verification (after Task 7)

Run the app (`bun run dev` or the project's run skill) and confirm:

1. **Board:** grouped by Status, drag a column header's grip left/right — columns reorder and the arrangement animates.
2. Reload — the board keeps the custom column order.
3. Switch to **List**, group by Status — the list groups show the **same** order (shared per dimension).
4. Drag a list group's grip — groups reorder vertically and persist.
5. Dragging a **card** within a column still retags/moves it (card DnD unaffected by the column grips).
6. The **Reset order** button appears once a custom order exists; clicking it restores the default order and the button disappears.
7. Group by a dimension with one group (or "No grouping") — no grips render.

---

## Self-Review notes

- **Spec coverage:** `useGroupOrder` (spec §1) → Task 2; `applyOrder` (§2) → Task 1; wiring (§3) → Task 4; `useGroupReorder` (§4) → Task 3; component grips + TransitionGroup (§5, §7) → Tasks 5–6; reset affordance (§6) → Task 7; shared-per-dimension behavior → Task 4 (store keyed by `groupKey`/`boardScope`). All spec sections mapped.
- **Type consistency:** `setOrder`/`orderFor`/`hasOrder`/`reset` signatures match across Tasks 2, 3, 4; `reorderKeys`/`applyOrder` signatures match Tasks 1, 3, 4; emit names (`reorder-start|over|drop|end`) and prop names (`reorder-drag-key`, `reorder-over-key`, `has-custom-order`) are identical across Tasks 4–7.
- **`'__none'` reorderable:** no special-casing anywhere — `applyOrder`/`reorderKeys` treat every key uniformly, matching the decision.
