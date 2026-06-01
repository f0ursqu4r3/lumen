---
name: project-tragit
description: Key patterns, conventions, and architectural decisions in the tragit personal GitLab UI project
metadata:
  type: project
---

**Stack:** Vue 3 (`<script setup>` + TypeScript), Vite, Tailwind v4, Vue Router, TanStack Vue Query v5, graphql-request, GraphQL Code Generator (client preset). Package manager: bun.

**GraphQL:** Documents are inline via `graphql()` tag from `src/gitlab/generated/` — codegen validates them against the live schema. No separate `.graphql` files.

**Error handling:** All API errors normalized through `normalizeError()` in `src/gitlab/errors.ts` into `GitLabError { kind, message }`. Composables catch and rethrow as `GitLabError`; views receive typed errors.

**Testing conventions:**
- Composables: tested with `withQuery` harness (`src/test/withQuery.ts`), which mounts inside a VueQueryPlugin provider with retries disabled. gqlClient is mocked at module level.
- Views: tested with mocked composables via `vi.mock('@/composables/...')` and `mount` + `RouterLinkStub`.
- `flushPromises()` used to settle async query state in composable tests.

**Vue Query patterns:** `useQuery<DataType, GitLabError>` with typed error generic. `placeholderData: (prev) => prev` for stale-while-loading UX (TQ v5 API — replaces `keepPreviousData`). Query keys include reactive Refs directly (Vue Query v5 unwraps them).

**File structure:** `src/composables/` for query composables, `src/components/` for presentational components, `src/views/` for route-level views, `src/gitlab/` for API helpers.

**Why:** [[feedback_review_severity]] — this is an early-stage personal tool; severity calibrated accordingly (minor ergonomic issues don't warrant blocking).
