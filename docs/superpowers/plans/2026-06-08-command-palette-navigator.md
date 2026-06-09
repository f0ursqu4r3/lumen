# Command Palette Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `CommandPalette.vue` into a keyboard-first navigator that fuzzy-jumps to projects, issues (live title search in the current project + `#number` jump), saved views, and route commands.

**Architecture:** Extract the palette's list logic into a new `src/features/palette/` module: pure command **sources** (`lib/sources.ts`) fed `PaletteContext`, a debounced GraphQL issue-search composable (`composables/usePaletteIssueSearch.ts`), and a merge composable (`composables/usePaletteCommands.ts`) that groups and flat-orders results. `CommandPalette.vue` slims to input + keyboard nav + sectioned render.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, `@tanstack/vue-query`, `@vueuse/core`, `graphql-request` via the host RPC shim (`gqlClient`), reka-ui `Dialog`, Tailwind v4. Tests: vitest (`bunx vitest run`), `@vue/test-utils`, the `withQuery` helper.

**Conventions to follow:**
- GraphQL = inline template-literal document + hand-written result type + `gqlClient.request<Result, Vars>`, errors via `normalizeError` (see `src/features/issues/composables/useIssue.ts`). **No codegen step.**
- Query-composable tests mock `@/gitlab/client` and use `withQuery` (see `src/features/issues/composables/useIssues.test.ts`).
- Run `bun run format` after edits. Run tests with `bunx vitest run` (never `bun test`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/features/palette/lib/types.ts` | `Command`, `CommandGroup`, `GROUP_ORDER`, `PaletteContext`, `PaletteIssueHit`, `BrowserRow` |
| `src/features/palette/lib/sources.ts` | Pure builders: `routeCommands`, `issueJumpCommand`, `issueCommands`, `projectCommands`, `savedViewCommands`, `filterByQuery` |
| `src/features/palette/lib/sources.test.ts` | Unit tests for the builders |
| `src/features/palette/composables/usePaletteIssueSearch.ts` | Debounced current-project title search + `paletteSearchEnabled` predicate |
| `src/features/palette/composables/usePaletteIssueSearch.test.ts` | Predicate + query/error tests |
| `src/features/palette/composables/usePaletteCommands.ts` | Merge sources → `{ groups, flat, isSearching }` |
| `src/features/palette/composables/usePaletteCommands.test.ts` | Merge order / grouping / flat-index tests |
| `src/shared/components/CommandPalette.vue` | (modify) shell: input, keyboard nav, sectioned render, footer |
| `src/shared/components/CommandPalette.test.ts` | Smoke: opens on ⌘K, renders groups, Enter runs active, esc closes |

---

## Task 1: Palette types + pure sources

**Files:**
- Create: `src/features/palette/lib/types.ts`
- Create: `src/features/palette/lib/sources.ts`
- Test: `src/features/palette/lib/sources.test.ts`

- [ ] **Step 1: Create the types file**

Create `src/features/palette/lib/types.ts`:

```ts
import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

export type CommandGroup = 'Actions' | 'Projects' | 'Issues' | 'Views'

// Fixed render/nav order for non-empty groups (matches the design spec).
export const GROUP_ORDER: readonly CommandGroup[] = ['Actions', 'Projects', 'Issues', 'Views']

export type Command = {
  id: string
  group: CommandGroup
  title: string
  subtitle?: string
  icon: Component
  action: () => void
}

// Everything a source needs is passed in, so sources stay pure and testable.
export type PaletteContext = {
  currentProject: string | null
  query: string
  router: Router
  route: RouteLocationNormalizedLoaded
}

// Shape returned by the issue-search query (also re-used by tests).
export type PaletteIssueHit = { iid: string; title: string; state: string }

// Minimal row shape consumed from useProjectBrowser.flatRows.
export type BrowserRow = { name: string; fullPath: string }
```

- [ ] **Step 2: Write the failing test for the sources**

Create `src/features/palette/lib/sources.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { PaletteContext, PaletteIssueHit, BrowserRow } from './types'
import {
  routeCommands,
  issueJumpCommand,
  issueCommands,
  projectCommands,
  savedViewCommands,
  filterByQuery,
} from './sources'

function ctx(over: Partial<PaletteContext> = {}): PaletteContext {
  return {
    currentProject: 'grp/proj',
    query: '',
    router: { push: vi.fn() } as unknown as PaletteContext['router'],
    route: { query: {} } as unknown as PaletteContext['route'],
    ...over,
  }
}

describe('routeCommands', () => {
  it('includes project-scoped commands when a project is open', () => {
    const ids = routeCommands(ctx()).map((c) => c.id)
    expect(ids).toContain('new-issue')
    expect(ids).toContain('project-issues')
    expect(ids).toContain('project-pipelines')
    expect(ids).toContain('projects')
    expect(ids).toContain('settings')
  })

  it('omits project-scoped commands when no project is open', () => {
    const ids = routeCommands(ctx({ currentProject: null })).map((c) => c.id)
    expect(ids).toEqual(['projects', 'settings'])
  })

  it('tags every command as an Actions group command', () => {
    expect(routeCommands(ctx()).every((c) => c.group === 'Actions')).toBe(true)
  })
})

describe('issueJumpCommand', () => {
  it('returns a jump command for a bare or #-prefixed number', () => {
    expect(issueJumpCommand(ctx({ query: '42' }))?.id).toBe('issue-jump-42')
    expect(issueJumpCommand(ctx({ query: '#42' }))?.id).toBe('issue-jump-42')
  })

  it('returns null for non-numeric queries or no project', () => {
    expect(issueJumpCommand(ctx({ query: 'login bug' }))).toBeNull()
    expect(issueJumpCommand(ctx({ query: '42', currentProject: null }))).toBeNull()
  })

  it('pushes the issue route on action', () => {
    const c = ctx({ query: '7' })
    issueJumpCommand(c)!.action()
    expect(c.router.push).toHaveBeenCalledWith({
      name: 'issue',
      params: { fullPath: 'grp/proj', iid: '7' },
    })
  })
})

describe('issueCommands', () => {
  const hits: PaletteIssueHit[] = [{ iid: '3', title: 'Fix login', state: 'opened' }]

  it('maps hits to Issues commands with #iid · state subtitle', () => {
    const [cmd] = issueCommands(hits, ctx())
    expect(cmd.group).toBe('Issues')
    expect(cmd.title).toBe('Fix login')
    expect(cmd.subtitle).toBe('#3 · opened')
  })

  it('returns nothing when no project is open', () => {
    expect(issueCommands(hits, ctx({ currentProject: null }))).toEqual([])
  })
})

describe('projectCommands', () => {
  const rows: BrowserRow[] = Array.from({ length: 30 }, (_, i) => ({
    name: `P${i}`,
    fullPath: `grp/p${i}`,
  }))

  it('maps rows to Projects commands and caps the count at 25', () => {
    const cmds = projectCommands(rows, ctx())
    expect(cmds).toHaveLength(25)
    expect(cmds[0]).toMatchObject({ group: 'Projects', title: 'P0', subtitle: 'grp/p0' })
  })
})

describe('savedViewCommands', () => {
  const views = [{ id: 'v1', name: 'My bugs', query: { label: 'bug' } }]

  it('maps views to Views commands', () => {
    const [cmd] = savedViewCommands(views, ctx())
    expect(cmd).toMatchObject({ id: 'view-v1', group: 'Views', title: 'My bugs' })
  })

  it('applies the slice as route query on action', () => {
    const c = ctx()
    savedViewCommands(views, c)[0].action()
    expect(c.router.push).toHaveBeenCalledWith({
      name: 'issues',
      params: { fullPath: 'grp/proj' },
      query: { label: 'bug' },
    })
  })

  it('returns nothing when no project is open', () => {
    expect(savedViewCommands(views, ctx({ currentProject: null }))).toEqual([])
  })
})

describe('filterByQuery', () => {
  const cmds = routeCommands(ctx())

  it('returns all commands for an empty query', () => {
    expect(filterByQuery(cmds, '')).toHaveLength(cmds.length)
  })

  it('matches on title or subtitle, case-insensitively', () => {
    const ids = filterByQuery(cmds, 'settings').map((c) => c.id)
    expect(ids).toEqual(['settings'])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run src/features/palette/lib/sources.test.ts`
Expected: FAIL — cannot resolve `./sources` (module not found).

- [ ] **Step 4: Implement the sources**

Create `src/features/palette/lib/sources.ts`:

```ts
import { Bookmark, FileText, FolderGit2, GitBranch, Hash, Plus, Settings } from '@lucide/vue'
import { openSettings } from '@/shared/composables/useSettings'
import type { SavedView } from '@/shared/composables/useSavedViews'
import type { BrowserRow, Command, PaletteContext, PaletteIssueHit } from './types'

const PROJECT_RENDER_CAP = 25

/** Route/action commands. Project-scoped ones appear only with an open project. */
export function routeCommands(ctx: PaletteContext): Command[] {
  const { currentProject, router, route } = ctx
  const commands: Command[] = []

  if (currentProject) {
    commands.push(
      {
        id: 'new-issue',
        group: 'Actions',
        title: 'Create Issue',
        subtitle: currentProject,
        icon: Plus,
        action: () =>
          router.push({
            name: 'issues',
            params: { fullPath: currentProject },
            query: { ...route.query, compose: '1' },
          }),
      },
      {
        id: 'project-issues',
        group: 'Actions',
        title: 'Open Issues',
        subtitle: currentProject,
        icon: FileText,
        action: () => router.push({ name: 'issues', params: { fullPath: currentProject } }),
      },
      {
        id: 'project-pipelines',
        group: 'Actions',
        title: 'Open Pipelines',
        subtitle: currentProject,
        icon: GitBranch,
        action: () => router.push({ name: 'pipelines', params: { fullPath: currentProject } }),
      },
    )
  }

  commands.push(
    {
      id: 'projects',
      group: 'Actions',
      title: 'Open Projects',
      subtitle: 'Go to the project launcher',
      icon: FolderGit2,
      action: () => router.push({ name: 'projects' }),
    },
    {
      id: 'settings',
      group: 'Actions',
      title: 'Open Settings',
      subtitle: 'Connection and local preferences',
      icon: Settings,
      action: openSettings,
    },
  )

  return commands
}

/** Direct `#123` / `123` jump within the current project. */
export function issueJumpCommand(ctx: PaletteContext): Command | null {
  const { currentProject, query, router } = ctx
  if (!currentProject) return null
  const iid = query.trim().match(/^#?(\d+)$/)?.[1]
  if (!iid) return null
  return {
    id: `issue-jump-${iid}`,
    group: 'Issues',
    title: `Open Issue #${iid}`,
    subtitle: currentProject,
    icon: Hash,
    action: () => router.push({ name: 'issue', params: { fullPath: currentProject, iid } }),
  }
}

/** Title-search hits → Issues commands. */
export function issueCommands(hits: PaletteIssueHit[], ctx: PaletteContext): Command[] {
  const { currentProject, router } = ctx
  if (!currentProject) return []
  return hits.map((h) => ({
    id: `issue-${h.iid}`,
    group: 'Issues',
    title: h.title,
    subtitle: `#${h.iid} · ${h.state}`,
    icon: Hash,
    action: () => router.push({ name: 'issue', params: { fullPath: currentProject, iid: h.iid } }),
  }))
}

/** Project rows (already query-filtered by useProjectBrowser) → Projects commands. */
export function projectCommands(rows: BrowserRow[], ctx: PaletteContext): Command[] {
  const { router } = ctx
  return rows.slice(0, PROJECT_RENDER_CAP).map((p) => ({
    id: `project-${p.fullPath}`,
    group: 'Projects',
    title: p.name,
    subtitle: p.fullPath,
    icon: FolderGit2,
    action: () => router.push({ name: 'issues', params: { fullPath: p.fullPath } }),
  }))
}

/** Current-project saved views → Views commands; selecting applies the slice. */
export function savedViewCommands(views: SavedView[], ctx: PaletteContext): Command[] {
  const { currentProject, router } = ctx
  if (!currentProject) return []
  return views.map((v) => ({
    id: `view-${v.id}`,
    group: 'Views',
    title: v.name,
    subtitle: 'Saved view',
    icon: Bookmark,
    action: () =>
      router.push({ name: 'issues', params: { fullPath: currentProject }, query: v.query }),
  }))
}

/** Substring filter on title/subtitle; empty query passes everything through. */
export function filterByQuery(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  return commands.filter(
    (c) => c.title.toLowerCase().includes(q) || (c.subtitle?.toLowerCase().includes(q) ?? false),
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx vitest run src/features/palette/lib/sources.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add src/features/palette/lib/types.ts src/features/palette/lib/sources.ts src/features/palette/lib/sources.test.ts
git commit -m "feat(palette): pure command sources + types"
```

---

## Task 2: Issue-search composable

**Files:**
- Create: `src/features/palette/composables/usePaletteIssueSearch.ts`
- Test: `src/features/palette/composables/usePaletteIssueSearch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/palette/composables/usePaletteIssueSearch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import { paletteSearchEnabled, usePaletteIssueSearch } from './usePaletteIssueSearch'

beforeEach(() => {
  request.mockReset()
})

describe('paletteSearchEnabled', () => {
  it('is disabled without a project', () => {
    expect(paletteSearchEnabled('login', null)).toBe(false)
  })
  it('is disabled for queries under 2 characters', () => {
    expect(paletteSearchEnabled('a', 'grp/proj')).toBe(false)
  })
  it('is disabled for a pure issue number', () => {
    expect(paletteSearchEnabled('42', 'grp/proj')).toBe(false)
    expect(paletteSearchEnabled('#42', 'grp/proj')).toBe(false)
  })
  it('is enabled for a real text query with a project', () => {
    expect(paletteSearchEnabled('login bug', 'grp/proj')).toBe(true)
  })
})

describe('usePaletteIssueSearch', () => {
  it('returns mapped hits for a text query', async () => {
    request.mockResolvedValue({
      project: { issues: { nodes: [{ iid: '3', title: 'Fix login', state: 'opened' }] } },
    })
    const { result } = withQuery(() =>
      usePaletteIssueSearch(ref('login'), ref('grp/proj')),
    )
    await flushPromises()
    expect(result().hits.value).toEqual([{ iid: '3', title: 'Fix login', state: 'opened' }])
  })

  it('exposes [] (never throws) when the search request fails', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() =>
      usePaletteIssueSearch(ref('login'), ref('grp/proj')),
    )
    await flushPromises()
    expect(result().hits.value).toEqual([])
  })

  it('does not fire a request when disabled', async () => {
    const { result } = withQuery(() => usePaletteIssueSearch(ref('#42'), ref('grp/proj')))
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    expect(result().hits.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/palette/composables/usePaletteIssueSearch.test.ts`
Expected: FAIL — cannot resolve `./usePaletteIssueSearch`.

> Note: the debounce (`refDebounced`, 200ms) resolves synchronously enough under `flushPromises` for the enabled cases here because the initial debounced value mirrors the source ref; the query fires on first tick. If a test ever flakes on timing, wrap assertions in a short `await new Promise((r) => setTimeout(r, 250))` before `flushPromises()`.

- [ ] **Step 3: Implement the composable**

Create `src/features/palette/composables/usePaletteIssueSearch.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { refDebounced } from '@vueuse/core'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import type { PaletteIssueHit } from '../lib/types'

const PaletteIssueSearchDocument = `
  query PaletteIssueSearch($fullPath: ID!, $search: String!) {
    project(fullPath: $fullPath) {
      issues(search: $search, sort: UPDATED_DESC, first: 8) {
        nodes {
          iid
          title
          state
        }
      }
    }
  }
`

type Result = {
  project?: { issues?: { nodes?: (PaletteIssueHit | null)[] | null } | null } | null
}

const MIN_CHARS = 2
const isPureNumber = (q: string) => /^#?\d+$/.test(q)

/** Gate: a project is open, query is ≥2 chars, and not a bare issue number. */
export function paletteSearchEnabled(query: string, project: string | null): boolean {
  const q = query.trim()
  return !!project && q.length >= MIN_CHARS && !isPureNumber(q)
}

async function fetchHits(fullPath: string, search: string): Promise<PaletteIssueHit[]> {
  try {
    const data = await gqlClient.request<Result, { fullPath: string; search: string }>(
      PaletteIssueSearchDocument,
      { fullPath, search },
    )
    return (data.project?.issues?.nodes ?? []).filter((n): n is PaletteIssueHit => !!n)
  } catch (e) {
    throw normalizeError(e)
  }
}

export function usePaletteIssueSearch(query: Ref<string>, currentProject: Ref<string | null>) {
  const debounced = refDebounced(query, 200)
  const search = computed(() => debounced.value.trim())
  const enabled = computed(() => paletteSearchEnabled(search.value, currentProject.value))

  const result = useQuery<PaletteIssueHit[], GitLabError>({
    queryKey: computed(() => ['palette-issue-search', currentProject.value, search.value]),
    queryFn: () => fetchHits(currentProject.value as string, search.value),
    enabled,
    staleTime: 10_000,
  })

  // A failed search must never break the palette: collapse error/loading to [].
  const hits = computed(() => result.data.value ?? [])
  const isFetching = computed(() => result.isFetching.value && enabled.value)

  return { hits, isFetching }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/palette/composables/usePaletteIssueSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/palette/composables/usePaletteIssueSearch.ts src/features/palette/composables/usePaletteIssueSearch.test.ts
git commit -m "feat(palette): debounced current-project issue search"
```

---

## Task 3: Merge composable

**Files:**
- Create: `src/features/palette/composables/usePaletteCommands.ts`
- Test: `src/features/palette/composables/usePaletteCommands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/palette/composables/usePaletteCommands.test.ts`. It stubs the three data dependencies so the test focuses on merge/order:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

// Stub the data sources so we test merge/order, not data fetching.
vi.mock('@/features/projects/composables/useProjectBrowser', () => ({
  useProjectBrowser: () => ({
    flatRows: ref([{ name: 'Proj', fullPath: 'grp/proj' }]),
  }),
}))
vi.mock('@/shared/composables/useSavedViews', () => ({
  useSavedViews: () => ({ views: ref([{ id: 'v1', name: 'My bugs', query: { label: 'bug' } }]) }),
}))
vi.mock('../composables/usePaletteIssueSearch', () => ({
  usePaletteIssueSearch: () => ({ hits: ref([{ iid: '3', title: 'Fix login', state: 'opened' }]), isFetching: ref(false) }),
}))

const route = { params: { fullPath: 'grp/proj' }, query: {} }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
}))

import { usePaletteCommands } from './usePaletteCommands'

// Mount inside a component so composable lifecycle hooks run.
function run(query = ref('')) {
  let api!: ReturnType<typeof usePaletteCommands>
  const Comp = defineComponent({
    setup() {
      api = usePaletteCommands(query)
      return () => h('div')
    },
  })
  mount(Comp)
  return api
}

describe('usePaletteCommands', () => {
  it('orders non-empty groups Actions, Projects, Issues, Views', () => {
    const { groups } = run(ref('login'))
    expect(groups.value.map((g) => g.group)).toEqual(['Actions', 'Projects', 'Issues', 'Views'])
  })

  it('flat list concatenates group items in group order', () => {
    const { groups, flat } = run(ref('login'))
    const expected = groups.value.flatMap((g) => g.items.map((i) => i.id))
    expect(flat.value.map((c) => c.id)).toEqual(expected)
  })

  it('filters Actions and Views by the query', () => {
    const { groups } = run(ref('settings'))
    const actions = groups.value.find((g) => g.group === 'Actions')!
    expect(actions.items.map((c) => c.id)).toEqual(['settings'])
    // "settings" matches no saved-view name, so the Views group drops out.
    expect(groups.value.some((g) => g.group === 'Views')).toBe(false)
  })

  it('drops empty groups entirely', () => {
    const { groups } = run(ref('zzz-no-match'))
    expect(groups.value.some((g) => g.group === 'Issues')).toBe(true) // hits stub still returns one
    // Actions filtered to none for this query → group omitted.
    expect(groups.value.some((g) => g.group === 'Actions')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/palette/composables/usePaletteCommands.test.ts`
Expected: FAIL — cannot resolve `./usePaletteCommands`.

- [ ] **Step 3: Implement the merge composable**

Create `src/features/palette/composables/usePaletteCommands.ts`:

```ts
import { computed, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectBrowser } from '@/features/projects/composables/useProjectBrowser'
import { useSavedViews } from '@/shared/composables/useSavedViews'
import { usePaletteIssueSearch } from './usePaletteIssueSearch'
import {
  filterByQuery,
  issueCommands,
  issueJumpCommand,
  projectCommands,
  routeCommands,
  savedViewCommands,
} from '../lib/sources'
import { GROUP_ORDER, type Command, type CommandGroup, type PaletteContext } from '../lib/types'

export function usePaletteCommands(query: Ref<string>) {
  const router = useRouter()
  const route = useRoute()

  const currentProject = computed<string | null>(() => {
    const raw = route.params.fullPath
    return typeof raw === 'string' && raw ? raw : null
  })

  const { flatRows } = useProjectBrowser(query)
  // useSavedViews re-keys per project; pass a non-null ref (empty = no views).
  const projectRef = computed(() => currentProject.value ?? '')
  const { views } = useSavedViews(projectRef)
  const { hits, isFetching } = usePaletteIssueSearch(query, currentProject)

  const ctx = computed<PaletteContext>(() => ({
    currentProject: currentProject.value,
    query: query.value.trim(),
    router,
    route,
  }))

  const groups = computed(() => {
    const c = ctx.value
    const byGroup: Record<CommandGroup, Command[]> = {
      Actions: filterByQuery(routeCommands(c), c.query),
      Projects: projectCommands(flatRows.value, c),
      Issues: [issueJumpCommand(c), ...issueCommands(hits.value, c)].filter(
        (x): x is Command => x !== null,
      ),
      Views: filterByQuery(savedViewCommands(views.value, c), c.query),
    }
    return GROUP_ORDER.map((group) => ({ group, items: byGroup[group] })).filter(
      (g) => g.items.length > 0,
    )
  })

  const flat = computed<Command[]>(() => groups.value.flatMap((g) => g.items))

  return { groups, flat, isSearching: isFetching }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/palette/composables/usePaletteCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/palette/composables/usePaletteCommands.ts src/features/palette/composables/usePaletteCommands.test.ts
git commit -m "feat(palette): merge sources into grouped + flat command list"
```

---

## Task 4: Rewire CommandPalette.vue (sectioned render + footer)

**Files:**
- Modify: `src/shared/components/CommandPalette.vue`
- Test: `src/shared/components/CommandPalette.test.ts`

- [ ] **Step 1: Write the failing component smoke test**

Create `src/shared/components/CommandPalette.test.ts`. It stubs `usePaletteCommands` so the component renders a known group/flat set:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const push = vi.fn()
const action = vi.fn()

vi.mock('@/features/palette/composables/usePaletteCommands', () => {
  const { ref } = require('vue')
  const cmd = { id: 'settings', group: 'Actions', title: 'Open Settings', subtitle: 'x', icon: 'span', action }
  const groups = ref([{ group: 'Actions', items: [cmd] }])
  const flat = ref([cmd])
  return { usePaletteCommands: () => ({ groups, flat, isSearching: ref(false) }) }
})

import CommandPalette from './CommandPalette.vue'

beforeEach(() => {
  push.mockReset()
  action.mockReset()
})

function open() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}

describe('CommandPalette', () => {
  it('opens on Cmd+K and renders the group header and item', async () => {
    const wrapper = mount(CommandPalette, { attachTo: document.body })
    open()
    await flushPromises()
    // Dialog content teleports to body; assert against the document.
    expect(document.body.textContent).toContain('Actions')
    expect(document.body.textContent).toContain('Open Settings')
    wrapper.unmount()
  })

  it('runs the active command on Enter', async () => {
    const wrapper = mount(CommandPalette, { attachTo: document.body })
    open()
    await flushPromises()
    const input = document.body.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(action).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/components/CommandPalette.test.ts`
Expected: FAIL — the current `CommandPalette.vue` doesn't import `usePaletteCommands` (the mock isn't used; no group header "Actions" is rendered). The first assertion fails.

- [ ] **Step 3: Rewrite the component to use the composable + sectioned render**

Replace the entire contents of `src/shared/components/CommandPalette.vue` with:

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { Loader2, Search, X } from '@lucide/vue'
import { usePaletteCommands } from '@/features/palette/composables/usePaletteCommands'
import type { Command } from '@/features/palette/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

const open = ref(false)
const query = ref('')
const active = ref(0)
const input = ref<{ $el: HTMLInputElement } | null>(null)

const { groups, flat, isSearching } = usePaletteCommands(query)

// Map a flat index to keep ↑/↓ walking a single list across section headers.
const indexOf = (command: Command) => flat.value.findIndex((c) => c.id === command.id)

watch(open, async (value) => {
  if (!value) return
  query.value = ''
  active.value = 0
  await nextTick()
  input.value?.$el?.focus()
})

watch(flat, () => {
  active.value = Math.min(active.value, Math.max(flat.value.length - 1, 0))
})

onKeyStroke('k', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  open.value = true
})

function close() {
  open.value = false
}

function run(command: Command | undefined) {
  if (!command) return
  command.action()
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, flat.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(flat.value[active.value])
  }
}

const hasResults = computed(() => flat.value.length > 0)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent hide-close class="top-[18%] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0">
      <DialogTitle class="sr-only">Command palette</DialogTitle>
      <DialogDescription class="sr-only">
        Search projects, issues, saved views, and run common Lumen commands.
      </DialogDescription>

      <div class="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search projects, issues, views, or #issue…"
          aria-label="Search commands"
          class="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          @keydown="onKeydown"
        />
        <button
          type="button"
          aria-label="Close"
          class="shrink-0 rounded-sm text-muted-foreground opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="max-h-112 overflow-y-auto p-1.5">
        <div v-for="section in groups" :key="section.group" class="mb-1 last:mb-0">
          <div
            class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {{ section.group }}
            <Loader2
              v-if="section.group === 'Issues' && isSearching"
              class="size-3 animate-spin"
            />
          </div>
          <button
            v-for="command in section.items"
            :key="command.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none"
            :class="
              indexOf(command) === active ? 'bg-accent text-foreground' : 'text-muted-foreground'
            "
            @mouseenter="active = indexOf(command)"
            @click="run(command)"
          >
            <component :is="command.icon" class="size-4 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-foreground">
                {{ command.title }}
              </span>
              <span v-if="command.subtitle" class="block truncate font-mono text-xs">
                {{ command.subtitle }}
              </span>
            </span>
          </button>
        </div>

        <p v-if="!hasResults" class="px-3 py-8 text-center text-sm text-muted-foreground">
          No commands found.
        </p>
      </div>

      <div
        class="flex items-center gap-3 border-t border-border px-4 py-2 font-mono text-xs text-muted-foreground"
      >
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/shared/components/CommandPalette.test.ts`
Expected: PASS.

> If the teleported-content assertions prove flaky in jsdom (reka-ui `Dialog` uses a portal), fall back to asserting on `wrapper.html()` after setting `open` via a test-only trigger, or query `document.querySelector('[role="dialog"]')`. Keep the test green and meaningful (header + item rendered, Enter fires the action).

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/CommandPalette.vue src/shared/components/CommandPalette.test.ts
git commit -m "feat(palette): sectioned navigator render with footer hints"
```

---

## Task 5: Format, typecheck, full suite

**Files:** none (verification + cleanup commit if formatting changes anything).

- [ ] **Step 1: Format**

Run: `bun run format`
Expected: prettier rewrites any unformatted palette files; exits 0.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS, no errors. (The new GraphQL document is hand-typed, so no `bun codegen` run is required.)

- [ ] **Step 3: Run the full test suite**

Run: `bunx vitest run`
Expected: PASS — all prior tests plus the four new palette test files.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(palette): format" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage:** A (entities) → Tasks 1,3; B (sources/module) → Tasks 1,3; C (issue search, no codegen) → Task 2; D (sectioned render, flat nav, empty state, loading spinner, footer) → Task 4; E (testing) → tests in Tasks 1–4 + full run in Task 5.
- **Type consistency:** `Command`/`CommandGroup`/`PaletteContext`/`PaletteIssueHit`/`BrowserRow` defined once in `types.ts`; `GROUP_ORDER` is the single source of group ordering; `usePaletteIssueSearch` returns `{ hits, isFetching }`, consumed as such in `usePaletteCommands` and surfaced as `isSearching` to the component.
- **Manual GraphQL pattern** mirrors `useIssue.ts` — no `src/gitlab/generated` change, typecheck stays green.
- **Out of scope (deferred):** cross-project search, merge requests, recents/MRU.
