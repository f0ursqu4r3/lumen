# My Work Dashboard (v1)

**Status:** Approved design — ready for implementation plan
**Date:** 2026-06-09
**Scope:** Third feature of the palette → merge-requests → dashboard sequence. A single cross-project home view aggregating a few `currentUser`/root queries. (A separate follow-up will revisit a unified layout/shape across all views — out of scope here.)

## Goal

Make opening the app land on a cross-project "My Work" home that answers "what needs me right now": issues assigned to me, MRs assigned to me, and MRs awaiting my review — each as its own lane, scannable top to bottom, linking into the existing in-app detail views.

## Non-goals (v1)

- To-Do inbox (`currentUser.todos`), authored-by-me, due-soon lanes
- Per-lane pagination / "load more" (the query cap is the view)
- Configurable / reorderable lanes
- A manual refresh button (polling + window-focus refetch cover it)
- The cross-view "unified layout/shape" refactor (separate effort)

## A. Scope, routing & navigation

- **`/` → `MyWork.vue`**, route name `home`.
- **Project Picker moves to `/projects`**, route name **`projects` preserved** — so every existing `{ name: 'projects' }` push, header back-link, and palette "Open Projects" action keeps working unchanged.
- The router **config guard's post-connect redirect** changes from the picker to `/` (the dashboard). Verify the guard (`src/router/guard.ts`) and any `nextRoute` logic target `home` (or `/`) for configured users; unconfigured users still go to `connect`.
- Reciprocal nav: `MyWork.vue` header has a "Projects" link (`{ name: 'projects' }`); the Project Picker gains a back-to-"My Work" affordance (`{ name: 'home' }`), mirroring the existing header-link idiom.

## B. Module structure & data layer

New `src/features/dashboard/` module:

```
src/features/dashboard/
  composables/
    useCurrentUser.ts                  — query { currentUser { username } }
    useAssignedIssues.ts               — root issues(assigneeUsernames:[me], …)
    useAssignedMergeRequests.ts        — currentUser.assignedMergeRequests(…)
    useReviewRequestedMergeRequests.ts — currentUser.reviewRequestedMergeRequests(…)
  components/
    DashboardLane.vue                  — titled section: header + loading/empty/error + rows
    DashboardIssueRow.vue              — cross-project issue row
    DashboardMrRow.vue                 — cross-project MR row
  lib/
    dashboard.ts                       — pure: parseIssuePath, query keys, DASHBOARD_POLL_MS
```

View: `src/views/MyWork.vue`.

**Conventions:** all queries use the **manual-typed** pattern (inline template-literal document + hand-written result type + `gqlClient.request<Result, Vars>` + `normalizeError`; **no codegen**), `@tanstack/vue-query`, `refetchInterval: DASHBOARD_POLL_MS`, `refetchOnWindowFocus: true`.

### Queries

**`useCurrentUser`** — long `staleTime` (the username is stable for a session):

```graphql
query CurrentUser { currentUser { username } }
```

**`useAssignedIssues(username)`** — root cross-project issues; `enabled` only when `username` is non-empty; queryKey includes the username:

```graphql
query AssignedIssues($username: String!) {
  issues(assigneeUsernames: [$username], state: opened, sort: UPDATED_DESC, first: 25) {
    nodes { iid title state webPath webUrl updatedAt labels { nodes { id title color } } }
    pageInfo { hasNextPage }
  }
}
```

**`useAssignedMergeRequests`** / **`useReviewRequestedMergeRequests`** — the `currentUser` connections are implicitly "me" (no username arg needed):

```graphql
query AssignedMergeRequests {
  currentUser {
    assignedMergeRequests(state: opened, sort: UPDATED_DESC, first: 25) {
      nodes {
        iid title state draft webUrl updatedAt
        project { fullPath }
        approved approvalsRequired
        reviewers { nodes { name username } }
      }
      pageInfo { hasNextPage }
    }
  }
}
```

`useReviewRequestedMergeRequests` is identical with `reviewRequestedMergeRequests` as the connection field.

### Routing the rows

- **MR rows** use `mr.project.fullPath` + `mr.iid` directly → `{ name: 'merge-request', params: { fullPath, iid } }`.
- **Issue rows**: the root `issues` `Issue` type has no `project` object (only `webPath`, `webUrl`, `projectId: Int`). `parseIssuePath(webPath)` extracts `{ fullPath, iid }` from `webPath` (`/grp/proj/-/issues/42`, nested groups supported) for `{ name: 'issue', params: { fullPath, iid } }`. If parsing fails, the row links to `webUrl` (external) instead.

## C. Lanes & rows

- **`MyWork.vue`** — three `DashboardLane`s stacked in a single column with generous spacing (responsive max-width like the list views). Page header: "My Work" + a "Projects" link.
- **`DashboardLane.vue`** — props `{ title: string; items: T[]; isLoading: boolean; error: GitLabError | null; emptyMessage: string; hasMore?: boolean }`. Renders a header (title + item count, with a subtle `+` when `hasMore`), then: a row-skeleton while `isLoading` (first load), an `ErrorNotice` on `error`, an empty message when `!items.length`, else the rows via the default slot. One lane failing/loading never blanks the others.
- **`DashboardIssueRow.vue`** — project path (muted, mono) + title + `StateBadge` + relative updated-time; `RouterLink` to the parsed issue route (or `webUrl` fallback). Props `{ issue }`.
- **`DashboardMrRow.vue`** — project path + title + `MrStateBadge` (draft-aware) + relative updated-time; `RouterLink` to the merge-request route. Props `{ mr }`.

Rows are compact and visually uniform across lanes so the page scans top-to-bottom. Each lane caps at the query's `first: 25`; the cap is the view (no in-dashboard pagination in v1).

## D. States, refresh & ordering

- **Per-lane independence** — each lane binds its own query's `isLoading` / `error` / data; no global blocking spinner.
- **Loading** — 2–3 placeholder skeleton rows per lane on first load.
- **Empty** — per-lane messages ("Nothing assigned", "No MRs assigned", "No reviews requested — you're clear"). When all three are empty the page still shows the three headers (inbox-zero, not broken).
- **Ordering** — `UPDATED_DESC` within each lane.
- **Refresh** — `refetchInterval: DASHBOARD_POLL_MS` + `refetchOnWindowFocus: true`; no manual refresh button.
- **Errors** — normalized union; an `auth` error still triggers the app's existing reconnect overlay; `unavailable` surfaces the quiet retry/error affordance per lane.

## E. Palette & nav integration

- **Palette route action** — add "Go to My Work" to `routeCommands` (always available, not project-scoped) → `{ name: 'home' }`. Existing "Open Projects" stays (`{ name: 'projects' }`). Additive — no new group or source.
- **Header affordances** — as in A (MyWork ⇄ Projects links).

## F. Testing

Vitest (`bunx vitest run`); mock `gqlClient`, use `withQuery`, pure-lib tests, `RouterLinkStub` for rows.

- **`lib/dashboard.ts`** — `parseIssuePath`: `/grp/sub/proj/-/issues/42` → `{ fullPath: 'grp/sub/proj', iid: '42' }`; nested groups; `null` for non-matching input.
- **`useCurrentUser`** — returns `username`; error normalizes.
- **`useAssignedIssues`** — maps nodes; sends `assigneeUsernames: [username]`; `enabled` gated on username (no request before the user resolves).
- **`useAssignedMergeRequests` / `useReviewRequestedMergeRequests`** — map `currentUser.<connection>.nodes`; correct connection field; error path.
- **`DashboardIssueRow` / `DashboardMrRow`** — render project + title + badge; link target resolves (issue via `parseIssuePath`, MR via `project.fullPath`); MR draft-badge precedence.
- **`DashboardLane`** — skeleton when loading, error notice on error, empty message when no items, rows + count otherwise.
- **`MyWork.vue`** — renders three lanes wired to their (mocked) composables.
- **Palette** — "Go to My Work" route action present (`{ name: 'home' }`); extend `lib/sources.test.ts`.
- **Router** — `/` → `home`, `/projects` → `projects` (extend `router/index.test.ts`); guard post-connect redirect targets `home`.

## File touch list

- **New:** `src/features/dashboard/**` (composables, components, lib + tests); `src/views/MyWork.vue` (+ test).
- **Edit:** `src/router/index.ts` (home route + move picker to `/projects`); `src/router/guard.ts` (post-connect redirect → home); `src/views/ProjectPicker.vue` (back-to-My-Work affordance); `src/features/palette/lib/sources.ts` (+ test) ("Go to My Work" action).
- **Format:** `bun run format` after edits. No codegen.
