# Command Palette → Navigator (v1)

**Status:** Approved design — ready for implementation plan
**Date:** 2026-06-08
**Scope:** Single feature. First of three (palette → merge requests → my-work dashboard), each its own spec/plan/build cycle.

## Goal

Turn the existing `CommandPalette.vue` into a real keyboard-first **navigator**: one ⌘K surface to fuzzy-jump to projects, issues, saved views, and route commands. Pure navigation — no context actions (assign/label/status) in v1.

## Non-goals (v1)

- Cross-project / cross-instance issue search
- Merge requests (arrives with feature 2; palette gains an MR source then)
- Recents / MRU section
- Context actions or a full command bus

## A. Scope & entities

Extend `CommandPalette.vue` — do not rewrite. Query-driven, four result kinds:

| Kind | Behavior |
|---|---|
| **Route commands** (`Actions`) | Existing set: Open Projects, Open Settings, Create Issue, Open Issues, Open Pipelines (project-scoped ones appear only with a current project). |
| **Projects** | Fuzzy match via existing `useProjectBrowser`. Remove the top-8 cap; show all matches, capped ~25 for render. |
| **Issues** | `#123` (or `123`) → direct jump in current project (existing). Free text → live fuzzy **title search in current project**. |
| **Saved views** (`Views`) | Current project's saved views (`useSavedViews`). Selecting one applies its filter/sort/group slice. |

Saved views are per-project (localStorage `lumen:saved-views:<fullPath>`), so the palette surfaces only the current project's views — consistent with existing behavior.

## B. Architecture

Refactor the inline command computeds into typed, pure **sources** under a new feature module.

```
src/features/palette/
  composables/
    usePaletteCommands.ts        — merges sources → grouped, ranked result list
    usePaletteIssueSearch.ts     — debounced GraphQL title search (current project)
  lib/
    sources.ts                   — pure builders:
                                     routeCommands(ctx)
                                     projectCommands(rows, query)
                                     savedViewCommands(views, ctx)
                                     issueCommands(hits, ctx)
    types.ts                     — Command, CommandGroup, PaletteContext
```

- `PaletteContext = { currentProject: string | null, query: string, router, route }` — passed in, not reached for, so sources are pure and unit-testable.
- Each source returns `Command[]`, each `Command` carries a `group: 'Actions' | 'Projects' | 'Issues' | 'Views'`.
- `usePaletteCommands` sorts within group, concatenates in fixed group order, exposes a flat list + group boundaries for rendering.
- `CommandPalette.vue` shrinks to: input + keyboard nav + render. All list logic lives in `usePaletteCommands`.

Rationale: the current single ~120-line `commands` computed already mixes route logic, project search, and `#`-jump. Adding issue search + views inline would make it unmaintainable; sources give clean boundaries and test seams.

### Command shape

```ts
type CommandGroup = 'Actions' | 'Projects' | 'Issues' | 'Views'

type Command = {
  id: string
  group: CommandGroup
  title: string
  subtitle?: string
  icon: Component
  action: () => void
}
```

## C. Issue search (data layer)

New GraphQL query + a thin composable.

```graphql
query PaletteIssueSearch($fullPath: ID!, $search: String!) {
  project(fullPath: $fullPath) {
    issues(search: $search, sort: UPDATED_DESC, first: 8) {
      nodes { iid title state }
    }
  }
}
```

- `usePaletteIssueSearch(query, currentProject)` — `@tanstack/vue-query`, key `['palette-issue-search', fullPath, search]`.
- **Debounced ~200ms.** `enabled` only when: query non-empty, ≥2 chars, not a pure `#number`, and a project is open.
- Reuses the existing GraphQL→RPC transport and error normalization.
- Search failure renders zero issue hits silently (palette stays usable); never blocks projects/views/actions.
- Results → `Command`s: `title` = issue title, `subtitle` = `#iid · state`, `action` = push `issue` route (`{ fullPath, iid }`).
- **Codegen gate:** the new query means generated types are red until `bun codegen` is run against the live instance (generated dir is gitignored). Flag this in the plan; typecheck will fail until it runs.

## D. UI / result organization

- **Sectioned results** — small uppercase muted group header (`Actions`, `Projects`, `Issues`, `Views`) above each non-empty group; fixed group order.
- **Flat keyboard nav across sections** — ↑/↓ + Enter walk a single flattened index spanning all groups (headers skipped). Existing nav model unchanged; `active` clamps on list change (already handled).
- **Empty-query state** — Actions + saved Views + all projects (no issue search until typed). Existing "No commands found." fallback when truly empty.
- **Loading** — while issue search is in-flight, a tiny inline spinner in the `Issues` header; non-blocking. Debounce hides most flicker.
- **Footer hint bar** — `↑↓ navigate · ↵ open · esc close`.
- Keep the existing `Dialog` shell, `top-[18%]` position, search input, and close button unchanged.

## E. Testing

Unit (vitest, `bunx vitest run`):

- `sources.ts` builders — pure, table-driven:
  - `routeCommands` includes/excludes project-scoped commands by `currentProject`.
  - `projectCommands` filters by query, respects render cap.
  - `savedViewCommands` maps views → commands, action applies the slice.
  - `issueCommands` maps hits → commands; `#number` path bypasses search.
- `usePaletteCommands` merge/order — groups in fixed order, within-group sort, flat-index correctness, clamp on shrink.
- Query gating in `usePaletteIssueSearch` — `enabled` logic for the `<2 chars`, pure-`#number`, no-project, empty cases (test the predicate, not the network).
- Component smoke for `CommandPalette.vue` — opens on ⌘K, renders grouped results, Enter runs active command, esc closes.

Search failure path: assert zero issue hits render and other groups remain.

## File touch list

- **New:** `src/features/palette/{composables,lib}/*` as above; new `.graphql` query for `PaletteIssueSearch`.
- **Edit:** `src/shared/components/CommandPalette.vue` (slim down to shell + render).
- **Codegen:** regenerate `src/gitlab/generated` (user-run `bun codegen`).
- **Format:** `bun run format` after edits.
