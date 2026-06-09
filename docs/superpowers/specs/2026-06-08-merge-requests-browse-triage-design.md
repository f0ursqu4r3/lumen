# Merge Requests — Browse + Triage (v1)

**Status:** Approved design — ready for implementation plan
**Date:** 2026-06-08
**Scope:** First slice of the Merge Requests subsystem (feature 2 of the palette → MRs → dashboard sequence). Later slices (diff viewer, approve/merge actions, inline diff comments, drawer/native-window presentation) each get their own spec/plan/build cycle.

## Goal

Add a project-scoped Merge Requests browse + triage experience that mirrors the proven `features/issues/` patterns: a filterable/sortable MR list and a read-oriented full-page MR detail with threaded discussion and reply. Answers the daily "what MRs need my attention / review" loop without the heavy diff-review machinery.

## Non-goals (v1)

- Diff viewer (file tree, syntax highlight, inline diff comments)
- Approve / unapprove / merge actions
- Editing MR fields (title/description/labels/assignees/reviewers), resolving threads, top-level comment composer beyond reply
- Board, grouping, bulk actions, multi-select, drawer or standalone native-window presentation

## A. Scope, routing & navigation

New project-scoped routes mirroring Issues/Pipelines:

- **List:** `/projects/:fullPath(.*)/merge-requests` → `MergeRequestList.vue` (route name `merge-requests`)
- **Detail:** `/projects/:fullPath(.*)/merge-requests/:iid` → `MergeRequestDetail.vue` (route name `merge-request`, full-page only)

Entry points:
- A **"Merge Requests"** button in `IssueListHeader.vue`, beside "View Pipelines", using the same `onTabNav` cmd-click-into-native-window behavior.
- Reciprocal nav links among the Issues / MR / Pipelines headers (MR list header links back to Projects / Issues / Pipelines).
- A **palette action** ("Open Merge Requests").

## B. Module structure & the one shared lift

New parallel feature module, mirroring `features/issues/` but lean:

```
src/features/merge_requests/
  components/
    MergeRequestRow.vue          — list row (title, branches, draft/state badge, approvals, reviewers, updated)
    MergeRequestListHeader.vue   — title + nav buttons (Projects / Issues / Pipelines) + count
    MergeRequestListToolbar.vue  — filter/sort controls + saved-views trigger
    MrFilterPanel.vue            — author/assignee/reviewer/label/milestone/draft/state pickers
    MrStateBadge.vue             — open / draft / merged / closed pill
    MergeRequestDetailRail.vue   — branches, approvals, reviewers, assignees, labels, milestone, pipeline
  composables/
    useMergeRequests.ts          — list query (filtered/sorted, infinite scroll)
    useMergeRequest.ts           — single MR query (detail + discussions)
    useMrFilters.ts              — URL-encoded filter/sort slice (MR keys)
    useMrDiscussion.ts           — reply (createNote) on an MR thread
  lib/
    mrView.ts                    — pure: filter-slice → GraphQL args, sort options, branch/state formatting
```

Views live in `src/views/` like the others: `MergeRequestList.vue`, `MergeRequestDetail.vue`.

**The one shared lift** (the only change to existing stable code): generalize `useSavedViews` to take a **storage namespace + filter keys** rather than hardcoding the `lumen:saved-views:` prefix and issue filter keys. Issues call `useSavedViews('issue', ISSUE_FILTER_KEYS)`; MRs call `useSavedViews('mr', MR_FILTER_KEYS)`, keeping their saved views in separate localStorage namespaces. `sameView` / `pickSlice` become parameterized by the passed keys. Existing issue saved-view behavior and tests are preserved (the issue call site moves to the new signature).

All other MR code is new and isolated; stable issue code is otherwise untouched.

## C. Data layer (GraphQL, manual-typed like `useIssue.ts`)

Inline template-literal documents + hand-written result types, via `gqlClient.request<Result, Vars>` + `normalizeError`. No codegen. Note: `labels` arg is deprecated upstream → use `labelName`.

**List** — `useMergeRequests(fullPath: Ref<string>, slice: Ref<MrQueryVars>)`:

```graphql
query ProjectMergeRequests(
  $fullPath: ID!, $state: MergeRequestState, $sort: MergeRequestSort,
  $authorUsername: String, $assigneeUsername: String, $reviewerUsername: String,
  $labelName: [String!], $milestoneTitle: String, $draft: Boolean, $after: String
) {
  project(fullPath: $fullPath) {
    mergeRequests(
      state: $state, sort: $sort, authorUsername: $authorUsername,
      assigneeUsername: $assigneeUsername, reviewerUsername: $reviewerUsername,
      labelName: $labelName, milestoneTitle: $milestoneTitle, draft: $draft,
      first: 30, after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        iid title state draft conflicts webUrl createdAt updatedAt mergedAt
        sourceBranch targetBranch approved approvalsRequired
        author { name username }
        assignees { nodes { name username } }
        reviewers { nodes { name username } }
        labels { nodes { id title color } }
        milestone { id title }
        headPipeline { id status }
      }
    }
  }
}
```

- `@tanstack/vue-query`, keyed on `['merge-requests', fullPath, slice]`, infinite scroll via `endCursor` (mirror `useIssues`).
- `refetchInterval` shares the issues poll cadence; `refetchOnWindowFocus: true`.

**Detail** — `useMergeRequest(fullPath: Ref<string>, iid: Ref<string>)`: the same MR fields plus `descriptionHtml`, `mergeableDiscussionsState`, and:

```graphql
discussions(first: 100) {
  nodes { id notes { nodes { id body bodyHtml system createdAt author { name username avatarUrl } } } }
}
```

This is the same discussion shape `useIssue` returns, so `IssueDiscussion` rendering is reused as-is.

Errors normalize through the existing union (`auth` / `unavailable` / `graphql` / `network`); list and detail surface the same handling as the issue views.

## D. Filtering & saved views — `useMrFilters`

Mirrors `useIssueFilters`: URL-encoded reactive slice (shareable/restorable; restored from `localStorage` per project), `viewSlice`, and `applyView`. Filter keys:

```
MR_FILTER_KEYS = ['state', 'label', 'author', 'assignee', 'reviewer',
                  'milestone', 'draft', 'sort', 'q']
```

- **state** → `MergeRequestState` (`opened` / `merged` / `closed` / `all`); default `opened`.
- **draft** → tri-state (any / draft / ready) mapped to `draft: Boolean` (any ⇒ omit the arg).
- **author / assignee / reviewer** → usernames; reuse the `features/assignees` member/assignee pickers for option lists.
- **label** → `labelName`; reuse the labels flyout.
- **sort** → updated / created / merged (`updated_desc`, `created_desc`, `merged_at_desc`, and asc variants where useful).
- Saved views via the generalized `useSavedViews('mr', MR_FILTER_KEYS)`.

The pure slice → GraphQL-args mapping lives in `lib/mrView.ts` (unit-testable without mounting). `useMrFilters` produces the variables object consumed by `useMergeRequests`.

## E. Detail page & discussion

`MergeRequestDetail.vue` — full-page, same masthead pattern as `IssueDetail`:

- **Masthead** — title + `!iid`, `MrStateBadge` (open / draft / merged / closed), back-nav to the MR list, and an "open in GitLab" affordance via `webUrl`.
- **Body** — rendered `descriptionHtml` sanitized through the existing `dompurify` + `marked` path used for issues, then the threaded discussion.
- **Rail** (`MergeRequestDetailRail`) — `sourceBranch → targetBranch` (mono), approvals (`approved` / `approvalsRequired`), reviewers, assignees, labels, milestone, head pipeline status (reuse `PipelineStatusBadge`), and a `conflicts` / `mergeableDiscussionsState` note when relevant.
- **Discussion** — reuse `IssueDiscussion` for rendering; **reply only** in v1 via `useMrDiscussion` (a `createNote` mutation targeting the MR's discussion id). No new top-level composer, no resolve-thread, no note editing.

Read-only otherwise: no title/description/label/assignee/reviewer editing in v1.

## F. Command palette integration

Additive extension of the existing palette sources (the v1 palette deferred MRs):

- **Route action** — "Open Merge Requests" in `routeCommands` (project-scoped, like "Open Issues" / "Open Pipelines").
- **MR jump** — uses the `!iid` convention (`!42` → open MR 42 in current project) to avoid colliding with the issue `#123` jump.
- **MR search source** — a debounced MR title search (`useMergeRequests` with `search`, current project) producing `Command`s in a new `'Merge Requests'` group; reuses the issue search's `gcTime:0` + `persist.ts` dehydrate-exclusion treatment (add `'merge-requests'` to the excluded keys).
- `GROUP_ORDER` gains `'Merge Requests'` (after `'Issues'`).

No change to the palette shell or existing sources beyond registering the new action, group, and source builder.

## G. Testing

Unit / component tests with vitest (`bunx vitest run`), mirroring the issues test patterns (`useIssues.test.ts` mock-`gqlClient`, `withQuery`, pure-lib tests):

- **`lib/mrView.ts`** — pure, table-driven: slice → GraphQL args mapping (state default, draft tri-state → arg/omit, label→labelName, sort enum mapping), branch/state formatting helpers.
- **`useMrFilters.ts`** — URL-encode/restore round-trip, `applyView` clears absent keys, default state, per-project restore (mirror `useIssueFilters.test.ts`).
- **`useSavedViews` (generalized)** — existing tests retained and extended to prove namespace + key parameterization (issue and MR namespaces don't collide; `sameView`/`pickSlice` honor passed keys).
- **`useMergeRequests.ts`** — returns nodes + pageInfo for a project, passes filter args through, infinite-scroll cursor handling (mock `gqlClient`).
- **`useMergeRequest.ts`** — maps detail + discussions; error path normalizes.
- **`useMrDiscussion.ts`** — reply fires the `createNote` mutation with the right variables; error path.
- **`MergeRequestRow.vue`** — renders branches, state/draft badge, approvals, reviewers; click navigates to detail.
- **`MrStateBadge.vue`** — correct pill per state incl. draft precedence.
- **Palette sources** — new `mrJumpCommand` (`!42`), MR search → commands, "Open Merge Requests" route action; `GROUP_ORDER` includes the MR group.
- **Router** — the two new routes resolve (extend `router/index.test.ts`).

Search-failure resilience: MR palette search renders zero hits silently, other groups unaffected (mirror the issue-search test).

## File touch list

- **New:** `src/features/merge_requests/**` (components, composables, lib + tests); `src/views/MergeRequestList.vue`, `src/views/MergeRequestDetail.vue` (+ tests).
- **Edit:** `src/router/index.ts` (two routes); `src/features/issues/components/IssueListHeader.vue` (MR button); `src/shared/composables/useSavedViews.ts` (namespace + keys params) and its issue call site (`useIssueSavedViews.ts`); `src/features/palette/**` (route action, MR group/source); `src/shared/lib/persist.ts` (exclude `'merge-requests'` key).
- **Format:** `bun run format` after edits. No codegen (manual-typed queries).
