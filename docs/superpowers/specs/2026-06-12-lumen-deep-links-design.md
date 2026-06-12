# Lumen `lumen://` deep links — design

**Date:** 2026-06-12
**Status:** Approved (pending spec review)
**Scope:** v1 — issues only (issue detail as a sheet, issues list with filters/grouping)

## Summary

Register the `lumen://` URL scheme with macOS so links open the app and route it to
the referenced issue or filtered issues list. The scheme name is deliberately shared
with the MCP resource URIs already exposed by the in-app MCP server
(`lumen://issue/{+projectPath}/{iid}`), giving one consistent addressing vocabulary
across "the agent reads it" (MCP resource) and "a human/app opens it" (OS deep link).

The feature is fundamentally a **URL translation** problem, not new UI: the in-app
state it targets is already URL-encoded. The issue "sheet" is `?issue=<iid>` on the
issues-list route, and list filters/grouping are the existing query keys on that same
route. So a deep link is parsed into a structured intent, then pushed onto the app's
router; the existing drawer and filter composables react exactly as they would to any
in-app navigation.

## Motivation

- Clickable `lumen://` links from notifications, other apps, scripts, or the agent's
  own MCP resource URIs should focus Lumen on the right issue, instead of macOS
  reporting "no application set to open the URL".
- Aligns the OS-level addressing with the MCP resource URIs, so the same string a
  client reads as a resource can also be opened by a human.

## Goals

- `lumen://issue/{project}/{iid}` → focus Lumen, open issue `{iid}` as the **sheet**
  over the issues list (not the full-page detail route).
- `lumen://issues/{project}?{filters}` → focus Lumen, show the issues list for
  `{project}` with the given filters/grouping applied.
- If a native popout window for that exact issue is already open, focus it instead of
  routing the main window ("reuse popout if open").
- Strict validation: untrusted input must not be able to do anything beyond navigating
  the user's own app within their connected GitLab.
- Cold start: a link that launches the app (before the main window has mounted) is
  buffered and replayed once the app is ready.

## Non-goals (v1)

- **Merge requests.** `lumen://mr/...` is a trivial symmetric addition deferred to a
  later iteration (see Future work). v1 is issues only.
- **Windows / Linux.** Electrobun 1.18.1 only registers custom URL schemes on macOS;
  the handler is harmless no-op surface on other platforms.
- **Mutating actions.** Deep links only navigate. No create/edit/delete via URL.
- **Opening fresh popout windows from a link.** A link routes the main window (or
  focuses an existing popout). It never spawns a new popout. (The in-app "expand"
  affordance remains the way to pop an issue out.)

## URL scheme (the contract)

Parsed with `new URL(raw)`: the **host** segment is the kind, the **path** is the rest.
Project paths are multi-segment (`group/sub/repo`), matching the MCP resource URIs'
greedy `{+projectPath}` split — for `issue`, project = all path segments except the
last, iid = last; for `issues`, project = the whole path.

| URL | Intent | Resulting route |
| --- | --- | --- |
| `lumen://issue/group/repo/42` | `{kind:'issue', project:'group/repo', iid:'42'}` | `{name:'issues', params:{fullPath:'group/repo'}, query:{issue:'42'}}` |
| `lumen://issue/group/sub/repo/42` | `{kind:'issue', project:'group/sub/repo', iid:'42'}` | `{name:'issues', params:{fullPath:'group/sub/repo'}, query:{issue:'42'}}` |
| `lumen://issues/group/repo?state=opened&label=bug&group=milestone` | `{kind:'issues', project:'group/repo', query:{state,label,group}}` | `{name:'issues', params:{fullPath:'group/repo'}, query:{state,label,group}}` |
| `lumen://` · `lumen://app/current` · anything that fails validation | `{kind:'focus'}` | none — just focus the app |

List-view query keys are exactly the app's existing `FILTER_KEYS` (`useIssueFilters.ts`):
`state, label, assignee, author, q, sort, group, view, scope`. The parser whitelists
these and passes them through verbatim; any other key is dropped.

## Architecture

Three small, independently-testable units.

### 1. Parser — `src/shared/lib/deepLink.ts` (pure; the trust boundary)

```
export type DeepLinkIntent =
  | { kind: 'issue';  project: string; iid: string }
  | { kind: 'issues'; project: string; query: Record<string, string | string[]> }
  | { kind: 'focus' }

export function parseLumenUrl(raw: string): DeepLinkIntent   // never throws; junk → {kind:'focus'}
export function intentToLocation(i: DeepLinkIntent):         // host maps intent → router location before forwarding
  { name: 'issues'; params: { fullPath: string }; query: Record<string, string | string[]> } | null
```

Pure, no Vue/Electrobun imports, so it is used by the host (relative import, the way
`index.ts` already imports `../shared/lib/gitlabQueries`) and is exhaustively unit-tested.
`intentToLocation` returns `null` for `{kind:'focus'}`. The host maps intent → location and
forwards the ready location; the webview side stays dumb (it receives a location and pushes
it, no parsing).

**Validation (all failures collapse to `{kind:'focus'}`):**
- scheme must be `lumen:`
- `iid` matches `^\d+$`
- each project segment matches `^[A-Za-z0-9._-]+$`, no empty segments, no `.`/`..`
  segment (path-traversal guard)
- list query: only `FILTER_KEYS`; values are string or string[]; each value ≤ 200 chars;
  arrays capped at 20 entries; everything else dropped

### 2. Host — scheme registration + `open-url` handler

- `electrobun.config.ts`: add `app.urlSchemes: ['lumen']`. (macOS-only; Electrobun only
  registers the scheme when the app runs from `/Applications`.)
- `src/bun/deepLinkHost.ts`: a small, injected helper (mirrors the `setHostActions`
  dependency-injection pattern so it does not import the entrypoint). Exposes:
  - `handleOpenUrl(raw)`: `parseLumenUrl` → if `kind:'issue'` and the host's
    `issueWindows` map already has `${project}#${iid}` → focus that popout; else focus
    the main window and forward `intentToLocation(intent)` to the main webview via the
    dedicated channel (below). `kind:'focus'` → focus the main window only.
  - A `mainReady` flag + pending queue: `open-url` can fire before the main webview has
    mounted (cold launch). Until ready, buffer the raw URL; flush on readiness.
- `src/bun/index.ts`: wire `Electrobun.events.on('open-url', e => deepLink.handleOpenUrl(e.data.url))`,
  inject the host capabilities it needs (`hasIssueWindow(key)`, `focusIssueWindow(key)`,
  `focusMain()`, `driveMain(js)`), and mark `mainReady` + flush from the existing
  `reportAppState` handler's `isMain` branch (the first report is the readiness signal).

### 3. Webview — dedicated deep-link channel

- Host → webview transport: a `lumen:deeplink` CustomEvent (its **own** channel, not the
  MCP `lumen:mcp-command` bridge — keeps deep-link routing conceptually separate). A
  `buildDeepLinkJs(location)` helper builds the `executeJavascript` payload; escaping is
  owned by `JSON.stringify` (no string interpolation of untrusted data into JS).
- `src/shared/composables/useDeepLinkRoute.ts`: installs a `lumen:deeplink` listener that
  `router.push(location)`s, uninstall + reset for tests. Installed for the main window in
  `main.ts` alongside `useAppStateReport` / `useMcpCacheSync`.

### Data flow

```
macOS open 'lumen://issue/group/repo/42'
  → Electrobun 'open-url' (e.data.url)
  → host deepLinkHost.handleOpenUrl
      parseLumenUrl → {kind:'issue', project:'group/repo', iid:'42'}
      issueWindows.has('group/repo#42') ?
        yes → focusIssueWindow('group/repo#42')            [reuse popout]
        no  → focusMain(); driveMain(buildDeepLinkJs(loc))
  → webview 'lumen:deeplink' (loc)
  → useDeepLinkRoute → router.push({name:'issues', params:{fullPath:'group/repo'}, query:{issue:'42'}})
  → useIssueDrawerRoute sees ?issue=42 → drawer/sheet opens
```

## Edge cases

- **Cold start (app not running):** link launches the app; `open-url` may precede the
  main webview mount. Host buffers raw URLs until `mainReady`, then flushes (parse +
  route each). At cold start no popout can pre-exist, so issue links always route the
  main window after readiness.
- **Not connected to GitLab:** the router `beforeEach` guard redirects unconfigured
  users to `/connect`. A deep link still focuses the app; the route push is redirected to
  Connect by the existing guard. No crash, no special-casing.
- **Unknown / malformed link:** `{kind:'focus'}` → focus the app, ignore the route
  silently. Never surfaces an error to the user (a stray `lumen://` from a webpage should
  be inert, not noisy).
- **Dev builds:** the scheme is not OS-registered for non-`/Applications` builds, so dev
  runs simply never receive `open-url`. Logic is covered by unit tests; the OS hop is a
  manual smoke test on an installed build.

## Security / threat model

Deep links are untrusted input — any web page or app can fire `lumen://…`. Mitigations:

- The parser is the single trust boundary; every failure mode collapses to `{kind:'focus'}`.
- Strict allow-lists: numeric iid, constrained project charset with explicit `.`/`..`
  traversal rejection, `FILTER_KEYS`-only query with length caps.
- No string interpolation of untrusted data into executed JS — the route location crosses
  the bridge via `JSON.stringify` only.
- The maximum achievable effect is navigating the user's own app to a list/issue within
  their already-connected GitLab. No mutation, no popout spawning, no arbitrary route
  (only the `issues` route is reachable).

## Testing

- **Parser (`deepLink.test.ts`):** valid issue / multi-segment / issues+filters shapes;
  non-numeric iid → focus; junk/unknown keys dropped; traversal attempts
  (`lumen://issue/../../x/1`) → focus; bare/`app/current` → focus; `intentToLocation`
  mapping incl. `null` for focus.
- **Host (`deepLinkHost.test.ts`):** popout-reuse vs forward decision with a stub host;
  cold-start queue buffers then flushes on readiness; `focus` intent focuses only.
- **Webview (`useDeepLinkRoute.test.ts`):** a `lumen:deeplink` event triggers the
  expected `router.push`; teardown removes the listener.
- **End-to-end:** `open 'lumen://issue/group/repo/42'` on an installed build — documented
  manual smoke test (Electrobun won't register the scheme for dev builds).

## Files

New:
- `src/shared/lib/deepLink.ts` (+ `.test.ts`)
- `src/bun/deepLinkHost.ts` (+ `.test.ts`)
- `src/shared/composables/useDeepLinkRoute.ts` (+ `.test.ts`)

Modified:
- `electrobun.config.ts` — `app.urlSchemes: ['lumen']`
- `src/bun/index.ts` — `open-url` wiring, host capability injection, `mainReady` flush
- `src/main.ts` — install `useDeepLinkRoute` for the main window
- `docs/deep-links.md` (new) — document the scheme, URL shapes, and the manual smoke test

## Future work

- **Merge requests:** add `lumen://mr/{project}/{iid}` → `merge-request` route and
  `lumen://merge-requests/{project}?{filters}`, mirroring the issue shapes. The parser
  gains two `kind`s; the host/webview routing is unchanged in shape.
- **Live MCP resource refresh:** unrelated but adjacent — emit
  `notifications/resources/list_changed` / a `lumen://app/current` subscription when the
  app navigates, so an agent's view stays fresh. Out of scope here.
