# Assignee Editor + Quick Assign split

## Goal

The issue detail view should show the **complete assignee list** with full add/remove
control, display **current assignees by full name** (not just an avatar), and keep
**Quick Assign as its own separate button**.

This supersedes the earlier arrangement where `QuickAssign` was the only assignee
control and its trigger doubled as the assignee display (avatars only).

## Behavior

### Current-assignee display (full names)

Current assignees render as **stacked rows**, one per assignee:

- avatar initial + **full name** (reusing `AssigneeAvatar`, which shows avatar + name)
- a remove (×) button on the row

Removing a row commits `useSetAssignees` with the current username list **minus**
that user (REPLACE semantics; empty list unassigns everyone).

### Add/remove editor

An **"Add assignee"** trigger button opens a dropdown listing project-related people
in the relationship-grouped order (originator → current assignees → comment authors →
other members), with a ✓ on anyone currently assigned. Clicking a person **toggles**
them:

- not assigned → commit REPLACE with the current usernames **plus** that username
- already assigned → commit REPLACE with the current usernames **minus** that username

The dropdown stays open so several people can be toggled in a row (mirrors
`LabelPicker`). This is additive/multi, distinct from Quick Assign's replace.

### Quick Assign (separate button, simplified)

A separate **"Quick assign"** button (labelled text + icon, NOT avatars) opens the
same relationship-grouped dropdown. Clicking a person performs a **replace**: that
person becomes the sole assignee (`assigneeUsernames = [username]`), and the dropdown
closes. A ✓ marks whoever is currently assigned (indicator only — click still
replaces). The ×-per-assignee and "Unassign all" items are **removed** from
QuickAssign; removal now lives in the editor.

### Commit + errors

- All mutations go through the existing `useSetAssignees(fullPath, iid)` (REPLACE by
  default). No new mutation or query, no `operationMode`.
- Each toggle/remove/replace recomputes the full username list from the current
  assignees and sends it.
- Commits are immediate per click.
- Both `AssigneeEditor` and `QuickAssign` own their own `useSetAssignees` instance and
  emit an `error` event. `IssueDetail` collects both into one `assigneeError` ref,
  folded into the existing `actionError` computed and surfaced by the existing
  `ErrorNotice`.

## Components & data

### `src/lib/assigneeOrder.ts` — add `assigneeSections` (pure, Vue-free, unit-tested)

Existing `orderAssignees(...)`, `Person`, `OrderedPerson`, `Relationship` stay as-is.
Add a function that derives both the current assignees and the labelled, grouped
sections from an issue + member list, so both components share one source of truth:

```ts
export interface AssigneeSection {
  rel: Relationship;
  label: string; // "Reporter" | "Assigned" | "Commented" | "Project members"
  people: OrderedPerson[];
}

export interface AssigneeView {
  assignees: Person[]; // current assignees (username/name/avatarUrl), nulls filtered
  sections: AssigneeSection[]; // non-empty groups only, in canonical order
}

// `issue` is accepted structurally so the lib stays decoupled from generated types.
export function assigneeSections(
  issue: {
    author?: Person | null;
    assignees?: { nodes?: (Person | null)[] | null } | null;
    notes?: {
      nodes?:
        | ({ system?: boolean | null; createdAt: string; author?: Person | null } | null)[]
        | null;
    } | null;
  },
  members: Person[],
): AssigneeView;
```

Internals:
- `assignees` = `issue.assignees.nodes` filtered of nulls.
- note authors = non-system notes with an author, sorted most-recent-first by
  `createdAt` (`b.createdAt.localeCompare(a.createdAt)`), mapped to their author.
- call `orderAssignees({ author, assignees, noteAuthors, members })`.
- group the ordered list by relationship in the canonical order
  `["originator","assignee","commenter","member"]`, attach the label, drop empty
  groups.

Labels map: `originator → "Reporter"`, `assignee → "Assigned"`,
`commenter → "Commented"`, `member → "Project members"`.

### `src/components/AssigneeEditor.vue` (new)

- **Props:** `fullPath: string`, `iid: string`, `issue: IssueDetail`, `members: ProjectMember[]`.
- **Emits:** `error: [GitLabError | null]`.
- Computes `view = computed(() => assigneeSections(props.issue, props.members))`.
- Owns `const set = useSetAssignees(props.fullPath, props.iid)` and a `watch(() => set.error.value, (e) => emit("error", e))` (same getter-form pattern as QuickAssign).
- Helper `currentUsernames()` = `view.value.assignees.map(a => a.username)`.
- **Stacked rows** (when `view.assignees.length`): for each assignee an `AssigneeAvatar`
  (`:name="a.name || a.username"` — `AssigneeAvatar` requires a non-null `name`, and
  `Person.name` is nullable; `:username`, `:avatar-url`) plus a remove button
  `data-testid="assignee-remove-<username>"` calling
  `set.mutate({ assigneeUsernames: currentUsernames().filter(u => u !== username) })`.
- **Add control:** trigger button `data-testid="assignee-add-trigger"` (icon +
  "Add assignee"); `onClickOutside` closes; `@keydown.escape` closes;
  `:aria-expanded`, `aria-haspopup="menu"`. Dropdown (`role="menu"`) renders
  `view.sections` with section-label headings; each person is a button
  `data-testid="assignee-option-<username>"` with a ✓ when `isAssigned`, calling
  `toggle(username)`:
  ```ts
  function toggle(username: string) {
    const cur = currentUsernames();
    set.mutate({
      assigneeUsernames: cur.includes(username)
        ? cur.filter((u) => u !== username)
        : [...cur, username],
    });
  }
  ```
  The dropdown stays open on toggle.

### `src/components/QuickAssign.vue` (simplified)

- Same props/emits as today (`fullPath`, `iid`, `issue`, `members`; `error`).
- Switch from the inline `assignees`/`noteAuthors`/`ordered`/`sections` computeds to
  `const view = computed(() => assigneeSections(props.issue, props.members))` and use
  `view.value.sections`.
- **Trigger:** plain labelled button (icon + "Quick assign"), `data-testid="quick-assign-trigger"`. Remove the assignee-avatars rendering from the trigger.
- **Dropdown:** grouped sections; each person is `data-testid="quick-assign-option-<username>"`,
  click → `set.mutate({ assigneeUsernames: [username] })` then close. Keep the ✓ on
  `isAssigned`.
- **Remove:** the `quick-assign-remove-*` buttons and the `quick-assign-unassign-all`
  item are **deleted**.
- Keep: `onClickOutside`, `@keydown.escape`, `:aria-expanded`/`aria-haspopup`,
  `useSetAssignees`, the error-emit watcher.

### `src/views/IssueDetail.vue`

- Keep `useProjectMembers`; keep the existing `useUpdateIssue` (toggleState) and
  `useAddNote`.
- Rename `quickAssignError` → `assigneeError` (a `ref<GitLabError | null>`).
- `actionError` computed includes `assigneeError.value` (replacing the
  `quickAssignError.value` term).
- In the assignee area render both, each wired `@error="assigneeError = $event"`:
  ```vue
  <AssigneeEditor
    :full-path="fullPath"
    :iid="iid"
    :issue="issue"
    :members="members ?? []"
    @error="assigneeError = $event"
  />
  <QuickAssign
    :full-path="fullPath"
    :iid="iid"
    :issue="issue"
    :members="members ?? []"
    @error="assigneeError = $event"
  />
  ```

## Testing

### `src/lib/assigneeOrder.test.ts` (extend)
- `assigneeSections` returns current assignees (nulls filtered) and grouped, labelled,
  non-empty sections in canonical order.
- Note authors are sorted most-recent-first and system notes excluded.
- Dedup still holds (a person assigned + commenting appears once, in the higher group).
- Empty issue (no author/assignees/notes) yields just the member section (or none).

### `src/components/AssigneeEditor.test.ts` (new)
- Renders a stacked row per current assignee showing the **full name**.
- Remove button commits `{ assigneeUsernames: <current minus that username> }`.
- Opening the add dropdown and clicking an unassigned member commits
  `{ assigneeUsernames: <current plus that username> }`.
- Clicking an already-assigned member in the dropdown commits the minus list.
- Re-emits its `useSetAssignees` error (reactive-ref mock pattern, as in
  `QuickAssign.test.ts`).

### `src/components/QuickAssign.test.ts` (update)
- Trigger shows the "Quick assign" label (no avatars).
- Clicking a member commits `{ assigneeUsernames: [username] }` (replace) and closes.
- The `quick-assign-remove-*` and `quick-assign-unassign-all` testids no longer exist.
- Keep the error-emit test.

### `src/views/IssueDetail.test.ts` (update)
- `useSetAssignees` mock already present (used by both children).
- Assert a current assignee's **full name** renders in the always-visible rows
  (no need to open a dropdown for the name now).

## Out of scope
- `operationMode` APPEND/REMOVE — recompute + REPLACE is sufficient and reuses
  `useSetAssignees` unchanged.
- Optimistic cache patching — invalidation matches the existing detail-view idiom.
- Lifting a single shared `useSetAssignees` instance — per-component ownership matches
  the established pattern; both bubble errors to one `assigneeError`.
