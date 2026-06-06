# Server-Unavailable vs Token-Invalid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish "GitLab server is unreachable" from "token is invalid" so the blocking re-enter-token overlay fires only for real auth failures, while an unreachable server shows a non-blocking, self-healing banner.

**Architecture:** A new `unavailable` error kind is produced at the boundary: the Bun host catches `fetch` throws and returns a `503` sentinel, and `normalizeError`/`httpError` map any `status >= 500` to `unavailable`. The app-wide session watch flips a new `sessionState.unavailable` flag (auth always wins over unavailable). A `ConnectionBanner` mounts a recovery poll (2s → 5s → 15s backoff) that clears the flag and refetches on success, or escalates to the expired overlay if the server returns 401.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, `@tanstack/vue-query`, `graphql-request` (`ClientError`), Vitest, Bun host (Electrobun). Tests: `bunx vitest run`. Format after edits: `bun run format`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/gitlab/errors.ts` | GraphQL error normalization | add `unavailable` kind; map `status >= 500` |
| `src/gitlab/rest.ts` | REST error mapping | map `status >= 500` to `unavailable` |
| `src/bun/gitlab.ts` | Host fetch bridge | catch transport throws → `503` sentinel |
| `src/shared/composables/useSession.ts` | Global session state + watch | add `unavailable` state, escalation, dual watch |
| `src/shared/composables/useServerRecovery.ts` | **new** — backoff + health poll | self-healing recovery loop |
| `src/shared/components/ConnectionBanner.vue` | **new** — non-blocking banner | drives the recovery poll |
| `src/App.vue` | App root | mount `ConnectionBanner` |
| `src/shared/composables/useGitlabConnect.ts` | Connect probe | branch error copy on kind |

Each `.ts`/`.vue` above has a colocated `.test.ts`.

---

## Task 1: Add `unavailable` error kind to GraphQL normalization

**Files:**
- Modify: `src/gitlab/errors.ts`
- Test: `src/gitlab/errors.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/gitlab/errors.test.ts`, replace the existing `'maps a ClientError with no GraphQL errors to network'` test with these two, and keep the other tests as-is:

```ts
  it('maps 5xx to an unavailable error', () => {
    expect(normalizeError(clientError(500)).kind).toBe('unavailable')
    expect(normalizeError(clientError(503)).kind).toBe('unavailable')
  })

  it('maps a non-5xx ClientError with no GraphQL errors to network', () => {
    expect(normalizeError(clientError(404)).kind).toBe('network')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/gitlab/errors.test.ts`
Expected: FAIL — `expected 'network' to be 'unavailable'`.

- [ ] **Step 3: Implement the change**

In `src/gitlab/errors.ts`, add `'unavailable'` to the union and a `>= 500` branch ordered **before** the GraphQL-message branch (so a 5xx never gets mislabeled `graphql`):

```ts
import { ClientError } from 'graphql-request'

export type GitLabErrorKind = 'auth' | 'unavailable' | 'graphql' | 'network' | 'unknown'

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
    // 5xx (and the host's transport-throw sentinel, see src/bun/gitlab.ts) mean
    // the server is unreachable/erroring — the token is fine. Checked before the
    // GraphQL-message branch so a 5xx is never mislabeled `graphql`.
    if (typeof status === 'number' && status >= 500) {
      return { kind: 'unavailable', message: 'GitLab is unavailable — retrying.' }
    }
    const gql = err.response?.errors?.[0]?.message
    if (gql) return { kind: 'graphql', message: gql }
    return { kind: 'network', message: err.message }
  }
  if (err instanceof Error) return { kind: 'unknown', message: err.message }
  return { kind: 'unknown', message: 'Unknown error' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/gitlab/errors.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/gitlab/errors.ts src/gitlab/errors.test.ts
git commit -m "feat(errors): add unavailable kind for 5xx/transport failures"
```

---

## Task 2: Map 5xx to `unavailable` in the REST layer

**Files:**
- Modify: `src/gitlab/rest.ts:9-18`
- Test: `src/gitlab/rest.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/gitlab/rest.test.ts`, replace the `'maps other non-ok statuses to a network error'` test with:

```ts
  it('maps 5xx to an unavailable error', async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable', body: '' })
    await expect(restGet('/projects/7')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('maps other non-ok statuses to a network error', async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', body: '' })
    await expect(restGet('/projects/7')).rejects.toMatchObject({ kind: 'network' })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/gitlab/rest.test.ts`
Expected: FAIL — the 503 case resolves `kind: 'network'`, not `'unavailable'`.

- [ ] **Step 3: Implement the change**

In `src/gitlab/rest.ts`, add a `>= 500` branch to `httpError`:

```ts
function httpError(status: number, statusText: string): GitLabError {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      message:
        'Authentication failed — open Settings and check the GitLab URL and token (scope: api).',
    }
  }
  // 5xx (and the host's transport-throw sentinel) mean the server is down, not
  // the token. Mirrors normalizeError in src/gitlab/errors.ts.
  if (status >= 500) {
    return { kind: 'unavailable', message: `GitLab is unavailable (${status}).` }
  }
  return { kind: 'network', message: `GitLab request failed (${status} ${statusText || 'error'}).` }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/gitlab/rest.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/gitlab/rest.ts src/gitlab/rest.test.ts
git commit -m "feat(rest): map 5xx to unavailable kind"
```

---

## Task 3: Catch transport throws in the host, return a 503 sentinel

**Files:**
- Modify: `src/bun/gitlab.ts:58-74`
- Test: `src/bun/gitlab.test.ts`

A thrown `fetch` (DNS failure, connection refused, timeout) currently rejects the RPC and surfaces as `unknown`. Catch it and return a `503` so the client maps it to `unavailable`.

- [ ] **Step 1: Add failing tests**

Append to `src/bun/gitlab.test.ts`. Add the imports/mocks at the top of the file (after the existing import line) and the new `describe` block at the end:

```ts
import { vi, beforeEach } from 'vitest'

const { loadConfig } = vi.hoisted(() => ({ loadConfig: vi.fn() }))
vi.mock('./config', () => ({ loadConfig }))

import { gitlabGraphql, gitlabRest } from './gitlab'

describe('host transport-failure handling', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ gitlabUrl: 'https://gl.example.com', token: 't' })
  })

  it('returns a 503 sentinel when the graphql fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const res = await gitlabGraphql({ query: '{ x }' })
    expect(res.status).toBe(503)
    vi.unstubAllGlobals()
  })

  it('returns ok:false status 503 when the rest fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    const res = await gitlabRest({ method: 'GET', path: '/v4/projects/7' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(503)
    vi.unstubAllGlobals()
  })
})
```

> Note: the existing top-of-file import is `import { buildGraphql, buildRest, buildAsset } from './gitlab'`. Merge `gitlabGraphql, gitlabRest` into that import or add the separate import shown above — either works.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/bun/gitlab.test.ts`
Expected: FAIL — the rejected fetch propagates instead of returning a 503 sentinel.

- [ ] **Step 3: Implement the change**

In `src/bun/gitlab.ts`, wrap the `fetch` in both `gitlabGraphql` and `gitlabRest` with a try/catch that returns a 503 sentinel. Replace lines 58-74:

```ts
export async function gitlabGraphql(a: GraphqlArgs): Promise<GraphqlResult> {
  const { url, init } = buildGraphql(requireCfg(), a)
  let res: Response
  try {
    res = await fetch(url, init as RequestInit)
  } catch {
    // Transport failure (DNS, connection refused, timeout): the server is
    // unreachable, not the token. Surface a 503 so the client maps it to
    // `unavailable` (see src/gitlab/errors.ts) rather than a re-auth prompt.
    return { status: 503, errors: [{ message: 'GitLab is unreachable' }] }
  }
  if (!res.ok && res.status === 401) return { status: 401, errors: [{ message: 'Unauthorized' }] }
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown
    errors?: { message: string }[]
  }
  return { status: res.status, data: json.data, errors: json.errors }
}

export async function gitlabRest(a: RestArgs): Promise<RestResult> {
  const { url, init } = buildRest(requireCfg(), a)
  let res: Response
  try {
    res = await fetch(url, init as RequestInit)
  } catch {
    // See gitlabGraphql: transport failure → 503 so rest.ts maps to `unavailable`.
    return { ok: false, status: 503, statusText: 'Service Unavailable', body: '' }
  }
  const body = await res.text()
  return { ok: res.ok, status: res.status, statusText: res.statusText, body }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/bun/gitlab.test.ts`
Expected: PASS (builder tests + the two new transport tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/bun/gitlab.ts src/bun/gitlab.test.ts
git commit -m "feat(host): return 503 sentinel on transport failure"
```

---

## Task 4: Add `unavailable` session state, escalation, and dual watch

**Files:**
- Modify: `src/shared/composables/useSession.ts`
- Test: `src/shared/composables/useSession.test.ts`

`installAuthWatch` will now also flip `sessionState.unavailable` on `kind === 'unavailable'`. Auth always wins: `markSessionExpired` clears `unavailable`, and `markServerUnavailable` is a no-op once expired.

- [ ] **Step 1: Add failing tests**

In `src/shared/composables/useSession.test.ts`, update the `beforeEach` and add new tests. Change the `beforeEach` to reset both flags:

```ts
beforeEach(() => {
  sessionState.expired = false
  sessionState.unavailable = false
})
```

Add this import line to the existing top import from `./useSession`:

```ts
import {
  sessionState,
  isAuthError,
  isUnavailableError,
  markSessionExpired,
  markServerUnavailable,
  clearServerUnavailable,
  installAuthWatch,
} from './useSession'
```

Add these `describe` blocks:

```ts
describe('isUnavailableError', () => {
  it('is true only for kind "unavailable"', () => {
    expect(isUnavailableError({ kind: 'unavailable', message: 'x' })).toBe(true)
    expect(isUnavailableError({ kind: 'auth', message: 'x' })).toBe(false)
    expect(isUnavailableError(null)).toBe(false)
  })
})

describe('auth wins over unavailable', () => {
  it('markServerUnavailable is a no-op once expired', () => {
    markSessionExpired()
    markServerUnavailable()
    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
  })

  it('markSessionExpired clears an existing unavailable banner', () => {
    markServerUnavailable()
    expect(sessionState.unavailable).toBe(true)
    markSessionExpired()
    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
  })

  it('clearServerUnavailable lowers the flag', () => {
    markServerUnavailable()
    clearServerUnavailable()
    expect(sessionState.unavailable).toBe(false)
  })
})

describe('installAuthWatch — unavailable', () => {
  it('flips unavailable when a query fails with an unavailable error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'unavailable', message: 'down' }),
      })
      .catch(() => {})
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.expired).toBe(false)
    stop()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`
Expected: FAIL — `isUnavailableError`/`markServerUnavailable`/`clearServerUnavailable` are not exported; `sessionState.unavailable` is undefined.

- [ ] **Step 3: Implement the change**

Replace the body of `src/shared/composables/useSession.ts` with:

```ts
import { reactive } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'

// Shared singleton flags. `expired` blocks the screen with the re-connect
// overlay (token invalid). `unavailable` shows the non-blocking ConnectionBanner
// (server unreachable; the token is fine). They are mutually exclusive — auth
// always wins (see markSessionExpired / markServerUnavailable).
export const sessionState = reactive<{ expired: boolean; unavailable: boolean }>({
  expired: false,
  unavailable: false,
})

/** True when `err` is a GitLabError with kind === 'auth' (covers 401 and 403). */
export function isAuthError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'auth'
}

/** True when `err` is a GitLabError with kind === 'unavailable' (5xx / transport). */
export function isUnavailableError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'unavailable'
  )
}

/** Flip into the expired (token-invalid) state. Clears any unavailable banner —
 *  auth always wins. Idempotent. */
export function markSessionExpired(): void {
  sessionState.expired = true
  sessionState.unavailable = false
}

/** Raise the server-unavailable banner. No-op once expired — a token problem
 *  must never be downgraded to a transient-banner. Idempotent. */
export function markServerUnavailable(): void {
  if (sessionState.expired) return
  sessionState.unavailable = true
}

/** Lower the server-unavailable banner (recovery poll succeeded). */
export function clearServerUnavailable(): void {
  sessionState.unavailable = false
}

/**
 * Watch the query + mutation caches and flip session state on failures: auth
 * errors raise the expired overlay; unavailable errors raise the banner.
 * Recovery probes run directly through `rpc` (not vue-query), so they never
 * reach these caches — no re-trigger loop. Returns a single unsubscribe that
 * detaches both subscriptions.
 */
export function installAuthWatch(queryClient: QueryClient): () => void {
  const route = (err: unknown) => {
    if (isAuthError(err)) markSessionExpired()
    else if (isUnavailableError(err)) markServerUnavailable()
  }
  const offQuery = queryClient.getQueryCache().subscribe((event) => {
    route(event.query.state.error)
  })
  const offMutation = queryClient.getMutationCache().subscribe((event) => {
    route(event.mutation?.state.error)
  })
  return () => {
    offQuery()
    offMutation()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`
Expected: PASS (existing auth tests + new unavailable/escalation tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/shared/composables/useSession.ts src/shared/composables/useSession.test.ts
git commit -m "feat(session): add unavailable state with auth-wins escalation"
```

---

## Task 5: Recovery poll composable (`useServerRecovery`)

**Files:**
- Create: `src/shared/composables/useServerRecovery.ts`
- Test: `src/shared/composables/useServerRecovery.test.ts`

Backoff `2s → 5s → 15s` (capped). The poll probes the cheap `currentUser` query directly via `rpc` (bypassing vue-query, so it never re-triggers the watch). On `ok`: clear the banner and refetch everything. On `auth`: escalate to expired. On `down`: reschedule.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/composables/useServerRecovery.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { gitlabGraphql } = vi.hoisted(() => ({ gitlabGraphql: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabGraphql } }))

import { backoffMs, probeServer, useServerRecovery } from './useServerRecovery'
import { sessionState } from './useSession'

beforeEach(() => {
  gitlabGraphql.mockReset()
  sessionState.expired = false
  sessionState.unavailable = false
})

describe('backoffMs', () => {
  it('steps 2s → 5s → 15s and caps at 15s', () => {
    expect(backoffMs(0)).toBe(2000)
    expect(backoffMs(1)).toBe(5000)
    expect(backoffMs(2)).toBe(15000)
    expect(backoffMs(7)).toBe(15000)
  })
})

describe('probeServer', () => {
  it('returns "ok" on a clean 200', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    expect(await probeServer()).toBe('ok')
  })

  it('returns "auth" on 401/403', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    expect(await probeServer()).toBe('auth')
    gitlabGraphql.mockResolvedValue({ status: 403 })
    expect(await probeServer()).toBe('auth')
  })

  it('returns "down" on 5xx', async () => {
    gitlabGraphql.mockResolvedValue({ status: 503 })
    expect(await probeServer()).toBe('down')
  })

  it('returns "down" when the rpc rejects', async () => {
    gitlabGraphql.mockRejectedValue(new Error('boom'))
    expect(await probeServer()).toBe('down')
  })
})

describe('useServerRecovery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('clears the banner and refetches on a successful probe', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const recovery = useServerRecovery({ invalidateQueries } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000)

    expect(gitlabGraphql).toHaveBeenCalledTimes(1)
    expect(sessionState.unavailable).toBe(false)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('escalates to expired when the probe returns auth', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const recovery = useServerRecovery({ invalidateQueries: vi.fn() } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000)

    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
  })

  it('reschedules on a "down" probe using the next backoff step', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const recovery = useServerRecovery({ invalidateQueries: vi.fn() } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(gitlabGraphql).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(gitlabGraphql).toHaveBeenCalledTimes(2)

    recovery.stop()
  })

  it('stop() cancels a pending probe', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const recovery = useServerRecovery({ invalidateQueries: vi.fn() } as never)

    recovery.start()
    recovery.stop()
    await vi.advanceTimersByTimeAsync(15000)
    expect(gitlabGraphql).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/shared/composables/useServerRecovery.test.ts`
Expected: FAIL — module `./useServerRecovery` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/shared/composables/useServerRecovery.ts`:

```ts
import type { QueryClient } from '@tanstack/vue-query'
import { rpc } from '@/shared/lib/rpc'
import { PROBE_QUERY } from './useGitlabConnect'
import { clearServerUnavailable, markSessionExpired } from './useSession'

export type ProbeOutcome = 'ok' | 'auth' | 'down'

/** Recovery backoff: 2s → 5s → 15s, capped at 15s. */
export function backoffMs(attempt: number): number {
  const steps = [2000, 5000, 15000]
  return steps[Math.min(attempt, steps.length - 1)]
}

/**
 * Probe the cheapest authenticated query directly through `rpc` — bypassing
 * vue-query so it never re-triggers installAuthWatch. A clean 200 means the
 * server is back; 401/403 means the token is the problem after all.
 */
export async function probeServer(): Promise<ProbeOutcome> {
  try {
    const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
    if (res.status === 401 || res.status === 403) return 'auth'
    if (res.status === 200 && !res.errors?.length) return 'ok'
    return 'down'
  } catch {
    return 'down'
  }
}

/**
 * Owns the recovery timer. `start()` schedules the first probe after backoffMs(0)
 * and keeps probing on backoff while the server stays down. On success it clears
 * the banner and refetches every query; on an auth result it escalates to the
 * expired overlay. `stop()` cancels any pending probe.
 */
export function useServerRecovery(queryClient: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  function schedule() {
    timer = setTimeout(() => void tick(), backoffMs(attempt))
  }

  async function tick() {
    timer = null
    const outcome = await probeServer()
    if (outcome === 'ok') {
      stop()
      clearServerUnavailable()
      await queryClient.invalidateQueries()
      return
    }
    if (outcome === 'auth') {
      stop()
      markSessionExpired()
      return
    }
    attempt += 1
    schedule()
  }

  function start() {
    if (timer) return
    attempt = 0
    schedule()
  }

  function stop() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    attempt = 0
  }

  return { start, stop }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/shared/composables/useServerRecovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/shared/composables/useServerRecovery.ts src/shared/composables/useServerRecovery.test.ts
git commit -m "feat(session): add server recovery poll with backoff"
```

---

## Task 6: ConnectionBanner component, mounted app-wide

**Files:**
- Create: `src/shared/components/ConnectionBanner.vue`
- Create: `src/shared/components/ConnectionBanner.test.ts`
- Modify: `src/App.vue`

The banner renders only while `sessionState.unavailable`. It starts the recovery poll when the flag rises and stops it when the flag falls (and on unmount).

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/ConnectionBanner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const start = vi.fn()
const stop = vi.fn()
vi.mock('@/shared/composables/useServerRecovery', () => ({
  useServerRecovery: () => ({ start, stop }),
}))

import ConnectionBanner from './ConnectionBanner.vue'
import { sessionState } from '@/shared/composables/useSession'

const queryClient = new QueryClient()
const mountBanner = () =>
  mount(ConnectionBanner, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })

beforeEach(() => {
  start.mockReset()
  stop.mockReset()
  sessionState.expired = false
  sessionState.unavailable = false
})
afterEach(() => {
  sessionState.unavailable = false
})

describe('ConnectionBanner', () => {
  it('is hidden when the server is reachable', () => {
    const wrapper = mountBanner()
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(false)
  })

  it('shows the banner and starts recovery when unavailable', async () => {
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(true)
    expect(start).toHaveBeenCalled()
  })

  it('stops recovery when the server becomes reachable again', async () => {
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    sessionState.unavailable = false
    await wrapper.vm.$nextTick()
    expect(stop).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/components/ConnectionBanner.test.ts`
Expected: FAIL — component file does not exist.

- [ ] **Step 3: Write the component**

Create `src/shared/components/ConnectionBanner.vue`. Mirrors the app's tokens (`bg-card`, `border-border`, `shadow-pop`, amber `text-primary`), sits below the expired overlay's `z-[100]`, and is non-blocking (`role="status"`, `aria-live="polite"`, no backdrop):

```vue
<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { LoaderCircle, CloudOff } from '@lucide/vue'
import { sessionState } from '@/shared/composables/useSession'
import { useServerRecovery } from '@/shared/composables/useServerRecovery'

// The poll lives with the banner: it runs exactly while the banner is shown.
const { start, stop } = useServerRecovery(useQueryClient())

watch(
  () => sessionState.unavailable,
  (down) => (down ? start() : stop()),
  { immediate: true },
)
onUnmounted(stop)
</script>

<template>
  <!-- Non-blocking: a quiet self-healing toast, not a modal. The screen stays
       usable; it clears itself when the recovery poll reconnects. -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="sessionState.unavailable"
      class="fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 shadow-pop"
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
    >
      <span class="relative grid size-4 place-items-center">
        <CloudOff class="size-4 text-muted-foreground/70" :stroke-width="2" />
        <LoaderCircle class="absolute size-4 animate-spin text-primary/80" :stroke-width="2" />
      </span>
      <span class="text-sm leading-none text-foreground/90">
        Can’t reach GitLab — retrying…
      </span>
    </div>
  </Transition>
</template>
```

> Icon names are from `@lucide/vue` (same package `SessionExpiredOverlay.vue` imports). `CloudOff` and `LoaderCircle` both exist there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/shared/components/ConnectionBanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount it in `src/App.vue`**

Add the import after the `SessionExpiredOverlay` import (line 6):

```ts
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
```

Add the element in the template after `<SessionExpiredOverlay />` (line 32):

```html
  <SessionExpiredOverlay />
  <ConnectionBanner />
```

- [ ] **Step 6: Run the App test suite to confirm nothing broke**

Run: `bunx vitest run src/App.test.ts`
Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
bun run format
git add src/shared/components/ConnectionBanner.vue src/shared/components/ConnectionBanner.test.ts src/App.vue
git commit -m "feat(ui): non-blocking ConnectionBanner with self-healing poll"
```

---

## Task 7: Branch the connect-probe error copy on kind

**Files:**
- Modify: `src/shared/composables/useGitlabConnect.ts:32-51`
- Test: `src/shared/composables/useGitlabConnect.test.ts`

On the connect screen, a `401/403` probe means a bad token; a `>= 500` (or a thrown rpc) means the server is down. The token field stays put either way — only the message changes.

> `ConnectView.vue` and `SessionExpiredOverlay.vue` need **no** edits: both already render `{{ message }}` from this composable inside their error block. Branching the message here is the whole change.

- [ ] **Step 1: Add failing tests**

In `src/shared/composables/useGitlabConnect.test.ts`, add these tests inside the `describe('useGitlabConnect', ...)` block:

```ts
  it('shows a token-rejected message on 401', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const c = useGitlabConnect()
    c.url.value = 'https://x'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.status.value).toBe('error')
    expect(c.message.value).toMatch(/token/i)
    expect(c.message.value).toMatch(/api/)
  })

  it('shows an unreachable-server message on 5xx', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const c = useGitlabConnect()
    c.url.value = 'https://gitlab.example.com'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.status.value).toBe('error')
    expect(c.message.value).toMatch(/reach/i)
    expect(c.message.value).toContain('gitlab.example.com')
  })

  it('treats a thrown rpc as unreachable', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockRejectedValue(new Error('ECONNREFUSED'))
    const c = useGitlabConnect()
    c.url.value = 'https://gitlab.example.com'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.message.value).toMatch(/reach/i)
  })
```

> The existing `'surfaces a GraphQL error and resolves false'` test (status 200 + errors) stays valid — that path is unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/shared/composables/useGitlabConnect.test.ts`
Expected: FAIL — the 401 case currently yields the generic `GitLab returned 401`, not a token-specific message.

- [ ] **Step 3: Implement the change**

In `src/shared/composables/useGitlabConnect.ts`, replace the `save()` function (lines 32-51) with a version that classifies the probe result by status:

```ts
  async function save(): Promise<boolean> {
    if (!canSubmit.value) return false
    status.value = 'testing'
    message.value = ''
    try {
      await rpc.saveConfig({ url: url.value.trim(), token: token.value.trim() })
      const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
      if (res.status === 200 && !res.errors?.length) {
        status.value = 'idle'
        return true
      }
      status.value = 'error'
      message.value = connectErrorMessage(res.status, res.errors, url.value.trim())
      return false
    } catch {
      // A thrown rpc means the host's fetch threw — treat as unreachable, never
      // as a token problem.
      status.value = 'error'
      message.value = `Couldn’t reach ${url.value.trim() || 'GitLab'} — is the server up?`
      return false
    }
  }
```

Add this helper above the `useGitlabConnect` function (below `PROBE_QUERY`):

```ts
/** Map a connect-probe result to a kind-specific, recoverable message. */
function connectErrorMessage(
  statusCode: number,
  errors: { message: string }[] | undefined,
  host: string,
): string {
  if (statusCode === 401 || statusCode === 403) {
    return 'Token rejected — check the token and its `api` scope.'
  }
  if (statusCode >= 500) {
    return `Couldn’t reach ${host || 'GitLab'} — is the server up?`
  }
  return errors?.[0]?.message ?? `GitLab returned ${statusCode}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/shared/composables/useGitlabConnect.test.ts`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/shared/composables/useGitlabConnect.ts src/shared/composables/useGitlabConnect.test.ts
git commit -m "feat(connect): kind-specific copy for token-invalid vs unreachable"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the entire test suite**

Run: `bunx vitest run`
Expected: PASS — all suites green, no regressions in `App.test.ts`, `SessionExpiredOverlay.test.ts`, or any view test.

- [ ] **Step 2: Typecheck**

Run: `bun run build` (or the project's typecheck script if separate)
Expected: no type errors. (Note: `src/gitlab/generated` is gitignored and may show codegen-related red until `bun codegen` runs against the live instance — that is pre-existing and unrelated to this change.)

- [ ] **Step 3: Confirm the work is committed**

Run: `git status`
Expected: clean working tree; the seven feature commits present on the branch.

---

## Notes for the implementer

- **Test runner:** always `bunx vitest run` (one-shot). Not `bun test`, not `bun run test` (watch mode).
- **Format:** run `bun run format` after edits in every task (already in each task's commit step).
- **Why a 503 sentinel for transport throws:** it unifies "server threw" and "server returned 5xx" into one `unavailable` path, so `normalizeError`/`httpError` need only a single `>= 500` rule. Keep the sentinel internal to `src/bun/gitlab.ts`.
- **Auth-wins invariant:** every place that could set `unavailable` must yield to `expired`. The guard lives in `markServerUnavailable`; the recovery poll's `auth` outcome calls `markSessionExpired` (which clears `unavailable`). Don't bypass these setters.
- **No re-trigger loop:** the recovery poll calls `rpc.gitlabGraphql` directly, never vue-query, so it cannot feed `installAuthWatch`.
```
