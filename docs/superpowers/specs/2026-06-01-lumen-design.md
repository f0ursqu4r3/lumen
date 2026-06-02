# lumen — Personal GitLab Issue Tracker

**Date:** 2026-06-01
**Status:** Approved design, pending implementation plan

## Summary

`lumen` is a personal, locally-run single-page app that provides a custom UI
over a **self-hosted (enterprise) GitLab** instance's issues. GitLab remains the
single source of truth — there is no local database and no separate deployed
backend. The Vite dev server itself acts as the runtime, proxying API calls to
GitLab and injecting the access token so it never ships in client code.

## Goals

- Fast, custom UI for browsing and acting on GitLab issues.
- Single-user, runs on the author's machine.
- No deployed infrastructure, no local datastore.

## Non-Goals (YAGNI)

- Multi-user auth / OAuth / sessions.
- Offline support or local caching beyond in-memory query cache.
- Mirroring GitLab data into an owned database.
- Custom fields or workflows not supported by GitLab.

## Architecture

```text
Browser (Vue SPA)
   │  POST /gitlab/graphql
   ▼
Vite dev server  ── proxy: rewrite path, attach `PRIVATE-TOKEN` / Bearer header ──▶
   GitLab self-hosted GraphQL API  (<GITLAB_URL>/api/graphql)
```

- **Runtime:** `vite` dev server (development) or `vite preview` over a build
  (local "production"). The dev-server proxy is the only "backend"; there is no
  separate server process to deploy.
- **Token handling:** A GitLab Personal Access Token (scope: `api`) lives in a
  local `.env` (gitignored). The Vite proxy reads it server-side and attaches it
  as the auth header on every proxied request. The token is never exposed to
  client bundles or browser storage.
- **Instance URL:** `GITLAB_URL` (e.g. `https://gitlab.example-corp.com`) is read
  from `.env` and used for both the proxy target and the codegen schema source.

## Stack

| Concern        | Choice                                               |
| -------------- | ---------------------------------------------------- |
| Build/dev      | Vite                                                 |
| Framework      | Vue 3 (`<script setup>`, Composition API)            |
| Language       | TypeScript                                           |
| Styling        | Tailwind v4 (`@tailwindcss/vite`, CSS-first config)  |
| Routing        | Vue Router                                           |
| Data/cache     | TanStack Query (Vue Query)                           |
| GraphQL client | `graphql-request` (fetch wrapper)                    |
| Typed queries  | GraphQL Code Generator against the instance's schema |

**Why this split:** TanStack Query owns caching, background refetch, pagination,
and loading/error state. `graphql-request` only sends the query. Codegen turns
`.graphql` documents into typed `TypedDocumentNode`s so query/mutation calls are
fully typed end to end. Apollo/urql were rejected because their own normalized
caches would duplicate Vue Query.

## Features (MVP — all four)

1. **Project/group selection** — pick the project (or group) to work in.
2. **Issue list** — filter by state, labels, assignee, milestone; text search;
   paginated.
3. **Issue detail** — description, labels, assignees, milestone, and notes
   (comments), read view.
4. **Mutations** — create issue, add comment, change state (open/close), edit
   labels, change assignee. Mutations invalidate the relevant Vue Query caches
   so the UI reflects GitLab after each action.

## Data Flow

1. Components call composables (`useIssues`, `useIssue`, `useProjects`, ...).
2. Composables wrap `useQuery` / `useMutation` (Vue Query), which call
   `graphql-request` with codegen-typed documents.
3. Requests hit `/gitlab/graphql`; the Vite proxy rewrites and forwards them to
   `<GITLAB_URL>/api/graphql` with the token header.
4. Responses are typed (codegen), cached (Vue Query), and rendered.
5. Mutations call back through the same path and invalidate affected query keys.

## Error Handling

- **Network / proxy errors:** surfaced via Vue Query `error` state in each view;
  components render an inline error with a retry action.
- **GraphQL errors:** `graphql-request` throws on `errors[]`; a shared wrapper
  normalizes them into a typed error shape before they reach Vue Query.
- **Auth failure (401/invalid token):** detected in the proxy/response path and
  shown as a prominent "check your token / GITLAB_URL in .env" message, since
  it's the most likely misconfiguration for a local tool.
- **Empty/loading:** every list and detail view has explicit loading and empty
  states.

## Project Layout

```text
src/
  gitlab/
    client.ts        # graphql-request client pointed at /gitlab/graphql
    generated/       # codegen output (types + typed documents)
    queries/         # *.graphql documents (issues, issue, projects)
    mutations/       # *.graphql documents (createIssue, addNote, ...)
  composables/       # useIssues, useIssue, useProjects, useCreateIssue, ...
  components/        # presentational: IssueRow, LabelChip, AssigneeAvatar, ...
  views/             # ProjectPicker, IssueList, IssueDetail
  router/
    index.ts
  main.ts
  styles.css         # Tailwind v4 entry
codegen.ts           # GraphQL Code Generator config (schema = GITLAB_URL)
vite.config.ts       # proxy /gitlab -> GITLAB_URL/api, token header
.env / .env.example  # GITLAB_URL, GITLAB_TOKEN
```

## Testing

- **Unit:** Vitest for composables and pure helpers (filter/query-key builders,
  error normalization). Mock the graphql-request client.
- **Component:** Vue Test Utils for key views (list renders rows, detail renders
  notes, mutation triggers invalidation) with a mocked Vue Query layer.
- **Type safety:** codegen + `vue-tsc` typecheck in CI/dev acts as a contract
  test against the GitLab schema shape used.

## Configuration

`.env.example` documents required vars:

```text
GITLAB_URL=https://gitlab.example-corp.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxx   # scope: api
```

Codegen reads the same `GITLAB_URL` to introspect the instance schema (token
provided for the introspection request).

## Open Questions

None blocking. Default project/group can be added to `.env` later if a fixed
landing project is desired.
