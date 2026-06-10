# Settings Window — Design

**Date:** 2026-06-10
**Status:** Approved (design); implementation pending

## Summary

Replace Lumen's small single-column settings modal with a **dedicated native
settings window**: a two-pane surface (sidebar nav + active pane) opened as its
own `BrowserWindow` on a `/settings` route, reusing the existing issue-window
machinery. The window is a **singleton** (focus the existing one rather than
spawning a second). It holds seven category panes — the four that exist today
(Connection, Data & cache, About) reorganized, plus the new **Agent access
(MCP)** pane (the feature driving this upgrade) and three new lean panes
(Appearance, Shortcuts, Notifications).

This subsumes the previously-deferred "Settings UI for the MCP server" work and
folds in the deferred `clearConfig → stopMcp` lifecycle fix.

## Goals

- A roomy, scalable settings surface in the app's refined-dark + amber
  aesthetic (Hanken Grotesk / Geist Mono), matching the validated mockup.
- Make the MCP server fully usable from the UI (enable/disable, port, token
  reveal/copy/regenerate, client-config snippet, live status) — no more
  hand-editing `config.json`.
- Three new lean-but-real panes (Appearance, Shortcuts, Notifications) — every
  pane backs a real feature; no empty/placeholder panes.
- Isolated, independently-testable pane components and RPC handlers.

## Non-Goals

- **No keyboard-shortcut rebinding** — the Shortcuts pane is read-only
  reference. Customization needs a keybinding registry (separate feature).
- **No light theme** — the app stays dark-only; Appearance adjusts accent and
  motion, not a full theme system.
- **No new notification sources** — Notifications configures the one existing
  source (pipeline completion). New sources are out of scope.
- **No app-control MCP bridge** — that remains a separate, later plan.

## Decisions (from brainstorming)

- **Layout:** two-pane sidebar (chosen over a roomier modal or a tabbed dialog).
- **Container:** a dedicated native window (chosen over a modal overlay or a
  full-screen in-window route).
- **Scope:** the four core categories + three new panes (Appearance, Shortcuts,
  Notifications), each with real content.
- **Notifications included (not deferred):** verified a real source exists
  (`usePipelineNotifications` fires an OS notification on terminal status of a
  watched pipeline when the app is inactive), so the pane configures something
  real.

## Architecture

```
native ⌘, menu / lumen:open-settings event
        │  (was: toggle modal)  → now: openSettingsWindow()
        ▼
Bun main process ── openSettingsWindow() ──► BrowserWindow  (singleton)
        │                                      url = <app>/#/settings
        ▼
SettingsWindow.vue  (two-pane shell)
   ├─ sidebar nav (local selected-pane state)
   └─ active pane component
        Connection · Agent access · Appearance · Shortcuts · Notifications · Data & cache · About
        │ each pane reads/writes via rpc (getConfig + targeted save RPCs)
        ▼
Bun config.ts (0600 JSON)  +  mcp/server.ts lifecycle
```

The settings window is a normal webview loading the same SPA at the `/settings`
route. It talks to the Bun process over the existing RPC contract (extended),
so no cross-window reactive state is needed — each window does its own RPC.

## Module Layout

```
src/bun/
  index.ts                  # MODIFY: openSettingsWindow() + singleton ref; menu → opener
  config.ts                 # MODIFY: AppConfig gains `appearance`, `notifications`
  mcp/server.ts             # (reused: setMcpEnabled, isRunning, generateToken, startMcp)

src/shared/lib/rpcContract.ts   # MODIFY: new request methods (see RPCs)
src/router/index.ts             # MODIFY: add `settings` route → SettingsWindow.vue

src/views/SettingsWindow.vue            # NEW: two-pane shell + sidebar nav
src/features/settings/
  panes/ConnectionPane.vue              # carry-over logic (useGitlabConnect)
  panes/AgentAccessPane.vue             # MCP enable/port/token/snippet/status
  panes/AppearancePane.vue              # accent presets + reduce-motion
  panes/ShortcutsPane.vue               # read-only reference
  panes/NotificationsPane.vue           # OS toggle + silence-success
  panes/DataCachePane.vue               # clear cache
  panes/AboutPane.vue                   # version + identity
  shortcuts.ts                          # curated shortcut reference data
  useAppearance.ts                      # apply accent CSS var + reduce-motion on boot
  useSettingsNav.ts                     # pane registry + selected-pane state
```

`SettingsDialog.vue` and the modal-only bits of `useSettings.ts` are retired.
The `lumen:open-settings` event handling moves to "open/focus the window."

Each pane is a focused unit: it owns its fields, reads its slice of config on
mount, and saves via one RPC. Panes do not know about each other.

## Panes

### 1. Connection (carry-over)
GitLab URL, token (masked, with suffix placeholder), **Save connection**,
**Disconnect**. Reuses `useGitlabConnect({ allowExistingToken: true })` and the
existing connect error UX (inline alert on probe failure). **Disconnect** now
also stops the MCP server (it serves using the GitLab token), via `setMcpEnabled(false, …)`
or a direct `stopMcp` on the clear path — folding in the deferred
`clearConfig → stopMcp`.

### 2. Agent access (MCP)
- **Enable** switch with a live status line: `● Running · 127.0.0.1:<port>` /
  `Stopped` / `Port in use` (from `getMcpStatus`).
- **Port** field (default 7437); changing it while enabled restarts the server.
- **Access token** row: masked value, **Copy**, **Regenerate** (regenerate
  invalidates the old token and restarts). First enable auto-generates a token.
- **Client config** snippet (streamable-HTTP URL + Bearer header) with **Copy**.
- Port-in-use on enable surfaces in the status line (no silent port roaming).

Backed by new RPCs (below). Mirrors `docs/superpowers/specs/2026-06-09-mcp-server-design.md`
§Settings UI, now realized in this window.

### 3. Appearance (new, lean)
- **Accent color**: a small set of presets (amber = default). Selection writes
  `appearance.accent`; applied by setting a `--accent` CSS custom property at the
  document root, read on app boot (`useAppearance`).
- **Reduce motion**: toggle writes `appearance.reduceMotion`; applied as a root
  class that short-circuits transitions/animations (honored alongside the OS
  `prefers-reduced-motion`).

### 4. Shortcuts (new, lean, read-only)
A curated, grouped reference of existing shortcuts (data in
`features/settings/shortcuts.ts`), e.g. command palette open, project launcher,
navigation, open settings (⌘,). Rendered as key-chip + description rows. No
rebinding.

### 5. Notifications (new, lean)
- **OS notifications** master toggle → `notifications.osEnabled`.
- **Silence successful pipeline runs** toggle → `notifications.silenceSuccess`.
`usePipelineNotifications` reads these: it skips the `rpc.showNotification` call
when `osEnabled` is false, and forces `silent: true` for SUCCESS when
`silenceSuccess` is true (today it already lets failures ring and successes land
quietly — this makes it configurable). The in-app toast is unaffected.

### 6. Data & cache (carry-over)
**Clear cached data** — clears the query client + persisted cache.

### 7. About (carry-over)
`lumen v<version>` + `@<username>` (from the probe).

## Config & RPCs

Extend `AppConfig` (in `src/bun/config.ts`):

```ts
interface AppConfig {
  gitlabUrl: string | null
  token: string | null
  mcp: McpConfig | null
  appearance: { accent: string; reduceMotion: boolean } | null
  notifications: { osEnabled: boolean; silenceSuccess: boolean } | null
}
```

New `saveAppearance` / `saveNotifications` writers preserve the other blocks
(same pattern as `saveMcpConfig`). Defaults applied on read when a block is
`null` (accent = amber, reduceMotion = false, osEnabled = true, silenceSuccess =
false).

New RPC request methods (in `rpcContract.ts`, handled in `index.ts`):
- `openSettingsWindow(): Promise<{ ok: boolean }>` — open/focus the settings window.
- `getMcpStatus(): Promise<{ enabled: boolean; port: number; running: boolean; hasToken: boolean }>`
- `setMcpEnabled(a: { enabled: boolean; port: number }): Promise<{ ok: true } | { ok: false; error: string }>` — generates a token if enabling without one; persists + (re)starts/stops.
- `regenerateMcpToken(): Promise<{ token: string }>` — new token, restart, return it for one-time reveal/copy.
- `revealMcpToken(): Promise<{ token: string }>` — return the current token for Copy.
- `getAppearance()` / `saveAppearance(a)` ; `getNotifications()` / `saveNotifications(a)` — or fold the read side into an extended `getConfig` that returns `{ url, configured, tokenSuffix, mcp: {enabled,port,running,hasToken}, appearance, notifications }` (token itself never included). The targeted save RPCs stay separate.

The bearer token is returned only by `revealMcpToken`/`regenerateMcpToken`
(explicit user action) — never in `getConfig`/`getMcpStatus`.

## Lifecycle & Window Management

- `openSettingsWindow()` keeps a module-level singleton ref (like `issueWindows`
  but single): if the window exists, focus it; else create a `BrowserWindow`
  loading `<startUrl>#/settings`. On close, clear the ref.
- The application menu's settings item and the `lumen:open-settings` event both
  route to `openSettingsWindow()`.
- MCP start/stop on enable/port-change/regenerate is idempotent (existing
  `startMcp`/`stopMcp` guards).

## Error Handling

- MCP enable failure (e.g. port in use) → `{ ok: false, error }` surfaced in the
  Agent access status line; the toggle reverts to off. No port roaming.
- GitLab Save/probe → existing inline error UX in the Connection pane.
- Config writes remain `0600`. Token never leaks into non-reveal RPC responses
  or error messages.
- Settings window open is best-effort; if creation fails, log and no-op.

## Testing

- **Pane components** (vitest + jsdom): each pane renders its config slice and
  calls the right save RPC on change; Agent access reflects status and handles
  the enable/port/regenerate flows; Notifications/Appearance round-trip toggles.
- **RPC handlers:** `getMcpStatus` shape; `setMcpEnabled` enable→token-generated
  + start, disable→stop, port-in-use→{ok:false}; `regenerateMcpToken` rotates +
  restarts; `saveAppearance`/`saveNotifications` preserve sibling config blocks.
- **Window:** `openSettingsWindow` singleton (second call focuses, doesn't
  re-create) — mockable like the lifecycle tests.
- **Integration:** `usePipelineNotifications` honors `osEnabled` /
  `silenceSuccess`; `useAppearance` applies the accent var + reduce-motion class.
- Run with `bunx vitest run`. Manual smoke: open via ⌘,, toggle MCP, copy token,
  verify the running status and a real MCP client connect.

## Risks

- **Native window under Electrobun:** confirm a second `BrowserWindow` on a hash
  route boots the SPA cleanly and the singleton focus/close lifecycle behaves
  (the issue windows already prove the pattern; settings is one more).
- **Accent theming reach:** swapping `--accent` only works if accent usages read
  the variable. The amber accent is already tokenized; verify the token maps to
  a single CSS variable before promising presets, else scope accent to the
  tokens that do.
- **Config/codegen:** no new GraphQL operations; the GitLab probe reuses the
  existing query. Typecheck stays green.

## Open Questions

None blocking. To settle in the plan:
- Whether to fold all read-side fields into one extended `getConfig` vs separate
  `getAppearance`/`getNotifications` (lean toward extending `getConfig` for
  reads + targeted save RPCs).
- The exact accent preset set and whether density is included in Appearance v1
  (current lean scope: accent + reduce-motion only).
