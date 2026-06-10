# Settings Window — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-column settings modal with a dedicated native two-pane **settings window**, and make the MCP server fully controllable from its **Agent access** pane — shipping a real, usable settings surface.

**Architecture:** A new `BrowserWindow` (singleton, mirroring the issue-window machinery) loads the SPA at a `/settings` route marked `?window=1` (so the main shell chrome is hidden). `SettingsWindow.vue` is a two-pane shell — sidebar nav + active pane. Plan 1 ships four panes (Connection, Agent access [MCP], Data & cache, About). Panes talk to the Bun process over the existing RPC contract, extended with `openSettingsWindow` and MCP status/control methods. The old `SettingsDialog.vue` modal is retired.

**Tech Stack:** Electrobun (Bun main + Vue 3 webview), vue-router (hash history), reka-ui, Tailwind, Vitest + @vue/test-utils.

**Scope:** Plan 1 = window + plumbing + Connection/MCP/Data/About panes + retire modal. **Plan 2** (separate) = Appearance, Shortcuts, Notifications panes + their backing (config `appearance`/`notifications`, accent-token refactor, `usePipelineNotifications` prefs threading). Config schema is NOT extended in Plan 1.

**Verified facts (don't re-derive):**
- Secondary windows do NOT carry the route in the URL fragment. The window loads the bare app URL; the route string is passed to `buildRpc(initialRoute)` and the webview applies it at boot via `rpc.getInitialRoute()` (see `src/main.ts:20`, `src/bun/issueWindow.ts`).
- `?window=1` marks a native-windowed view; `src/App.vue:27` computes `windowed` from it to hide the main shell.
- The route guard (`src/router/guard.ts`) redirects unconfigured users to `connect`; `settings` must be allow-listed so the window can open.
- MCP lifecycle (`src/bun/mcp/server.ts`) already exports `startMcp`, `stopMcp`, `isRunning`, `setMcpEnabled`, `generateToken` (in `auth.ts`), `DEFAULT_MCP_PORT`. `Bun.serve` is reached via `globalThis.Bun`, so lifecycle tests stub it.

---

## File Structure

```
src/bun/
  settingsWindow.ts        # NEW: settingsWindowRoute()
  settingsWindow.test.ts   # NEW
  index.ts                 # MODIFY: openSettingsWindow() singleton + RPC handler + menu rewire + clearConfig stops MCP
  mcp/server.ts            # MODIFY: getMcpStatus(), regenerateMcpToken(), revealMcpToken(); setMcpEnabled auto-generates token
  mcp/server.test.ts       # MODIFY: cover the above
src/router/
  guard.ts                 # MODIFY: allow 'settings'
  guard.test.ts            # MODIFY
  index.ts                 # MODIFY: add settings route
src/shared/lib/rpcContract.ts   # MODIFY: openSettingsWindow + MCP status/control methods + McpStatus type
src/features/settings/
  useSettingsNav.ts        # NEW: pane registry + selected-pane state
  useSettingsNav.test.ts   # NEW
  panes/ConnectionPane.vue # NEW (migrated)
  panes/AgentAccessPane.vue# NEW (MCP)
  panes/DataCachePane.vue  # NEW (migrated)
  panes/AboutPane.vue      # NEW (migrated)
  panes/*.test.ts          # NEW
src/views/SettingsWindow.vue      # NEW: two-pane shell
src/views/SettingsWindow.test.ts  # NEW
src/App.vue                # MODIFY: drop <SettingsDialog/> + registerSettingsShortcut
src/shared/components/SettingsDialog.vue       # DELETE
src/shared/components/SettingsDialog.test.ts   # DELETE
src/shared/composables/useSettings.ts          # DELETE (no remaining consumers after retire)
```

---

## Task 1: Settings-window route helper + guard allow-list

**Files:**
- Create: `src/bun/settingsWindow.ts`, `src/bun/settingsWindow.test.ts`
- Modify: `src/router/guard.ts`, `src/router/guard.test.ts`

- [ ] **Step 1: Write the failing route-helper test** — `src/bun/settingsWindow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { settingsWindowRoute } from './settingsWindow'

describe('settingsWindowRoute', () => {
  it('returns the settings route marked as a native window', () => {
    expect(settingsWindowRoute()).toBe('/settings?window=1')
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `bunx vitest run src/bun/settingsWindow.test.ts`

- [ ] **Step 3: Implement** — `src/bun/settingsWindow.ts`:

```typescript
// The hash route the native settings window navigates to. Like the issue
// popouts, the route is applied client-side at boot (handed over via
// rpc.getInitialRoute), not baked into the window URL. ?window=1 marks it a
// focused native window so the main shell chrome is hidden (see src/App.vue).
export function settingsWindowRoute(): string {
  return '/settings?window=1'
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run src/bun/settingsWindow.test.ts`

- [ ] **Step 5: Add the failing guard test** — append inside the existing `describe('nextRoute', …)` in `src/router/guard.test.ts`:

```typescript
  it('allows the settings route regardless of configured state', () => {
    expect(nextRoute('settings', false)).toBe(true)
    expect(nextRoute('settings', true)).toBe(true)
  })
```

- [ ] **Step 6: Run — expect FAIL** (`nextRoute('settings', false)` currently returns `{ name: 'connect' }`)

Run: `bunx vitest run src/router/guard.test.ts`

- [ ] **Step 7: Implement guard change** — in `src/router/guard.ts`, change the first line of `nextRoute`'s body:

```typescript
export function nextRoute(
  toName: string | null | undefined,
  configured: boolean,
): true | { name: string } {
  // 'connect' and 'settings' are always reachable — settings hosts the
  // Connection pane, so it must open even when not yet configured.
  if (toName === 'connect' || toName === 'settings') return true
  return configured ? true : { name: 'connect' }
}
```

- [ ] **Step 8: Run — expect PASS**

Run: `bunx vitest run src/router/guard.test.ts`

- [ ] **Step 9: Commit**

```bash
bun run format
git add src/bun/settingsWindow.ts src/bun/settingsWindow.test.ts src/router/guard.ts src/router/guard.test.ts
git commit -m "feat(settings): settings-window route helper + guard allow-list"
```

---

## Task 2: MCP status & token control (Bun)

**Files:**
- Modify: `src/bun/mcp/server.ts`, `src/bun/mcp/server.test.ts`

Adds the functions the Agent access pane needs. `setMcpEnabled` already exists; extend it to auto-generate a token when enabling without one.

- [ ] **Step 1: Write the failing tests** — add to `src/bun/mcp/server.test.ts` (it already mocks `../config` with `loadConfig`/`saveMcpConfig` and stubs `globalThis.Bun`):

```typescript
import { getMcpStatus, regenerateMcpToken, revealMcpToken } from './server'

describe('mcp status & token control', () => {
  it('getMcpStatus reflects config + running state', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'tok' } })
    const s = getMcpStatus()
    expect(s).toEqual({ enabled: true, port: 7437, running: false, hasToken: true })
  })

  it('getMcpStatus defaults when no mcp block', () => {
    loadConfig.mockReturnValue({ mcp: null })
    expect(getMcpStatus()).toEqual({ enabled: false, port: 7437, running: false, hasToken: false })
  })

  it('setMcpEnabled generates a token when enabling without one', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: false, port: 7437, token: null } })
    const r = setMcpEnabled({ enabled: true, port: 7437 })
    expect(r.ok).toBe(true)
    // saveMcpConfig was called with a freshly generated token
    const saved = saveMcpConfig.mock.calls.at(-1)![0]
    expect(saved.enabled).toBe(true)
    expect(saved.token).toMatch(/^lmcp_/)
  })

  it('regenerateMcpToken rotates the token, persists, and returns it', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'old' } })
    const { token } = regenerateMcpToken()
    expect(token).toMatch(/^lmcp_/)
    expect(token).not.toBe('old')
    expect(saveMcpConfig.mock.calls.at(-1)![0].token).toBe(token)
  })

  it('revealMcpToken returns the current token (or null)', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'tok' } })
    expect(revealMcpToken()).toEqual({ token: 'tok' })
    loadConfig.mockReturnValue({ mcp: null })
    expect(revealMcpToken()).toEqual({ token: null })
  })
})
```

NOTE: `setMcpEnabled`'s signature in the existing code is `setMcpEnabled(enabled, port, token)`. This task changes its public shape to `setMcpEnabled({ enabled, port })` (token managed internally). Update the existing lifecycle test's `setMcpEnabled` call sites if any reference the old positional form (search the test file; the Task 6 lifecycle tests from the MCP plan call `startMcp`/`stopMcp`/`startMcpIfEnabled`, not `setMcpEnabled`, so likely none).

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/bun/mcp/server.test.ts`

- [ ] **Step 3: Implement** — in `src/bun/mcp/server.ts`:

Add the import for token generation at the top (alongside the existing imports):

```typescript
import { isAuthorized, generateToken } from './auth'
```
(The file currently imports only `isAuthorized` from `./auth` — add `generateToken`.)

Add these exports (place after `startMcpIfEnabled`):

```typescript
export interface McpStatus {
  enabled: boolean
  port: number
  running: boolean
  hasToken: boolean
}

/** Current MCP state for the Settings pane. Never includes the token itself. */
export function getMcpStatus(): McpStatus {
  const { mcp } = loadConfig()
  return {
    enabled: mcp?.enabled ?? false,
    port: mcp?.port ?? DEFAULT_MCP_PORT,
    running: isRunning(),
    hasToken: Boolean(mcp?.token),
  }
}

/** Return the current bearer token (explicit reveal/copy action), or null. */
export function revealMcpToken(): { token: string | null } {
  return { token: loadConfig().mcp?.token ?? null }
}

/** Rotate the token: persist a new one, restart if running, return it once. */
export function regenerateMcpToken(): { token: string } {
  const { mcp } = loadConfig()
  const port = mcp?.port ?? DEFAULT_MCP_PORT
  const enabled = mcp?.enabled ?? false
  const token = generateToken()
  saveMcpConfig({ enabled, port, token })
  stopMcp()
  if (enabled) startMcp(port, token)
  return { token }
}
```

Replace the existing `setMcpEnabled` with the object-arg form that manages the token:

```typescript
/**
 * Toggle the server from Settings: persists enabled/port, generates a token on
 * first enable, and (re)starts or stops. Token is never required from the caller.
 */
export function setMcpEnabled(a: { enabled: boolean; port: number }): { ok: true } | { ok: false; error: string } {
  const current = loadConfig().mcp
  const token = current?.token ?? (a.enabled ? generateToken() : null)
  saveMcpConfig({ enabled: a.enabled, port: a.port, token })
  stopMcp()
  if (a.enabled && token) return startMcp(a.port, token)
  return { ok: true }
}
```

- [ ] **Step 4: Run — expect PASS** (and the existing lifecycle tests still pass)

Run: `bunx vitest run src/bun/mcp/server.test.ts`

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/server.ts src/bun/mcp/server.test.ts
git commit -m "feat(mcp): status + token reveal/regenerate; setMcpEnabled manages token"
```

---

## Task 3: RPC contract + handlers (window + MCP control)

**Files:**
- Modify: `src/shared/lib/rpcContract.ts`, `src/bun/index.ts`

- [ ] **Step 1: Extend the contract** — in `src/shared/lib/rpcContract.ts`, add a status type near `ConfigStatus`:

```typescript
export interface McpStatus {
  enabled: boolean
  port: number
  running: boolean
  hasToken: boolean
}
```

And add these methods to the `LumenRequests` interface (after `openIssuesWindow`):

```typescript
  openSettingsWindow: () => Promise<{ ok: boolean }>
  getMcpStatus: () => Promise<McpStatus>
  setMcpEnabled: (a: { enabled: boolean; port: number }) => Promise<{ ok: true } | { ok: false; error: string }>
  regenerateMcpToken: () => Promise<{ token: string }>
  revealMcpToken: () => Promise<{ token: string | null }>
```

- [ ] **Step 2: Add the webview client passthroughs** — in `src/shared/lib/rpc.ts`, add to the exported proxy object (mirroring the existing one-liners):

```typescript
  openSettingsWindow: () => client().openSettingsWindow(),
  getMcpStatus: () => client().getMcpStatus(),
  setMcpEnabled: (a) => client().setMcpEnabled(a),
  regenerateMcpToken: () => client().regenerateMcpToken(),
  revealMcpToken: () => client().revealMcpToken(),
```

- [ ] **Step 3: Implement window opener + handlers** — in `src/bun/index.ts`:

Add imports at the top:

```typescript
import { settingsWindowRoute } from './settingsWindow'
import { getMcpStatus, setMcpEnabled, regenerateMcpToken, revealMcpToken } from './mcp/server'
```

Add a singleton ref near `const issueWindows = new Map<…>()`:

```typescript
let settingsWindow: BrowserWindow | null = null
```

Add the opener (near `openIssueWindow`):

```typescript
function openSettingsWindow(): { ok: boolean } {
  if (settingsWindow) {
    settingsWindow.activate()
    return { ok: true }
  }
  const win = new BrowserWindow({
    title: 'Settings',
    url,
    frame: { width: 820, height: 600, x: 160, y: 120 },
    rpc: buildRpc(settingsWindowRoute()),
  })
  win.on('close', () => {
    settingsWindow = null
  })
  settingsWindow = win
  return { ok: true }
}
```

In `buildRpc(...).handlers.requests`, add the new handlers (after `openIssuesWindow`):

```typescript
        openSettingsWindow: async () => openSettingsWindow(),
        getMcpStatus: async () => getMcpStatus(),
        setMcpEnabled: async (a) => setMcpEnabled(a),
        regenerateMcpToken: async () => regenerateMcpToken(),
        revealMcpToken: async () => revealMcpToken(),
```

Change the existing `clearConfig` handler so disconnect also stops the MCP server (it serves with the GitLab token):

```typescript
        clearConfig: async () => {
          clearConfig()
          stopMcp() // the MCP server serves with the GitLab token; stop it on disconnect
          return { ok: true }
        },
```

Add `stopMcp` to the existing `./mcp/server` import line.

Rewire the menu action (the `SETTINGS_ACTION` branch) from dispatching the in-app event to opening the window:

```typescript
  } else if (action === SETTINGS_ACTION) {
    openSettingsWindow()
  }
```

- [ ] **Step 4: Typecheck** (no unit test for BrowserWindow construction — it's electrobun runtime; covered by manual smoke. The route helper and MCP functions are unit-tested in Tasks 1–2.)

Run: `bun run typecheck`
Expected: clean. (If `BrowserWindow`/`buildRpc` types complain about the new handlers, ensure the contract additions in Step 1 match the handler signatures exactly.)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/shared/lib/rpcContract.ts src/shared/lib/rpc.ts src/bun/index.ts
git commit -m "feat(settings): openSettingsWindow + MCP control RPCs; disconnect stops MCP"
```

---

## Task 4: Pane registry + the two-pane shell

**Files:**
- Create: `src/features/settings/useSettingsNav.ts`, `src/features/settings/useSettingsNav.test.ts`
- Create: `src/views/SettingsWindow.vue`, `src/views/SettingsWindow.test.ts`

- [ ] **Step 1: Write the failing nav test** — `src/features/settings/useSettingsNav.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SETTINGS_PANES, useSettingsNav } from './useSettingsNav'

describe('settings nav', () => {
  it('lists the Plan 1 panes in order', () => {
    expect(SETTINGS_PANES.map((p) => p.id)).toEqual(['connection', 'agent', 'data', 'about'])
  })

  it('selects the first pane by default and can switch', () => {
    const nav = useSettingsNav()
    expect(nav.selected.value).toBe('connection')
    nav.select('agent')
    expect(nav.selected.value).toBe('agent')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/features/settings/useSettingsNav.test.ts`

- [ ] **Step 3: Implement** — `src/features/settings/useSettingsNav.ts`:

```typescript
import { ref, type Component } from 'vue'
import { Plug, Bot, Database, Info } from '@lucide/vue'
import ConnectionPane from './panes/ConnectionPane.vue'
import AgentAccessPane from './panes/AgentAccessPane.vue'
import DataCachePane from './panes/DataCachePane.vue'
import AboutPane from './panes/AboutPane.vue'

export interface SettingsPane {
  id: string
  label: string
  icon: Component
  component: Component
}

/** The settings categories, in sidebar order. Plan 2 inserts Appearance,
 *  Shortcuts, and Notifications before Data & cache. */
export const SETTINGS_PANES: SettingsPane[] = [
  { id: 'connection', label: 'Connection', icon: Plug, component: ConnectionPane },
  { id: 'agent', label: 'Agent access', icon: Bot, component: AgentAccessPane },
  { id: 'data', label: 'Data & cache', icon: Database, component: DataCachePane },
  { id: 'about', label: 'About', icon: Info, component: AboutPane },
]

export function useSettingsNav() {
  const selected = ref<string>(SETTINGS_PANES[0].id)
  const select = (id: string) => {
    selected.value = id
  }
  return { selected, select }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run src/features/settings/useSettingsNav.test.ts`
(The pane `.vue` imports must resolve — create empty stub panes if needed so the import resolves, but they're fully implemented in Tasks 5–7; if running this task in isolation, create the four pane files with a minimal `<template><div/></template>` first, then flesh out. In sequential execution they exist by Task 7. To keep Task 4 green standalone, create minimal placeholder panes now and replace their bodies in Tasks 5–7.)

- [ ] **Step 5: Write the failing shell test** — `src/views/SettingsWindow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsWindow from './SettingsWindow.vue'

describe('SettingsWindow', () => {
  it('renders a nav item per pane and shows the connection pane first', () => {
    const w = mount(SettingsWindow, {
      global: { stubs: { ConnectionPane: true, AgentAccessPane: true, DataCachePane: true, AboutPane: true } },
    })
    const items = w.findAll('[data-testid="settings-nav-item"]')
    expect(items).toHaveLength(4)
    expect(w.find('connection-pane-stub').exists()).toBe(true)
  })

  it('switches the active pane on nav click', async () => {
    const w = mount(SettingsWindow, {
      global: { stubs: { ConnectionPane: true, AgentAccessPane: true, DataCachePane: true, AboutPane: true } },
    })
    await w.findAll('[data-testid="settings-nav-item"]')[1].trigger('click')
    expect(w.find('agent-access-pane-stub').exists()).toBe(true)
  })
})
```

- [ ] **Step 6: Run — expect FAIL**

Run: `bunx vitest run src/views/SettingsWindow.test.ts`

- [ ] **Step 7: Implement** — `src/views/SettingsWindow.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { SETTINGS_PANES, useSettingsNav } from '@/features/settings/useSettingsNav'

const { selected, select } = useSettingsNav()
const active = computed(() => SETTINGS_PANES.find((p) => p.id === selected.value) ?? SETTINGS_PANES[0])
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <nav class="flex w-52 shrink-0 flex-col gap-0.5 border-r border-border/60 bg-card/40 p-3">
      <p class="px-2.5 pb-2 font-mono text-2xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Settings
      </p>
      <button
        v-for="pane in SETTINGS_PANES"
        :key="pane.id"
        data-testid="settings-nav-item"
        type="button"
        class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
        :class="
          pane.id === selected
            ? 'bg-primary/12 text-foreground shadow-[inset_2px_0_0_var(--primary)]'
            : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
        "
        @click="select(pane.id)"
      >
        <component :is="pane.icon" class="size-4 shrink-0" />
        {{ pane.label }}
      </button>
    </nav>

    <main class="min-w-0 flex-1 overflow-y-auto px-7 py-6">
      <component :is="active.component" />
    </main>
  </div>
</template>
```

- [ ] **Step 8: Run — expect PASS**

Run: `bunx vitest run src/views/SettingsWindow.test.ts`

- [ ] **Step 9: Commit**

```bash
bun run format
git add src/features/settings/useSettingsNav.ts src/features/settings/useSettingsNav.test.ts src/views/SettingsWindow.vue src/views/SettingsWindow.test.ts src/features/settings/panes
git commit -m "feat(settings): pane registry + two-pane window shell"
```

---

## Task 5: Connection pane

**Files:**
- Create/replace: `src/features/settings/panes/ConnectionPane.vue`, `src/features/settings/panes/ConnectionPane.test.ts`

Migrates the Connection logic from `SettingsDialog.vue` (URL/token/save/disconnect). The cache-clear moves to the Data pane (Task 7).

- [ ] **Step 1: Write the failing test** — `src/features/settings/panes/ConnectionPane.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getConfig = vi.fn()
const clearConfig = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: { getConfig: () => getConfig(), clearConfig: () => clearConfig() },
}))

const save = vi.fn().mockResolvedValue(true)
vi.mock('@/shared/composables/useGitlabConnect', () => ({
  useGitlabConnect: () => ({
    url: { value: 'https://gl.example.com' },
    token: { value: '' },
    tokenSuffix: { value: 'abc123' },
    tokenPlaceholder: { value: 'Current token ends …abc123' },
    status: { value: 'idle' },
    message: { value: '' },
    testing: { value: false },
    canSubmit: { value: true },
    save,
  }),
}))

const queryClear = vi.fn()
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ clear: queryClear }) }))
vi.mock('@/shared/lib/persist', () => ({ clearPersistedCache: vi.fn() }))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))
vi.mock('@/shared/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: () => Promise.resolve(true) }) }))
const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

import ConnectionPane from './ConnectionPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getConfig.mockResolvedValue({ url: 'https://gl.example.com', configured: true, tokenSuffix: 'abc123' })
})

describe('ConnectionPane', () => {
  it('shows the instance URL and saves the connection', async () => {
    const w = mount(ConnectionPane)
    await flushPromises()
    expect(w.find('#settings-url').exists()).toBe(true)
    await w.find('[data-testid="settings-save-connection"]').trigger('click')
    expect(save).toHaveBeenCalled()
  })

  it('disconnects: clears config and routes to connect', async () => {
    const w = mount(ConnectionPane)
    await flushPromises()
    await w.find('[data-testid="settings-disconnect"]').trigger('click')
    await flushPromises()
    expect(clearConfig).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'connect' })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/features/settings/panes/ConnectionPane.test.ts`

- [ ] **Step 3: Implement** — `src/features/settings/panes/ConnectionPane.vue` (lift the logic from `SettingsDialog.vue:33-107`, minus cache-clear):

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { KeyRound, LoaderCircle, Server, Unplug, TriangleAlert } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { clearPersistedCache } from '@/shared/lib/persist'
import { useGitlabConnect } from '@/shared/composables/useGitlabConnect'
import { useConfirm } from '@/shared/composables/useConfirm'
import { pushToast } from '@/shared/composables/useToast'
import PaneHeader from './PaneHeader.vue'

const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()
const { url, token, tokenPlaceholder, status, message, testing, canSubmit, save } =
  useGitlabConnect({ allowExistingToken: true })

async function saveConnection() {
  if (await save()) {
    token.value = ''
    queryClient.clear()
    clearPersistedCache()
    pushToast({ title: 'Connection updated', tone: 'success' })
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
    router.replace({ name: 'connect' })
  } catch (e) {
    pushToast({ title: 'Could not disconnect', description: e instanceof Error ? e.message : undefined, tone: 'failed' })
  }
}
</script>

<template>
  <section class="max-w-lg space-y-4">
    <PaneHeader eyebrow="Connection" title="GitLab connection" description="The instance Lumen talks to and the token it uses." />

    <div class="space-y-2">
      <Label for="settings-url" class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <Server class="size-3.5 text-muted-foreground/70" /> GitLab URL
      </Label>
      <Input id="settings-url" v-model="url" type="url" autocomplete="off" spellcheck="false"
        placeholder="https://gitlab.example.com" :disabled="testing" class="h-9 font-mono text-sm"
        @keydown.enter.prevent="saveConnection" />
    </div>

    <div class="space-y-2">
      <Label for="settings-token" class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <KeyRound class="size-3.5 text-muted-foreground/70" /> Token
      </Label>
      <Input id="settings-token" v-model="token" type="password" autocomplete="off" spellcheck="false"
        :placeholder="tokenPlaceholder" :disabled="testing" class="h-9 font-mono text-sm"
        @keydown.enter.prevent="saveConnection" />
      <div v-if="status === 'error'" class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2" role="alert">
        <TriangleAlert class="mt-px size-4 shrink-0 text-destructive" :stroke-width="2" />
        <p class="text-sm leading-relaxed text-foreground/90">{{ message }}</p>
      </div>
    </div>

    <Button data-testid="settings-save-connection" :disabled="!canSubmit" @click="saveConnection">
      <LoaderCircle v-if="testing" class="size-4 animate-spin" />
      <span v-else>Save connection</span>
    </Button>

    <Button data-testid="settings-disconnect" variant="ghost" class="text-destructive hover:text-destructive" @click="disconnect">
      <Unplug class="size-4" /> Disconnect
    </Button>
  </section>
</template>
```

- [ ] **Step 4: Create the shared `PaneHeader.vue`** — `src/features/settings/panes/PaneHeader.vue` (used by every pane for the eyebrow/title/description):

```vue
<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; description?: string }>()
</script>

<template>
  <header class="space-y-1">
    <p class="font-mono text-2xs font-semibold tracking-[0.13em] text-primary uppercase">{{ eyebrow }}</p>
    <h2 class="text-base font-semibold text-foreground">{{ title }}</h2>
    <p v-if="description" class="max-w-prose text-sm text-muted-foreground">{{ description }}</p>
  </header>
</template>
```

- [ ] **Step 5: Run — expect PASS**

Run: `bunx vitest run src/features/settings/panes/ConnectionPane.test.ts`

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/features/settings/panes/ConnectionPane.vue src/features/settings/panes/ConnectionPane.test.ts src/features/settings/panes/PaneHeader.vue
git commit -m "feat(settings): Connection pane"
```

---

## Task 6: Agent access (MCP) pane

**Files:**
- Create/replace: `src/features/settings/panes/AgentAccessPane.vue`, `src/features/settings/panes/AgentAccessPane.test.ts`

- [ ] **Step 1: Write the failing test** — `src/features/settings/panes/AgentAccessPane.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getMcpStatus = vi.fn()
const setMcpEnabled = vi.fn()
const regenerateMcpToken = vi.fn()
const revealMcpToken = vi.fn()
const clipboardWriteText = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getMcpStatus: () => getMcpStatus(),
    setMcpEnabled: (a: unknown) => setMcpEnabled(a),
    regenerateMcpToken: () => regenerateMcpToken(),
    revealMcpToken: () => revealMcpToken(),
    clipboardWriteText: (a: unknown) => clipboardWriteText(a),
  },
}))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))

import AgentAccessPane from './AgentAccessPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getMcpStatus.mockResolvedValue({ enabled: true, port: 7437, running: true, hasToken: true })
  setMcpEnabled.mockResolvedValue({ ok: true })
  regenerateMcpToken.mockResolvedValue({ token: 'lmcp_new' })
  revealMcpToken.mockResolvedValue({ token: 'lmcp_existing' })
})

describe('AgentAccessPane', () => {
  it('shows the running status from getMcpStatus', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    expect(w.text()).toContain('Running')
    expect(w.text()).toContain('7437')
  })

  it('toggling enable calls setMcpEnabled and refreshes status', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-enable"]').trigger('click')
    await flushPromises()
    expect(setMcpEnabled).toHaveBeenCalledWith({ enabled: false, port: 7437 })
  })

  it('regenerate rotates the token and copies it', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-regenerate"]').trigger('click')
    await flushPromises()
    expect(regenerateMcpToken).toHaveBeenCalled()
    expect(clipboardWriteText).toHaveBeenCalledWith({ text: 'lmcp_new' })
  })

  it('surfaces a port-in-use error from setMcpEnabled', async () => {
    setMcpEnabled.mockResolvedValue({ ok: false, error: 'EADDRINUSE' })
    getMcpStatus.mockResolvedValue({ enabled: false, port: 7437, running: false, hasToken: true })
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-enable"]').trigger('click')
    await flushPromises()
    expect(w.text().toLowerCase()).toContain('use')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/features/settings/panes/AgentAccessPane.test.ts`

- [ ] **Step 3: Implement** — `src/features/settings/panes/AgentAccessPane.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Copy, RefreshCw } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { pushToast } from '@/shared/composables/useToast'
import type { McpStatus } from '@/shared/lib/rpcContract'
import PaneHeader from './PaneHeader.vue'

const status = ref<McpStatus>({ enabled: false, port: 7437, running: false, hasToken: false })
const port = ref(7437)
const error = ref('')
const busy = ref(false)
const revealed = ref<string | null>(null)

const statusLabel = computed(() => {
  if (error.value) return error.value
  if (status.value.running) return `Running · 127.0.0.1:${status.value.port}`
  return status.value.enabled ? 'Starting…' : 'Stopped'
})
const maskedToken = computed(() => (revealed.value ? revealed.value : status.value.hasToken ? 'lmcp_••••••••••••' : '—'))
const snippet = computed(() =>
  JSON.stringify(
    { mcpServers: { lumen: { url: `http://127.0.0.1:${status.value.port}/`, headers: { Authorization: 'Bearer <token>' } } } },
    null,
    2,
  ),
)

async function refresh() {
  status.value = await rpc.getMcpStatus()
  port.value = status.value.port
}
onMounted(refresh)

async function toggle() {
  busy.value = true
  error.value = ''
  const res = await rpc.setMcpEnabled({ enabled: !status.value.enabled, port: port.value })
  if (!res.ok) error.value = res.error.includes('EADDRINUSE') ? `Port ${port.value} is already in use.` : res.error
  await refresh()
  busy.value = false
}

async function regenerate() {
  const { token } = await rpc.regenerateMcpToken()
  revealed.value = token
  await rpc.clipboardWriteText({ text: token })
  pushToast({ title: 'New token copied', tone: 'success' })
  await refresh()
}

async function copyToken() {
  const { token } = await rpc.revealMcpToken()
  if (!token) return
  revealed.value = token
  await rpc.clipboardWriteText({ text: token })
  pushToast({ title: 'Token copied', tone: 'success' })
}

async function copySnippet() {
  await rpc.clipboardWriteText({ text: snippet.value })
  pushToast({ title: 'Client config copied', tone: 'success' })
}
</script>

<template>
  <section class="max-w-lg space-y-5">
    <PaneHeader eyebrow="Agent access (MCP)" title="Let agents work through Lumen"
      description="Exposes a local, token-protected MCP server so tools like Claude Code can read and act on your GitLab data. Off by default; bound to 127.0.0.1." />

    <div class="flex items-center justify-between border-b border-border/50 py-3">
      <div>
        <p class="text-sm text-foreground">Enable MCP server</p>
        <p class="font-mono text-2xs" :class="error ? 'text-destructive' : status.running ? 'text-emerald-400' : 'text-muted-foreground'">
          {{ statusLabel }}
        </p>
      </div>
      <Button data-testid="mcp-enable" :variant="status.enabled ? 'default' : 'outline'" :disabled="busy" @click="toggle">
        {{ status.enabled ? 'Enabled' : 'Disabled' }}
      </Button>
    </div>

    <div class="flex items-center justify-between border-b border-border/50 py-3">
      <p class="text-sm text-foreground">Port</p>
      <Input v-model.number="port" type="number" class="h-8 w-24 text-right font-mono text-sm" />
    </div>

    <div class="flex items-center justify-between border-b border-border/50 py-3">
      <div>
        <p class="text-sm text-foreground">Access token</p>
        <p class="font-mono text-2xs text-muted-foreground">{{ maskedToken }}</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="!status.hasToken" @click="copyToken"><Copy class="size-3.5" /> Copy</Button>
        <Button data-testid="mcp-regenerate" variant="outline" size="sm" @click="regenerate"><RefreshCw class="size-3.5" /> Regenerate</Button>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <p class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Client config</p>
        <Button variant="ghost" size="sm" @click="copySnippet"><Copy class="size-3.5" /> Copy</Button>
      </div>
      <pre class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground">{{ snippet }}</pre>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run src/features/settings/panes/AgentAccessPane.test.ts`

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/features/settings/panes/AgentAccessPane.vue src/features/settings/panes/AgentAccessPane.test.ts
git commit -m "feat(settings): Agent access (MCP) pane"
```

---

## Task 7: Data & cache + About panes

**Files:**
- Create/replace: `src/features/settings/panes/DataCachePane.vue`, `.test.ts`
- Create/replace: `src/features/settings/panes/AboutPane.vue`, `.test.ts`

- [ ] **Step 1: Write the failing DataCache test** — `src/features/settings/panes/DataCachePane.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const queryClear = vi.fn()
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ clear: queryClear }) }))
const clearPersistedCache = vi.fn()
vi.mock('@/shared/lib/persist', () => ({ clearPersistedCache: () => clearPersistedCache() }))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))

import DataCachePane from './DataCachePane.vue'

beforeEach(() => vi.clearAllMocks())

describe('DataCachePane', () => {
  it('clears the query + persisted cache', async () => {
    const w = mount(DataCachePane)
    await w.find('[data-testid="settings-clear-cache"]').trigger('click')
    expect(queryClear).toHaveBeenCalled()
    expect(clearPersistedCache).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run src/features/settings/panes/DataCachePane.test.ts`

- [ ] **Step 3: Implement** — `src/features/settings/panes/DataCachePane.vue`:

```vue
<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { useQueryClient } from '@tanstack/vue-query'
import { Button } from '@/shared/ui/button'
import { clearPersistedCache } from '@/shared/lib/persist'
import { pushToast } from '@/shared/composables/useToast'
import PaneHeader from './PaneHeader.vue'

const queryClient = useQueryClient()
function clearCache() {
  queryClient.clear()
  clearPersistedCache()
  pushToast({ title: 'Cache cleared', tone: 'success' })
}
</script>

<template>
  <section class="max-w-lg space-y-4">
    <PaneHeader eyebrow="Data & cache" title="Local data" description="Cached GitLab data is stored on this machine for fast loads." />
    <Button data-testid="settings-clear-cache" variant="outline" @click="clearCache">
      <Trash2 class="size-4" /> Clear cached data
    </Button>
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run src/features/settings/panes/DataCachePane.test.ts`

- [ ] **Step 5: Write the failing About test** — `src/features/settings/panes/AboutPane.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const gitlabGraphql = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabGraphql: () => gitlabGraphql() } }))
vi.mock('@/shared/composables/useGitlabConnect', () => ({ PROBE_QUERY: 'query{currentUser{username}}' }))

import AboutPane from './AboutPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__APP_VERSION__', '9.9.9')
  gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'kyle' } } })
})

describe('AboutPane', () => {
  it('shows the version and identity', async () => {
    const w = mount(AboutPane)
    await flushPromises()
    expect(w.text()).toContain('9.9.9')
    expect(w.text()).toContain('kyle')
  })
})
```

- [ ] **Step 6: Run — expect FAIL**

Run: `bunx vitest run src/features/settings/panes/AboutPane.test.ts`

- [ ] **Step 7: Implement** — `src/features/settings/panes/AboutPane.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { rpc } from '@/shared/lib/rpc'
import { PROBE_QUERY } from '@/shared/composables/useGitlabConnect'
import PaneHeader from './PaneHeader.vue'

const version = __APP_VERSION__
const username = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
    username.value = (res.data as { currentUser?: { username?: string } } | undefined)?.currentUser?.username ?? null
  } catch {
    username.value = null
  }
})
</script>

<template>
  <section class="max-w-lg space-y-4">
    <PaneHeader eyebrow="About" title="Lumen" />
    <p class="text-sm text-muted-foreground">
      lumen v{{ version }}<span v-if="username"> · @{{ username }}</span>
    </p>
  </section>
</template>
```

- [ ] **Step 8: Run — expect PASS**

Run: `bunx vitest run src/features/settings/panes/AboutPane.test.ts`

- [ ] **Step 9: Commit**

```bash
bun run format
git add src/features/settings/panes/DataCachePane.vue src/features/settings/panes/DataCachePane.test.ts src/features/settings/panes/AboutPane.vue src/features/settings/panes/AboutPane.test.ts
git commit -m "feat(settings): Data & cache + About panes"
```

---

## Task 8: Add the route, retire the modal, final verification

**Files:**
- Modify: `src/router/index.ts`, `src/App.vue`
- Delete: `src/shared/components/SettingsDialog.vue`, `src/shared/components/SettingsDialog.test.ts`, `src/shared/composables/useSettings.ts`

- [ ] **Step 1: Add the settings route** — in `src/router/index.ts`, import the view alongside the others:

```typescript
import SettingsWindow from '@/views/SettingsWindow.vue'
```
and add a route entry to the `routes` array:

```typescript
  { path: '/settings', name: 'settings', component: SettingsWindow },
```

- [ ] **Step 2: Retire the modal in `src/App.vue`** — remove the import (`SettingsDialog`), the `registerSettingsShortcut` import, its `onMounted` registration + cleanup, and the `<SettingsDialog />` element (line ~71). Leave the rest of `App.vue` (including the `windowed` computed) untouched. The settings window renders via `<router-view>` when its route loads with `?window=1`, which `windowed` already uses to hide the main shell.

- [ ] **Step 3: Delete the retired files**

```bash
git rm src/shared/components/SettingsDialog.vue src/shared/components/SettingsDialog.test.ts src/shared/composables/useSettings.ts
```

- [ ] **Step 4: Find and fix any remaining references** to the deleted modules:

```bash
git grep -n "SettingsDialog\|useSettings\|OPEN_SETTINGS_EVENT\|registerSettingsShortcut\|openSettings\b\|closeSettings\|settingsState"
```
Expected after edits: no matches outside the now-deleted files. If a reference remains (e.g. a stray import), remove it. (The native ⌘, menu now routes through `openSettingsWindow` in the Bun process — Task 3 — so the in-app event is fully gone.)

- [ ] **Step 5: Full suite + typecheck**

Run:
```bash
bunx vitest run
bun run typecheck
```
Expected: all tests pass; typecheck clean. (No new GraphQL operations; the About probe reuses `PROBE_QUERY`.)

- [ ] **Step 6: Commit**

```bash
bun run format
git add -A
git commit -m "feat(settings): route the window, retire the settings modal"
```

- [ ] **Step 7: Manual smoke (real app)** — `bun run app:dev`, press ⌘, → the settings window opens (singleton: ⌘, again focuses it, doesn't duplicate). Verify: Connection shows the URL; Agent access toggles the MCP server (status flips to `Running · 127.0.0.1:7437`), Copy/Regenerate work, snippet copies; Data clears cache; About shows version + identity; Disconnect routes the main window to Connect and stops the MCP server.

---

## Self-Review

**Spec coverage (against `2026-06-10-settings-window-design.md`, Plan 1 portion):**
- Dedicated native window, singleton, two-pane sidebar: ✅ Tasks 1–4.
- ⌘,/menu opens the window (not the modal): ✅ Task 3.
- Connection pane (carry-over) + Disconnect stops MCP: ✅ Tasks 5, 3.
- Agent access pane (enable/port/token reveal+copy+regenerate/snippet/status, port-in-use surfaced): ✅ Task 6 + Task 2 RPCs.
- Data & cache, About (carry-over): ✅ Task 7.
- Token only returned on explicit reveal/regenerate: ✅ Task 2 (`getMcpStatus` excludes it; `revealMcpToken`/`regenerateMcpToken` return it).
- Old modal retired: ✅ Task 8.
- **Deferred to Plan 2 (explicitly out of scope here):** Appearance, Shortcuts, Notifications panes; `AppConfig` `appearance`/`notifications`; accent-token refactor; `usePipelineNotifications` prefs threading. `useSettingsNav.SETTINGS_PANES` has a comment marking where Plan 2 inserts them.

**Placeholder scan:** none — every code/test step has complete code and an exact command + expected result. (The Task 4 note about minimal placeholder panes is a sequencing aid; Tasks 5–7 replace them with full implementations.)

**Type consistency:** `McpStatus` shape identical in `rpcContract.ts` (Task 3), `mcp/server.ts` (Task 2), and `AgentAccessPane.vue` (Task 6). `setMcpEnabled({enabled,port})` object-arg form consistent across Task 2 (impl), Task 3 (contract/handler), Task 6 (caller). `SETTINGS_PANES` ids (`connection`/`agent`/`data`/`about`) match `useSettingsNav` (Task 4), the shell (Task 4), and the pane components (Tasks 5–7). `settingsWindowRoute()` consistent between Task 1 and Task 3.

**Risk noted:** `BrowserWindow` construction (Task 3) isn't unit-tested (electrobun runtime, like `Bun.serve`); covered by the Task 8 manual smoke. The route helper, guard, MCP RPCs, nav, shell, and every pane ARE unit-tested.
