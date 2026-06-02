# Quick Assign — Issue Detail

## Goal

Add a lightweight "Quick Assign" control to the issue detail view: a dropdown
that reassigns the issue to a single project member fast, and offers escape
hatches to remove individual assignees or clear them all. It is deliberately
separate from any fuller add/remove-assignee UI — this is the one-click reassign.

## Behavior

- **Trigger** — a button (styled like the existing `AssigneePicker`) that shows
  current assignee initials, or "Assign" when unassigned. Opens a dropdown.
- **Click a member → replace.** Selecting a member sets them as the sole
  assignee (`assigneeUsernames = [username]`), clearing any others. This is the
  primary quick action.
- **Per-assignee remove.** Each current assignee row shows a ✓ and an × that
  removes just that one (`assigneeUsernames = current minus username`).
- **Unassign all.** A top item (shown only when ≥1 assignee) clears everyone
  (`assigneeUsernames = []`).
- **Immediate commit.** Every action fires `useUpdateIssue` right away; the
  issue query is invalidated and re-rendered. Failures surface through the
  existing `actionError` notice in `IssueDetail.vue`.

## Ordering & labels

The dropdown lists project-related people in priority groups. Each person
appears **once**, in the highest-priority group they qualify for. Within a
group, order is stable (members in fetch order; note authors in recency order).

1. **Originator** — `issue.author`. Section label: *Reporter*.
2. **Current assignees** — `issue.assignees`. Section label: *Assigned*.
   Rendered with ✓ + × controls.
3. **Note authors** — distinct authors of non-system `issue.notes`, most-recent
   first. Section label: *Commented*.
4. **Project members** — everyone from `useProjectMembers` not already shown.
   Section label: *Project members*.

### Keying

Everything is keyed by **username**:
- `issue.author` and note authors expose `name`/`username`/`avatarUrl` but **no
  `id`**; assignees and members expose `id` too.
- The `assigneeUsernames` mutation input is username-based.

So the helper and component identify and dedup people by `username`, never `id`.
A note author who has since left the project still appears (and is assignable by
username); GitLab will reject a non-member assignment, which surfaces via
`actionError`.

## Components

### `src/lib/assigneeOrder.ts` (pure, Vue-free, unit-tested)

```
type Relationship = "originator" | "assignee" | "commenter" | "member"

interface Person {
  username: string
  name?: string | null
  avatarUrl?: string | null
}

interface OrderedPerson extends Person {
  relationship: Relationship
  isAssigned: boolean   // true for current assignees → drives ✓/× rendering
}

function orderAssignees(input: {
  author?: Person | null
  assignees: Person[]
  noteAuthors: Person[]   // pre-sorted most-recent-first by caller
  members: Person[]
}): OrderedPerson[]
```

- Builds the list in group order, tracking seen usernames to dedup.
- `isAssigned` is derived from membership in `assignees`, independent of the
  group a person landed in (an assignee always lands in the *assignee* group, so
  in practice `isAssigned === (relationship === "assignee")`, but the flag keeps
  rendering decoupled from grouping).
- No data fetching; callers pass already-loaded data.

### `src/components/QuickAssign.vue`

- **Props:** `fullPath: string`, `iid: string`, `issue` (for `author`,
  `assignees`, `notes`), `members: ProjectMember[]`.
- Computes `noteAuthors` (distinct, recency order) and calls `orderAssignees`.
- Renders trigger + dropdown with the four labeled sections (a section is
  omitted when empty). Uses `onClickOutside` to close, matching `AssigneePicker`.
- Owns a `useUpdateIssue(fullPath, iid)` mutation. Helpers:
  - `assignOnly(username)` → `assigneeUsernames: [username]`
  - `removeOne(username)` → `assigneeUsernames:` current minus username
  - `unassignAll()` → `assigneeUsernames: []`
- Emits nothing.

### `src/views/IssueDetail.vue` (wiring)

- Add `useProjectMembers(toRef(props, "fullPath"))`.
- Replace the static assignee-avatars block (current lines 148–156) with
  `<QuickAssign :full-path="fullPath" :iid="iid" :issue="issue" :members="members ?? []" />`.
- The existing `assignees` computed can be removed if `QuickAssign` fully owns
  the assignee display; keep it only if still referenced elsewhere.

## Data sources (no new queries)

- `issue.author`, `issue.assignees`, `issue.notes` — already in `useIssue`.
- Project members — existing `useProjectMembers(fullPath)`.
- The `assigneeUsernames` path on `useUpdateIssue` already exists.

No GraphQL schema change. (Note: GitLab exposes no assignee-event endpoint in
GraphQL or REST, which is why ordering uses comment authorship rather than true
assignment history.)

## Testing

- **`src/lib/assigneeOrder.test.ts`**
  - Originator first; groups in correct order.
  - Dedup: a person who is author + assignee + commenter appears once, in the
    highest group.
  - `isAssigned` set correctly.
  - Note authors sorted most-recent-first by caller; system notes excluded by
    caller (helper trusts input).
  - Empty author / empty assignees / empty notes handled.
- **`src/components/QuickAssign.test.ts`**
  - Renders the labeled sections that have members; omits empty ones.
  - Trigger shows assignee initials vs "Assign".
  - Clicking a member calls the mutation with `assigneeUsernames: [username]`.
  - × on an assignee calls with current-minus-that-username.
  - "Unassign all" calls with `[]` and is hidden when no assignees.

## Out of scope

- The fuller multi-assignee add/remove experience (separate feature).
- True historical assignment ordering (no API; comment authorship is the proxy).
- Optimistic cache patching — invalidation is sufficient and matches the
  existing detail-view mutation idiom.
