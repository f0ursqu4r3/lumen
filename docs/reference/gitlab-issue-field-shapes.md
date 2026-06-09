# GitLab issue field GraphQL shapes (live-instance confirmed)

Confirmed against the live instance schema on 2026-06-08 (introspection cached,
gitignored, at `src/gitlab/schema.graphql` — regenerate when the instance
upgrades). This note exists because that SDL is not committed.

`__type(name:)` introspection is **disabled** on this instance (returns null);
use `__schema { types { … } }` and filter client-side.

## Reads — fields on the `Issue` type

All directly selectable in the (raw-string) `useIssue` query — **no codegen**:

- `healthStatus` — `HealthStatus` enum (see below)
- `discussionLocked` — `Boolean` (the "Locked" state)
- `epic { id title webUrl }` — the parent epic (EE)
- `iteration { id title }` — current iteration (EE)
- `hasParent`, `hasEpic` — booleans

## Writes via `updateIssue` (`UpdateIssueInput`)

These input fields already exist on `UpdateIssueInput`, so they ride the existing
`useUpdateIssue` mutation by extending its hand-written input type — **no codegen**
(the generated `UpdateIssueInput` already includes them):

- `locked: Boolean` — set/clear the discussion lock
- `healthStatus: HealthStatus` — `onTrack` | `needsAttention` | `atRisk`
- `epicId: EpicID` — set/clear the parent epic
- (already used: `milestoneId`, `dueDate`, `weight`, `confidential`, `timeEstimate`,
  `title`, `description`, `addLabelIds`/`removeLabelIds`, `stateEvent`)

Note: assignees are **not** on `UpdateIssueInput` — they use the dedicated
`issueSetAssignees` mutation (existing).

## Writes via `workItemUpdate` (work-item widgets)

`UpdateIssueInput` has **no** iteration field, so Iteration must go through the
work-item widget path — the same pattern as the native Status field
(`useWorkItemStatus.ts`, raw strings, **no codegen**):

```graphql
workItemUpdate(input: { id: $workItemId, iterationWidget: { iterationId: $iterationId } }) { … }
```

- `WorkItemWidgetIterationInput { iterationId: IterationID }`
- Resolve the `WorkItem` id from the issue iid first (as Status does).

The `WorkItemUpdateInput` also exposes `healthStatusWidget`, `hierarchyWidget`
(parent), etc., but for **issues** the `updateIssue` fields above are simpler and
preferred; reserve the work-item path for what `updateIssue` lacks (Iteration).

## `HealthStatus` enum values

`onTrack`, `needsAttention`, `atRisk`.

## Implication for the rail plan

Of the EE value fields, **Health status, Locked, and Parent (Epic)** are cheap:
read via the raw `useIssue` query + write via `updateIssue`, no codegen. Only
**Iteration** needs the work-item widget mutation. None requires re-running
codegen, because the read query is a raw string and the `updateIssue` input
fields already exist in the generated types.
