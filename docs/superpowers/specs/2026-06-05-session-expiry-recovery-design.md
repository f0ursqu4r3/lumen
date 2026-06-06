# Session-Expiry Recovery Design

**Date:** 2026-06-05
**Status:** Approved — ready for implementation plan

## Problem

When a GitLab token goes bad mid-session (expires, is revoked, or loses scope),
every `useQuery`/mutation throws `GitLabError{ kind: 'auth' }` (see
`src/gitlab/errors.ts`). Nothing globally catches `auth`: each view renders its
own inline error and the user is stranded on stuck error screens with no
signpost back to a working session.

The original framing was "restart the backend." That is a misread of the
architecture: the Electrobun host (`src/bun`) holds no token state to restart.
`loadConfig()` reads the token fresh from disk on every RPC call
(`src/bun/config.ts`), and each GitLab fetch is stateless. Swapping a token
takes effect on the very next request — no host relaunch is needed or wanted.

The actual need is **session recovery**: detect an auth failure globally,
surface a clear "re-connect" affordance, and bring the app back to a working
state once a valid token is supplied.

## Goals

- Detect any auth (401/403) failure from app data queries/mutations, globally,
  with no per-view changes.
- Block the UI with a clear, non-dismissable "session expired" recovery surface.
- Let the user re-enter a token in place and, on success, return to a fully
  working app.

## Non-Goals

- No changes to `src/bun` (the host). The host is already stateless w.r.t. the
  token.
- No literal host-process relaunch.
- No in-place query invalidation. Recovery is a full webview reload (decided).

## Approach (selected)

Global session-expiry overlay + webview reload.

A single watcher subscribes to the vue-query query and mutation caches. Any
errored entry whose error is `kind: 'auth'` flips a shared
`sessionState.expired`. A single `SessionExpiredOverlay`, mounted once in
`App.vue`, blocks the screen with a token field (reusing `useGitlabConnect`). On
a clean re-probe it calls `window.location.reload()` — a clean boot that
re-probes and refetches every stuck query under the valid token. The host is
never touched.

Alternatives considered and rejected:

- **In-place refetch** (clear flag + `invalidateQueries()`): preserves transient
  UI state but adds edge cases (a query stuck in `error` must cleanly refetch).
  Full reload is simpler and bulletproof; chosen.
- **Redirect to ConnectView**: least new UI, but it is framed as first-run
  onboarding, loses the current location, and cross-window router navigation
  from a global watcher is awkward.

## Components

### 1. `src/shared/composables/useSession.ts`

Module-level singleton, mirroring the `useSettings` shared-state pattern.

- `sessionState = reactive({ expired: false })`
- `isAuthError(err: unknown): boolean` — type guard returning true when `err` is
  an object with `kind === 'auth'` (the shape `normalizeError` throws).
- `markSessionExpired(): void` — sets `sessionState.expired = true` (idempotent).
- `installAuthWatch(queryClient: QueryClient): () => void` — subscribes to both
  `queryClient.getQueryCache()` and `queryClient.getMutationCache()`. On any
  subscription event, reads the entry's `state.error`; if `isAuthError`, calls
  `markSessionExpired()`. Returns a single unsubscribe that detaches both.

No clear/reset is needed: recovery is a full reload, which resets module state.

### 2. `src/shared/components/SessionExpiredOverlay.vue`

Mounted once in `App.vue` beside `<ToastHost/>`.

- Renders only when `sessionState.expired` is true.
- Fixed, full-screen, high z-index, **non-dismissable** — no click-away or ESC
  close. The only exits are a successful reconnect or an explicit disconnect.
- Copy: "Session expired" with a line explaining the GitLab token is no longer
  valid (api scope).
- Reuses `useGitlabConnect`:
  - `onMounted` → `loadUrl()` to prefill the instance URL, shown read-only.
  - Token `<Input>` bound to `token`; reuses `status` / `message` for the inline
    error state; `testing` disables the field/button.
  - **Reconnect** button → `await save()`; on `true` → `window.location.reload()`.
    On `false`, the inline error (`message`) is shown; the overlay stays.
- **Disconnect** secondary action → `await rpc.clearConfig()` then
  `window.location.reload()`. After reload the router guard
  (`router.beforeEach` → `nextRoute`) sends an unconfigured app to
  `ConnectView`.
- Styling consistent with `ConnectView.vue` / `SettingsDialog.vue`: `Card`,
  destructive alert box for errors, mono labels.

### 3. `src/main.ts`

In `boot()`, after `createPersistedQueryClient(url)` creates `queryClient` and
before/after mount, call `installAuthWatch(queryClient)`. (The returned
unsubscribe is unused — the watch lives for the app's lifetime.)

### 4. `src/App.vue`

Add `<SessionExpiredOverlay />` to the single-shared-instances block, next to
`<ConfirmDialog />`, `<SettingsDialog />`, `<ToastHost />`.

## Why the recovery probe does not loop

The overlay's re-probe runs through `useGitlabConnect.save()` →
`rpc.gitlabGraphql` **directly**, not through vue-query. A 401 while testing the
freshly entered token therefore never reaches the cache watcher, so it cannot
re-trigger `sessionState.expired`. No suppression flag or special-casing is
required — the separation is structural.

## Data Flow

```
useQuery / mutation 401|403
  -> normalizeError -> GitLabError{ kind: 'auth' } thrown
  -> queryCache / mutationCache subscription event
  -> isAuthError(state.error) === true
  -> sessionState.expired = true
  -> SessionExpiredOverlay blocks the screen
  -> user enters a token, clicks Reconnect
  -> useGitlabConnect.save() -> rpc.saveConfig + rpc.gitlabGraphql (direct probe; bypasses watcher)
  -> probe ok
  -> window.location.reload()
  -> clean boot re-probes and refetches everything under the valid token
```

## Edge Cases

- **Multiple queries error at once** — each event sets the boolean; idempotent.
- **Per-issue native windows** — each window runs its own SPA instance, so each
  shows its own overlay and reloads only itself.
- **403 (insufficient scope)** — `normalizeError` maps 401 and 403 to
  `kind: 'auth'`, so the overlay covers the wrong-scope case too; a correctly
  scoped token resolves it.
- **Persisted query cache** — after reload the cache re-hydrates; stale data may
  flash briefly, then refetches under the valid token. Acceptable; not cleared.
- **Disconnect path** — clearing config then reloading routes to ConnectView via
  the existing guard; no new routing logic.

## Testing

- `src/shared/composables/useSession.test.ts`
  - `installAuthWatch` flips `sessionState.expired` when a query cache entry
    errors with an auth-kind error.
  - It also flips on a mutation cache auth error.
  - It does **not** flip on `network` / `graphql` / `unknown` errors.
  - `isAuthError` guard: true for `{ kind: 'auth' }`, false for other kinds,
    null, and non-objects.
- `src/shared/components/SessionExpiredOverlay.test.ts`
  - Renders only when `sessionState.expired` is true.
  - On successful `save()`, calls `window.location.reload` (mocked).
  - On failed `save()`, shows `message` and does not reload.
  - Disconnect calls `rpc.clearConfig` then reloads.
  - (Reuse existing test helpers / mocks for `rpc` and `useGitlabConnect`.)

## Files Touched

- New: `src/shared/composables/useSession.ts`
- New: `src/shared/composables/useSession.test.ts`
- New: `src/shared/components/SessionExpiredOverlay.vue`
- New: `src/shared/components/SessionExpiredOverlay.test.ts`
- Edit: `src/main.ts` (install the watch)
- Edit: `src/App.vue` (mount the overlay)
- Untouched: all of `src/bun`.
