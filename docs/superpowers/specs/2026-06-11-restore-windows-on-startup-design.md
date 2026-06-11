# Restore windows & state on startup

**Date:** 2026-06-11
**Status:** Approved (design)

## Problem

Lumen launches into a fixed layout every time: the main window opens at hardcoded
geometry (`1280×860 @ 80,80`) on the default route, and any issue/combined-issues
popouts that were open at last quit are gone. Users who arrange windows and keep a
working view open must rebuild that arrangement on every launch.

Add a setting that, when enabled, restores on startup:

1. The main window's size and position.
2. The main window's in-app route (e.g. reopen on the Issues view).
3. The issue and combined-issues popout windows that were open at last quit,
   each at its remembered size and position.

The **settings window** is deliberately **out of scope** for replay — reopening
Settings on launch is unhelpful. Its geometry is not remembered either.

## Goals / Non-goals

**Goals**
- A single "Restore windows on startup" toggle, **default ON**, in a new General pane.
- Persist window/session state continuously so it survives crash / force-quit.
- Fully backward compatible: toggle off (or not connected) ⇒ today's exact launch.

**Non-goals**
- Restoring the settings window.
- Restoring scroll position / in-issue selection inside popouts (route only).
- Granular per-aspect toggles (one switch covers geometry + route + popouts).
- Multi-monitor reconciliation beyond storing raw x/y (see Edge cases).

## Approach

Chosen: **separate `session.json` + a live in-memory model**, persisted debounced
as windows open / move / resize / close. The `restoreOnStartup` *preference* lives
in the existing `config.json`.

Rationale:
- Survives force-quit/crash — the last debounced write is always current, so no
  reliance on a clean-shutdown hook (Electrobun quit semantics are not guaranteed
  to fire per-window close on app exit).
- Keeps frequent geometry writes off the `0o600` credential file (`config.json`).
- Isolated, unit-testable module mirroring `config.ts`
  (honors `LUMEN_CONFIG_DIR` for tests).

Rejected:
- *Everything in `config.json`, persist on quit* — churns the credential file on
  every drag and silently loses state on crash.
- *Geometry + route only, no popout reopen* — popout replay is a required goal.

## Data model

New file `session.json` in `configDir()`, written by `src/bun/session.ts`:

```ts
interface Frame { x: number; y: number; width: number; height: number }

interface MainSession {
  frame: Frame | null
  route: string | null   // last "safe" main-window route path, else null
}

type PopoutSession =
  | { kind: 'issue';  fullPath: string; iid: string;   frame: Frame }
  | { kind: 'issues'; fullPath: string; iids: string[]; frame: Frame }

interface SessionState {
  main: MainSession
  popouts: PopoutSession[]
}
```

Notes:
- The settings window never appears in `popouts`.
- `route` stores a route **path** (e.g. `/issues`), matching what
  `reportAppState` already sends (`AppStateSnapshot.route`).
- Missing/corrupt `session.json` ⇒ treated as empty `{ main: { frame: null,
  route: null }, popouts: [] }` (parse errors swallowed, same posture as
  `loadConfig`).

## Modules & responsibilities

### `src/bun/session.ts` (new)
Owns the in-memory `SessionState` and its persistence. Pure of Electrobun imports
so it is unit-testable.

- `loadSession(): SessionState` — read+parse `session.json`, empty on miss/error.
- In-memory mutators (operate on a module singleton):
  - `setMainFrame(frame)`, `setMainRoute(route | null)`
  - `upsertPopout(entry)` keyed by identity (issue: `${fullPath}#${iid}`;
    issues: a generated opaque id assigned at open time)
  - `updatePopoutFrame(id, frame)`
  - `removePopout(id)`
- `scheduleSave()` — debounced (e.g. 300 ms trailing) write of the current model
  to disk. All mutators call it.
- `snapshot(): SessionState` — current model (for boot read and tests).

Identity: popouts are tracked by a stable string id. For issue windows that's the
existing `${fullPath}#${iid}` key. Combined-issues windows have no natural key, so
`index.ts` assigns an incrementing id at open time and passes it to `upsertPopout`
/ `removePopout`.

### `src/bun/config.ts` (extend)
- `AppConfig` gains `restoreOnStartup: boolean`.
- `loadConfig` defaults it to `true` when absent (existing installs opt in).
- A setter `saveRestoreOnStartup(enabled: boolean)` that preserves all other
  fields (mirrors `saveMcpConfig`).
- `persist` writes the new field.

### `src/bun/restore.ts` (new, pure)
A pure decision function so gating is testable without windows:

```ts
function planRestore(args: {
  enabled: boolean
  connected: boolean        // gitlabUrl && token present
  session: SessionState
}): { mainFrame: Frame | null; mainRoute: string | null; popouts: PopoutSession[] }
```

- If `!enabled || !connected` ⇒ all-null / empty (clean launch).
- `mainRoute` passes through only if it is in a **safe-route allowlist** (reuse
  the set of agent-navigable route names already encoded in
  `useAppStateReport.ts`'s `VIEW_TO_ROUTE` values — never restore connect /
  settings / issues-window). Map the stored path back to a route check; if it
  is not safe, return `null` (default route).
- `popouts` pass through as-is (issue/combined only — settings never stored).

### `src/bun/index.ts` (wire)
- **Geometry capture:** extend `track(w)` (or add a sibling helper) so every
  tracked window also gets `on('resize')` and `on('move')` handlers. The main
  window updates `setMainFrame`; popouts call `updatePopoutFrame(id, …)`.
- **Popout registration:** `openIssueWindow` / `openIssuesWindow` call
  `upsertPopout` on open and `removePopout` on close (alongside the existing
  registry bookkeeping). `openSettingsWindow` does **not** touch the session.
- **Frame override:** the three open functions gain an optional `frame?: Frame`
  param; when provided it replaces the hardcoded/cascade frame, else current
  behavior is unchanged.
- **Route capture:** in the `reportAppState` handler (main window only — already
  gated by `initialRoute === null`), also call `setMainRoute(s.route)` so the
  session model tracks the latest main route. (Cache + session updated together.)
- **Boot restore:** before constructing the main window, compute
  `planRestore({ enabled: loadConfig().restoreOnStartup, connected, session:
  loadSession() })`. Construct the main window with `mainFrame` (if non-null) and
  pass `mainRoute` as its `initialRoute` (currently always `null`). Then replay
  `popouts` by calling the open functions with their saved frames.

### RPC contract (`src/shared/lib/rpcContract.ts` + `rpc.ts`)
Two new requests, mirroring the MCP-toggle shape:
- `getStartupPrefs: () => Promise<{ restoreOnStartup: boolean }>`
- `setRestoreOnStartup: (a: { enabled: boolean }) => Promise<{ ok: true }>`

Handlers in `buildRpc` read/write via `config.ts`.

### Settings UI
- New pane `GeneralPane.vue` (id `general`, icon e.g. `Settings2` or `Power`),
  inserted **first** in `SETTINGS_PANES` (startup behavior is the natural top).
- Contains the single "Restore windows on startup" switch with a one-line
  description. Reads `getStartupPrefs` on mount; writes `setRestoreOnStartup`
  on toggle. Follows the existing pane/toggle styling.

## Data flow

```
move/resize/close ─▶ session.ts mutators ─▶ scheduleSave() ─▶ session.json
reportAppState (main) ─▶ cacheSnapshot (MCP)  ┐
                         setMainRoute          ┴▶ session model

BOOT:
loadConfig().restoreOnStartup ┐
gitlab url+token (connected)  ┼▶ planRestore() ─▶ main window (frame+route)
loadSession()                 ┘                └▶ replay issue/combined popouts
```

## Error handling & edge cases

- **Corrupt/missing `session.json`** ⇒ empty session ⇒ clean launch. Never throws.
- **Not connected at boot** ⇒ no restore (popouts need a working GitLab session);
  main opens at default route (Connect flow), default geometry.
- **Saved route no longer valid** (project deleted, route renamed) ⇒ the SPA's
  normal route guards handle it; worst case it lands on the default view. Only
  allowlisted "safe" routes are ever restored.
- **Off-screen geometry** (monitor unplugged): out of scope to reconcile in v1 —
  store raw x/y. If this proves painful, a follow-up can clamp to visible
  displays. Flagged as a known limitation, not silently handled.
- **Stale popout on disk** (issue closed/deleted since last quit): the window
  opens and the in-app route guard shows the normal not-found/empty state.
- **Debounce vs. quit race:** because writes are continuous (not quit-gated), the
  on-disk state lags live state by at most the debounce window — acceptable.

## Testing

- `session.test.ts`: mutators update the model; `scheduleSave` round-trips through
  `LUMEN_CONFIG_DIR`; corrupt file ⇒ empty; settings window never enters popouts.
- `config.test.ts` additions: `restoreOnStartup` defaults true when absent;
  `saveRestoreOnStartup` preserves url/token/mcp.
- `restore.test.ts`: `planRestore` gating matrix (enabled×connected),
  safe-route allowlist filtering, popout pass-through.
- `GeneralPane.test.ts`: renders toggle, reads pref on mount, writes on change
  (mirrors `AppearancePane.test.ts`).
- `useSettingsNav.test.ts`: General pane present and first.

## Backward compatibility

- New installs and existing installs both get `restoreOnStartup: true` by default
  (absent field ⇒ true), but with no `session.json` yet the first restored launch
  is identical to today; subsequent launches restore.
- All three window-open functions keep their current signatures via an optional
  `frame?` param; omitting it preserves today's geometry/cascade exactly.
