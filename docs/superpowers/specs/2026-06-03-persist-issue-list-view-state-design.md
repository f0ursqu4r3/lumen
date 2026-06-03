# Persist Issue-List View State

**Date:** 2026-06-03

## Problem

On the issues list, the user's view configuration does not survive navigation.
Filters (state/labels/assignee/author) and search already round-trip through the
URL query, so a raw page refresh keeps them — but entering a project from the
ProjectPicker pushes `{ name: 'issues', params }` with no query, resetting them
to defaults on every visit. Sort, group-by, the list/board toggle, and the board
column-scope are local `ref`s in `IssueList.vue` and are not URL-backed at all, so
they reset on every navigation *and* every refresh.

Goal: the issues list should return exactly as the user left it — search,
filters, sort, group-by, view, and board scope — per project, across refresh and
navigation.

## Decisions

- **Scope:** per project. Storage keyed by `fullPath`.
- **Fields persisted:** search, state, labels, assignee, author, sort, group,
  view (list/board), board column-scope.
- **Apply when:** only when the URL carries none of the filter keys. Explicit /
  shared links win — saved state never overrides a URL that already specifies a
  filter key.
- **Mechanism:** promote sort/group/view/scope into the URL query alongside the
  existing filter keys, then a single seed + persist path in `useIssueFilters`
  covers everything uniformly. Bonus: sort/group/view become shareable via link.

## Design

`useIssueFilters` becomes the single home for all issue-list view state. URL is
the single source of truth; localStorage seeds the URL on arrival and mirrors it
on change.

### URL keys

Existing: `state`, `label`, `assignee`, `author`, `q`. New, each omitted from the
URL when at its default so links stay clean:

| State              | Key     | Default     |
| ------------------ | ------- | ----------- |
| sort               | `sort`  | `updated`   |
| group-by           | `group` | `none`      |
| view               | `view`  | `list`      |
| board column-scope | `scope` | `assigned`  |

The full **filter slice** is these nine keys.

### Composable changes (`src/composables/useIssueFilters.ts`)

- Add `sort`, `group`, `view`, `scope` computeds following the existing `state`
  pattern: getter returns the default when the key is absent; setter calls
  `patch`, passing `undefined` when the value equals the default (keeps the URL
  clean). Import `SortKey` / `GroupKey` types from the issue sort/group module.
- Derive the storage key from `route.params.fullPath`:
  `tragit:issue-filters:<fullPath>`.
- **Seed (restore):** watch `route.params.fullPath` with `immediate: true`. When
  it resolves and the URL has none of the nine keys, read the saved JSON for that
  project and `router.replace({ query: { ...route.query, ...saved } })`. Existing
  non-filter keys (e.g. `issue`) are preserved. Absent/empty saved state → leave
  defaults.
- **Persist (save):** watch the nine-key slice of `route.query`. On change,
  serialize the present keys to localStorage; if the slice is empty (all default),
  `removeItem`. Search already debounces into `?q`, so saves stay debounced; no
  per-keystroke writes.
- **Safety:** wrap all localStorage reads/writes in try/catch. Failure (quota,
  disabled storage) degrades silently to current behavior.
- Return the four new values from the composable.

### View changes (`src/views/IssueList.vue`)

- Delete the four local refs: `view`, `sortKey`, `groupKey`, `boardScope`.
- Bind the sort/group Selects, the view toggle, and the board-scope Select to the
  composable's new values instead.
- Keep the existing `scopeOptions` fallback watch — when the chosen scope isn't
  present in the loaded labels it assigns through the composable's `scope`, which
  now writes `?scope`.

## Testing

Extend `src/composables/useIssueFilters.test.ts`:

- hydrate `sort`/`group`/`view`/`scope` from the query;
- defaults when the keys are absent;
- setting a non-default value writes the key; setting the default omits it;
- seeds from localStorage when the query has no filter key;
- does NOT seed when the query carries any filter key;
- persists changes to localStorage;
- clears the storage entry when all keys return to default.

Reset localStorage between tests. jsdom provides localStorage.

Check `src/views/IssueList.test.ts` for assertions tied to the removed local refs
and update them to drive/read the composable-backed values.

## Out of scope

- Cross-device sync (localStorage only).
- A UI affordance to reset saved view state (clearing all filters / returning to
  defaults already empties the stored entry).
