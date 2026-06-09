# Unified App Shell (v1)

**Status:** Approved design — ready for implementation plan
**Date:** 2026-06-09
**Scope:** Cross-cutting layout refactor. Introduces persistent app chrome (a slim icon rail + a contextual top bar) that frames every main-window view, replacing the per-view headers that were re-implemented across Issues / MRs / Pipelines / dashboard / picker. Single spec, phased plan.

## Goal

Replace the ad-hoc, duplicated per-view headers and inconsistent width/empty/loading treatments with one persistent shell: a constant global icon rail, a route-contextual top bar, and a standard content container. Each view keeps its own body (toolbar, list/board, detail, launcher) and feeds view-specific affordances into shell slots.

Chosen shape (decided via visual mockups): **slim global icon rail + contextual top bar**; view controls (filters/sort/saved-views) stay in the view body; detail views render inside the shell with an "open in window" pop-out.

## Non-goals (v1)

- Rail expand/collapse with text labels (icons + tooltips only)
- Multi-level breadcrumbs (one level of context is enough)
- Theming / density toggles, keyboard nav between rail items
- Any new view or new data
- Changing `MultiIssueWindow` or `ConnectView` (both stay chrome-off)

## A. Architecture & chrome mounting

A persistent **`AppShell`** wraps the routed view in `App.vue`, replacing the current `<main class="mx-auto max-w-5xl px-4 py-6"><RouterView/></main>`. The shell renders the icon rail (left, constant), the contextual top bar (top), and a content region holding `<RouterView :key="$route.path">`.

**Chrome-off rule** — these surfaces render the view WITHOUT the shell (bare container, as today):

- `route.name === 'connect'`
- `route.name === 'issues-window'`
- `route.query.window === '1'` (single issue/MR popped into its own native window)

Implemented as a `showChrome` computed in `App.vue`: static cases via `route.meta.chrome === false` on the `connect` and `issues-window` route records; the `window` query checked live. When `showChrome` is false, `App.vue` renders the view in the same minimal `<main>` container it uses today, so every native-window flow is untouched.

**Context derivation** — no new store. The top bar and tabs are pure functions of the route: `route.params.fullPath` present → project context (breadcrumb + tabs); else global context (My Work / Projects title). Active tab derives from `route.name`.

## B. Components

New shell module `src/shared/components/shell/`:

```
AppShell.vue        — rail + top bar + content region; wraps the slotted view
AppIconRail.vue     — constant global rail
AppTopBar.vue       — contextual bar (global / project-list / detail branches)
ProjectTabNav.vue   — Issues/MRs/Pipelines tab set (reads fullPath + active), uses useTabNav
ViewContainer.vue   — standard centered max-width + padding for view bodies
```

- **`AppIconRail`** (top → bottom): **My Work** → `{ name: 'home' }`; **Projects** → `{ name: 'projects' }`; **Search (⌘K)** → opens the existing command palette; spacer; **Settings** → `openSettings()`; **connection-status dot** reflecting the existing session/connection state. Icon buttons with tooltips.
- **`AppTopBar`** — three render branches:
  - **global** (no `fullPath`): title from the route (My Work / Projects) + an optional search slot.
  - **project list** (`fullPath`, list route): breadcrumb + project name + `ProjectTabNav` + a `#primary-action` slot (e.g. "+ New issue").
  - **detail** (`fullPath`, detail route): back + breadcrumb + title + a `#detail-actions` slot.
  The bar owns layout; views fill named slots for their specific affordances.
- **`ProjectTabNav`** — Issues / MRs / Pipelines tabs for a `fullPath`, active-highlighted, `useTabNav` for transitions; carries the running-pipeline adornment (sky dot + count) on the Pipelines tab.
- **`ViewContainer`** — wraps a view body in a `width`-prop'd centered container (see D).

**Removed / slimmed:**

- `src/features/issues/components/IssueListHeader.vue` — deleted (nav → `ProjectTabNav`; "+ New" → top-bar slot; count → view toolbar).
- `src/features/merge_requests/components/MergeRequestListHeader.vue` — deleted (same).
- `PipelineList.vue`'s inline header — removed; running indicator moves to `ProjectTabNav`; refresh control moves to the view's toolbar area.
- `src/features/issues/components/IssueMasthead.vue` — slimmed: repo back-link/eyebrow move to the shell breadcrumb; issue-specific actions (state badge, copy-link, open-external, toggle-state) become a view-level cluster fed into the `#detail-actions` slot.

## C. Per-view migration

Each view drops its bespoke header, renders its body inside `ViewContainer`, and feeds shell slots:

- **`MyWork.vue`** — drop inline header; shell shows "My Work".
- **`ProjectPicker.vue`** — drop "← My Work" + title; project filter feeds the global-search slot. Launcher dynamics (keyboard, spring cursor, stars, sections) untouched.
- **`IssueList.vue`** — remove `IssueListHeader`; keep `IssueListToolbar` + list/board/bulk body; "+ New issue" → `#primary-action` (same emit); count → toolbar row.
- **`MergeRequestList.vue`** — remove `MergeRequestListHeader`; keep toolbar + `MrFilterPanel` + list.
- **`PipelineList.vue`** — remove inline header; refresh control → toolbar area; running indicator via `ProjectTabNav`.
- **`IssueDetail.vue`** — slim `IssueMasthead` to a `#detail-actions` cluster (state/copy/external/toggle); breadcrumb + back + open-in-window from the shell. Editable body, rail, discussion, save bar, container-query layout stay.
- **`MergeRequestDetail.vue`** — its masthead (back + title + open-in-GitLab) collapses into shell breadcrumb + `#detail-actions`; body + rail + discussion stay.
- **`MultiIssueWindow.vue`** — unchanged (chrome-off; keeps its pager).

Each view migrates in its own task; a half-migrated view (old header + shell bar) is fixed within the same task, never committed in that state.

## D. Width & content container

The shell owns the content container; width stops being re-decided per view.

- **`ViewContainer`** provides a centered max-width + consistent padding, replacing the ad-hoc `max-w-3xl/4xl/5xl` wrappers and the `space-y-5` no-width views.
- **Default width** `max-w-5xl` (matches today's `App.vue main`) for list + detail views.
- **Opt-outs via a `width` prop** (small enum): `wide` / full-bleed for the issue board and the project picker grid; `narrow` (`max-w-3xl`) for My Work.
- Vertical rhythm standardized: the shell sets top padding below the bar; views stop setting their own outer `py-*`. Every view's outer `mx-auto w-full max-w-… px-… py-…` wrapper is deleted in favor of `ViewContainer`.

## E. Testing

Vitest; mirror existing patterns (`RouterLinkStub`, memory router where routing matters; mock composables for view tests).

- **`AppShell`** — renders rail + top bar + slotted content when chrome on; renders bare content when `route.meta.chrome === false` or `?window=1` (the chrome-off matrix).
- **`AppIconRail`** — the nav targets resolve (`home`, `projects`); Search opens the palette; Settings calls `openSettings`; connection dot reflects state.
- **`AppTopBar`** — context branching: global → title only; project list → breadcrumb + `ProjectTabNav` + primary-action slot; detail → back + breadcrumb + detail-actions slot; active tab from route.
- **`ProjectTabNav`** — three tab targets resolve for a `fullPath`; active highlighted; running-pipeline adornment when count > 0.
- **`ViewContainer`** — applies the right max-width per `width` prop.
- **Per migrated view** — update existing view/header tests: bespoke header gone, body still renders; header-link assertions re-homed to the shell/`ProjectTabNav` tests (e.g. the `IssueList` empty-state link-count test).
- **`App.vue` chrome integration smoke** — a project route shows the shell; `issues-window` and `?window=1` do not.
- **Full suite stays green** — re-home, don't delete, the nav/routing coverage that lived in the deleted headers' tests.

## F. Phasing (for the plan)

Sequenced so each phase leaves the app working and tests green:

1. **Shell foundation** — `AppShell` + `AppIconRail` + `AppTopBar` (global branch) + `ViewContainer` + chrome-off in `App.vue` + route `meta.chrome`; migrate **My Work** and **Projects**.
2. **Project tabs** — `ProjectTabNav` + top-bar project branch; migrate **IssueList**, **MergeRequestList**, **PipelineList**; delete the three list headers.
3. **Detail branch** — top-bar detail branch; migrate **IssueDetail** (slim `IssueMasthead`) and **MergeRequestDetail**.
4. **Cleanup & verification** — remove dead code, re-home stray tests, format / typecheck / full suite.

## File touch list

- **New:** `src/shared/components/shell/{AppShell,AppIconRail,AppTopBar,ProjectTabNav,ViewContainer}.vue` (+ tests).
- **Edit:** `src/App.vue` (mount shell + chrome-off), `src/router/index.ts` (`meta.chrome:false` on connect + issues-window), all seven main views, `IssueMasthead.vue` (slim), `MergeRequestDetail.vue` (collapse masthead).
- **Delete:** `IssueListHeader.vue`, `MergeRequestListHeader.vue` (+ their tests, re-homed).
- **Format:** `bun run format` after edits. No GraphQL/codegen changes.
