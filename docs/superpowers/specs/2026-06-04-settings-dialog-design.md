# Settings dialog — design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)

## Problem

The `/settings` route is misnamed: it is actually the first-run **onboarding /
connect** screen (`SettingsView.vue`, title "Connect · lumen"). The router guard
sends *unconfigured* users there; once configured, **nothing links back to it**.

Consequences:

- No way to swap the token, change instance, or disconnect after onboarding
  short of manually clearing storage — even though `rpc.clearConfig()` already
  exists in the contract and is unused.
- No home for app-level controls (about, cache reset).
- "Settings" means "onboarding", so a real settings surface has nowhere to live.

## Goals

1. A real **settings surface** for configured users (Connection, About, Cache).
2. Re-auth / disconnect after onboarding (closes the actual hole).
3. Stop `/settings` from meaning "onboarding".

## Non-goals (YAGNI)

There is **no global-preferences system today** — all persisted state is
per-project / per-issue (saved views, filters, scratchpad, pipeline-watch) in
localStorage, and the theme is deliberately fixed (dark + amber). So we do **not**
invent rows to fill a page. Explicitly out of scope: theme/density switch, default
view, refresh-interval control, notification preferences. These would be net-new
features, not surfacing existing state; add them later if real need appears.

## Shape decision

Settings is a **centered modal dialog** overlaid on the app (not a route),
opened from anywhere. Onboarding stays its own route. Chosen over a settings
*page* because the app has no persistent chrome to navigate from and the dialog
keeps the user in their work context.

## Architecture

### Entry points

The app shell (`App.vue`) renders no persistent header — views own their headers
— so there is no in-app gear affordance. This is a native Electrobun app, so the
idiomatic entry point is the **macOS app menu**.

- **`src/bun/menu.ts`** — add a `Settings…` item with accelerator
  `CommandOrControl+,` in the app (first) submenu, immediately after
  `{ role: 'about' }` + a separator. Mirrors the existing `DEVTOOLS_ACTION`
  pattern: export `const SETTINGS_ACTION = 'open-settings'`.
- **`src/bun/index.ts`** — handle `SETTINGS_ACTION` by bridging host → webview:
  run `win.webview.executeJavascript(
  "window.dispatchEvent(new CustomEvent('lumen:open-settings'))")`.
  (Mirror however the devtools action is dispatched in this file.)
- **Webview fallback** — `useSettings` also binds `⌘,` via `onKeyStroke`, so the
  dialog opens even if the menu bridge regresses. The menu accelerator is
  canonical; the OS captures `⌘,` before the webview when the menu owns it, so in
  practice the fallback only fires if the menu item is absent.

**Risk:** the host→webview `executeJavascript` bridge is the one unproven seam.
If `executeJavascript` is unavailable on the Electrobun webview API, fall back to
the webview-side `onKeyStroke('⌘,')` binding as the sole trigger and drop the
menu accelerator to a no-op label. Resolve during implementation by checking the
Electrobun webview API; do not block the rest of the work on it.

### Singleton dialog (mirror ConfirmDialog / useConfirm)

- **`src/composables/useSettings.ts`** — module-level `reactive` singleton
  `settingsState = { open: boolean }`, plus `openSettings()` / `closeSettings()`.
  Registers the `lumen:open-settings` window-event listener and the `⌘,`
  `onKeyStroke` fallback (idempotent; safe to call from the dialog's setup).
  Shape mirrors `useConfirm.ts`.
- **`src/components/SettingsDialog.vue`** — mounted **once** in `App.vue` next to
  `<ConfirmDialog />` and `<ToastHost />`. Reads `settingsState.open`.
- **`src/components/ui/dialog`** — add the shadcn-vue `dialog` primitive (the repo
  has `sheet` and `alert-dialog` but no centered modal `dialog`). Pull via the
  shadcn-vue skill so it matches the project's reka-ui/shadcn-vue conventions.

### Sections

**Connection**
- Display the instance URL (from `rpc.getConfig()`).
- **Swap token** — inline mini-form (token input + Save) that reuses the shared
  connect logic (below); on success, toast "Token updated".
- **Disconnect** — `useConfirm({ title: 'Disconnect from GitLab?', ... })` →
  `rpc.clearConfig()` → clear the query cache (`clearPersistedCache()` below) →
  `router.replace({ name: 'connect' })`. Close the dialog as part of the flow.

**About**
- App version + current GitLab `@username`.
- **Version source:** add a `version` field to `package.json` (`"0.1.0"`) and
  expose it to the webview via a Vite `define` (e.g. `__APP_VERSION__`) or
  `import.meta.env`. No runtime fetch.
- **Username:** `{ currentUser { username } }` via `rpc.gitlabGraphql` (same query
  onboarding uses to probe), rendered when available; omit the line if it fails
  (non-blocking).

**Cache**
- **Clear cached data** — `queryClient.clear()` + drop the persisted localStorage
  entry, then toast "Cache cleared".
- **`src/lib/persist.ts`** — export `clearPersistedCache()` that removes the
  TanStack persister's localStorage key. Set an explicit `key` on
  `createSyncStoragePersister` (e.g. `'lumen:query-cache'`) so the same constant
  is used to write and to clear (don't rely on the library default key string).
  The dialog gets the client via `useQueryClient()`.

### Shared connect logic

Extract the onboarding probe into **`src/composables/useGitlabConnect.ts`**:
holds `url`, `token`, `status` (`idle | testing | error`), `message`, and
`save()` (saveConfig → probe `{ currentUser { username } }` → success/inline
error). Consumed by:

- `ConnectView.vue` (onboarding) — full form, routes to `projects` on success.
- `SettingsDialog.vue` Connection section — token-only swap, toasts on success,
  no navigation.

The composable owns the probe; callers decide the success side-effect (navigate
vs. toast). This keeps the swap-token form from being a copy of onboarding.

### Rename: kill the "settings = onboarding" lie

- `src/views/SettingsView.vue` → **`src/views/ConnectView.vue`** (logic moves into
  `useGitlabConnect`; the view becomes presentation + "route to projects on
  success").
- `src/router/index.ts` — route `name: 'settings'` → `'connect'`, path
  `/settings` → `/connect`, component → `ConnectView.vue`.
- `src/router/guard.ts` — `if (toName === 'connect') return true;` and unconfigured
  redirect → `{ name: 'connect' }`.
- `src/router/guard.test.ts` — update the two assertions to `'connect'`.

## Data flow

```
⌘, (menu accelerator)
  → bun: SETTINGS_ACTION → executeJavascript dispatch 'lumen:open-settings'
  → webview: useSettings listener → settingsState.open = true
  → SettingsDialog renders

Swap token:   input → useGitlabConnect.save() → saveConfig + probe → toast
Disconnect:   useConfirm → rpc.clearConfig() → clearPersistedCache() → /connect
Clear cache:  queryClient.clear() + clearPersistedCache() → toast
```

## Error handling

- Swap token: probe failure surfaces inline in the Connection section (reuse
  `useGitlabConnect.status === 'error'` + `message`), form stays put.
- Disconnect / clear cache: guarded by `useConfirm` (disconnect) and toast
  feedback; `clearConfig` rejection surfaces as an error toast.
- About username: best-effort; absent line on failure, never blocks the dialog.

## Testing

- `useSettings` — open/close; opens on `lumen:open-settings`; opens on `⌘,`.
- `useGitlabConnect` — save success (saveConfig + probe), probe error, network
  error; success side-effect left to caller.
- `clearPersistedCache` — removes the persister key from localStorage.
- `guard.test.ts` — updated `'connect'` assertions.
- `SettingsDialog` interaction — swap token, disconnect (confirm path), clear
  cache — following `ConfirmDialog.test.ts` style.

## Affected files

New: `composables/useSettings.ts`, `composables/useGitlabConnect.ts`,
`components/SettingsDialog.vue`, `components/ui/dialog/*`.
Renamed: `views/SettingsView.vue` → `views/ConnectView.vue`.
Edited: `bun/menu.ts`, `bun/index.ts`, `router/index.ts`, `router/guard.ts`,
`router/guard.test.ts`, `lib/persist.ts`, `App.vue`, `package.json`,
Vite config (version define).
