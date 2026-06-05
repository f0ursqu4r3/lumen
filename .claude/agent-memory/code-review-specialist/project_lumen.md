---
name: project-lumen
description: Key patterns, conventions, and architectural decisions in the lumen personal GitLab UI project
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

**Composable conventions (two flavors):** query-backed composables (e.g. `useGitlabUrl`) wrap TanStack `useQuery`; imperative form/mutation composables (e.g. `useGitlabConnect`) are plain `ref`/`computed` factories returning a flat object, calling `rpc` from `@/lib/rpc` directly (no Vue Query). The latter favor returning `Promise<boolean>` so callers own the success side-effect rather than the composable navigating/toasting itself. Imperative composables are tested with a module-level `vi.mock('@/lib/rpc')` (no `withQuery` harness). The RPC bridge contract lives in `src/lib/rpcContract.ts` (`GraphqlResult.errors` is `{message:string}[]|undefined`, `ConfigStatus.url` is `string|null`).

**Why:** [[feedback_review_severity]] — this is an early-stage personal tool; severity calibrated accordingly (minor ergonomic issues don't warrant blocking).
