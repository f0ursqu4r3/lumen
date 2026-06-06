# Session-Expiry Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a GitLab token goes bad mid-session, detect it globally and block the screen with a re-connect surface that, on a valid token, reloads the app back into a working state.

**Architecture:** A module-singleton flag (`sessionState.expired`) is flipped by a watcher subscribed to the vue-query query + mutation caches whenever an errored entry carries `kind: 'auth'`. A single `SessionExpiredOverlay`, mounted in `App.vue`, renders on that flag, reuses `useGitlabConnect` for the token field, and calls `window.location.reload()` on a successful re-probe. The recovery probe runs directly through `rpc` (not vue-query), so it never re-triggers the watcher. No changes to `src/bun` — the host reads the token fresh from disk every request and is stateless.

**Tech Stack:** Vue 3 `<script setup>`, TanStack Vue Query v5, Electrobun RPC, Vitest + @vue/test-utils + jsdom.

**Test command (this repo):** `bunx vitest run <path>` — NOT `bun test` and NOT `bun run test` (watch mode).

---

## File Structure

- **Create** `src/shared/composables/useSession.ts` — shared `sessionState` flag, `isAuthError` guard, `markSessionExpired`, and `installAuthWatch(queryClient)`.
- **Create** `src/shared/composables/useSession.test.ts` — unit tests for the guard and the watcher.
- **Create** `src/shared/components/SessionExpiredOverlay.vue` — full-screen, non-dismissable recovery overlay.
- **Create** `src/shared/components/SessionExpiredOverlay.test.ts` — overlay render/reconnect/disconnect tests.
- **Modify** `src/main.ts` — call `installAuthWatch(queryClient)` in `boot()`.
- **Modify** `src/App.vue` — mount `<SessionExpiredOverlay />`.

Reference patterns to follow:
- Shared module-singleton state: `src/shared/composables/useSettings.ts` + `useSettings.test.ts`.
- Connect state reuse + rpc-mocked component test: `src/views/ConnectView.vue`, `src/shared/components/SettingsDialog.vue` + `SettingsDialog.test.ts`.
- Error shape thrown by queries: `src/gitlab/errors.ts` (`GitLabError{ kind, message }`).

---

## Task 1: Session state, auth-error guard, and `markSessionExpired`

**Files:**
- Create: `src/shared/composables/useSession.ts`
- Test: `src/shared/composables/useSession.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/composables/useSession.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { sessionState, isAuthError, markSessionExpired } from './useSession'

beforeEach(() => {
  sessionState.expired = false
})

describe('isAuthError', () => {
  it('is true for a GitLabError with kind "auth"', () => {
    expect(isAuthError({ kind: 'auth', message: 'nope' })).toBe(true)
  })

  it('is false for other GitLabError kinds', () => {
    expect(isAuthError({ kind: 'network', message: 'x' })).toBe(false)
    expect(isAuthError({ kind: 'graphql', message: 'x' })).toBe(false)
    expect(isAuthError({ kind: 'unknown', message: 'x' })).toBe(false)
  })

  it('is false for null and non-objects', () => {
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
    expect(isAuthError('auth')).toBe(false)
    expect(isAuthError(401)).toBe(false)
  })
})

describe('markSessionExpired', () => {
  it('flips sessionState.expired and is idempotent', () => {
    expect(sessionState.expired).toBe(false)
    markSessionExpired()
    expect(sessionState.expired).toBe(true)
    markSessionExpired()
    expect(sessionState.expired).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`
Expected: FAIL — `Failed to resolve import "./useSession"` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/shared/composables/useSession.ts`:

```ts
import { reactive } from 'vue'

// Shared singleton flag, flipped true when an app data query/mutation fails
// authentication (token expired/revoked/insufficient scope). The mounted
// <SessionExpiredOverlay/> watches this to block the screen and offer
// re-connect. Mirrors useSettings' module-level reactive-state pattern.
export const sessionState = reactive<{ expired: boolean }>({ expired: false })

/**
 * True when `err` is the shape `normalizeError` throws for an auth failure: a
 * GitLabError with kind === 'auth' (covers both 401 and 403). See
 * src/gitlab/errors.ts.
 */
export function isAuthError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'auth'
  )
}

/** Flip the session into the expired state (idempotent). */
export function markSessionExpired(): void {
  sessionState.expired = true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/composables/useSession.ts src/shared/composables/useSession.test.ts
git commit -m "feat(session): add sessionState flag + isAuthError guard"
```

---

## Task 2: `installAuthWatch` — flip the flag from query + mutation cache errors

**Files:**
- Modify: `src/shared/composables/useSession.ts`
- Test: `src/shared/composables/useSession.test.ts:1` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `src/shared/composables/useSession.test.ts` (add `installAuthWatch` to the existing import from `./useSession`, and add the `QueryClient, MutationObserver` import at the top):

```ts
import { QueryClient, MutationObserver } from '@tanstack/vue-query'

describe('installAuthWatch', () => {
  it('flips expired when a query fails with an auth error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
      })
      .catch(() => {})
    expect(sessionState.expired).toBe(true)
    stop()
  })

  it('does NOT flip on a non-auth query error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'network', message: 'down' }),
      })
      .catch(() => {})
    expect(sessionState.expired).toBe(false)
    stop()
  })

  it('flips expired when a mutation fails with an auth error', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const stop = installAuthWatch(qc)
    const observer = new MutationObserver(qc, {
      mutationFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
    })
    await observer.mutate().catch(() => {})
    expect(sessionState.expired).toBe(true)
    stop()
  })

  it('stops flipping after the returned cleanup runs', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    stop()
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
      })
      .catch(() => {})
    expect(sessionState.expired).toBe(false)
    stop()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`
Expected: FAIL — `installAuthWatch is not a function` (or import undefined).

- [ ] **Step 3: Write the minimal implementation**

Append to `src/shared/composables/useSession.ts` (add the `QueryClient` type import at the top):

```ts
import type { QueryClient } from '@tanstack/vue-query'
```

```ts
/**
 * Watch the query + mutation caches for auth failures and flip sessionState
 * when one appears. Recovery probes run directly through `rpc` (not vue-query),
 * so the overlay's own re-probe never reaches these caches — no re-trigger
 * loop. Returns a single unsubscribe that detaches both subscriptions.
 */
export function installAuthWatch(queryClient: QueryClient): () => void {
  const offQuery = queryClient.getQueryCache().subscribe((event) => {
    if (isAuthError(event.query.state.error)) markSessionExpired()
  })
  const offMutation = queryClient.getMutationCache().subscribe((event) => {
    if (isAuthError(event.mutation?.state.error)) markSessionExpired()
  })
  return () => {
    offQuery()
    offMutation()
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/shared/composables/useSession.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/composables/useSession.ts src/shared/composables/useSession.test.ts
git commit -m "feat(session): watch query+mutation caches for auth failures"
```

---

## Task 3: `SessionExpiredOverlay` component

**Files:**
- Create: `src/shared/components/SessionExpiredOverlay.vue`
- Test: `src/shared/components/SessionExpiredOverlay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/components/SessionExpiredOverlay.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getConfig = vi.fn()
const saveConfig = vi.fn()
const clearConfig = vi.fn()
const gitlabGraphql = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getConfig: () => getConfig(),
    saveConfig: (a: unknown) => saveConfig(a),
    clearConfig: () => clearConfig(),
    gitlabGraphql: (a: unknown) => gitlabGraphql(a),
  },
}))

import SessionExpiredOverlay from './SessionExpiredOverlay.vue'
import { sessionState } from '@/shared/composables/useSession'

const reload = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.expired = false
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
  getConfig.mockResolvedValue({ url: 'https://gitlab.example.com', configured: true })
})

describe('SessionExpiredOverlay', () => {
  it('renders nothing while the session is valid', () => {
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    expect(document.querySelector('[data-testid="session-reconnect"]')).toBeNull()
    w.unmount()
  })

  it('blocks the screen and prefills the instance URL when expired', async () => {
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    expect(document.querySelector('[data-testid="session-reconnect"]')).not.toBeNull()
    expect(document.body.textContent).toContain('gitlab.example.com')
    w.unmount()
  })

  it('reloads the app after a successful reconnect', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'kyle' } }, errors: [] })
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#session-token')!
    input.value = 'glpat-new'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="session-reconnect"]')!.click()
    await flushPromises()
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://gitlab.example.com', token: 'glpat-new' }),
    )
    expect(reload).toHaveBeenCalled()
    w.unmount()
  })

  it('shows an error and does not reload on a failed reconnect', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 401, errors: [{ message: 'Unauthorized' }] })
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#session-token')!
    input.value = 'glpat-bad'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="session-reconnect"]')!.click()
    await flushPromises()
    expect(reload).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Unauthorized')
    w.unmount()
  })

  it('clears config and reloads on Disconnect', async () => {
    clearConfig.mockResolvedValue({ ok: true })
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="session-disconnect"]')!.click()
    await flushPromises()
    expect(clearConfig).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
    w.unmount()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/components/SessionExpiredOverlay.test.ts`
Expected: FAIL — `Failed to resolve import "./SessionExpiredOverlay.vue"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/shared/components/SessionExpiredOverlay.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { KeyRound, LoaderCircle, ShieldAlert, TriangleAlert, Unplug } from '@lucide/vue'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { sessionState } from '@/shared/composables/useSession'
import { useGitlabConnect } from '@/shared/composables/useGitlabConnect'

// Reuse onboarding's connect state: `url` is the saved instance (shown
// read-only), `token` is the new token, `save()` re-probes and returns ok.
const { url, token, status, message, testing, canSubmit, loadUrl, save } = useGitlabConnect()

// Prefill the instance URL so the user only re-enters the token.
onMounted(loadUrl)

// A clean re-probe earns a full reload — the bulletproof "restart": a clean
// boot re-probes and refetches every stuck query under the valid token. The
// host holds no token state, so nothing server-side needs restarting.
async function reconnect() {
  if (await save()) window.location.reload()
}

// Escape hatch: drop the token and reload. The router guard sends the now
// unconfigured app to ConnectView.
async function disconnect() {
  await rpc.clearConfig()
  window.location.reload()
}
</script>

<template>
  <!-- Full-screen, non-dismissable: no click-away or ESC. The only exits are a
       successful reconnect or an explicit disconnect — both reload the app. -->
  <div
    v-if="sessionState.expired"
    class="fixed inset-0 z-[100] grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="session-expired-title"
  >
    <div class="w-full max-w-md animate-row-in">
      <div class="mb-7 flex flex-col items-center text-center">
        <div
          class="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-pop"
          :class="testing && 'lamp-busy'"
        >
          <ShieldAlert class="size-5.5 text-primary" :stroke-width="2" />
        </div>
        <p
          class="eyebrow-tick mt-5 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          Session expired
        </p>
        <h1
          id="session-expired-title"
          class="mt-2 text-title leading-none font-semibold text-foreground"
        >
          Re-connect to GitLab
        </h1>
        <p class="mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Your access token is no longer valid. Enter a new one to pick up where you left off.
        </p>
      </div>

      <Card class="gap-0 p-0 shadow-pop">
        <form class="flex flex-col gap-5 p-6" @submit.prevent="reconnect">
          <p class="font-mono text-sm text-foreground/90">{{ url || '—' }}</p>

          <div class="space-y-2">
            <Label
              for="session-token"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <KeyRound class="size-3.5 text-muted-foreground/70" />
              New token
            </Label>
            <Input
              id="session-token"
              v-model="token"
              type="password"
              autocomplete="off"
              spellcheck="false"
              placeholder="glpat-…"
              :disabled="testing"
              class="h-10 font-mono text-base"
              @keydown.enter.prevent="reconnect"
            />
            <p class="text-xs leading-relaxed text-muted-foreground/70">
              Needs the
              <code class="rounded bg-muted/60 px-1 py-0.5 font-mono text-2xs text-foreground/90">
                api
              </code>
              scope.
            </p>
          </div>

          <div
            v-if="status === 'error'"
            class="flex animate-status items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
            role="alert"
          >
            <TriangleAlert class="mt-px size-4 shrink-0 text-destructive" :stroke-width="2" />
            <p class="text-sm leading-relaxed text-foreground/90">{{ message }}</p>
          </div>

          <Button
            type="submit"
            size="lg"
            class="mt-0.5 w-full"
            :disabled="!canSubmit"
            data-testid="session-reconnect"
          >
            <LoaderCircle v-if="testing" class="size-4 animate-spin" />
            <KeyRound v-else class="size-4" />
            {{ testing ? 'Reconnecting…' : 'Reconnect' }}
          </Button>

          <Button
            type="button"
            variant="ghost"
            class="w-full text-muted-foreground hover:text-foreground"
            data-testid="session-disconnect"
            @click="disconnect"
          >
            <Unplug class="size-4" />
            Disconnect
          </Button>
        </form>
      </Card>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/shared/components/SessionExpiredOverlay.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/SessionExpiredOverlay.vue src/shared/components/SessionExpiredOverlay.test.ts
git commit -m "feat(session): add SessionExpiredOverlay recovery surface"
```

---

## Task 4: Wire the watcher and overlay into the app

**Files:**
- Modify: `src/main.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Install the watcher in `boot()`**

In `src/main.ts`, add the import near the other `@/shared` imports:

```ts
import { installAuthWatch } from '@/shared/composables/useSession'
```

Then, inside `boot()`, immediately after `const queryClient = createPersistedQueryClient(url)` and before the `createApp(...)` line, add:

```ts
  // App-lifetime watch: any auth failure from a data query/mutation flips
  // sessionState.expired, which the mounted overlay turns into a re-connect
  // prompt. Never torn down — lives as long as the webview.
  installAuthWatch(queryClient)
```

- [ ] **Step 2: Mount the overlay in `App.vue`**

In `src/App.vue`, add the import alongside the other component imports:

```ts
import SessionExpiredOverlay from '@/shared/components/SessionExpiredOverlay.vue'
```

Then add `<SessionExpiredOverlay />` to the single-shared-instances block so it reads:

```html
  <!-- Single shared instances for the whole app -->
  <ConfirmDialog />
  <SettingsDialog />
  <ToastHost />
  <SessionExpiredOverlay />
```

- [ ] **Step 3: Typecheck the wiring**

Run: `bun run typecheck`
Expected: PASS — no type errors. (If `src/gitlab/generated` is missing and unrelated generated-type errors appear, that is the known codegen gap; the new files must not contribute errors.)

- [ ] **Step 4: Run the related suites**

Run: `bunx vitest run src/App.test.ts src/shared/composables/useSession.test.ts src/shared/components/SessionExpiredOverlay.test.ts`
Expected: PASS — existing `App.test.ts` still green with the overlay mounted.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/App.vue
git commit -m "feat(session): wire auth watch + mount recovery overlay"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bunx vitest run`
Expected: PASS — entire suite green, including the three new/updated session files.

- [ ] **Step 2: Typecheck the whole project**

Run: `bun run typecheck`
Expected: PASS (modulo the known `src/gitlab/generated` codegen gap, which is unrelated to this change).

- [ ] **Step 3: Format**

Run: `bun run format`
Expected: Prettier rewrites/cleans the new files with no manual edits needed.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "style(session): prettier pass" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage:** `useSession.ts` (state + guard + watch) → Tasks 1–2; `SessionExpiredOverlay.vue` → Task 3; `main.ts` + `App.vue` wiring → Task 4; tests for both files → Tasks 1–3; full verification → Task 5. The "no `src/bun` changes" non-goal holds — no task touches the host.
- **No-loop guarantee:** the overlay calls `useGitlabConnect.save()`, which hits `rpc` directly (not vue-query), so a 401 during re-probe never reaches the watched caches. Asserted structurally; covered by the "failed reconnect does not reload" test.
- **Type consistency:** `isAuthError`, `markSessionExpired`, `installAuthWatch`, `sessionState` names are identical across the implementation, tests, and wiring. `data-testid` values (`session-reconnect`, `session-disconnect`) and the `#session-token` id match between the component and its test.
- **Edge cases from the spec:** 403 is covered (same `kind: 'auth'`); multiple simultaneous errors are idempotent (`markSessionExpired` sets a boolean); per-window behavior needs no code (each webview mounts its own overlay).
