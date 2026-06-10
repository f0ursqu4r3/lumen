# Host-Owned Server Health — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitLab-reachability a single host-owned state machine that every window mirrors — one recovery loop, one countdown, consistent across all native windows — replacing the per-window detection/recovery duplication.

**Architecture:** A new host module `src/bun/serverHealth.ts` owns `ok | down | expired` plus the recovery loop + countdown + auth confirm-then-latch, with its probe fn and broadcaster injected. The host's `gitlabGraphql`/`gitlabRest` (the request choke point) feed each result's classification into `observe()`. State changes broadcast `lumen:server-health` to every window via a new window registry. The webview's `installAuthWatch`/`probeServer`/`useServerRecovery` are removed; a thin `installServerHealth(queryClient)` mirrors host state into `sessionState` and refetches this window's queries on recovery; the banner/overlay become pure displays.

**Tech Stack:** Bun (host), Electrobun BrowserWindow, Vue 3 webview, TanStack Query, Vitest.

**Builds on:** the baseline commit `feat(banner): show retry countdown + Retry now` (the banner already renders `secondsLeft`/`probing` and a Retry-now button — this plan changes their *source* from a per-window loop to host events).

**Verified facts:**
- Every GitLab request flows through `gitlabGraphql`/`gitlabRest` in `src/bun/gitlab.ts`, which already returns a `503` sentinel on transport failure (`src/bun/gitlab.ts`). The host is the choke point.
- `installAuthWatch(queryClient)` is wired per-window in `src/main.ts:30`; `useServerRecovery` is owned by `ConnectionBanner.vue`; `sessionState` (`{ expired, unavailable }` + the new `secondsLeft`/`probing`) lives in `src/shared/composables/useSession.ts`.
- Today's classification (`probeServer`): `401` or `403`-with-error-body → auth; `≥500` / bodyless-`403` / transport-503 → down; `200` → ok. `PROBE_QUERY = '{ currentUser { username } }'`.
- The confirm-then-latch rule (a single transient 401 must NOT expire the session) is tested in `useSession.test.ts` — its semantics move to `serverHealth`.
- `index.ts` tracks `win` (main), `issueWindows` Map, `settingsWindow`; combined `issuesWin` is untracked. There is no unified registry yet. `clearConfig`/`notifyCacheCleared` use `win.webview.executeJavascript` (main-targeted — keep them as-is).

---

## File Structure

```
src/bun/
  serverHealth.ts          # NEW: state machine + recovery loop + classifier (probe/broadcast injected)
  serverHealth.test.ts     # NEW
  gitlab.ts                # MODIFY: feed each request outcome into observe() (guarded against the probe)
  gitlab.test.ts           # MODIFY: assert observe() is called with the classified outcome
  index.ts                 # MODIFY: window registry + broadcast; wire startServerHealth; getServerHealth/retryServerNow RPCs; saveConfig → resetForReconnect
src/shared/lib/rpcContract.ts   # MODIFY: ServerHealth type + getServerHealth/retryServerNow
src/shared/lib/rpc.ts           # MODIFY: passthroughs
src/shared/composables/
  useSession.ts            # MODIFY: reduce to sessionState (+secondsLeft/probing) + installServerHealth; remove installAuthWatch/probeServer/isAuthError/isUnavailableError
  useSession.test.ts       # MODIFY: drop the removed-API tests; test installServerHealth + sessionState
  useServerRecovery.ts     # DELETE
  useServerRecovery.test.ts# DELETE
src/main.ts                # MODIFY: installServerHealth in place of installAuthWatch
src/shared/components/
  ConnectionBanner.vue     # MODIFY: drop useServerRecovery; bind sessionState; Retry now → rpc.retryServerNow
  ConnectionBanner.test.ts # MODIFY: mock rpc.retryServerNow; drive via sessionState
docs/server-health.md      # NEW: manual two-window smoke test
```

---

## Task 1: `serverHealth` state machine (host, pure logic)

**Files:**
- Create: `src/bun/serverHealth.ts`, `src/bun/serverHealth.test.ts`

- [ ] **Step 1: Write the failing test** — `src/bun/serverHealth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyStatus,
  startServerHealth,
  observe,
  retryNow,
  getHealth,
  resetForReconnect,
  __resetForTest,
} from './serverHealth'

const broadcast = vi.fn()
let probeOutcome: 'ok' | 'auth' | 'down' = 'down'

beforeEach(() => {
  vi.useFakeTimers()
  broadcast.mockReset()
  probeOutcome = 'down'
  startServerHealth({ probe: async () => probeOutcome, broadcast })
  __resetForTest()
})
afterEach(() => vi.useRealTimers())

describe('classifyStatus', () => {
  it('maps statuses to outcomes (mirrors the old probeServer)', () => {
    expect(classifyStatus(401, false)).toBe('auth')
    expect(classifyStatus(403, true)).toBe('auth') // 403 with a GraphQL error body
    expect(classifyStatus(403, false)).toBe('down') // bodyless 403 = edge/LB block
    expect(classifyStatus(503, false)).toBe('down')
    expect(classifyStatus(500, false)).toBe('down')
    expect(classifyStatus(200, false)).toBe('ok')
    expect(classifyStatus(404, false)).toBe('ok') // server answered → reachable
  })
})

describe('serverHealth state machine', () => {
  it('starts ok and idle', () => {
    expect(getHealth()).toEqual({ state: 'ok', secondsLeft: 0, probing: false })
  })

  it('a down observation starts recovery with a 2s countdown', () => {
    observe('down')
    expect(getHealth()).toMatchObject({ state: 'down', secondsLeft: 2, probing: false })
    expect(broadcast).toHaveBeenLastCalledWith({ state: 'down', secondsLeft: 2, probing: false })
  })

  it('counts the seconds down each tick', async () => {
    observe('down')
    await vi.advanceTimersByTimeAsync(1000)
    expect(getHealth().secondsLeft).toBe(1)
  })

  it('recovers to ok when a probe succeeds', async () => {
    observe('down')
    probeOutcome = 'ok'
    await vi.advanceTimersByTimeAsync(2000) // first probe fires
    expect(getHealth().state).toBe('ok')
    expect(broadcast).toHaveBeenLastCalledWith({ state: 'ok', secondsLeft: 0, probing: false })
  })

  it('escalates to expired when a recovery probe returns auth', async () => {
    observe('down')
    probeOutcome = 'auth'
    await vi.advanceTimersByTimeAsync(2000)
    expect(getHealth().state).toBe('expired')
  })

  it('reschedules on the next backoff step when a probe still fails', async () => {
    observe('down')
    probeOutcome = 'down'
    await vi.advanceTimersByTimeAsync(2000) // probe 1 (2s)
    expect(getHealth().secondsLeft).toBe(5) // next step
    await vi.advanceTimersByTimeAsync(5000) // probe 2 (5s)
    expect(getHealth().secondsLeft).toBe(15)
  })

  it('confirms before latching expired: a transient auth does NOT expire if the probe is clean', async () => {
    probeOutcome = 'ok'
    observe('auth')
    await vi.advanceTimersByTimeAsync(0)
    expect(getHealth().state).toBe('ok')
  })

  it('latches expired when an auth observation is confirmed by the probe', async () => {
    probeOutcome = 'auth'
    observe('auth')
    await vi.advanceTimersByTimeAsync(0)
    expect(getHealth().state).toBe('expired')
  })

  it('ignores observations once down (the recovery loop drives)', async () => {
    observe('down')
    broadcast.mockClear()
    observe('down')
    observe('auth')
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('retryNow() probes immediately instead of waiting for the backoff', async () => {
    observe('down')
    const probe = vi.fn(async () => 'down' as const)
    startServerHealth({ probe, broadcast })
    retryNow()
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(0)
  })

  it('resetForReconnect clears down/expired back to ok', async () => {
    observe('down')
    resetForReconnect()
    expect(getHealth().state).toBe('ok')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

Run: `bunx vitest run src/bun/serverHealth.test.ts`

- [ ] **Step 3: Implement** — `src/bun/serverHealth.ts`:

```typescript
export type ServerState = 'ok' | 'down' | 'expired'
export type Outcome = 'ok' | 'auth' | 'down'
export interface ServerHealth {
  state: ServerState
  secondsLeft: number
  probing: boolean
}

/** Recovery backoff: 2s → 5s → 15s, capped. */
const BACKOFF = [2000, 5000, 15000]
/** After a confirm-probe declines to latch, don't re-probe for this long. */
const CONFIRM_COOLDOWN_MS = 2000

/**
 * Classify a GitLab response for health. 401 (or 403 carrying a GraphQL/JSON
 * error body) → auth; ≥500 / bodyless-403 (edge-LB) / the transport-503 sentinel
 * → down; everything the server actually answered → ok (reachable). Mirrors the
 * old probeServer/errors.ts semantics.
 */
export function classifyStatus(status: number, hasErrorBody: boolean): Outcome {
  if (status === 401 || (status === 403 && hasErrorBody)) return 'auth'
  if (status >= 500 || status === 403) return 'down'
  return 'ok'
}

let state: ServerState = 'ok'
let secondsLeft = 0
let probing = false // UI flag: a recovery probe is in flight
let attempt = 0
let recoveryTimer: ReturnType<typeof setTimeout> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let confirming = false
let lastConfirm = 0
let probeInFlight = false // recursion guard: any probe (recovery OR confirm) is calling gitlab

let probe: () => Promise<Outcome> = async () => 'ok'
let broadcast: (h: ServerHealth) => void = () => {}

/** Wire the probe fn (host gitlab probe → Outcome) and the broadcaster. */
export function startServerHealth(deps: {
  probe: () => Promise<Outcome>
  broadcast: (h: ServerHealth) => void
}): void {
  probe = deps.probe
  broadcast = deps.broadcast
}

/** True while a probe is calling gitlab — gitlab.ts uses this to avoid feeding
 *  the probe's own result back into observe() (no feedback loop). */
export function isProbing(): boolean {
  return probeInFlight
}

export function getHealth(): ServerHealth {
  return { state, secondsLeft, probing }
}

function emit(): void {
  broadcast(getHealth())
}

function clearTimers(): void {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer)
    recoveryTimer = null
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function callProbe(): Promise<Outcome> {
  probeInFlight = true
  try {
    return await probe()
  } finally {
    probeInFlight = false
  }
}

function toOk(): void {
  const changed = state !== 'ok'
  clearTimers()
  state = 'ok'
  secondsLeft = 0
  probing = false
  attempt = 0
  if (changed) emit()
}

function toExpired(): void {
  clearTimers()
  state = 'expired'
  secondsLeft = 0
  probing = false
  attempt = 0
  emit()
}

function scheduleProbe(): void {
  const ms = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
  secondsLeft = Math.ceil(ms / 1000)
  probing = false
  emit()
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    if (secondsLeft > 0) {
      secondsLeft -= 1
      emit()
    }
  }, 1000)
  recoveryTimer = setTimeout(() => void runProbe(), ms)
}

async function runProbe(): Promise<void> {
  recoveryTimer = null
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  secondsLeft = 0
  probing = true
  emit()
  const outcome = await callProbe()
  probing = false
  if (state !== 'down') return // changed/reset during the probe
  if (outcome === 'ok') return toOk()
  if (outcome === 'auth') return toExpired()
  attempt += 1
  scheduleProbe()
}

function startRecovery(): void {
  if (state === 'down') return
  state = 'down'
  attempt = 0
  scheduleProbe()
}

async function confirmAuth(): Promise<void> {
  if (confirming) return
  if (Date.now() - lastConfirm < CONFIRM_COOLDOWN_MS) return
  confirming = true
  try {
    const outcome = await callProbe()
    if (state !== 'ok') return
    if (outcome === 'auth') toExpired()
    else if (outcome === 'down') startRecovery()
    // 'ok' → the auth error was transient; do not latch.
  } finally {
    confirming = false
    lastConfirm = Date.now()
  }
}

/** Feed a classified request outcome into the monitor. */
export function observe(outcome: Outcome): void {
  if (outcome === 'ok') {
    if (state !== 'ok') toOk()
    return
  }
  if (state !== 'ok') return // already down/expired — the recovery loop drives
  if (outcome === 'down') return startRecovery()
  void confirmAuth() // 'auth' while ok: confirm before latching
}

/** Skip the remaining backoff and probe immediately. No-op unless waiting. */
export function retryNow(): void {
  if (state !== 'down' || probing) return
  clearTimers()
  void runProbe()
}

/** After a new token is saved: drop down/expired and return to ok. */
export function resetForReconnect(): void {
  clearTimers()
  state = 'ok'
  secondsLeft = 0
  probing = false
  attempt = 0
  confirming = false
  lastConfirm = 0
  emit()
}

/** Test-only: reset module state between cases. */
export function __resetForTest(): void {
  clearTimers()
  state = 'ok'
  secondsLeft = 0
  probing = false
  attempt = 0
  confirming = false
  lastConfirm = 0
  probeInFlight = false
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run src/bun/serverHealth.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/serverHealth.ts src/bun/serverHealth.test.ts
git commit -m "feat(server-health): host state machine + recovery loop + classifier"
```

---

## Task 2: Feed request outcomes into `observe()` (gitlab.ts)

**Files:**
- Modify: `src/bun/gitlab.ts`, `src/bun/gitlab.test.ts`

- [ ] **Step 1: Write the failing test** — add to `src/bun/gitlab.test.ts` (it mocks `./config` and stubs global `fetch`):

```typescript
const { observe, isProbing } = vi.hoisted(() => ({ observe: vi.fn(), isProbing: vi.fn(() => false) }))
vi.mock('./serverHealth', () => ({
  observe,
  isProbing,
  classifyStatus: (status: number, hasBody: boolean) =>
    status === 401 || (status === 403 && hasBody) ? 'auth' : status >= 500 || status === 403 ? 'down' : 'ok',
}))
```
(Place this with the other `vi.mock`s at the top.) Then add tests:

```typescript
import { observe as observeSpy, isProbing as isProbingSpy } from './serverHealth'

describe('gitlab feeds server-health', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ gitlabUrl: 'https://gl.example.com', token: 't' })
    ;(observeSpy as unknown as ReturnType<typeof vi.fn>).mockReset?.()
    ;(isProbingSpy as unknown as ReturnType<typeof vi.fn>).mockReturnValue?.(false)
  })

  it('observes "down" on a transport failure (503 sentinel)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await gitlabGraphql({ query: '{x}' })
    expect(observeSpy).toHaveBeenCalledWith('down')
    vi.unstubAllGlobals()
  })

  it('observes "ok" on a clean 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })),
    )
    await gitlabGraphql({ query: '{x}' })
    expect(observeSpy).toHaveBeenCalledWith('ok')
    vi.unstubAllGlobals()
  })

  it('does NOT observe while a probe is in flight (no feedback loop)', async () => {
    ;(isProbingSpy as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })),
    )
    await gitlabGraphql({ query: '{x}' })
    expect(observeSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
```

NOTE: match the existing `gitlab.test.ts` import style (it imports `gitlabGraphql` after the mocks and uses `loadConfig` from a hoisted mock). Read the file first and align the mock placement; the `vi.mock('./serverHealth', …)` must be hoisted above the `import` of `./gitlab`.

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/bun/gitlab.test.ts`

- [ ] **Step 3: Implement** — in `src/bun/gitlab.ts`:

Add the import at the top:

```typescript
import { observe, isProbing, classifyStatus } from './serverHealth'
```

Add a tiny JSON-body check near the top (used to tell a GitLab REST auth-403 from an edge-LB 403):

```typescript
function looksJson(body: string): boolean {
  if (!body) return false
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

/** Feed a request's outcome into the health monitor, unless we ARE the probe. */
function report(status: number, hasErrorBody: boolean): void {
  if (!isProbing()) observe(classifyStatus(status, hasErrorBody))
}
```

In `gitlabGraphql`, the transport-failure `catch` returns the 503 sentinel — report down there, and report the real status on the normal path. Change the function's two return points:

```typescript
  } catch {
    report(503, false)
    return { status: 503, errors: [{ message: 'GitLab is unreachable' }] }
  }
  if (!res.ok && res.status === 401) {
    report(401, false)
    return { status: 401, errors: [{ message: 'Unauthorized' }] }
  }
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown
    errors?: { message: string }[]
  }
  report(res.status, Boolean(json.errors?.length))
  return { status: res.status, data: json.data, errors: json.errors }
```

In `gitlabRest`, likewise:

```typescript
  } catch {
    report(503, false)
    return { ok: false, status: 503, statusText: 'Service Unavailable', body: '' }
  }
  const body = await res.text()
  report(res.status, res.status === 403 ? looksJson(body) : false)
  return { ok: res.ok, status: res.status, statusText: res.statusText, body }
```

(Leave `gitlabAsset` unchanged — asset fetches aren't a reliability signal.)

- [ ] **Step 4: Run — expect PASS** (and existing gitlab.test.ts cases still pass)

Run: `bunx vitest run src/bun/gitlab.test.ts`

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/gitlab.ts src/bun/gitlab.test.ts
git commit -m "feat(server-health): feed every gitlab request outcome into the monitor"
```

---

## Task 3: Window registry + broadcast + wiring (index.ts)

**Files:**
- Modify: `src/bun/index.ts`

Mostly runtime glue (BrowserWindow/executeJavascript aren't unit-testable, like the existing window code). Verified by typecheck + the Task 8 manual smoke. The injected probe + `resetForReconnect` are exercised by Task 1's tests.

- [ ] **Step 1: Add imports + the window registry**

At the top of `src/bun/index.ts`, add:

```typescript
import {
  startServerHealth,
  observe,
  retryNow,
  getHealth,
  resetForReconnect,
  classifyStatus,
  type Outcome,
} from './serverHealth'
import { PROBE_QUERY } from '@/shared/composables/useGitlabConnect'
```
(Note: `PROBE_QUERY = '{ currentUser { username } }'` is a plain string constant — importing it from the shared composable into the bun process is fine; it pulls no Vue runtime.)

After `const issueWindows = new Map(...)`, add a unified registry + broadcaster:

```typescript
// Every native window registers here so host-owned state (server health) can be
// broadcast to all of them. Pruned on close.
const windows = new Set<BrowserWindow>()

function track(w: BrowserWindow): BrowserWindow {
  windows.add(w)
  w.on('close', () => windows.delete(w))
  return w
}

function broadcast(js: string): void {
  for (const w of windows) w.webview.executeJavascript(js)
}
```

- [ ] **Step 2: Register every created window**

Wrap each `new BrowserWindow(...)` assignment in `track(...)`:
- `openIssueWindow`: `const issueWin = track(new BrowserWindow({ … }))`
- `openIssuesWindow`: `const issuesWin = track(new BrowserWindow({ … }))`
- `openSettingsWindow`: `const win = track(new BrowserWindow({ … }))`
- the main window: `const win = track(new BrowserWindow({ title: 'Lumen', … }))`

(The existing per-window `close` handlers stay; `track` adds its own `close` listener for the registry — both run.)

- [ ] **Step 3: Wire `startServerHealth` after the main window exists**

Immediately after `startMcpIfEnabled()` (which runs after the main window is created), add:

```typescript
// One host-owned recovery loop, broadcast to every window (see src/bun/serverHealth.ts).
startServerHealth({
  probe: async (): Promise<Outcome> => {
    const res = await gitlabGraphql({ query: PROBE_QUERY })
    return classifyStatus(res.status, Boolean(res.errors?.length))
  },
  broadcast: (health) => {
    broadcast(
      `window.dispatchEvent(new CustomEvent('lumen:server-health',{detail:${JSON.stringify(health)}}))`,
    )
  },
})
```

(The probe calls `gitlabGraphql`; `serverHealth.isProbing()` is true during it, so `gitlab.ts` skips re-feeding the result into `observe` — no loop. `observe`/`retryNow` are imported for the RPC handlers below.)

- [ ] **Step 4: Add the RPC handlers + reconnect reset**

In `buildRpc(...).handlers.requests`, add:

```typescript
        getServerHealth: async () => getHealth(),
        retryServerNow: async () => {
          retryNow()
          return { ok: true }
        },
```

And in the existing `saveConfig` handler, after `saveConfig({ url, token })`, add the reconnect reset:

```typescript
        saveConfig: async ({ url, token }) => {
          saveConfig({ url, token })
          resetForReconnect() // new token → clear any down/expired and re-probe on the next request
          return { ok: true }
        },
```

- [ ] **Step 5: Typecheck + full suite**

Run:
```bash
bun run typecheck
bunx vitest run
```
Expected: typecheck clean; suite green (no test exercises the BrowserWindow glue; the imported functions are tested in Task 1). If typecheck flags the new RPC handlers, ensure the contract additions land in Task 4 first — do Task 4's Step 1 (contract) before this typecheck, or run them together. (Recommended: implement Task 4 Step 1 immediately, then typecheck here.)

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/bun/index.ts
git commit -m "feat(server-health): window registry + broadcast; wire host recovery + RPCs"
```

---

## Task 4: RPC contract + client passthroughs

**Files:**
- Modify: `src/shared/lib/rpcContract.ts`, `src/shared/lib/rpc.ts`

- [ ] **Step 1: Extend the contract** — in `src/shared/lib/rpcContract.ts`, add a type near `ConfigStatus`:

```typescript
export interface ServerHealth {
  state: 'ok' | 'down' | 'expired'
  secondsLeft: number
  probing: boolean
}
```

Add to `LumenRequests`:

```typescript
  getServerHealth: () => Promise<ServerHealth>
  retryServerNow: () => Promise<{ ok: true }>
```

- [ ] **Step 2: Add the client passthroughs** — in `src/shared/lib/rpc.ts`, add to the exported `rpc` proxy:

```typescript
  getServerHealth: () => client().getServerHealth(),
  retryServerNow: () => client().retryServerNow(),
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean (the `index.ts` handlers from Task 3 now satisfy the contract).

- [ ] **Step 4: Commit**

```bash
bun run format
git add src/shared/lib/rpcContract.ts src/shared/lib/rpc.ts
git commit -m "feat(server-health): getServerHealth + retryServerNow RPCs"
```

---

## Task 5: Slim the webview session module + `installServerHealth`

**Files:**
- Modify: `src/shared/composables/useSession.ts`, `src/shared/composables/useSession.test.ts`

- [ ] **Step 1: Replace the test** — rewrite `src/shared/composables/useSession.test.ts` entirely (the old `installAuthWatch`/`isAuthError`/`probeServer` tests go; their semantics now live in `serverHealth.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getServerHealth = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { getServerHealth: () => getServerHealth() } }))

import { sessionState, installServerHealth } from './useSession'
import { QueryClient } from '@tanstack/vue-query'

beforeEach(() => {
  getServerHealth.mockReset()
  getServerHealth.mockResolvedValue({ state: 'ok', secondsLeft: 0, probing: false })
  sessionState.expired = false
  sessionState.unavailable = false
  sessionState.secondsLeft = 0
  sessionState.probing = false
})

const emit = (detail: { state: string; secondsLeft: number; probing: boolean }) =>
  window.dispatchEvent(new CustomEvent('lumen:server-health', { detail }))

describe('installServerHealth', () => {
  it('seeds sessionState from getServerHealth on install', async () => {
    getServerHealth.mockResolvedValue({ state: 'down', secondsLeft: 5, probing: false })
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    await Promise.resolve()
    await Promise.resolve()
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.secondsLeft).toBe(5)
    stop()
  })

  it('mirrors a down event into the unavailable banner state', () => {
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    emit({ state: 'down', secondsLeft: 3, probing: false })
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.expired).toBe(false)
    expect(sessionState.secondsLeft).toBe(3)
    stop()
  })

  it('mirrors an expired event into the overlay state', () => {
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    emit({ state: 'expired', secondsLeft: 0, probing: false })
    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
    stop()
  })

  it('invalidates this window’s queries when recovering from down', () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    const stop = installServerHealth(qc)
    emit({ state: 'down', secondsLeft: 2, probing: false })
    emit({ state: 'ok', secondsLeft: 0, probing: false })
    expect(sessionState.unavailable).toBe(false)
    expect(invalidate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not invalidate on an ok→ok event (no spurious refetch)', () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    const stop = installServerHealth(qc)
    emit({ state: 'ok', secondsLeft: 0, probing: false })
    expect(invalidate).not.toHaveBeenCalled()
    stop()
  })

  it('stops reacting after cleanup', () => {
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    stop()
    emit({ state: 'down', secondsLeft: 9, probing: false })
    expect(sessionState.unavailable).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`

- [ ] **Step 3: Implement** — replace `src/shared/composables/useSession.ts` entirely:

```typescript
import { reactive } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'
import { rpc } from '@/shared/lib/rpc'
import type { ServerHealth } from '@/shared/lib/rpcContract'

// Per-window mirror of the host-owned server-health state (see
// src/bun/serverHealth.ts). `unavailable` drives the non-blocking ConnectionBanner;
// `expired` drives the blocking re-connect overlay; `secondsLeft`/`probing` feed
// the banner's countdown. Written ONLY by installServerHealth — all detection and
// recovery is host-owned and broadcast over `lumen:server-health`.
export const sessionState = reactive<{
  expired: boolean
  unavailable: boolean
  secondsLeft: number
  probing: boolean
}>({
  expired: false,
  unavailable: false,
  secondsLeft: 0,
  probing: false,
})

function apply(h: ServerHealth): void {
  const wasUnavailable = sessionState.unavailable
  sessionState.expired = h.state === 'expired'
  sessionState.unavailable = h.state === 'down'
  sessionState.secondsLeft = h.secondsLeft
  sessionState.probing = h.probing
  return void wasUnavailable
}

/**
 * Mirror host server-health into sessionState for this window, and refetch this
 * window's queries when the server recovers (down → ok). Seeds from the current
 * host state on install (so a window opened mid-outage shows the banner), then
 * rides `lumen:server-health` events. Returns a cleanup. Installed once per
 * window from main.ts; never torn down in production.
 */
export function installServerHealth(queryClient: QueryClient): () => void {
  const onEvent = (e: Event) => {
    const h = (e as CustomEvent<ServerHealth>).detail
    const wasDown = sessionState.unavailable
    apply(h)
    if (wasDown && h.state === 'ok') void queryClient.invalidateQueries()
  }
  window.addEventListener('lumen:server-health', onEvent)
  void rpc.getServerHealth().then((h) => apply(h))
  return () => window.removeEventListener('lumen:server-health', onEvent)
}
```

(Drop `apply`'s unused `wasUnavailable` line if your linter objects — it's there only to mirror intent; the recovery check lives in `onEvent`. Simpler: remove the `wasUnavailable` local from `apply` entirely.)

Final `apply` (clean):

```typescript
function apply(h: ServerHealth): void {
  sessionState.expired = h.state === 'expired'
  sessionState.unavailable = h.state === 'down'
  sessionState.secondsLeft = h.secondsLeft
  sessionState.probing = h.probing
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/shared/composables/useSession.ts src/shared/composables/useSession.test.ts
git commit -m "feat(server-health): webview mirrors host state via installServerHealth"
```

---

## Task 6: Swap the wiring in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace the import and the call**

In `src/main.ts`, change the import:

```typescript
import { installServerHealth } from '@/shared/composables/useSession'
```

And the call (was `installAuthWatch(queryClient)` at ~line 30):

```typescript
  // App-lifetime: mirror host-owned server health into sessionState (banner +
  // overlay) and refetch this window's queries when the server recovers. Never
  // torn down — lives as long as the webview.
  installServerHealth(queryClient)
```

- [ ] **Step 2: Typecheck + full suite**

Run:
```bash
bun run typecheck
bunx vitest run
```
Expected: typecheck clean. Tests: any remaining references to the removed `installAuthWatch`/`probeServer` will fail to import — those are addressed in Task 7 (ConnectionBanner / useServerRecovery deletion). If the full suite still references them here, proceed to Task 7 before re-running; or run only `bunx vitest run src/main.* src/shared/composables/useSession.test.ts` for this task.

- [ ] **Step 3: Commit**

```bash
bun run format
git add src/main.ts
git commit -m "feat(server-health): install the host-health mirror at boot"
```

---

## Task 7: Banner becomes a pure display; delete the per-window loop

**Files:**
- Modify: `src/shared/components/ConnectionBanner.vue`, `src/shared/components/ConnectionBanner.test.ts`
- Delete: `src/shared/composables/useServerRecovery.ts`, `src/shared/composables/useServerRecovery.test.ts`

- [ ] **Step 1: Rewrite the banner test** — replace `src/shared/components/ConnectionBanner.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const retryServerNow = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { retryServerNow: () => retryServerNow() } }))

import ConnectionBanner from './ConnectionBanner.vue'
import { sessionState } from '@/shared/composables/useSession'

beforeEach(() => {
  retryServerNow.mockReset()
  sessionState.expired = false
  sessionState.unavailable = false
  sessionState.secondsLeft = 0
  sessionState.probing = false
})

describe('ConnectionBanner', () => {
  it('is hidden when the server is reachable', () => {
    const w = mount(ConnectionBanner)
    expect(w.find('[data-testid="connection-banner"]').exists()).toBe(false)
  })

  it('shows the countdown from sessionState when unavailable', async () => {
    const w = mount(ConnectionBanner)
    sessionState.unavailable = true
    sessionState.secondsLeft = 7
    await w.vm.$nextTick()
    expect(w.find('[data-testid="connection-banner"]').text()).toContain('7s')
  })

  it('Retry now pokes the host probe', async () => {
    const w = mount(ConnectionBanner)
    sessionState.unavailable = true
    await w.vm.$nextTick()
    await w.find('[data-testid="connection-retry-now"]').trigger('click')
    expect(retryServerNow).toHaveBeenCalled()
  })

  it('shows "retrying…" without a countdown or button while probing', async () => {
    const w = mount(ConnectionBanner)
    sessionState.unavailable = true
    sessionState.probing = true
    await w.vm.$nextTick()
    const banner = w.find('[data-testid="connection-banner"]')
    expect(banner.text()).toContain('retrying…')
    expect(w.find('[data-testid="connection-retry-now"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (banner still imports `useServerRecovery`)

Run: `bunx vitest run src/shared/components/ConnectionBanner.test.ts`

- [ ] **Step 3: Rewrite the banner** — replace the `<script setup>` of `src/shared/components/ConnectionBanner.vue` (keep the existing `<template>` from the baseline commit — it already renders `sessionState`-style `secondsLeft`/`probing` + the retry button; only the script changes):

```vue
<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import { sessionState } from '@/shared/composables/useSession'
import { rpc } from '@/shared/lib/rpc'

// The banner is now a pure display of host-owned server health (mirrored into
// sessionState by installServerHealth). Retry now pokes the single host loop.
const retryNow = () => void rpc.retryServerNow()
</script>
```

Then update the template's two bindings to read `sessionState` and call `retryNow`:
- the dynamic text: `{{ sessionState.probing ? 'retrying…' : `retrying in ${sessionState.secondsLeft}s` }}`
- the button: `v-if="!sessionState.probing"` and `@click="retryNow"`
- the probing icon/`v-if` on the banner stays `v-if="sessionState.unavailable"`.

(Concretely, the template body from the baseline becomes — keeping its classes/a11y:)

```html
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="sessionState.unavailable"
      class="fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-border bg-card py-2.5 pr-2 pl-4 shadow-pop"
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
    >
      <LoaderCircle
        class="size-4 shrink-0 animate-spin text-primary/80"
        :stroke-width="2"
        aria-hidden="true"
      />
      <span class="text-sm leading-none text-foreground/90">
        Can't reach GitLab —
        <span aria-hidden="true">{{
          sessionState.probing ? 'retrying…' : `retrying in ${sessionState.secondsLeft}s`
        }}</span>
        <span class="sr-only">retrying</span>
      </span>
      <button
        v-if="!sessionState.probing"
        type="button"
        data-testid="connection-retry-now"
        class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        @click="retryNow"
      >
        Retry now
      </button>
    </div>
  </Transition>
```

- [ ] **Step 4: Delete the obsolete loop**

```bash
git rm src/shared/composables/useServerRecovery.ts src/shared/composables/useServerRecovery.test.ts
```

- [ ] **Step 5: Run — expect PASS**

Run: `bunx vitest run src/shared/components/ConnectionBanner.test.ts`

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/shared/components/ConnectionBanner.vue src/shared/components/ConnectionBanner.test.ts
git commit -m "feat(server-health): banner is a pure host-state display; remove per-window loop"
```

---

## Task 8: Sweep references, full verify, smoke doc

**Files:**
- Create: `docs/server-health.md`

- [ ] **Step 1: Find any stragglers** referencing the removed APIs:

```bash
git grep -n "installAuthWatch\|useServerRecovery\|probeServer\|isAuthError\|isUnavailableError\|markServerUnavailable\|markSessionExpired\|clearServerUnavailable"
```
Expected: NO matches in `src/` (docs/plan `.md` files are fine). The removed symbols had these consumers — confirm each is gone or rewired:
- `main.ts` → now `installServerHealth` (Task 6).
- `ConnectionBanner.vue` → now `rpc.retryServerNow` (Task 7).
- `SessionExpiredOverlay.vue` reads `sessionState.expired` only (unchanged — verify it does NOT import any removed function).
If any straggler remains, remove/rewire it (e.g. an import of `markSessionExpired`).

- [ ] **Step 2: Full suite + typecheck**

Run:
```bash
bunx vitest run
bun run typecheck
```
Expected: ALL tests pass; typecheck clean.

- [ ] **Step 3: Write the smoke doc** — `docs/server-health.md`:

```markdown
# Server health (manual smoke)

Server-reachability is host-owned (`src/bun/serverHealth.ts`): one recovery loop,
broadcast to every window. The cross-window behavior isn't unit-tested (Electrobun
runtime), so verify by hand:

1. `bun run app:dev`. Open a second native window (expand an issue, or ⌘,).
2. Drop GitLab (disconnect VPN / stop the instance). Trigger a request in either
   window (navigate/refresh).
3. **Both** windows show the banner with the **same** countdown, ticking in
   lockstep (e.g. both "retrying in 5s"). Before this change they drifted.
4. Click **Retry now** in one window → both banners flip to "retrying…" together.
5. Restore GitLab. On the next probe (or a Retry now), **both** banners clear and
   **each** window refetches its data.
6. Token test: revoke/replace the token so requests 401. After one confirm probe,
   **all** windows show the re-connect overlay. Re-enter a valid token → all clear.
```

- [ ] **Step 4: Commit**

```bash
bun run format
git add docs/server-health.md
git commit -m "docs(server-health): manual two-window smoke test"
```

---

## Self-Review

**Spec coverage:**
- Single host authority (`ok|down|expired` + loop + countdown + confirm-latch): ✅ Task 1.
- Passive detection via the request choke point: ✅ Task 2.
- Window registry + `broadcast` of `lumen:server-health`: ✅ Task 3.
- `getServerHealth` (boot pull) + `retryServerNow` RPCs: ✅ Tasks 3–4.
- Reconnect resets health: ✅ Task 3 (`saveConfig` → `resetForReconnect`).
- Webview slimmed (`installAuthWatch`/`probeServer`/`useServerRecovery` removed); `installServerHealth` mirrors state + per-window invalidate on recovery: ✅ Tasks 5–7.
- Banner/overlay pure displays; Retry now → host: ✅ Task 7.
- Confirm-then-latch semantics ported with tests: ✅ Task 1 (the transient-401 and confirmed-401 cases).
- Manual two-window smoke: ✅ Task 8.

**Placeholder scan:** none — every code/test step is complete; the one prose aside (the `apply` cleanup note in Task 5) resolves to the shown "clean" version. Run commands + expected results are explicit.

**Type consistency:** `ServerHealth` shape (`{ state, secondsLeft, probing }`) is identical in `serverHealth.ts` (Task 1), `rpcContract.ts` (Task 4), and `useSession.ts` (Task 5). `Outcome` (`'ok'|'auth'|'down'`) consistent across `serverHealth.ts` and the `gitlab.ts` hook (Task 2). `observe`/`isProbing`/`classifyStatus`/`retryNow`/`getHealth`/`resetForReconnect`/`startServerHealth` names match between Task 1 (defs), Task 2 (gitlab import), and Task 3 (index import). `sessionState` gains `secondsLeft`/`probing` (Task 5) consumed by the banner (Task 7).

**Sequencing note:** Tasks 3 and 4 are mutually type-dependent (index handlers ↔ contract). Implement Task 4 Step 1 (the contract type + methods) before Task 3's typecheck, or do Tasks 3–4 as a pair, then typecheck. Tasks 5–7 must land together before the full suite is green (main.ts swap + banner rewire + loop deletion remove the old symbols); run per-file tests within each task, and the full-suite gate at Task 8.
```
