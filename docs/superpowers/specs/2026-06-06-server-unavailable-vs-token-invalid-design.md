# Server-Unavailable vs Token-Invalid Design

**Date:** 2026-06-06
**Status:** Approved — ready for implementation plan

## Problem

The app does not distinguish "the GitLab server is unreachable" from "the token
is invalid." `normalizeError` (`src/gitlab/errors.ts`) tags only 401/403 as
`auth` and folds everything else — thrown `fetch` errors, timeouts, 5xx — into a
generic `network` kind. As a result:

- **Connect screen** (`ConnectView` / `useGitlabConnect`): a down server reads
  ambiguously, with no clear signal whether to fix the token or wait for the
  server.
- **Mid-session** (`SessionExpiredOverlay`, driven by `installAuthWatch` in
  `useSession.ts`): a transient server outage can surface the blocking
  "re-enter your token" overlay even though the token is fine.

A user must **never** be prompted to enter a new token when the server is merely
unavailable. The token prompt is reserved for genuine auth failures.

## Goals

- Reliably classify failures as `auth` (token invalid) vs `unavailable` (server
  unreachable or erroring), distinct from generic `network`/`graphql`/`unknown`.
- Mid-session: `unavailable` shows a **non-blocking, self-healing banner**; the
  blocking token overlay fires **only** for real `auth`.
- Self-heal via an active poll that clears the banner when the server returns,
  and refetches in-flight queries.
- Connect screen: branch the probe error message on kind; the token field stays
  in place regardless.

## Non-Goals

- No rate-limit (429) handling — stays in generic `network`.
- No changes to token storage or the stateless host model.
- No new error UI for `graphql` / `network` / `unknown` — existing per-query
  `ErrorNotice` is unchanged.

## Error taxonomy

Add `unavailable` to the kind union:

```ts
export type GitLabErrorKind = 'auth' | 'unavailable' | 'graphql' | 'network' | 'unknown'
```

`normalizeError` routes as follows:

| Condition | kind |
|---|---|
| HTTP 401 / 403 | `auth` |
| `fetch()` throws — DNS, connection refused, timeout | `unavailable` |
| HTTP 5xx (500 / 502 / 503 / 504) | `unavailable` |
| GraphQL field errors | `graphql` (unchanged) |
| other 4xx (404 / 400 / 429 …) | `network` (unchanged) |
| unexpected exception | `unknown` (unchanged) |

### Host layer (`src/bun/gitlab.ts`)

The host currently swallows `fetch` throws and 5xx into a generic status. It must
preserve enough signal for `normalizeError` to tell a **thrown transport error**
apart from an **HTTP error response**:

- A thrown `fetch` (no response) → propagate as a transport failure the client
  maps to `unavailable`.
- An HTTP response with status 5xx → propagate the status so the client maps to
  `unavailable`; 401/403 still map to `auth`.

Both the GraphQL bridge (`gitlabGraphql`) and the REST bridge (`rest.ts`
`httpError`) apply the same rules.

## Session state + watches (`src/shared/composables/useSession.ts`)

Two mutually-exclusive states on `sessionState`:

- `expired: boolean` — token invalid (existing).
- `unavailable: boolean` — server unreachable (new).

Watches:

- `installAuthWatch` fires the blocking overlay **only** on `kind === 'auth'`.
- A new unavailable watch sets `unavailable = true` on `kind === 'unavailable'`.

**Auth always wins.** If the recovery poll returns 401/403, flip from
`unavailable` → `expired` (clear the banner, show the token overlay). Auth state
never downgrades to `unavailable`.

## Active recovery poll

While `unavailable`, poll the cheap health query `{ currentUser { username } }`
on a backoff: **2s → 5s → 15s (capped at 15s)**.

- **success** → clear `unavailable`; invalidate the query cache so in-flight
  views refetch automatically.
- **401 / 403** → clear `unavailable`, set `expired` (token overlay takes over).
- **still unreachable** → keep banner, advance to next backoff step.

The poll runs only while `unavailable` is true; it starts when the state is
entered and stops when cleared (success or escalation).

## UI

- **New `ConnectionBanner.vue`** — non-blocking top banner ("Can't reach GitLab —
  retrying…"), mounted app-level alongside `SessionExpiredOverlay`. No token
  field, no manual dismiss; it clears itself when the poll succeeds.
- **`SessionExpiredOverlay`** — behavior unchanged; now shown only for real auth.
- **`ConnectView` / `useGitlabConnect`** — branch the connect-probe error on kind:
  - `auth` → "Token rejected — check the token and its `api` scope."
  - `unavailable` → "Couldn't reach &lt;host&gt; — is the server up?"
  - The token field stays put in both cases.

## Testing

- **`normalizeError`** — one case per taxonomy row: thrown transport error →
  `unavailable`; 5xx → `unavailable`; 401 → `auth`; 404 → `network`; GraphQL
  field error → `graphql`.
- **Session state machine** — `unavailable` + poll success clears it;
  `unavailable` + poll 401 escalates to `expired`; `auth` never downgrades to
  `unavailable`.
- **Backoff** — sequence advances 2 → 5 → 15 and caps at 15.

## Affected files

| File | Change |
|---|---|
| `src/gitlab/errors.ts` | add `unavailable` kind; route 5xx + thrown transport errors |
| `src/bun/gitlab.ts` | preserve transport-throw vs HTTP-status signal |
| `src/gitlab/rest.ts` | mirror taxonomy in `httpError` |
| `src/shared/composables/useSession.ts` | `unavailable` state, new watch, poll, auth-wins escalation |
| `src/shared/components/ConnectionBanner.vue` | new non-blocking banner |
| `src/shared/composables/useGitlabConnect.ts` | branch connect-probe message on kind |
| `src/views/ConnectView.vue` | render kind-specific connect error copy |
| app root (where `SessionExpiredOverlay` mounts) | mount `ConnectionBanner` |
