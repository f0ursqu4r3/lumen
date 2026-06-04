# tragit → Electrobun port — design

**Date:** 2026-06-04
**Status:** Approved (design)

## Goal

Turn tragit (a Vue 3 + TypeScript + Tailwind v4 UI over a self-hosted GitLab,
currently run via `bun dev`) into a real, installable, cross-platform desktop
app using [Electrobun](https://blackboard.sh/electrobun/). Four user-stated
drivers:

1. A real installable app (double-click an icon, not `bun dev`).
2. The GitLab PAT secured at rest, out of `.env`-read-by-Vite.
3. Native window feel (window chrome, menus).
4. Offline / persistence (cache survives restart, shows instantly).

## Guiding principle

The Vue / Tailwind / vue-query application changes as little as possible. Vite
still builds the frontend. We replace exactly one thing — the **transport** that
used to be Vite's token-injecting dev-server proxy — and wrap the app in a native
Electrobun shell whose Bun main process becomes the new runtime that holds the
token and talks to GitLab.

### Why the proxy is the crux

Today (`vite.config.ts`) the dev server proxies `/gitlab/*` → `${GITLAB_URL}/api/*`,
attaches the `PRIVATE-TOKEN` header server-side, and disables upstream TLS
verification for the internal-CA cert. The frontend therefore makes
**token-less, same-origin, relative-path** requests:

- `src/gitlab/client.ts` — `graphql-request` client pointed at `/gitlab/graphql`.
- `src/gitlab/rest.ts` — `fetch('/gitlab/v4...')` for star/unstar, assigned/starred projects.
- `src/lib/markdown.ts` — rewrites `/uploads/...` image hrefs to `/gitlab/v4/projects/.../uploads/...`
  which are then loaded as `<img src>` through the same proxy.

In Electrobun there is no HTTP server intercepting `/gitlab`. Those three seams
must be re-pointed at the Bun main process.

## Decisions (locked)

| Topic | Decision |
|---|---|
| GraphQL/REST transport | **RPC via Bun.** Webview → Electrobun typed RPC → Bun does the upstream fetch holding the token. Token never enters the webview. |
| Token at rest | **App-support config file** (JSON in the OS app-support dir, written/read by Bun). |
| Platforms | **Cross-platform** (mac + Windows + Linux build targets configured now). |
| Persistence | **Disk-persisted query cache** via `@tanstack/query-persist-client-core` + localStorage persister. |
| graphql-request | **Kept**, given a custom `fetch` — no query call-site changes. |
| Asset/image loading | **RPC → blob URL** (uses only confirmed Electrobun APIs). Custom-scheme handler is a later simplification if the API proves clean. |

## Architecture

```
┌─────────────────────────────── Electrobun app bundle ───────────────────────────────┐
│                                                                                       │
│   Bun main process (src/bun/)               Webview (Vite-built Vue app, views://)    │
│   ┌──────────────────────────┐  typed RPC   ┌──────────────────────────────────────┐ │
│   │ config.ts  (app-support  │◀────────────▶│ src/lib/rpc.ts (Electroview client)   │ │
│   │            JSON: url+PAT) │              │   │                                   │ │
│   │ index.ts   (BrowserWindow,│              │   ├─ gitlab/client.ts (graphql-request │ │
│   │            menu, RPC)     │              │   │   w/ custom rpc fetch)            │ │
│   │                          │              │   ├─ gitlab/rest.ts  (rpc-backed)      │ │
│   │ RPC handlers:            │              │   ├─ useGitlabAsset() → blob URLs      │ │
│   │  gitlabGraphql           │   fetch +    │   ├─ views/SettingsView (onboarding)   │ │
│   │  gitlabRest    ──────────┼── token +────┼─▶ GitLab │ persisted vue-query cache    │ │
│   │  gitlabAsset             │   TLS-off    │   └──────────────────────────────────┘ │
│   │  getConfig/saveConfig    │              │                                         │ │
│   └──────────────────────────┘              └──────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Shell & build — Vite stays

- Add `electrobun` dependency.
- New `electrobun.config.ts`:
  - `app`: name, identifier (e.g. `com.kdougan.tragit`), version, URL schemes.
  - `build.bun.entrypoint`: `src/bun/index.ts`.
  - `build.views.mainview.entrypoint`: a thin loader the framework needs; the
    actual UI is the Vite output copied in via `build.copy`.
  - `build.copy`: `dist/index.html → views/mainview/index.html`,
    `dist/assets/ → views/mainview/assets/`.
  - `build.mac` / `build.win` / `build.linux` target stanzas.
  - `runtime.exitOnLastWindowClosed: true`.
- `package.json` scripts:
  - `build` → `vite build && electrobun build` (Vite first so assets exist before Electrobun bundles).
  - `dev` → electrobun watch/relaunch.
  - `dev:hmr` → Vite dev server (5173) + electrobun concurrently.
- `vite.config.ts`: keep Vue + Tailwind + `@` alias; **remove the `server.proxy` block**
  (the runtime no longer lives there). Vite output stays a relative-path SPA so it
  loads correctly under the `views://` origin (confirm `base: './'` if needed).

### 2. Bun main process — `src/bun/`

- `index.ts`:
  - Load config (§3). Create a `BrowserWindow`.
  - **Prod:** load `views://mainview/index.html`.
  - **Dev:** probe `http://localhost:5173`; if it responds, load that (HMR), else
    fall back to `views://`. (This probe is our own code, not a framework feature.)
  - Native application menu; `exitOnLastWindowClosed`.
  - Register RPC handlers.
- **RPC handlers** (the new runtime; the only place the token lives in memory):
  - `gitlabGraphql({ query, variables })` → `fetch(`${url}/api/graphql`, { method:'POST', headers:{ 'PRIVATE-TOKEN': token, 'Content-Type':'application/json' }, body, tls:{ rejectUnauthorized:false } })` → return `{ data, errors }`.
  - `gitlabRest({ method, path })` → `fetch(`${url}/api${path}`, …)` mirroring today's `rest.ts` semantics (text-or-empty body, 401/403 → auth error mapping). Returns `{ ok, status, statusText, body }`.
  - `gitlabAsset({ path })` → fetch the upload bytes with the token → return `{ bytes, contentType }` (bytes as base64 or transferable ArrayBuffer per the RPC channel's capability).
  - `getConfig()` → `{ url, configured: boolean }` (never returns the token to the webview).
  - `saveConfig({ url, token })`, `clearConfig()`.

### 3. Config & secrets — `src/bun/config.ts`

- JSON file at the OS app-support directory (cross-platform path resolved via
  Electrobun's app paths or `os.homedir()` + platform conventions).
- Shape: `{ gitlabUrl: string, token: string }`.
- First-run resolution order: existing config file → else import from `.env`
  (`GITLAB_URL` / `GITLAB_TOKEN`, dev convenience) → else unconfigured (triggers
  onboarding). On `saveConfig`, the `.env` is never written back to.
- The token is **only** ever read/held by the Bun process and used in outbound
  fetches; it is never sent over RPC to the webview.

### 4. Frontend transport seam — `src/lib/rpc.ts`, `client.ts`, `rest.ts`

- `src/lib/rpc.ts`: instantiate Electrobun's webview RPC client (`Electroview` /
  `createRPC` — exact name pinned during impl) with typed request signatures
  shared in shape with the Bun handlers. Exposes `rpc.gitlabGraphql`,
  `rpc.gitlabRest`, `rpc.gitlabAsset`, `rpc.getConfig`, `rpc.saveConfig`.
- `src/gitlab/client.ts`: keep `new GraphQLClient(...)` but pass `{ fetch: rpcGraphqlFetch }`.
  `rpcGraphqlFetch(_url, init)` parses `init.body` (`{query,variables}`), calls
  `rpc.gitlabGraphql`, and returns a synthetic `Response` whose `.json()` yields
  `{data,errors}`. **No changes at any typed-query call site.**
- `src/gitlab/rest.ts`: replace the internal `fetch('/gitlab/v4'+path)` with a call
  to `rpc.gitlabRest`, preserving the existing `restGet`/`restPost` exports and the
  `httpError`/`normalizeError` mapping (now keyed off the RPC result's `status`).

### 5. Assets / images — `useGitlabAsset` + render hooks

- `src/composables/useGitlabAsset.ts`: `path → ArrayBuffer (via rpc.gitlabAsset) →
  Blob → URL.createObjectURL`. Memoize per path (module-level cache), revoke on
  unmount / cache eviction.
- `src/lib/markdown.ts`: unchanged — it already emits the rewritten gitlab path
  into `data-media-src` on every media element.
- `MarkdownText.vue`: after render, walk `[data-media-src]` elements and set each
  real `src` (img/video/audio) and file-card `href` to the resolved blob URL from
  `useGitlabAsset`.
- `MediaViewer.vue`: resolve `item.src` (which is the same rewritten path) through
  `useGitlabAsset` before binding to `<img>/<video>`.

### 6. Onboarding / settings

- `src/views/SettingsView.vue` + a `/settings` route.
- Router guard: if `rpc.getConfig()` reports unconfigured, redirect to `/settings`.
- Form: `GITLAB_URL` + PAT, "Test connection" (issues a cheap GraphQL query through
  the new transport), then `saveConfig` and proceed.
- Native menu item (and a keyboard shortcut consistent with the app's existing
  command surface) to reopen settings.

### 7. Persistence

- Add `@tanstack/query-persist-client-core`. Wrap the existing vue-query client
  with a localStorage-backed `Persister` (native webview localStorage is
  disk-backed per app → survives restart, instant offline render).
- `buster` keyed on `gitlabUrl` (+ a token fingerprint) so switching instances or
  rotating the token invalidates stale cache. Set a sane `maxAge`.
- Upgrade path (not built now): swap the persister for an async one that writes to
  a Bun-managed file via RPC if the cache outgrows localStorage limits.

## Error handling

- RPC handler failures (network down, GitLab unreachable, TLS) surface as
  structured results the frontend maps with the **existing** `errors.ts`
  (`normalizeError`, `GitLabError` kinds: `auth` / `network`). 401/403 from
  `gitlabRest`/`gitlabGraphql` → `auth` kind → nudge toward Settings.
- Unconfigured state is a first-class path (onboarding), not an error.
- Asset fetch failure → broken-image fallback in `useGitlabAsset` (no app crash).

## Testing

- Existing vitest (jsdom) component + pure-function suites keep passing — UI logic
  and `lib/markdown.ts` are untouched.
- New tests:
  - Transport shim: `rpcGraphqlFetch` builds the right RPC call and adapts the
    response; `rest.ts` maps RPC results to `restGet/restPost` + error kinds (mock RPC).
  - `config.ts`: read / write / first-run `.env` import (Bun test).
  - `useGitlabAsset`: path → blob URL, memoization, revoke.

## Cross-platform & open items

- TLS bypass lives in the Bun `fetch` options → platform-agnostic. Win = WebView2,
  Linux = GTK WebKit, mac = WKWebView. Code-signing / notarization deferred
  (personal use).
- **Pinned during implementation against the installed `electrobun` types/docs:**
  exact RPC API surface (`createRPC` / `defineRPC` / `Electroview`), `BrowserWindow`
  loading API, and the precise `electrobun.config.ts` schema field names. The
  dev-server `localhost:5173` probe is our own code in the Bun entry.

## Out of scope (YAGNI)

- Auto-update / delta patching (Electrobun supports it; not needed for v1).
- OS keychain integration (explicitly chose the app-support file).
- Custom URL-scheme asset handler (blob-URL approach ships first).
- Multi-window / tray.
