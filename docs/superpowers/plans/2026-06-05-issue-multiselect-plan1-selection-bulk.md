# Issue Multi-Select — Plan 1: Selection + Bulk Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select mode to the issue list and board — checkboxes on rows/cards, a floating bulk-action bar, and bulk add/remove labels, set assignee, and set status across the selection (confirm-gated, optimistic, with a result toast).

**Architecture:** An ephemeral `useIssueSelection(fullPath)` composable (provided by `IssueList`, injected by rows/cards) holds select-mode + a `Set` of selected iids. A `ui/checkbox` (reka-ui) renders selection state. `BulkActionBar.vue` hosts the pickers and emits apply-intents; `IssueList` maps those to `useBulkIssueActions(fullPath)`, which loops the existing per-issue mutations (`useRetagIssue`/`useReassignIssue`/`useSetIssueStatus`) over the selection via `Promise.allSettled`, gating on `useConfirm` and summarizing via `pushToast`.

**Tech Stack:** Vue 3 + TS, reka-ui, @tanstack/vue-query, Vitest.

This is Plan 1 of 2 (the combined multi-issue window is Plan 2). It is independently shippable.

Commands: single test `bunx vitest run <path>`; typecheck `bun run typecheck`. Note: the repo has PRE-EXISTING unrelated typecheck errors (an electrobun `three` type in node_modules, unused-import warnings in `StatusPicker.vue`); only NEW errors in changed files matter.

---

## File Structure

- **Create** `src/components/ui/checkbox/Checkbox.vue` + `index.ts` — reka-ui controlled checkbox.
- **Create** `src/composables/useIssueSelection.ts` (+ test) — selection state + injection key.
- **Create** `src/composables/useBulkIssueActions.ts` (+ test) — bulk apply over iids.
- **Create** `src/components/BulkActionBar.vue` (+ test) — floating bar + pickers, emits intents.
- **Modify** `src/components/IssueRow.vue` (+ test) — checkbox + select-mode click.
- **Modify** `src/components/IssueCard.vue` (+ test) — checkbox + select-mode click; drag handled by host.
- **Modify** `src/views/IssueList.vue` (+ test) — provide selection, mode toggle, render bar, gate board drag, wire bulk actions.

---

## Task 1: `ui/checkbox` component

**Files:**
- Create: `src/components/ui/checkbox/Checkbox.vue`
- Create: `src/components/ui/checkbox/index.ts`
- Test: `src/components/ui/checkbox/Checkbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/checkbox/Checkbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Checkbox } from './index'

describe('ui/Checkbox', () => {
  it('reflects checked state via data-state', () => {
    const w = mount(Checkbox, { props: { modelValue: true } })
    expect(w.get('[data-slot="checkbox"]').attributes('data-state')).toBe('checked')
  })

  it('reflects unchecked state via data-state', () => {
    const w = mount(Checkbox, { props: { modelValue: false } })
    expect(w.get('[data-slot="checkbox"]').attributes('data-state')).toBe('unchecked')
  })

  it('emits update:modelValue when toggled', async () => {
    const w = mount(Checkbox, { props: { modelValue: false } })
    await w.get('[data-slot="checkbox"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([true])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/ui/checkbox/Checkbox.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Create the component**

Create `src/components/ui/checkbox/Checkbox.vue`:

```vue
<script setup lang="ts">
import type { CheckboxRootProps, CheckboxRootEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { CheckboxRoot, CheckboxIndicator, useForwardPropsEmits } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { Check } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<CheckboxRootEmits>()

const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <CheckboxRoot
    data-slot="checkbox"
    v-bind="forwarded"
    :class="
      cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input bg-card/40 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        props.class,
      )
    "
  >
    <CheckboxIndicator class="grid size-full place-items-center text-current">
      <Check class="size-3" :stroke-width="3" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
```

Create `src/components/ui/checkbox/index.ts`:

```ts
export { default as Checkbox } from './Checkbox.vue'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/ui/checkbox/Checkbox.test.ts`
Expected: PASS (3 tests). If the click-emit test is flaky under jsdom (reka-ui), keep the two data-state assertions as the load-bearing checks and leave the emit test — it exercises reka's CheckboxRoot button.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/checkbox
git commit -m "feat: add reka-ui checkbox ui component"
```

---

## Task 2: `useIssueSelection` composable

**Files:**
- Create: `src/composables/useIssueSelection.ts`
- Test: `src/composables/useIssueSelection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/composables/useIssueSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useIssueSelection } from './useIssueSelection'

describe('useIssueSelection', () => {
  it('toggles iids in and out of the set', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.toggle('7')
    expect(s.isSelected('7')).toBe(true)
    expect(s.count.value).toBe(1)
    s.toggle('7')
    expect(s.isSelected('7')).toBe(false)
    expect(s.count.value).toBe(0)
  })

  it('selectAll replaces the set; clear empties it', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.selectAll(['1', '2', '3'])
    expect(s.count.value).toBe(3)
    s.clear()
    expect(s.count.value).toBe(0)
  })

  it('setMode(false) and exit() both clear the selection and turn mode off', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.setMode(true)
    s.toggle('1')
    s.exit()
    expect(s.mode.value).toBe(false)
    expect(s.count.value).toBe(0)
  })

  it('clears selection and mode when fullPath changes', async () => {
    const fullPath = ref('grp/a')
    const s = useIssueSelection(fullPath)
    s.setMode(true)
    s.toggle('1')
    fullPath.value = 'grp/b'
    await nextTick()
    expect(s.count.value).toBe(0)
    expect(s.mode.value).toBe(false)
  })

  it('useInjectedSelection returns a disabled fallback when not provided', async () => {
    const { useInjectedSelection } = await import('./useIssueSelection')
    // Called outside any component/provide — returns the disabled singleton.
    const s = useInjectedSelection()
    expect(s.mode.value).toBe(false)
    s.toggle('1') // no-op, must not throw
    expect(s.isSelected('1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/composables/useIssueSelection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

Create `src/composables/useIssueSelection.ts`:

```ts
import { ref, computed, watch, inject, type Ref, type ComputedRef, type InjectionKey } from 'vue'

export interface IssueSelection {
  /** Select-mode on/off. When off, checkboxes are hidden and clicks navigate. */
  mode: Ref<boolean>
  /** The selected issue iids. */
  selected: Ref<Set<string>>
  count: ComputedRef<number>
  isSelected: (iid: string) => boolean
  toggle: (iid: string) => void
  selectAll: (iids: string[]) => void
  clear: () => void
  /** Clear the selection and turn mode off. */
  exit: () => void
  /** Set mode; turning it off clears the selection. */
  setMode: (on: boolean) => void
}

export const IssueSelectionKey: InjectionKey<IssueSelection> = Symbol('issue-selection')

export function useIssueSelection(fullPath: Ref<string>): IssueSelection {
  const mode = ref(false)
  const selected = ref<Set<string>>(new Set())
  const count = computed(() => selected.value.size)

  // A different project means a different issue set — drop selection + mode.
  watch(fullPath, () => {
    selected.value = new Set()
    mode.value = false
  })

  const isSelected = (iid: string) => selected.value.has(iid)
  function toggle(iid: string) {
    const next = new Set(selected.value)
    if (next.has(iid)) next.delete(iid)
    else next.add(iid)
    selected.value = next
  }
  const selectAll = (iids: string[]) => (selected.value = new Set(iids))
  const clear = () => (selected.value = new Set())
  const exit = () => {
    selected.value = new Set()
    mode.value = false
  }
  const setMode = (on: boolean) => {
    mode.value = on
    if (!on) selected.value = new Set()
  }

  return { mode, selected, count, isSelected, toggle, selectAll, clear, exit, setMode }
}

// A no-op selection used when a row/card renders without a provider (isolated
// tests, or any future host that doesn't opt into selection). Mode is always
// off, so the consuming component behaves exactly as it did before selection.
const DISABLED_SELECTION: IssueSelection = {
  mode: ref(false),
  selected: ref(new Set<string>()),
  count: computed(() => 0),
  isSelected: () => false,
  toggle: () => {},
  selectAll: () => {},
  clear: () => {},
  exit: () => {},
  setMode: () => {},
}

export function useInjectedSelection(): IssueSelection {
  return inject(IssueSelectionKey, DISABLED_SELECTION)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/composables/useIssueSelection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueSelection.ts src/composables/useIssueSelection.test.ts
git commit -m "feat: add useIssueSelection for multi-select state"
```

---

## Task 3: `IssueRow` checkbox + select-mode click

**Files:**
- Modify: `src/components/IssueRow.vue`
- Test: `src/components/IssueRow.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/components/IssueRow.test.ts` (a new describe block; keep existing tests). Read the file's existing imports/mount helper first; it mounts `IssueRow` with `RouterLink: RouterLinkStub`. Provide the selection via `global.provide`:

```ts
import { IssueSelectionKey, useIssueSelection } from '@/composables/useIssueSelection'
import { ref } from 'vue'

describe('IssueRow — select mode', () => {
  const issue = {
    iid: '7',
    title: 'Crash',
    state: 'opened',
    webUrl: '#',
    labels: { nodes: [] },
    assignees: { nodes: [] },
  }

  function mountWithSelection() {
    const selection = useIssueSelection(ref('grp/proj'))
    selection.setMode(true)
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj' },
      global: {
        stubs: { RouterLink: RouterLinkStub },
        provide: { [IssueSelectionKey as symbol]: selection },
      },
    })
    return { w, selection }
  }

  it('shows a checkbox in select mode and hides the navigation overlay', () => {
    const { w } = mountWithSelection()
    expect(w.find('[data-slot="checkbox"]').exists()).toBe(true)
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('toggles selection when the row body is clicked in select mode', async () => {
    const { w, selection } = mountWithSelection()
    await w.get('[data-testid="issue-row"]').trigger('click')
    expect(selection.isSelected('7')).toBe(true)
  })
})
```

Note: this requires a `data-testid="issue-row"` on the row root (added in Step 3). If `IssueRow.test.ts` lacks a top-level `import IssueRow`/`RouterLinkStub`/`mount`, mirror the existing imports already in that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/IssueRow.test.ts`
Expected: FAIL — no checkbox / overlay still present / no testid.

- [ ] **Step 3: Implement**

In `src/components/IssueRow.vue` `<script setup>`, add imports and injected selection (place near the other imports and the `filterLabel` helpers):

```ts
import { Checkbox } from '@/components/ui/checkbox'
import { useInjectedSelection } from '@/composables/useIssueSelection'

const selection = useInjectedSelection()

// In select mode the whole row toggles selection; out of it, clicks fall through
// to the stretched RouterLink as before.
function onRowClick() {
  if (selection.mode.value) selection.toggle(props.issue.iid)
}
```

In the template, change the row root `<div>` to add the testid and the click handler, and gate the `RouterLink` overlay on `!selection.mode.value`, and render the checkbox at the start of the row. The root element currently is:

```html
  <div
    class="group relative flex items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
    :class="highlight ? 'animate-flash' : 'animate-row-in'"
    :style="{ animationDelay: delay, viewTransitionName: vtName }"
  >
    <RouterLink
      :to="{ query: { ...($route?.query ?? {}), issue: issue.iid } }"
      :aria-label="`Issue #${issue.iid}: ${issue.title}`"
      class="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    />

    <StateBadge :state="issue.state" compact />
```

Change it to:

```html
  <div
    data-testid="issue-row"
    class="group relative flex items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
    :class="[highlight ? 'animate-flash' : 'animate-row-in', selection.mode.value ? 'cursor-pointer select-none' : '']"
    :style="{ animationDelay: delay, viewTransitionName: vtName }"
    @click="onRowClick"
  >
    <RouterLink
      v-if="!selection.mode.value"
      :to="{ query: { ...($route?.query ?? {}), issue: issue.iid } }"
      :aria-label="`Issue #${issue.iid}: ${issue.title}`"
      class="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    />

    <Checkbox
      v-if="selection.mode.value"
      :model-value="selection.isSelected(issue.iid)"
      :aria-label="`Select issue #${issue.iid}`"
      class="relative z-10 shrink-0"
      @update:model-value="() => selection.toggle(issue.iid)"
      @click.stop
    />

    <StateBadge :state="issue.state" compact />
```

The checkbox carries `@click.stop` so clicking it toggles exactly once (via its own handler) without also firing the row's `onRowClick`. Clicking the row body (not the checkbox) toggles via `onRowClick`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/components/IssueRow.test.ts`
Expected: PASS — including the existing tests (out of select mode, `selection.mode` is false, so the overlay renders and no checkbox appears — unchanged behavior).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'IssueRow'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/components/IssueRow.vue src/components/IssueRow.test.ts
git commit -m "feat: add select-mode checkbox to IssueRow"
```

---

## Task 4: `IssueCard` checkbox + select-mode click

**Files:**
- Modify: `src/components/IssueCard.vue`
- Test: `src/components/IssueCard.test.ts`

Note: the board's drag bindings live on the wrapper `<div>` in `IssueList.vue`, not in `IssueCard`. `IssueCard` only needs the checkbox + a select-mode toggle click; disabling drag is handled by the host in Task 7.

- [ ] **Step 1: Write the failing test**

Add to `src/components/IssueCard.test.ts` (new describe; keep existing). Mirror the existing mount style in that file:

```ts
import { IssueSelectionKey, useIssueSelection } from '@/composables/useIssueSelection'
import { ref } from 'vue'

describe('IssueCard — select mode', () => {
  const issue = {
    iid: '7',
    title: 'Crash',
    state: 'opened',
    webUrl: '#',
    labels: { nodes: [] },
    assignees: { nodes: [] },
  }

  function mountWithSelection() {
    const selection = useIssueSelection(ref('grp/proj'))
    selection.setMode(true)
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj' },
      global: { provide: { [IssueSelectionKey as symbol]: selection } },
    })
    return { w, selection }
  }

  it('shows a checkbox in select mode', () => {
    const { w } = mountWithSelection()
    expect(w.find('[data-slot="checkbox"]').exists()).toBe(true)
  })

  it('toggles selection when the card is clicked in select mode', async () => {
    const { w, selection } = mountWithSelection()
    await w.get('[data-testid="issue-card"]').trigger('click')
    expect(selection.isSelected('7')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/IssueCard.test.ts`
Expected: FAIL — no checkbox / no testid.

- [ ] **Step 3: Implement**

In `src/components/IssueCard.vue` `<script setup>`, add:

```ts
import { Checkbox } from '@/components/ui/checkbox'
import { useInjectedSelection } from '@/composables/useIssueSelection'

const selection = useInjectedSelection()

function onCardClick() {
  if (selection.mode.value) selection.toggle(props.issue.iid)
}
```

Change the root element from:

```html
<div
  class="group relative flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 shadow-card transition-[background-color,box-shadow,border-color] duration-150 hover:border-border/0 hover:bg-accent/50 hover:shadow-pop focus-within:bg-accent/50"
  :class="{ 'animate-flash': highlight }"
>
```

to:

```html
<div
  data-testid="issue-card"
  class="group relative flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 shadow-card transition-[background-color,box-shadow,border-color] duration-150 hover:border-border/0 hover:bg-accent/50 hover:shadow-pop focus-within:bg-accent/50"
  :class="{ 'animate-flash': highlight, 'cursor-pointer select-none': selection.mode.value }"
  @click="onCardClick"
>
  <Checkbox
    v-if="selection.mode.value"
    :model-value="selection.isSelected(issue.iid)"
    :aria-label="`Select issue #${issue.iid}`"
    class="absolute top-2 right-2 z-10"
    @update:model-value="() => selection.toggle(issue.iid)"
    @click.stop
  />
```

(Insert the `<Checkbox>` as the first child inside the root `<div>`, before the existing content.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/components/IssueCard.test.ts`
Expected: PASS — existing tests unaffected (mode off by default → no checkbox, no toggle).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'IssueCard'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/components/IssueCard.vue src/components/IssueCard.test.ts
git commit -m "feat: add select-mode checkbox to IssueCard"
```

---

## Task 5: `useBulkIssueActions` composable

**Files:**
- Create: `src/composables/useBulkIssueActions.ts`
- Test: `src/composables/useBulkIssueActions.test.ts`

This wraps the existing per-issue mutations and applies them across iids with a confirm gate and a result toast. It returns four action methods. Each method:
1. Calls `confirm(...)`; returns `{ succeeded: 0, failed: 0, cancelled: true }` if declined.
2. Fires one mutation per iid, awaiting with `Promise.allSettled`.
3. Pushes a result toast (success tone if no failures, failed tone otherwise).
4. Returns `{ succeeded, failed, cancelled: false }`.

- [ ] **Step 1: Write the failing test**

Create `src/composables/useBulkIssueActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearToasts, toasts } from '@/composables/useToast'

const retagMutate = vi.fn()
const reassignMutate = vi.fn()
const setStatusMutate = vi.fn()
vi.mock('@/composables/useIssueMutations', () => ({
  useRetagIssue: () => ({ mutateAsync: retagMutate }),
  useReassignIssue: () => ({ mutateAsync: reassignMutate }),
}))
vi.mock('@/composables/useWorkItemStatus', () => ({
  useSetIssueStatus: () => ({ mutateAsync: setStatusMutate }),
}))
const confirmMock = vi.fn()
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: confirmMock }) }))

import { useBulkIssueActions } from './useBulkIssueActions'

beforeEach(() => {
  retagMutate.mockReset().mockResolvedValue(undefined)
  reassignMutate.mockReset().mockResolvedValue(undefined)
  setStatusMutate.mockReset().mockResolvedValue(undefined)
  confirmMock.mockReset()
  clearToasts()
})

describe('useBulkIssueActions', () => {
  it('does nothing when the confirm is declined', async () => {
    confirmMock.mockResolvedValue(false)
    const bulk = useBulkIssueActions('grp/proj')
    const r = await bulk.setStatus(['1', '2'], 's1', { id: 's1', name: 'Done' } as never)
    expect(r).toEqual({ succeeded: 0, failed: 0, cancelled: true })
    expect(setStatusMutate).not.toHaveBeenCalled()
  })

  it('applies status across all iids and toasts success', async () => {
    confirmMock.mockResolvedValue(true)
    const bulk = useBulkIssueActions('grp/proj')
    const status = { id: 's1', name: 'In progress' } as never
    const r = await bulk.setStatus(['1', '2', '3'], 's1', status)
    expect(setStatusMutate).toHaveBeenCalledTimes(3)
    expect(setStatusMutate).toHaveBeenCalledWith({ iid: '1', statusId: 's1', nextStatus: status })
    expect(r).toEqual({ succeeded: 3, failed: 0, cancelled: false })
    expect(toasts.value.at(-1)?.tone).toBe('success')
  })

  it('counts failures and toasts a failed tone', async () => {
    confirmMock.mockResolvedValue(true)
    reassignMutate.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const bulk = useBulkIssueActions('grp/proj')
    const r = await bulk.setAssignees(['1', '2'], ['alice'], [])
    expect(reassignMutate).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ succeeded: 1, failed: 1, cancelled: false })
    expect(toasts.value.at(-1)?.tone).toBe('failed')
  })

  it('addLabels sends addLabelIds, removeLabels sends removeLabelIds', async () => {
    confirmMock.mockResolvedValue(true)
    const bulk = useBulkIssueActions('grp/proj')
    await bulk.addLabels(['1'], ['l1', 'l2'])
    expect(retagMutate).toHaveBeenCalledWith({
      iid: '1',
      addLabelIds: ['l1', 'l2'],
      removeLabelIds: [],
      nextLabels: [],
    })
    retagMutate.mockClear()
    await bulk.removeLabels(['1'], ['l3'])
    expect(retagMutate).toHaveBeenCalledWith({
      iid: '1',
      addLabelIds: [],
      removeLabelIds: ['l3'],
      nextLabels: [],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/composables/useBulkIssueActions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

Create `src/composables/useBulkIssueActions.ts`:

```ts
import { useRetagIssue, useReassignIssue } from '@/composables/useIssueMutations'
import { useSetIssueStatus, type WorkItemStatus } from '@/composables/useWorkItemStatus'
import { useConfirm } from '@/composables/useConfirm'
import { pushToast } from '@/composables/useToast'

export interface BulkResult {
  succeeded: number
  failed: number
  cancelled: boolean
}

type AssigneeNode = { id: string; name: string; username: string; avatarUrl: string | null }

const CANCELLED: BulkResult = { succeeded: 0, failed: 0, cancelled: true }

// Apply a single-issue mutation across many iids. Each call is independent (the
// underlying mutations already patch the shared issues cache optimistically), so
// we fire them together and tally settled results.
async function runAcross(
  iids: string[],
  one: (iid: string) => Promise<unknown>,
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(iids.map((iid) => one(iid)))
  const failed = results.filter((r) => r.status === 'rejected').length
  return { succeeded: results.length - failed, failed }
}

function summarize(noun: string, succeeded: number, failed: number) {
  pushToast({
    tone: failed ? 'failed' : 'success',
    title: failed
      ? `${succeeded} ${noun} · ${failed} failed`
      : `${succeeded} ${noun}`,
  })
}

export function useBulkIssueActions(fullPath: string) {
  const retag = useRetagIssue(fullPath)
  const reassign = useReassignIssue(fullPath)
  const setStatusMutation = useSetIssueStatus(fullPath)
  const { confirm } = useConfirm()

  async function gate(question: string): Promise<boolean> {
    return confirm({
      title: question,
      confirmLabel: 'Apply',
      cancelLabel: 'Cancel',
    })
  }

  async function addLabels(iids: string[], labelIds: string[]): Promise<BulkResult> {
    if (!(await gate(`Add ${labelIds.length} label(s) to ${iids.length} issue(s)?`))) return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      retag.mutateAsync({ iid, addLabelIds: labelIds, removeLabelIds: [], nextLabels: [] }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  async function removeLabels(iids: string[], labelIds: string[]): Promise<BulkResult> {
    if (!(await gate(`Remove ${labelIds.length} label(s) from ${iids.length} issue(s)?`)))
      return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      retag.mutateAsync({ iid, addLabelIds: [], removeLabelIds: labelIds, nextLabels: [] }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  async function setAssignees(
    iids: string[],
    usernames: string[],
    nextAssignees: AssigneeNode[],
  ): Promise<BulkResult> {
    const label = usernames.length ? `Assign ${iids.length} issue(s)?` : `Unassign ${iids.length} issue(s)?`
    if (!(await gate(label))) return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      reassign.mutateAsync({ iid, assigneeUsernames: usernames, nextAssignees }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  async function setStatus(
    iids: string[],
    statusId: string,
    nextStatus: WorkItemStatus,
  ): Promise<BulkResult> {
    if (!(await gate(`Set status to "${nextStatus.name}" for ${iids.length} issue(s)?`)))
      return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      setStatusMutation.mutateAsync({ iid, statusId, nextStatus }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  return { addLabels, removeLabels, setAssignees, setStatus }
}
```

Note: `nextLabels: []` is passed because the optimistic patch in `useRetagIssue` replaces the cached labels with `nextLabels`; for bulk we can't cheaply compute each issue's resulting label set, so we pass an empty array and rely on the `onSettled` `invalidateQueries` to refetch the true labels. The `WorkItemStatus` type is exported from `useWorkItemStatus`; confirm the exact export name there before relying on it (it is `WorkItemStatus`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/composables/useBulkIssueActions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'useBulkIssueActions'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useBulkIssueActions.ts src/composables/useBulkIssueActions.test.ts
git commit -m "feat: add useBulkIssueActions for bulk label/assignee/status"
```

---

## Task 6: `BulkActionBar` component

**Files:**
- Create: `src/components/BulkActionBar.vue`
- Test: `src/components/BulkActionBar.test.ts`

The bar is presentational: it shows the count and action buttons, hosts the three pickers in popovers with local pending state + an Apply button, and emits semantic events. It holds NO mutation logic. Props it needs from the host: `count`, label `catalog`, `members`, `statuses`. Emits: `add-labels` / `remove-labels` (string[] of label ids), `set-assignee` (`{ username: string | null }`), `set-status` (`WorkItemStatus`), `open-combined`, `select-all`, `clear`.

To keep this task focused and testable, the pickers are wired to local refs and the Apply buttons emit. The label picker works in label **titles** (its model), so the bar maps chosen titles → ids via the `catalog` prop before emitting ids.

- [ ] **Step 1: Write the failing test**

Create `src/components/BulkActionBar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BulkActionBar from './BulkActionBar.vue'

const base = {
  count: 3,
  catalog: [{ id: 'l1', title: 'bug', color: '#f00' }],
  members: [],
  statuses: [],
}

describe('BulkActionBar', () => {
  it('renders the selected count', () => {
    const w = mount(BulkActionBar, { props: base })
    expect(w.text()).toContain('3 selected')
  })

  it('emits open-combined, select-all, and clear', async () => {
    const w = mount(BulkActionBar, { props: base })
    await w.get('[data-testid="bulk-open-combined"]').trigger('click')
    await w.get('[data-testid="bulk-select-all"]').trigger('click')
    await w.get('[data-testid="bulk-clear"]').trigger('click')
    expect(w.emitted('open-combined')).toHaveLength(1)
    expect(w.emitted('select-all')).toHaveLength(1)
    expect(w.emitted('clear')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/BulkActionBar.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

Create `src/components/BulkActionBar.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { Tag, UserPlus, CircleDot, ExternalLink, X, CheckCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import LabelPicker from '@/components/LabelPicker.vue'
import AssigneePicker from '@/components/AssigneePicker.vue'
import StatusPicker from '@/components/StatusPicker.vue'
import type { ProjectLabel } from '@/composables/useProjectLabels'
import type { ProjectMember } from '@/composables/useProjectMembers'
import type { WorkItemStatus } from '@/composables/useWorkItemStatus'

const props = defineProps<{
  count: number
  catalog: ProjectLabel[]
  members: ProjectMember[]
  statuses: WorkItemStatus[]
}>()

const emit = defineEmits<{
  'add-labels': [labelIds: string[]]
  'remove-labels': [labelIds: string[]]
  'set-assignee': [payload: { username: string | null }]
  'set-status': [status: WorkItemStatus]
  'open-combined': []
  'select-all': []
  clear: []
}>()

// --- Labels popover (titles <-> ids via catalog) ----------------------------
const labelsOpen = ref(false)
const pendingTitles = ref<string[]>([])
const labelMode = ref<'add' | 'remove'>('add')
const titleToId = computed(() => new Map(props.catalog.map((l) => [l.title, l.id])))
function applyLabels() {
  const ids = pendingTitles.value
    .map((t) => titleToId.value.get(t))
    .filter((id): id is string => !!id)
  if (!ids.length) return
  if (labelMode.value === 'add') emit('add-labels', ids)
  else emit('remove-labels', ids)
  pendingTitles.value = []
  labelsOpen.value = false
}

// --- Assignee popover -------------------------------------------------------
const assigneeOpen = ref(false)
const pendingAssignee = ref<string | null>(null)
function applyAssignee() {
  const username = props.members.find((m) => m.id === pendingAssignee.value)?.username ?? null
  emit('set-assignee', { username })
  assigneeOpen.value = false
}

// --- Status (StatusPicker emits immediately on select) ----------------------
function onSelectStatus(status: WorkItemStatus) {
  emit('set-status', status)
}
</script>

<template>
  <Transition name="bulk-bar">
    <div
      v-if="count > 0"
      data-testid="bulk-action-bar"
      class="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-pop backdrop-blur"
    >
      <span class="px-1 font-mono text-xs font-medium tabular-nums text-foreground">
        {{ count }} selected
      </span>
      <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <!-- Labels -->
      <div class="relative">
        <Button variant="ghost" size="sm" data-testid="bulk-labels" @click="labelsOpen = !labelsOpen">
          <Tag /> Labels
        </Button>
        <div
          v-if="labelsOpen"
          class="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-pop"
        >
          <div class="mb-2 inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              class="rounded px-2 py-0.5"
              :class="labelMode === 'add' ? 'bg-card text-foreground' : 'text-muted-foreground'"
              @click="labelMode = 'add'"
            >
              Add
            </button>
            <button
              type="button"
              class="rounded px-2 py-0.5"
              :class="labelMode === 'remove' ? 'bg-card text-foreground' : 'text-muted-foreground'"
              @click="labelMode = 'remove'"
            >
              Remove
            </button>
          </div>
          <LabelPicker v-model="pendingTitles" :catalog="catalog" label="Labels" />
          <Button class="mt-2 w-full" size="sm" data-testid="bulk-apply-labels" @click="applyLabels">
            {{ labelMode === 'add' ? 'Add to' : 'Remove from' }} {{ count }}
          </Button>
        </div>
      </div>

      <!-- Assign -->
      <div class="relative">
        <Button variant="ghost" size="sm" data-testid="bulk-assign" @click="assigneeOpen = !assigneeOpen">
          <UserPlus /> Assign
        </Button>
        <div
          v-if="assigneeOpen"
          class="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-pop"
        >
          <AssigneePicker v-model="pendingAssignee" :members="members" label="Assignee" />
          <Button class="mt-2 w-full" size="sm" data-testid="bulk-apply-assignee" @click="applyAssignee">
            Assign {{ count }}
          </Button>
        </div>
      </div>

      <!-- Status (applies on pick) -->
      <StatusPicker
        v-if="statuses.length"
        :statuses="statuses"
        :current="null"
        label="Status"
        data-testid="bulk-status"
        @select="onSelectStatus"
      />

      <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <Button variant="ghost" size="sm" data-testid="bulk-open-combined" @click="emit('open-combined')">
        <ExternalLink /> Open combined
      </Button>
      <Button variant="ghost" size="sm" data-testid="bulk-select-all" @click="emit('select-all')">
        <CheckCheck /> Select all
      </Button>
      <Button variant="ghost" size="sm" data-testid="bulk-clear" @click="emit('clear')">
        <X /> Clear
      </Button>
    </div>
  </Transition>
</template>

<style scoped>
.bulk-bar-enter-active,
.bulk-bar-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.bulk-bar-enter-from,
.bulk-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
```

Before implementing, verify the exact exported type names by reading the heads of `src/composables/useProjectLabels.ts` (`ProjectLabel`), `src/composables/useProjectMembers.ts` (`ProjectMember`), and `src/composables/useWorkItemStatus.ts` (`WorkItemStatus`). If a name differs, use the actual exported name. If `bg-popover` is not a defined token, use `bg-card` (check `src/styles.css` / tailwind theme).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/BulkActionBar.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'BulkActionBar'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/components/BulkActionBar.vue src/components/BulkActionBar.test.ts
git commit -m "feat: add BulkActionBar with label/assignee/status pickers"
```

---

## Task 7: Wire selection + bulk actions into `IssueList`

**Files:**
- Modify: `src/views/IssueList.vue`
- Test: `src/views/IssueList.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new describe block to `src/views/IssueList.test.ts` (keep existing). The existing file already mocks `useProjectLabels`, `useProjectMembers`, `useWorkItemStatus` returning empty refs, and stubs `IssueDrawer`/`IssueComposer`. Add:

```ts
describe('IssueList — select mode', () => {
  it('toggling select mode renders checkboxes on rows', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await flushPromises()
    expect(w.find('[data-slot="checkbox"]').exists()).toBe(false)
    await w.get('[data-testid="toggle-select-mode"]').trigger('click')
    expect(w.find('[data-slot="checkbox"]').exists()).toBe(true)
  })

  it('shows the bulk action bar once an issue is selected', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await flushPromises()
    await w.get('[data-testid="toggle-select-mode"]').trigger('click')
    expect(w.find('[data-testid="bulk-action-bar"]').exists()).toBe(false)
    await w.get('[data-testid="issue-row"]').trigger('click')
    expect(w.find('[data-testid="bulk-action-bar"]').exists()).toBe(true)
  })
})
```

(The existing `mountList` stubs `IssueDrawer`/`IssueComposer` but renders real `IssueRow`; `BulkActionBar` will render for real.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: FAIL — no `toggle-select-mode` button.

- [ ] **Step 3: Implement**

In `src/views/IssueList.vue` `<script setup>`:

(a) Add imports (next to the other component/composable imports):

```ts
import { provide } from 'vue'
import { CheckSquare } from '@lucide/vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import { useIssueSelection, IssueSelectionKey } from '@/composables/useIssueSelection'
import { useBulkIssueActions } from '@/composables/useBulkIssueActions'
```

(b) After `const { confirm } = useConfirm()` (or near the top of setup where `props`/`route` exist), construct + provide the selection and bulk actions:

```ts
// Multi-select state, shared with rows/cards via inject (see useIssueSelection).
const selection = useIssueSelection(toRef(props, 'fullPath'))
provide(IssueSelectionKey, selection)
const bulk = useBulkIssueActions(props.fullPath)

// The iids currently loaded (across pages) — what "Select all" selects.
const loadedIids = computed(() => issues.value.map((i) => i.iid))

function toggleSelectMode() {
  selection.setMode(!selection.mode.value)
}

// Map BulkActionBar intents onto useBulkIssueActions. The bar emits label ids /
// member usernames / a status; we pass the current selection's iids.
function selectedIids() {
  return [...selection.selected.value]
}
function onAddLabels(labelIds: string[]) {
  bulk.addLabels(selectedIids(), labelIds)
}
function onRemoveLabels(labelIds: string[]) {
  bulk.removeLabels(selectedIids(), labelIds)
}
function onSetAssignee({ username }: { username: string | null }) {
  const member = members.value?.find((m) => m.username === username)
  const nextAssignees = member
    ? [{ id: member.id, name: member.name, username: member.username, avatarUrl: member.avatarUrl ?? null }]
    : []
  bulk.setAssignees(selectedIids(), username ? [username] : [], nextAssignees)
}
function onSetStatus(status: { id: string; name: string }) {
  bulk.setStatus(selectedIids(), status.id, status as never)
}
```

Note: `issues`, `members`, `toRef`, `computed`, `useConfirm` are already in scope in this file (verify). `members` comes from `useProjectMembers`. `labelCatalog` / `projectLabels` and `statusCatalog` are already computed in this file for the board — reuse them for the bar's props (`catalog`, `statuses`).

(c) In the template, add the select-mode toggle button inside the existing "view toggle" cluster's row. Place it as a sibling just before the `role="group" aria-label="Switch view"` div (inside the same flex toolbar row):

```html
        <button
          type="button"
          data-testid="toggle-select-mode"
          aria-label="Toggle select mode"
          :aria-pressed="selection.mode.value"
          class="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="selection.mode.value ? 'bg-card text-foreground ring-1 ring-border' : ''"
          @click="toggleSelectMode"
        >
          <CheckSquare class="size-4" />
        </button>
```

(d) Render the bar near the end of the root `<section>` (after `<IssueComposer .../>`):

```html
    <BulkActionBar
      :count="selection.count.value"
      :catalog="labelCatalog"
      :members="members ?? []"
      :statuses="statusCatalog ?? []"
      @add-labels="onAddLabels"
      @remove-labels="onRemoveLabels"
      @set-assignee="onSetAssignee"
      @set-status="onSetStatus"
      @open-combined="() => {}"
      @select-all="selection.selectAll(loadedIids)"
      @clear="selection.clear()"
    />
```

(`@open-combined` is a no-op placeholder here — Plan 2 wires it to the combined window.) Verify the exact names `labelCatalog` and `statusCatalog` in this file; the board code uses `labelCatalog.value` and `statusCatalog.value` — pass the `.value`-unwrapped refs as shown (template auto-unwraps, so `:catalog="labelCatalog"` passes the array). If `statusCatalog` is a `Ref`, use `:statuses="statusCatalog ?? []"`.

(e) Gate board drag on select mode: on the board card wrapper `<div ... draggable="true">`, make `draggable` conditional and no-op the drag handlers in select mode:

```html
        <div
          v-for="(issue, i) in g.issues"
          :key="issue.iid"
          :draggable="!selection.mode.value"
          class="group/card transition-opacity"
          :class="[
            selection.mode.value ? '' : 'cursor-grab active:cursor-grabbing',
            draggingIid === issue.iid ? 'opacity-40' : '',
            justDropped === issue.iid ? 'animate-drop-in' : '',
          ]"
          :style="{ order: i * 2, viewTransitionName: vtNameFor(issue.iid) }"
          @dragstart="!selection.mode.value && onDragStart(issue, $event)"
          @dragend="clearDrag"
        >
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS — including all existing IssueList tests (select mode defaults off, so rows render with the navigation overlay and no checkbox, and the bar is hidden).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'IssueList'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: wire multi-select and bulk actions into IssueList"
```

---

## Final Verification (Plan 1)

- [ ] **Full suite**

Run: `bunx vitest run`
Expected: PASS, no regressions.

- [ ] **Typecheck (no new errors in changed files)**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -iE 'checkbox|useIssueSelection|useBulkIssueActions|BulkActionBar|IssueRow|IssueCard|IssueList'`
Expected: empty.

- [ ] **Manual smoke** (optional, GUI)

`bun run app:dev`: toggle select mode → checkboxes appear on rows/cards; select a few → bar shows count; Labels (Add/Remove) → confirm → toast; Assign → confirm → toast; Status → confirm → toast; board drag disabled in select mode; Clear empties; toggling mode off hides checkboxes.
