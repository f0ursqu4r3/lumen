# Host-Owned Server Health — Design

**Date:** 2026-06-10
**Status:** Approved (design); implementation pending

## Summary

Lumen's "GitLab unavailable" banner and "session expired" overlay are currently
driven **per window**: each native `BrowserWindow` runs its own
`installAuthWatch` (detection) and its own `useServerRecovery` probe loop
(recovery), against its own `sessionState`. With N windows open there are N
independent recovery loops, each probing GitLab on its own backoff and showing
its own countdown — which visibly drift apart (e.g. one window "retrying in 4s",
another "retrying in 13s").

Move all server-health logic to a **single host authority** (`src/bun/serverHealth.ts`).
The Bun host already proxies every GitLab request, so it is the natural choke
point: it detects down/expired by watching its own request outcomes, owns the
one recovery loop + countdown, and **broadcasts** the health state to every
window. Windows become thin displays. Result: one source of truth, a single
consistent countdown across all windows, and no redundant probing.

## Goals

- One recovery loop and one countdown, identical in every window.
- The host is the single authority for `ok | down | expired`.
- Preserve today's UX exactly: the non-blocking banner while down (with the
  countdown + Retry now from the prior change), the blocking re-auth overlay
  when the token is genuinely invalid, and the **confirm-then-latch** rule (a
  single transient 401 must not log the user out).
- Per-window query refetch on recovery (each window owns its own cache).
- Thin, testable units: a pure host state machine; thin webview display glue.

## Non-Goals

- No change to the banner/overlay visual design (carried over as-is).
- No change to how the token is entered/saved (existing `saveConfig` flow).
- No new "down" UX beyond the existing banner.

## Decisions (from brainstorming)

- **Full host-owned health** (chosen over "recovery loop only"): the host owns
  down-detection, the recovery loop, AND the auth confirm-then-latch. The
  webview's `installAuthWatch`, `probeServer`, and `useServerRecovery` probe loop
  are removed. Both the banner and the expired overlay become host-driven and
  consistent across windows.
- **Detection is passive**: the host classifies the result of every
  `gitlabGraphql`/`gitlabRest` it already performs — no webview "report down" RPC.

## Architecture

```
Every window's GitLab request ──rpc──► Bun host
                                          │
                          gitlabGraphql / gitlabRest  ──► GitLab
                                          │ (classify every result)
                                          ▼
                                  serverHealth  (state machine: ok | down | expired)
                                   ├─ passive detection (from request outcomes)
                                   ├─ recovery loop (probe + backoff 2/5/15 + 1s countdown)
                                   └─ confirm-then-latch for auth
                                          │ broadcast lumen:server-health {state, secondsLeft, probing}
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                     main window     issue window     settings window
                  installServerHealth (per window): update sessionState;
                  on down→ok, invalidate THIS window's queries; render banner/overlay
```

## Components

### Host: `src/bun/serverHealth.ts` (new)

The state machine + recovery loop + broadcaster. Pure-ish: takes its probe
function and a broadcaster as collaborators so it unit-tests without electrobun
or real fetch.

State: `{ state: 'ok' | 'down' | 'expired'; secondsLeft: number; probing: boolean }`.

Exposed:
- `classifyStatus(status: number, hasErrorBody: boolean): 'ok' | 'auth' | 'down'`
  — the single classifier (mirrors `probeServer`: 401 or 403-with-body → auth;
  ≥500 or bodyless-403 → down; 2xx → ok; anything else → down). Reused by both
  passive detection and the active probe.
- `observe(outcome: 'ok' | 'auth' | 'down'): void` — feed a request's classified
  outcome. `down` while ok → start recovery. `auth` while ok → confirm-probe
  (cooldown-guarded) → expired only if confirmed. `ok` while down/expired →
  recover.
- `retryNow(): void` — skip the backoff and probe immediately.
- `getHealth(): { state, secondsLeft, probing }` — current snapshot (boot pull).
- `resetForReconnect(): void` — after a new token is saved: clear expired/down
  and probe once.
- `startServerHealth(deps)` — wire the probe fn + broadcaster + config check.

Internals: a recovery `setTimeout` (backoff `2000 → 5000 → 15000`) and a 1s
`setInterval` countdown, identical to the prior `useServerRecovery` timing;
`probing` flips true around each probe; a confirm cooldown (`2000ms`, today's
`VERIFY_COOLDOWN_MS`). Every state/countdown change calls the broadcaster.

The probe is `gitlabGraphql({ query: PROBE_QUERY })` run host-side
(`PROBE_QUERY = '{ currentUser { username } }'`), classified via
`classifyStatus`. When unconfigured (no token), the monitor is idle (no probing).

### Host: detection hookup — `src/bun/gitlab.ts` + `src/bun/index.ts`

`gitlabGraphql`/`gitlabRest` classify each result they already compute and call
`serverHealth.observe(outcome)` (a thin call; the request path is otherwise
unchanged). The probe used by `serverHealth` must NOT recurse into `observe`
(guard with a flag/param so a probe result doesn't re-feed the monitor).

### Host: window registry + broadcast — `src/bun/index.ts`

A unified `windows: Set<BrowserWindow>` (every created window adds itself; the
`close` handler removes it — main, issue, issues, settings). A `broadcast(js:
string)` iterates the set and `executeJavascript`s. `serverHealth`'s broadcaster
dispatches `window.dispatchEvent(new CustomEvent('lumen:server-health', { detail:
<json> }))` into each window. (Replaces the ad-hoc `win.webview.executeJavascript`
calls added for `lumen:disconnected` / `lumen:cache-cleared`, which can route
through the same `broadcast`/`win`-targeted helpers.)

### Host: RPCs — `rpcContract.ts` + `index.ts`

- `getServerHealth(): Promise<{ state: 'ok'|'down'|'expired'; secondsLeft: number; probing: boolean }>`
- `retryServerNow(): Promise<{ ok: true }>` → `serverHealth.retryNow()`.
- `saveConfig` handler also calls `serverHealth.resetForReconnect()` after saving.

### Webview: `src/shared/composables/useSession.ts` (reduced)

- `sessionState` becomes `{ expired: boolean; unavailable: boolean; secondsLeft:
  number; probing: boolean }`, written ONLY by the health listener (no local
  detection). `expired` ⇔ host state `expired`; `unavailable` ⇔ host state `down`.
- **Removed:** `installAuthWatch`, `probeServer`, `isAuthError`/`isUnavailableError`
  (and their use). The classification now lives host-side.
- New `installServerHealth(queryClient): () => void` (wired in `main.ts` in place
  of `installAuthWatch`): on mount, `getServerHealth()` seeds `sessionState`; a
  `lumen:server-health` listener updates it. On a transition **into ok from down**,
  call `queryClient.invalidateQueries()` (this window refetches). Returns an
  unsubscribe.

### Webview: `useServerRecovery.ts` (removed)

The per-window probe loop is deleted. `ConnectionBanner` no longer owns a poll.
The countdown UI it gained in the prior change now reads `sessionState.secondsLeft`
/ `sessionState.probing`; **Retry now** calls `rpc.retryServerNow()`.

### Webview: `ConnectionBanner.vue` / `SessionExpiredOverlay.vue`

- `ConnectionBanner`: drop `useServerRecovery`; bind to `sessionState.unavailable`
  / `secondsLeft` / `probing`; Retry now → `rpc.retryServerNow()`.
- `SessionExpiredOverlay`: unchanged (reads `sessionState.expired`, now host-driven).

## Data Flow

- **Outage begins:** a request → 503 → `observe('down')` → ok→down, start loop,
  broadcast `{down, secondsLeft:2, probing:false}`. Every banner shows "retrying
  in 2s", counting down in lockstep.
- **Probe tick:** broadcast `{down, probing:true}` → every banner "retrying…";
  on `down` → reschedule next backoff step; on `ok` → recover.
- **Recovery:** broadcast `{ok}` → every window hides the banner and invalidates
  its own queries → refetch.
- **Token dies:** request → 401 → `observe('auth')` → confirm-probe → `expired` →
  broadcast → every window shows the overlay. Re-enter token (`saveConfig` →
  `resetForReconnect` → probe ok) → broadcast `{ok}` → overlays clear, refetch.
- **New window mid-outage:** boots → `getServerHealth()` → seeds banner/overlay →
  rides subsequent events.

## Error Handling

- Confirm cooldown prevents a probe storm from many failing requests.
- Unconfigured (no token) → monitor idle; no probing.
- `broadcast` to a window whose webview JS isn't ready yet is harmless (no
  listener); the boot pull seeds late-joiners.
- Recovery timer is a single host timer; start/stop idempotent.
- The probe must not re-enter `observe` (no feedback loop).

## Testing

- **Host `serverHealth` (pure logic, fake timers + injected probe/broadcast):**
  `classifyStatus` cases; `observe` transitions (ok→down→ok; auth confirm-latch
  with cooldown; transient 401 does NOT expire); recovery backoff 2→5→15;
  countdown decrement; `retryNow` probes immediately; `resetForReconnect`. The
  broadcaster is a spy asserting payloads.
- **Webview `installServerHealth`:** a `lumen:server-health` event updates
  `sessionState`; a down→ok transition calls `queryClient.invalidateQueries`;
  boot pull seeds from `getServerHealth`.
- **`ConnectionBanner`:** renders `unavailable`/`secondsLeft`/`probing` from
  `sessionState`; Retry now calls `rpc.retryServerNow`.
- **Deleted:** `installAuthWatch` tests and the `useServerRecovery` probe-loop
  tests (the code is removed). `classifyStatus` inherits the cases that
  `probeServer` covered (401/403-body → auth; bodyless-403/5xx → down; 200 → ok).
- The cross-window broadcast/registry isn't unit-testable; **manual smoke:** open
  two windows, drop GitLab, confirm both banners show the SAME countdown and Retry
  now in either affects both; restore, confirm both recover + refetch.
- Run with `bunx vitest run`.

## Risks

- The confirm-then-latch auth semantics are well-tested today
  (`useSession.test.ts`). They must be ported to `serverHealth.observe` with
  equivalent tests, not dropped — a regression here risks wrongly logging the user
  out (or failing to).
- Hooking `observe` into `gitlabGraphql`/`gitlabRest` runs on the hot request
  path; keep it a cheap synchronous classify + call, and never let the probe feed
  back into `observe`.
- Electrobun: the broadcast/registry + `getServerHealth` boot pull are runtime
  glue verified by the manual two-window smoke, not unit tests.

## Open Questions

None blocking. To settle in the plan:
- Whether to fold the existing `lumen:disconnected` / `lumen:cache-cleared`
  one-window dispatches into the new `broadcast` helper, or leave them
  `win`-targeted (they intentionally target only the main window — likely keep
  `win`-targeted, reuse the helper only for true broadcasts).
- Exact `sessionState` shape: keep `{ expired, unavailable }` booleans (least
  churn for consumers) + add `secondsLeft`/`probing` (recommended), vs a single
  `state` enum.
