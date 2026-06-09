# Unified App Shell — Phase 2 (Project Tabs + List Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shell's top bar a project context (breadcrumb + Issues/MRs/Pipelines tabs), migrate the three project list views onto it, and delete the bespoke list headers.

**Architecture:** Add `ProjectTabNav` (the three-way tab set, with the running-pipeline adornment) and extend `AppTopBar` with a project branch (repo breadcrumb + tabs) keyed on `route.params.fullPath` + a project-list route name. Opt the three list routes into the shell (`meta.shell`). Each list view drops its header, wraps its body in `ViewContainer`, and (Issues only) teleports its "+ New issue" button into the shell's `#app-topbar-slot`. Delete `IssueListHeader` + `MergeRequestListHeader` + the inline pipeline header.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, vue-router, `useTabNav`, Teleport, Tailwind v4, lucide. Tests: vitest (`bunx vitest run`), `@vue/test-utils` (memory router, `RouterLinkStub`, `teleport` stub).

**Conventions:**
- Run `bun run format` then `bun run typecheck` after each task. Tests: `bunx vitest run` (never `bun test`).
- This is Phase 2 of the Unified App Shell spec (`docs/superpowers/specs/2026-06-09-unified-app-shell-design.md`). Phase 1 (foundation + global views) is already on main. Phase 3 (detail views) follows.
- The shell, `AppTopBar` (`#app-topbar-slot` teleport target), `ViewContainer`, and `shouldShowChrome` already exist from Phase 1.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/shared/components/shell/ProjectTabNav.vue` | Issues/MRs/Pipelines tab set + running-pipeline adornment |
| `src/shared/components/shell/AppTopBar.vue` | (modify) add the project branch (breadcrumb + repo + tabs) |
| `src/router/index.ts` | (modify) `meta.shell` on issues, merge-requests, pipelines |
| `src/views/IssueList.vue` | (modify) drop header; teleport "+ New issue"; ViewContainer; drop now-unused running bits |
| `src/views/MergeRequestList.vue` | (modify) drop header; ViewContainer |
| `src/views/PipelineList.vue` | (modify) drop inline header; ViewContainer; refresh into the body |
| `src/features/issues/components/IssueListHeader.vue` | **delete** (+ its test) |
| `src/features/merge_requests/components/MergeRequestListHeader.vue` | **delete** (+ its test) |

---

## Task 1: `ProjectTabNav`

**Files:**
- Create: `src/shared/components/shell/ProjectTabNav.vue`
- Test: `src/shared/components/shell/ProjectTabNav.test.ts`

The tab set for a project's three surfaces. Renders three `RouterLink`s with `useTabNav` (so modified-click still pops a new window), highlights the active tab, and shows a running-pipeline adornment on the Pipelines tab driven by `usePipelines(fullPath)`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/shell/ProjectTabNav.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'

// Stub the pipelines query so the running adornment is controllable.
const { pipelines } = vi.hoisted(() => ({ pipelines: { value: [] as { status: string }[] } }))
vi.mock('@/features/pipelines/composables/usePipelines', () => ({
  usePipelines: () => ({ pipelines: ref(pipelines.value) }),
}))
// isActivePipeline lives in gitlab/pipelineParams; keep the real one.

import ProjectTabNav from './ProjectTabNav.vue'

function mountNav(props: { fullPath: string; active: string }) {
  return mount(ProjectTabNav, { props, global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('ProjectTabNav', () => {
  it('links to the three project surfaces for the fullPath', () => {
    const targets = mountNav({ fullPath: 'grp/proj', active: 'issues' })
      .findAllComponents(RouterLinkStub)
      .map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
    expect(targets).toContainEqual({ name: 'merge-requests', params: { fullPath: 'grp/proj' } })
    expect(targets).toContainEqual({ name: 'pipelines', params: { fullPath: 'grp/proj' } })
  })

  it('marks the active tab with aria-current', () => {
    const w = mountNav({ fullPath: 'grp/proj', active: 'merge-requests' })
    const active = w
      .findAllComponents(RouterLinkStub)
      .find((l) => (l.props('to') as { name: string }).name === 'merge-requests')!
    expect(active.attributes('aria-current')).toBe('page')
  })

  it('shows a running count on the Pipelines tab when pipelines are active', () => {
    pipelines.value = [{ status: 'RUNNING' }, { status: 'SUCCESS' }, { status: 'PENDING' }]
    const w = mountNav({ fullPath: 'grp/proj', active: 'issues' })
    expect(w.get('[data-testid="tab-pipelines-running"]').text()).toContain('2')
    pipelines.value = []
  })
}
)
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/ProjectTabNav.test.ts`
Expected: FAIL — component missing.

> Before implementing, confirm `isActivePipeline` is exported from `@/gitlab/pipelineParams` (IssueList imports it from there) and `usePipelines` from `@/features/pipelines/composables/usePipelines` returns `{ pipelines }` (a ref of `{ status }` rows). Adapt the import if the path differs.

- [ ] **Step 3: Implement**

Create `src/shared/components/shell/ProjectTabNav.vue`:

```vue
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { FileText, GitMerge, Workflow } from '@lucide/vue'
import { useTabNav } from '@/shared/composables/useTabNav'
import { usePipelines } from '@/features/pipelines/composables/usePipelines'
import { isActivePipeline } from '@/gitlab/pipelineParams'

const props = defineProps<{ fullPath: string; active: string }>()
const { onTabNav } = useTabNav()

const { pipelines } = usePipelines(toRef(props, 'fullPath'))
const running = computed(() => pipelines.value.filter((p) => isActivePipeline(p.status)).length)

const TABS = [
  { name: 'issues', label: 'Issues', icon: FileText },
  { name: 'merge-requests', label: 'MRs', icon: GitMerge },
  { name: 'pipelines', label: 'Pipelines', icon: Workflow },
] as const

const tabClass = (name: string) =>
  [
    'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none transition-colors',
    name === props.active
      ? 'text-foreground'
      : 'text-muted-foreground hover:text-foreground',
  ].join(' ')
</script>

<template>
  <nav class="flex items-center gap-1" aria-label="Project sections">
    <RouterLink
      v-for="tab in TABS"
      :key="tab.name"
      :to="{ name: tab.name, params: { fullPath } }"
      :aria-current="tab.name === active ? 'page' : undefined"
      :class="tabClass(tab.name)"
      @click="onTabNav($event, { name: tab.name, params: { fullPath } })"
    >
      <component :is="tab.icon" class="size-4" />
      {{ tab.label }}
      <span
        v-if="tab.name === 'pipelines' && running > 0"
        data-testid="tab-pipelines-running"
        class="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-sky-300"
        :title="`${running} active`"
      >
        <span class="size-1.5 animate-pulse rounded-full bg-sky-400" />
        {{ running }}
      </span>
      <span
        v-if="tab.name === active"
        class="absolute -bottom-px left-0 h-0.5 w-full bg-primary"
        aria-hidden="true"
      />
    </RouterLink>
  </nav>
</template>
```

> The active-underline `<span>` is positioned absolutely; the `RouterLink` needs `position: relative`. Add `relative` to `tabClass` if the underline doesn't anchor (Vue Test Utils won't catch this — it's purely visual; the `aria-current` is what the test asserts). If the underline causes layout issues, switch to a `border-b-2 border-primary` on the active link instead — keep `aria-current` intact.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/ProjectTabNav.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/ProjectTabNav.vue src/shared/components/shell/ProjectTabNav.test.ts
git commit -m "feat(shell): project tab nav (issues/MRs/pipelines)"
```

---

## Task 2: `AppTopBar` project branch

**Files:**
- Modify: `src/shared/components/shell/AppTopBar.vue`
- Test: `src/shared/components/shell/AppTopBar.test.ts` (extend)

Add a project branch: when the route is a project-list route (`route.params.fullPath` is set and `route.name` ∈ {issues, merge-requests, pipelines}), show breadcrumb (path prefix) + repo name + `ProjectTabNav`. Otherwise keep the Phase-1 global branch. The `#app-topbar-slot` stays for the view's primary action.

- [ ] **Step 1: Write the failing test**

Append to `src/shared/components/shell/AppTopBar.test.ts` (the file already has a memory router with home/projects; extend the router's routes to include a project route and add a describe block):

```ts
import ProjectTabNav from './ProjectTabNav.vue'

// Stub usePipelines (pulled in transitively by ProjectTabNav) so mounting the
// project branch doesn't need a query client.
vi.mock('@/features/pipelines/composables/usePipelines', () => {
  const { ref } = require('vue')
  return { usePipelines: () => ({ pipelines: ref([]) }) }
})

const projectRouter = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/projects', name: 'projects', component: { template: '<div/>' } },
    { path: '/projects/:fullPath(.*)/issues', name: 'issues', component: { template: '<div/>' } },
  ],
})

describe('AppTopBar project branch', () => {
  it('shows the repo name + tabs on a project list route', async () => {
    await projectRouter.push('/projects/grp/proj/issues')
    await projectRouter.isReady()
    const w = mount(AppTopBar, {
      global: { plugins: [projectRouter], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('proj')
    expect(w.findComponent(ProjectTabNav).exists()).toBe(true)
    expect(w.findComponent(ProjectTabNav).props('active')).toBe('issues')
  })
})
```

(Add `RouterLinkStub` to the import from `@vue/test-utils` and `vi` from `vitest` at the top of the file if not already present.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/components/shell/AppTopBar.test.ts`
Expected: FAIL — no project branch / `ProjectTabNav` not rendered.

- [ ] **Step 3: Implement**

Replace `src/shared/components/shell/AppTopBar.vue` with:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import ProjectTabNav from './ProjectTabNav.vue'

const route = useRoute()

const PROJECT_LIST_ROUTES = ['issues', 'merge-requests', 'pipelines'] as const
const fullPath = computed(() => {
  const raw = route.params.fullPath
  return typeof raw === 'string' ? raw : ''
})
const projectTab = computed(() => {
  const name = String(route.name ?? '')
  return fullPath.value && (PROJECT_LIST_ROUTES as readonly string[]).includes(name) ? name : null
})
const { repoName, pathPrefix } = useRepoPath(fullPath)

const GLOBAL_TITLES: Record<string, string> = { home: 'My Work', projects: 'Projects' }
const globalTitle = computed(() => GLOBAL_TITLES[String(route.name ?? '')] ?? '')
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
    <h1 v-else class="text-sm font-semibold text-foreground">{{ globalTitle }}</h1>

    <!-- Views teleport their context affordances (primary action) here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
```

> Confirm `useRepoPath` is exported from `@/shared/composables/useRepoPath` and takes a `Ref<string>` returning `{ repoName, pathPrefix }` (computed refs). It is — `IssueList.vue` uses it.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/shared/components/shell/AppTopBar.test.ts`
Expected: PASS (global-branch tests + the new project-branch test).

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/components/shell/AppTopBar.vue src/shared/components/shell/AppTopBar.test.ts
git commit -m "feat(shell): top bar project branch with breadcrumb + tabs"
```

---

## Task 3: Opt the list routes into the shell

**Files:**
- Modify: `src/router/index.ts`
- Test: `src/router/index.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/router/index.test.ts`:

```ts
describe('shell opt-in for project list routes', () => {
  it('opts issues, merge-requests, and pipelines into the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues').meta.shell).toBe(true)
    expect(router.resolve('/projects/grp/proj/merge-requests').meta.shell).toBe(true)
    expect(router.resolve('/projects/grp/proj/pipelines').meta.shell).toBe(true)
  })
  it('keeps detail + window routes out of the shell (phase 2)', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues/42').meta.shell).toBeFalsy()
    expect(router.resolve('/projects/grp/proj/merge-requests/5').meta.shell).toBeFalsy()
    expect(router.resolve('/projects/grp/proj/issues-window').meta.shell).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/router/index.test.ts`
Expected: FAIL — list routes have no `meta.shell`.

- [ ] **Step 3: Add the meta**

In `src/router/index.ts`, add `meta: { shell: true }` to the `issues`, `merge-requests`, and `pipelines` route records (leave the `issue`, `merge-request`, `issues-window`, `connect` records unchanged):

```ts
  {
    path: '/projects/:fullPath(.*)/issues',
    name: 'issues',
    component: IssueList,
    props: true,
    meta: { shell: true },
  },
```

(and the same `meta: { shell: true }` addition on the `merge-requests` and `pipelines` records.)

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/router/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + commit**

Run: `bun run typecheck`
Run: `bunx vitest run`
Expected: PASS. (The shell now renders on the three list routes; the list views still show their own headers underneath until Tasks 4–6 remove them — transient double-header on the branch, fixed within those tasks.)

```bash
bun run format
git add src/router/index.ts src/router/index.test.ts
git commit -m "feat(shell): opt the project list routes into the shell"
```

---

## Task 4: Migrate `IssueList.vue`

**Files:**
- Modify: `src/views/IssueList.vue`
- Test: `src/views/IssueList.test.ts` (update)

Remove `IssueListHeader`; teleport the "+ New issue" button into `#app-topbar-slot`; wrap the body in `ViewContainer` (wide for board, default for list); drop the now-unused running-pipeline bits (the shell's `ProjectTabNav` owns that adornment now). Keep `repoName` (for `useTitle`), `count`, filters, toolbar, list/board, bulk.

- [ ] **Step 1: Update the test**

In `src/views/IssueList.test.ts`:
- The "shows the empty state" test counts header RouterLinks (`['back-to-projects', 'view-merge-requests', 'view-pipelines']`). Those links are gone (the shell provides nav). Remove that link-count assertion (the empty-state body content assertion stays).
- Any test that mounts IssueList and asserts the `data-testid="new-issue"` button: the button is now inside a `<Teleport to="#app-topbar-slot">`. Add `stubs: { teleport: true }` to that test's `global` mount options so the teleported button renders inline and the assertion holds. (If the test file has a shared mount helper, add the stub there.)
- Add an assertion that the bespoke header is gone:

```ts
  it('no longer renders the in-view issue list header', () => {
    // use the file's existing mount helper
    const w = mountList()
    expect(w.find('[data-testid="view-pipelines"]').exists()).toBe(false)
    expect(w.find('[data-testid="view-merge-requests"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: FAIL — header links still present.

- [ ] **Step 3: Migrate the view**

In `src/views/IssueList.vue`:

1. Remove the `import IssueListHeader from '@/features/issues/components/IssueListHeader.vue'` line and the `<IssueListHeader ... @new-issue="composerOpen = true" />` block in the template.
2. Remove the now-unused running-pipeline code from `<script setup>`: the `usePipelines` import, `isActivePipeline` import, `TONE_VISUALS` import if only used for `runningDotClass`, and the `runningPipelines` / `runningDotClass` consts. (Keep `useRepoPath`/`repoName` — still used by `useTitle`. Keep `count`. If `hasMore` was only passed to the header, remove it; if used elsewhere, keep it. Verify by searching the file.)
3. Add the import:
```ts
import ViewContainer from '@/shared/components/shell/ViewContainer.vue'
import { Plus } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
```
(`Plus`/`Button` may already be imported — check.)
4. Wrap the existing body (toolbar + list/board + pagination + composer) in `<ViewContainer :width="view === 'board' ? 'wide' : 'default'">…</ViewContainer>`. (`view` is the existing list/board mode ref; confirm its name in the file.)
5. Add the teleported primary action at the top of the template (inside `<ViewContainer>` or as a sibling — Teleport renders elsewhere regardless):
```vue
    <Teleport to="#app-topbar-slot">
      <Button data-testid="new-issue" size="sm" @click="composerOpen = true">
        <Plus class="size-4" /> New issue
      </Button>
    </Teleport>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat(shell): adopt the shell in the issue list"
```

---

## Task 5: Migrate `MergeRequestList.vue`

**Files:**
- Modify: `src/views/MergeRequestList.vue`
- Test: `src/views/MergeRequestList.test.ts` (update)

MRs aren't created in-app in this slice, so there's no primary action to teleport — the MR list just drops its header and wraps its body in `ViewContainer`.

- [ ] **Step 1: Update the test**

In `src/views/MergeRequestList.test.ts`, the test asserts MR rows render. It does not assert on the header. Add an assertion that the header is gone:

```ts
  it('no longer renders the in-view MR list header', async () => {
    const w = mount(MergeRequestList, {
      props: { fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    // The MergeRequestListHeader rendered nav buttons; none should remain in-view.
    expect(w.find('[data-testid="view-pipelines"]').exists()).toBe(false)
  })
```

(If `MergeRequestListHeader` used a different testid for its nav, assert on whatever it rendered; the point is the header markup is gone. If unsure, assert the view no longer renders an `<h1>` / the repo title that the header showed.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/MergeRequestList.test.ts`
Expected: FAIL — header markup still present.

- [ ] **Step 3: Migrate the view**

In `src/views/MergeRequestList.vue`:
1. Remove `import MergeRequestListHeader from '@/features/merge_requests/components/MergeRequestListHeader.vue'` and the `<MergeRequestListHeader ... />` block.
2. Remove the now-unused `repoName` computed **only if** it was solely for the header — but it is likely also used for a `useTitle`; check. If `MergeRequestList` has no `useTitle`, the `repoName` computed can go; if it powers a title, keep it.
3. Add `import ViewContainer from '@/shared/components/shell/ViewContainer.vue'`.
4. Replace the outer `<div class="mx-auto w-full max-w-4xl px-6 py-8">` with `<ViewContainer>` (default width) wrapping the toolbar + filter panel + list.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/MergeRequestList.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/MergeRequestList.vue src/views/MergeRequestList.test.ts
git commit -m "feat(shell): adopt the shell in the merge request list"
```

---

## Task 6: Migrate `PipelineList.vue`

**Files:**
- Modify: `src/views/PipelineList.vue`
- Test: `src/views/PipelineList.test.ts` (update if present; create a focused one if absent)

Remove the inline header; move the refresh control into the body (above the list); wrap the body in `ViewContainer`. The running indicator now lives on the shell's Pipelines tab, so the in-header active/watched badges are dropped (the active count is still visible via the tab adornment).

- [ ] **Step 1: Update / add the test**

Read `src/views/PipelineList.test.ts` (if it exists). The inline header rendered a "back to issues" RouterLink and a refresh button (`data-testid="refresh-pipelines"`). After migration: the back-to-issues link is gone (the shell tabs provide nav); the refresh button stays but moves into the body. Update any header/nav assertion. Add:

```ts
  it('keeps the refresh control after dropping the inline header', () => {
    // use the file's existing mount helper / or mount with a memory router + query stub
    const w = mountPipelines()
    expect(w.find('[data-testid="refresh-pipelines"]').exists()).toBe(true)
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
  })
```

If no `PipelineList.test.ts` exists, create a minimal one that mounts the view (mocking `usePipelines` and related composables as the other view tests do) and asserts the above. Mirror the mocking approach used in `src/views/MergeRequestList.test.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/PipelineList.test.ts`
Expected: FAIL — `back-to-issues` still present (or the view test doesn't exist yet → create it red).

- [ ] **Step 3: Migrate the view**

In `src/views/PipelineList.vue`:
1. Remove the inline `<!-- Header -->` block (the back-to-issues `RouterLink`, the eyebrow/title, and the active/watched count badges). Keep the refresh `<button data-testid="refresh-pipelines">`.
2. Add `import ViewContainer from '@/shared/components/shell/ViewContainer.vue'`.
3. Wrap the body in `<ViewContainer>`. Put a small toolbar row at the top of the body holding the refresh button (right-aligned), e.g.:
```vue
    <div class="mb-3 flex justify-end">
      <button data-testid="refresh-pipelines" type="button" @click="refresh" :disabled="…">…</button>
    </div>
```
(reuse the existing refresh button markup + handler verbatim — just relocate it out of the deleted header).
4. Remove the now-unused `repoName`/`pathPrefix`/`onTabNav`/`useTabNav` if they were only used by the deleted header (verify by search). Keep `useTitle` if present.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/PipelineList.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/PipelineList.vue src/views/PipelineList.test.ts
git commit -m "feat(shell): adopt the shell in the pipeline list"
```

---

## Task 7: Delete the bespoke list headers

**Files:**
- Delete: `src/features/issues/components/IssueListHeader.vue` + `IssueListHeader.test.ts`
- Delete: `src/features/merge_requests/components/MergeRequestListHeader.vue` + `MergeRequestListHeader.test.ts`

These are now unused (their nav/title/count moved to the shell). Their nav-target coverage is re-homed to `ProjectTabNav.test.ts` (Task 1).

- [ ] **Step 1: Confirm they're unreferenced**

Run: `grep -rn "IssueListHeader\|MergeRequestListHeader" src`
Expected: no references remain (Tasks 4 and 5 removed the imports). If any remain, STOP and report.

- [ ] **Step 2: Delete the files**

```bash
git rm src/features/issues/components/IssueListHeader.vue \
       src/features/issues/components/IssueListHeader.test.ts \
       src/features/merge_requests/components/MergeRequestListHeader.vue \
       src/features/merge_requests/components/MergeRequestListHeader.test.ts
```

- [ ] **Step 3: Typecheck + full suite**

Run: `bun run typecheck`
Run: `bunx vitest run`
Expected: PASS — nothing imports the deleted components; the three-way nav coverage lives in `ProjectTabNav.test.ts`.

- [ ] **Step 4: Format, commit**

```bash
bun run format
git add -A
git commit -m "refactor(shell): delete the bespoke list headers"
```

---

## Task 8: Phase 2 verification

**Files:** none (verification + cleanup commit if formatting changes anything).

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Full suite**

Run: `bunx vitest run`
Expected: PASS. The shell now frames the three project list views with breadcrumb + tabs; Issues shows "+ New issue" in the top bar; no double headers; detail/window/connect routes still render bare. Any pre-existing test that depended on a deleted header was updated in Tasks 4–6.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(shell): format" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage (Phase 2 slice):** B (`ProjectTabNav`, top-bar project branch) → Tasks 1, 2; C (migrate Issues/MRs/Pipelines, delete the two list headers, drop the inline pipeline header) → Tasks 4–7; D (ViewContainer widths on the list views) → Tasks 4–6; the teleport `#primary-action` slot model → Task 4 (Issues "+ New issue"). E (testing) → each task. Detail views + IssueMasthead slim + detail top-bar branch are **Phase 3**.
- **Type/name consistency:** `ProjectTabNav` props `{ fullPath, active }`; `AppTopBar` derives `projectTab` from `route.name ∈ {issues, merge-requests, pipelines}` and feeds `active`; `useRepoPath(fullPath)` → `{ repoName, pathPrefix }`; the teleport target id `#app-topbar-slot` matches Phase 1's `AppTopBar`. The running-pipeline source (`usePipelines` + `isActivePipeline`) matches what `IssueList` used before this migration removed it.
- **Mergeable:** opt-in `meta.shell` keeps detail/window/connect routes bare; each list view drops its header in the same task it gains the shell context, so no committed double-header.
- **Deferred to Phase 3:** detail top-bar branch (breadcrumb + back + open-in-window), `IssueDetail`/`MergeRequestDetail` migration, slimming `IssueMasthead`.
