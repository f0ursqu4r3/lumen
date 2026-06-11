# Unified App Shell — Phase 3 (Detail Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frame the full-page issue + merge-request detail views in the shell (breadcrumb + back + teleported detail actions), completing the unified-shell spec.

**Architecture:** Add a detail branch to `AppTopBar` (back + breadcrumb + `#iid`) for routes `issue`/`merge-request`; opt those routes into the shell (windowed `?window=1` stays bare). Migrate `MergeRequestDetail` (drop its in-view back-link, teleport "Open in GitLab" into `#app-topbar-slot`, wrap in `ViewContainer`). Slim `IssueMasthead` so that in full-page main-window mode it teleports its action cluster to the shell and drops its own eyebrow/back-link, while the **embedded (drawer)** and **windowed (popped-out)** modes render exactly as today. A new `ViewContainer` `'bare'` width (passthrough, no max-width) lets the same wrapper serve all three modes.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, vue-router, Teleport, Tailwind v4. Tests: vitest (`bunx vitest run`), `@vue/test-utils` (memory router, `RouterLinkStub`, `teleport` stub).

**Conventions:**
- Run `bun run format` then `bun run typecheck` after each task. Tests: `bunx vitest run` (never `bun test`).
- Phase 3 of the Unified App Shell spec (`docs/superpowers/specs/2026-06-09-unified-app-shell-design.md`). Phases 1 + 2 are on main. After Phase 3 every main-window view is framed by the shell.
- The shell (`AppShell`, `AppTopBar` with global + project branches, `#app-topbar-slot` teleport target, `ProjectTabNav`, `ViewContainer`) and `shouldShowChrome`/`meta.shell` already exist.

**Three modes of `IssueDetail`/`IssueMasthead` (critical):**
- **Full-page, main window** (route `issue`, no `?window=1`, `embedded=false`): shell present → masthead teleports actions to the shell, breadcrumb/back from the shell.
- **Popped-out native window** (`?window=1`): `shouldShowChrome` is false → no shell → masthead renders its own header as today.
- **Embedded in the drawer** (`embedded=true`, inside the issues-list route): the list's shell is present but belongs to the list; the embedded masthead renders inline as today (no teleport, inert eyebrow).
The teleport happens **only** in the `!embedded && !windowed` branch.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/shared/components/shell/ViewContainer.vue` | (modify) add `'bare'` width (passthrough) |
| `src/shared/components/shell/AppTopBar.vue` | (modify) add the detail branch (back + breadcrumb + #iid) |
| `src/router/index.ts` | (modify) `meta.shell` on `issue` + `merge-request` |
| `src/views/MergeRequestDetail.vue` | (modify) drop back-link; teleport Open-in-GitLab; ViewContainer |
| `src/features/issues/components/IssueMasthead.vue` | (modify) full-page mode teleports actions + drops eyebrow/back |
| `src/views/IssueDetail.vue` | (modify) wrap in mode-aware ViewContainer |

---

## Task 1: `ViewContainer` `'bare'` width

**Files:**
- Modify: `src/shared/components/shell/ViewContainer.vue`
- Test: `src/shared/components/shell/ViewContainer.test.ts` (extend)

A passthrough variant (full width, no centering/padding) so a view that sometimes renders inside an existing container (the popped-out window's `<main>`, the drawer) can use the same `<ViewContainer>` wrapper unconditionally.

- [ ] **Step 1: Write the failing test**

Append to `src/shared/components/shell/ViewContainer.test.ts`:

```ts
  it('renders a passthrough (no max-width, no padding) for the bare width', () => {
    const w = mount(ViewContainer, { props: { width: 'bare' }, slots: { default: '<p>x</p>' } })
    const cls = w.classes()
    expect(cls).not.toContain('max-w-5xl')
    expect(cls).not.toContain('mx-auto')
    expect(cls).not.toContain('px-6')
    expect(w.text()).toContain('x')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/ViewContainer.test.ts`
Expected: FAIL — `bare` isn't a valid width / still applies the padding classes.

- [ ] **Step 3: Implement**

Replace `src/shared/components/shell/ViewContainer.vue` with:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ width?: 'default' | 'narrow' | 'wide' | 'bare' }>(),
  { width: 'default' },
)

// `bare` is a passthrough for views that already sit inside an outer container
// (the popped-out window's <main>, the issue drawer) — full width, no padding.
const containerClass = computed(() => {
  if (props.width === 'bare') return 'w-full'
  const max = { default: 'max-w-5xl', narrow: 'max-w-3xl', wide: 'max-w-7xl' }[props.width]
  return `mx-auto w-full px-6 py-8 ${max}`
})
</script>

<template>
  <div :class="containerClass">
    <slot />
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/ViewContainer.test.ts`
Expected: PASS (the existing default/narrow/wide tests + the new bare test).

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/ViewContainer.vue src/shared/components/shell/ViewContainer.test.ts
git commit -m "feat(shell): bare passthrough width for ViewContainer"
```

---

## Task 2: `AppTopBar` detail branch

**Files:**
- Modify: `src/shared/components/shell/AppTopBar.vue`
- Test: `src/shared/components/shell/AppTopBar.test.ts` (extend)

Add a detail branch: when `route.name` ∈ {issue, merge-request} and `fullPath` is set, render a back-link to the parent list + breadcrumb (repo · Issues/MRs) + the issuable ref (`#iid` / `!iid`). The `#app-topbar-slot` carries the view's teleported actions. Keep the global + project branches.

- [ ] **Step 1: Write the failing test**

Append to `src/shared/components/shell/AppTopBar.test.ts` (the `usePipelines` mock + `RouterLinkStub` + `ProjectTabNav` import already exist from Phase 2; add an issue-detail route to a router and a describe block):

```ts
const detailRouter = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/projects/:fullPath(.*)/issues/:iid', name: 'issue', component: { template: '<div/>' } },
    { path: '/projects/:fullPath(.*)/merge-requests/:iid', name: 'merge-request', component: { template: '<div/>' } },
  ],
})

describe('AppTopBar detail branch', () => {
  it('shows a back-link to the issue list + the issue ref on an issue detail route', async () => {
    await detailRouter.push('/projects/grp/proj/issues/42')
    await detailRouter.isReady()
    const w = mount(AppTopBar, {
      global: { plugins: [detailRouter], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('#42')
    expect(w.text()).toContain('proj')
    const back = w
      .findAllComponents(RouterLinkStub)
      .find((l) => (l.props('to') as { name?: string }).name === 'issues')
    expect(back).toBeTruthy()
    expect(back!.props('to')).toEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
  })

  it('shows the !iid + a back-link to the MR list on a merge-request detail route', async () => {
    await detailRouter.push('/projects/grp/proj/merge-requests/5')
    await detailRouter.isReady()
    const w = mount(AppTopBar, {
      global: { plugins: [detailRouter], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('!5')
    const back = w
      .findAllComponents(RouterLinkStub)
      .find((l) => (l.props('to') as { name?: string }).name === 'merge-requests')
    expect(back!.props('to')).toEqual({ name: 'merge-requests', params: { fullPath: 'grp/proj' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/AppTopBar.test.ts`
Expected: FAIL — no detail branch (the global branch shows an empty title for these route names).

- [ ] **Step 3: Implement**

Replace `src/shared/components/shell/AppTopBar.vue` with:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import ProjectTabNav from './ProjectTabNav.vue'

const route = useRoute()

const PROJECT_LIST_ROUTES = ['issues', 'merge-requests', 'pipelines'] as const
// Each detail route maps to the parent list route + the ref sigil.
const DETAIL_ROUTES: Record<string, { list: string; sigil: string }> = {
  issue: { list: 'issues', sigil: '#' },
  'merge-request': { list: 'merge-requests', sigil: '!' },
}

const fullPath = computed(() => {
  const raw = route.params.fullPath
  return typeof raw === 'string' ? raw : ''
})
const name = computed(() => String(route.name ?? ''))
const iid = computed(() => {
  const raw = route.params.iid
  return typeof raw === 'string' ? raw : ''
})

const projectTab = computed(() =>
  fullPath.value && (PROJECT_LIST_ROUTES as readonly string[]).includes(name.value) ? name.value : null,
)
const detail = computed(() => (fullPath.value ? (DETAIL_ROUTES[name.value] ?? null) : null))
const { repoName, pathPrefix } = useRepoPath(fullPath)

const GLOBAL_TITLES: Record<string, string> = { home: 'My Work', projects: 'Projects' }
const globalTitle = computed(() => GLOBAL_TITLES[name.value] ?? '')
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4">
    <template v-if="projectTab">
      <span v-if="pathPrefix" class="truncate font-mono text-xs text-muted-foreground/70">
        {{ pathPrefix }}/
      </span>
      <span class="truncate text-sm font-semibold text-foreground">{{ repoName }}</span>
      <ProjectTabNav :full-path="fullPath" :active="projectTab" class="ml-1" />
    </template>

    <template v-else-if="detail">
      <RouterLink
        :to="{ name: detail.list, params: { fullPath } }"
        class="group/back flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="size-4 transition-transform group-hover/back:-translate-x-0.5" />
        <span class="truncate font-medium">{{ repoName }}</span>
      </RouterLink>
      <span class="font-mono text-xs tabular-nums text-muted-foreground/80">
        {{ detail.sigil }}{{ iid }}
      </span>
    </template>

    <h1 v-else class="text-sm font-semibold text-foreground">{{ globalTitle }}</h1>

    <!-- Views teleport their context affordances here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/AppTopBar.test.ts`
Expected: PASS (global + project + detail branch tests).

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/AppTopBar.vue src/shared/components/shell/AppTopBar.test.ts
git commit -m "feat(shell): top bar detail branch (back + breadcrumb + ref)"
```

---

## Task 3: Opt the detail routes into the shell

**Files:**
- Modify: `src/router/index.ts`
- Test: `src/router/index.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/router/index.test.ts`:

```ts
describe('shell opt-in for detail routes', () => {
  it('opts issue + merge-request detail into the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues/42').meta.shell).toBe(true)
    expect(router.resolve('/projects/grp/proj/merge-requests/5').meta.shell).toBe(true)
  })
  it('keeps the multi-issue window + connect out of the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues-window').meta.shell).toBeFalsy()
    expect(router.resolve('/connect').meta.shell).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/router/index.test.ts`
Expected: FAIL — detail routes have no `meta.shell`. (Also: the Phase-2 test `'keeps detail + window routes out of the shell (phase 2)'` asserts `/projects/grp/proj/issues/42` and `.../merge-requests/5` are falsy — that test must be updated, since those are now shell-on. Update it to only assert the window route is falsy, OR remove the detail-route assertions from it. Keep the `issues-window` assertion.)

- [ ] **Step 3: Add the meta**

In `src/router/index.ts`, add `meta: { shell: true }` to the `issue` and `merge-request` route records (the ones with `:iid`). Their `props` functions stay unchanged — add `meta` alongside:

```ts
  {
    path: '/projects/:fullPath(.*)/issues/:iid',
    name: 'issue',
    component: IssueDetail,
    props: (route) => ({
      fullPath: route.params.fullPath,
      iid: route.params.iid,
      windowed: route.query.window === '1',
    }),
    meta: { shell: true },
  },
```

(and the same `meta: { shell: true }` on the `merge-request` record.)

Then update the stale Phase-2 assertion in `src/router/index.test.ts` (the `'keeps detail + window routes out of the shell (phase 2)'` test): remove its `issues/42` and `merge-requests/5` assertions (those are now shell-on), keeping the `issues-window` falsy assertion.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/router/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + commit**

Run: `bun run typecheck`
Run: `bunx vitest run`
Expected: PASS. (The shell now wraps the full-page detail routes; `?window=1` stays bare via `shouldShowChrome`. The detail views still render their own back-links/mastheads underneath until Tasks 4–5 — transient double-header on the branch.)

```bash
bun run format
git add src/router/index.ts src/router/index.test.ts
git commit -m "feat(shell): opt the detail routes into the shell"
```

---

## Task 4: Migrate `MergeRequestDetail.vue`

**Files:**
- Modify: `src/views/MergeRequestDetail.vue`
- Test: `src/views/MergeRequestDetail.test.ts` (update)

MR detail is full-page only (no embedded/windowed mode), so it's always shell-present. Drop its in-view back-link (the shell provides it); teleport "Open in GitLab" into `#app-topbar-slot`; keep the title + state badge + body + rail; wrap in `<ViewContainer width="wide">`.

- [ ] **Step 1: Update the test**

In `src/views/MergeRequestDetail.test.ts`, the test asserts title/description/thread render. Add the header-change assertions and a teleport stub:

```ts
  it('renders inside the shell: no in-view back-link, action teleported', async () => {
    const w = mount(MergeRequestDetail, {
      props: { fullPath: 'grp/proj', iid: '5' },
      global: { stubs: { RouterLink: RouterLinkStub, PipelineStatusBadge: true, teleport: true } },
    })
    await flushPromises()
    // The old in-view "Merge requests" back RouterLink is gone (shell provides it).
    const backLinks = w
      .findAllComponents(RouterLinkStub)
      .filter((l) => (l.props('to') as { name?: string }).name === 'merge-requests')
    expect(backLinks).toHaveLength(0)
    // "Open in GitLab" still rendered (teleport stubbed inline).
    expect(w.text()).toContain('Open in GitLab')
  })
```

(Add `teleport: true` to the stubs of the existing render test too, since the teleported "Open in GitLab" no longer affects those assertions but the stub keeps the markup inline if needed. Add `RouterLinkStub` to the import if missing.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/MergeRequestDetail.test.ts`
Expected: FAIL — the in-view back-link to `merge-requests` still present.

- [ ] **Step 3: Migrate the view**

In `src/views/MergeRequestDetail.vue`:
1. Add `import ViewContainer from '@/shared/components/shell/ViewContainer.vue'`.
2. Replace the outer `<div class="mx-auto w-full max-w-5xl px-6 py-8">` with `<ViewContainer width="wide">`.
3. Remove the in-view back `RouterLink` block (the `<RouterLink :to="{ name: 'merge-requests', … }">… Merge requests</RouterLink>`) — the shell top bar provides it.
4. Move the "Open in GitLab" `<a>` into a `<Teleport to="#app-topbar-slot">` (keep its markup + `:href="mr.webUrl"`). Place the Teleport inside the `<template v-else-if="mr">` block (it needs `mr.webUrl`). Keep the title + `MrStateBadge` + `!iid` line and the body grid (description + `MrDiscussion` + rail) where they are.
5. `ArrowLeft` import is now unused (the back-link is gone) — remove it. Keep `ExternalLink`.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/MergeRequestDetail.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/MergeRequestDetail.vue src/views/MergeRequestDetail.test.ts
git commit -m "feat(shell): adopt the shell in the merge request detail"
```

---

## Task 5: Slim `IssueMasthead` + wrap `IssueDetail`

**Files:**
- Modify: `src/features/issues/components/IssueMasthead.vue`
- Modify: `src/views/IssueDetail.vue`
- Test: `src/features/issues/components/IssueMasthead.test.ts` (if present; else add focused cases), `src/views/IssueDetail.test.ts` (update)

The masthead has three modes (see header). In the **full-page main-window** mode (`!embedded && !windowed`) it teleports its action cluster to the shell and drops its eyebrow/back-link; in **embedded** and **windowed** modes it renders exactly as today.

- [ ] **Step 1: Update the masthead test**

Read `src/features/issues/components/IssueMasthead.test.ts`. It likely mounts the masthead and asserts on the `back-to-issues` link / action buttons. Update/add:

```ts
  it('full-page: teleports the actions and drops the in-view back-link', () => {
    const w = mount(IssueMasthead, {
      props: { ...baseProps, embedded: false, windowed: false }, // use the file's base props
      global: { stubs: { RouterLink: RouterLinkStub, teleport: true } },
    })
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
    // actions still rendered (teleport stubbed inline)
    expect(w.find('[data-testid="toggle-state"]').exists()).toBe(true)
  })

  it('windowed: keeps the inline header (no shell to teleport into)', () => {
    const w = mount(IssueMasthead, {
      props: { ...baseProps, embedded: false, windowed: true },
      global: { stubs: { RouterLink: RouterLinkStub, teleport: true } },
    })
    expect(w.find('[data-testid="toggle-state"]').exists()).toBe(true)
    // windowed shows the inert eyebrow, not a back-link
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
  })
```

(If `IssueMasthead.test.ts` doesn't exist, create it with a `baseProps` fixture: `{ issue: { iid: '7', title: 'X', author: { username: 'a' }, createdAt: '2026-01-01', webUrl: '#' }, repoName: 'proj', state: 'opened', linkCopied: null, fullPath: 'grp/proj' }`.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/issues/components/IssueMasthead.test.ts`
Expected: FAIL — the full-page masthead still renders its back-link inline (not teleported).

- [ ] **Step 3: Slim the masthead**

Edit `src/features/issues/components/IssueMasthead.vue`. Introduce a `shellPresent` computed (`!embedded && !windowed`) and restructure the template so:
- The eyebrow / back-link block renders only when `!shellPresent` (embedded shows inert text; windowed shows inert eyebrow — keep the existing `v-else` inert `<p>` for both).
- The action row (`<div class="mt-2.5 flex items-center gap-2.5">…</div>`) is wrapped in `<Teleport to="#app-topbar-slot">` when `shellPresent`, else rendered inline.
- The byline (`Opened by …`) always renders in-body.

Concretely, change the `<script setup>` to add:
```ts
import { computed } from 'vue'
// ...
const shellPresent = computed(() => !props.embedded && !props.windowed)
```
(define `props` via `const props = defineProps<...>()` if the file currently uses bare `defineProps` — assign it to `props`.)

And the template structure:
```vue
<template>
  <header class="animate-row-in">
    <!-- Eyebrow / back-link: only when there's no shell to host it. -->
    <template v-if="!shellPresent">
      <RouterLink
        v-if="!embedded && !windowed"
        :to="{ name: 'issues', params: { fullPath } }"
        data-testid="back-to-issues"
        class="group/back -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-sm px-1 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <ArrowLeft class="size-3 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5" />
        <span class="min-w-0 truncate">{{ repoName }}</span>
      </RouterLink>
      <p
        v-else
        class="eyebrow-tick max-w-full font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
      >
        <span class="min-w-0 truncate">{{ repoName }}</span>
      </p>
    </template>

    <component :is="shellPresent ? Teleport : 'div'" v-bind="shellPresent ? { to: '#app-topbar-slot' } : {}">
      <div class="flex items-center gap-2.5" :class="shellPresent ? '' : 'mt-2.5'">
        <StateBadge :key="state" :state="state" class="animate-status" />
        <span class="inline-flex items-center rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-sm font-medium tabular-nums text-foreground/90 ring-1 ring-inset ring-border/60">
          <span class="text-muted-foreground/45">#</span>{{ issue.iid }}
        </span>
        <Button type="button" data-testid="copy-link" variant="ghost" size="icon-xs" class="text-muted-foreground" title="Copy link · Shift+Click to copy a markdown link" @click="$emit('copy', $event)">
          <component :is="linkCopied ? Check : Link" class="size-3.5" />
        </Button>
        <Button type="button" data-testid="open-in-gitlab" variant="ghost" size="sm" class="ml-auto text-muted-foreground" title="Open this issue in GitLab" @click="$emit('open-external')">
          <ExternalLink class="size-3.5" />
          Open in GitLab
        </Button>
        <Button type="button" data-testid="toggle-state" variant="outline" size="sm" @click="$emit('toggle-state')">
          {{ state === 'opened' ? 'Close issue' : 'Reopen issue' }}
        </Button>
      </div>
    </component>

    <p class="mt-4 text-xs text-muted-foreground">
      Opened by
      <span class="font-medium text-foreground">{{ nameOrUsername(issue.author) }}</span>
      <span class="px-1 text-muted-foreground/50">·</span>
      <span class="font-mono">{{ new Date(issue.createdAt).toLocaleDateString() }}</span>
    </p>
  </header>
</template>
```
Add `Teleport` is a built-in — reference it in `<script setup>` via `import { Teleport } from 'vue'` (Vue exposes it as a value for `<component :is>`). If `<component :is="Teleport">` proves awkward, use a plain `v-if`/`v-else`: a `<Teleport to="#app-topbar-slot" v-if="shellPresent"><div class="flex …">…actions…</div></Teleport>` and a `<div v-else class="mt-2.5 flex …">…same actions…</div>` — duplicating the action row markup is acceptable if the dynamic-component approach fights the types. Keep the `data-testid`s identical in both.

- [ ] **Step 4: Wrap `IssueDetail` body in a mode-aware ViewContainer**

In `src/views/IssueDetail.vue`:
1. Add `import ViewContainer from '@/shared/components/shell/ViewContainer.vue'`.
2. Wrap the `<article class="issue pb-20" …>` (the `v-else-if="issue && draft"` block) in `<ViewContainer :width="embedded || windowed ? 'bare' : 'wide'">…</ViewContainer>`. In embedded/windowed the `'bare'` passthrough preserves today's layout (the drawer / the popped-out window's `<main>` already size it); full-page gets `wide` centering + padding. Do **not** change the inner `<article>`, its `railStyle`, container queries, condensed-title bar, save bar, or any body content.

- [ ] **Step 5: Update `IssueDetail.test.ts`**

In `src/views/IssueDetail.test.ts`, mounts that exercise the masthead's actions or back-link: add `teleport: true` to the stubs so the (now-teleported in full-page) action cluster renders inline. If a test asserted the in-view `back-to-issues` link for the full-page case, update it (the shell provides it now; in tests without the shell, the full-page masthead no longer renders that link). Keep the windowed/embedded masthead tests (they still render inline). Run the file and fix assertions to match the new structure without dropping meaningful coverage.

- [ ] **Step 6: Run to verify everything passes**

Run: `bunx vitest run src/features/issues/components/IssueMasthead.test.ts src/views/IssueDetail.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/issues/components/IssueMasthead.vue src/views/IssueDetail.vue \
        src/features/issues/components/IssueMasthead.test.ts src/views/IssueDetail.test.ts
git commit -m "feat(shell): adopt the shell in the issue detail (full-page mode)"
```

---

## Task 6: Phase 3 verification

**Files:** none (verification + cleanup commit if formatting changes anything).

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Full suite**

Run: `bunx vitest run`
Expected: PASS. The shell now frames the full-page issue + MR detail views (breadcrumb + back + teleported actions); popped-out windows (`?window=1`) and the embedded drawer keep their own mastheads; multi-issue window + connect stay bare. Any pre-existing test that asserted an in-view detail back-link for the full-page case was updated in Tasks 4–5.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(shell): format" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage (Phase 3 slice):** B (`AppTopBar` detail branch) → Task 2; C (migrate `IssueDetail` + slim `IssueMasthead`, migrate `MergeRequestDetail`) → Tasks 4, 5; D (ViewContainer width incl. `bare` passthrough) → Tasks 1, 4, 5; E (testing) → each task. This completes the spec — after Phase 3 every main-window view is framed by the shell and the bespoke headers are gone (`IssueMasthead` slimmed but retained for the windowed/embedded modes, which is correct per the spec's "slim, not delete").
- **Three-mode correctness:** the teleport fires only in `!embedded && !windowed`; `?window=1` keeps `shouldShowChrome` false (no shell, masthead inline); the drawer-embedded masthead renders inline (no teleport into the list's bar). `ViewContainer width="bare"` is the passthrough that lets one wrapper serve all three.
- **Type/name consistency:** detail branch reads `route.name ∈ {issue, merge-request}` → `{ list, sigil }`; `#app-topbar-slot` is the shared teleport target from Phase 1; `ViewContainer` widths now `'default'|'narrow'|'wide'|'bare'`; `shellPresent = !embedded && !windowed` in the masthead.
- **No new deferral:** this is the final phase of the spec. `MultiIssueWindow` and `ConnectView` remain chrome-off by design (not regressions).
