# Unified App Shell — Phase 1 (Foundation + Global Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent app-shell foundation (slim icon rail + contextual top bar + content container) and adopt it on the two global views (My Work, Projects), without touching project/detail views yet.

**Architecture:** A new `src/shared/components/shell/` module (`AppShell`, `AppIconRail`, `AppTopBar`, `ViewContainer`). `App.vue` renders the shell around `<RouterView>` only for routes that opt in via `route.meta.shell === true` (and not popped-out windows), so un-migrated views render exactly as today — no double headers. Phase 1 opts in `home` + `projects`. Phases 2 (project list views + `ProjectTabNav`) and 3 (detail views) are follow-on plans.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, vue-router, reka-ui, Tailwind v4, lucide. Tests: vitest (`bunx vitest run`), `@vue/test-utils` (memory router where routing matters).

**Conventions:**
- Run `bun run format` then `bun run typecheck` after each task. Tests: `bunx vitest run` (never `bun test`).
- This plan is the first of three for the Unified App Shell spec (`docs/superpowers/specs/2026-06-09-unified-app-shell-design.md`). Phase 1 is independently mergeable.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/shared/composables/useCommandPalette.ts` | shared open/close state so the rail's Search button can open the palette |
| `src/shared/components/CommandPalette.vue` | (modify) use the shared open state |
| `src/shared/lib/chrome.ts` | pure `shouldShowChrome(route)` predicate |
| `src/shared/lib/chrome.test.ts` | tests for the predicate |
| `src/shared/components/shell/ViewContainer.vue` | width-prop'd centered content container |
| `src/shared/components/shell/AppIconRail.vue` | constant global icon rail |
| `src/shared/components/shell/AppTopBar.vue` | contextual top bar (Phase 1: global-title branch + slot target) |
| `src/shared/components/shell/AppShell.vue` | composes rail + top bar + content slot |
| `src/App.vue` | (modify) render shell when chrome is on, else bare main |
| `src/router/index.ts` | (modify) `meta: { shell: true }` on home + projects |
| `src/views/MyWork.vue` | (modify) drop inline header; use ViewContainer (narrow) |
| `src/views/ProjectPicker.vue` | (modify) drop title/back-link; use ViewContainer (wide) |

---

## Task 1: Shared command-palette open state

**Files:**
- Create: `src/shared/composables/useCommandPalette.ts`
- Create: `src/shared/composables/useCommandPalette.test.ts`
- Modify: `src/shared/components/CommandPalette.vue`

- [ ] **Step 1: Write the failing test**

Create `src/shared/composables/useCommandPalette.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useCommandPalette } from './useCommandPalette'

describe('useCommandPalette', () => {
  beforeEach(() => useCommandPalette().close())

  it('shares one open state across callers', () => {
    const a = useCommandPalette()
    const b = useCommandPalette()
    expect(a.isOpen.value).toBe(false)
    a.open()
    expect(b.isOpen.value).toBe(true)
    b.close()
    expect(a.isOpen.value).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/composables/useCommandPalette.test.ts`
Expected: FAIL — cannot resolve `./useCommandPalette`.

- [ ] **Step 3: Implement the composable**

Create `src/shared/composables/useCommandPalette.ts`:

```ts
import { ref } from 'vue'

// Module-level so the palette (mounted once in App.vue) and any opener (the
// shell's Search button, the ⌘K handler) share one open flag.
const isOpen = ref(false)

export function useCommandPalette() {
  return {
    isOpen,
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
  }
}
```

- [ ] **Step 4: Wire CommandPalette to the shared state**

In `src/shared/components/CommandPalette.vue`, replace the local open ref with the shared one. Change:

```ts
const open = ref(false)
```

to:

```ts
import { useCommandPalette } from '@/shared/composables/useCommandPalette'
// ...
const { isOpen: open } = useCommandPalette()
```

(Place the import with the other imports; remove `ref` from the import if it becomes unused — check; `ref` is still used for `query`/`active`/`input`, so keep it.) The rest of the component (`open.value`, `v-model:open="open"`, the `onKeyStroke` setting `open.value = true`, `close()` setting `open.value = false`) works unchanged against the shared ref.

- [ ] **Step 5: Run tests**

Run: `bunx vitest run src/shared/composables/useCommandPalette.test.ts src/shared/components/CommandPalette.test.ts`
Expected: PASS (the composable test + the existing palette component test).

- [ ] **Step 6: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/composables/useCommandPalette.ts src/shared/composables/useCommandPalette.test.ts src/shared/components/CommandPalette.vue
git commit -m "feat(shell): shared command-palette open state"
```

---

## Task 2: `shouldShowChrome` predicate

**Files:**
- Create: `src/shared/lib/chrome.ts`
- Test: `src/shared/lib/chrome.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/lib/chrome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldShowChrome } from './chrome'

describe('shouldShowChrome', () => {
  it('shows chrome when the route opts in and is not a popped-out window', () => {
    expect(shouldShowChrome({ meta: { shell: true }, query: {} })).toBe(true)
  })
  it('hides chrome when the route does not opt in', () => {
    expect(shouldShowChrome({ meta: {}, query: {} })).toBe(false)
    expect(shouldShowChrome({ meta: { shell: false }, query: {} })).toBe(false)
  })
  it('hides chrome for a popped-out window even if the route opts in', () => {
    expect(shouldShowChrome({ meta: { shell: true }, query: { window: '1' } })).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/lib/chrome.test.ts`
Expected: FAIL — cannot resolve `./chrome`.

- [ ] **Step 3: Implement**

Create `src/shared/lib/chrome.ts`:

```ts
import type { RouteLocationNormalizedLoaded } from 'vue-router'

type ChromeRoute = Pick<RouteLocationNormalizedLoaded, 'meta' | 'query'>

/**
 * The persistent app shell renders only for routes that opt in via
 * `meta.shell`, and never for a view popped into its own native window
 * (`?window=1`). Everything else (Connect, multi-issue window, un-migrated
 * views) renders bare.
 */
export function shouldShowChrome(route: ChromeRoute): boolean {
  return route.meta.shell === true && route.query.window !== '1'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/lib/chrome.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/lib/chrome.ts src/shared/lib/chrome.test.ts
git commit -m "feat(shell): shouldShowChrome route predicate"
```

---

## Task 3: `ViewContainer`

**Files:**
- Create: `src/shared/components/shell/ViewContainer.vue`
- Test: `src/shared/components/shell/ViewContainer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/shell/ViewContainer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewContainer from './ViewContainer.vue'

describe('ViewContainer', () => {
  it('defaults to the medium width', () => {
    const w = mount(ViewContainer, { slots: { default: '<p>body</p>' } })
    expect(w.classes()).toContain('max-w-5xl')
    expect(w.text()).toContain('body')
  })
  it('applies narrow and wide widths', () => {
    expect(mount(ViewContainer, { props: { width: 'narrow' } }).classes()).toContain('max-w-3xl')
    expect(mount(ViewContainer, { props: { width: 'wide' } }).classes()).toContain('max-w-7xl')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/ViewContainer.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/shared/components/shell/ViewContainer.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ width?: 'default' | 'narrow' | 'wide' }>(), { width: 'default' })
</script>

<template>
  <div
    class="mx-auto w-full px-6 py-8"
    :class="{
      'max-w-3xl': width === 'narrow',
      'max-w-5xl': width === 'default',
      'max-w-7xl': width === 'wide',
    }"
  >
    <slot />
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/ViewContainer.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/ViewContainer.vue src/shared/components/shell/ViewContainer.test.ts
git commit -m "feat(shell): view container with width variants"
```

---

## Task 4: `AppIconRail`

**Files:**
- Create: `src/shared/components/shell/AppIconRail.vue`
- Test: `src/shared/components/shell/AppIconRail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/shell/AppIconRail.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'

const openSettings = vi.fn()
vi.mock('@/shared/composables/useSettings', () => ({ openSettings }))

const { sessionState } = vi.hoisted(() => ({ sessionState: { unavailable: false } }))
vi.mock('@/shared/composables/useSession', () => ({ sessionState }))

import AppIconRail from './AppIconRail.vue'
import { useCommandPalette } from '@/shared/composables/useCommandPalette'

function mountRail() {
  return mount(AppIconRail, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('AppIconRail', () => {
  it('links to My Work (home) and Projects', () => {
    const targets = mountRail()
      .findAllComponents(RouterLinkStub)
      .map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'home' })
    expect(targets).toContainEqual({ name: 'projects' })
  })

  it('opens the command palette from the search button', () => {
    useCommandPalette().close()
    const w = mountRail()
    w.get('[data-testid="rail-search"]').trigger('click')
    expect(useCommandPalette().isOpen.value).toBe(true)
  })

  it('opens settings from the settings button', () => {
    openSettings.mockClear()
    mountRail().get('[data-testid="rail-settings"]').trigger('click')
    expect(openSettings).toHaveBeenCalledOnce()
  })

  it('reflects an unavailable session on the connection dot', async () => {
    sessionState.unavailable = true
    const w = mountRail()
    expect(w.get('[data-testid="rail-connection"]').classes().join(' ')).toContain('text-amber')
    sessionState.unavailable = false
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/AppIconRail.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/shared/components/shell/AppIconRail.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { House, FolderGit2, Search, Settings, Circle } from '@lucide/vue'
import { useCommandPalette } from '@/shared/composables/useCommandPalette'
import { openSettings } from '@/shared/composables/useSettings'
import { sessionState } from '@/shared/composables/useSession'

const { open: openPalette } = useCommandPalette()
const connectionClass = computed(() =>
  sessionState.unavailable ? 'text-amber-400' : 'text-emerald-400',
)

const linkClass =
  'flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
</script>

<template>
  <nav
    class="flex h-full w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-card/40 py-3"
    aria-label="Global navigation"
  >
    <RouterLink :to="{ name: 'home' }" :class="linkClass" title="My Work" aria-label="My Work">
      <House class="size-5" />
    </RouterLink>
    <RouterLink :to="{ name: 'projects' }" :class="linkClass" title="Projects" aria-label="Projects">
      <FolderGit2 class="size-5" />
    </RouterLink>
    <button
      type="button"
      data-testid="rail-search"
      :class="linkClass"
      title="Search (⌘K)"
      aria-label="Search"
      @click="openPalette()"
    >
      <Search class="size-5" />
    </button>

    <div class="flex-1" />

    <button
      type="button"
      data-testid="rail-settings"
      :class="linkClass"
      title="Settings"
      aria-label="Settings"
      @click="openSettings()"
    >
      <Settings class="size-5" />
    </button>
    <span
      data-testid="rail-connection"
      class="flex size-9 items-center justify-center"
      :class="connectionClass"
      :title="sessionState.unavailable ? 'Reconnecting…' : 'Connected'"
    >
      <Circle class="size-2.5 fill-current" />
    </span>
  </nav>
</template>
```

> Before implementing, confirm: `openSettings` is exported from `@/shared/composables/useSettings`; `sessionState` (with `.unavailable`) from `@/shared/composables/useSession`; and `House`, `FolderGit2`, `Search`, `Settings`, `Circle` are exported by `@lucide/vue`. Substitute the nearest existing icon if a name differs, and note it. The test asserts the connection class contains `text-amber` — `text-amber-400` satisfies that.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/AppIconRail.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/AppIconRail.vue src/shared/components/shell/AppIconRail.test.ts
git commit -m "feat(shell): global icon rail"
```

---

## Task 5: `AppTopBar`

**Files:**
- Create: `src/shared/components/shell/AppTopBar.vue`
- Test: `src/shared/components/shell/AppTopBar.test.ts`

Phase 1 implements the **global** branch: a title derived from the route plus a right-aligned teleport target (`#app-topbar-slot`) that later phases/views fill. The project + detail branches arrive in Phase 2/3.

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/shell/AppTopBar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppTopBar from './AppTopBar.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/projects', name: 'projects', component: { template: '<div/>' } },
  ],
})

async function mountAt(path: string) {
  await router.push(path)
  await router.isReady()
  return mount(AppTopBar, { global: { plugins: [router] } })
}

describe('AppTopBar', () => {
  it('shows the My Work title on the home route', async () => {
    expect((await mountAt('/')).text()).toContain('My Work')
  })
  it('shows the Projects title on the projects route', async () => {
    expect((await mountAt('/projects')).text()).toContain('Projects')
  })
  it('renders the top-bar slot target', async () => {
    expect((await mountAt('/')).find('#app-topbar-slot').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/AppTopBar.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/shared/components/shell/AppTopBar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// Phase 1: global views only. Later phases add project (breadcrumb + tabs) and
// detail (back + breadcrumb) branches keyed on route.params.fullPath.
const GLOBAL_TITLES: Record<string, string> = {
  home: 'My Work',
  projects: 'Projects',
}
const title = computed(() => GLOBAL_TITLES[String(route.name ?? '')] ?? '')
</script>

<template>
  <header
    class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4"
  >
    <h1 class="text-sm font-semibold text-foreground">{{ title }}</h1>
    <!-- Views teleport their context affordances (search, primary action) here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/AppTopBar.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/AppTopBar.vue src/shared/components/shell/AppTopBar.test.ts
git commit -m "feat(shell): contextual top bar (global branch)"
```

---

## Task 6: `AppShell`

**Files:**
- Create: `src/shared/components/shell/AppShell.vue`
- Test: `src/shared/components/shell/AppShell.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/shell/AppShell.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppShell from './AppShell.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'home', component: { template: '<div/>' } }],
})

describe('AppShell', () => {
  it('renders the rail, top bar, and slotted view content', async () => {
    await router.push('/')
    await router.isReady()
    const w = mount(AppShell, {
      slots: { default: '<p data-testid="view">the view</p>' },
      global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.find('nav[aria-label="Global navigation"]').exists()).toBe(true)
    expect(w.find('#app-topbar-slot').exists()).toBe(true)
    expect(w.find('[data-testid="view"]').text()).toBe('the view')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/AppShell.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/shared/components/shell/AppShell.vue`:

```vue
<script setup lang="ts">
import AppIconRail from './AppIconRail.vue'
import AppTopBar from './AppTopBar.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background text-foreground">
    <AppIconRail />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopBar />
      <div class="flex-1 overflow-y-auto overflow-x-clip">
        <slot />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/AppShell.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/AppShell.vue src/shared/components/shell/AppShell.test.ts
git commit -m "feat(shell): app shell composing rail + top bar + content"
```

---

## Task 7: Wire the shell into `App.vue` + opt in home/projects

**Files:**
- Modify: `src/App.vue`
- Modify: `src/router/index.ts`
- Test: `src/router/index.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/router/index.test.ts`:

```ts
describe('shell opt-in meta', () => {
  it('opts the global views into the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/').meta.shell).toBe(true)
    expect(router.resolve('/projects').meta.shell).toBe(true)
  })
  it('leaves project + window routes out of the shell (phase 1)', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues').meta.shell).toBeFalsy()
    expect(router.resolve('/projects/grp/proj/issues-window').meta.shell).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/router/index.test.ts`
Expected: FAIL — no `meta.shell` set.

- [ ] **Step 3: Add the meta**

In `src/router/index.ts`, add `meta: { shell: true }` to the `home` and `projects` route records:

```ts
  {
    path: '/',
    name: 'home',
    component: MyWork,
    meta: { shell: true },
  },
  {
    path: '/projects',
    name: 'projects',
    component: ProjectPicker,
    meta: { shell: true },
  },
```

- [ ] **Step 4: Run to verify the router test passes**

Run: `bunx vitest run src/router/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `App.vue`**

Replace the `<template>`'s `<main>` block in `src/App.vue`. Add imports in `<script setup>`:

```ts
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/shared/components/shell/AppShell.vue'
import { shouldShowChrome } from '@/shared/lib/chrome'
```

Add (after the existing `onMounted`/`onUnmounted` block):

```ts
const route = useRoute()
const chrome = computed(() => shouldShowChrome(route))
```

Change the template's outer markup so the shell wraps the view when chrome is on, else the bare main renders as today:

```vue
<template>
  <AppShell v-if="chrome">
    <RouterView :key="$route.path" />
  </AppShell>
  <div v-else class="min-h-screen overflow-x-clip bg-background text-foreground">
    <main class="mx-auto max-w-5xl px-4 py-6">
      <RouterView :key="$route.path" />
    </main>
  </div>

  <!-- Single shared instances for the whole app -->
  <ConfirmDialog />
  <SettingsDialog />
  <ToastHost />
  <SessionExpiredOverlay />
  <ConnectionBanner />
  <CommandPalette />
</template>
```

- [ ] **Step 6: Typecheck + full suite**

Run: `bun run typecheck`
Run: `bunx vitest run`
Expected: PASS. (The shell now renders on `/` and `/projects`. MyWork and ProjectPicker still render their own headers underneath the shell bar at this point — that double-header is fixed in Tasks 8 and 9; it is a transient state on the branch, not yet shipped.)

- [ ] **Step 7: Format, commit**

```bash
bun run format
git add src/App.vue src/router/index.ts src/router/index.test.ts
git commit -m "feat(shell): mount the shell for opted-in routes"
```

---

## Task 8: Migrate `MyWork.vue`

**Files:**
- Modify: `src/views/MyWork.vue`
- Test: `src/views/MyWork.test.ts` (update)

- [ ] **Step 1: Update the test for the new structure**

In `src/views/MyWork.test.ts`, the first test asserts `w.text()` contains the three lane titles + items. The view no longer renders its own "My Work" `<h1>` or "Projects" link (those move to the shell), but the lane titles remain. Remove any assertion that depends on the in-view header. Add an assertion that the in-view header is gone:

```ts
  it('does not render its own page header (the shell provides it)', () => {
    const w = mount(MyWork, { global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.find('h1').exists()).toBe(false)
  })
```

(Keep the existing "renders the three lanes" and "skeleton while username resolves" tests — they don't rely on the header.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/MyWork.test.ts`
Expected: FAIL — the view still renders an `<h1>`.

- [ ] **Step 3: Migrate the view**

In `src/views/MyWork.vue`, replace the outer `<div class="mx-auto w-full max-w-3xl px-6 py-8">` + `<header>` with `ViewContainer` (narrow) and drop the header entirely. Add the import:

```ts
import ViewContainer from '@/shared/components/shell/ViewContainer.vue'
```

New template:

```vue
<template>
  <ViewContainer width="narrow">
    <div class="space-y-8">
      <DashboardLane
        title="Assigned Issues"
        :count="assignedIssues.issues.value.length"
        :is-loading="issuesLoading"
        :error="assignedIssues.error.value"
        :is-empty="!assignedIssues.issues.value.length"
        :has-more="assignedIssues.hasMore.value"
        empty-message="Nothing assigned to you."
      >
        <li v-for="issue in assignedIssues.issues.value" :key="issue.iid">
          <DashboardIssueRow :issue="issue" />
        </li>
      </DashboardLane>

      <DashboardLane
        title="Assigned MRs"
        :count="assignedMrs.mrs.value.length"
        :is-loading="assignedMrs.isLoading.value"
        :error="assignedMrs.error.value"
        :is-empty="!assignedMrs.mrs.value.length"
        :has-more="assignedMrs.hasMore.value"
        empty-message="No MRs assigned."
      >
        <li v-for="mr in assignedMrs.mrs.value" :key="mr.iid">
          <DashboardMrRow :mr="mr" />
        </li>
      </DashboardLane>

      <DashboardLane
        title="Awaiting My Review"
        :count="reviewMrs.mrs.value.length"
        :is-loading="reviewMrs.isLoading.value"
        :error="reviewMrs.error.value"
        :is-empty="!reviewMrs.mrs.value.length"
        :has-more="reviewMrs.hasMore.value"
        empty-message="No reviews requested — you're clear."
      >
        <li v-for="mr in reviewMrs.mrs.value" :key="mr.iid">
          <DashboardMrRow :mr="mr" />
        </li>
      </DashboardLane>
    </div>
  </ViewContainer>
</template>
```

(The `<script setup>` is unchanged except the new `ViewContainer` import. `RouterLink` is no longer used in the template — that's fine, it was a global component, not an import.)

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/MyWork.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/MyWork.vue src/views/MyWork.test.ts
git commit -m "feat(shell): adopt the shell in My Work"
```

---

## Task 9: Migrate `ProjectPicker.vue`

**Files:**
- Modify: `src/views/ProjectPicker.vue`
- Test: `src/views/ProjectPicker.test.ts` (update)

The picker keeps its prominent in-body search (a deliberate launcher affordance). It only sheds the duplicate `← My Work` back-link and the `Projects` title/eyebrow (the shell top bar shows "Projects"; the rail provides My Work). The big count display can stay in-body for now.

- [ ] **Step 1: Update the test**

In `src/views/ProjectPicker.test.ts`, the back-link test ("links back to My Work from the header") and any assertion on the `← My Work` link / the `data-testid="back-to-my-work"` element must be removed (that link moves to the rail). The `projectLinks()` helper that filtered out `back-to-my-work` can drop the filter (there's no longer a back-link RouterLink), but keeping the filter is harmless. Remove the dedicated back-link test:

```ts
// DELETE the test: it('links back to My Work from the header', ...)
```

Add an assertion that the back-link is gone:

```ts
  it('no longer renders an in-view My Work back-link (the rail provides it)', () => {
    const w = mountPicker() // use the file's existing mount helper
    expect(w.find('[data-testid="back-to-my-work"]').exists()).toBe(false)
  })
```

(Use whatever mount helper the test file already defines. Keep all project-row/launcher tests unchanged.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/ProjectPicker.test.ts`
Expected: FAIL — the `back-to-my-work` element still exists.

- [ ] **Step 3: Migrate the view**

In `src/views/ProjectPicker.vue`:

1. Add the import:
```ts
import ViewContainer from '@/shared/components/shell/ViewContainer.vue'
```

2. Replace the root `<section class="space-y-5">` wrapper with `<ViewContainer width="wide"><section class="space-y-5">…</section></ViewContainer>` (the picker grid benefits from width).

3. Remove the `← My Work` RouterLink (the `<RouterLink ... data-testid="back-to-my-work">← My Work</RouterLink>`) and the `Projects` eyebrow + `<h1 ...>Projects</h1>` from the header block (lines ~73–85). Keep the count display block (the `<div v-if="!isLoading && !error" class="hidden shrink-0 …">` with the Odometer) and the search input. The header `<div class="flex items-end justify-between gap-4">` can stay to right-align the count; if removing the title leaves it lopsided, simplify to just the count block above the search.

The search input, `searchInput` ref, keyboard composable, spring cursor, rows, and pagination are all unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/ProjectPicker.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/ProjectPicker.vue src/views/ProjectPicker.test.ts
git commit -m "feat(shell): adopt the shell in Project Picker"
```

---

## Task 10: Phase 1 verification

**Files:** none (verification + cleanup commit if formatting changes anything).

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Full suite**

Run: `bunx vitest run`
Expected: PASS. The shell renders on `/` and `/projects` with no double headers (the two global views shed theirs); all other views render exactly as before (chrome off). If any pre-existing test assumed MyWork/ProjectPicker rendered their own header, it was updated in Tasks 8–9.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(shell): format" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage (Phase 1 slice):** A (chrome mounting/chrome-off) → Tasks 2,7; B (AppShell, AppIconRail, AppTopBar global branch, ViewContainer) → Tasks 3–6; C (global views migrated) → Tasks 8,9; D (ViewContainer width system, default/narrow/wide) → Task 3 + usage; E (testing) → each task. `ProjectTabNav`, the project + detail top-bar branches, list/detail view migration, and header deletions are **Phase 2/3** (follow-on plans) — intentionally out of this plan.
- **Type/name consistency:** `shouldShowChrome(route)`, `useCommandPalette().{isOpen,open,close}`, `ViewContainer` `width: 'default'|'narrow'|'wide'`, `AppShell`/`AppIconRail`/`AppTopBar` names and the `#app-topbar-slot` target id are used consistently across tasks.
- **Mergeable:** opt-in `meta.shell` means only home/projects get the shell; every other view is byte-for-byte unchanged in behavior. Phase 1 can merge to main on its own.
- **Deferred to Phase 2/3:** `ProjectTabNav`, top-bar project/detail branches, teleport slot consumers (`#primary-action`, `#detail-actions`), migrating Issues/MRs/Pipelines/IssueDetail/MRDetail, deleting `IssueListHeader`/`MergeRequestListHeader`, slimming `IssueMasthead`.
