# Settings Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real settings surface (Connection / About / Cache) as a centered modal dialog opened from the macOS app menu (⌘,), and rename the misnamed `/settings` onboarding route to `/connect`.

**Architecture:** A singleton dialog (`SettingsDialog.vue`) mounted once in `App.vue`, driven by a module-level reactive store (`useSettings.ts`) — mirroring the existing `ConfirmDialog` + `useConfirm` pattern. The native app menu dispatches a `lumen:open-settings` window event into the webview via `win.webview.executeJavascript(...)`. Onboarding's connect/probe logic is extracted into a shared `useGitlabConnect` composable consumed by both the renamed `ConnectView` and the dialog's Connection section.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, vue-router (hash history), TanStack Query (`@tanstack/vue-query` + localStorage persister), shadcn-vue / reka-ui components, Electrobun (Bun host + native webview), Vitest + `@vue/test-utils`, Bun tooling.

**Conventions:**
- Run tests: `bun run test -- <path>` (vitest). Typecheck: `bun run typecheck` (vue-tsc). Format: `bun run format`.
- Mock RPC in tests with `vi.mock('@/lib/rpc', () => ({ rpc: { ... } }))` (see `src/composables/useGitlabUrl.test.ts`).
- Composables that use vue-query wrap setup in `withQuery(...)` from `@/test/withQuery`.
- The webview RPC client wrappers live in `src/lib/rpc.ts` (`rpc.getConfig`, `rpc.saveConfig`, `rpc.clearConfig`, `rpc.gitlabGraphql`, ...).
- Toasts: `pushToast({ title, tone })` from `@/composables/useToast` (`tone: 'success' | 'failed' | 'info'`).

---

## File Structure

**New files:**
- `src/composables/useGitlabConnect.ts` — shared connect state + probe (`save(): Promise<boolean>`). Owns url/token/status/message; caller decides the success side-effect.
- `src/composables/useGitlabConnect.test.ts`
- `src/composables/useSettings.ts` — singleton open/close store + `lumen:open-settings` listener.
- `src/composables/useSettings.test.ts`
- `src/components/SettingsDialog.vue` — the dialog UI (Connection / About / Cache).
- `src/components/SettingsDialog.test.ts`
- `src/components/ui/dialog/*` — shadcn-vue dialog primitive (added via CLI).
- `src/env.d.ts` — declares the `__APP_VERSION__` build-time global.

**Renamed:**
- `src/views/SettingsView.vue` → `src/views/ConnectView.vue`

**Modified:**
- `src/router/index.ts` — route `settings`→`connect`, path `/settings`→`/connect`, component.
- `src/router/guard.ts` + `src/router/guard.test.ts` — `'settings'`→`'connect'`.
- `src/lib/persist.ts` — explicit persister key + `clearPersistedCache()`.
- `src/lib/persist.test.ts` — new (clear behaviour).
- `src/App.vue` — mount `<SettingsDialog />`.
- `src/bun/menu.ts` — `SETTINGS_ACTION` + `Settings…` item (⌘,).
- `src/bun/index.ts` — handle `SETTINGS_ACTION` → executeJavascript bridge.
- `package.json` — add `"version"`.
- `vite.config.ts` — `define: { __APP_VERSION__ }`.

---

## Task 1: Extract `useGitlabConnect` composable

Pull the onboarding probe logic out of `SettingsView.vue` into a reusable composable. `save()` performs `saveConfig` + the `currentUser` probe, sets `status`/`message` internally, and resolves `true` on success so the caller decides what happens next (navigate vs. toast). Behaviour of onboarding is unchanged.

**Files:**
- Create: `src/composables/useGitlabConnect.ts`
- Test: `src/composables/useGitlabConnect.test.ts`
- Modify: `src/views/SettingsView.vue` (consume the composable)

- [ ] **Step 1: Write the failing test**

```ts
// src/composables/useGitlabConnect.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfig = vi.fn()
const saveConfig = vi.fn()
const gitlabGraphql = vi.fn()
vi.mock('@/lib/rpc', () => ({
  rpc: {
    getConfig: () => getConfig(),
    saveConfig: (a: unknown) => saveConfig(a),
    gitlabGraphql: (a: unknown) => gitlabGraphql(a),
  },
}))

import { useGitlabConnect } from './useGitlabConnect'

beforeEach(() => {
  getConfig.mockReset()
  saveConfig.mockReset()
  gitlabGraphql.mockReset()
  getConfig.mockResolvedValue({ url: '', configured: false })
})

describe('useGitlabConnect', () => {
  it('saves config and resolves true on a clean probe', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    const c = useGitlabConnect()
    c.url.value = 'https://gitlab.example.com'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(true)
    expect(saveConfig).toHaveBeenCalledWith({
      url: 'https://gitlab.example.com',
      token: 'glpat-x',
    })
    expect(c.status.value).toBe('idle')
  })

  it('surfaces a GraphQL error and resolves false', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [{ message: 'bad token' }] })
    const c = useGitlabConnect()
    c.url.value = 'https://x'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.status.value).toBe('error')
    expect(c.message.value).toBe('bad token')
  })

  it('does not submit without both url and token', async () => {
    const c = useGitlabConnect()
    c.url.value = ''
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(saveConfig).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/composables/useGitlabConnect.test.ts`
Expected: FAIL — cannot find module `./useGitlabConnect`.

- [ ] **Step 3: Write the composable**

```ts
// src/composables/useGitlabConnect.ts
import { computed, ref } from 'vue'
import { rpc } from '@/lib/rpc'

export type ConnectStatus = 'idle' | 'testing' | 'error'

/**
 * Shared GitLab connect state + probe. `save()` persists the config and probes
 * with the cheapest authenticated query; it sets `status`/`message` and resolves
 * true only on a clean 200 with no GraphQL errors. Callers own the success
 * side-effect (onboarding navigates; the settings dialog toasts).
 */
export function useGitlabConnect() {
  const url = ref('')
  const token = ref('')
  const status = ref<ConnectStatus>('idle')
  const message = ref('')

  const testing = computed(() => status.value === 'testing')
  const canSubmit = computed(
    () => !testing.value && url.value.trim().length > 0 && token.value.trim().length > 0,
  )

  /** Prefill the URL from persisted config so re-running connect doesn't retype it. */
  async function loadUrl() {
    const cfg = await rpc.getConfig()
    if (cfg.url) url.value = cfg.url
  }

  async function save(): Promise<boolean> {
    if (!canSubmit.value) return false
    status.value = 'testing'
    message.value = ''
    try {
      await rpc.saveConfig({ url: url.value.trim(), token: token.value.trim() })
      const res = await rpc.gitlabGraphql({ query: '{ currentUser { username } }' })
      if (res.status === 200 && !res.errors?.length) {
        status.value = 'idle'
        return true
      }
      status.value = 'error'
      message.value = res.errors?.[0]?.message ?? `GitLab returned ${res.status}`
      return false
    } catch (e) {
      status.value = 'error'
      message.value = e instanceof Error ? e.message : 'Could not reach GitLab'
      return false
    }
  }

  return { url, token, status, message, testing, canSubmit, loadUrl, save }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/composables/useGitlabConnect.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `SettingsView.vue` to consume the composable**

Replace the `<script setup>` block of `src/views/SettingsView.vue` (lines 1–56) with the version below. The template is unchanged — it already binds `url`, `token`, `testing`, `canSubmit`, `status`, `message`, and `save`.

```ts
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTitle } from '@vueuse/core'
import { PlugZap, KeyRound, Server, LoaderCircle, ArrowRight, TriangleAlert } from '@lucide/vue'
import { useGitlabConnect } from '@/composables/useGitlabConnect'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

useTitle('Connect · lumen')

const router = useRouter()
const { url, token, status, message, testing, canSubmit, loadUrl, save } = useGitlabConnect()

// Prefill the URL from any persisted config so re-running connect (e.g. to swap
// a token) doesn't make you retype the instance address.
onMounted(loadUrl)

// A clean probe earns the handoff to the workspace; anything else stays put as
// an inline, recoverable error (surfaced by the composable's status/message).
async function onSubmit() {
  if (await save()) router.replace({ name: 'projects' })
}
</script>
```

Then in the template, replace the three `save` references with `onSubmit`:
- `<form ... @submit.prevent="save">` → `@submit.prevent="onSubmit"`
- both `@keydown.enter.prevent="save"` → `@keydown.enter.prevent="onSubmit"`

(Leave `:disabled="!canSubmit"` and `:disabled="testing"` as-is.)

- [ ] **Step 6: Run the full suite + typecheck**

Run: `bun run test -- src/views/SettingsView.test.ts src/composables/useGitlabConnect.test.ts`
Expected: PASS. Then `bun run typecheck` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/composables/useGitlabConnect.ts src/composables/useGitlabConnect.test.ts src/views/SettingsView.vue
git commit -m "refactor: extract useGitlabConnect from onboarding view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rename `/settings` onboarding route to `/connect`

The route is misnamed — it's onboarding, not settings. Rename it so "settings" is free for the real dialog.

**Files:**
- Modify: `src/router/guard.ts`
- Modify: `src/router/guard.test.ts`
- Modify: `src/router/index.ts`
- Rename: `src/views/SettingsView.vue` → `src/views/ConnectView.vue`
- Rename: `src/components/SavedViews.test.ts`? No — unrelated. Only the view + its test.
- Rename: `src/views/SettingsView.test.ts` → `src/views/ConnectView.test.ts` (if it exists)

- [ ] **Step 1: Update the guard tests (failing)**

Replace `src/router/guard.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { nextRoute } from './guard'

describe('nextRoute', () => {
  it('always allows the connect route', () => {
    expect(nextRoute('connect', false)).toBe(true)
  })
  it('allows other routes when configured', () => {
    expect(nextRoute('issues', true)).toBe(true)
  })
  it('redirects to connect when unconfigured', () => {
    expect(nextRoute('issues', false)).toEqual({ name: 'connect' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/router/guard.test.ts`
Expected: FAIL — guard still returns/compares `'settings'`.

- [ ] **Step 3: Update the guard**

```ts
// src/router/guard.ts
export function nextRoute(
  toName: string | null | undefined,
  configured: boolean,
): true | { name: string } {
  if (toName === 'connect') return true
  return configured ? true : { name: 'connect' }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/router/guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Rename the view file**

```bash
git mv src/views/SettingsView.vue src/views/ConnectView.vue
# If a colocated test exists:
test -f src/views/SettingsView.test.ts && git mv src/views/SettingsView.test.ts src/views/ConnectView.test.ts || true
```

If `ConnectView.test.ts` exists, update its import from `./SettingsView.vue` to `./ConnectView.vue` and any `'settings'` route-name references to `'connect'`.

- [ ] **Step 6: Update the router**

In `src/router/index.ts`, replace the settings route object:

```ts
    {
      path: '/connect',
      name: 'connect',
      component: () => import('@/views/ConnectView.vue'),
    },
```

And update the guard comment above `router.beforeEach`:

```ts
// Send first-run / unconfigured users to Connect before anything tries to query.
```

- [ ] **Step 7: Grep for stragglers**

Run: `rg -n "SettingsView|name: 'settings'|name=\"settings\"|'/settings'|routerName.*settings" src`
Expected: no matches except the new `SettingsDialog` work (none yet). Fix any onboarding leftovers.

- [ ] **Step 8: Run suite + typecheck**

Run: `bun run test -- src/router/ src/views/` then `bun run typecheck`
Expected: PASS / no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename /settings onboarding route to /connect

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Cache reset — explicit persister key + `clearPersistedCache()`

Give the TanStack persister an explicit localStorage key so the same constant writes and clears it, and export a function the dialog calls to wipe cached data.

**Files:**
- Modify: `src/lib/persist.ts`
- Test: `src/lib/persist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/persist.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PERSIST_KEY, clearPersistedCache } from './persist'

beforeEach(() => localStorage.clear())

describe('clearPersistedCache', () => {
  it('removes the persisted query cache entry', () => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ stale: true }))
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull()
    clearPersistedCache()
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
  })

  it('is a no-op when nothing is stored', () => {
    expect(() => clearPersistedCache()).not.toThrow()
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/lib/persist.test.ts`
Expected: FAIL — `PERSIST_KEY` / `clearPersistedCache` not exported.

- [ ] **Step 3: Implement**

In `src/lib/persist.ts`, add the key constant, pass it to the persister, and export the clear helper:

```ts
/** localStorage key for the TanStack Query persister; shared by write + clear. */
export const PERSIST_KEY = 'lumen:query-cache'

/** Drop the persisted query cache from localStorage (used by Settings → Clear cache). */
export function clearPersistedCache(): void {
  window.localStorage.removeItem(PERSIST_KEY)
}
```

And update the persister creation inside `createPersistedQueryClient`:

```ts
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_KEY,
  })
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/lib/persist.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/persist.ts src/lib/persist.test.ts
git commit -m "feat: explicit query-cache persist key + clearPersistedCache

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: App version plumbing for the About section

Expose the app version to the webview as a build-time constant.

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/env.d.ts`

- [ ] **Step 1: Add a version to `package.json`**

Add a top-level `"version"` field (place it right after `"name"`):

```json
  "version": "0.1.0",
```

- [ ] **Step 2: Define the constant in Vite**

In `vite.config.ts`, import the version and add a `define`. Update the file so the top reads:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import pkg from './package.json' with { type: 'json' }
```

and add `define` to the config object (sibling of `base`, `plugins`, etc.):

```ts
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
```

- [ ] **Step 3: Declare the global type**

```ts
// src/env.d.ts
/** Injected by Vite's `define` (see vite.config.ts) — the package.json version. */
declare const __APP_VERSION__: string
```

- [ ] **Step 4: Verify typecheck + build resolve the constant**

Run: `bun run typecheck`
Expected: no errors (the global is declared).

> Note: `__APP_VERSION__` is only substituted by Vite's bundler, not by Vitest. The About line is verified in Task 7's component test by stubbing it (`vi.stubGlobal('__APP_VERSION__', '9.9.9')`), so no runtime test is needed here.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts src/env.d.ts
git commit -m "build: expose app version as __APP_VERSION__

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `useSettings` store + open mechanism

A module-level singleton store mirroring `useConfirm`: `settingsState.open`, `openSettings()`, `closeSettings()`, plus a `lumen:open-settings` window-event listener registered once.

**Files:**
- Create: `src/composables/useSettings.ts`
- Test: `src/composables/useSettings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/composables/useSettings.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  settingsState,
  openSettings,
  closeSettings,
  registerSettingsShortcut,
  OPEN_SETTINGS_EVENT,
} from './useSettings'

beforeEach(() => {
  settingsState.open = false
})

describe('useSettings', () => {
  it('opens and closes', () => {
    openSettings()
    expect(settingsState.open).toBe(true)
    closeSettings()
    expect(settingsState.open).toBe(false)
  })

  it('opens when the lumen:open-settings event fires after registration', () => {
    const stop = registerSettingsShortcut()
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT))
    expect(settingsState.open).toBe(true)
    stop()
  })

  it('stops listening after the returned cleanup runs', () => {
    const stop = registerSettingsShortcut()
    stop()
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT))
    expect(settingsState.open).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/composables/useSettings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/composables/useSettings.ts
import { reactive } from 'vue'

/** Window event the native menu dispatches into the webview to open settings. */
export const OPEN_SETTINGS_EVENT = 'lumen:open-settings'

// Module-level singleton so the native menu bridge (or any caller) can open the
// one mounted <SettingsDialog/>. Mirrors useConfirm's shared-state approach.
export const settingsState = reactive<{ open: boolean }>({ open: false })

export function openSettings(): void {
  settingsState.open = true
}

export function closeSettings(): void {
  settingsState.open = false
}

/**
 * Listen for the native menu's open-settings event. Call once from the mounted
 * dialog's setup; returns a cleanup to remove the listener on unmount.
 */
export function registerSettingsShortcut(): () => void {
  const onEvent = () => openSettings()
  window.addEventListener(OPEN_SETTINGS_EVENT, onEvent)
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onEvent)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/composables/useSettings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useSettings.ts src/composables/useSettings.test.ts
git commit -m "feat: useSettings singleton store + open-settings event listener

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add the shadcn-vue `dialog` primitive

The repo has `sheet` and `alert-dialog` but no centered modal `dialog`. Add it via the shadcn-vue tooling so it matches project conventions (reka-ui, `new-york` style).

**Files:**
- Create: `src/components/ui/dialog/*`

- [ ] **Step 1: Add the component**

Use the shadcn-vue skill (it's available) to add the `dialog` component, or run the CLI directly:

Run: `bunx shadcn-vue@latest add dialog`
Expected: creates `src/components/ui/dialog/` with `Dialog.vue`, `DialogContent.vue`, `DialogHeader.vue`, `DialogTitle.vue`, `DialogDescription.vue`, `DialogFooter.vue`, and `index.ts` (barrel), matching the `sheet/` structure.

- [ ] **Step 2: Verify the barrel exports**

Run: `cat src/components/ui/dialog/index.ts`
Expected: re-exports `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` (and possibly `DialogClose`). If any used in Task 7 is missing, add the matching `export { default as X } from './X.vue'` line.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dialog
git commit -m "chore: add shadcn-vue dialog primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `SettingsDialog.vue` + mount in `App.vue`

The dialog itself: Connection (swap token / disconnect), About (version + username), Cache (clear). Mounted once in `App.vue` like `ConfirmDialog`.

**Files:**
- Create: `src/components/SettingsDialog.vue`
- Test: `src/components/SettingsDialog.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/SettingsDialog.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const getConfig = vi.fn()
const saveConfig = vi.fn()
const clearConfig = vi.fn()
const gitlabGraphql = vi.fn()
vi.mock('@/lib/rpc', () => ({
  rpc: {
    getConfig: () => getConfig(),
    saveConfig: (a: unknown) => saveConfig(a),
    clearConfig: () => clearConfig(),
    gitlabGraphql: (a: unknown) => gitlabGraphql(a),
  },
}))

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

const clearPersistedCache = vi.fn()
vi.mock('@/lib/persist', () => ({ clearPersistedCache: () => clearPersistedCache() }))

const queryClientClear = vi.fn()
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ clear: queryClientClear }) }))

const pushToast = vi.fn()
vi.mock('@/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))

// confirm() resolves true so the disconnect path proceeds in tests.
vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
}))

import SettingsDialog from './SettingsDialog.vue'
import { settingsState, closeSettings } from '@/composables/useSettings'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__APP_VERSION__', '9.9.9')
  getConfig.mockResolvedValue({ url: 'https://gitlab.example.com', configured: true })
  gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'kyle' } }, errors: [] })
  closeSettings()
})

describe('SettingsDialog', () => {
  it('shows the instance URL, version and username when open', async () => {
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    await nextTick()
    expect(document.body.textContent).toContain('gitlab.example.com')
    expect(document.body.textContent).toContain('9.9.9')
    expect(document.body.textContent).toContain('kyle')
    w.unmount()
  })

  it('clears cache and toasts on Clear cached data', async () => {
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="settings-clear-cache"]')!.click()
    await flushPromises()
    expect(queryClientClear).toHaveBeenCalled()
    expect(clearPersistedCache).toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }))
    w.unmount()
  })

  it('disconnects: clears config + cache and routes to connect', async () => {
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    clearConfig.mockResolvedValue({ ok: true })
    document.querySelector<HTMLElement>('[data-testid="settings-disconnect"]')!.click()
    await flushPromises()
    expect(clearConfig).toHaveBeenCalled()
    expect(clearPersistedCache).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'connect' })
    w.unmount()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/components/SettingsDialog.test.ts`
Expected: FAIL — module `./SettingsDialog.vue` not found.

- [ ] **Step 3: Implement the dialog**

The opening-listener registration lives in `App.vue` (Step 5), not here, so the
dialog stays a pure render of `settingsState`. Create `src/components/SettingsDialog.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { KeyRound, LoaderCircle, Trash2, Unplug, TriangleAlert } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { rpc } from '@/lib/rpc'
import { clearPersistedCache } from '@/lib/persist'
import { useGitlabConnect } from '@/composables/useGitlabConnect'
import { useConfirm } from '@/composables/useConfirm'
import { pushToast } from '@/composables/useToast'
import { settingsState, closeSettings } from '@/composables/useSettings'

const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()

const version = __APP_VERSION__
const username = ref<string | null>(null)

// Reuse onboarding's connect state. `url` holds the saved instance (read-only in
// this surface); `token` is the swap input; `save()` re-probes and returns ok.
const { url, token, status, message, testing, save } = useGitlabConnect()

// Refresh the read-only fields whenever the dialog opens, in case the instance
// or identity changed since last time.
async function hydrate() {
  const cfg = await rpc.getConfig()
  url.value = cfg.url ?? ''
  token.value = ''
  try {
    const res = await rpc.gitlabGraphql({ query: '{ currentUser { username } }' })
    const u = (res.data as { currentUser?: { username?: string } } | undefined)?.currentUser
      ?.username
    username.value = u ?? null
  } catch {
    username.value = null
  }
}

function onOpenChange(open: boolean) {
  if (open) void hydrate()
  else closeSettings()
}

async function swapToken() {
  if (await save()) {
    token.value = ''
    pushToast({ title: 'Token updated', tone: 'success' })
  }
}

const clearing = ref(false)
async function clearCache() {
  clearing.value = true
  try {
    queryClient.clear()
    clearPersistedCache()
    pushToast({ title: 'Cache cleared', tone: 'success' })
  } finally {
    clearing.value = false
  }
}

async function disconnect() {
  const ok = await confirm({
    title: 'Disconnect from GitLab?',
    description: 'Your token is removed from this machine and cached data is cleared.',
    confirmLabel: 'Disconnect',
    cancelLabel: 'Cancel',
  })
  if (!ok) return
  try {
    await rpc.clearConfig()
    queryClient.clear()
    clearPersistedCache()
    closeSettings()
    router.replace({ name: 'connect' })
  } catch (e) {
    pushToast({
      title: 'Could not disconnect',
      description: e instanceof Error ? e.message : undefined,
      tone: 'failed',
    })
  }
}
</script>

<template>
  <Dialog :open="settingsState.open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription class="sr-only">
          Manage your GitLab connection, view app info, and clear cached data.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-6">
        <!-- Connection -->
        <section class="space-y-3">
          <p class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Connection
          </p>
          <p class="font-mono text-sm text-foreground/90">{{ url || '—' }}</p>

          <div class="space-y-2">
            <Label
              for="settings-token"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <KeyRound class="size-3.5 text-muted-foreground/70" />
              Swap token
            </Label>
            <div class="flex gap-2">
              <Input
                id="settings-token"
                v-model="token"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="glpat-…"
                :disabled="testing"
                class="h-9 font-mono text-sm"
                @keydown.enter.prevent="swapToken"
              />
              <Button
                data-testid="settings-swap-token"
                :disabled="testing || token.trim().length === 0"
                @click="swapToken"
              >
                <LoaderCircle v-if="testing" class="size-4 animate-spin" />
                <span v-else>Save</span>
              </Button>
            </div>
            <div
              v-if="status === 'error'"
              class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
              role="alert"
            >
              <TriangleAlert class="mt-px size-4 shrink-0 text-destructive" :stroke-width="2" />
              <p class="text-sm leading-relaxed text-foreground/90">{{ message }}</p>
            </div>
          </div>

          <Button
            data-testid="settings-disconnect"
            variant="ghost"
            class="text-destructive hover:text-destructive"
            @click="disconnect"
          >
            <Unplug class="size-4" />
            Disconnect
          </Button>
        </section>

        <!-- About -->
        <section class="space-y-1">
          <p class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            About
          </p>
          <p class="text-sm text-muted-foreground">
            lumen v{{ version }}
            <span v-if="username"> · @{{ username }}</span>
          </p>
        </section>

        <!-- Cache -->
        <section class="space-y-2">
          <p class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Cache
          </p>
          <Button
            data-testid="settings-clear-cache"
            variant="outline"
            :disabled="clearing"
            @click="clearCache"
          >
            <Trash2 class="size-4" />
            Clear cached data
          </Button>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 4: Run the component test**

Run: `bun run test -- src/components/SettingsDialog.test.ts`
Expected: PASS (3 tests). If reka-ui's `Dialog` teleports content such that `document.body.textContent` misses it, ensure `attachTo: document.body` (already set) and that the test queries `document` (it does).

- [ ] **Step 5: Mount in `App.vue` and register the open listener**

Replace `src/App.vue` with:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import ToastHost from '@/components/ToastHost.vue'
import { registerSettingsShortcut } from '@/composables/useSettings'

// The native app menu (⌘,) dispatches lumen:open-settings into the webview;
// listen for it app-wide so the single mounted dialog opens from anywhere.
let stop: (() => void) | null = null
onMounted(() => {
  stop = registerSettingsShortcut()
})
onUnmounted(() => stop?.())
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-background text-foreground">
    <!-- Key on path (not fullPath) so route/param changes remount the view —
         keeping composables that capture route params at setup from going
         stale — while query-only changes (e.g. the ?issue drawer) overlay the
         list without remounting or refetching it. -->
    <main class="mx-auto max-w-5xl px-4 py-6">
      <RouterView :key="$route.path" />
    </main>
  </div>
  <!-- Single shared instances for the whole app -->
  <ConfirmDialog />
  <SettingsDialog />
  <ToastHost />
</template>
```

- [ ] **Step 6: Full suite + typecheck**

Run: `bun run test` then `bun run typecheck`
Expected: all PASS / no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsDialog.vue src/components/SettingsDialog.test.ts src/App.vue
git commit -m "feat: settings dialog (connection, about, cache)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Native menu entry + host→webview bridge

Add the `Settings…` menu item with the standard ⌘, accelerator, and bridge its action into the webview via `executeJavascript`.

**Files:**
- Modify: `src/bun/menu.ts`
- Modify: `src/bun/index.ts`

> This is Bun-host / native wiring; there is no unit-test harness for `src/bun/` in this repo. Verify by typecheck + a manual run (`bun run app:dev`).

- [ ] **Step 1: Export the action + add the menu item**

In `src/bun/menu.ts`, add the action constant next to `DEVTOOLS_ACTION`:

```ts
// Action id for the "Settings…" menu item; handled in index.ts by dispatching a
// window event into the webview (see SETTINGS_ACTION handler).
export const SETTINGS_ACTION = 'open-settings'
```

Then add a Settings item to the **app (first) submenu**, immediately after `{ role: 'about' }`, so it sits in the conventional macOS Preferences slot:

```ts
      submenu: [
        { role: 'about' },
        sep,
        {
          label: 'Settings…',
          action: SETTINGS_ACTION,
          accelerator: 'CommandOrControl+,',
        },
        sep,
        { role: 'hide', accelerator: 'CommandOrControl+H' },
        { role: 'hideOthers', accelerator: 'Alt+CommandOrControl+H' },
        { role: 'showAll' },
        sep,
        { role: 'quit', accelerator: 'CommandOrControl+Q' },
      ],
```

- [ ] **Step 2: Handle the action in `index.ts`**

In `src/bun/index.ts`, update the menu import and the click handler. Change the import:

```ts
import { buildAppMenu, DEVTOOLS_ACTION, SETTINGS_ACTION } from './menu'
```

and extend the existing `application-menu-clicked` handler:

```ts
ApplicationMenu.on('application-menu-clicked', (event) => {
  const action = (event as { data?: { action?: string } })?.data?.action
  if (action === DEVTOOLS_ACTION) {
    win.webview.toggleDevTools()
  } else if (action === SETTINGS_ACTION) {
    // Bridge host → webview: dispatch the event useSettings listens for.
    win.webview.executeJavascript(
      "window.dispatchEvent(new CustomEvent('lumen:open-settings'))",
    )
  }
})
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no errors (`SETTINGS_ACTION` exported and imported; `executeJavascript` exists on `win.webview` — see `node_modules/electrobun/dist/api/bun/core/BrowserView.ts:218`).

- [ ] **Step 4: Manual verification**

Run: `bun run app:dev`
Then in the running app:
1. Press **⌘,** (or App menu → Settings…). The Settings dialog opens.
2. Connection shows the instance URL; About shows `lumen v0.1.0 · @<you>`.
3. **Clear cached data** → toast "Cache cleared".
4. **Swap token** with the current PAT → toast "Token updated".
5. **Disconnect** → confirm → lands on the `/connect` screen.

- [ ] **Step 5: Commit**

```bash
git add src/bun/menu.ts src/bun/index.ts
git commit -m "feat: Settings… menu item (cmd-,) bridged to the webview dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the whole suite:** `bun run test` → all PASS.
- [ ] **Typecheck:** `bun run typecheck` → no errors.
- [ ] **Format:** `bun run format`.
- [ ] **Grep for leftover onboarding misnomers:** `rg -n "name: 'settings'|'/settings'|SettingsView" src` → no matches.
- [ ] **Manual smoke (`bun run app:dev`):** open via ⌘,, swap token, clear cache, disconnect → `/connect`.
