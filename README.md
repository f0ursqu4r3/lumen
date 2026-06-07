# Lumen

A fast, keyboard-friendly **desktop GitLab issue tracker** for self-hosted instances — built with [Electrobun](https://www.electrobun.dev/) (Bun + the OS-native webview) and a Vue 3 + TypeScript front end. Refined-dark, Linear-class UI; your token never leaves the host process.

> Status: pre-release (`0.1.0`), single-user, personal project. Targets self-hosted GitLab, including instances behind an internal CA.

---

## Why

GitLab's web UI is heavy for the day-to-day loop of triaging, editing, and assigning issues. Lumen is a focused native shell over the GitLab GraphQL + REST APIs: it opens fast, keeps a warm on-disk cache, renders issues as a clean list **or** board, and stays usable when the server hiccups.

## Features

- **Projects** — starred / assigned sections, infinite-scroll browser, keyboard launch.
- **Issues, list or board** — filter (author, assignee, unassigned, labels), sort (priority / title / updated / created), group, and drag to reorder groups & columns. Board drag moves issues across status / assignee / label lanes with optimistic updates.
- **Issue detail** — opens inline as a slide-over drawer, full-page, or in its own **native window**; rendered Markdown title/description with per-field edit toggle; buffered Save/Cancel with unsaved-changes confirmation.
- **Editing** — create via the composer (⌘↵), edit title/description/labels/assignees, post comments folded into the same Save, threaded discussions and replies.
- **Assignees** — full editor plus a one-tap quick-assign; bots filtered, contributors and members grouped.
- **Labels** — grouped scoped-label flyout with scoped-exclusive toggling.
- **Media** — inline images, video, audio, and file chips; pop-out lightbox viewer; uploads stream through the host (PAT-authenticated). Avatars render as initials by design.
- **Pipelines** — per-project pipeline list with stages and job detail, in-flight indicator, and desktop notifications when a watched pipeline finishes.
- **Scratchpad** — local-only, per-issue notes (never sent to GitLab), collapsible with a content marker.
- **Bulk actions & multi-window** — multi-select issues for bulk operations and open a combined window across several issues.
- **Saved views & persistence** — name filter/sort/group/scope combinations; view state is URL-encoded and restored from `localStorage`; the query cache is persisted to disk between launches.
- **Resilient sessions** — distinguishes **server unavailable** from **token invalid**: an unreachable server shows a quiet, self-healing "retrying…" banner (2s → 5s → 15s backoff) instead of wrongly prompting for a new token; only a real `401/403` raises the re-connect overlay.

## Architecture

Lumen runs as two processes that talk over a typed RPC bridge:

```text
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Webview (Vue 3 SPA)         │        │  Host (Bun, src/bun)         │
│  src/mainview, src/views,    │  RPC   │  • holds the token + URL     │
│  src/features, src/shared    │ ─────► │  • fetches GitLab GraphQL    │
│  • graphql-request + REST    │ ◄───── │    + REST (TLS-relaxed for   │
│    via a fetch shim → RPC    │        │    internal CAs)             │
│  • @tanstack/vue-query cache │        │  • config in app-support dir │
│    (persisted to disk)       │        │  • native menu, windows,     │
│                              │        │    notifications             │
└─────────────────────────────┘        └──────────────────────────────┘
```

- **The token lives only in the host.** It is read fresh from `~/<app-support>/Lumen/config.json` (mode `0600`) on every request and attached host-side; the webview never sees it. Swapping a token takes effect on the next request — nothing needs restarting.
- **GraphQL** uses `graphql-request` for query construction and `ClientError` semantics, but its transport is swapped for an RPC round-trip to the host; the upstream HTTP status is preserved so errors classify correctly (`auth` / `unavailable` / `graphql` / `network`).
- **Errors** are normalized to a small union: `401/403 → auth`, `5xx` and transport failures → `unavailable` (the host returns a `503` sentinel when `fetch` throws), `404`/other → `network`.

### Source layout

| Path                | What's there                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/bun/`          | Host process: config, GitLab fetch handlers, native menu/windows/notifications                                               |
| `src/mainview/`     | Webview entry that boots the SPA                                                                                             |
| `src/gitlab/`       | API client, error normalization, REST helpers, codegen output (`generated/`, gitignored)                                     |
| `src/views/`        | Route components (Connect, ProjectPicker, IssueList, IssueDetail, PipelineList, MultiIssueWindow)                            |
| `src/features/`     | Feature modules (`issues`, `assignees`, `labels`, `pipelines`, `projects`) — each with `components/`, `composables/`, `lib/` |
| `src/shared/`       | Cross-cutting `components`, `composables`, `lib`, `ui` (shadcn-vue / reka-ui primitives), RPC contract                       |
| `src/router/`       | Hash router + config guard                                                                                                   |
| `docs/superpowers/` | Design specs and implementation plans                                                                                        |

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) (runtime, package manager, and Electrobun's engine)
- A self-hosted GitLab instance and a **Personal Access Token** with the `api` scope

### Install

```bash
bun install
```

### Configure

On first run, Lumen imports `GITLAB_URL` and `GITLAB_TOKEN` from the environment if its config file doesn't exist yet; otherwise you connect through the in-app **Connect** screen (or **Settings → Connection**). For local development you can export them:

```bash
export GITLAB_URL="https://gitlab.example.com"
export GITLAB_TOKEN="glpat-…"   # api scope
```

The values are persisted to the OS app-support directory after the first successful connect:

| OS      | Path                                              |
| ------- | ------------------------------------------------- |
| macOS   | `~/Library/Application Support/Lumen/config.json` |
| Linux   | `~/.config/Lumen/config.json`                     |
| Windows | `%APPDATA%\Lumen\config.json`                     |

> **Internal CAs:** the host fetches with TLS verification relaxed so instances behind a corporate/internal certificate authority work out of the box.

### GraphQL codegen

Typed GraphQL documents are generated into `src/gitlab/generated/` (gitignored). Because codegen introspects your live instance, run it yourself after changing any query — TypeScript will show errors against the generated types until you do:

```bash
bun codegen   # uses GITLAB_URL / GITLAB_TOKEN; TLS verification disabled
```

### Run

```bash
bun run dev       # Vite dev server (browser, host RPC stubbed/unavailable)
bun run app:dev   # build the webview, then launch the Electrobun desktop app
bun run app:hmr   # desktop app against the live Vite dev server (HMR)
bun run build     # typecheck + Vite build + package the desktop app
```

## Development

| Command             | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `bunx vitest run`   | Run the test suite once (**use this**, not `bun test` or `bun run test`) |
| `bun run typecheck` | `vue-tsc --noEmit`                                                       |
| `bun run format`    | Prettier over `src/` (single quotes, no semicolons, width 100)           |
| `bun run codegen`   | Regenerate GraphQL types from the live instance                          |

Tests use Vitest + `@vue/test-utils` + jsdom; the suite covers error classification, the session/recovery state machine, composables, and components.

## Code signing & distribution

`bun run build` is a **dev build and is never signed** (it prints `skipping codesign`; Electrobun can't codesign the dev launcher). It runs fine where it's built, but a copy that's *downloaded* (e.g. shared over Teams/email) gets quarantined and macOS shows **"… is damaged and can't be opened."**

Signing happens on **release builds** — `bun run dist` (`electrobun build --env=canary`, produces `build/canary-macos-arm64/Lumen-canary.app`) — and is opt-in via env vars read by `electrobun.config.ts`.

**Self-signed (local / quick).** Produces a valid signature, which turns the hard "damaged" wall into the softer "unidentified developer" (open via right-click → Open). It does **not** fully satisfy Gatekeeper (`spctl` still reports `rejected`).

```bash
bun run sign-cert                                   # one-time: mints "Lumen Self-Signed" in your login keychain
export ELECTROBUN_DEVELOPER_ID="Lumen Self-Signed"
bun run dist                                        # release build, now signed
```

**Apple Developer ID + notarization (real fix).** The only path that lets a downloaded app open with no warning. Requires an Apple Developer account (a *Developer ID Application* certificate — note an "Apple Development" cert is not enough).

```bash
export ELECTROBUN_DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)"
# plus Apple ID creds (or an App Store Connect API key):
export ELECTROBUN_APPLEID="you@example.com"
export ELECTROBUN_APPLEIDPASS="app-specific-password"
export ELECTROBUN_TEAMID="TEAMID"
bun run dist                                        # signs, notarizes, and staples
```

Notarization turns on automatically only when both the identity and Apple creds are present. (`bun run dist` defaults to the `canary` channel; use `electrobun build --env=stable` for a `Lumen.app`-named release.)

**Recipient workaround (any unsigned/quarantined copy).** De-quarantine the app:

```bash
xattr -dr com.apple.quarantine /path/to/Lumen.app
```

## Design

The visual language is documented in [`.impeccable.md`](.impeccable.md): a refined-dark, Linear-class aesthetic with an amber accent, **Hanken Grotesk** for UI text and **Geist Mono** for code and labels. UI primitives are shadcn-vue / [reka-ui](https://reka-ui.com/); styling is Tailwind CSS v4.

## Tech stack

Vue 3 · TypeScript · Vite 6 · Tailwind CSS v4 · @tanstack/vue-query · vue-router · graphql-request · reka-ui / shadcn-vue · Electrobun · Bun · Vitest

## License

Private / unlicensed — personal project.
