# tragit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four MVP slices of a personal, locally-run custom UI over a self-hosted GitLab instance's issues: project pick → filtered issue list → issue detail with notes → mutations.

**Architecture:** Vue 3 SPA. The Vite dev server proxies `/gitlab/*` to `$GITLAB_URL/api/*`, injecting the token server-side. GitLab is the source of truth (no local DB). TanStack Query (Vue Query) owns caching/refetch/loading-error state; `graphql-request` sends codegen-typed documents. Pure mapping/error logic is isolated into helper modules and unit-tested without network; composables are tested with a Vue Query harness that mocks the client; views are tested with mocked composables.

**Tech Stack:** Vite, Vue 3 (`<script setup>`, TS), Tailwind v4, Vue Router, `@tanstack/vue-query`, `graphql-request`, GraphQL Code Generator (client preset), Vitest + `@vue/test-utils` (jsdom). Tooling runs through **bun**.

---

## Prerequisite (one-time, needs the instance)

Before Task 4 and beyond, GraphQL types must be generated:

```bash
cp .env.example .env        # fill GITLAB_URL + GITLAB_TOKEN (scope: api)
bun run codegen             # introspects schema -> src/gitlab/generated/
```

`src/gitlab/generated/` is gitignored and rebuilt by codegen. Codegen also **validates** every `graphql()` document against your instance's schema — if it reports an unknown field/argument, the field name in this plan differs on your GitLab version; fix the document and re-run. Codegen IS the contract test for API shape (per the spec).

**Client-preset rule (important):** the `graphql()` tag only produces a *typed* document for query strings codegen has already seen. So **every time you add or change a `graphql()` document (Tasks 4–7), run `bun run codegen` before `bun run typecheck` or `bun run build`.** Vitest does not typecheck, so unit tests run without it — but typecheck/build will fail on an unknown document until codegen regenerates the overloads. Each task below calls this out in its typecheck step.

Tasks 1–2 have no network dependency and can be done first.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/gitlab/errors.ts` | Normalize `graphql-request`/network errors into a typed `GitLabError`. Pure. |
| `src/gitlab/issueParams.ts` | `IssueFilters` type, query-key builders, filter→GraphQL-variable mapping. Pure. |
| `src/gitlab/generated/` | Codegen output: `graphql()` tag + typed `TypedDocumentNode`s. |
| `src/test/withQuery.ts` | Test helper: mount a composable inside a Vue Query provider with retries off. |
| `src/composables/useProjects.ts` | `useQuery` for project search/list. |
| `src/composables/useIssues.ts` | `useQuery` for a project's filtered, paginated issues. |
| `src/composables/useIssue.ts` | `useQuery` for one issue (detail + notes). |
| `src/composables/useIssueMutations.ts` | `useCreateIssue`, `useAddNote`, `useUpdateIssue` + cache invalidation. |
| `src/components/*` | Presentational: `LabelChip`, `AssigneeAvatar`, `IssueRow`, `StateBadge`, `ErrorNotice`. |
| `src/views/ProjectPicker.vue` | Slice 1 — search + pick a project. |
| `src/views/IssueList.vue` | Slice 2 — filters, search, paginated list, create-issue. |
| `src/views/IssueDetail.vue` | Slice 3 + 4 — detail, notes, comment, state/labels/assignee edits. |
| `codegen.ts` | Adjusted to scan inline `graphql()` documents in `src/**/*.{ts,vue}`. |

GraphQL documents are written **inline** via the client-preset `graphql()` tag inside the composable that uses them (no separate `.graphql` files), keeping each query next to its consumer.

---

## Task 1: Error normalization helper

**Files:**
- Create: `src/gitlab/errors.ts`
- Test: `src/gitlab/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/gitlab/errors.test.ts
import { describe, it, expect } from 'vitest'
import { ClientError } from 'graphql-request'
import { normalizeError } from './errors'

const clientError = (status: number, errors: { message: string }[] = []) =>
  new ClientError(
    { status, errors, data: null, headers: new Headers() } as never,
    { query: '' } as never,
  )

describe('normalizeError', () => {
  it('maps 401/403 to an auth error with a .env hint', () => {
    const e = normalizeError(clientError(401))
    expect(e.kind).toBe('auth')
    expect(e.message).toMatch(/GITLAB_TOKEN/)
  })

  it('surfaces the first GraphQL error message', () => {
    const e = normalizeError(clientError(200, [{ message: 'Field x not found' }]))
    expect(e.kind).toBe('graphql')
    expect(e.message).toBe('Field x not found')
  })

  it('falls back to the message for a plain Error', () => {
    const e = normalizeError(new Error('boom'))
    expect(e).toEqual({ kind: 'unknown', message: 'boom' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/gitlab/errors.test.ts`
Expected: FAIL — `normalizeError` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gitlab/errors.ts
import { ClientError } from 'graphql-request'

export type GitLabErrorKind = 'auth' | 'graphql' | 'network' | 'unknown'

export interface GitLabError {
  kind: GitLabErrorKind
  message: string
}

export function normalizeError(err: unknown): GitLabError {
  if (err instanceof ClientError) {
    const status = err.response?.status
    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        message:
          'Authentication failed — check GITLAB_URL and GITLAB_TOKEN in .env (token scope: api).',
      }
    }
    const gql = err.response?.errors?.[0]?.message
    if (gql) return { kind: 'graphql', message: gql }
    return { kind: 'network', message: err.message }
  }
  if (err instanceof Error) return { kind: 'unknown', message: err.message }
  return { kind: 'unknown', message: 'Unknown error' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/gitlab/errors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/errors.ts src/gitlab/errors.test.ts
git commit -m "feat: normalize GitLab/graphql-request errors"
```

---

## Task 2: Issue filter + query-key helpers

**Files:**
- Create: `src/gitlab/issueParams.ts`
- Test: `src/gitlab/issueParams.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/gitlab/issueParams.test.ts
import { describe, it, expect } from 'vitest'
import { issuesKey, issueKey, toIssuesVars, type IssueFilters } from './issueParams'

describe('issueParams', () => {
  it('builds a stable, filter-aware list key', () => {
    const f: IssueFilters = { state: 'opened' }
    expect(issuesKey('grp/proj', f)).toEqual(['issues', 'grp/proj', f])
  })

  it('builds a detail key from path + iid', () => {
    expect(issueKey('grp/proj', '42')).toEqual(['issue', 'grp/proj', '42'])
  })

  it('omits empty filters and drops state=all', () => {
    const vars = toIssuesVars('grp/proj', { state: 'all', labels: [], search: '' })
    expect(vars).toEqual({ fullPath: 'grp/proj' })
  })

  it('maps populated filters to GraphQL args', () => {
    const vars = toIssuesVars(
      'grp/proj',
      { state: 'closed', labels: ['bug'], assignee: 'kdougan', milestone: 'v1', search: 'crash' },
      'CURSOR',
    )
    expect(vars).toEqual({
      fullPath: 'grp/proj',
      state: 'closed',
      labelName: ['bug'],
      assigneeUsernames: ['kdougan'],
      milestoneTitle: ['v1'],
      search: 'crash',
      after: 'CURSOR',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/gitlab/issueParams.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gitlab/issueParams.ts
export interface IssueFilters {
  state?: 'opened' | 'closed' | 'all'
  labels?: string[]
  assignee?: string
  milestone?: string
  search?: string
}

export const issuesKey = (fullPath: string, filters: IssueFilters) =>
  ['issues', fullPath, filters] as const

export const issueKey = (fullPath: string, iid: string) =>
  ['issue', fullPath, iid] as const

export function toIssuesVars(fullPath: string, filters: IssueFilters, after?: string) {
  const vars: Record<string, unknown> = { fullPath }
  if (filters.state && filters.state !== 'all') vars.state = filters.state
  if (filters.labels?.length) vars.labelName = filters.labels
  if (filters.assignee) vars.assigneeUsernames = [filters.assignee]
  if (filters.milestone) vars.milestoneTitle = [filters.milestone]
  if (filters.search) vars.search = filters.search
  if (after) vars.after = after
  return vars
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/gitlab/issueParams.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/issueParams.ts src/gitlab/issueParams.test.ts
git commit -m "feat: issue filter mapping and query-key builders"
```

---

## Task 3: Codegen bootstrap + test harness

Generates typed documents and adds the Vue Query test harness used by every composable test. **Requires** `.env` with a reachable instance + token.

**Files:**
- Modify: `codegen.ts` (scan inline `graphql()` in TS/Vue instead of `.graphql` files)
- Create: `src/test/withQuery.ts`
- Create: `src/test/probe.ts` (a throwaway document so codegen has something to emit)

- [ ] **Step 1: Point codegen at inline documents**

Replace the `documents` line in `codegen.ts`:

```ts
  documents: ['src/**/*.{ts,vue}', '!src/**/*.test.ts', '!src/gitlab/generated/**'],
```

- [ ] **Step 2: Add a probe document so the client preset emits `graphql()`**

```ts
// src/test/probe.ts — temporary; deleted in Step 6
import { graphql } from '@/gitlab/generated'

export const ProbeDocument = graphql(`
  query Probe {
    currentUser { username }
  }
`)
```

- [ ] **Step 3: Run codegen**

Run: `bun run codegen`
Expected: writes `src/gitlab/generated/` (`gql.ts`, `graphql.ts`, `index.ts`). If it errors with an auth/connection problem, fix `.env` first.

- [ ] **Step 4: Write the test harness**

```ts
// src/test/withQuery.ts
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

// Mounts `composable()` inside a Vue Query provider (retries off so failures
// surface immediately in tests). Returns a getter for the composable's result.
export function withQuery<T>(composable: () => T) {
  let result!: T
  const Comp = defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = mount(Comp, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  return { result: () => result, wrapper, queryClient }
}
```

- [ ] **Step 5: Verify typecheck passes with generated types present**

Run: `bun run typecheck`
Expected: PASS (no errors; `@/gitlab/generated` resolves).

- [ ] **Step 6: Remove the probe and commit**

```bash
rm src/test/probe.ts
git add codegen.ts src/test/withQuery.ts
git commit -m "chore: codegen for inline documents + Vue Query test harness"
```

---

## Task 4: Slice 1 — project picker

**Files:**
- Create: `src/composables/useProjects.ts`
- Create: `src/components/ErrorNotice.vue`
- Modify: `src/views/ProjectPicker.vue`
- Test: `src/composables/useProjects.test.ts`, `src/views/ProjectPicker.test.ts`

- [ ] **Step 1: Write the failing composable test**

```ts
// src/composables/useProjects.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useProjects } from './useProjects'

beforeEach(() => {
  request.mockReset()
})

describe('useProjects', () => {
  it('returns the projects nodes from the response', async () => {
    request.mockResolvedValue({
      projects: { nodes: [{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }] },
    })
    const { result } = withQuery(() => useProjects(ref('proj')))
    await flushPromises()
    expect(result().data.value).toEqual([{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }])
  })

  it('exposes a normalized error', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => useProjects(ref('')))
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'down' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/composables/useProjects.test.ts`
Expected: FAIL — `useProjects` missing.

- [ ] **Step 3: Implement the composable**

```ts
// src/composables/useProjects.ts
import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError } from '@/gitlab/errors'

const ProjectsDocument = graphql(`
  query Projects($search: String) {
    projects(membership: true, search: $search, first: 20, sort: "latest_activity_desc") {
      nodes { id fullPath name }
    }
  }
`)

async function fetchProjects(search: string) {
  try {
    const data = await gqlClient.request(ProjectsDocument, { search: search || null })
    return data.projects?.nodes?.filter((n): n is NonNullable<typeof n> => !!n) ?? []
  } catch (e) {
    throw normalizeError(e)
  }
}

export type ProjectSummary = Awaited<ReturnType<typeof fetchProjects>>[number]

export function useProjects(search: Ref<string>) {
  return useQuery({
    queryKey: ['projects', search] as const,
    queryFn: () => fetchProjects(search.value),
    placeholderData: (prev) => prev,
  })
}
```

> If codegen flags `sort` or `membership` args, adjust to your schema and re-run `bun run codegen`.

- [ ] **Step 4: Run composable test to verify it passes**

Run: `bun run test src/composables/useProjects.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the ErrorNotice component**

```vue
<!-- src/components/ErrorNotice.vue -->
<script setup lang="ts">
import type { GitLabError } from '@/gitlab/errors'
defineProps<{ error: GitLabError }>()
</script>

<template>
  <div role="alert" class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    {{ error.message }}
  </div>
</template>
```

- [ ] **Step 6: Write the failing view test**

```ts
// src/views/ProjectPicker.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useProjects', () => ({
  useProjects: () => ({
    data: ref([{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }]),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

import ProjectPicker from './ProjectPicker.vue'

describe('ProjectPicker', () => {
  it('renders a link to each project issue list', () => {
    const w = mount(ProjectPicker, { global: { stubs: { RouterLink: RouterLinkStub } } })
    const link = w.findComponent(RouterLinkStub)
    expect(link.text()).toContain('Proj')
    expect(link.props('to')).toEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
  })
})
```

- [ ] **Step 7: Run view test to verify it fails**

Run: `bun run test src/views/ProjectPicker.test.ts`
Expected: FAIL — view still renders the stub placeholder.

- [ ] **Step 8: Implement the view**

```vue
<!-- src/views/ProjectPicker.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useProjects } from '@/composables/useProjects'
import ErrorNotice from '@/components/ErrorNotice.vue'

const search = ref('')
const { data: projects, isLoading, error } = useProjects(search)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Projects</h1>
    <input
      v-model="search"
      type="search"
      placeholder="Search projects…"
      class="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
    />
    <ErrorNotice v-if="error" :error="error" />
    <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
    <ul v-else class="divide-y divide-neutral-200 rounded border border-neutral-200">
      <li v-for="p in projects" :key="p.id">
        <RouterLink
          :to="{ name: 'issues', params: { fullPath: p.fullPath } }"
          class="block px-3 py-2 hover:bg-neutral-100"
        >
          <span class="font-medium">{{ p.name }}</span>
          <span class="ml-2 text-xs text-neutral-500">{{ p.fullPath }}</span>
        </RouterLink>
      </li>
      <li v-if="!projects?.length" class="px-3 py-2 text-sm text-neutral-500">No projects.</li>
    </ul>
  </section>
</template>
```

- [ ] **Step 9: Regenerate types, run tests + typecheck**

Run: `bun run codegen && bun run test src/views/ProjectPicker.test.ts && bun run typecheck`
Expected: codegen picks up the new `Projects` document; tests PASS; typecheck PASS.

- [ ] **Step 10: Commit**

```bash
git add src/composables/useProjects.ts src/composables/useProjects.test.ts \
  src/components/ErrorNotice.vue src/views/ProjectPicker.vue src/views/ProjectPicker.test.ts
git commit -m "feat: project picker (slice 1)"
```

---

## Task 5: Slice 2 — filtered issue list

**Files:**
- Create: `src/composables/useIssues.ts`
- Create: `src/components/LabelChip.vue`, `src/components/StateBadge.vue`, `src/components/IssueRow.vue`
- Modify: `src/views/IssueList.vue`
- Test: `src/composables/useIssues.test.ts`, `src/components/IssueRow.test.ts`, `src/views/IssueList.test.ts`

- [ ] **Step 1: Write the failing composable test**

```ts
// src/composables/useIssues.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useIssues } from './useIssues'

beforeEach(() => {
  request.mockReset()
})

describe('useIssues', () => {
  it('returns nodes and pageInfo for a project', async () => {
    request.mockResolvedValue({
      project: {
        issues: {
          nodes: [{ iid: '1', title: 'Bug', state: 'opened', webUrl: '#', labels: { nodes: [] }, assignees: { nodes: [] } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })
    const { result } = withQuery(() => useIssues(ref('grp/proj'), ref({ state: 'opened' })))
    await flushPromises()
    expect(result().data.value?.nodes).toHaveLength(1)
    expect(result().data.value?.pageInfo.hasNextPage).toBe(false)
  })

  it('passes mapped filter variables to the request', async () => {
    request.mockResolvedValue({ project: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } })
    withQuery(() => useIssues(ref('grp/proj'), ref({ search: 'crash' })))
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fullPath: 'grp/proj', search: 'crash' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/composables/useIssues.test.ts`
Expected: FAIL — `useIssues` missing.

- [ ] **Step 3: Implement the composable**

```ts
// src/composables/useIssues.ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError } from '@/gitlab/errors'
import { issuesKey, toIssuesVars, type IssueFilters } from '@/gitlab/issueParams'

const IssuesDocument = graphql(`
  query Issues(
    $fullPath: ID!
    $state: IssuableState
    $labelName: [String!]
    $assigneeUsernames: [String!]
    $milestoneTitle: [String!]
    $search: String
    $after: String
  ) {
    project(fullPath: $fullPath) {
      issues(
        state: $state
        labelName: $labelName
        assigneeUsernames: $assigneeUsernames
        milestoneTitle: $milestoneTitle
        search: $search
        first: 20
        after: $after
        sort: UPDATED_DESC
      ) {
        nodes {
          iid
          title
          state
          webUrl
          labels { nodes { id title color } }
          assignees { nodes { id username avatarUrl } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`)

async function fetchIssues(fullPath: string, filters: IssueFilters) {
  try {
    const data = await gqlClient.request(IssuesDocument, toIssuesVars(fullPath, filters))
    return {
      nodes:
        data.project?.issues?.nodes?.filter((n): n is NonNullable<typeof n> => !!n) ?? [],
      pageInfo: data.project?.issues?.pageInfo ?? { hasNextPage: false, endCursor: null },
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export type IssueListItem = Awaited<ReturnType<typeof fetchIssues>>['nodes'][number]

export function useIssues(fullPath: Ref<string>, filters: Ref<IssueFilters>) {
  return useQuery({
    queryKey: computed(() => issuesKey(fullPath.value, filters.value)),
    queryFn: () => fetchIssues(fullPath.value, filters.value),
  })
}
```

> If codegen flags an enum/arg (e.g. `IssuableState`, `sort`), align to your schema and re-run codegen.

- [ ] **Step 4: Run composable test to verify it passes**

Run: `bun run test src/composables/useIssues.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the presentational components**

```vue
<!-- src/components/LabelChip.vue -->
<script setup lang="ts">
defineProps<{ title: string; color: string }>()
</script>
<template>
  <span
    class="inline-block rounded px-1.5 py-0.5 text-xs font-medium text-white"
    :style="{ backgroundColor: color }"
  >{{ title }}</span>
</template>
```

```vue
<!-- src/components/StateBadge.vue -->
<script setup lang="ts">
const props = defineProps<{ state: string }>()
const open = props.state === 'opened'
</script>
<template>
  <span
    class="rounded px-1.5 py-0.5 text-xs font-medium"
    :class="open ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'"
  >{{ open ? 'Open' : 'Closed' }}</span>
</template>
```

```vue
<!-- src/components/IssueRow.vue -->
<script setup lang="ts">
import LabelChip from './LabelChip.vue'
import StateBadge from './StateBadge.vue'
import type { IssueListItem } from '@/composables/useIssues'
defineProps<{ issue: IssueListItem; fullPath: string }>()
</script>
<template>
  <RouterLink
    :to="{ name: 'issue', params: { fullPath, iid: issue.iid } }"
    class="flex items-center gap-2 px-3 py-2 hover:bg-neutral-100"
  >
    <StateBadge :state="issue.state" />
    <span class="font-medium">#{{ issue.iid }}</span>
    <span class="truncate">{{ issue.title }}</span>
    <span class="ml-auto flex gap-1">
      <LabelChip v-for="l in issue.labels.nodes" :key="l.id" :title="l.title" :color="l.color" />
    </span>
  </RouterLink>
</template>
```

- [ ] **Step 6: Write the failing IssueRow test**

```ts
// src/components/IssueRow.test.ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import IssueRow from './IssueRow.vue'

const issue = {
  iid: '7', title: 'Crash on save', state: 'opened', webUrl: '#',
  labels: { nodes: [{ id: 'l1', title: 'bug', color: '#f00' }] },
  assignees: { nodes: [] },
}

describe('IssueRow', () => {
  it('links to the detail route and shows the title + label', () => {
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('Crash on save')
    expect(w.text()).toContain('bug')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'issue', params: { fullPath: 'grp/proj', iid: '7' },
    })
  })
})
```

- [ ] **Step 7: Run IssueRow test to verify it passes**

Run: `bun run test src/components/IssueRow.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing view test**

```ts
// src/views/IssueList.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useIssues', () => ({
  useIssues: () => ({
    data: ref({ nodes: [{ iid: '7', title: 'Crash', state: 'opened', webUrl: '#', labels: { nodes: [] }, assignees: { nodes: [] } }], pageInfo: { hasNextPage: false, endCursor: null } }),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

import IssueList from './IssueList.vue'

describe('IssueList', () => {
  it('renders a row per issue', async () => {
    const w = mount(IssueList, {
      props: { fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    expect(w.text()).toContain('Crash')
  })
})
```

- [ ] **Step 9: Run view test to verify it fails**

Run: `bun run test src/views/IssueList.test.ts`
Expected: FAIL — placeholder view.

- [ ] **Step 10: Implement the view**

```vue
<!-- src/views/IssueList.vue -->
<script setup lang="ts">
import { computed, reactive, ref, toRef } from 'vue'
import { useIssues } from '@/composables/useIssues'
import type { IssueFilters } from '@/gitlab/issueParams'
import IssueRow from '@/components/IssueRow.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string }>()

// Raw text inputs; mapped into IssueFilters (labels is comma-separated).
const state = ref<IssueFilters['state']>('opened')
const search = ref('')
const labelsText = ref('')
const assignee = ref('')
const milestone = ref('')

const filters = computed<IssueFilters>(() => ({
  state: state.value,
  search: search.value || undefined,
  labels: labelsText.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  assignee: assignee.value || undefined,
  milestone: milestone.value || undefined,
}))

const { data, isLoading, error } = useIssues(toRef(props, 'fullPath'), filters)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Issues — {{ fullPath }}</h1>
    <div class="flex flex-wrap gap-2">
      <select v-model="state" class="rounded border border-neutral-300 px-2 py-1 text-sm">
        <option value="opened">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>
      <input
        v-model="search"
        type="search"
        placeholder="Search issues…"
        class="flex-1 rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <input
        v-model="labelsText"
        placeholder="Labels (comma-separated)"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <input
        v-model="assignee"
        placeholder="Assignee username"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <input
        v-model="milestone"
        placeholder="Milestone"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
      />
    </div>
    <ErrorNotice v-if="error" :error="error" />
    <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
    <ul v-else class="divide-y divide-neutral-200 rounded border border-neutral-200">
      <li v-for="issue in data?.nodes" :key="issue.iid">
        <IssueRow :issue="issue" :full-path="fullPath" />
      </li>
      <li v-if="!data?.nodes.length" class="px-3 py-2 text-sm text-neutral-500">No issues.</li>
    </ul>
  </section>
</template>
```

> `toRef(filters)` passes the reactive filters object as a single ref so the query key updates when any filter changes.

- [ ] **Step 11: Regenerate types, run tests + typecheck**

Run: `bun run codegen && bun run test src/views/IssueList.test.ts && bun run typecheck`
Expected: codegen picks up the new `Issues` document; tests PASS; typecheck PASS.

- [ ] **Step 12: Commit**

```bash
git add src/composables/useIssues.ts src/composables/useIssues.test.ts \
  src/components/LabelChip.vue src/components/StateBadge.vue \
  src/components/IssueRow.vue src/components/IssueRow.test.ts \
  src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: filtered issue list (slice 2)"
```

---

## Task 6: Slice 3 — issue detail + notes

**Files:**
- Create: `src/composables/useIssue.ts`
- Create: `src/components/AssigneeAvatar.vue`
- Modify: `src/views/IssueDetail.vue`
- Test: `src/composables/useIssue.test.ts`, `src/views/IssueDetail.test.ts`

- [ ] **Step 1: Write the failing composable test**

```ts
// src/composables/useIssue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useIssue } from './useIssue'

beforeEach(() => {
  request.mockReset()
})

describe('useIssue', () => {
  it('returns the issue with its notes', async () => {
    request.mockResolvedValue({
      project: {
        issue: {
          id: 'gid://issue/9', iid: '9', title: 'Bug', description: 'desc', state: 'opened', webUrl: '#',
          milestone: { title: 'v1' },
          labels: { nodes: [] }, assignees: { nodes: [] },
          notes: { nodes: [{ id: 'n1', body: 'me too', system: false, createdAt: '2026-01-01T00:00:00Z', author: { username: 'a', avatarUrl: '#' } }] },
        },
      },
    })
    const { result } = withQuery(() => useIssue(ref('grp/proj'), ref('9')))
    await flushPromises()
    expect(result().data.value?.title).toBe('Bug')
    expect(result().data.value?.notes.nodes).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/composables/useIssue.test.ts`
Expected: FAIL — `useIssue` missing.

- [ ] **Step 3: Implement the composable**

```ts
// src/composables/useIssue.ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError } from '@/gitlab/errors'
import { issueKey } from '@/gitlab/issueParams'

const IssueDocument = graphql(`
  query Issue($fullPath: ID!, $iid: String!) {
    project(fullPath: $fullPath) {
      issue(iid: $iid) {
        id
        iid
        title
        description
        state
        webUrl
        milestone { title }
        labels { nodes { id title color } }
        assignees { nodes { id username avatarUrl } }
        notes(first: 100) {
          nodes { id body system createdAt author { username avatarUrl } }
        }
      }
    }
  }
`)

async function fetchIssue(fullPath: string, iid: string) {
  try {
    const data = await gqlClient.request(IssueDocument, { fullPath, iid })
    return data.project?.issue ?? null
  } catch (e) {
    throw normalizeError(e)
  }
}

export type IssueDetail = NonNullable<Awaited<ReturnType<typeof fetchIssue>>>

export function useIssue(fullPath: Ref<string>, iid: Ref<string>) {
  return useQuery({
    queryKey: computed(() => issueKey(fullPath.value, iid.value)),
    queryFn: () => fetchIssue(fullPath.value, iid.value),
  })
}
```

- [ ] **Step 4: Run composable test to verify it passes**

Run: `bun run test src/composables/useIssue.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the AssigneeAvatar component**

```vue
<!-- src/components/AssigneeAvatar.vue -->
<script setup lang="ts">
defineProps<{ username: string; avatarUrl?: string | null }>()
</script>
<template>
  <span class="inline-flex items-center gap-1 text-xs text-neutral-600" :title="username">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="username" class="h-5 w-5 rounded-full" />
    <span>@{{ username }}</span>
  </span>
</template>
```

- [ ] **Step 6: Write the failing view test**

```ts
// src/views/IssueDetail.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useIssue', () => ({
  useIssue: () => ({
    data: ref({
      id: 'gid://issue/9', iid: '9', title: 'Bug', description: 'the description', state: 'opened', webUrl: '#',
      milestone: { title: 'v1' }, labels: { nodes: [] }, assignees: { nodes: [{ id: 'u1', username: 'a', avatarUrl: null }] },
      notes: { nodes: [{ id: 'n1', body: 'me too', system: false, createdAt: '2026-01-01T00:00:00Z', author: { username: 'a', avatarUrl: null } }] },
    }),
    isLoading: ref(false), error: ref(null),
  }),
}))
vi.mock('@/composables/useIssueMutations', () => ({
  useAddNote: () => ({ mutate: vi.fn(), isPending: ref(false) }),
  useUpdateIssue: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}))

import IssueDetail from './IssueDetail.vue'

describe('IssueDetail', () => {
  it('renders title, description, assignee, and notes', async () => {
    const w = mount(IssueDetail, { props: { fullPath: 'grp/proj', iid: '9' } })
    await flushPromises()
    expect(w.text()).toContain('Bug')
    expect(w.text()).toContain('the description')
    expect(w.text()).toContain('@a')
    expect(w.text()).toContain('me too')
  })
})
```

- [ ] **Step 7: Run view test to verify it fails**

Run: `bun run test src/views/IssueDetail.test.ts`
Expected: FAIL — placeholder view (and mutation composables not yet present; that's fine, mocked).

- [ ] **Step 8: Implement the view (read parts; mutation wiring lands in Task 7)**

```vue
<!-- src/views/IssueDetail.vue -->
<script setup lang="ts">
import { toRef } from 'vue'
import { useIssue } from '@/composables/useIssue'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import LabelChip from '@/components/LabelChip.vue'
import StateBadge from '@/components/StateBadge.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string; iid: string }>()
const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))
</script>

<template>
  <ErrorNotice v-if="error" :error="error" />
  <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
  <article v-else-if="issue" class="space-y-4">
    <header class="flex items-center gap-2">
      <StateBadge :state="issue.state" />
      <h1 class="text-lg font-semibold">#{{ issue.iid }} {{ issue.title }}</h1>
    </header>
    <p class="whitespace-pre-wrap text-sm">{{ issue.description }}</p>
    <div class="flex flex-wrap gap-2">
      <LabelChip v-for="l in issue.labels.nodes" :key="l.id" :title="l.title" :color="l.color" />
    </div>
    <div class="flex flex-wrap gap-2">
      <AssigneeAvatar
        v-for="a in issue.assignees.nodes"
        :key="a.id"
        :username="a.username"
        :avatar-url="a.avatarUrl"
      />
    </div>
    <p v-if="issue.milestone" class="text-xs text-neutral-500">Milestone: {{ issue.milestone.title }}</p>
    <section class="space-y-2">
      <h2 class="text-sm font-semibold">Notes</h2>
      <ul class="space-y-2">
        <li
          v-for="n in issue.notes.nodes"
          :key="n.id"
          class="rounded border border-neutral-200 p-2 text-sm"
        >
          <span class="font-medium">@{{ n.author?.username }}</span>
          <span class="ml-2 text-xs text-neutral-400">{{ n.createdAt }}</span>
          <p class="mt-1 whitespace-pre-wrap">{{ n.body }}</p>
        </li>
      </ul>
    </section>
  </article>
</template>
```

- [ ] **Step 9: Regenerate types, run tests + typecheck**

Run: `bun run codegen && bun run test src/views/IssueDetail.test.ts && bun run typecheck`
Expected: codegen picks up the new `Issue` document; tests PASS; typecheck PASS.

- [ ] **Step 10: Commit**

```bash
git add src/composables/useIssue.ts src/composables/useIssue.test.ts \
  src/components/AssigneeAvatar.vue src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat: issue detail with notes (slice 3)"
```

---

## Task 7: Slice 4 — mutations (create issue, comment, state/labels/assignee)

GitLab exposes these as three mutations: `createIssue`, `createNote`, and `updateIssue` (the last carries `stateEvent`, `addLabelIds`/`removeLabelIds`, and `assigneeUsernames`). All mutations invalidate the relevant query keys so the UI reflects GitLab afterward.

**Files:**
- Create: `src/composables/useIssueMutations.ts`
- Modify: `src/views/IssueList.vue` (create-issue form), `src/views/IssueDetail.vue` (comment box + open/close button)
- Test: `src/composables/useIssueMutations.test.ts`, extend `src/views/IssueDetail.test.ts`

- [ ] **Step 1: Write the failing mutations test**

```ts
// src/composables/useIssueMutations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useAddNote, useUpdateIssue, useCreateIssue } from './useIssueMutations'

beforeEach(() => {
  request.mockReset()
})

describe('issue mutations', () => {
  it('useAddNote invalidates the issue query on success', async () => {
    request.mockResolvedValue({ createNote: { note: { id: 'n2' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useAddNote('grp/proj', '9'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    result().mutate({ noteableId: 'gid://issue/9', body: 'hi' })
    await flushPromises()
    expect(request).toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'grp/proj', '9'] })
  })

  it('useUpdateIssue throws normalized error on GraphQL errors[]', async () => {
    request.mockResolvedValue({ updateIssue: { issue: null, errors: ['nope'] } })
    const { result } = withQuery(() => useUpdateIssue('grp/proj', '9'))
    await expect(
      (result() as { mutateAsync: (v: unknown) => Promise<unknown> }).mutateAsync({ stateEvent: 'CLOSE' }),
    ).rejects.toMatchObject({ kind: 'graphql', message: 'nope' })
  })

  it('useCreateIssue invalidates the project issue list', async () => {
    request.mockResolvedValue({ createIssue: { issue: { iid: '10' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useCreateIssue('grp/proj'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    result().mutate({ title: 'New' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', 'grp/proj'] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/composables/useIssueMutations.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the mutations composable**

```ts
// src/composables/useIssueMutations.ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

const CreateIssueDocument = graphql(`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) { issue { iid } errors }
  }
`)
const CreateNoteDocument = graphql(`
  mutation CreateNote($input: CreateNoteInput!) {
    createNote(input: $input) { note { id } errors }
  }
`)
const UpdateIssueDocument = graphql(`
  mutation UpdateIssue($input: UpdateIssueInput!) {
    updateIssue(input: $input) { issue { iid state } errors }
  }
`)

type Payload = { errors: string[] } | null | undefined

// Sends the request, normalizes transport errors, and rejects with a typed
// GitLabError when the mutation payload carries errors[]. `pick` pulls the
// mutation field off the typed response.
async function run<P extends Payload>(
  send: () => Promise<unknown>,
  pick: (data: never) => P,
): Promise<NonNullable<P>> {
  let data: unknown
  try {
    data = await send()
  } catch (e) {
    throw normalizeError(e)
  }
  const payload = pick(data as never)
  if (payload?.errors?.length) {
    throw { kind: 'graphql', message: payload.errors[0] } satisfies GitLabError
  }
  return payload as NonNullable<P>
}

export function useCreateIssue(fullPath: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; description?: string }) =>
      run(
        () => gqlClient.request(CreateIssueDocument, { input: { projectPath: fullPath, ...input } }),
        (d: { createIssue?: { issue?: { iid: string } | null; errors: string[] } | null }) =>
          d.createIssue,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', fullPath] }),
  })
}

export function useAddNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { noteableId: string; body: string }) =>
      run(
        () => gqlClient.request(CreateNoteDocument, { input }),
        (d: { createNote?: { note?: { id: string } | null; errors: string[] } | null }) =>
          d.createNote,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] }),
  })
}

export function useUpdateIssue(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (changes: {
      stateEvent?: 'CLOSE' | 'REOPEN'
      addLabelIds?: string[]
      removeLabelIds?: string[]
      assigneeUsernames?: string[]
    }) =>
      run(
        () =>
          gqlClient.request(UpdateIssueDocument, {
            input: { projectPath: fullPath, iid, ...changes },
          }),
        (d: { updateIssue?: { issue?: { iid: string; state: string } | null; errors: string[] } | null }) =>
          d.updateIssue,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] })
      qc.invalidateQueries({ queryKey: ['issues', fullPath] })
    },
  })
}
```

> The `pick` callbacks are typed loosely against the mutation payload shape; codegen's generated result types are the real contract, and `bun run typecheck` will flag any mismatch.

> Codegen validates `CreateIssueInput`/`CreateNoteInput`/`UpdateIssueInput` and `stateEvent` against your schema. If a field differs (e.g. assignees via a separate `issueSetAssignees` mutation on your version), adjust here and re-run codegen.

- [ ] **Step 4: Run mutations test to verify it passes**

Run: `bun run test src/composables/useIssueMutations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Extend the IssueDetail test for the comment box + close button**

Add to `src/views/IssueDetail.test.ts`:

```ts
it('adds a note when the comment form is submitted', async () => {
  const mutate = vi.fn()
  // Re-mock useAddNote for this test
  const mod = await import('@/composables/useIssueMutations')
  vi.spyOn(mod, 'useAddNote').mockReturnValue({ mutate, isPending: ref(false) } as never)

  const { mount, flushPromises } = await import('@vue/test-utils')
  const IssueDetail = (await import('./IssueDetail.vue')).default
  const w = mount(IssueDetail, { props: { fullPath: 'grp/proj', iid: '9' } })
  await flushPromises()
  await w.find('textarea').setValue('a new comment')
  await w.find('form').trigger('submit.prevent')
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({ noteableId: 'gid://issue/9', body: 'a new comment' }),
  )
})
```

- [ ] **Step 6: Run the extended view test to verify it fails**

Run: `bun run test src/views/IssueDetail.test.ts`
Expected: FAIL — no `<form>`/`<textarea>` in the view yet.

- [ ] **Step 7: Wire mutations into IssueDetail.vue**

Replace the `<script setup>` block and append the comment form + close button:

```vue
<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useIssue } from '@/composables/useIssue'
import { useAddNote, useUpdateIssue } from '@/composables/useIssueMutations'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import LabelChip from '@/components/LabelChip.vue'
import StateBadge from '@/components/StateBadge.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string; iid: string }>()
const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))
const addNote = useAddNote(props.fullPath, props.iid)
const updateIssue = useUpdateIssue(props.fullPath, props.iid)

const comment = ref('')
function submitComment() {
  if (!issue.value || !comment.value.trim()) return
  addNote.mutate(
    { noteableId: issue.value.id, body: comment.value },
    { onSuccess: () => (comment.value = '') },
  )
}
function toggleState() {
  if (!issue.value) return
  updateIssue.mutate({ stateEvent: issue.value.state === 'opened' ? 'CLOSE' : 'REOPEN' })
}
</script>
```

Add to the `<template>`, inside `<article>` after the header and before the description:

```vue
    <button
      type="button"
      class="rounded border border-neutral-300 px-2 py-1 text-xs"
      :disabled="updateIssue.isPending.value"
      @click="toggleState"
    >
      {{ issue.state === 'opened' ? 'Close issue' : 'Reopen issue' }}
    </button>
```

And add at the end of the Notes `<section>`, after the `<ul>`:

```vue
      <form class="space-y-2" @submit.prevent="submitComment">
        <textarea
          v-model="comment"
          rows="3"
          placeholder="Add a comment…"
          class="w-full rounded border border-neutral-300 p-2 text-sm"
        ></textarea>
        <button
          type="submit"
          class="rounded bg-neutral-900 px-3 py-1 text-sm text-white"
          :disabled="addNote.isPending.value"
        >
          Comment
        </button>
      </form>
```

- [ ] **Step 8: Run the view tests to verify they pass**

Run: `bun run test src/views/IssueDetail.test.ts`
Expected: PASS (render test + comment test).

- [ ] **Step 9: Add a create-issue form to IssueList.vue**

In `src/views/IssueList.vue` `<script setup>`, add (`ref` is already imported from Task 5):

```ts
import { useCreateIssue } from '@/composables/useIssueMutations'
const createIssue = useCreateIssue(props.fullPath)
const newTitle = ref('')
function submitNew() {
  if (!newTitle.value.trim()) return
  createIssue.mutate({ title: newTitle.value }, { onSuccess: () => (newTitle.value = '') })
}
```

In the `<template>`, add above the list:

```vue
    <form class="flex gap-2" @submit.prevent="submitNew">
      <input
        v-model="newTitle"
        placeholder="New issue title…"
        class="flex-1 rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <button
        type="submit"
        class="rounded bg-neutral-900 px-3 py-1 text-sm text-white"
        :disabled="createIssue.isPending.value"
      >
        Create
      </button>
    </form>
```

- [ ] **Step 10: Add a create-issue test to IssueList.test.ts**

```ts
it('creates an issue from the new-issue form', async () => {
  const mutate = vi.fn()
  const mod = await import('@/composables/useIssueMutations')
  vi.spyOn(mod, 'useCreateIssue').mockReturnValue({ mutate, isPending: ref(false) } as never)

  const w = mount(IssueList, {
    props: { fullPath: 'grp/proj' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await w.find('input[placeholder="New issue title…"]').setValue('Brand new')
  await w.find('form').trigger('submit.prevent')
  expect(mutate).toHaveBeenCalledWith({ title: 'Brand new' }, expect.anything())
})
```

Add `vi` to the vitest import and mock `useIssueMutations` at the top of the file:

```ts
vi.mock('@/composables/useIssueMutations', () => ({
  useCreateIssue: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}))
```

- [ ] **Step 11: Regenerate types, run the full suite + typecheck + build**

Run: `bun run codegen && bun run test && bun run typecheck && bun run build`
Expected: codegen picks up the three new mutation documents; all tests PASS; typecheck PASS; production build succeeds.

- [ ] **Step 12: Commit**

```bash
git add src/composables/useIssueMutations.ts src/composables/useIssueMutations.test.ts \
  src/views/IssueDetail.vue src/views/IssueDetail.test.ts \
  src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: issue mutations — create, comment, state (slice 4)"
```

---

## Final verification

- [ ] `bun run test` — all suites green
- [ ] `bun run typecheck` — no errors
- [ ] `bun run build` — production build succeeds
- [ ] Manual smoke: `bun run dev`, pick a project, filter issues, open one, comment, close/reopen, create an issue — each reflects in GitLab after the action.

## Notes / known follow-ups (out of MVP scope)

- Pagination UI ("load more" using `pageInfo.endCursor`) — composable already returns `pageInfo`; wiring a button is a small follow-up.
- Label/assignee **editing** UI in detail view (the `useUpdateIssue` composable supports `addLabelIds`/`removeLabelIds`/`assigneeUsernames`; only the state toggle is wired in MVP).
- Persisting a default project in `.env`.
