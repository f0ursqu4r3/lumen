# Split God Views — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan

## Problem

Four route views have grown well past a maintainable size, each doing too much in one
file:

| View | Lines | Shape |
|---|---|---|
| `src/views/IssueList.vue` | 1072 | ~518 script (15+ logic clusters) + ~550 template (6 regions) |
| `src/views/IssueDetail.vue` | 715 | ~264 script + ~370 template + ~78 scoped style |
| `src/views/ProjectPicker.vue` | 491 | spring-cursor + launch + keyboard + list |
| `src/views/PipelineList.vue` | 329 | header + a ~120-line row with inline time formatting |

Two helpers are also copy-pasted across views: `onTabNav` (IssueList, PipelineList) and the
`pathParts`/`repoName`/`pathPrefix` trio (IssueList, IssueDetail, PipelineList).

## Goal

Behavior-preserving refactor: extract stateful logic into composables and template regions
into child components, leaving each view a thin orchestrator at roughly **≤250 lines**. No
runtime behavior, component API, or visual change.

## Placement conventions

- Child components → `src/features/<domain>/components/`
- Composables → `src/features/<domain>/composables/`, or `src/shared/composables/` when
  cross-cutting (no domain knowledge / multiple consumers)
- Pure helpers → `src/features/<domain>/lib/` (unit-tested)
- Views stay in `src/views/` (the route layer)

## Testing strategy

- Existing view tests (`IssueList.test.ts`, `IssueDetail.test.ts`, `ProjectPicker.test.ts`)
  are the regression gate — they must pass **unchanged**. Test command: `bunx vitest run`
  (baseline 76 files / 467 tests; the four splits add files but the count only grows).
- New **pure** helpers (`pipelineFormat.ts`) get unit tests.
- We do NOT add component tests for the extracted components (existing view tests already
  exercise them through the view).
- `PipelineList.vue` has no existing test — covered by the new `pipelineFormat` unit test
  plus `bunx vite build` and manual smoke.
- `bunx vite build` must pass (import-resolution gate). Typecheck (`vue-tsc`) stays red
  because `src/gitlab/generated` needs `bun codegen` — not a gate here.

## Shared extractions (done first — removes duplication)

| New file | Responsibility | Replaces copies in |
|---|---|---|
| `src/shared/composables/useRepoPath.ts` | Given a `Ref<string>` fullPath, expose `pathParts`, `repoName`, `pathPrefix` | IssueList, IssueDetail, PipelineList |
| `src/shared/composables/useTabNav.ts` | `onTabNav(e, to)` — modifier-aware View-Transition route hop | IssueList, PipelineList |
| `src/shared/composables/useSpringCursor.ts` | Critically-damped selection-rail spring (no domain knowledge) | ProjectPicker |

## Per-view extractions

### IssueList.vue (1072 → ~280)

Composables (`features/issues/composables/`):
- `useIssueDrawerRoute.ts` — `?issue=<iid>` drawer routing: `openIid`, `setDrawerOpen`,
  `expandIssue` (open native window), `drawerDirty`. Depends on route/router + confirm + rpc.
- `useIssueBoardDnd.ts` — board drag-and-drop: `dragging`/`draggingIid`/`dragOverKey`/
  `justDropped` refs, `buildDragGhost`, `onDragStart`, `clearDrag`, `onDrop`, `isDropTarget`,
  `ghostIndex`, owning the `useRetagIssue`/`useReassignIssue`/`useSetIssueStatus` mutations.
  Inputs: `fullPath`, `boardScope` ref, `sortKey` ref, `statusCatalog` ref, `members` ref.

Components (`features/issues/components/`):
- `IssueListToolbar.vue` — toolbar row 1 (state segmented control, search, `IssueFilterPanel`,
  `SavedViews`, refresh, select-mode toggle, list/board toggle) + toolbar row 2 (sort + group
  for list, sort + columns-by for board). Two-way binds the filter/sort/group/view/scope refs;
  emits refresh, toggle-select, set-view.
- `IssueBoard.vue` — the full-bleed board: columns from `boardGroups`, per-card drag wiring,
  ghost placeholder, empty lane. Takes board groups + the dnd API + selection + display props;
  emits `filter`.
- `IssueActiveFilters.vue` — the active filter token row (label chips + assignee/author tokens
  + clear-all). Props: `labelChips`, `assignee`, `author`; emits remove/clear.

The view keeps: filters wiring (`useIssueFilters`), saved-views orchestration, issues query +
refresh, pipeline running indicator, catalogs, selection/bulk handlers, board sizing
(`boardStyle`), sort/group computeds, view-morph (`setView`), composer + highlight, keyboard
shortcuts, and the header + list-view region.

### IssueDetail.vue (715 → ~250)

Components (`features/issues/components/`):
- `IssueMasthead.vue` — eyebrow/back-link, `StateBadge`, id chip, copy-link, open-in-gitlab,
  close/reopen toggle, editable title, byline. Props: `issue`, `draft`, `repoName`, `embedded`,
  `windowed`, `linkCopied`; emits copy, open-external, toggle-state, edit-title state.
- `IssueDetailsRail.vue` — status/labels/assignees/milestone rail, including the label id↔title
  conversion and status resolution. Props: `issue`, `draft`, `members`, `contributors`,
  `catalog`, `statusOptions`.
- `IssueDiscussion.vue` — discussion threads, notes, per-thread reply box, comment field.
  Props: `threads`, `notes`, `fresh`, `comment` (v-model), `fullPath`; uses `useIssueDiscussion`.
- `IssueDetailSkeleton.vue` — the loading skeleton block.

Composables (`features/issues/composables/`):
- `useIssueDiscussion.ts` — reply state (`replyingTo`, `replyBody`, `openReply`, `cancelReply`,
  `submitReply` via `useAddNote`) + the fresh-note animation tracker (`seen`/`fresh`/`primed`
  watch). Inputs: `fullPath`, `iid`, `issue` ref, `notes` ref.
- `useIssueLinks.ts` — `linkCopied`, `onCopyClick` (url / shift = markdown), `openInGitLab`,
  via rpc. Input: `issue` ref.
- `useIssueMediaViewer.ts` — `media` (from `buildIssueMedia`), `viewerOpen`, `viewerIndex`,
  `openViewer`, `onBodyMediaClick` delegation. Inputs: draft description, notes, fullPath.

The view keeps: data queries + draft, `threads`/`notes` computeds (passed down), edit-mode
+ save/cancel, dirty emit + route-leave guard, title, the save bar, the `<style>` grid, and
overall composition.

### ProjectPicker.vue (491 → ~250)

- `ProjectRow.vue` (`features/projects/components/`) — one launcher row: monogram, name +
  namespace, assigned count, star toggle, Enter affordance + quick-jump keycap. Props: `row`,
  `index`, `active`, `nameStyle`; emits row-click, toggle-star, hover/focus active.
- `useSpringCursor` (shared, see above) — drives the rail.

The view keeps: `useProjectBrowser`, section helpers, launch/morph, keyboard handling,
infinite load — all tightly coupled to routing and the cursor.

### PipelineList.vue (329 → ~150)

- `PipelineRow.vue` (`features/pipelines/components/`) — the compact row: expand toggle,
  status badge, branch/sha, stage dots, timing, user avatar, watch-bell toggle, open-in-gitlab,
  expandable stepper. Props: `pipeline`, `open`, `watched`; emits toggle-open, toggle-watch,
  open. Uses `pipelineFormat` for display strings.
- `features/pipelines/lib/pipelineFormat.ts` — pure: `formatDuration`, `timeAgo`, `timing`,
  `shortSha`. **New unit test** `pipelineFormat.test.ts`.

The view keeps: header, `usePipelines`/notifications/watch wiring, `activeCount`, expand-set
state, error/loading/empty states, the list shell.

## Non-goals

- No change to runtime behavior, props/emit contracts of existing components, or visuals.
- No new routing, no moving views out of `src/views/`.
- No component tests for the new components (covered transitively by existing view tests).
- Not touching `gitlab/`, `bun/`, `router/`, or the already-extracted composables' internals.
