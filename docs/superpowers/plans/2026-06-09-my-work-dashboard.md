# My Work Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` a cross-project "My Work" home with three lanes — Assigned Issues, Assigned MRs, Awaiting My Review — linking into the existing in-app detail views.

**Architecture:** New `src/features/dashboard/` module: pure `lib/dashboard.ts` (webPath parsing, query keys, shared MR selection set), four manual-typed query composables, three presentational components (lane + two row types), and `MyWork.vue`. `timeAgo` is lifted from the pipelines feature into `src/shared/lib/time.ts`. Routing: `/` → MyWork, Project Picker → `/projects` (name preserved); post-connect redirect → home.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, `@tanstack/vue-query` (`useQuery`), `graphql-request` via `gqlClient`, reka-ui, Tailwind v4. Tests: vitest (`bunx vitest run`), `@vue/test-utils`, `withQuery`, `RouterLinkStub`.

**Conventions:**
- GraphQL = inline template-literal document + hand-written result type + `gqlClient.request<Result, Vars>`, errors via `normalizeError` (see `src/features/issues/composables/useIssue.ts`). **No codegen.**
- Confirmed enum literals: `state: opened` (IssuableState/MergeRequestState), `sort: UPDATED_DESC` (Issue/MergeRequestSort) — both non-deprecated.
- Query-composable tests mock `@/gitlab/client` + use `withQuery` (see `useIssues.test.ts`).
- Run `bun run format` then `bun run typecheck` after each task. Tests: `bunx vitest run` (never `bun test`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/shared/lib/time.ts` | `timeAgo(iso)` relative-time formatter (lifted from pipelineFormat) |
| `src/shared/lib/time.test.ts` | test for `timeAgo` |
| `src/features/pipelines/lib/pipelineFormat.ts` | (modify) re-export `timeAgo` from shared |
| `src/features/dashboard/lib/dashboard.ts` | pure: `parseIssuePath`, `dashboardKeys`, `DASHBOARD_POLL_MS`, `MR_NODE_FIELDS`, `DashboardMr`/`DashboardIssue` types |
| `src/features/dashboard/lib/dashboard.test.ts` | tests for the pure helpers |
| `src/features/dashboard/composables/useCurrentUser.ts` | `currentUser { username }` query |
| `src/features/dashboard/composables/useAssignedIssues.ts` | root assigned-issues query (gated on username) |
| `src/features/dashboard/composables/useAssignedMergeRequests.ts` | `currentUser.assignedMergeRequests` |
| `src/features/dashboard/composables/useReviewRequestedMergeRequests.ts` | `currentUser.reviewRequestedMergeRequests` |
| `src/features/dashboard/components/DashboardLane.vue` | titled section: header + loading/empty/error + rows slot |
| `src/features/dashboard/components/DashboardIssueRow.vue` | cross-project issue row |
| `src/features/dashboard/components/DashboardMrRow.vue` | cross-project MR row |
| `src/views/MyWork.vue` | the dashboard view wiring the three lanes |
| `src/router/index.ts` | (modify) home route + picker → `/projects` |
| `src/router/index.test.ts` | (extend) home + projects routes |
| `src/views/ConnectView.vue` | (modify) post-connect redirect → home |
| `src/views/ProjectPicker.vue` | (modify) back-to-My-Work affordance |
| `src/features/palette/lib/sources.ts` | (modify) "Go to My Work" action |
| `src/features/palette/lib/sources.test.ts` | (extend) the new action |

---

## Task 1: Lift `timeAgo` to a shared util

**Files:**
- Create: `src/shared/lib/time.ts`
- Create: `src/shared/lib/time.test.ts`
- Modify: `src/features/pipelines/lib/pipelineFormat.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/lib/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { timeAgo } from './time'

describe('timeAgo', () => {
  it('formats a recent time in minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(fiveMinAgo)).toMatch(/minute/)
  })
  it('formats hours and days', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString())).toMatch(/hour/)
    expect(timeAgo(new Date(Date.now() - 2 * 86_400_000).toISOString())).toMatch(/day/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/shared/lib/time.test.ts`
Expected: FAIL — cannot resolve `./time`.

- [ ] **Step 3: Create the shared util**

Create `src/shared/lib/time.ts`:

```ts
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]

/** ISO timestamp → localized relative string, e.g. "5 minutes ago". */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  for (const [unit, secs] of UNITS) {
    if (diff >= secs || unit === 'second') return RELATIVE.format(-Math.floor(diff / secs), unit)
  }
  return ''
}
```

- [ ] **Step 4: Re-export from pipelineFormat (keep its public surface intact)**

In `src/features/pipelines/lib/pipelineFormat.ts`, remove the local `RELATIVE`, `UNITS`, and `timeAgo` definitions and instead import + re-export from the shared util. At the top, add:

```ts
import { timeAgo } from '@/shared/lib/time'
```

Replace the removed `export function timeAgo(...)` (and its `RELATIVE`/`UNITS` consts) with a re-export so existing importers (`pipelineFormat.test.ts`) keep working:

```ts
export { timeAgo }
```

(Leave `timing()` — which calls `timeAgo` — unchanged; it now uses the imported one.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/shared/lib/time.test.ts src/features/pipelines/lib/pipelineFormat.test.ts`
Expected: PASS (new time tests + the existing pipelineFormat tests, including its `timeAgo` test).

- [ ] **Step 6: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/shared/lib/time.ts src/shared/lib/time.test.ts src/features/pipelines/lib/pipelineFormat.ts
git commit -m "refactor(time): lift timeAgo into a shared util"
```

---

## Task 2: `lib/dashboard.ts` — pure helpers

**Files:**
- Create: `src/features/dashboard/lib/dashboard.ts`
- Test: `src/features/dashboard/lib/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/lib/dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseIssuePath, dashboardKeys } from './dashboard'

describe('parseIssuePath', () => {
  it('extracts fullPath + iid from a simple project path', () => {
    expect(parseIssuePath('/grp/proj/-/issues/42')).toEqual({ fullPath: 'grp/proj', iid: '42' })
  })
  it('handles nested groups', () => {
    expect(parseIssuePath('/grp/sub/proj/-/issues/7')).toEqual({
      fullPath: 'grp/sub/proj',
      iid: '7',
    })
  })
  it('returns null for non-issue paths', () => {
    expect(parseIssuePath('/grp/proj/-/merge_requests/3')).toBeNull()
    expect(parseIssuePath('')).toBeNull()
  })
})

describe('dashboardKeys', () => {
  it('namespaces the assigned-issues key by username', () => {
    expect(dashboardKeys.assignedIssues('ada')).toEqual(['dashboard', 'assigned-issues', 'ada'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/dashboard/lib/dashboard.test.ts`
Expected: FAIL — cannot resolve `./dashboard`.

- [ ] **Step 3: Implement**

Create `src/features/dashboard/lib/dashboard.ts`:

```ts
export const DASHBOARD_POLL_MS = 30_000

export const dashboardKeys = {
  currentUser: ['dashboard', 'current-user'] as const,
  assignedIssues: (username: string) => ['dashboard', 'assigned-issues', username] as const,
  assignedMrs: ['dashboard', 'assigned-mrs'] as const,
  reviewRequestedMrs: ['dashboard', 'review-requested-mrs'] as const,
}

// GitLab's root `issues` query exposes no project object — only `webPath`, which
// looks like `/group/sub/proj/-/issues/42`. Pull the project full path and iid so
// the dashboard can deep-link into the in-app issue route.
export function parseIssuePath(webPath: string): { fullPath: string; iid: string } | null {
  const m = webPath.match(/^\/(.+)\/-\/issues\/(\d+)/)
  if (!m) return null
  return { fullPath: m[1], iid: m[2] }
}

type UserCore = { name?: string | null; username: string }
type LabelNode = { id: string; title: string; color: string }

export type DashboardIssue = {
  iid: string
  title: string
  state: string
  webPath: string
  webUrl: string
  updatedAt: string
  labels?: { nodes?: (LabelNode | null)[] | null } | null
}

export type DashboardMr = {
  iid: string
  title: string
  state: string
  draft: boolean
  webUrl: string
  updatedAt: string
  project: { fullPath: string }
  approved: boolean
  approvalsRequired?: number | null
  reviewers?: { nodes?: (UserCore | null)[] | null } | null
}

// Shared selection set for the two currentUser MR connections, kept in one place
// so the field list can't drift between the assigned and review-requested queries.
export const MR_NODE_FIELDS = `
  iid
  title
  state
  draft
  webUrl
  updatedAt
  project { fullPath }
  approved
  approvalsRequired
  reviewers { nodes { name username } }
`
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/dashboard/lib/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/dashboard/lib/dashboard.ts src/features/dashboard/lib/dashboard.test.ts
git commit -m "feat(dashboard): pure helpers — issue path parse, keys, MR fields"
```

---

## Task 3: `useCurrentUser`

**Files:**
- Create: `src/features/dashboard/composables/useCurrentUser.ts`
- Test: `src/features/dashboard/composables/useCurrentUser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/composables/useCurrentUser.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useCurrentUser } from './useCurrentUser'

describe('useCurrentUser', () => {
  it('returns the username', async () => {
    request.mockReset()
    request.mockResolvedValue({ currentUser: { username: 'ada' } })
    const { result } = withQuery(() => useCurrentUser())
    await flushPromises()
    expect(result().data.value).toBe('ada')
  })

  it('normalizes errors', async () => {
    request.mockReset()
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useCurrentUser())
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'boom' })
  })
})
```

> Note: reset the mock inline at the top of each test (not in a `beforeEach`) — a `beforeEach` reset makes the rejected-mock error surface as an unhandled rejection before Vue Query catches it (observed with the MR detail query). Inline reset avoids it.

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/dashboard/composables/useCurrentUser.test.ts`
Expected: FAIL — cannot resolve `./useCurrentUser`.

- [ ] **Step 3: Implement**

Create `src/features/dashboard/composables/useCurrentUser.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { dashboardKeys } from '@/features/dashboard/lib/dashboard'

const CurrentUserDocument = `
  query CurrentUser {
    currentUser {
      username
    }
  }
`

type Result = { currentUser?: { username: string } | null }

async function fetchCurrentUser(): Promise<string | null> {
  try {
    const data = await gqlClient.request<Result>(CurrentUserDocument)
    return data.currentUser?.username ?? null
  } catch (e) {
    throw normalizeError(e)
  }
}

/** The signed-in user's username. Stable for the session, so cached an hour. */
export function useCurrentUser() {
  return useQuery<string | null, GitLabError>({
    queryKey: dashboardKeys.currentUser,
    queryFn: fetchCurrentUser,
    staleTime: 1000 * 60 * 60,
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/dashboard/composables/useCurrentUser.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/dashboard/composables/useCurrentUser.ts src/features/dashboard/composables/useCurrentUser.test.ts
git commit -m "feat(dashboard): current user query"
```

---

## Task 4: `useAssignedIssues`

**Files:**
- Create: `src/features/dashboard/composables/useAssignedIssues.ts`
- Test: `src/features/dashboard/composables/useAssignedIssues.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/composables/useAssignedIssues.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useAssignedIssues } from './useAssignedIssues'

beforeEach(() => request.mockReset())

describe('useAssignedIssues', () => {
  it('fetches issues for the username and flattens nodes', async () => {
    request.mockResolvedValue({
      issues: {
        nodes: [{ iid: '1', title: 'Bug', state: 'opened', webPath: '/g/p/-/issues/1', webUrl: '#', updatedAt: 't', labels: { nodes: [] } }],
        pageInfo: { hasNextPage: false },
      },
    })
    const { result } = withQuery(() => useAssignedIssues(ref('ada')))
    await flushPromises()
    expect(result().issues.value).toHaveLength(1)
    expect(request.mock.calls[0][1]).toEqual({ username: 'ada' })
  })

  it('does not fire a request until the username is known', async () => {
    const { result } = withQuery(() => useAssignedIssues(ref(null)))
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    expect(result().issues.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/dashboard/composables/useAssignedIssues.test.ts`
Expected: FAIL — cannot resolve `./useAssignedIssues`.

- [ ] **Step 3: Implement**

Create `src/features/dashboard/composables/useAssignedIssues.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import {
  DASHBOARD_POLL_MS,
  dashboardKeys,
  type DashboardIssue,
} from '@/features/dashboard/lib/dashboard'

const AssignedIssuesDocument = `
  query AssignedIssues($username: String!) {
    issues(assigneeUsernames: [$username], state: opened, sort: UPDATED_DESC, first: 25) {
      nodes {
        iid
        title
        state
        webPath
        webUrl
        updatedAt
        labels { nodes { id title color } }
      }
      pageInfo { hasNextPage }
    }
  }
`

type Result = {
  issues?: {
    nodes?: (DashboardIssue | null)[] | null
    pageInfo?: { hasNextPage: boolean } | null
  } | null
}

async function fetchAssignedIssues(username: string) {
  try {
    const data = await gqlClient.request<Result, { username: string }>(AssignedIssuesDocument, {
      username,
    })
    return {
      nodes: data.issues?.nodes?.filter((n): n is DashboardIssue => !!n) ?? [],
      hasNextPage: data.issues?.pageInfo?.hasNextPage ?? false,
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useAssignedIssues(username: Ref<string | null | undefined>) {
  const enabled = computed(() => !!username.value)
  const query = useQuery<{ nodes: DashboardIssue[]; hasNextPage: boolean }, GitLabError>({
    queryKey: computed(() => dashboardKeys.assignedIssues(username.value ?? '')),
    queryFn: () => fetchAssignedIssues(username.value as string),
    enabled,
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  })
  const issues = computed(() => query.data.value?.nodes ?? [])
  const hasMore = computed(() => query.data.value?.hasNextPage ?? false)
  return Object.assign(query, { issues, hasMore })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/dashboard/composables/useAssignedIssues.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/dashboard/composables/useAssignedIssues.ts src/features/dashboard/composables/useAssignedIssues.test.ts
git commit -m "feat(dashboard): assigned issues query (gated on username)"
```

---

## Task 5: `useAssignedMergeRequests` + `useReviewRequestedMergeRequests`

**Files:**
- Create: `src/features/dashboard/composables/useAssignedMergeRequests.ts`
- Create: `src/features/dashboard/composables/useReviewRequestedMergeRequests.ts`
- Test: `src/features/dashboard/composables/useCurrentUserMrs.test.ts`

Both composables are identical except the `currentUser` connection field. They share `MR_NODE_FIELDS` + `DashboardMr` from `lib/dashboard.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/composables/useCurrentUserMrs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useAssignedMergeRequests } from './useAssignedMergeRequests'
import { useReviewRequestedMergeRequests } from './useReviewRequestedMergeRequests'

const node = {
  iid: '5', title: 'Add API', state: 'opened', draft: false, webUrl: '#', updatedAt: 't',
  project: { fullPath: 'g/p' }, approved: false, approvalsRequired: 1, reviewers: { nodes: [] },
}

beforeEach(() => request.mockReset())

describe('useAssignedMergeRequests', () => {
  it('maps currentUser.assignedMergeRequests nodes', async () => {
    request.mockResolvedValue({ currentUser: { assignedMergeRequests: { nodes: [node], pageInfo: { hasNextPage: false } } } })
    const { result } = withQuery(() => useAssignedMergeRequests())
    await flushPromises()
    expect(result().mrs.value).toHaveLength(1)
    expect(result().mrs.value[0].iid).toBe('5')
    expect(request.mock.calls[0][0]).toContain('assignedMergeRequests')
  })
})

describe('useReviewRequestedMergeRequests', () => {
  it('maps currentUser.reviewRequestedMergeRequests nodes', async () => {
    request.mockResolvedValue({ currentUser: { reviewRequestedMergeRequests: { nodes: [node], pageInfo: { hasNextPage: true } } } })
    const { result } = withQuery(() => useReviewRequestedMergeRequests())
    await flushPromises()
    expect(result().mrs.value).toHaveLength(1)
    expect(result().hasMore.value).toBe(true)
    expect(request.mock.calls[0][0]).toContain('reviewRequestedMergeRequests')
  })

  it('normalizes errors to an empty list with an error', async () => {
    request.mockReset()
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useReviewRequestedMergeRequests())
    await flushPromises()
    expect(result().mrs.value).toEqual([])
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'boom' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/dashboard/composables/useCurrentUserMrs.test.ts`
Expected: FAIL — cannot resolve the composable modules.

- [ ] **Step 3: Implement `useAssignedMergeRequests`**

Create `src/features/dashboard/composables/useAssignedMergeRequests.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import {
  DASHBOARD_POLL_MS,
  MR_NODE_FIELDS,
  dashboardKeys,
  type DashboardMr,
} from '@/features/dashboard/lib/dashboard'

const AssignedMrsDocument = `
  query AssignedMergeRequests {
    currentUser {
      assignedMergeRequests(state: opened, sort: UPDATED_DESC, first: 25) {
        nodes { ${MR_NODE_FIELDS} }
        pageInfo { hasNextPage }
      }
    }
  }
`

type Result = {
  currentUser?: {
    assignedMergeRequests?: {
      nodes?: (DashboardMr | null)[] | null
      pageInfo?: { hasNextPage: boolean } | null
    } | null
  } | null
}

async function fetchAssignedMrs() {
  try {
    const data = await gqlClient.request<Result>(AssignedMrsDocument)
    const conn = data.currentUser?.assignedMergeRequests
    return {
      nodes: conn?.nodes?.filter((n): n is DashboardMr => !!n) ?? [],
      hasNextPage: conn?.pageInfo?.hasNextPage ?? false,
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useAssignedMergeRequests() {
  const query = useQuery<{ nodes: DashboardMr[]; hasNextPage: boolean }, GitLabError>({
    queryKey: dashboardKeys.assignedMrs,
    queryFn: fetchAssignedMrs,
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  })
  const mrs = computed(() => query.data.value?.nodes ?? [])
  const hasMore = computed(() => query.data.value?.hasNextPage ?? false)
  return Object.assign(query, { mrs, hasMore })
}
```

- [ ] **Step 4: Implement `useReviewRequestedMergeRequests`**

Create `src/features/dashboard/composables/useReviewRequestedMergeRequests.ts` (identical but the `reviewRequestedMergeRequests` connection + `reviewRequestedMrs` key):

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import {
  DASHBOARD_POLL_MS,
  MR_NODE_FIELDS,
  dashboardKeys,
  type DashboardMr,
} from '@/features/dashboard/lib/dashboard'

const ReviewRequestedMrsDocument = `
  query ReviewRequestedMergeRequests {
    currentUser {
      reviewRequestedMergeRequests(state: opened, sort: UPDATED_DESC, first: 25) {
        nodes { ${MR_NODE_FIELDS} }
        pageInfo { hasNextPage }
      }
    }
  }
`

type Result = {
  currentUser?: {
    reviewRequestedMergeRequests?: {
      nodes?: (DashboardMr | null)[] | null
      pageInfo?: { hasNextPage: boolean } | null
    } | null
  } | null
}

async function fetchReviewRequestedMrs() {
  try {
    const data = await gqlClient.request<Result>(ReviewRequestedMrsDocument)
    const conn = data.currentUser?.reviewRequestedMergeRequests
    return {
      nodes: conn?.nodes?.filter((n): n is DashboardMr => !!n) ?? [],
      hasNextPage: conn?.pageInfo?.hasNextPage ?? false,
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useReviewRequestedMergeRequests() {
  const query = useQuery<{ nodes: DashboardMr[]; hasNextPage: boolean }, GitLabError>({
    queryKey: dashboardKeys.reviewRequestedMrs,
    queryFn: fetchReviewRequestedMrs,
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  })
  const mrs = computed(() => query.data.value?.nodes ?? [])
  const hasMore = computed(() => query.data.value?.hasNextPage ?? false)
  return Object.assign(query, { mrs, hasMore })
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bunx vitest run src/features/dashboard/composables/useCurrentUserMrs.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/dashboard/composables/useAssignedMergeRequests.ts src/features/dashboard/composables/useReviewRequestedMergeRequests.ts src/features/dashboard/composables/useCurrentUserMrs.test.ts
git commit -m "feat(dashboard): assigned + review-requested MR queries"
```

---

## Task 6: Row components

**Files:**
- Create: `src/features/dashboard/components/DashboardIssueRow.vue`
- Create: `src/features/dashboard/components/DashboardMrRow.vue`
- Test: `src/features/dashboard/components/DashboardRows.test.ts`

Mirror `MergeRequestRow.vue` for layout. Reuse `StateBadge` (issues) and `MrStateBadge` (MRs).

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/components/DashboardRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DashboardIssueRow from './DashboardIssueRow.vue'
import DashboardMrRow from './DashboardMrRow.vue'
import type { DashboardIssue, DashboardMr } from '@/features/dashboard/lib/dashboard'

const issue: DashboardIssue = {
  iid: '42', title: 'Crash on save', state: 'opened',
  webPath: '/grp/proj/-/issues/42', webUrl: 'https://gl/issue', updatedAt: new Date().toISOString(),
  labels: { nodes: [] },
}
const mr: DashboardMr = {
  iid: '5', title: 'Add API', state: 'opened', draft: true, webUrl: 'https://gl/mr',
  updatedAt: new Date().toISOString(), project: { fullPath: 'grp/proj' },
  approved: false, approvalsRequired: 1, reviewers: { nodes: [] },
}

describe('DashboardIssueRow', () => {
  it('shows the project path + title and links to the in-app issue route', () => {
    const w = mount(DashboardIssueRow, { props: { issue }, global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain('grp/proj')
    expect(w.text()).toContain('Crash on save')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'issue', params: { fullPath: 'grp/proj', iid: '42' },
    })
  })

  it('falls back to an external link when webPath is unparseable', () => {
    const w = mount(DashboardIssueRow, {
      props: { issue: { ...issue, webPath: 'weird' } },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // No RouterLink — renders an <a href> to webUrl instead.
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(w.find('a').attributes('href')).toBe('https://gl/issue')
  })
})

describe('DashboardMrRow', () => {
  it('shows the project + title + draft badge and links to the MR route', () => {
    const w = mount(DashboardMrRow, { props: { mr }, global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain('grp/proj')
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('Draft')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'merge-request', params: { fullPath: 'grp/proj', iid: '5' },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/dashboard/components/DashboardRows.test.ts`
Expected: FAIL — components missing.

- [ ] **Step 3: Implement `DashboardIssueRow`**

Create `src/features/dashboard/components/DashboardIssueRow.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { FileText } from '@lucide/vue'
import StateBadge from '@/features/issues/components/StateBadge.vue'
import { parseIssuePath, type DashboardIssue } from '@/features/dashboard/lib/dashboard'
import { timeAgo } from '@/shared/lib/time'

const props = defineProps<{ issue: DashboardIssue }>()

const parsed = computed(() => parseIssuePath(props.issue.webPath))
const updated = computed(() => timeAgo(props.issue.updatedAt))

const rowClass =
  'flex items-center gap-3 rounded-md px-3 py-2.5 outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring/50'
</script>

<template>
  <component
    :is="parsed ? 'RouterLink' : 'a'"
    v-bind="
      parsed
        ? { to: { name: 'issue', params: { fullPath: parsed.fullPath, iid: issue.iid } } }
        : { href: issue.webUrl, target: '_blank', rel: 'noopener' }
    "
    :class="rowClass"
  >
    <FileText class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <span class="truncate text-sm font-medium text-foreground">{{ issue.title }}</span>
      <div class="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span class="truncate">{{ parsed?.fullPath ?? issue.webPath }}</span>
        <span>#{{ issue.iid }}</span>
      </div>
    </div>
    <StateBadge :state="issue.state" class="shrink-0" />
    <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">{{ updated }}</span>
  </component>
</template>
```

> Before implementing, open `src/features/issues/components/StateBadge.vue` and confirm its prop is `state: string`. If its API differs (e.g. it takes the whole issue), adapt the binding.

- [ ] **Step 4: Implement `DashboardMrRow`**

Create `src/features/dashboard/components/DashboardMrRow.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { GitMerge } from '@lucide/vue'
import MrStateBadge from '@/features/merge_requests/components/MrStateBadge.vue'
import { type DashboardMr } from '@/features/dashboard/lib/dashboard'
import { timeAgo } from '@/shared/lib/time'

const props = defineProps<{ mr: DashboardMr }>()
const updated = computed(() => timeAgo(props.mr.updatedAt))
</script>

<template>
  <RouterLink
    :to="{ name: 'merge-request', params: { fullPath: mr.project.fullPath, iid: mr.iid } }"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring/50"
  >
    <GitMerge class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <span class="truncate text-sm font-medium text-foreground">{{ mr.title }}</span>
      <div class="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span class="truncate">{{ mr.project.fullPath }}</span>
        <span>!{{ mr.iid }}</span>
      </div>
    </div>
    <MrStateBadge :state="mr.state" :draft="mr.draft" class="shrink-0" />
    <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">{{ updated }}</span>
  </RouterLink>
</template>
```

- [ ] **Step 5: Run to verify it passes**

Run: `bunx vitest run src/features/dashboard/components/DashboardRows.test.ts`
Expected: PASS.

> If the dynamic `<component :is>` + `v-bind` ternary in the issue row causes a test/typecheck issue, split into an explicit `v-if="parsed"` RouterLink branch and a `v-else` `<a>` branch with the same inner markup. Keep the test assertions intact.

- [ ] **Step 6: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/dashboard/components/DashboardIssueRow.vue src/features/dashboard/components/DashboardMrRow.vue src/features/dashboard/components/DashboardRows.test.ts
git commit -m "feat(dashboard): cross-project issue + MR rows"
```

---

## Task 7: `DashboardLane`

**Files:**
- Create: `src/features/dashboard/components/DashboardLane.vue`
- Test: `src/features/dashboard/components/DashboardLane.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/components/DashboardLane.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardLane from './DashboardLane.vue'

function mountLane(props: Record<string, unknown>) {
  return mount(DashboardLane, {
    props: { title: 'Assigned Issues', count: 0, isLoading: false, error: null, isEmpty: false, emptyMessage: 'Nothing assigned', ...props },
    slots: { default: '<li data-testid="row">a row</li>' },
    global: { stubs: { ErrorNotice: { template: '<div data-testid="err"/>' } } },
  })
}

describe('DashboardLane', () => {
  it('renders the title and count', () => {
    const w = mountLane({ count: 3, isEmpty: false })
    expect(w.text()).toContain('Assigned Issues')
    expect(w.text()).toContain('3')
  })
  it('shows a skeleton while loading and no rows', () => {
    const w = mountLane({ isLoading: true })
    expect(w.find('[data-testid="row"]').exists()).toBe(false)
    expect(w.find('[data-testid="lane-skeleton"]').exists()).toBe(true)
  })
  it('shows the error notice on error', () => {
    const w = mountLane({ error: { kind: 'unknown', message: 'x' } })
    expect(w.find('[data-testid="err"]').exists()).toBe(true)
    expect(w.find('[data-testid="row"]').exists()).toBe(false)
  })
  it('shows the empty message when empty', () => {
    const w = mountLane({ isEmpty: true })
    expect(w.text()).toContain('Nothing assigned')
    expect(w.find('[data-testid="row"]').exists()).toBe(false)
  })
  it('renders slot rows otherwise', () => {
    const w = mountLane({ count: 1, isEmpty: false })
    expect(w.find('[data-testid="row"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/dashboard/components/DashboardLane.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/features/dashboard/components/DashboardLane.vue`:

```vue
<script setup lang="ts">
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import type { GitLabError } from '@/gitlab/errors'

defineProps<{
  title: string
  count: number
  isLoading: boolean
  error: GitLabError | null
  isEmpty: boolean
  emptyMessage: string
  hasMore?: boolean
}>()
</script>

<template>
  <section>
    <header class="mb-2 flex items-baseline gap-2">
      <h2 class="text-sm font-semibold tracking-wide text-foreground">{{ title }}</h2>
      <span class="font-mono text-xs tabular-nums text-muted-foreground/70">
        {{ count }}<span v-if="hasMore" class="text-primary">+</span>
      </span>
    </header>

    <div v-if="isLoading" data-testid="lane-skeleton" class="space-y-1.5">
      <div v-for="n in 3" :key="n" class="h-11 animate-pulse rounded-md bg-muted/50" />
    </div>

    <ErrorNotice v-else-if="error" :error="error" />

    <p v-else-if="isEmpty" class="px-3 py-6 text-sm text-muted-foreground">{{ emptyMessage }}</p>

    <ul v-else class="divide-y divide-border/40">
      <slot />
    </ul>
  </section>
</template>
```

> Confirm `ErrorNotice`'s prop is `error` (see `src/shared/components/ErrorNotice.vue`); adapt if different.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/dashboard/components/DashboardLane.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/dashboard/components/DashboardLane.vue src/features/dashboard/components/DashboardLane.test.ts
git commit -m "feat(dashboard): lane section with loading/empty/error states"
```

---

## Task 8: `MyWork.vue` view

**Files:**
- Create: `src/views/MyWork.vue`
- Test: `src/views/MyWork.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/MyWork.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/features/dashboard/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: ref('ada') }),
}))
vi.mock('@/features/dashboard/composables/useAssignedIssues', () => ({
  useAssignedIssues: () => ({
    issues: ref([
      { iid: '42', title: 'Crash on save', state: 'opened', webPath: '/grp/proj/-/issues/42', webUrl: '#', updatedAt: new Date().toISOString(), labels: { nodes: [] } },
    ]),
    isLoading: ref(false), error: ref(null), hasMore: ref(false),
  }),
}))
vi.mock('@/features/dashboard/composables/useAssignedMergeRequests', () => ({
  useAssignedMergeRequests: () => ({ mrs: ref([]), isLoading: ref(false), error: ref(null), hasMore: ref(false) }),
}))
vi.mock('@/features/dashboard/composables/useReviewRequestedMergeRequests', () => ({
  useReviewRequestedMergeRequests: () => ({
    mrs: ref([
      { iid: '5', title: 'Add API', state: 'opened', draft: false, webUrl: '#', updatedAt: new Date().toISOString(), project: { fullPath: 'grp/proj' }, approved: false, approvalsRequired: 1, reviewers: { nodes: [] } },
    ]),
    isLoading: ref(false), error: ref(null), hasMore: ref(false),
  }),
}))

import MyWork from './MyWork.vue'

describe('MyWork', () => {
  it('renders the three lanes with their items', async () => {
    const w = mount(MyWork, { global: { stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(w.text()).toContain('Assigned Issues')
    expect(w.text()).toContain('Assigned MRs')
    expect(w.text()).toContain('Awaiting My Review')
    expect(w.text()).toContain('Crash on save')
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('No MRs assigned')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/MyWork.test.ts`
Expected: FAIL — view missing.

- [ ] **Step 3: Implement**

Create `src/views/MyWork.vue`:

```vue
<script setup lang="ts">
import { useCurrentUser } from '@/features/dashboard/composables/useCurrentUser'
import { useAssignedIssues } from '@/features/dashboard/composables/useAssignedIssues'
import { useAssignedMergeRequests } from '@/features/dashboard/composables/useAssignedMergeRequests'
import { useReviewRequestedMergeRequests } from '@/features/dashboard/composables/useReviewRequestedMergeRequests'
import DashboardLane from '@/features/dashboard/components/DashboardLane.vue'
import DashboardIssueRow from '@/features/dashboard/components/DashboardIssueRow.vue'
import DashboardMrRow from '@/features/dashboard/components/DashboardMrRow.vue'

const { data: username } = useCurrentUser()
const assignedIssues = useAssignedIssues(username)
const assignedMrs = useAssignedMergeRequests()
const reviewMrs = useReviewRequestedMergeRequests()
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-6 py-8">
    <header class="mb-8 flex items-end justify-between">
      <h1 class="text-title font-semibold text-foreground">My Work</h1>
      <RouterLink
        :to="{ name: 'projects' }"
        class="text-sm text-muted-foreground hover:text-foreground"
      >
        Projects →
      </RouterLink>
    </header>

    <div class="space-y-8">
      <DashboardLane
        title="Assigned Issues"
        :count="assignedIssues.issues.value.length"
        :is-loading="assignedIssues.isLoading.value"
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
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/MyWork.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/MyWork.vue src/views/MyWork.test.ts
git commit -m "feat(dashboard): my work view wiring the three lanes"
```

---

## Task 9: Routing — home at `/`, picker at `/projects`

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/views/ConnectView.vue`
- Modify: `src/views/ProjectPicker.vue`
- Test: `src/router/index.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/router/index.test.ts`:

```ts
describe('home + projects routes', () => {
  it('resolves My Work at / and the picker at /projects', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/projects').name).toBe('projects')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/router/index.test.ts`
Expected: FAIL — `/` still resolves to `projects`; no `home` route.

- [ ] **Step 3: Update the router**

Edit `src/router/index.ts`. Add the import near the others:

```ts
import MyWork from '@/views/MyWork.vue'
```

Change the first route record (currently `path: '/', name: 'projects', component: ProjectPicker`) to the dashboard, and add a `/projects` record for the picker:

```ts
  {
    path: '/',
    name: 'home',
    component: MyWork,
  },
  {
    path: '/projects',
    name: 'projects',
    component: ProjectPicker,
  },
```

(Leave the rest of the routes unchanged.)

- [ ] **Step 4: Update the post-connect redirect**

Edit `src/views/ConnectView.vue` line ~24: change the post-save redirect from the picker to the dashboard:

```ts
  if (await save()) router.replace({ name: 'home' })
```

- [ ] **Step 5: Add a back-to-My-Work affordance to the picker**

Edit `src/views/ProjectPicker.vue`. Add a small header link to the dashboard, mirroring the existing header-link idiom. Open the file, find the top-of-page header area, and add (adapt classes to match the surrounding header):

```vue
        <RouterLink
          :to="{ name: 'home' }"
          data-testid="back-to-my-work"
          class="text-sm text-muted-foreground hover:text-foreground"
        >
          ← My Work
        </RouterLink>
```

If `ProjectPicker.vue` has no obvious header element, add a minimal one at the top of its root template:

```vue
  <div class="mb-4">
    <RouterLink :to="{ name: 'home' }" data-testid="back-to-my-work" class="text-sm text-muted-foreground hover:text-foreground">← My Work</RouterLink>
  </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx vitest run src/router/index.test.ts src/views/ProjectPicker.test.ts`
Expected: PASS. If `ProjectPicker.test.ts` asserts something about routing/headers that the new link disturbs, update that assertion to account for the added link (do not remove meaningful coverage).

- [ ] **Step 7: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/router/index.ts src/router/index.test.ts src/views/ConnectView.vue src/views/ProjectPicker.vue
git commit -m "feat(dashboard): make My Work the home route, move picker to /projects"
```

---

## Task 10: Palette "Go to My Work" action

**Files:**
- Modify: `src/features/palette/lib/sources.ts`
- Test: `src/features/palette/lib/sources.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/features/palette/lib/sources.test.ts` (inside the existing `routeCommands` describe, reusing its `ctx()` helper):

```ts
  it('always includes the Go to My Work action', () => {
    expect(routeCommands(ctx()).map((c) => c.id)).toContain('my-work')
    expect(routeCommands(ctx({ currentProject: null })).map((c) => c.id)).toContain('my-work')
  })

  it('the My Work action navigates home', () => {
    const c = ctx()
    routeCommands(c)
      .find((cmd) => cmd.id === 'my-work')!
      .action()
    expect(c.router.push).toHaveBeenCalledWith({ name: 'home' })
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/palette/lib/sources.test.ts`
Expected: FAIL — no `my-work` command.

- [ ] **Step 3: Implement**

Edit `src/features/palette/lib/sources.ts`. Add `Home` to the `@lucide/vue` import. In `routeCommands`, add this command to the **always-present** block (the `commands.push(...)` that runs regardless of `currentProject`, alongside `projects` and `settings`), as the first entry so it leads:

```ts
    {
      id: 'my-work',
      group: 'Actions',
      title: 'Go to My Work',
      subtitle: 'Your assigned issues and reviews',
      icon: Home,
      action: () => router.push({ name: 'home' }),
    },
```

> Confirm `Home` is exported by `@lucide/vue`; if not, use `LayoutDashboard` or another existing icon and note it.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/palette/lib/sources.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/palette/lib/sources.ts src/features/palette/lib/sources.test.ts
git commit -m "feat(palette): add Go to My Work action"
```

---

## Task 11: Full verification

**Files:** none (verification + cleanup commit if formatting changes anything).

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Full suite**

Run: `bunx vitest run`
Expected: PASS — all prior tests plus the new dashboard/router/palette tests. If any pre-existing test that depended on `/` resolving to `projects` (or on the picker being the home) now fails, update it to the new routing (home at `/`, picker at `/projects`) without removing meaningful coverage.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(dashboard): format" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage:** A (routing/nav) → Tasks 9, 10; B (module + data layer, currentUser, 3 queries, webPath parse) → Tasks 2–5; C (lanes & rows) → Tasks 6, 7, 8; D (states/refresh/ordering) → Tasks 4–8 (poll/enabled/states baked into composables + lane); E (palette + nav) → Tasks 9, 10; F (testing) → tests in every task + Task 11. The `timeAgo` shared lift (Task 1) supports the rows' updated-time.
- **Type consistency:** `DashboardIssue` / `DashboardMr` / `MR_NODE_FIELDS` / `dashboardKeys` / `DASHBOARD_POLL_MS` defined once in `lib/dashboard.ts`; the issue query returns `{ nodes, hasNextPage }` exposed as `issues`/`hasMore`; the MR composables return `{ nodes, hasNextPage }` exposed as `mrs`/`hasMore`; `useAssignedIssues` takes `Ref<string|null|undefined>` and is gated via `enabled`; `MyWork.vue` consumes `.issues`/`.mrs`/`.isLoading`/`.error`/`.hasMore` accordingly.
- **Manual GraphQL (no codegen)** for all four queries; enum literals `state: opened`, `sort: UPDATED_DESC` confirmed against the cached schema.
- **Routing:** name `projects` is preserved (only its path moves to `/projects`), so existing `{ name: 'projects' }` consumers keep working; the only behavioral change is `/` now resolves to `home` and post-connect lands on `home`.
- **Out of scope (deferred):** To-Do inbox, authored-by-me, due-soon, per-lane pagination, the unified cross-view layout refactor.
