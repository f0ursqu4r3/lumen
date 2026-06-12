# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-12

The first feature wave on top of the desktop port — a unified app shell, merge
requests, a My Work dashboard, a command palette, an MCP server agents can
connect to, a 16-theme engine, and a top-to-bottom **Chassis / Phosphor**
restyle. Milestones are grouped newest first.

### OS deep linking

#### Added

- A `lumen://` URL scheme (registered on macOS) opens issues, merge requests,
  and views from outside the app. A pure parser/route-mapper feeds a host
  open-url router that reuses an existing popout when one matches and queues
  links that arrive before the app is ready (cold start); the webview applies
  the resolved route client-side via a `lumen:deeplink` router.

### Chassis & Phosphor restyle

#### Changed

- New **Chassis** visual identity — a hardware-instrument look: steel palette,
  orange accent, seam shadows, plates, printed-label chips, squared badges, and
  key-press buttons. Chassis is now the default theme.
- A custom **ChassisBar** titlebar replaces the OS titlebar (`hiddenInset`) on
  every window, with a drag region, wordmark, and a liveness lamp; traffic-light
  spacing tuned for the macOS controls.

#### Added

- A **Phosphor** terminal idiom — bracketed statuses, glyph priorities,
  de-chroma'd chips, and plates flattened to ruled rows — applied through a
  `data-idiom` CSS layer and a `useIdiom` composable.

### Window & session restore

#### Added

- **Restore on startup** (default on): the app captures window geometry and
  reopens your windows and their routes on launch, gated by a safe-route
  allowlist. The settings window opens centered on the current display. Toggle
  in Settings → General.

### Agent access — MCP server

#### Added

- An in-app **MCP server** (loopback + bearer token) exposing a GitLab tool
  catalog — issues, merge requests, labels, milestones, users, and search —
  alongside the app-control tools, with start/stop lifecycle and status / token
  reveal & regenerate in settings.
- One-click **Connect** cards wire **Claude Code** and **Codex** to the server
  (Codex via `http_headers`); `~/.claude.json` is backed up before it's edited.
- **Comment-edit** tools (own comments only) for issues and merge requests, and
  **resource discovery** exposing app / issue / MR resources.

#### Changed

- MCP writes broadcast a cache invalidation to every window, so open issue views
  refresh after an agent edits them.

### Editable comments

#### Added

- Inline **edit your own comments** on issues and merge requests, backed by
  note-update mutations.

### Themes & Appearance

#### Added

- **16 selectable themes** with an Appearance gallery, plus per-theme override
  controls (accent, radius, density, font). An anti-flash inline boot script
  applies the theme before first paint, and theme changes sync across windows.

#### Changed

- `:root` is now the default theme (the `.dark` selector is retired); glows and
  the canvas gradient are driven by the `--primary` token.

### Settings window

#### Changed

- Settings moved from a modal into a dedicated, routed **window** (centered on
  the current display) with a two-pane shell and a pane registry.

#### Added

- **Connection**, **Agent access (MCP)**, **Appearance**, **Data & cache**,
  **About**, and **General** panes.

### File attachments

#### Added

- **Attach files** by paste, drag-and-drop, or picker in the composer,
  description, and comments. Uploads go through a host multipart handler to
  GitLab's uploads endpoint; non-image attachments render as downloadable
  file-cards, and a finished upload is never silently lost if its placeholder was
  removed mid-flight.

### Unified app shell

#### Added

- A consistent **app shell**: a global icon rail, a contextual top bar with
  breadcrumbs, project **tabs** (Issues / Merge requests / Pipelines), and a
  bottom **status dock**. Shared manual refresh across issues, MRs, and
  pipelines; the issue save/revert control became a full-width docked bar.

#### Changed

- Retired the bespoke per-view list headers in favor of the shell's top bar.

### My Work dashboard

#### Added

- **My Work** is the new home route — three lanes (assigned issues, assigned
  MRs, review-requested MRs) with cross-project rows, each with its own loading /
  empty / error state. The project picker moved to `/projects`; dashboard issue
  rows open as a sheet over their project's list.

### Merge requests

#### Added

- **Merge requests** browse + triage: a filterable list with saved views and
  sort options, a detail view with discussions and reply, state badges
  (draft / merged precedence), and unresolved-discussion notes. Jump to and
  search merge requests from the command palette.

### Command palette

#### Added

- A **command palette** navigator (combobox/listbox a11y): actions, views,
  debounced current-project issue search, and MR jump, rendered as a sectioned
  list with footer hints and keyboard navigation. Search results are kept out of
  the persisted cache.

### Issue details rail

#### Added

- A **progressive-disclosure details rail**: a field-descriptor registry with
  visibility helpers, an Add-field menu, and a per-field hover **remove**
  affordance, so the rail shows only the fields in use. Adds planning fields and
  a confidential toggle.

### Build & distribution

#### Added

- A production build script that stabilizes `.dmg` creation, and a
  `version_bump.sh` that keeps the `package.json` and `electrobun.config.ts`
  versions in sync.

## [0.1.0] - 2026-06-06

Initial development of **Lumen**, a desktop GitLab issue tracker for self-hosted
instances (Electrobun host + Vue 3 webview). Not yet tagged/released. Highlights
are grouped by milestone, newest first.

### MCP app-control tools

#### Added

- MCP app-control tools: `lumen_app_state`, `lumen_app_navigate`,
  `lumen_app_open_issue`, `lumen_app_open_issues_window`,
  `lumen_app_open_settings`, `lumen_app_notify` (20 tools total).

### Build & distribution

#### Added

- `bun run dist` — a signed **release** build (`electrobun build --env=canary`),
  separate from the dev `bun run build` (which Electrobun can't codesign).
- Opt-in macOS code signing (and notarization) wired into `electrobun.config.ts`,
  driven by env vars so the default build stays unsigned. `bun run sign-cert`
  mints a self-signed identity for local builds (`ELECTROBUN_DEVELOPER_ID`);
  Apple Developer ID + notarization turn on when Apple creds are also present. See
  README → Code signing & distribution. Addresses the "… is damaged" Gatekeeper
  error on downloaded copies (self-signed downgrades it to "unidentified
  developer"; notarization removes it entirely).

### Session resilience — server-unavailable vs token-invalid

#### Added

- Errors now carry an `unavailable` kind — 5xx responses and host transport
  failures (the latter surfaced as a `503` sentinel when the host `fetch` throws)
  — distinct from `auth` (401/403), `graphql`, and `network`. Classification is
  consistent across the GraphQL and REST paths.
- A non-blocking `ConnectionBanner` ("Can't reach GitLab — retrying…") backed by
  a self-healing recovery poll (2s → 5s → 15s backoff) that probes a cheap health
  query directly (bypassing vue-query to avoid a re-trigger loop), clears the
  banner and refetches on recovery, and escalates to the re-connect overlay if
  the probe returns 401/403.
- Connect-screen copy branches on failure kind: "Token rejected — check the token
  and its `api` scope" vs "Couldn't reach &lt;host&gt; — is the server up?"

#### Changed

- The blocking "session expired / re-enter token" overlay now fires **only** for
  genuine auth failures; an unreachable server never wrongly prompts for a new
  token. Session state enforces an auth-always-wins invariant in its setters.

#### Fixed

- **Pipeline view (and other routes) failed to open in the bundled app**
  ("Importing a module script failed") — dynamically-imported route chunks are
  flaky to fetch over the `views://` scheme. Route components are now imported
  eagerly (no per-route code-splitting), which a local desktop app pays nothing
  for and which removes the whole class of `views://` chunk-load failures.
- **Window layout polish.** The sticky details rail (Status / Labels / Assignees
  / Milestone) no longer hides its top under the window chrome — its sticky inset
  now clears the pager and condensed-title bar in both windows. The combined
  window's pager header is now a true viewport full-bleed, so its rule reaches the
  edges even when the window is wider than the content max-width.
- **Blank popout windows in the bundled app.** Per-issue and combined native
  windows came up blank under the `views://` scheme (they worked over `http://`
  in dev) because the route was carried in the initial URL fragment, which the
  scheme can't load. Popouts now load the bare app and receive their route from
  the host via a new `getInitialRoute` RPC, applied client-side before the router
  mounts — no fragment, no flash. URL builders became route builders
  (`issueWindowRoute` / `issuesWindowRoute`).
- **False "session expired" overlay.** A single auth error — a transient 401 or
  a forbidden (403) sub-resource — no longer logs the user out. `installAuthWatch`
  now confirms with one authoritative probe before latching the blocking overlay:
  only a probe that also fails auth latches; a clean probe proves the token is
  valid (the error stays local), and an unreachable probe shows the banner
  instead. `probeServer` moved to `useSession` and is shared with the recovery
  poll.
- Resolved pre-existing `vue-tsc` errors that blocked `bun run build`: dropped
  unused imports/bindings (`StatusPicker`, `PipelineRow`), narrowed `boardScope`
  to `GroupKey` at the `planBoardMove` call sites, constrained the saved-views
  `Slice` generic to `ViewSlice`, and shimmed Electrobun's untyped transitive
  `three` import. Build (`vue-tsc` + Vite + Electrobun package) now succeeds; full
  suite green (553 tests).

### Bulk actions, reorder & multi-window

#### Added

- Native windows: a condensed sticky issue title appears once the main title
  scrolls out of view, in both the single-issue and combined windows (IssueDetail
  owns it via an IntersectionObserver; the combined window pins it just below its
  pager header). The combined-window pager header is also full-bleed.
- Drag-to-reorder for issue-list groups and board columns, on pointer events,
  with a cursor ghost, insertion bar, lift, settle animation, and auto-scroll;
  reset-order control in the toolbar.
- Multi-select issues for bulk operations and a combined window paging across
  several issues.

### Native issue windows & pipeline detail

#### Added

- Open an issue in its own native window (per-issue, focus-existing); the
  back-arrow is suppressed in windowed mode and "expand" opens a window while
  closing the drawer.
- Pipeline stages expanded with job detail; in-flight pipelines flagged on the
  IssueList Pipelines button.

### Desktop app (Electrobun port)

#### Added

- Ported Lumen from a browser SPA to an **Electrobun desktop app**. The Bun host
  holds the token + URL, performs all GitLab GraphQL/REST fetches, and exposes a
  typed RPC contract to the webview; GraphQL is routed through a fetch shim that
  preserves the upstream status.
- App-support config with first-run env import; native application menu
  (copy/paste, ⌘, , developer mode); disk-persisted vue-query cache; assets and
  rendered-Markdown media resolved to blob URLs over RPC.
- Settings dialog (connection, about, cache) via ⌘, ; onboarding `/connect` route
  + config guard; explicit cache persist key with clear-cache.
- Work-item **status** management with a status picker; **board view** with
  reassignment and status updates; per-project **pipeline list** with stage dots,
  manual refresh, and finish notifications; discussion threads and replies;
  deferred image loading; external-link handling; list↔board view transitions.

#### Fixed

- Dev-server port detection in HMR mode; "Open in GitLab" and clipboard copy
  under the `views://` origin; confirm-dialog stacking behind the slide-over.

### View persistence, media & discussions

#### Added

- Issue-list view state (sort / group / view / scope + filters) persisted to
  `localStorage` and restored on arrival, URL-encoded, without clobbering on
  mount or project switch.
- Media pipeline: classify GitLab uploads by type; render inline video, audio,
  and file chips; pop-out `MediaViewer` lightbox in issue detail.
- Polling for issue updates with new-comment animation; contributors in the
  assignee pickers; richer loading skeletons.

### Composer, assignees, editing & filtering

#### Added

- **Issue composer** slide-over (⌘↵ submit) replacing the persistent
  quick-create bar.
- Full **AssigneeEditor** (grouped add/remove) plus a one-tap **QuickAssign**;
  assignment via `issueSetAssignees`.
- **Buffered editing**: `useIssueDraft` diff/save orchestration, editable tags,
  promise-based confirm dialog, comments posted via Save, unsaved-edit guards.
- **Filters**: URL-persisted `useIssueFilters` (author, unassigned, label),
  filter popover, grouped scoped-label flyout with scoped-exclusivity.
- Rendered title/description with per-field edit/preview toggle; Recently-created
  sort.

#### Changed

- Adopted a Prettier config (single quotes, no semicolons, width 100) across
  `src/`; renamed the app to **Lumen**.

### MVP foundation

#### Added

- Scaffolded Vue 3 + TypeScript + Tailwind v4 with GitLab error normalization,
  issue filter mapping, GraphQL codegen, and a Vue Query test harness.
- Core slices: **project picker → filtered issue list → issue detail with notes
  → issue mutations** (create, comment, state).
- Route-driven **issue drawer** opened via an `?issue` query; sanitized
  **Markdown** rendering; label chips, state badges, sorting and grouping.
- **Scratchpad**: local-only per-issue notes with a debounced "Saved" indicator.

#### Changed

- Converted the UI to shadcn-vue / reka-ui components; env loaded via Vite with
  URL normalization and internal-CA TLS handling.
