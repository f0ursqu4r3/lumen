# Editable Comments — Design

**Date:** 2026-06-10
**Status:** Approved, ready for implementation planning

## Reframe (post-code-read)

The original ask had two parts: "support markdown in comments" and "allow
editing comments." Reading the code shows **markdown is already fully
supported** end-to-end:

- GitLab stores a note `body` as raw markdown.
- The UI renders it through `MarkdownText.vue`, which calls `renderMarkdown()`
  (`src/shared/lib/markdown.ts:209`) — `marked` v18 parse + DOMPurify sanitize,
  with the project's GitLab upload/image/video extensions.
- Used by `IssueDiscussion.vue` and `MrDiscussion.vue` for note bodies.

The mangled-backticks wrinkle seen in a prior session was **shell
interpretation** of backticks before the body ever reached the comment API — a
client/shell escaping artifact, not app behavior. The MCP comment tool takes the
body as a JSON string argument with no shell in the path, so backticks are safe
there. **No markdown work is required.**

This spec therefore covers only the **edit** feature.

## Summary

Let a user edit comments **they authored** — both in the UI (inline,
edit-in-place) and via the MCP server. Ownership is scoped to own comments only:
the edit affordance and the MCP tool both gate on
`note.author.username === currentUser.username`, and never apply to system
notes. The underlying `updateNote` GraphQL mutation and DOMPurify sanitization
already exist; this work wires them up.

## Context

Lumen is a Vue + TS desktop UI (Bun host + webview) over a self-hosted GitLab
instance. Comments are GitLab *notes* grouped under *discussions*. Today notes
can be created and rendered but not edited; there is no `useUpdateNote`
composable, no edit UI, and no MCP edit tool. The `UpdateNote` mutation type
exists in the schema but is unused.

App-side mutations are written as **inline gql strings** in composables (e.g.
`CreateNote` in `useIssueMutations.ts`), so adding `UpdateNote` needs **no
codegen run**. The MCP server uses its own raw-string `gql` helper, independent
of the app's codegen, so its queries can be extended freely.

## Scope decisions (locked)

| Decision | Choice |
| --- | --- |
| Which comments are editable | Own comments only (`author.username === currentUser.username`, non-system) |
| UI pattern | Inline edit-in-place (no modal) |
| MCP ownership | Same own-only rule, enforced in the tool before mutating |

## Components

### A. Identity (shared)

Reuse the existing `useCurrentUser` composable
(`src/features/dashboard/composables/useCurrentUser.ts`), which already returns
the current user's `username`. Define the predicate where the discussion
components consume it:

```
isOwnNote(note) = !note.system && note.author?.username === currentUsername
```

No `author.id` is needed — both issue and MR note selections already include
`author { username }`, and issue notes already select note `id`; MR notes select
`id` as well.

### B. Mutation composables (app)

Add two composables mirroring the existing add-note composables:

- `useUpdateNote(fullPath, iid)` in
  `src/features/issues/composables/useIssueMutations.ts`
- `useMrUpdateNote(fullPath, iid)` in
  `src/features/merge_requests/composables/useMrDiscussion.ts`

Both use one inline mutation:

```graphql
mutation ($input: UpdateNoteInput!) {
  updateNote(input: $input) {
    note { id body bodyHtml }
    errors
  }
}
```

Input: `{ id: <note gid>, body: <new markdown> }`. On success, **invalidate the
existing discussion query key** for that issue/MR so the rendered body refreshes
from the server (consistent with how add-note already invalidates). Surface any
`errors[]` to the caller.

### C. Inline edit UI

Touches `IssueDiscussion.vue` and `MrDiscussion.vue`.

- Per rendered note, when `isOwnNote(note)` is true, show a subtle **Edit**
  affordance (hover-revealed, beside the timestamp), matching the existing
  reply/action styling.
- Clicking sets local `editingNoteId` state, which swaps that note's
  `MarkdownText` body for the **existing composer** — `MentionTextarea` for
  issues, the existing reply textarea for MRs — prefilled with the note's raw
  `body` (not `bodyHtml`).
- **Save**: trims, blocks empty bodies client-side, disabled while pending,
  calls the update composable, and on success clears `editingNoteId`. On
  `errors[]` it stays in edit mode and shows the error.
- **Cancel** (button or `Esc`): discards edits, restores the rendered body.
- System notes are never editable; only one note is editable at a time.

### D. MCP tools (own-only enforced)

Touches `src/bun/mcp/gitlab/issues.ts` and
`src/bun/mcp/gitlab/mergeRequests.ts`.

1. **Expose note ids in read output.** Extend each tool's `GET_Q` note
   selection from `notes{nodes{body author{username} createdAt}}` to
   `notes{nodes{id body author{username} createdAt}}`, so an agent reading an
   issue/MR can see note gids to target.
2. **New tools** `lumen_issue_comment_edit` and `lumen_mr_comment_edit`, args
   `{ project, iid, noteId, body }`:
   - Query `currentUser { username }` and the issue/MR `discussions` (reusing
     `GET_Q`-style selection that now includes note `id` + `author.username`).
   - Locate the note by `noteId`. If not found → error.
   - If `author.username !== currentUser.username` → refuse with "You can only
     edit your own comments."
   - Otherwise run `updateNote(input: { id: noteId, body })`, then
     `emitInvalidate` for that resource (same pattern as the create-note tool).

## Data flow

1. UI/MCP reads notes (now including `id`, `author.username`).
2. Ownership predicate decides whether edit is offered/allowed.
3. Edit submits `updateNote({ id, body })` with the user's PAT.
4. On success, the discussion query is invalidated → re-render with new
   `body`/`bodyHtml`.

## Error handling

- Empty/whitespace-only body: blocked client-side (UI) and should be rejected
  before mutating (MCP returns an error result).
- GitLab `errors[]` non-empty: keep edit context open (UI) / return the error
  text (MCP); do not silently swallow.
- Foreign-author or missing note (MCP): explicit refusal message, no mutation.
- Note not found / permission denied from GitLab: surfaced verbatim.

## Testing (`bunx vitest run`)

- **Composables**: `useUpdateNote` / `useMrUpdateNote` map `note`/`errors` and
  invalidate the correct query key on success.
- **UI**: edit affordance appears only on own, non-system notes; entering edit
  mode prefills the raw `body`; Save calls the mutation with trimmed body;
  Cancel restores the rendered body without mutating; empty body is blocked.
- **MCP**: edit tool refuses when the target note's author differs from
  `currentUser`; succeeds and emits invalidate when authored by the current
  user; errors when `noteId` is absent from the issue/MR.

## Out of scope

- Editing others' comments / maintainer-permission edits (`adminNote`).
- Deleting comments.
- Edit history / "edited" indicator (unless GitLab's `lastEditedAt` is trivially
  already in selection — not pursued here).
- Any change to markdown rendering (already complete).
