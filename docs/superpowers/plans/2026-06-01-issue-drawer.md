# Issue Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking an issue opens a route-driven right-side drawer showing the full `IssueDetail`, with an Expand button that routes to the existing full page.

**Architecture:** A `?issue=<iid>` query param on the `issues` route drives the drawer (`IssueList` stays mounted, watches the query). A new `Sheet` UI primitive (reka-ui Dialog) hosts a presentational `IssueDrawer` that reuses `IssueDetail.vue` in its body. `IssueDrawer` is pure UI — it emits `update:open` (close) and `expand`; `IssueList` owns all routing (strip param to close, `push` to the `issue` route to expand).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, vue-router, reka-ui, `@lucide/vue`, Tailwind (shadcn-vue tokens), Vitest + @vue/test-utils (jsdom), bun.

**Conventions:**
- `cn` from `@/lib/utils`. UI primitives live in `src/components/ui/<name>/` with an `index.ts` barrel.
- Per-file style: `IssueList.vue` uses semicolons; `IssueRow.vue`/`IssueCard.vue`/`IssueDetail.vue` and tests omit them. Match the file you edit.
- One-shot tests: `bun run test -- --run <path>`. Typecheck: `bun run typecheck`.

---

## File Structure

- **Create** `src/components/ui/sheet/Sheet.vue` — DialogRoot passthrough (controlled `open`).
- **Create** `src/components/ui/sheet/SheetContent.vue` — portal + overlay + sided panel + built-in close (X).
- **Create** `src/components/ui/sheet/SheetHeader.vue` — header container.
- **Create** `src/components/ui/sheet/SheetTitle.vue` — DialogTitle wrapper (a11y).
- **Create** `src/components/ui/sheet/SheetDescription.vue` — DialogDescription wrapper (a11y).
- **Create** `src/components/ui/sheet/index.ts` — barrel.
- **Create** `src/components/IssueDrawer.vue` — presentational drawer; body reuses `IssueDetail.vue`.
- **Create** `src/components/IssueDrawer.test.ts`.
- **Create** `src/components/IssueCard.test.ts`.
- **Modify** `src/components/IssueRow.vue` — repoint overlay `RouterLink`.
- **Modify** `src/components/IssueRow.test.ts` — update expected `to`.
- **Modify** `src/components/IssueCard.vue` — repoint overlay `RouterLink`.
- **Modify** `src/views/IssueList.vue` — render `IssueDrawer`, wire query/close/expand.
- **Modify** `src/views/IssueList.test.ts` — install a router in the mount helper; add a drawer-open test.

---

## Task 1: Sheet UI primitive

**Files:**
- Create: `src/components/ui/sheet/Sheet.vue`, `SheetContent.vue`, `SheetHeader.vue`, `SheetTitle.vue`, `SheetDescription.vue`, `index.ts`

This is scaffolding for a thin reka-ui wrapper (like the existing `ui/select`); no unit test — verified by typecheck and downstream use.

- [ ] **Step 1: Create `src/components/ui/sheet/Sheet.vue`**

```vue
<script setup lang="ts">
import { DialogRoot, type DialogRootEmits, type DialogRootProps, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot data-slot="sheet" v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
```

- [ ] **Step 2: Create `src/components/ui/sheet/SheetContent.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { X } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<DialogContentProps & { class?: string; side?: 'top' | 'right' | 'bottom' | 'left' }>(),
  { side: 'right' },
)
const emits = defineEmits<DialogContentEmits>()

const delegated = computed(() => {
  const { class: _c, side: _s, ...rest } = props
  return rest
})
const forwarded = useForwardPropsEmits(delegated, emits)

const SIDE: Record<string, string> = {
  right:
    'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
  left:
    'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
  top: 'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom: 'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      data-slot="sheet-content"
      v-bind="forwarded"
      :class="
        cn(
          'fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
          SIDE[side],
          props.class,
        )
      "
    >
      <slot />
      <DialogClose
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="Close"
      >
        <X class="size-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
```

- [ ] **Step 3: Create `src/components/ui/sheet/SheetHeader.vue`**

```vue
<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
</script>

<template>
  <div data-slot="sheet-header" :class="cn('flex flex-col gap-1.5 p-4', props.class)">
    <slot />
  </div>
</template>
```

- [ ] **Step 4: Create `src/components/ui/sheet/SheetTitle.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { DialogTitle, type DialogTitleProps, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: string }>()
const delegated = computed(() => {
  const { class: _c, ...rest } = props
  return rest
})
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DialogTitle
    data-slot="sheet-title"
    v-bind="forwarded"
    :class="cn('text-foreground font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
```

- [ ] **Step 5: Create `src/components/ui/sheet/SheetDescription.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { DialogDescription, type DialogDescriptionProps, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogDescriptionProps & { class?: string }>()
const delegated = computed(() => {
  const { class: _c, ...rest } = props
  return rest
})
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DialogDescription
    data-slot="sheet-description"
    v-bind="forwarded"
    :class="cn('text-muted-foreground text-sm', props.class)"
  >
    <slot />
  </DialogDescription>
</template>
```

- [ ] **Step 6: Create `src/components/ui/sheet/index.ts`**

```ts
export { default as Sheet } from "./Sheet.vue"
export { default as SheetContent } from "./SheetContent.vue"
export { default as SheetHeader } from "./SheetHeader.vue"
export { default as SheetTitle } from "./SheetTitle.vue"
export { default as SheetDescription } from "./SheetDescription.vue"
```

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors). If `vue-tsc` reports an unused var on the destructured `_c`/`_s`, that is acceptable TS noise only if it errors — these are prefixed with `_` which the config ignores; if it errors, confirm `noUnusedLocals` handling and leave as-is since `_`-prefix is the project convention.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/sheet
git commit -m "feat: add Sheet UI primitive (reka-ui dialog)"
```

---

## Task 2: IssueDrawer component

**Files:**
- Create: `src/components/IssueDrawer.vue`
- Test: `src/components/IssueDrawer.test.ts`

`IssueDrawer` is presentational: props `open`, `fullPath`, `iid`; emits `update:open` and `expand`. The built-in X (from `SheetContent`) and ESC/overlay both fire reka's `update:open=false`, which we re-emit. Expand is a header button that emits `expand` — `IssueList` does the actual `router.push`.

- [ ] **Step 1: Write the failing test**

`src/components/IssueDrawer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueDrawer from './IssueDrawer.vue'

// IssueDetail does its own data fetching; stub it to a marker.
const IssueDetailStub = { name: 'IssueDetail', props: ['fullPath', 'iid'], template: '<div class="detail-stub">detail {{ iid }}</div>' }

const mountDrawer = (open: boolean, iid: string | null = '7') =>
  mount(IssueDrawer, {
    props: { open, fullPath: 'grp/proj', iid },
    global: {
      stubs: { teleport: true, IssueDetail: IssueDetailStub },
    },
  })

describe('IssueDrawer', () => {
  it('renders the issue detail and #iid title when open', () => {
    const w = mountDrawer(true)
    expect(w.find('.detail-stub').exists()).toBe(true)
    expect(w.text()).toContain('#7')
  })

  it('does not render the issue detail when closed', () => {
    const w = mountDrawer(false)
    expect(w.find('.detail-stub').exists()).toBe(false)
  })

  it('emits expand when the expand button is clicked', async () => {
    const w = mountDrawer(true)
    await w.get('[aria-label="Expand to full page"]').trigger('click')
    expect(w.emitted('expand')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run src/components/IssueDrawer.test.ts`
Expected: FAIL — cannot resolve `./IssueDrawer.vue` (file does not exist yet).

- [ ] **Step 3: Create `src/components/IssueDrawer.vue`**

```vue
<script setup lang="ts">
import { Maximize2 } from '@lucide/vue'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import IssueDetail from '@/views/IssueDetail.vue'

defineProps<{ open: boolean; fullPath: string; iid: string | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; expand: [] }>()
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-full gap-0 p-0 sm:max-w-[480px]">
      <SheetHeader class="flex-row items-center gap-2 border-b px-4 py-3">
        <SheetTitle class="text-sm">#{{ iid }}</SheetTitle>
        <SheetDescription class="sr-only">Issue details</SheetDescription>
        <!-- mr-6 keeps the expand button clear of SheetContent's absolute close (X) -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="ml-auto mr-6"
          aria-label="Expand to full page"
          @click="emit('expand')"
        >
          <Maximize2 />
        </Button>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <IssueDetail v-if="iid" :full-path="fullPath" :iid="iid" />
      </div>
    </SheetContent>
  </Sheet>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- --run src/components/IssueDrawer.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueDrawer.vue src/components/IssueDrawer.test.ts
git commit -m "feat: add IssueDrawer wrapping IssueDetail in a sheet"
```

---

## Task 3: Repoint the IssueRow link

**Files:**
- Modify: `src/components/IssueRow.vue:90-91`
- Test: `src/components/IssueRow.test.ts:18-20`

- [ ] **Step 1: Update the test to the new expectation (failing)**

In `src/components/IssueRow.test.ts`, replace the `expect(...props('to')...)` assertion:

```ts
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      query: { issue: '7' },
    })
```

(Also update the `it(...)` description to `'links to the issue drawer and shows the title + label'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run src/components/IssueRow.test.ts`
Expected: FAIL — received `{ name: 'issue', params: { fullPath: 'grp/proj', iid: '7' } }`.

- [ ] **Step 3: Repoint the link**

In `src/components/IssueRow.vue`, change the overlay `RouterLink`'s `:to`:

```vue
    <RouterLink
      :to="{ query: { issue: issue.iid } }"
```

(Leave the `:aria-label` and `class` lines unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- --run src/components/IssueRow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueRow.vue src/components/IssueRow.test.ts
git commit -m "feat: open issue drawer from IssueRow via ?issue query"
```

---

## Task 4: Repoint the IssueCard link

**Files:**
- Modify: `src/components/IssueCard.vue:61-62`
- Test: `src/components/IssueCard.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`src/components/IssueCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import IssueCard from './IssueCard.vue'

const issue = {
  iid: '7', title: 'Crash on save', state: 'opened' as const, webUrl: '#',
  labels: { nodes: [] }, assignees: { nodes: [] },
}

describe('IssueCard', () => {
  it('opens the issue drawer via the ?issue query', () => {
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('Crash on save')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      query: { issue: '7' },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run src/components/IssueCard.test.ts`
Expected: FAIL — received `{ name: 'issue', params: { fullPath: 'grp/proj', iid: '7' } }`.

- [ ] **Step 3: Repoint the link**

In `src/components/IssueCard.vue`, change the overlay `RouterLink`'s `:to`:

```vue
    <RouterLink
      :to="{ query: { issue: issue.iid } }"
```

(Leave `:aria-label`, `draggable`, and `class` unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- --run src/components/IssueCard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueCard.vue src/components/IssueCard.test.ts
git commit -m "feat: open issue drawer from IssueCard via ?issue query"
```

---

## Task 5: Wire the drawer into IssueList

**Files:**
- Modify: `src/views/IssueList.vue` (imports, setup logic, template)
- Test: `src/views/IssueList.test.ts` (router in mount helper + new test)

`IssueList` derives the open state from `route.query.issue`, strips it on close (via `router.replace`, no history entry), and pushes to the `issue` route on expand.

- [ ] **Step 1: Update the test mount helper + add the failing test**

In `src/views/IssueList.test.ts`:

Add imports at the top (after the existing imports):

```ts
import { createRouter, createMemoryHistory } from 'vue-router'
import IssueDrawer from '@/components/IssueDrawer.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'issues', component: { template: '<div />' } },
    { path: '/i/:iid', name: 'issue', component: { template: '<div />' } },
  ],
})
```

Replace the existing `mountList` helper with a router-aware, drawer-stubbing version:

```ts
const mountList = () =>
  mount(IssueList, {
    props: { fullPath: 'grp/proj' },
    global: {
      plugins: [router],
      stubs: { RouterLink: RouterLinkStub, IssueDrawer: true },
    },
  })
```

Add this test inside `describe('IssueList', ...)`:

```ts
  it('opens the drawer when ?issue is present', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    const drawer = w.findComponent(IssueDrawer)
    expect(drawer.props('open')).toBe(true)
    expect(drawer.props('iid')).toBe('7')
    await router.replace('/')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run src/views/IssueList.test.ts`
Expected: FAIL — `IssueList` does not render an `IssueDrawer` yet (`findComponent` returns an empty wrapper; `props('open')` is `undefined`). Other existing tests should still PASS now that a router is provided.

- [ ] **Step 3: Add router + drawer logic to `IssueList.vue` script**

In `src/views/IssueList.vue`, add to the imports:

```ts
import { useRoute, useRouter } from 'vue-router';
import IssueDrawer from '@/components/IssueDrawer.vue';
```

Then, near the top of `<script setup>` after `const props = defineProps<...>()` (the component already imports `computed`), add:

```ts
const route = useRoute();
const router = useRouter();

// Drawer is driven by ?issue=<iid> on this route, so back/refresh/links all work.
const openIid = computed(() => (route.query.issue ? String(route.query.issue) : null));

function setDrawerOpen(value: boolean) {
  if (value) return; // opening is driven by the issue links, not this handler
  const { issue: _issue, ...rest } = route.query;
  router.replace({ query: rest }); // replace: closing should not add a history entry
}

function expandIssue() {
  if (openIid.value) {
    router.push({ name: 'issue', params: { fullPath: props.fullPath, iid: openIid.value } });
  }
}
```

- [ ] **Step 4: Render the drawer in the template**

In `src/views/IssueList.vue`, add the drawer just before the closing root element of the template (sibling to the list/board content):

```vue
    <IssueDrawer
      :open="!!openIid"
      :full-path="fullPath"
      :iid="openIid"
      @update:open="setDrawerOpen"
      @expand="expandIssue"
    />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- --run src/views/IssueList.test.ts`
Expected: PASS (all tests, including the new drawer test and the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: render route-driven IssueDrawer from IssueList"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `bun run test -- --run`
Expected: PASS — all suites green (sheet primitive compiles via its consumers; IssueDrawer, IssueRow, IssueCard, IssueList all pass).

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS — no `vue-tsc` errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `bun run dev`, open a project's issue list, then:
- Click a row (list view) and a card (board view) → right drawer slides in at ~480px showing the issue (title, description, labels, assignees, notes, comment box). URL shows `?issue=<iid>`.
- Click **Expand** (⤢, top-right of the drawer header) → routes to the full `/projects/.../issues/<iid>` page.
- Reopen a drawer, press **ESC** / click the overlay / click the **X** → drawer closes and `?issue` is removed; browser **Back** does not reopen it (close used `replace`).
- Reload while `?issue=<iid>` is in the URL → drawer is open on load.
- Narrow the viewport below ~480px → drawer is full-width.

- [ ] **Step 4: Final commit (only if smoke testing required tweaks)**

```bash
git add -A
git commit -m "fix: issue drawer smoke-test adjustments"
```

(Skip if nothing changed.)
