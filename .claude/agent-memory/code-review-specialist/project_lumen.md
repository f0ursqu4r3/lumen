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

**Shared-dialog pattern:** Singleton dialogs (ConfirmDialog, SettingsDialog) mount once in App.vue, driven by a module-level `reactive` state singleton in a composable (useConfirm/useSettings) with open/close functions. reka-ui's `update:open` only fires on user-driven open/close, NOT on programmatic prop flips — components watch the shared state directly to react to programmatic opens, and keep `onOpenChange` for the user close path. `__APP_VERSION__` define is duplicated in both vite.config.ts and vitest.config.ts (declared in src/env.d.ts); inline error banners use the TriangleAlert + destructive/10 bg + role="alert" idiom (see ConnectView/SettingsDialog).

**Composable conventions (two flavors):** query-backed composables (e.g. `useGitlabUrl`) wrap TanStack `useQuery`; imperative form/mutation composables (e.g. `useGitlabConnect`) are plain `ref`/`computed` factories returning a flat object, calling `rpc` from `@/lib/rpc` directly (no Vue Query). The latter favor returning `Promise<boolean>` so callers own the success side-effect rather than the composable navigating/toasting itself. Imperative composables are tested with a module-level `vi.mock('@/lib/rpc')` (no `withQuery` harness). The RPC bridge contract lives in `src/lib/rpcContract.ts` (`GraphqlResult.errors` is `{message:string}[]|undefined`, `ConfigStatus.url` is `string|null`).

**Config/auth:** `bun/config.ts loadConfig()` has a first-run env fallback — if `GITLAB_URL`/`GITLAB_TOKEN` are set (dev `.env`), `getConfig().configured` returns true even after `clearConfig()` deletes config.json. So "Disconnect" doesn't fully stick in dev (only affects dev, harmless in prod). `configured` = `Boolean(gitlabUrl)`.

**Persister key:** TanStack `createSyncStoragePersister` default key is `REACT_QUERY_OFFLINE_CACHE`. lumen now passes explicit `PERSIST_KEY='lumen:query-cache'` (src/lib/persist.ts) — existing users' old `REACT_QUERY_OFFLINE_CACHE` localStorage blob is orphaned (not migrated, not cleared by clearPersistedCache).

**SettingsDialog hydrate gotcha:** `hydrate()` resets url/token/username on open but NOT status/message — a failed token-swap error banner can persist into the next open. Watch on `settingsState.open` with `immediate:true`.

**Why:** [[feedback_review_severity]] — this is an early-stage personal tool; severity calibrated accordingly (minor ergonomic issues don't warrant blocking).
